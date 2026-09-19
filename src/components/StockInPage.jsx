import React, { useState } from "react";
import {
  PackagePlus,
  Search,
  FileText,
  Edit2,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  Boxes,
  TrendingDown,
  Warehouse
} from "lucide-react";
import { exportStockInPDF } from "../utils/pdfExporter";
import CalendarRangePicker from "./CalendarRangePicker";

function formatWIBDate(isoOrDateStr) {
  if (!isoOrDateStr) return "-";
  const d = new Date(isoOrDateStr);
  if (isNaN(d.getTime())) return isoOrDateStr;

  const time = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).replace(/\./g, ":") + " WIB";

  const date = d.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });

  return `${date}, ${time}`;
}

function getCurrentDateTimeLocal() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDisplayDate(ymdStr) {
  if (!ymdStr) return "";
  const [y, m, d] = ymdStr.split("-");
  return `${d}/${m}/${y}`;
}

export default function StockInPage({
  stockInItems = [],
  stockOutItems = [],
  onAddStockIn,
  onUpdateStockIn,
  onDeleteStockIn
}) {
  // Form State
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [dateVal, setDateVal] = useState(getCurrentDateTimeLocal);
  const [formError, setFormError] = useState("");
  const [toast, setToast] = useState(null);

  // Edit Modal State
  const [editingItem, setEditingItem] = useState(null);

  // Search & Filter Tanggal
  const [searchQuery, setSearchQuery] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

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

  // Submit Tambah Stok Masuk
  const handleSubmit = (e) => {
    e.preventDefault();
    setFormError("");

    const trimmedCode = code.trim();
    const trimmedName = name.trim();
    const sanitizedQty = String(qty).replace(/[^0-9]/g, "");
    const parsedQty = parseInt(sanitizedQty, 10);

    // Validasi: Minimal salah satu harus diisi (Kode Barang ATAU Nama Karakter)
    if (!trimmedCode && !trimmedName) {
      setFormError("Harap isi Kode Barang ATAU Nama Karakter (minimal salah satu terisi).");
      return;
    }

    if (isNaN(parsedQty) || parsedQty <= 0) {
      setFormError("Jumlah stok (Lusin) harus berupa angka bulat positif (tanpa koma/titik).");
      return;
    }

    const newItem = {
      id: `stk-in-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
      code: trimmedCode,
      name: trimmedName,
      qty: parsedQty,
      date: dateVal || getCurrentDateTimeLocal(),
      formattedDate: formatWIBDate(dateVal || getCurrentDateTimeLocal()),
      createdAt: new Date().toISOString()
    };

    onAddStockIn(newItem);

    // Reset Form
    setCode("");
    setName("");
    setQty("");
    setDateVal(getCurrentDateTimeLocal());
    showToast(`✓ Stok ${trimmedName || trimmedCode} (${parsedQty} Lusin) berhasil disimpan!`, "success");
  };

  // Submit Edit Modal
  const handleUpdateSubmit = (e) => {
    e.preventDefault();
    if (!editingItem) return;

    const trimmedCode = (editingItem.code || "").trim();
    const trimmedName = (editingItem.name || "").trim();
    const sanitizedQty = String(editingItem.qty || "").replace(/[^0-9]/g, "");
    const parsedQty = parseInt(sanitizedQty, 10);

    if (!trimmedCode && !trimmedName) {
      alert("Harap isi Kode Barang ATAU Nama Karakter (minimal salah satu terisi).");
      return;
    }

    if (isNaN(parsedQty) || parsedQty <= 0) {
      alert("Jumlah stok (Lusin) harus berupa angka bulat positif (tanpa koma/titik).");
      return;
    }

    onUpdateStockIn(editingItem.id, {
      ...editingItem,
      code: trimmedCode,
      name: trimmedName,
      qty: parsedQty,
      formattedDate: formatWIBDate(editingItem.date)
    });

    setEditingItem(null);
    showToast("✓ Data stok masuk berhasil diperbarui!", "success");
  };


  // Hitung Pengeluaran dan Sisa Stok per Barang
  const enrichedItems = stockInItems.map((item) => {
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

  // Filter Data berdasarkan Search Query & Rentang Tanggal
  const filteredItems = enrichedItems.filter((item) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCode = (item.code || "").toLowerCase().includes(q);
      const matchName = (item.name || "").toLowerCase().includes(q);
      if (!matchCode && !matchName) return false;
    }

    if (startDate || endDate) {
      const itemDateYMD = item.date ? item.date.slice(0, 10) : "";
      if (startDate && itemDateYMD < startDate) return false;
      if (endDate && itemDateYMD > endDate) return false;
    }

    return true;
  });

  // Metrik Ringkasan (Summary Cards)
  const totalStockInLusin = parseFloat(enrichedItems.reduce((sum, i) => sum + (parseFloat(i.qty) || 0), 0).toFixed(2));
  const totalStockOutLusin = parseFloat(enrichedItems.reduce((sum, i) => sum + (parseFloat(i.totalOut) || 0), 0).toFixed(2));
  const totalRemainingLusin = parseFloat(enrichedItems.reduce((sum, i) => sum + (parseFloat(i.remainingQty) || 0), 0).toFixed(2));
  const totalRegisteredItems = enrichedItems.length;

  // Handle Export PDF
  const handleExportPDF = () => {
    if (filteredItems.length === 0) {
      showToast("Tidak ada data stok masuk untuk diexport.", "warning");
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

    exportStockInPDF({
      items: filteredItems,
      filterLabel,
      summary: {
        totalItems: filteredItems.length,
        totalStockIn: totalStockInLusin,
        totalStockOut: totalStockOutLusin,
        totalRemaining: totalRemainingLusin
      }
    });

    showToast("✓ Laporan PDF Stok Masuk berhasil diunduh!", "success");
  };

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
            <h2 className="return-title">Manajemen Stok Masuk</h2>
            <span className="return-subtag">Inventaris Gudang (Lusin)</span>
          </div>
          <p className="return-subtitle">
            Pencatatan barang dan karakter masuk dalam satuan <strong>Lusin</strong>. Tanggal masuk otomatis tercatat namun dapat disesuaikan.
          </p>
        </div>

        <div className="return-header-actions">
          <button
            className="btn-secondary"
            onClick={handleExportPDF}
            disabled={filteredItems.length === 0}
            title="Download Laporan Resmi Stok Masuk dalam format PDF"
          >
            <FileText size={15} />
            Export Laporan PDF
          </button>
        </div>
      </div>

      {/* Summary Cards (Seragam dengan Page 3) */}
      <div className="return-stats-grid">
        {/* Card 1: Total Stok Masuk */}
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Total Stok Masuk</span>
            <PackagePlus size={18} color="#16a34a" />
          </div>
          <span className="stat-value text-green">
            {totalStockInLusin} <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-muted)" }}>Lsn</span>
          </span>
          <span className="stat-meta">Akumulasi seluruh barang masuk</span>
        </div>

        {/* Card 2: Total Stok Keluar */}
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Total Stok Keluar</span>
            <TrendingDown size={18} color="#d97706" />
          </div>
          <span className="stat-value text-amber">
            {totalStockOutLusin} <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-muted)" }}>Lsn</span>
          </span>
          <span className="stat-meta">Akumulasi pengeluaran barang</span>
        </div>

        {/* Card 3: Sisa Stok Gudang */}
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Sisa Stok Fisik</span>
            <Warehouse size={18} color="#2563eb" />
          </div>
          <span className="stat-value" style={{ color: "#2563eb" }}>
            {totalRemainingLusin} <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-muted)" }}>Lsn</span>
          </span>
          <span className="stat-meta">Sisa fisik yang siap dipakai</span>
        </div>

        {/* Card 4: Total Jenis Barang */}
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Total Variasi Barang</span>
            <Boxes size={18} color="#9333ea" />
          </div>
          <span className="stat-value text-purple">
            {totalRegisteredItems} <span style={{ fontSize: "14px", fontWeight: "600", color: "var(--text-muted)" }}>Varian</span>
          </span>
          <span className="stat-meta">Kode & karakter terdaftar</span>
        </div>
      </div>

      {/* Form Card (Seragam dengan Scanner Card di Halaman Retur) */}
      <div className="return-scanner-card">
        <div className="return-scanner-header">
          <div className="return-scanner-title">
            <PackagePlus size={18} />
            <span>Formulir Input Stok Masuk Baru:</span>
          </div>
          <span className="scanner-badge-status">
            <span className="status-dot"></span>
            Satuan: Lusin (Lsn)
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "14px", marginBottom: "14px" }}>
            {/* Kode Barang */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "5px" }}>
                Kode Barang <span style={{ fontSize: "11px", fontWeight: "normal", color: "var(--text-muted)" }}>(Opsional jika nama diisi)</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Contoh: BRG-001 / KRM-01"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>

            {/* Nama Karakter */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "5px" }}>
                Nama Karakter / Produk <span style={{ fontSize: "11px", fontWeight: "normal", color: "var(--text-muted)" }}>(Opsional jika kode diisi)</span>
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Contoh: Kuromi Purple / Cinnamoroll"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Stok dalam Lusin */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "5px" }}>
                Jumlah Stok Masuk <span style={{ color: "#dc2626" }}>* (Lusin - Angka Bulat)</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                className="form-input"
                placeholder="Contoh: 10 atau 25"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/[^0-9]/g, ""))}
                onKeyDown={(e) => {
                  if ([".", ",", "e", "E", "+", "-"].includes(e.key)) {
                    e.preventDefault();
                  }
                }}
              />
            </div>


            {/* Tanggal & Waktu Masuk (Bisa Diubah) */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "5px" }}>
                Tanggal & Jam Masuk <span style={{ fontSize: "11px", fontWeight: "normal", color: "var(--text-muted)" }}>(Otomatis WIB, bisa diedit)</span>
              </label>
              <input
                type="datetime-local"
                className="form-input"
                value={dateVal}
                onChange={(e) => setDateVal(e.target.value)}
              />
            </div>
          </div>

          {/* Action Row */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
            <button
              type="submit"
              className="btn-primary"
            >
              <PackagePlus size={15} />
              Simpan Data Stok Masuk
            </button>
          </div>
        </form>
      </div>

      {/* Tabel Data Rekap Stok Masuk (Seragam dengan Return Table Card) */}
      <div className="return-table-card">
        {/* Controls Bar */}
        <div className="table-controls-bar">
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-primary)" }}>
              Daftar Stok Barang Masuk
            </span>
            <span className="courier-badge badge-default">
              {filteredItems.length} Variasi
            </span>
          </div>

          {/* Search Input */}
          <div className="search-wrap" style={{ width: "260px" }}>
            <Search size={14} color="var(--text-dim)" />
            <input
              type="text"
              placeholder="Cari kode atau nama barang..."
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
              Menampilkan data stok masuk rentang:{" "}
              <strong>
                {startDate ? formatDisplayDate(startDate) : "Awal"} s/d{" "}
                {endDate ? formatDisplayDate(endDate) : "Sekarang"}
              </strong>{" "}
              ({filteredItems.length} variasi barang ditemukan)
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
        {filteredItems.length === 0 ? (
          <div className="empty-state">
            <p>Tidak ada data stok masuk pada filter ini.</p>
            <span>
              {hasDateFilter
                ? `Tidak ditemukan stok masuk antara ${formatDisplayDate(startDate) || "Awal"} s/d ${formatDisplayDate(endDate) || "Sekarang"}.`
                : "Silakan input barang masuk melalui formulir di atas."}
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="scan-table">
              <thead>
                <tr>
                  <th style={{ width: "50px", textAlign: "center" }}>No</th>
                  <th style={{ width: "160px" }}>Kode Barang</th>
                  <th>Nama Karakter / Produk</th>
                  <th style={{ width: "140px", textAlign: "right" }}>Stok Masuk</th>
                  <th style={{ width: "140px", textAlign: "right" }}>Total Keluar</th>
                  <th style={{ width: "150px", textAlign: "right" }}>Sisa Stok</th>
                  <th style={{ width: "210px" }}>Tanggal Masuk (WIB)</th>
                  <th style={{ width: "90px", textAlign: "center" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, idx) => (
                  <tr key={item.id}>
                    <td style={{ textAlign: "center", color: "var(--text-muted)" }}>{idx + 1}</td>

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

                    {/* Stok Masuk (Lsn) */}
                    <td style={{ textAlign: "right" }}>
                      <span className="qty-badge-in">
                        {item.qty} Lsn
                      </span>
                    </td>

                    {/* Total Keluar (Lsn) */}
                    <td style={{ textAlign: "right" }}>
                      <span className="qty-badge-out">
                        {item.totalOut} Lsn
                      </span>
                    </td>

                    {/* Sisa Stok (Lsn) */}
                    <td style={{ textAlign: "right" }}>
                      <span className={`qty-badge-remain ${item.remainingQty <= 0 ? "empty" : ""}`}>
                        {item.remainingQty} Lsn
                      </span>
                    </td>

                    {/* Tanggal Masuk (WIB) */}
                    <td>
                      <span className="date-wib-cell">
                        {item.formattedDate || formatWIBDate(item.date)}
                      </span>
                    </td>

                    {/* Aksi (Edit & Delete) */}
                    <td style={{ textAlign: "center" }}>
                      <div className="table-actions-cell" style={{ justifyContent: "center" }}>
                        <button
                          className="btn-table-action"
                          onClick={() => {
                            setEditingItem({
                              ...item,
                              date: item.date ? item.date.slice(0, 16) : getCurrentDateTimeLocal()
                            });
                          }}
                          title="Edit Stok Masuk"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          className="btn-table-action delete"
                          onClick={() => {
                            if (window.confirm(`Hapus stok masuk "${item.name || item.code}"? Seluruh riwayat pengeluaran terkait juga akan dihapus.`)) {
                              onDeleteStockIn(item.id);
                              showToast("Stok masuk berhasil dihapus.", "success");
                            }
                          }}
                          title="Hapus Stok Masuk"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Item Modal */}
      {editingItem && (
        <div className="modal-backdrop">
          <div className="modal-dialog">
            <div className="modal-header">
              <div className="modal-title-wrap">
                <h3 className="modal-title">Edit Data Stok Masuk</h3>
                <span className="modal-subtitle">Perbarui informasi barang atau jumlah stok</span>
              </div>
              <button className="btn-modal-close" onClick={() => setEditingItem(null)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleUpdateSubmit}>
              <div className="modal-body">
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div>
                    <label className="form-label">Kode Barang</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editingItem.code || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, code: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="form-label">Nama Karakter / Produk</label>
                    <input
                      type="text"
                      className="form-input"
                      value={editingItem.name || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="form-label">
                      Jumlah Stok Masuk <span className="label-required">* (Lusin - Angka Bulat)</span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      required
                      className="form-input"
                      value={editingItem.qty}
                      onChange={(e) => setEditingItem({ ...editingItem, qty: e.target.value.replace(/[^0-9]/g, "") })}
                      onKeyDown={(e) => {
                        if ([".", ",", "e", "E", "+", "-"].includes(e.key)) {
                          e.preventDefault();
                        }
                      }}
                    />
                  </div>


                  <div>
                    <label className="form-label">Tanggal Masuk</label>
                    <input
                      type="datetime-local"
                      className="form-input"
                      value={editingItem.date || ""}
                      onChange={(e) => setEditingItem({ ...editingItem, date: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setEditingItem(null)}>
                  Batal
                </button>
                <button type="submit" className="btn-primary">
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
