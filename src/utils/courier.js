/**
 * Membersihkan noise/karakter acak sebelum nomor resi resmi.
 * Dua kondisi awalan resi utama:
 * 1. "JY" (J&T Express, misal: JY1480615651)
 * 2. "002" (SiCepat Ekspres, misal: 002972049810)
 *
 * Bila scanner mengirim karakter sampah di depannya (apapun itu: AV, AVAV, acak dll),
 * sistem secara otomatis mencari posisi "JY" atau "002" dan memotong tepat dari awalan tersebut.
 */
export function cleanTrackingCode(rawCode) {
  if (!rawCode) return "";
  let code = String(rawCode).trim();
  const upper = code.toUpperCase();

  // 1. Jika sudah langsung diawali dengan "JY" atau resi 12 digit 00/01 SiCepat, kode sudah bersih
  if (
    upper.startsWith("JY") ||
    ((upper.startsWith("00") || upper.startsWith("01")) && upper.length === 12 && /^\d+$/.test(upper))
  ) {
    return code;
  }

  // 2. Jika ada noise di depan awalan JY (seperti avavavJY..., vJY...)
  const idxJY = upper.indexOf("JY");
  if (idxJY > 0) {
    return code.slice(idxJY).trim();
  }

  // 3. Jika ada noise di depan resi 12 digit SiCepat (seperti AV00..., AVAV00...)
  const matchSiCepat = upper.match(/00\d{10}/);
  if (matchSiCepat && matchSiCepat.index > 0) {
    return code.slice(matchSiCepat.index).trim();
  }

  // 4. Fallback: hapus pengulangan 'AV' jika ada pola lain
  const cleanedAV = code.replace(/^(AV)+/i, "");
  if (cleanedAV.length >= 5) {
    return cleanedAV.trim();
  }

  return code;
}

export function detectCourier(code) {
  const cleanCode = cleanTrackingCode(code);
  if (!cleanCode) {
    return {
      name: "Tidak Diketahui",
      tag: "UNKNOWN",
      color: "#52525b",
      bg: "#f4f4f5",
      border: "#e4e4e7"
    };
  }
  
  const upper = cleanCode.toUpperCase();

  // SiCepat Ekspres (Pola: 12 digit angka, diawali 00 / 01) -> Khas Warna Biru
  if ((upper.startsWith("00") || upper.startsWith("01")) && upper.length === 12 && /^\d+$/.test(upper)) {
    return {
      name: "SiCepat Ekspres",
      tag: "SICEPAT",
      color: "#2563eb",
      bg: "#eff6ff",
      border: "#bfdbfe"
    };
  }
  if (upper.startsWith("SC") || upper.startsWith("TKP")) {
    return {
      name: "SiCepat / Tokopedia",
      tag: "SICEPAT",
      color: "#2563eb",
      bg: "#eff6ff",
      border: "#bfdbfe"
    };
  }

  // J&T Express (JNT) - Pola: JY + 10 digit, JP, JX, EZ, TJNT, JET -> Khas Warna Merah J&T
  if (upper.startsWith("JY") || upper.startsWith("JP") || upper.startsWith("JX") || upper.startsWith("EZ") || upper.startsWith("TJNT") || upper.startsWith("JET")) {
    return {
      name: "J&T Express",
      tag: "J&T",
      color: "#dc2626",
      bg: "#fef2f2",
      border: "#fca5a5"
    };
  }
  if (upper.startsWith("JD") || upper.startsWith("JN")) {
    return {
      name: "J&T Cargo",
      tag: "J&T CARGO",
      color: "#dc2626",
      bg: "#fef2f2",
      border: "#fca5a5"
    };
  }

  // Shopee Xpress (SPX) -> Khas Warna Oranye Shopee
  if (upper.startsWith("SPXID") || upper.startsWith("SPX") || (upper.startsWith("ID") && upper.length >= 12 && /^\d+$/.test(upper.slice(2, 14)))) {
    return {
      name: "Shopee Xpress (SPX)",
      tag: "SPX",
      color: "#c2410c",
      bg: "#fff7ed",
      border: "#fed7aa"
    };
  }

  // Anteraja
  if (upper.startsWith("1000") || upper.startsWith("ASA") || upper.startsWith("100")) {
    return {
      name: "Anteraja",
      tag: "ANTERAJA",
      color: "#7e22ce",
      bg: "#faf5ff",
      border: "#e9d5ff"
    };
  }

  // Ninja Xpress
  if (upper.startsWith("NLID") || upper.startsWith("SHP")) {
    return {
      name: "Ninja Xpress",
      tag: "NINJA",
      color: "#b91c1c",
      bg: "#fef2f2",
      border: "#fecaca"
    };
  }

  // JNE Express
  if (upper.startsWith("CGK") || upper.startsWith("TJNE") || ((upper.length === 15 || upper.length === 16) && /^\d+$/.test(upper))) {
    return {
      name: "JNE Express",
      tag: "JNE",
      color: "#1d4ed8",
      bg: "#eff6ff",
      border: "#bfdbfe"
    };
  }

  // ID Express
  if (upper.startsWith("IDE") || upper.startsWith("IDS")) {
    return {
      name: "ID Express",
      tag: "ID EXPRESS",
      color: "#0f766e",
      bg: "#f0fdfa",
      border: "#99f6e4"
    };
  }

  // Lion Parcel
  if (upper.startsWith("LP") || (upper.length === 12 && upper.startsWith("11") && /^\d+$/.test(upper))) {
    return {
      name: "Lion Parcel",
      tag: "LION",
      color: "#be123c",
      bg: "#fff1f2",
      border: "#fecdd3"
    };
  }

  // Pos Indonesia
  if (upper.startsWith("POS") || (upper.length === 11 && /^\d+$/.test(upper))) {
    return {
      name: "Pos Indonesia",
      tag: "POS",
      color: "#c2410c",
      bg: "#fff7ed",
      border: "#fed7aa"
    };
  }

  // Default Barcode
  return {
    name: "Barcode Standar",
    tag: "BARCODE",
    color: "#52525b",
    bg: "#f4f4f5",
    border: "#e4e4e7"
  };
}
