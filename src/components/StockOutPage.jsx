import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  TrendingDown,
  Search,
  FileText,
  Lock,
  X,
  AlertTriangle,
  ChevronDown,
  Trash2,
  Boxes,
  ClipboardList,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  ZoomIn
} from "lucide-react";
import { compressImage } from "../utils/imageCompressor";
import { exportStockOutPDF } from "../utils/pdfExporter";
import { uploadStockOutProof } from "../utils/supabaseClient";
import CalendarRangePicker from "./CalendarRangePicker";

function formatWIBDateTime(dateObj = new Date()) {
  const time = dateObj.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).replace(/\./g, ":") + " WIB";

  const date = dateObj.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  return `${date}, ${time}`;
}

function formatDisplayDate(ymdStr) {
  if (!ymdStr) return "";
  const [y, m, d] = ymdStr.split("-");
  return `${d}/${m}/${y}`;
}

export default function StockOutPage({
  stockInItems = [],
  stockOutItems = [],
  onAddStockOut,
  onDeleteStockOut,
  currentUser = null
}) {

  // Hitung sisa stok untuk setiap barang di stok masuk
  const availableItems = useMemo(() => {
    return stockInItems.map((item) => {
      const totalOut = stockOutItems
        .filter((out) => out.stockInId === item.id)
        .reduce((sum, out) => sum + (parseFloat(out.qty) || 0), 0);
      const remainingQty = Math.max(0, parseFloat((item.qty - totalOut).toFixed(2)));
      return {
        ...item,
        totalOut,
        remainingQty
      };
    });
  }, [stockInItems, stockOutItems]);

  // Form State
  const [selectedStockInId, setSelectedStockInId] = useState("");
  const [outQty, setOutQty] = useState("");
  const [notes, setNotes] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [imageInfo, setImageInfo] = useState(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState(null);

  // Searchable Select Dropdown State
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState("");
  const dropdownRef = useRef(null);
  const fileInputRef = useRef(null);

  // Image Zoom Modal State
  const [zoomedImage, setZoomedImage] = useState(null);

  // Search & Filter Tanggal
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Item yang sedang dipilih di form
  const currentSelectedItem = useMemo(() => {
    return availableItems.find((i) => i.id === selectedStockInId) || null;
  }, [availableItems, selectedStockInId]);

  // Filter daftar barang di searchable dropdown
  const filteredDropdownItems = useMemo(() => {
    if (!dropdownSearch.trim()) return availableItems;
    const q = dropdownSearch.toLowerCase();
    return availableItems.filter(
      (i) => (i.code || "").toLowerCase().includes(q) || (i.name || "").toLowerCase().includes(q)
    );
  }, [availableItems, dropdownSearch]);

  // Date Presets
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

  // Handle Upload Gambar Pengeluaran dengan Kompresi <= 200 KB
  const handleImageChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Harap pilih file gambar (JPG, PNG, atau WEBP).", "error");
      return;
    }

    try {
      setIsCompressing(true);
      showToast("Mengompresi foto bukti (maksimal 200 KB)...", "info");

      const compressed = await compressImage(file, 200);
      setImagePreview(compressed.dataUrl);
      setImageInfo(`${compressed.sizeKB} KB (≤ 200 KB)`);

      showToast(`✓ Foto bukti berhasil dikompresi: ${compressed.sizeKB} KB (Ukuran asli: ${compressed.originalSizeKB} KB).`, "success");
    } catch (err) {
      console.error(err);
      showToast("Gagal mengompresi foto bukti.", "error");
    } finally {
      setIsCompressing(false);
      e.target.value = "";
    }
  };

  // Submit Pengeluaran Stok (Wajib Foto)
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!currentSelectedItem) {
      setFormError("Harap pilih barang / karakter dari daftar stok terlebih dahulu.");
      return;
    }

    const sanitizedQty = String(outQty).replace(/[^0-9]/g, "");
    const parsedQty = parseInt(sanitizedQty, 10);
    if (isNaN(parsedQty) || parsedQty <= 0) {
      setFormError("Jumlah pengeluaran stok (Lusin) harus berupa angka bulat positif (tanpa koma/titik).");
      return;
    }

    // Validasi Sisa Stok
    if (parsedQty > currentSelectedItem.remainingQty) {
      setFormError(
        `Jumlah pengeluaran (${parsedQty} Lusin) melebihi sisa stok yang ada (${currentSelectedItem.remainingQty} Lusin).`
      );
      return;
    }

    // Validasi Wajib Upload Foto Bukti Pengeluaran
    if (!imagePreview) {
      setFormError("Harap unggah foto bukti pengeluaran barang (wajib).");
      return;
    }

    const now = new Date();
    // TANGGAL DIKUNCI / LOCKED SESUAI WAKTU CRUD SAAT INI (WIB)
    const lockedFormattedDate = formatWIBDateTime(now);
    const lockedISODate = now.toISOString();

    let uploadedPhotoUrl = imagePreview;
    try {
      showToast("Mengunggah foto bukti ke Supabase Storage...", "info");
      uploadedPhotoUrl = await uploadStockOutProof(imagePreview, currentSelectedItem.code || "proof");
    } catch (err) {
      console.warn("Storage upload fallback to base64:", err);
    }

    const newStockOut = {
      id: `stk-out-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
      stockInId: currentSelectedItem.id,
      code: currentSelectedItem.code || "",
      name: currentSelectedItem.name || "",
      qty: parsedQty,
      date: lockedISODate,
      formattedDate: lockedFormattedDate,
      image: uploadedPhotoUrl,
      notes: notes.trim() || "-",
      createdAt: lockedISODate
    };

    onAddStockOut(newStockOut);

    // Reset Form
    setSelectedStockInId("");
    setOutQty("");
    setNotes("");
    setImagePreview(null);
    setImageInfo(null);
    showToast(
      `✓ Berhasil mengeluarkan ${currentSelectedItem.name || currentSelectedItem.code} (${parsedQty} Lusin). Sisa stok: ${parseFloat((currentSelectedItem.remainingQty - parsedQty).toFixed(2))} Lusin.`,
      "success"
    );
  };


  // Filter Data Stok Keluar (Tabel)
  const filteredStockOutItems = useMemo(() => {
    return stockOutItems.filter((item) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = (item.code || "").toLowerCase().includes(q);
        const matchName = (item.name || "").toLowerCase().includes(q);
        const matchNotes = (item.notes || "").toLowerCase().includes(q);
        if (!matchCode && !matchName && !matchNotes) return false;
      }

      // 2. Filter Tanggal
      if (startDate || endDate) {
        const itemDateYMD = item.date ? item.date.slice(0, 10) : "";
        if (startDate && itemDateYMD < startDate) return false;
        if (endDate && itemDateYMD > endDate) return false;
      }

      return true;
    });
  }, [stockOutItems, searchQuery, startDate, endDate]);

  // Statistik Ringkasan Stok Keluar
  const totalOutTransactions = stockOutItems.length;
  const totalQtyOutLusin = parseFloat(
    stockOutItems.reduce((sum, item) => sum + (parseFloat(item.qty) || 0), 0).toFixed(2)
  );
  const uniqueOutVariants = new Set(stockOutItems.map((i) => i.stockInId || i.code)).size;

  // Handle Export PDF Stok Keluar
  const handleExportPDF = () => {
    if (filteredStockOutItems.length === 0) {
      showToast("Tidak ada data stok keluar untuk diexport.", "warning");
      return;
    }

    let filterLabel = "Semua Tanggal";
    if (startDate && endDate) {
      filterLabel = `${formatDisplayDate(startDate)} s/d ${formatDisplayDate(endDate)}`;
    } else if (startDate) {
      filterLabel = `Mulai ${formatDisplayDate(startDate)}`;
    } else if (endDate) {
      filterLabel = `Sampai ${formatDisplayDate(endDate)}`;
    }

    exportStockOutPDF({
      items: filteredStockOutItems,
      filterLabel,
      summary: {
        totalTransactions: filteredStockOutItems.length,
        totalQtyOut: totalQtyOutLusin
      }
    });

    showToast("✓ Laporan PDF Stok Keluar berhasil diunduh!", "success");
  };

  const currentWIBString = formatWIBDateTime(new Date());

  return (
    <div className="return-hub-container">
      {/* Toast Notification */}
      {toast && (
        <div className={`toast-notification toast-${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* Header Halaman (Seragam dengan Page Retur & Database) */}
      <div className="return-header">
        <div className="return-header-left">
          <div className="return-title-row">
            <h2 className="return-title">Manajemen Stok Keluar</h2>
            <span className="return-subtag">Pengeluaran Gudang (Lusin)</span>
          </div>
        </div>

        <div className="return-header-actions">
          <button
            className="btn-secondary"
            onClick={handleExportPDF}
            disabled={filteredStockOutItems.length === 0}
            title="Download Laporan Resmi Stok Keluar dalam format PDF"
          >
            <FileText size={15} />
            Export Laporan PDF
          </button>
        </div>
      </div>

      {/* Summary Cards (Seragam dengan Page 3) */}
      <div className="return-stats-grid">
        {/* Card 1: Total Transaksi Keluar */}
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Total Transaksi Keluar</span>
            <ClipboardList size={18} color="#d97706" />
          </div>
          <span className="stat-value text-amber">
            {totalOutTransactions} <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-muted)" }}>Transaksi</span>
          </span>
          <span className="stat-meta">Total riwayat pengeluaran</span>
        </div>

        {/* Card 2: Total Lusin Dikeluarkan */}
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Total Lusin Keluar</span>
            <TrendingDown size={18} color="#dc2626" />
          </div>
          <span className="stat-value" style={{ color: "#dc2626" }}>
            {totalQtyOutLusin} <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-muted)" }}>Lsn</span>
          </span>
          <span className="stat-meta">Akumulasi stok fisik yang keluar</span>
        </div>

        {/* Card 3: Variasi Karakter Terpakai */}
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Variasi Barang Terpakai</span>
            <Boxes size={18} color="#2563eb" />
          </div>
          <span className="stat-value" style={{ color: "#2563eb" }}>
            {uniqueOutVariants} <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-muted)" }}>Varian</span>
          </span>
          <span className="stat-meta">Jenis barang yang pernah keluar</span>
        </div>
      </div>

      {/* Form Input Stok Keluar (Seragam dengan Scanner Card) */}
      <div className="return-scanner-card">
        <div className="return-scanner-header">
          <div className="return-scanner-title">
            <TrendingDown size={18} />
            <span>Formulir Pengeluaran Stok:</span>
          </div>
          <span className="scanner-badge-status">
            <span className="status-dot"></span>
            Waktu Terkunci Otomatis (WIB)
          </span>
        </div>

        {formError && (
          <div className="spotlight-status-row" style={{ marginBottom: "12px" }}>
            <span className="spotlight-status-tag warning" style={{ width: "100%", padding: "8px 12px" }}>
              <AlertTriangle size={14} />
              {formError}
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px", marginBottom: "14px" }}>
            {/* Searchable Select Barang dari Stok Masuk */}
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "5px" }}>
                Pilih Barang / Karakter <span style={{ color: "#dc2626" }}>* (Bisa Dicari)</span>
              </label>

              <div
                className={`searchable-select-trigger ${isDropdownOpen ? "is-open" : ""}`}
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              >
                {currentSelectedItem ? (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", overflow: "hidden" }}>
                    {currentSelectedItem.code && (
                      <span className="courier-badge badge-default" style={{ fontFamily: "var(--font-mono)", fontSize: "10.5px" }}>
                        {currentSelectedItem.code}
                      </span>
                    )}
                    <span style={{ fontWeight: "700", color: "var(--text-primary)", fontSize: "12.5px" }}>
                      {currentSelectedItem.name || "Tanpa Nama"}
                    </span>
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "700",
                        color: currentSelectedItem.remainingQty > 0 ? "#16a34a" : "#dc2626"
                      }}
                    >
                      (Sisa: {currentSelectedItem.remainingQty} Lsn)
                    </span>
                  </div>
                ) : (
                  <span style={{ color: "var(--text-dim)", fontSize: "12.5px" }}>-- Klik untuk cari dan pilih barang --</span>
                )}
                <ChevronDown size={15} color="var(--text-muted)" />
              </div>

              {/* Popover Dropdown dengan Input Search */}
              {isDropdownOpen && (
                <div className="searchable-dropdown-menu">
                  <div className="dropdown-search-input-wrap">
                    <input
                      type="text"
                      className="dropdown-search-input"
                      placeholder="Ketik kode atau nama karakter..."
                      value={dropdownSearch}
                      onChange={(e) => setDropdownSearch(e.target.value)}
                      autoFocus
                    />
                  </div>

                  <div className="dropdown-options-list">
                    {filteredDropdownItems.length === 0 ? (
                      <div style={{ padding: "12px", textAlign: "center", fontSize: "12px", color: "var(--text-muted)" }}>
                        {availableItems.length === 0
                          ? "Belum ada stok masuk. Silakan input di halaman Stok Masuk."
                          : "Tidak ditemukan barang yang cocok."}
                      </div>
                    ) : (
                      filteredDropdownItems.map((item) => (
                        <div
                          key={item.id}
                          className={`dropdown-option-item ${
                            selectedStockInId === item.id ? "option-item-selected" : ""
                          }`}
                          onClick={() => {
                            setSelectedStockInId(item.id);
                            setIsDropdownOpen(false);
                            setFormError("");
                          }}
                        >
                          <div className="opt-main-info">
                            {item.code && <span className="opt-code-badge">{item.code}</span>}
                            <span className="opt-char-name">{item.name || "Tanpa Nama"}</span>
                          </div>
                          <span
                            className={`opt-stock-badge ${item.remainingQty <= 0 ? "opt-stock-empty" : ""}`}
                          >
                            Sisa: {item.remainingQty} Lsn
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Jumlah Keluar (Lusin) */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "5px" }}>
                Jumlah Keluar <span style={{ color: "#dc2626" }}>* (Lusin - Angka Bulat)</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                className="form-input"
                placeholder={currentSelectedItem ? `Maksimal ${currentSelectedItem.remainingQty} Lusin` : "Contoh: 2 atau 5"}
                value={outQty}
                onChange={(e) => setOutQty(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(e) => {
                  if ([".", ",", "e", "E", "+", "-"].includes(e.key)) {
                    e.preventDefault();
                  }
                }}
              />
            </div>


            {/* Tanggal & Waktu Keluar (Terkunci Otomatis WIB) */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "5px" }}>
                Tanggal & Jam Keluar <span style={{ fontSize: "11px", fontWeight: "normal", color: "var(--text-muted)" }}>(Terkunci Otomatis WIB)</span>
              </label>
              <div className="locked-input-box" title="Waktu pengeluaran otomatis dikunci untuk integritas audit data">
                <span>{currentWIBString}</span>
                <span className="locked-time-tag">
                  <Lock size={10} /> Terkunci
                </span>
              </div>
            </div>

            {/* Catatan / Keperluan */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "5px" }}>
                Catatan / Keperluan <span style={{ fontSize: "11px", fontWeight: "normal", color: "var(--text-muted)" }}>(Opsional)</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Contoh: Kirim Live Tiktok / Pesanan Shopee / Display Toko"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Upload Foto Bukti Pengeluaran (WAJIB, Kompresi <= 200 KB) */}
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "6px" }}>
              Foto Bukti Pengeluaran Barang <span style={{ color: "#dc2626" }}>* (Wajib, Kompresi otomatis browser ≤ 200 KB)</span>
            </label>

            {imagePreview ? (
              <div style={{ display: "flex", alignItems: "center", gap: "14px", background: "var(--bg-subtle)", padding: "10px 14px", borderRadius: "6px", border: "1px solid var(--border-main)" }}>
                <img
                  src={imagePreview}
                  alt="Bukti Pengeluaran"
                  style={{ width: "50px", height: "50px", objectFit: "cover", borderRadius: "6px", border: "1px solid var(--border-main)", cursor: "pointer" }}
                  onClick={() => setZoomedImage(imagePreview)}
                  title="Klik untuk zoom foto bukti"
                />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "12px", fontWeight: "600", color: "#16a34a", display: "flex", alignItems: "center", gap: "4px" }}>
                    <CheckCircle2 size={13} /> {imageInfo}
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)", marginTop: "2px" }}>
                    Foto bukti siap disimpan dalam transaksi pengeluaran
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ color: "#dc2626", borderColor: "#fca5a5", padding: "4px 10px", fontSize: "11px" }}
                  onClick={() => {
                    setImagePreview(null);
                    setImageInfo(null);
                  }}
                >
                  <Trash2 size={13} /> Ganti Foto
                </button>
              </div>
            ) : (
              <div
                style={{
                  border: "1px dashed var(--border-main)",
                  borderRadius: "6px",
                  padding: "16px 20px",
                  background: "var(--bg-card)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
                onClick={() => fileInputRef.current?.click()}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <ImageIcon size={22} color="var(--text-muted)" />
                  <div>
                    <span style={{ fontSize: "12.5px", fontWeight: "600", color: "var(--text-primary)" }}>
                      Pilih File Foto atau drag file ke sini
                    </span>
                    <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                      Sistem otomatis mengompres foto hingga di bawah 200 KB
                    </p>
                  </div>
                </div>
                <button type="button" className="btn-secondary" style={{ padding: "5px 14px", fontSize: "11.5px" }}>
                  <Upload size={13} /> Browse Foto Bukti
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  style={{ display: "none" }}
                  disabled={isCompressing}
                />
              </div>
            )}
          </div>

          {/* Action Row */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              type="submit"
              className="btn-primary"
              disabled={isCompressing}
            >
              <TrendingDown size={15} />
              Simpan Stok Keluar
            </button>
          </div>
        </form>
      </div>

      {/* Tabel Data Rekap Stok Keluar (Seragam dengan Return Table Card) */}
      <div className="return-table-card">
        {/* Controls Bar */}
        <div className="table-controls-bar">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-primary)" }}>
              Riwayat Pengeluaran Stok
            </span>
            <span className="courier-badge badge-default">
              {filteredStockOutItems.length} Transaksi
            </span>
          </div>

          {/* Search Input */}
          <div className="search-wrap" style={{ width: "260px" }}>
            <Search size={14} color="var(--text-dim)" />
            <input
              type="text"
              placeholder="Cari kode, nama, catatan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button
                className="btn-mini"
                onClick={() => setSearchQuery("")}
                title="Hapus pencarian"
                style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)" }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Date Range Picker Bar */}
        <div className="date-range-toolbar" style={{ margin: "14px 20px 10px 20px" }}>
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
              Menampilkan riwayat stok keluar rentang:{" "}
              <strong>
                {startDate ? formatDisplayDate(startDate) : "Awal"} s/d{" "}
                {endDate ? formatDisplayDate(endDate) : "Sekarang"}
              </strong>{" "}
              ({filteredStockOutItems.length} catatan pengeluaran ditemukan)
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

        {/* Table Content */}
        {filteredStockOutItems.length === 0 ? (
          <div className="empty-state">
            <p>Tidak ada riwayat stok keluar pada filter ini.</p>
            <span>
              {hasDateFilter
                ? `Tidak ditemukan pengeluaran stok antara ${formatDisplayDate(startDate) || "Awal"} s/d ${formatDisplayDate(endDate) || "Sekarang"}.`
                : "Belum ada catatan stok keluar. Silakan input pengeluaran melalui formulir di atas."}
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="scan-table">
              <thead>
                <tr>
                  <th style={{ width: "50px", textAlign: "center" }}>No</th>
                  <th style={{ width: "70px", textAlign: "center" }}>Foto Bukti</th>
                  <th style={{ width: "190px" }}>Waktu Keluar (WIB - Locked)</th>
                  <th style={{ width: "140px" }}>Kode Barang</th>
                  <th>Nama Karakter / Produk</th>
                  <th style={{ width: "140px", textAlign: "right" }}>Jumlah Keluar</th>
                  <th>Catatan / Keperluan</th>
                  <th style={{ width: "80px", textAlign: "center" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredStockOutItems.map((item, idx) => (
                  <tr key={item.id}>
                    <td style={{ textAlign: "center", color: "var(--text-muted)" }}>{idx + 1}</td>

                    {/* Foto Bukti Thumbnail */}
                    <td style={{ textAlign: "center" }}>
                      {item.image ? (
                        <img
                          src={item.image}
                          alt="Bukti"
                          className="table-img-thumb"
                          onClick={() => setZoomedImage(item.image)}
                          title="Klik untuk melihat foto bukti resolusi penuh"
                        />
                      ) : (
                        <div className="table-img-placeholder" title="Tidak ada foto bukti">
                          <ImageIcon size={16} />
                        </div>
                      )}
                    </td>

                    {/* Waktu Keluar Terkunci */}
                    <td>
                      <span className="locked-time-tag" title="Waktu tercatat otomatis saat pengeluaran disimpan">
                        <Lock size={10} style={{ marginRight: "4px" }} />
                        {item.formattedDate || item.date}
                      </span>
                    </td>

                    {/* Kode Barang */}
                    <td>
                      {item.code ? (
                        <span className="courier-badge badge-default" style={{ fontFamily: "var(--font-mono)", fontWeight: "700" }}>
                          {item.code}
                        </span>
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>-</span>
                      )}
                    </td>

                    {/* Nama Karakter */}
                    <td>
                      <span className="char-name-text">{item.name || "-"}</span>
                    </td>

                    {/* Jumlah Keluar (Lsn) */}
                    <td style={{ textAlign: "right" }}>
                      <span className="qty-badge-out">
                        {item.qty} Lsn
                      </span>
                    </td>

                    {/* Catatan / Keperluan */}
                    <td style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
                      {item.notes || "-"}
                    </td>

                    {/* Aksi Pembatalan (Terkunci untuk Karyawan) */}
                    <td style={{ textAlign: "center" }}>
                      {currentUser?.role === "EMPLOYEE" ? (
                        <span
                          style={{
                            fontSize: "11px",
                            fontWeight: "600",
                            color: "var(--text-muted)",
                            background: "var(--bg-subtle)",
                            padding: "3px 8px",
                            borderRadius: "4px",
                            border: "1px solid var(--border-main)",
                            display: "inline-block"
                          }}
                          title="Tidak memiliki izin menghapus data"
                        >
                          Terkunci
                        </span>
                      ) : (
                        <div className="table-actions-cell" style={{ justifyContent: "center" }}>
                          <button
                            className="btn-table-action delete"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Batalkan pengeluaran "${item.name || item.code}" (${item.qty} Lusin)? Stok akan otomatis dikembalikan ke sisa stok barang.`
                                )
                              ) {
                                onDeleteStockOut(item.id);
                                showToast("Pengeluaran dibatalkan & sisa stok berhasil dikembalikan.", "success");
                              }
                            }}
                            title="Batalkan pengeluaran & kembalikan stok (Khusus Owner)"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      )}
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Image Zoom Modal */}
      {zoomedImage && (
        <div className="image-zoom-overlay" onClick={() => setZoomedImage(null)}>
          <div className="image-zoom-card" onClick={(e) => e.stopPropagation()}>
            <div className="image-zoom-header">
              <span className="image-zoom-title">Detail Foto Bukti Pengeluaran</span>
              <button className="btn-modal-close" onClick={() => setZoomedImage(null)}>
                <X size={16} />
              </button>
            </div>
            <div className="image-zoom-body">
              <img src={zoomedImage} alt="Zoomed Bukti" className="zoomed-img" />
            </div>
            <div className="image-zoom-footer">
              Foto bukti pengeluaran barang (Telah dikompresi otomatis ≤ 200 KB)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
