import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import {
  Upload,
  FileSpreadsheet,
  Package,
  Truck,
  CheckCircle2,
  Clock,
  Search,
  Copy,
  Check,
  AlertTriangle,
  AlertCircle,
  RotateCcw,
  Barcode,
  Trash2,
  XCircle,
  ExternalLink,
  Camera
} from "lucide-react";
import { playCourierSound, playDuplicateSound, playDuplicateBeep } from "../utils/audio";
import { detectCourier, cleanTrackingCode } from "../utils/courier";
import { exportToExcel } from "../utils/exporter";
import CalendarRangePicker from "./CalendarRangePicker";
import ExcelJS from "exceljs";
import CameraBarcodeScanner from "./CameraBarcodeScanner";
import {
  fetchReturnPackages,
  upsertReturnPackage,
  markReturnAsReceived,
  clearAllReturnPackages
} from "../utils/supabaseDb.js";

function extractReturnDateYMD(dateStr) {
  if (!dateStr) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 10);
  }
  const match = dateStr.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
  if (match) {
    const d = String(parseInt(match[1])).padStart(2, "0");
    const m = String(parseInt(match[2])).padStart(2, "0");
    const y = match[3];
    return `${y}-${m}-${d}`;
  }
  return null;
}

// Normalisasi string resi agar seragam saat pencocokan antar-file/scanner
function normalizeResiCode(val) {
  if (val === null || val === undefined) return "";
  let s = String(val).trim().replace(/^'+/, "").trim();
  s = cleanTrackingCode(s);
  s = s.toUpperCase();
  // Tangani resi numerik SiCepat 10 digit yang terpotong 00 di Excel (misal 2972049810 -> 002972049810)
  if (/^\d{10}$/.test(s) && s.startsWith("297")) {
    s = "00" + s;
  }
  return s;
}

// Pencari indeks kolom fleksibel (mengakomodasi variasi nama kolom dan huruf besar/kecil/spasi)
function findColIndex(row, candidates) {
  if (!Array.isArray(row)) return -1;
  for (let i = 0; i < row.length; i++) {
    const colStr = String(row[i] || "").trim().toLowerCase();
    if (!colStr) continue;
    const cleanStr = colStr.replace(/[^a-z0-9]/g, "");
    for (const cand of candidates) {
      const cleanCand = cand.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (colStr === cand.toLowerCase() || cleanStr === cleanCand || colStr.includes(cand.toLowerCase())) {
        return i;
      }
    }
  }
  return -1;
}

// Deteksi letak baris header dan indeks masing-masing kolom penting (mencari di 10 baris pertama)
function detectSheetHeader(rows) {
  const trackingCandidates = [
    "tracking id",
    "trackingid",
    "tracking number",
    "tracking no",
    "nomor resi",
    "no. resi",
    "no resi",
    "resi",
    "id pelacakan",
    "nomor pelacakan",
    "no pelacakan",
    "awb",
    "no awb",
    "no. awb"
  ];

  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const trackingIdx = findColIndex(row, trackingCandidates);
    if (trackingIdx !== -1) {
      const cancelledIdx = findColIndex(row, ["cancelled time", "waktu pembatalan", "tanggal pembatalan", "cancelled date", "cancel time"]);
      const providerIdx = findColIndex(row, ["shipping provider name", "shipping provider", "ekspedisi", "kurir", "courier", "logistics"]);
      const orderIdIdx = findColIndex(row, ["order id", "id pesanan", "no pesanan", "nomor pesanan", "order no"]);
      const productIdx = findColIndex(row, ["product name", "nama produk", "nama barang", "product", "item name"]);
      const variationIdx = findColIndex(row, ["variation", "variasi", "sku"]);
      return {
        headerRowIndex: r,
        trackingIdx,
        cancelledIdx,
        providerIdx,
        orderIdIdx,
        productIdx,
        variationIdx
      };
    }
  }
  return null;
}

