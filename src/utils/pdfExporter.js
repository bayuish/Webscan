import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

/**
 * Format tanggal sekarang dalam WIB
 */
function getWIBDateTimeString() {
  const now = new Date();
  const timeWIB = now.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).replace(/\./g, ":") + " WIB";

  const dateWIB = now.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  return `${dateWIB}, ${timeWIB}`;
}

/**
 * Export Laporan Stok Masuk ke PDF
 */
export function exportStockInPDF({ items, filterLabel = "Semua Tanggal", summary = {} }) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const printTime = getWIBDateTimeString();

  // Header Laporan
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(24, 24, 27); // #18181b
  doc.text("LAPORAN MANAJEMEN STOK MASUK", 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(113, 113, 122); // #71717a
  doc.text("Engkong Stuff - Sistem Manajemen Inventaris Gudang", 14, 24);

  // Garis Pembatas
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.5);
  doc.line(14, 27, 196, 27);

  // Informasi Filter & Tanggal Cetak
  doc.setFontSize(9);
  doc.setTextColor(63, 63, 70);
  doc.text(`Periode Data: ${filterLabel}`, 14, 34);
  doc.text(`Dicetak Pada: ${printTime}`, 130, 34);

  // Kotak Ringkasan (Metrics Summary)
  const totalItems = summary.totalItems || items.length;
  const totalIn = summary.totalStockIn !== undefined ? summary.totalStockIn : items.reduce((acc, i) => acc + (parseFloat(i.qty) || 0), 0);
  const totalOut = summary.totalStockOut !== undefined ? summary.totalStockOut : 0;
  const totalRemain = summary.totalRemaining !== undefined ? summary.totalRemaining : (totalIn - totalOut);

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 38, 182, 16, 2, 2, "F");
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 38, 182, 16, 2, 2, "S");

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("TOTAL ITEM", 18, 44);
  doc.text("TOTAL STOK MASUK", 64, 44);
  doc.text("TOTAL STOK KELUAR", 114, 44);
  doc.text("SISA STOK GUDANG", 160, 44);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`${totalItems} Barang`, 18, 50);
  doc.setTextColor(22, 163, 74); // Green
  doc.text(`${totalIn} Lusin`, 64, 50);
  doc.setTextColor(225, 29, 72); // Rose/Red
  doc.text(`${totalOut} Lusin`, 114, 50);
  doc.setTextColor(37, 99, 235); // Blue
  doc.text(`${totalRemain} Lusin`, 160, 50);

  // Tabel Data
  const tableData = items.map((item, idx) => [
    idx + 1,
    item.formattedDate || item.date || "-",
    item.code || "-",
    item.name || "-",
    `${item.qty} Lsn`,
    `${item.remainingQty !== undefined ? item.remainingQty : item.qty} Lsn`
  ]);

  autoTable(doc, {
    startY: 58,
    head: [["No", "Tanggal Masuk", "Kode Barang", "Nama Karakter / Produk", "Masuk", "Sisa Stok"]],
    body: tableData,
    theme: "striped",
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.8,
      valign: "middle"
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 36 },
      2: { cellWidth: 32, fontStyle: "bold" },
      3: { cellWidth: 64 },
      4: { cellWidth: 20, halign: "right", textColor: [22, 163, 74], fontStyle: "bold" },
      5: { cellWidth: 20, halign: "right", textColor: [37, 99, 235], fontStyle: "bold" }
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    didDrawPage: (data) => {
      // Footer Nomor Halaman
      const str = `Halaman ${doc.internal.getNumberOfPages()}`;
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(str, 196 - doc.getTextWidth(str), 287);
      doc.text("Laporan Resmi Stok Masuk - Engkong Stuff", 14, 287);
    }
  });

  const cleanDate = new Date().toISOString().slice(0, 10);
  doc.save(`Laporan_Stok_Masuk_Engkong_Stuff_${cleanDate}.pdf`);
}

/**
 * Export Laporan Stok Keluar ke PDF
 */
export function exportStockOutPDF({ items, filterLabel = "Semua Tanggal", summary = {} }) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const printTime = getWIBDateTimeString();

  // Header Laporan
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(24, 24, 27);
  doc.text("LAPORAN MANAJEMEN STOK KELUAR", 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(113, 113, 122);
  doc.text("Engkong Stuff - Catatan Pengeluaran Stok Gudang (Terkunci & Valid)", 14, 24);

  // Garis Pembatas
  doc.setDrawColor(228, 228, 231);
  doc.setLineWidth(0.5);
  doc.line(14, 27, 196, 27);

  // Informasi Filter & Tanggal Cetak
  doc.setFontSize(9);
  doc.setTextColor(63, 63, 70);
  doc.text(`Periode Data: ${filterLabel}`, 14, 34);
  doc.text(`Dicetak Pada: ${printTime}`, 130, 34);

  // Kotak Ringkasan
  const totalTx = summary.totalTransactions || items.length;
  const totalOut = summary.totalQtyOut !== undefined ? summary.totalQtyOut : items.reduce((acc, i) => acc + (parseFloat(i.qty) || 0), 0);

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 38, 182, 16, 2, 2, "F");
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 38, 182, 16, 2, 2, "S");

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("TOTAL TRANSAKSI KELUAR", 18, 44);
  doc.text("TOTAL LUSIN DIKELUARKAN", 100, 44);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(`${totalTx} Transaksi`, 18, 50);
  doc.setTextColor(225, 29, 72); // Rose/Red
  doc.text(`${totalOut} Lusin`, 100, 50);

  // Tabel Data
  const tableData = items.map((item, idx) => [
    idx + 1,
    item.formattedDate || item.date || "-",
    item.code || "-",
    item.name || "-",
    `${item.qty} Lsn`,
    item.notes || "-"
  ]);

  autoTable(doc, {
    startY: 58,
    head: [["No", "Waktu Keluar (WIB - Locked)", "Kode Barang", "Nama Karakter / Produk", "Jumlah Keluar", "Catatan / Keterangan"]],
    body: tableData,
    theme: "striped",
    headStyles: {
      fillColor: [24, 24, 27],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8.5
    },
    styles: {
      fontSize: 8,
      cellPadding: 2.8,
      valign: "middle"
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 42 },
      2: { cellWidth: 30, fontStyle: "bold" },
      3: { cellWidth: 50 },
      4: { cellWidth: 22, halign: "right", textColor: [225, 29, 72], fontStyle: "bold" },
      5: { cellWidth: 28 }
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252]
    },
    didDrawPage: (data) => {
      const str = `Halaman ${doc.internal.getNumberOfPages()}`;
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(str, 196 - doc.getTextWidth(str), 287);
      doc.text("Laporan Resmi Stok Keluar - Engkong Stuff", 14, 287);
    }
  });

  const cleanDate = new Date().toISOString().slice(0, 10);
  doc.save(`Laporan_Stok_Keluar_Engkong_Stuff_${cleanDate}.pdf`);
}

