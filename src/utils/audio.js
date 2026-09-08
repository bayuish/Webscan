let sicepatAudio = null;
let jntAudio = null;
let doubleAudio = null;
let audioCtx = null;

if (typeof window !== "undefined") {
  try {
    sicepatAudio = new Audio("/SICEPATSOUND.mp4");
    sicepatAudio.preload = "auto";
    jntAudio = new Audio("/JNTSOUND.mp4");
    jntAudio.preload = "auto";
    doubleAudio = new Audio("/DOUBLE.mp4");
    doubleAudio.preload = "auto";
  } catch (e) {
    console.error("Audio preload error", e);
  }
}

function getAudioContext() {
  if (!audioCtx && typeof window !== "undefined") {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

export function playCourierSound(courier) {
  const tag = (courier?.tag || courier?.name || "").toUpperCase();

  if (tag.includes("SICEPAT") && sicepatAudio) {
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

  if ((tag.includes("J&T") || tag.includes("JNT")) && jntAudio) {
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

  // Fallback sound for other couriers
  playSuccessBeep();
}

export function playDuplicateSound() {
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

export function playSuccessBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    
    // Tone 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(1320, now + 0.08);
    
    gain1.gain.setValueAtTime(0.15, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    
    osc1.start(now);
    osc1.stop(now + 0.12);
  } catch (e) {
    // Ignore audio errors
  }
}

export function playDuplicateBeep() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(330, now + 0.08);
    
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.2);
  } catch (e) {
    // Ignore
  }
}
