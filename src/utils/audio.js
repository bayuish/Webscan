// Audio Engine untuk Web & Mobile (iOS Safari & Android Chrome)
// Dilengkapi AudioContext Unlocker dan Web Audio API Buffer untuk latensi 0 & bypass autoplay lock di HP

let sicepatAudio = null;
let jntAudio = null;
let doubleAudio = null;
let audioCtx = null;

let sicepatBuffer = null;
let jntBuffer = null;
let doubleBuffer = null;
let isAudioUnlocked = false;

// Inisialisasi Audio Context
function getAudioContext() {
  if (!audioCtx && typeof window !== "undefined") {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

// Muat audio buffer via fetch untuk Web Audio API (jauh lebih responsif di mobile daripada tag <audio>)
async function loadAudioBuffer(url) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return null;
    const res = await fetch(url);
    const arrayBuf = await res.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuf);
  } catch (err) {
    console.warn("Gagal decode audio buffer untuk", url, err);
    return null;
  }
}

// Inisialisasi audio elements dan pre-load buffers saat pertama kali script dimuat
if (typeof window !== "undefined") {
  try {
    sicepatAudio = new Audio("/SICEPATSOUND.mp4");
    sicepatAudio.preload = "auto";
    jntAudio = new Audio("/JNTSOUND.mp4");
    jntAudio.preload = "auto";
    doubleAudio = new Audio("/DOUBLE.mp4");
    doubleAudio.preload = "auto";

    // Pre-decode audio buffers di background
    setTimeout(() => {
      loadAudioBuffer("/SICEPATSOUND.mp4").then((buf) => (sicepatBuffer = buf));
      loadAudioBuffer("/JNTSOUND.mp4").then((buf) => (jntBuffer = buf));
      loadAudioBuffer("/DOUBLE.mp4").then((buf) => (doubleBuffer = buf));
    }, 100);
  } catch (e) {
    console.warn("Audio element preload warning:", e);
  }
}

/**
 * Fungsi pembuka kunci audio (Audio Unlocker) untuk HP:
 * Browser mobile (iOS Safari & Android) memblokir audio sampai ada interaksi sentuhan pengguna.
 * Memanggil fungsi ini saat user tap/klik layar akan membuka kunci seluruh sistem audio web.
 */
export function unlockAudio() {
  if (isAudioUnlocked) return;

  try {
    const ctx = getAudioContext();
    if (ctx) {
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      // Bunyikan silent oscillator sebentar untuk memicu hardware audio HP agar bangun
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.001; // nyaris senyap
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(0);
      osc.stop(ctx.currentTime + 0.01);
    }

    // Hangatkan elemen audio HTML5
    [sicepatAudio, jntAudio, doubleAudio].forEach((a) => {
      if (a) {
        a.muted = true;
        const p = a.play();
        if (p !== undefined) {
          p.then(() => {
            a.pause();
            a.currentTime = 0;
            a.muted = false;
          }).catch(() => {
            a.muted = false;
          });
        }
      }
    });

    isAudioUnlocked = true;
  } catch (err) {
    console.warn("Unlock audio warning:", err);
  }
}

// Pasang listener interaksi pertama di seluruh dokumen untuk auto-unlock audio HP
if (typeof window !== "undefined") {
  const unlockEvents = ["touchstart", "touchend", "click", "keydown"];
  const handleFirstInteraction = () => {
    unlockAudio();
    unlockEvents.forEach((ev) => window.removeEventListener(ev, handleFirstInteraction, true));
  };
  unlockEvents.forEach((ev) => window.addEventListener(ev, handleFirstInteraction, { capture: true, passive: true }));
}

// Putar buffer Web Audio API (Prioritas utama di HP)
function playBuffer(buf) {
  try {
    const ctx = getAudioContext();
    if (!ctx || !buf) return false;
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.connect(ctx.destination);
    source.start(0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Putar suara ekspedisi (JNT / SICEPAT / BEEP FALLBACK)
 */
export function playCourierSound(courier) {
  unlockAudio();
  const tag = (courier?.tag || courier?.name || "").toUpperCase();

  // 1. SiCepat
  if (tag.includes("SICEPAT")) {
    // Coba Web Audio buffer terlebih dahulu
    if (sicepatBuffer && playBuffer(sicepatBuffer)) {
      return;
    }
    // Fallback ke elemen HTML5 Audio
    if (sicepatAudio) {
      try {
        sicepatAudio.currentTime = 0;
        const promise = sicepatAudio.play();
        if (promise !== undefined) {
          promise.catch(() => playSuccessBeep());
        }
        return;
      } catch {
        playSuccessBeep();
        return;
      }
    }
  }

  // 2. J&T Express
  if (tag.includes("J&T") || tag.includes("JNT")) {
    // Coba Web Audio buffer terlebih dahulu
    if (jntBuffer && playBuffer(jntBuffer)) {
      return;
    }
    // Fallback ke elemen HTML5 Audio
    if (jntAudio) {
      try {
        jntAudio.currentTime = 0;
        const promise = jntAudio.play();
        if (promise !== undefined) {
          promise.catch(() => playSuccessBeep());
        }
        return;
      } catch {
        playSuccessBeep();
        return;
      }
    }
  }

  // 3. Fallback sound ekspedisi lainnya
  playSuccessBeep();
}

/**
 * Putar suara notifikasi resi duplikat
 */
export function playDuplicateSound() {
  unlockAudio();
  // Coba Web Audio buffer terlebih dahulu
  if (doubleBuffer && playBuffer(doubleBuffer)) {
    return;
  }

  // Fallback ke elemen HTML5 Audio
  if (doubleAudio) {
    try {
      doubleAudio.currentTime = 0;
      const promise = doubleAudio.play();
      if (promise !== undefined) {
        promise.catch(() => playDuplicateBeep());
      }
      return;
    } catch {
      playDuplicateBeep();
      return;
    }
  }

  playDuplicateBeep();
}

/**
 * Fallback Suara Beep Sukses (Web Audio API Synthesizer)
 */
export function playSuccessBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();

    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.08);

    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.12);
  } catch (e) {
    // Ignore audio error
  }
}

/**
 * Fallback Suara Beep Duplikat (Web Audio API Synthesizer)
 */
export function playDuplicateBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(330, now + 0.08);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  } catch (e) {
    // Ignore audio error
  }
}
