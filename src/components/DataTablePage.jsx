import React, { useState } from "react";
import {
  Search,
  Trash2,
  Copy,
  Check,
  RefreshCw,
  FileSpreadsheet,
  MessageCircle,
  Database,
  Calendar,
  X,
  ArrowRight
} from "lucide-react";
import CalendarRangePicker from "./CalendarRangePicker";

function extractDateYMD(item) {
  if (item.id && /^\d{12,14}/.test(item.id)) {
    const epoch = parseInt(item.id.match(/^(\d{12,14})/)[1]);
    const d = new Date(epoch);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  if (item.fullDate) {
    const match = item.fullDate.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (match) {
      const d = String(parseInt(match[1])).padStart(2, "0");
      const m = String(parseInt(match[2])).padStart(2, "0");
      const y = match[3];
      return `${y}-${m}-${d}`;
    }
  }
  return null;
}

export default function DataTablePage({
  scans = [],
  onDelete,
  onRefresh,
  onExportExcel,
  onCopy,
  copiedId
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("ALL"); // ALL, JNT, SICEPAT, DUPLICATE
  const [startDate, setStartDate] = useState(""); // YYYY-MM-DD
  const [endDate, setEndDate] = useState("");     // YYYY-MM-DD

  const getTodayYMD = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const getDaysAgoYMD = (days) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const getMonthStartYMD = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`;
  };

  // Preset Handlers
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
    const start = getDaysAgoYMD(7);
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
  const isPreset7DaysActive = startDate === getDaysAgoYMD(7) && endDate === getTodayYMD();
  const isPresetThisMonthActive = startDate === getMonthStartYMD() && endDate === getTodayYMD();

  // Filter list berdasarkan Rentang Tanggal, Search, dan Kategori
  const filtered = scans.filter((item) => {
    const itemYMD = extractDateYMD(item);

    // 1. Filter Rentang Tanggal
    if (startDate && itemYMD) {
      if (itemYMD < startDate) return false;
    }
    if (endDate && itemYMD) {
      if (itemYMD > endDate) return false;
    }

    // 2. Filter Search Query
    const matchesSearch =
      item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.courier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.timestamp && item.timestamp.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.fullDate && item.fullDate.toLowerCase().includes(searchQuery.toLowerCase()));

    if (!matchesSearch) return false;

    // 3. Filter Kurir / Duplikat
    if (activeFilter === "JNT") {
      const tag = (item.courier?.tag || item.courier?.name || "").toUpperCase();
      return tag.includes("J&T") || tag.includes("JNT");
    }
    if (activeFilter === "SICEPAT") {
      const tag = (item.courier?.tag || item.courier?.name || "").toUpperCase();
      return tag.includes("SICEPAT");
    }
    if (activeFilter === "DUPLICATE") {
      return item.isDuplicate;
    }
    return true;
  });

  // Data terfilter tanggal untuk indikator angka di tab
  const dateFilteredScans = scans.filter((item) => {
    const itemYMD = extractDateYMD(item);
    if (startDate && itemYMD && itemYMD < startDate) return false;
    if (endDate && itemYMD && itemYMD > endDate) return false;
    return true;
  });

  const jntTotal = dateFilteredScans.filter((s) => {
    const tag = (s.courier?.tag || s.courier?.name || "").toUpperCase();
    return tag.includes("J&T") || tag.includes("JNT");
  }).length;

  const sicepatTotal = dateFilteredScans.filter((s) => {
    const tag = (s.courier?.tag || s.courier?.name || "").toUpperCase();
    return tag.includes("SICEPAT");
  }).length;

  const dupTotal = dateFilteredScans.filter((s) => s.isDuplicate).length;

  const formatWIB = (item) => {
    let t = item.timestamp || "";
    if (t && !t.toUpperCase().includes("WIB")) {
      t = t.replace(/\./g, ":") + " WIB";
    }
    let d = item.fullDate || "";
    if (d && d.includes(",")) {
      const datePart = d.split(",")[0].trim();
      return `${datePart}, ${t}`;
    }
    return t || "-";
  };

  const formatDisplayDate = (ymd) => {
    if (!ymd) return "";
    const [y, m, d] = ymd.split("-");
    const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return dateObj.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  };

  const hasDateFilter = Boolean(startDate || endDate);

  return (
    <div className="db-page-card">
      {/* Header Info */}
      <div className="db-header">
        <div>
          <div className="db-title-wrap">
            <h2 className="db-title">Database Riwayat Scan JSON</h2>
            <span className="db-source-pill">
              <Database size={12} />
              data_scan.json ({scans.length} total data)
            </span>
          </div>
          <p className="db-subtitle">
            Tabel data tersinkronisasi langsung dengan file <code>data_scan.json</code>. Menghapus baris akan otomatis memperbarui file di perangkat.
          </p>
        </div>

        <div className="db-actions">
          <button className="btn-secondary" onClick={onRefresh} title="Muat ulang data dari file data_scan.json">
            <RefreshCw size={14} />
            Refresh
          </button>
          <button className="btn-secondary" onClick={onExportExcel} disabled={scans.length === 0} title="Export ke file Excel formal">
            <FileSpreadsheet size={14} />
            Export Excel
          </button>
        </div>
      </div>

      {/* Filter & Controls Toolbar */}
      <div className="db-controls-container">
        {/* Row 1: Courier Filter Tabs */}
        <div className="db-filter-tabs">
          <button
            className={`filter-tab ${activeFilter === "ALL" ? "active" : ""}`}
            onClick={() => setActiveFilter("ALL")}
          >
            Semua ({dateFilteredScans.length})
          </button>
          <button
            className={`filter-tab ${activeFilter === "JNT" ? "active" : ""}`}
            onClick={() => setActiveFilter("JNT")}
          >
            J&T Express ({jntTotal})
          </button>
          <button
            className={`filter-tab ${activeFilter === "SICEPAT" ? "active" : ""}`}
            onClick={() => setActiveFilter("SICEPAT")}
          >
            SiCepat ({sicepatTotal})
          </button>
          <button
            className={`filter-tab ${activeFilter === "DUPLICATE" ? "active" : ""}`}
            onClick={() => setActiveFilter("DUPLICATE")}
          >
            Duplikat ({dupTotal})
          </button>
        </div>

        {/* Row 2: Search Input */}
        <div className="search-wrap" style={{ width: "240px" }}>
          <Search size={14} color="var(--text-dim)" />
          <input
            type="text"
            placeholder="Cari nomor resi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Interactive Date Range Picker Bar */}
      <div className="date-range-toolbar">
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
        <div className="date-filter-banner">
          <span>
            Menampilkan data rentang:{" "}
            <strong>
              {startDate ? formatDisplayDate(startDate) : "Awal"} s/d{" "}
              {endDate ? formatDisplayDate(endDate) : "Sekarang"}
            </strong>{" "}
            ({filtered.length} resi ditemukan)
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
      {filtered.length === 0 ? (
        <div className="empty-state">
          <p>Tidak ada data resi pada rentang ini.</p>
          <span>
            {hasDateFilter
              ? `Tidak ditemukan hasil scan antara ${startDate || "Awal"} s/d ${endDate || "Sekarang"}.`
              : "Coba ubah kata kunci pencarian atau scan paket baru."}
          </span>
          {hasDateFilter && (
            <button
              className="btn-secondary"
              style={{ marginTop: "10px" }}
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
            >
              Tampilkan Semua Tanggal
            </button>
          )}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="scan-table">
            <thead>
              <tr>
                <th style={{ width: "60px" }}>No</th>
                <th style={{ width: "210px" }}>Waktu & Tanggal (WIB)</th>
                <th>Nomor Resi</th>
                <th style={{ width: "160px" }}>Ekspedisi</th>
                <th style={{ width: "100px" }}>Status</th>
                <th style={{ width: "120px", textAlign: "right" }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => (
                <tr key={item.id}>
                  <td style={{ color: "var(--text-muted)" }}>{filtered.length - idx}</td>
                  <td style={{ color: "var(--text-secondary)", fontSize: "12px", fontFamily: "var(--font-mono)" }}>
                    {formatWIB(item)}
                  </td>
                  <td>
                    <div className="resi-cell">
                      <span>{item.code}</span>
                      <button
                        className="btn-mini"
                        onClick={() => onCopy(item.code, item.id)}
                        title="Salin Nomor Resi"
                      >
                        {copiedId === item.id ? <Check size={14} color="#18181b" /> : <Copy size={14} />}
                      </button>
                    </div>
                  </td>
                  <td>
                    <span
                      className={`courier-badge ${
                        (item.courier?.tag || item.courier?.name || "").toUpperCase().includes("J&T") ||
                        (item.courier?.tag || item.courier?.name || "").toUpperCase().includes("JNT")
                          ? "badge-jnt"
                          : (item.courier?.tag || item.courier?.name || "").toUpperCase().includes("SICEPAT")
                          ? "badge-sicepat"
                          : "badge-default"
                      }`}
                    >
                      {item.courier.tag || item.courier.name}
                    </span>
                  </td>
                  <td>
                    {item.isDuplicate ? (
                      <span style={{ fontSize: "10px", fontWeight: 700, color: "#18181b", background: "#f4f4f5", border: "1px solid #d4d4d8", padding: "2px 6px", borderRadius: "3px" }}>
                        DUPLIKAT
                      </span>
                    ) : (
                      <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Unik</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                      <a
                        className="btn-mini"
                        href={`https://wa.me/?text=${encodeURIComponent(
                          `Halo kak, pesanan Anda dikirim dengan No. Resi: ${item.code} (${item.courier.name}).`
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Kirim ke WhatsApp"
                      >
                        <MessageCircle size={14} />
                      </a>
                      <button
                        className="btn-mini btn-delete"
                        onClick={() => onDelete(item.id, item.code)}
                        title="Hapus baris ini dari data_scan.json"
                      >
                        <Trash2 size={14} />
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
  );
}