export default function ReturnHubPage({ soundEnabled = true }) {
  const [returnItems, setReturnItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const inputRef = useRef(null);

  // Ambil data retur awal dari Database Supabase (Cloud)
  useEffect(() => {
    fetchReturnPackages()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setReturnItems(data);
        }
      })
      .catch((err) => console.error("Gagal load data retur dari Supabase:", err))
      .finally(() => setIsLoading(false));

    // Bersihkan data lama di localStorage
    try {
      localStorage.removeItem("webscan_return_data");
    } catch (e) {}
  }, []);

  // Autofocus input scanner
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [returnItems]);

  const showToast = (message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 3200);
  };

  const handleCopy = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    showToast(`Resi ${text} disalin ke clipboard`, "success");
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Ekstrak seluruh nomor resi dari file Excel manual (misal belajar.xlsx tanpa header standar)
  const extractTrackingNumbersFromWorkbook = (wb) => {
    const extracted = new Set();
    wb.SheetNames.forEach((sheetName) => {
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      rows.forEach((r) => {
        if (!Array.isArray(r)) return;
        r.forEach((cell) => {
          if (cell === null || cell === undefined) return;
          const val = normalizeResiCode(cell);
          if (!val || val.length < 5 || val.length > 40) return;
          if (["NO", "NOMOR", "RESI", "TRACKING ID", "STATUS", "KETERANGAN", "TANGGAL", "ORDER ID"].includes(val)) return;
          // Format resi alfanumerik tanpa spasi
          if (!/\s/.test(val) && /^[a-zA-Z0-9_\-]+$/.test(val)) {
            extracted.add(val);
          }
        });
      });
    });
    return Array.from(extracted);
  };

  // Deteksi apakah file merupakan file ekspor pesanan TikTok Shop resmi (memiliki resi dan kolom pesanan)
  const isTikTokWorkbook = (wb) => {
    if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) return false;
    if (wb.SheetNames.includes("OrderSKUList")) return true;
    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      if (rows && rows.length > 0) {
        const headerInfo = detectSheetHeader(rows);
        if (
          headerInfo &&
          headerInfo.trackingIdx !== -1 &&
          (headerInfo.orderIdIdx !== -1 || headerInfo.cancelledIdx !== -1 || headerInfo.providerIdx !== -1)
        ) {
          return true;
        }
      }
    }
    return false;
  };

  // 1. PROSES FILE TIKTOK SHOP / PESANAN: Menambah paket retur baru (Belum Sampai) & SINKRONISASI paket belum sinkron
  const processTikTokWorkbook = async (wb) => {
    try {
      const sheetName = wb.SheetNames.includes("OrderSKUList") ? "OrderSKUList" : wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (!rows || rows.length < 1) {
        showToast("File Excel kosong atau format tidak sesuai.", "error");
        return;
      }

      const headerInfo = detectSheetHeader(rows);
      if (!headerInfo || headerInfo.trackingIdx === -1) {
        showToast("Kolom nomor resi (Tracking ID / Nomor Resi) tidak ditemukan dalam file ini.", "error");
        return;
      }

      const { headerRowIndex, trackingIdx, cancelledIdx, providerIdx, orderIdIdx, productIdx, variationIdx } = headerInfo;

      let startRow = headerRowIndex + 1;
      if (
        rows[startRow] &&
        (String(rows[startRow][orderIdIdx] || "").includes("Platform") ||
          String(rows[startRow][trackingIdx] || "").includes("order's tracking"))
      ) {
        startRow++;
      }

      setReturnItems((prevItems) => {
        const existingTrackingMap = new Map();
        prevItems.forEach((item) => {
          existingTrackingMap.set(normalizeResiCode(item.trackingId), item);
        });

        const newlyAddedMap = new Map();
        const updatedSyncMap = new Map();
        let skippedDuplicatesCount = 0;
        let newlySyncedCount = 0;

        for (let i = startRow; i < rows.length; i++) {
          const r = rows[i];
          if (!r || r.length === 0) continue;

          const rawTracking = r[trackingIdx];
          if (!rawTracking) continue;
          const key = normalizeResiCode(rawTracking);
          if (!key || key.toLowerCase() === "null") continue;

          const cancelledTime = cancelledIdx !== -1 && r[cancelledIdx] ? String(r[cancelledIdx]).trim() : "-";
          const provider = providerIdx !== -1 && r[providerIdx] ? String(r[providerIdx]).trim() : "Ekspedisi";
          const orderId = orderIdIdx !== -1 && r[orderIdIdx] ? String(r[orderIdIdx]).trim() : "-";
          const product = productIdx !== -1 && r[productIdx] ? String(r[productIdx]).trim() : "-";
          const variation = variationIdx !== -1 && r[variationIdx] ? String(r[variationIdx]).trim() : "";

          // SINKRONISASI: Jika resi sudah ada di database saat ini
          if (existingTrackingMap.has(key)) {
            const existingItem = existingTrackingMap.get(key);
            // JIKA BELUM SINKRON (discan atau dimasukkan sebelum file ini diunggah)
            if (existingItem.isSynced === false) {
              updatedSyncMap.set(key, {
                ...existingItem,
                isSynced: true, // RESMI TERSINKRONISASI DENGAN TIKTOK!
                cancelledTime: cancelledTime !== "-" ? cancelledTime : existingItem.cancelledTime,
                provider: provider !== "Ekspedisi" ? provider : existingItem.provider,
                orderId: orderId !== "-" ? orderId : existingItem.orderId,
                products: product !== "-" ? [{ name: product, variation }] : existingItem.products
                // isReceived dan receivedAt waktu scan fisik tetap dipertahankan!
              });
              newlySyncedCount++;
            } else {
              skippedDuplicatesCount++;
            }
            continue;
          }

          if (!newlyAddedMap.has(key)) {
            newlyAddedMap.set(key, {
              id: `ret-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
              trackingId: key,
              cancelledTime,
              provider,
              orderId,
              products: [{ name: product, variation }],
              isReceived: false, // Paket retur baru TikTok berstatus: BELUM SAMPAI
              receivedAt: null,
              isSynced: true
            });
          } else {
            const current = newlyAddedMap.get(key);
            if (product && product !== "-" && !current.products.some((p) => p.name === product && p.variation === variation)) {
              current.products.push({ name: product, variation });
            }
          }
        }

        const newlyAddedItems = Array.from(newlyAddedMap.values());
        const addedCount = newlyAddedItems.length;

        setTimeout(() => {
          const messageParts = [];
          if (newlySyncedCount > 0) messageParts.push(`${newlySyncedCount} paket 'Belum Sinkron' kini BERHASIL DISINKRONKAN`);
          if (addedCount > 0) messageParts.push(`${addedCount} paket baru dimuat (Status: Belum Sampai)`);
          if (skippedDuplicatesCount > 0) messageParts.push(`${skippedDuplicatesCount} data lama tetap aman`);

          if (messageParts.length > 0) {
            showToast(`✓ Hasil Import: ${messageParts.join(", ")}.`, "success");
          } else {
            showToast("Semua data dalam file sudah tersimpan di sistem.", "info");
          }
        }, 100);

        // Simpan data baru dan update sinkronisasi ke database Supabase
        for (const item of newlyAddedItems) {
          upsertReturnPackage(item).catch((err) => console.error("Gagal upsert retur:", err));
        }
        for (const item of Array.from(updatedSyncMap.values())) {
          upsertReturnPackage(item).catch((err) => console.error("Gagal update sinkronisasi retur:", err));
        }

        return [...updated, ...newlyAddedItems];
      });
    } catch (err) {
      console.error("Gagal parsing TikTok:", err);
      showToast("Gagal membaca file Excel.", "error");
    }
  };

  // 2. PROSES FILE SINKRONISASI RESI LAMA: Khusus kumpulan resi yang SUDAH SAMPAI DULU sebelum ada sistem (contoh: belajar.xlsx)
  const processManualArrivalWorkbook = async (wb, preExtractedList = null) => {
    // Proteksi: Jika file ternyata adalah file pesanan resmi dengan kolom Order ID, alihkan ke processTikTokWorkbook
    if (isTikTokWorkbook(wb)) {
      showToast("File ini terdeteksi sebagai File Pesanan/Retur resmi! Otomatis diproses sebagai data retur.", "info");
      await processTikTokWorkbook(wb);
      return;
    }

    const rawResiList = preExtractedList || extractTrackingNumbersFromWorkbook(wb);
    if (!rawResiList || rawResiList.length === 0) {
      showToast("Tidak ditemukan nomor resi yang valid di dalam file ini.", "error");
      return;
    }

    const now = new Date();
    const timeWIB =
      now.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).replace(/\./g, ":") + " WIB";

    const fullDateWIB =
      now.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }) + ", " + timeWIB;

    const manualResiSet = new Set(rawResiList.map(normalizeResiCode));

    setReturnItems((prevItems) => {
      let updatedToReceivedCount = 0;
      let alreadyReceivedCount = 0;
      let newlySyncedCount = 0;
      const matchedResiSet = new Set();

      // 1. Update status paket retur yang COCOK di database menjadi SUDAH SAMPAI & TERSINKRON
      const updatedList = prevItems.map((item) => {
        const upperTracking = normalizeResiCode(item.trackingId);
        if (manualResiSet.has(upperTracking)) {
          matchedResiSet.add(upperTracking);
          const wasNotReceived = !item.isReceived;
          const wasNotSynced = item.isSynced === false;

          if (wasNotReceived) updatedToReceivedCount++;
          else alreadyReceivedCount++;
          if (wasNotSynced) newlySyncedCount++;

          return {
            ...item,
            isReceived: true,
            isSynced: true, // RESMI TERSINKRONKAN!
            receivedAt: item.receivedAt || `${fullDateWIB} (Sinkronisasi Data Lama)`
          };
        }
        return item;
      });

      // 2. Jika ada resi di file lama yang BELUM ADA di data TikTok, catat sebagai Belum Sinkron (namun fisik sudah sampai)
      const newlyAddedManualItems = [];
      manualResiSet.forEach((resi) => {
        if (!matchedResiSet.has(resi)) {
          const courierInfo = detectCourier(resi);
          newlyAddedManualItems.push({
            id: `ret-manual-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
            trackingId: resi,
            cancelledTime: "-",
            provider: courierInfo.name !== "Tidak Diketahui" ? courierInfo.name : "Ekspedisi",
            orderId: "-",
            products: [{ name: "Paket Tiba (Sinkronisasi Resi Lama)", variation: "-" }],
            isReceived: true, // SUDAH SAMPAI DI MASA LALU
            receivedAt: `${fullDateWIB} (Sinkronisasi Data Lama)`,
            isSynced: false // Menunggu file TikTok
          });
        }
      });

      setTimeout(() => {
        const details = [];
        if (updatedToReceivedCount > 0) details.push(`${updatedToReceivedCount} paket retur diubah menjadi 'Sudah Sampai'`);
        if (newlySyncedCount > 0) details.push(`${newlySyncedCount} paket 'Belum Sinkron' kini BERHASIL DISINKRONKAN`);
        if (newlyAddedManualItems.length > 0) details.push(`${newlyAddedManualItems.length} resi lama dicatat (Belum Sinkron TikTok)`);
        if (alreadyReceivedCount > 0) details.push(`${alreadyReceivedCount} sudah berstatus sampai sebelumnya`);

        showToast(
          `✓ Sinkronisasi Resi Lama (${rawResiList.length} resi): ${details.join(", ")}!`,
          "success"
        );
      }, 100);

      return [...updatedList, ...newlyAddedManualItems];
    });
  };

  // Parsing umum dari file yang di-upload / di-drop
  const processExcelFile = async (file) => {
    try {
      showToast("Membaca file Excel...", "info");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });

      if (isTikTokWorkbook(wb)) {
        await processTikTokWorkbook(wb);
      } else {
        // File resi manual lama (misal belajar.xlsx)
        showToast("Terdeteksi file daftar resi manual. Menyinkronkan paket yang sudah sampai...", "info");
        await processManualArrivalWorkbook(wb);
      }
    } catch (err) {
      console.error("Gagal parsing Excel:", err);
      showToast("Gagal membaca file Excel. Pastikan format file .xlsx valid.", "error");
    }
  };

  // Handler input khusus file sinkronisasi resi lama (hanya resi saja)
  const handleManualArrivalFileInput = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: "array" });
        if (isTikTokWorkbook(wb)) {
          showToast("File ini terdeteksi sebagai File TikTok Shop resmi! Diproses sebagai Data Retur (status: Belum Sampai).", "info");
          await processTikTokWorkbook(wb);
        } else {
          await processManualArrivalWorkbook(wb);
        }
      } catch (err) {
        console.error("Gagal sinkronisasi resi lama:", err);
        showToast("Gagal membaca file Excel resi lama.", "error");
      }
    }
    e.target.value = "";
  };

  const handleFileInput = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      processExcelFile(file);
    }
    e.target.value = ""; // Reset agar pengguna bisa memilih file kembali kapan saja
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls") || file.name.endsWith(".csv")) {
        processExcelFile(file);
      } else {
        showToast("Harap masukkan file dengan format Excel (.xlsx atau .xls)", "warning");
      }
    }
  };

  // Pemrosesan nomor resi retur (Mendukung Scanner USB & Kamera HP)
  const processReturnCode = (raw) => {
    const clean = cleanTrackingCode(raw);
    if (!clean) return;

    const upperCode = clean.toUpperCase();

    // Cari resi di daftar paket retur
    const index = returnItems.findIndex((item) => item.trackingId.toUpperCase() === upperCode);

    const now = new Date();
    const timeWIB =
      now.toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }).replace(/\./g, ":") + " WIB";

    const fullDateWIB =
      now.toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      }) + ", " + timeWIB;

    if (index === -1) {
      // KONDISI KHUSUS: Resi belum ada di database TikTok Shop
      // Paket fisiknya nyata sudah sampai di gudang!
      // Masukkan ke database dengan status: SUDAH SAMPAI namun BELUM SINKRON
      const courierInfo = detectCourier(upperCode);
      const newUnsyncedItem = {
        id: `ret-unsynced-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
        trackingId: upperCode,
        cancelledTime: "-",
        provider: courierInfo.name !== "Tidak Diketahui" ? courierInfo.name : "Ekspedisi",
        orderId: "-",
        products: [{ name: "Paket Tiba (Belum Sinkron TikTok)", variation: "-" }],
        isReceived: true,
        receivedAt: fullDateWIB,
        isSynced: false // Belum ada data TikTok
      };

      setReturnItems((prev) => [newUnsyncedItem, ...prev]);
      setLastScannedItem({ ...newUnsyncedItem, isDuplicateScan: false, isUnsynced: true });

      // Simpan paket retur belum sinkron ke Supabase
      upsertReturnPackage(newUnsyncedItem).catch((err) => console.error("Gagal simpan paket unsynced ke Supabase:", err));

      if (soundEnabled) {
        playCourierSound({ name: courierInfo.name, tag: courierInfo.tag });
      }

      showToast(`⚠️ Paket ${upperCode} Diterima! Status: BELUM SINKRON (Tersimpan di Cloud Supabase).`, "warning");
      return;
    }

    const item = returnItems[index];

    if (item.isReceived) {
      // SUDAH PERNAH DITERIMA SEBELUMNYA (DUPLIKAT SCAN)
      if (soundEnabled) playDuplicateSound();
      setLastScannedItem({ ...item, isDuplicateScan: true, isUnsynced: item.isSynced === false });
      showToast(`⚠️ Paket ${item.trackingId} SUDAH PERNAH diterima pada ${item.receivedAt}!`, "warning");
      return;
    }

    // PAKET RETUR VALID & BERHASIL DITERIMA!
    const updatedItem = {
      ...item,
      isReceived: true,
      receivedAt: fullDateWIB
    };

    const newItems = [...returnItems];
    newItems[index] = updatedItem;
    setReturnItems(newItems);
    setLastScannedItem({ ...updatedItem, isDuplicateScan: false, isUnsynced: updatedItem.isSynced === false });

    // Update status paket di Supabase menjadi 'Sudah Sampai'
    markReturnAsReceived(item.trackingId).catch((err) => console.error("Gagal update status retur ke Supabase:", err));

    // Putar suara kurir yang sesuai
    if (soundEnabled) {
      playCourierSound({ name: item.provider, tag: item.provider });
    }

    showToast(`✓ Paket Retur ${item.trackingId} (${item.provider}) Berhasil Diterima!`, "success");
  };

  // Handler Scan Resi Retur via Form / USB
  const handleScanSubmit = (e) => {
    e.preventDefault();
    if (!scanInput) return;
    processReturnCode(scanInput);
    setScanInput("");
  };

  // Toggle manual status sampai / belum
  const toggleItemReceived = (id) => {
    const updated = returnItems.map((item) => {
      if (item.id === id) {
        const nextStatus = !item.isReceived;
        const now = new Date();
        const timeWIB =
          now.toLocaleTimeString("id-ID", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
          }).replace(/\./g, ":") + " WIB";
        const fullDateWIB =
          now.toLocaleDateString("id-ID", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric"
          }) + ", " + timeWIB;

        return {
          ...item,
          isReceived: nextStatus,
          receivedAt: nextStatus ? fullDateWIB : null
        };
      }
      return item;
    });
    setReturnItems(updated);
  };

  // Export Rekap Retur ke Excel (.xlsx) dengan 3 Sheet: REKAP SEMUA, SUDAH SAMPAI, BELUM SAMPAI
  const handleExportReturnExcel = async () => {
    if (returnItems.length === 0) {
      showToast("Belum ada data retur untuk diexport", "warning");
      return;
    }

    showToast("Menyiapkan file laporan retur multi-sheet...", "info");
    try {
      const wb = new ExcelJS.Workbook();
      wb.creator = "Engkong Stuff - Return Hub";
      wb.created = new Date();

      const populateSheet = (ws, sheetTitle, subTitle, items) => {
        ws.views = [{ showGridLines: true }];

        ws.mergeCells("A1:G1");
        const titleCell = ws.getCell("A1");
        titleCell.value = sheetTitle;
        titleCell.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FF09090B" } };
        titleCell.alignment = { vertical: "middle", horizontal: "left" };
        ws.getRow(1).height = 28;

        ws.mergeCells("A2:G2");
        const subCell = ws.getCell("A2");
        subCell.value = subTitle;
        subCell.font = { name: "Calibri", size: 10, italic: true, color: { argb: "FF71717A" } };
        subCell.alignment = { vertical: "middle", horizontal: "left" };
        ws.getRow(2).height = 18;

        ws.getRow(3).height = 8;

        // Header row
        const headerRow = ws.getRow(4);
        headerRow.values = [
          "NO",
          "STATUS RETUR",
          "NOMOR RESI (TRACKING ID)",
          "EKSPEDISI",
          "WAKTU PEMBATALAN",
          "WAKTU SAMPAI (WIB)",
          "PRODUK & ORDER ID"
        ];
        headerRow.height = 26;
        headerRow.eachCell((cell) => {
          cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF18181B" } };
          cell.alignment = { vertical: "middle", horizontal: "center" };
          cell.border = {
            top: { style: "thin", color: { argb: "FF27272A" } },
            bottom: { style: "medium", color: { argb: "FF09090B" } },
            left: { style: "thin", color: { argb: "FF27272A" } },
            right: { style: "thin", color: { argb: "FF27272A" } }
          };
        });

        ws.getColumn(1).width = 8;
        ws.getColumn(2).width = 18;
        ws.getColumn(3).width = 24;
        ws.getColumn(4).width = 20;
        ws.getColumn(5).width = 22;
        ws.getColumn(6).width = 24;
        ws.getColumn(7).width = 45;

        items.forEach((item, idx) => {
          const row = ws.getRow(5 + idx);
          row.height = 20;
          const prodText = item.products.map((p) => `${p.name} (${p.variation || "-"})`).join(" | ");
          const statusText =
            item.isSynced === false
              ? "SUDAH SAMPAI (BELUM SINKRON)"
              : item.isReceived
              ? "SUDAH SAMPAI"
              : "DALAM PERJALANAN";

          row.values = [
            idx + 1,
            statusText,
            item.trackingId,
            item.provider,
            item.cancelledTime,
            item.receivedAt || "-",
            item.isSynced === false
              ? "[Belum Sinkron TikTok] Paket fisik diterima di gudang"
              : `[Order: ${item.orderId}] ${prodText}`
          ];

          const bg = idx % 2 === 1 ? "FFF8FAFC" : "FFFFFFFF";
          row.eachCell((cell, colNum) => {
            cell.font = { name: "Calibri", size: 10, color: { argb: "FF18181B" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
            cell.border = {
              top: { style: "thin", color: { argb: "FFE2E8F0" } },
              left: { style: "thin", color: { argb: "FFE2E8F0" } },
              bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
              right: { style: "thin", color: { argb: "FFE2E8F0" } }
            };

            if (colNum === 1 || colNum === 4 || colNum === 5 || colNum === 6) {
              cell.alignment = { vertical: "middle", horizontal: "center" };
            } else if (colNum === 3) {
              cell.font = { name: "Consolas", size: 10.5, bold: true, color: { argb: "FF09090B" } };
              cell.alignment = { vertical: "middle", horizontal: "center" };
              cell.numFmt = "@";
            } else {
              cell.alignment = { vertical: "middle", horizontal: "left" };
            }

            if (colNum === 2) {
              cell.alignment = { vertical: "middle", horizontal: "center" };
              if (item.isSynced === false) {
                cell.font = { name: "Calibri", size: 9, bold: true, color: { argb: "FF9333EA" } };
              } else if (item.isReceived) {
                cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF16A34A" } };
              } else {
                cell.font = { name: "Calibri", size: 10, bold: true, color: { argb: "FFD97706" } };
              }
            }
          });
        });

        // Baris Total di paling bawah
        const totalRow = ws.getRow(5 + items.length);
        totalRow.height = 22;
        totalRow.getCell(2).value = "TOTAL";
        totalRow.getCell(2).font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF18181B" } };
        totalRow.getCell(2).alignment = { vertical: "middle", horizontal: "right" };
        totalRow.getCell(3).value = `${items.length} Paket`;
        totalRow.getCell(3).font = { name: "Calibri", size: 10, bold: true, color: { argb: "FF18181B" } };
        totalRow.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
        for (let c = 1; c <= 7; c++) {
          totalRow.getCell(c).border = {
            top: { style: "thin", color: { argb: "FF09090B" } },
            bottom: { style: "double", color: { argb: "FF09090B" } }
          };
        }
      };

      const exportTargetItems = (startDate || endDate)
        ? returnItems.filter((item) => {
            const targetDateStr = dateBasis === "RECEIVED" ? item.receivedAt : item.cancelledTime;
            const itemYMD = extractReturnDateYMD(targetDateStr);
            if (itemYMD) {
              if (startDate && itemYMD < startDate) return false;
              if (endDate && itemYMD > endDate) return false;
              return true;
            }
            if (dateBasis === "RECEIVED" && !item.receivedAt) return false;
            return false;
          })
        : returnItems;

      const receivedItems = exportTargetItems.filter((i) => i.isReceived);
      const pendingItems = exportTargetItems.filter((i) => !i.isReceived);
      const dateInfo = startDate || endDate ? ` | Rentang: ${startDate || "Awal"} s/d ${endDate || "Sekarang"} (${dateBasis === "RECEIVED" ? "Tgl Sampai" : "Tgl Pembatalan"})` : "";

      // 1. Sheet 1: Rekapitulasi Seluruh Data
      populateSheet(
        wb.addWorksheet("SEMUA RETUR"),
        "LAPORAN REKONSILIASI PAKET RETUR (SEMUA DATA)",
        `Database Retur TikTok Shop | Total: ${exportTargetItems.length} Paket | Sudah Sampai: ${receivedItems.length} | Belum Sampai: ${pendingItems.length}${dateInfo} | Dicetak: ${new Date().toLocaleString("id-ID")} WIB`,
        exportTargetItems
      );

      // 2. Sheet 2: Khusus Sudah Sampai
      populateSheet(
        wb.addWorksheet("SUDAH SAMPAI"),
        "LAPORAN RETUR - KHUSUS PAKET SUDAH SAMPAI DI GUDANG",
        `Database Retur TikTok Shop | Total Sudah Sampai: ${receivedItems.length} Paket${dateInfo} | Dicetak: ${new Date().toLocaleString("id-ID")} WIB`,
        receivedItems
      );

      // 3. Sheet 3: Khusus Belum Sampai
      populateSheet(
        wb.addWorksheet("BELUM SAMPAI"),
        "LAPORAN RETUR - KHUSUS DALAM PERJALANAN (BELUM SAMPAI)",
        `Database Retur TikTok Shop | Total Belum Sampai: ${pendingItems.length} Paket${dateInfo} | Dicetak: ${new Date().toLocaleString("id-ID")} WIB`,
        pendingItems
      );

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Laporan_Rekonsiliasi_Retur_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Laporan retur (3 Sheet) berhasil diunduh!", "success");
    } catch (e) {
      console.error(e);
      showToast("Gagal mengunduh file Excel retur", "error");
    }
  };

  // Perhitungan Statistik
  const totalPackages = returnItems.length;
  const receivedPackages = returnItems.filter((i) => i.isReceived).length;
  const pendingPackages = returnItems.filter((i) => !i.isReceived).length;
  const unsyncedPackages = returnItems.filter((i) => i.isSynced === false).length;
  const completionPct = totalPackages > 0 ? ((receivedPackages / totalPackages) * 100).toFixed(1) : 0;

  // Preset Tanggal
  const getTodayYMD = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const getDaysAgoYMD = (days) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  const getMonthStartYMD = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  };

  const handlePresetToday = () => {
    const today = getTodayYMD();
    if (startDate === today && endDate === today) {
      setStartDate("");
      setEndDate("");
    } else {
      setStartDate(today);
      setEndDate(today);
    }
  };

  const handlePreset7Days = () => {
    const start = getDaysAgoYMD(6);
    const end = getTodayYMD();
    if (startDate === start && endDate === end) {
      setStartDate("");
      setEndDate("");
    } else {
      setStartDate(start);
      setEndDate(end);
    }
  };

  const handlePresetThisMonth = () => {
    const start = getMonthStartYMD();
    const end = getTodayYMD();
    if (startDate === start && endDate === end) {
      setStartDate("");
      setEndDate("");
    } else {
      setStartDate(start);
      setEndDate(end);
    }
  };

  const isPresetTodayActive = startDate === getTodayYMD() && endDate === getTodayYMD();
  const isPreset7DaysActive = startDate === getDaysAgoYMD(6) && endDate === getTodayYMD();
  const isPresetThisMonthActive = startDate === getMonthStartYMD() && endDate === getTodayYMD();
  const hasDateFilter = Boolean(startDate || endDate);

  const formatDisplayDate = (ymd) => {
    if (!ymd) return "";
    const [y, m, d] = ymd.split("-");
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d)).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  };

  // Breakdown per Provider
  const providerStats = {};
  returnItems.forEach((item) => {
    const p = item.provider || "Lainnya";
    if (!providerStats[p]) {
      providerStats[p] = { total: 0, received: 0, pending: 0 };
    }
    providerStats[p].total++;
    if (item.isReceived) {
      providerStats[p].received++;
    } else {
      providerStats[p].pending++;
    }
  });

  const providerList = Object.entries(providerStats).sort((a, b) => b[1].total - a[1].total);

  // Filter Data Tabel (Tab Status, Kurir, Tanggal, Pencarian)
  const filteredItems = returnItems.filter((item) => {
    // Filter status / provider tab
    if (activeFilter === "PENDING" && item.isReceived) return false;
    if (activeFilter === "RECEIVED" && !item.isReceived) return false;
    if (activeFilter === "UNSYNCED" && item.isSynced !== false) return false;
    if (
      activeFilter !== "ALL" &&
      activeFilter !== "PENDING" &&
      activeFilter !== "RECEIVED" &&
      activeFilter !== "UNSYNCED"
    ) {
      if (item.provider !== activeFilter) return false;
    }

    // Filter rentang tanggal
    if (startDate || endDate) {
      const targetDateStr = dateBasis === "RECEIVED" ? item.receivedAt : item.cancelledTime;
      const itemYMD = extractReturnDateYMD(targetDateStr);
      if (itemYMD) {
        if (startDate && itemYMD < startDate) return false;
        if (endDate && itemYMD > endDate) return false;
      } else {
        // Jika filter tanggal scan sampai aktif tapi paket belum pernah discan
        if (dateBasis === "RECEIVED" && !item.receivedAt) return false;
      }
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchTracking = item.trackingId.toLowerCase().includes(q);
      const matchOrder = item.orderId.toLowerCase().includes(q);
      const matchProvider = item.provider.toLowerCase().includes(q);
      const matchProd = item.products.some((p) => p.name.toLowerCase().includes(q));
      if (!matchTracking && !matchOrder && !matchProvider && !matchProd) return false;
    }

    return true;
  });

  const getBadgeClass = (providerName) => {
    const upper = (providerName || "").toUpperCase();
    if (upper.includes("J&T") || upper.includes("JNT")) return "badge-jnt";
    if (upper.includes("SICEPAT")) return "badge-sicepat";
    return "badge-default";
  };

  const handleClearAllReturnData = async () => {
    if (window.confirm("Apakah Anda yakin ingin menghapus SELURUH data paket retur dari database Supabase?")) {
      setReturnItems([]);
      setLastScannedItem(null);
      await clearAllReturnPackages();
      showToast("Seluruh data retur berhasil dihapus dari database Supabase!", "success");
    }
  };

  return (
    <div className="return-hub-container">
      {/* Header Halaman Retur */}
      <div className="return-header">
        <div className="return-header-left">
          <div className="return-title-row">
            <h2 className="return-title">Manajemen Retur Paket</h2>
            <span className="return-subtag">TikTok Shop Return Hub</span>
          </div>
          <p className="return-subtitle">
            Unggah file Excel pesanan dibatalkan dari TikTok Shop, pantau sisa paket yang belum sampai, dan scan resi
            secara langsung saat paket tiba di gudang.
          </p>
        </div>

        <div className="return-header-actions">
          {totalPackages > 0 && (
            <>
              <label
                className="btn-secondary"
                style={{ cursor: "pointer" }}
                title="Tambah data paket retur baru dari file Excel TikTok Shop (Status: Belum Sampai)"
              >
                <Upload size={15} />
                Import Excel TikTok
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileInput}
                  style={{ display: "none" }}
                />
              </label>

              <label
                className="btn-secondary"
                style={{ cursor: "pointer" }}
                title="Sinkronisasi paket yang sudah sampai dari file Excel resi lama (hanya berisi nomor resi saja, contoh: belajar.xlsx)"
              >
                <CheckCircle2 size={15} color="#16a34a" />
                Sinkron Resi Sampai (Excel Lama)
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleManualArrivalFileInput}
                  style={{ display: "none" }}
                />
              </label>

              <button
                className="btn-secondary"
                onClick={handleExportReturnExcel}
                title="Download Laporan Rekonsiliasi Excel (3 Sheet)"
              >
                <FileSpreadsheet size={15} />
                Export Rekap Retur
              </button>

              <button
                className="btn-secondary"
                onClick={handleClearAllReturnData}
                style={{ color: "#dc2626", borderColor: "#fca5a5" }}
                title="Hapus seluruh data paket retur dari browser"
              >
                <Trash2 size={15} />
                Hapus Data Retur
              </button>
            </>
          )}
        </div>
      </div>

      {/* Upload Zone (Jika data kosong atau ingin ganti file) */}
      {totalPackages === 0 ? (
        <div
          className={`return-upload-dropzone ${isDragging ? "dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <div className="upload-dropzone-inner">
            <div className="upload-icon-circle">
              <Upload size={28} />
            </div>
            <h3 className="upload-prompt-title">Unggah File Excel Retur (.xlsx)</h3>
            <p className="upload-prompt-desc">
              Pilih file Excel ekspor dari TikTok Shop atau file resi lama untuk disinkronisasi. Sistem
              akan otomatis membedakan file TikTok Shop (status: Dalam Perjalanan) dan file resi lama (status: Sudah Sampai).
            </p>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "center" }}>
              <label className="btn-primary upload-file-btn" style={{ cursor: "pointer" }}>
                <FileSpreadsheet size={16} />
                1. Pilih File Excel TikTok (Retur Belum Sampai)
                <input type="file" accept=".xlsx, .xls" onChange={handleFileInput} style={{ display: "none" }} />
              </label>

              <label
                className="btn-secondary upload-file-btn"
                style={{ background: "#ffffff", border: "1px solid var(--border-main)", cursor: "pointer" }}
              >
                <CheckCircle2 size={16} color="#16a34a" />
                2. Sinkron Resi Lama (Paket Sudah Sampai Dulu)
                <input type="file" accept=".xlsx, .xls, .csv" onChange={handleManualArrivalFileInput} style={{ display: "none" }} />
              </label>
            </div>
            <span className="upload-drop-hint">atau seret (drag & drop) file Excel ke area ini</span>
          </div>
        </div>
      ) : (
        <>
          {/* Scanner Input Card Khusus Retur */}
          <div className="return-scanner-card">
            {/* Tombol Utama: Scan Kamera HP */}
            <button
              type="button"
              className="btn-camera-scan-main"
              onClick={() => setIsCameraScannerOpen(true)}
            >
              <div className="btn-camera-scan-icon">
                <Camera size={22} />
              </div>
              <div className="btn-camera-scan-text">
                <span className="btn-camera-scan-title">
                  📷 Scan Retur dengan Kamera HP
                </span>
                <span className="btn-camera-scan-sub">
                  Arahkan kamera ke Barcode 1D atau QR Code paket retur yang tiba
                </span>
              </div>
            </button>

            <div className="return-scanner-header">
              <div className="return-scanner-title">
                <Barcode size={18} />
                <span>Atau gunakan scanner USB / ketik resi:</span>
              </div>
              <span className="scanner-badge-status">
                <span className="status-dot"></span>
                Scanner Standby
              </span>
            </div>

            <form onSubmit={handleScanSubmit} className="scanner-input-group">
              <input
                ref={inputRef}
                type="text"
                className="scanner-input return-input"
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                placeholder="Tembak barcode resi paket retur dengan scanner USB..."
                autoFocus
              />
              <button type="submit" className="btn-primary">
                Verifikasi Sampai
              </button>
            </form>

            {/* Spotlight Hasil Scan Terakhir */}
            {lastScannedItem && (
              <div
                className={`return-spotlight-box ${
                  lastScannedItem.isDuplicateScan
                    ? "spotlight-warning"
                    : lastScannedItem.isUnsynced
                    ? "spotlight-warning"
                    : "spotlight-success"
                }`}
              >
                <div className="spotlight-left-content">
                  <div className="spotlight-status-row">
                    {lastScannedItem.isDuplicateScan ? (
                      <span className="spotlight-status-tag warning">
                        <AlertTriangle size={13} />
                        DUPLIKAT (SUDAH PERNAH DITERIMA)
                      </span>
                    ) : lastScannedItem.isUnsynced ? (
                      <span
                        className="spotlight-status-tag"
                        style={{ background: "#f3e8ff", color: "#7e22ce" }}
                      >
                        <AlertCircle size={13} />
                        DITERIMA (BELUM SINKRON TIKTOK)
                      </span>
                    ) : (
                      <span className="spotlight-status-tag success">
                        <CheckCircle2 size={13} />
                        PAKET RETUR BERHASIL DITERIMA
                      </span>
                    )}
                    <span className={`courier-badge ${getBadgeClass(lastScannedItem.provider)}`}>
                      {lastScannedItem.provider}
                    </span>
                  </div>
                  <div className="spotlight-tracking-code">{lastScannedItem.trackingId}</div>
                  <div className="spotlight-item-meta">
                    <span>
                      Diterima: <strong>{lastScannedItem.receivedAt}</strong>
                    </span>
                    <span> • </span>
                    <span>Waktu Batal: {lastScannedItem.cancelledTime}</span>
                    <span> • </span>
                    <span>Order ID: {lastScannedItem.orderId}</span>
                  </div>
                  {lastScannedItem.products?.[0]?.name && (
                    <div className="spotlight-product-preview">
                      📦 {lastScannedItem.products[0].name}
                      {lastScannedItem.products[0].variation ? ` (${lastScannedItem.products[0].variation})` : ""}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Summary Cards */}
          <div className="return-stats-grid">
            {/* Card 1: Total Retur */}
            <div className="stat-card">
              <span className="stat-label">Total Paket Terdata</span>
              <span className="stat-value">{totalPackages}</span>
              <span className="stat-meta">Seluruh data retur masuk</span>
            </div>

            {/* Card 2: Belum Sampai (Dalam Perjalanan) */}
            <div
              className={`stat-card stat-pending-card ${activeFilter === "PENDING" ? "active-filter-card" : ""}`}
              onClick={() => setActiveFilter(activeFilter === "PENDING" ? "ALL" : "PENDING")}
              style={{ cursor: "pointer" }}
              title="Klik untuk filter paket dalam perjalanan"
            >
              <div className="stat-card-top">
                <span className="stat-label">Dalam Perjalanan (Belum Sampai)</span>
                <Truck size={18} color="#d97706" />
              </div>
              <span className="stat-value text-amber">{pendingPackages}</span>
              <span className="stat-meta">Sisa paket fisik yang dinanti</span>
            </div>

            {/* Card 3: Sudah Diterima (Sampai) */}
            <div
              className={`stat-card stat-received-card ${activeFilter === "RECEIVED" ? "active-filter-card" : ""}`}
              onClick={() => setActiveFilter(activeFilter === "RECEIVED" ? "ALL" : "RECEIVED")}
              style={{ cursor: "pointer" }}
              title="Klik untuk filter paket sudah sampai"
            >
              <div className="stat-card-top">
                <span className="stat-label">Sudah Sampai di Gudang</span>
                <CheckCircle2 size={18} color="#16a34a" />
              </div>
              <span className="stat-value text-green">{receivedPackages}</span>
              <span className="stat-meta">
                {completionPct}% dari total retur ({receivedPackages}/{totalPackages})
              </span>
            </div>

            {/* Card 4: Belum Sinkron (Sudah Sampai) */}
            <div
              className={`stat-card stat-unsynced-card ${activeFilter === "UNSYNCED" ? "active-filter-card" : ""}`}
              onClick={() => setActiveFilter(activeFilter === "UNSYNCED" ? "ALL" : "UNSYNCED")}
              style={{ cursor: "pointer" }}
              title="Klik untuk memfilter paket yang sudah discan tapi belum ada di file TikTok Shop"
            >
              <div className="stat-card-top">
                <span className="stat-label">Belum Sinkron (Sudah Sampai)</span>
                <AlertCircle size={18} color="#9333ea" />
              </div>
              <span className="stat-value text-purple">{unsyncedPackages}</span>
              <span className="stat-meta">Fisik sampai, menunggu Excel TikTok</span>
            </div>
          </div>

          {/* Progress Bar Ketercapaian */}
          <div className="return-progress-card">
            <div className="progress-header">
              <span className="progress-title">Progres Penerimaan Paket Retur Fisik</span>
              <span className="progress-pct-text">{completionPct}% Telah Sampai</span>
            </div>
            <div className="return-progress-track">
              <div className="return-progress-bar" style={{ width: `${completionPct}%` }} />
            </div>
          </div>

          {/* Breakdown Kurir Cards */}
          {providerList.length > 0 && (
            <div className="provider-summary-section">
              <div className="provider-summary-header">
                <span className="provider-sec-title">Rincian Per Ekspedisi (Shipping Provider)</span>
              </div>
              <div className="provider-pills-row">
                {providerList.map(([name, stats]) => (
                  <div
                    key={name}
                    className={`provider-stat-pill ${activeFilter === name ? "active" : ""}`}
                    onClick={() => setActiveFilter(activeFilter === name ? "ALL" : name)}
                  >
                    <div className="provider-pill-top">
                      <span className={`courier-badge ${getBadgeClass(name)}`}>{name}</span>
                      <span className="provider-pill-total">{stats.total} Retur</span>
                    </div>
                    <div className="provider-pill-breakdown">
                      <span className="p-pending" title="Belum Sampai">
                        Belum: <strong>{stats.pending}</strong>
                      </span>
                      <span className="p-divider">•</span>
                      <span className="p-received" title="Sudah Sampai">
                        Sampai: <strong>{stats.received}</strong>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabel Data Rekonsiliasi Retur */}
          <div className="return-table-card">
            <div className="table-controls-bar">
              {/* Filter Tabs */}
              <div className="return-filter-tabs">
                <button
                  className={`filter-tab ${activeFilter === "ALL" ? "active" : ""}`}
                  onClick={() => setActiveFilter("ALL")}
                >
                  Semua ({totalPackages})
                </button>
                <button
                  className={`filter-tab ${activeFilter === "PENDING" ? "active" : ""}`}
                  onClick={() => setActiveFilter("PENDING")}
                >
                  Belum Sampai ({pendingPackages})
                </button>
                <button
                  className={`filter-tab ${activeFilter === "RECEIVED" ? "active" : ""}`}
                  onClick={() => setActiveFilter("RECEIVED")}
                >
                  Sudah Sampai ({receivedPackages})
                </button>
                <button
                  className={`filter-tab tab-unsynced-btn ${activeFilter === "UNSYNCED" ? "active" : ""}`}
                  onClick={() => setActiveFilter("UNSYNCED")}
                >
                  Belum Sinkron ({unsyncedPackages})
                </button>
              </div>

              {/* Search Bar */}
              <div className="search-wrap" style={{ width: "260px" }}>
                <Search size={14} color="var(--text-dim)" />
                <input
                  type="text"
                  placeholder="Cari resi, order ID, produk..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Date Range Picker Bar for Return Hub */}
            <div className="date-range-toolbar" style={{ margin: "14px 20px 10px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                <CalendarRangePicker
                  startDate={startDate}
                  endDate={endDate}
                  onChange={(s, e) => {
                    setStartDate(s);
                    setEndDate(e);
                  }}
                  onReset={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                />

                {/* Basis Tanggal: Pembatalan vs Scan Sampai */}
                <div className="return-date-basis-toggle">
                  <button
                    type="button"
                    className={`btn-date-preset ${dateBasis === "CANCELLED" ? "active" : ""}`}
                    onClick={() => setDateBasis("CANCELLED")}
                    title="Filter berdasarkan Tanggal Pembatalan pesanan di TikTok"
                  >
                    Tgl Pembatalan
                  </button>
                  <button
                    type="button"
                    className={`btn-date-preset ${dateBasis === "RECEIVED" ? "active" : ""}`}
                    onClick={() => setDateBasis("RECEIVED")}
                    title="Filter berdasarkan Tanggal Scan Paket Sampai"
                  >
                    Tgl Scan Sampai
                  </button>
                </div>
              </div>

              {/* Quick Presets */}
              <div className="date-preset-group">
                <button
                  className={`btn-date-preset ${isPresetTodayActive ? "active" : ""}`}
                  onClick={handlePresetToday}
                >
                  Hari Ini
                </button>
                <button
                  className={`btn-date-preset ${isPreset7DaysActive ? "active" : ""}`}
                  onClick={handlePreset7Days}
                >
                  7 Hari Terakhir
                </button>
                <button
                  className={`btn-date-preset ${isPresetThisMonthActive ? "active" : ""}`}
                  onClick={handlePresetThisMonth}
                >
                  Bulan Ini
                </button>
              </div>
            </div>

            {/* Active Range Notice */}
            {hasDateFilter && (
              <div className="date-filter-banner" style={{ margin: "0 20px 14px 20px" }}>
                <span>
                  Menampilkan data retur berdasarkan <strong>{dateBasis === "CANCELLED" ? "Tanggal Pembatalan" : "Tanggal Scan Sampai"}</strong>:{" "}
                  <strong>
                    {startDate ? formatDisplayDate(startDate) : "Awal"} s/d{" "}
                    {endDate ? formatDisplayDate(endDate) : "Sekarang"}
                  </strong>{" "}
                  ({filteredItems.length} paket ditemukan)
                </span>
                <button
                  className="date-banner-clear"
                  onClick={() => {
                    setStartDate("");
                    setEndDate("");
                  }}
                >
                  Reset Rentang Tanggal
                </button>
              </div>
            )}

            {/* Table */}
            {filteredItems.length === 0 ? (
              <div className="empty-state">
                <p>Tidak ada data paket retur pada filter ini.</p>
                <span>Coba ubah filter atau kata kunci pencarian Anda.</span>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="scan-table">
                  <thead>
                    <tr>
                      <th style={{ width: "50px" }}>No</th>
                      <th style={{ width: "170px" }}>Status Retur</th>
                      <th style={{ width: "200px" }}>Nomor Resi (Tracking ID)</th>
                      <th style={{ width: "160px" }}>Ekspedisi</th>
                      <th style={{ width: "170px" }}>Waktu Pembatalan</th>
                      <th style={{ width: "200px" }}>Waktu Sampai (WIB)</th>
                      <th>Detail Produk & Order ID</th>
                      <th style={{ width: "110px", textAlign: "right" }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((item, idx) => (
                      <tr key={item.id} className={item.isReceived ? "row-received" : ""}>
                        <td style={{ color: "var(--text-muted)" }}>{idx + 1}</td>
                        <td>
                          {item.isSynced === false ? (
                            <div style={{ display: "inline-flex", flexDirection: "column", gap: "4px" }}>
                              <span className="status-pill-received">
                                <CheckCircle2 size={12} />
                                Sudah Sampai
                              </span>
                              <span
                                className="status-pill-unsynced"
                                title="Paket fisik telah diterima di gudang, menunggu impor file TikTok berikutnya"
                              >
                                <AlertCircle size={11} />
                                Belum Sinkron
                              </span>
                            </div>
                          ) : item.isReceived ? (
                            <span className="status-pill-received">
                              <CheckCircle2 size={12} />
                              Sudah Sampai
                            </span>
                          ) : (
                            <span className="status-pill-pending">
                              <Clock size={12} />
                              Dalam Perjalanan
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="resi-cell">
                            <span className="resi-code-text">{item.trackingId}</span>
                            <button
                              className="btn-mini"
                              onClick={() => handleCopy(item.trackingId, item.id)}
                              title="Salin Resi"
                            >
                              {copiedId === item.id ? <Check size={14} color="#18181b" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </td>
                        <td>
                          <span className={`courier-badge ${getBadgeClass(item.provider)}`}>{item.provider}</span>
                        </td>
                        <td style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                          {item.cancelledTime || "-"}
                        </td>
                        <td
                          style={{
                            fontSize: "12px",
                            fontFamily: "var(--font-mono)",
                            color: item.isReceived ? "var(--text-primary)" : "var(--text-muted)"
                          }}
                        >
                          {item.receivedAt || "Belum Scan"}
                        </td>
                        <td>
                          <div className="return-product-cell">
                            {item.isSynced === false ? (
                              <>
                                <div className="return-order-id" style={{ color: "#9333ea", fontWeight: "600" }}>
                                  [Menunggu Data TikTok]
                                </div>
                                <div className="return-prod-name" style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                                  Paket fisik telah diterima. Menunggu file TikTok baru...
                                </div>
                              </>
                            ) : (
                              <>
                                <div className="return-order-id">ID: {item.orderId}</div>
                                {item.products && item.products.length > 0 && (
                                  <div className="return-prod-name" title={item.products[0].name}>
                                    {item.products[0].name}
                                    {item.products[0].variation ? ` (${item.products[0].variation})` : ""}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className={`btn-mini ${item.isReceived ? "btn-unmark" : "btn-mark"}`}
                            onClick={() => toggleItemReceived(item.id)}
                            title={item.isReceived ? "Batalkan tanda sampai" : "Tandai manual sudah sampai"}
                          >
                            {item.isReceived ? <XCircle size={14} /> : <Check size={14} />}
                            <span style={{ fontSize: "11px", marginLeft: "4px" }}>
                              {item.isReceived ? "Batal" : "Sampai"}
                            </span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div className={`toast-msg toast-${toast.type}`}>
          <span>{toast.message}</span>
        </div>
      )}
      {/* Modal Pemindai Kamera Barcode & QR Code HP untuk Retur */}
      <CameraBarcodeScanner
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScanSuccess={(code) => processReturnCode(code)}
        title="Pemindai Kamera HP - Retur Masuk"
        subtitle="Arahkan kamera ke Barcode Garis atau QR Code resi paket retur"
      />
    </div>
  );
}
