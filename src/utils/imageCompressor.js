/**
 * Kompresi Gambar di Frontend (Maksimal 200 KB)
 * Menggunakan HTML Canvas API dengan reduksi dimensi dan kualitas bertahap
 */
export async function compressImage(file, maxSizeKB = 200) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("File yang dipilih bukan gambar yang valid."));
      return;
    }

    const reader = new FileReader();
    reader.onerror = (err) => reject(err);
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = (err) => reject(err);
      img.onload = () => {
        try {
          const originalSizeKB = Math.round(file.size / 1024);

          let width = img.width;
          let height = img.height;

          // Batasi resolusi maksimum awal agar hemat memori (maks 1280px)
          const MAX_INITIAL_DIM = 1280;
          if (width > MAX_INITIAL_DIM || height > MAX_INITIAL_DIM) {
            if (width > height) {
              height = Math.round((height * MAX_INITIAL_DIM) / width);
              width = MAX_INITIAL_DIM;
            } else {
              width = Math.round((width * MAX_INITIAL_DIM) / height);
              height = MAX_INITIAL_DIM;
            }
          }

          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          let quality = 0.85;
          let dataUrl = "";
          let sizeKB = Infinity;
          let attempts = 0;

          // Loop penyesuaian kualitas & dimensi hingga ukuran <= maxSizeKB
          while (attempts < 10) {
            canvas.width = width;
            canvas.height = height;

            // Gambar ulang pada canvas
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            dataUrl = canvas.toDataURL("image/jpeg", quality);

            // Hitung ukuran nyata base64 dalam KB
            const base64Length = dataUrl.length - (dataUrl.indexOf(",") + 1);
            sizeKB = Math.round((base64Length * 0.75) / 1024);

            if (sizeKB <= maxSizeKB || quality <= 0.2 || (width < 300 && height < 300)) {
              break;
            }

            // Jika masih > 200 KB, turunkan kualitas dan sedikit perkecil dimensi
            quality -= 0.12;
            width = Math.round(width * 0.85);
            height = Math.round(height * 0.85);
            attempts++;
          }

          resolve({
            dataUrl,
            sizeKB,
            originalSizeKB,
            width,
            height,
            fileName: file.name
          });
        } catch (err) {
          reject(err);
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}
