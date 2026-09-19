import ExcelJS from "exceljs";

/**
 * Menerapkan format rapi, cantik, dan formal pada sebuah worksheet Excel.
 */
function styleWorksheet(worksheet, sheetTitle, headers, dataRows) {
  // 1. Judul Dokumen Formal di Baris 1-2 (Rentang kolom A sampai F)
  worksheet.mergeCells("A1:F1");
  const titleCell = worksheet.getCell("A1");
  titleCell.value = sheetTitle;
  titleCell.font = { name: "Calibri", size: 13, bold: true, color: { argb: "FF09090B" } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getRow(1).height = 28;

  // Subtitle / Tanggal Cetak
  worksheet.mergeCells("A2:F2");
  const subCell = worksheet.getCell("A2");
  subCell.value = `Dicetak pada: ${new Date().toLocaleString("id-ID")} WIB | Total Resi: ${dataRows.length}`;
  subCell.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF71717A" } };
  subCell.alignment = { vertical: "middle", horizontal: "left" };
  worksheet.getRow(2).height = 18;

  worksheet.getRow(3).height = 8; // Spacing kosong

  // 2. Baris Header Tabel (Baris 4)
  const headerRowNumber = 4;
  const headerRow = worksheet.getRow(headerRowNumber);
  headerRow.values = headers.map((h) => h.label);
  headerRow.height = 26;

  headerRow.eachCell((cell) => {
    cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF18181B" } // Dark Slate formal
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: "FF27272A" } },
      left: { style: "thin", color: { argb: "FF27272A" } },
      bottom: { style: "medium", color: { argb: "FF09090B" } },
      right: { style: "thin", color: { argb: "FF27272A" } }
    };
  });

  // Atur lebar kolom
  headers.forEach((h, idx) => {
    worksheet.getColumn(idx + 1).width = h.width;
  });

  // 3. Tambahkan Data Baris
  let currentRowIdx = 5;
  dataRows.forEach((row, rIdx) => {
    const r = worksheet.getRow(currentRowIdx);
    r.values = row;
    r.height = 20;

    const isEven = rIdx % 2 === 1;
    const rowBg = isEven ? "FFF8FAFC" : "FFFFFFFF"; // Zebra striping lembut

    r.eachCell((cell, colNumber) => {
      cell.font = { name: "Calibri", size: 10, color: { argb: "FF18181B" } };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: rowBg }
      };

      // Border sel tipis formal
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } }
      };

      // Alignment per kolom
      // 1: No, 2: Waktu, 3: Tanggal, 4: Resi, 5: Ekspedisi, 6: Status
      if (colNumber === 1 || colNumber === 2 || colNumber === 3 || colNumber === 6) {
        cell.alignment = { vertical: "middle", horizontal: "center" };
      } else if (colNumber === 4) {
        // Kolom Nomor Resi (Monospace font + format teks eksplisit)
        cell.font = { name: "Consolas", size: 10.5, bold: true, color: { argb: "FF09090B" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.numFmt = "@"; // Strict TEXT format
      } else {
        cell.alignment = { vertical: "middle", horizontal: "left" };
      }

      // Status Duplikat styling
      if (colNumber === 6 && cell.value === "Duplikat") {
        cell.font = { name: "Calibri", size: 9.5, bold: true, color: { argb: "FFDC2626" } };
      }
    });

    currentRowIdx++;
  });

  // 4. Baris Total / Summary di Bawah
  const totalRow = worksheet.getRow(currentRowIdx);
  totalRow.height = 22;
  totalRow.getCell(1).value = "";
  totalRow.getCell(2).value = "";
  totalRow.getCell(3).value = "TOTAL RESI";
  totalRow.getCell(3).font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF18181B" } };
  totalRow.getCell(3).alignment = { vertical: "middle", horizontal: "right" };

  totalRow.getCell(4).value = dataRows.length;
  totalRow.getCell(4).font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF18181B" } };
  totalRow.getCell(4).alignment = { vertical: "middle", horizontal: "center" };

  // Border baris total
  for (let c = 1; c <= headers.length; c++) {
    totalRow.getCell(c).border = {
      top: { style: "thin", color: { argb: "FF09090B" } },
      bottom: { style: "double", color: { argb: "FF09090B" } }
    };
  }
}

/**
 * Export scan history ke file Excel (.xlsx) dengan sheet terpisah:
 * - Sheet "JNT"
 * - Sheet "SICEPAT"
 * - Sheet "LAINNYA" (bila ada)
 * - Sheet "SEMUA DATA"
 * (Kolom PANJANG dihapus sesuai permintaan)
 */
export async function exportToExcel(scans) {
  if (!scans || scans.length === 0) return false;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Engkong Stuff";
  workbook.created = new Date();

  // Kolom PANJANG telah dihapus
  const headers = [
    { label: "NO", width: 8 },
    { label: "WAKTU", width: 16 },
    { label: "TANGGAL", width: 16 },
    { label: "NOMOR RESI", width: 30 },
    { label: "EKSPEDISI", width: 24 },
    { label: "STATUS", width: 15 }
  ];

  // Pisahkan data per ekspedisi
  const jntScans = [];
  const sicepatScans = [];
  const otherScans = [];

  scans.forEach((s) => {
    const tag = (s.courier?.tag || s.courier?.name || "").toUpperCase();
    if (tag.includes("J&T") || tag.includes("JNT")) {
      jntScans.push(s);
    } else if (tag.includes("SICEPAT")) {
      sicepatScans.push(s);
    } else {
      otherScans.push(s);
    }
  });

  const formatRows = (items) => {
    return items.map((item, idx) => {
      const fullDateStr = item.fullDate || new Date().toLocaleDateString("id-ID");
      const datePart = fullDateStr.split(",")[0] || fullDateStr.split(" ")[0] || "";
      
      let timeVal = item.timestamp || "";
      if (timeVal && !timeVal.toUpperCase().includes("WIB")) {
        timeVal = timeVal.replace(/\./g, ":") + " WIB";
      }

      return [
        idx + 1,
        timeVal,
        datePart,
        item.code,
        item.courier?.name || "Ekspedisi",
        item.isDuplicate ? "Duplikat" : "Asli"
      ];
    });
  };

  // 1. SHEET JNT
  const sheetJNT = workbook.addWorksheet("JNT", {
    views: [{ showGridLines: true }]
  });
  styleWorksheet(sheetJNT, "LAPORAN SCAN RESI - J&T EXPRESS (JNT)", headers, formatRows(jntScans));

  // 2. SHEET SICEPAT
  const sheetSicepat = workbook.addWorksheet("SICEPAT", {
    views: [{ showGridLines: true }]
  });
  styleWorksheet(sheetSicepat, "LAPORAN SCAN RESI - SICEPAT EKSPRES", headers, formatRows(sicepatScans));

  // 3. SHEET LAINNYA (jika ada data selain JNT & SICEPAT)
  if (otherScans.length > 0) {
    const sheetOther = workbook.addWorksheet("LAINNYA", {
      views: [{ showGridLines: true }]
    });
    styleWorksheet(sheetOther, "LAPORAN SCAN RESI - EKSPEDISI LAIN", headers, formatRows(otherScans));
  }

  // 4. SHEET SEMUA DATA (Rekapitulasi Lengkap)
  const sheetAll = workbook.addWorksheet("SEMUA DATA", {
    views: [{ showGridLines: true }]
  });
  styleWorksheet(sheetAll, "REKAPITULASI SELURUH DATA SCAN RESI", headers, formatRows(scans));

  // Generate file buffer & download
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const nowStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `Laporan_Scan_Resi_${nowStr}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return true;
}
