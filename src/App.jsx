import React, { useState, useEffect, useRef } from "react";
import {
  Barcode,
  Copy,
  Check,
  FileSpreadsheet,
  Volume2,
  VolumeX,
  Search,
  ExternalLink,
  MessageCircle,
  Database,
  Scan
} from "lucide-react";
import { detectCourier } from "./utils/courier";
import { playCourierSound, playDuplicateSound } from "./utils/audio";
import { exportToExcel } from "./utils/exporter";
import PieSummary from "./components/PieSummary";
import DataTablePage from "./components/DataTablePage";
import "./App.css";

export default function App() {
  const [activeTab, setActiveTab] = useState("SCANNER"); // "SCANNER" | "DATABASE"
  const [scans, setScans] = useState(() => {
    try {
      const saved = localStorage.getItem("webscan_history");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [inputVal, setInputVal] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toast, setToast] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const inputRef = useRef(null);
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);

  // Sync awal dari file data_scan.json (mendukung lokal dev server & hosting Vercel)
  const fetchLocalJSON = () => {
    fetch("/api/scans")
      .then((res) => {
        if (!res.ok) throw new Error("API dev server tidak aktif");
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setScans(data);
        }
      })
      .catch(() => {
        // Fallback saat dibuka di Vercel / serverless: baca dari public/data_scan.json
        fetch("/data_scan.json")
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (Array.isArray(data) && data.length > 0) {
              setScans((prev) => (prev.length === 0 ? data : prev));
            }
          })
          .catch(() => {});
      });
  };

  useEffect(() => {
    fetchLocalJSON();
  }, []);

  // Simpan juga ke LocalStorage sebagai backup browser
  useEffect(() => {
    try {
      localStorage.setItem("webscan_history", JSON.stringify(scans));
    } catch (e) {
      console.error(e);
    }
  }, [scans]);

  const showToast = (message) => {
    setToast(message);
    setTimeout(() => {
      setToast(null);
    }, 2800);
  };

  const handleCopy = (text, id = null) => {
    navigator.clipboard.writeText(text);
    if (id) setCopiedId(id);
    showToast(`Resi ${text} disalin ke clipboard`);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const processScan = (rawCode) => {
    const code = rawCode.trim();
    if (!code) return;

    const courier = detectCourier(code);
    const isDuplicate = scans.some((s) => s.code.toLowerCase() === code.toLowerCase());

    const now = new Date();
    // Format waktu Indonesia WIB
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

    const newScan = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      code,
      courier,
      timestamp: timeWIB,
      fullDate: fullDateWIB,
      isDuplicate
    };

    if (soundEnabled) {
      if (isDuplicate) {
        playDuplicateSound();
      } else {
        playCourierSound(courier);
      }
    }

    setScans((prev) => [newScan, ...prev]);
    showToast(
      isDuplicate
        ? `⚠️ Resi duplikat: ${code}`
        : `✓ Sukses scan: ${code} (${courier.name})`
    );

    // Auto copy resi ke clipboard
    navigator.clipboard.writeText(code).catch(() => {});

    // Simpan otomatis ke file data_scan.json di device
    fetch("/api/scans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newScan)
    }).catch((err) => console.error("Gagal simpan ke data_scan.json:", err));
  };

  // Global listener for USB Barcode Scanner
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target && e.target.id === "search-input") {
        return;
      }

      const currentTime = Date.now();
      const diff = currentTime - lastKeyTimeRef.current;
      lastKeyTimeRef.current = currentTime;

      if (e.key === "Enter") {
        const fullBuffer = bufferRef.current;
        bufferRef.current = "";

        if (fullBuffer.length > 2) {
          e.preventDefault();
          processScan(fullBuffer);
          setInputVal("");
          return;
        }
      }

      if (e.key.length === 1) {
        if (diff > 150) {
          bufferRef.current = e.key;
        } else {
          bufferRef.current += e.key;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [scans, soundEnabled]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputVal.trim()) return;
    processScan(inputVal);
    setInputVal("");
  };

  const handleExportExcel = async () => {
    if (scans.length === 0) {
      showToast("Belum ada data untuk di-export");
      return;
    }
    showToast("Menyiapkan file Excel formal...");
    try {
      await exportToExcel(scans);
      showToast("File Excel (.xlsx) berhasil diunduh!");
    } catch (err) {
      console.error(err);
      showToast("Gagal mengunduh file Excel.");
    }
  };

  const handleDeleteScan = async (id, code) => {
    if (!window.confirm(`Hapus nomor resi ${code} dari data_scan.json?`)) return;
    try {
      setScans((prev) => prev.filter((s) => s.id !== id));
      await fetch("/api/scans/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      showToast(`Resi ${code} berhasil dihapus dari data_scan.json`);
    } catch (err) {
      console.error(err);
      showToast("Gagal menghapus data.");
    }
  };

  const filteredScans = scans.filter((s) =>
    s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.courier.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalScans = scans.length;
  const uniqueScans = new Set(scans.map((s) => s.code)).size;
  const duplicateScans = totalScans - uniqueScans;
  const latestScan = scans[0] || null;

  return (
    <div className="app-container">
      {/* Navbar Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="logo-box">
            <Barcode size={22} />
          </div>
          <div>
            <h1 className="brand-title">
              WebScan
              <span className="status-pill">
                <span className="status-dot"></span>
                USB Siap
              </span>
            </h1>
            <p className="brand-subtitle">Sistem Pemindai Barcode & Nomor Resi</p>
          </div>
        </div>

        <div className="header-actions">
          <button
            className="btn-icon"
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Audio Aktif" : "Audio Bisu"}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>

          <button
            className="btn-secondary"
            onClick={handleExportExcel}
            disabled={scans.length === 0}
            title="Download file Excel (.xlsx) rapi dengan Sheet JNT & SICEPAT"
          >
            <FileSpreadsheet size={15} />
            Export Excel
          </button>
        </div>
      </header>

      {/* Main Navigation Tabs */}
      <nav className="main-nav">
        <button
          className={`nav-tab ${activeTab === "SCANNER" ? "active" : ""}`}
          onClick={() => setActiveTab("SCANNER")}
        >
          <Scan size={15} />
          <span>Pemindai Live</span>
        </button>

        <button
          className={`nav-tab ${activeTab === "DATABASE" ? "active" : ""}`}
          onClick={() => setActiveTab("DATABASE")}
        >
          <Database size={15} />
          <span>Tabel Data (JSON)</span>
          <span className="nav-badge">{scans.length}</span>
        </button>
      </nav>

      {/* PAGE 1: SCANNER DASHBOARD */}
      {activeTab === "SCANNER" && (
        <>
          {/* Scanner Input Card */}
          <div className="scanner-card">
            <div className="scanner-card-header">
              <div className="scanner-label">
                <Barcode size={16} />
                <span>Arahkan scanner USB atau ketik nomor resi di bawah:</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="scanner-input-group">
              <input
                ref={inputRef}
                type="text"
                className="scanner-input"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Menunggu input scanner USB... (Otomatis terbaca)"
                autoFocus
              />
              <button type="submit" className="btn-primary">
                Input
              </button>
            </form>
          </div>

          {/* Stats Row */}
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Total Scan</span>
              <span className="stat-value">{totalScans}</span>
            </div>

            <div className="stat-card">
              <span className="stat-label">Resi Unik</span>
              <span className="stat-value">{uniqueScans}</span>
            </div>

            <div className="stat-card">
              <span className="stat-label">Duplikat Terdeteksi</span>
              <span className="stat-value">{duplicateScans}</span>
            </div>

            <div className="stat-card">
              <span className="stat-label">Notifikasi Audio</span>
              <span className="stat-value" style={{ fontSize: "16px", fontWeight: 600 }}>
                {soundEnabled ? "Aktif" : "Nonaktif"}
              </span>
            </div>
          </div>

          {/* Pie Chart Summary Hari Ini */}
          <PieSummary scans={scans} />

          {/* Latest Scan Spotlight */}
          {latestScan && (
            <div className="spotlight-card">
              <div className="spotlight-left">
                <div className="spotlight-badge-row">
                  <span
                    className={`courier-badge ${
                      (latestScan.courier?.tag || latestScan.courier?.name || "").toUpperCase().includes("J&T") ||
                      (latestScan.courier?.tag || latestScan.courier?.name || "").toUpperCase().includes("JNT")
                        ? "badge-jnt"
                        : (latestScan.courier?.tag || latestScan.courier?.name || "").toUpperCase().includes("SICEPAT")
                        ? "badge-sicepat"
                        : "badge-default"
                    }`}
                  >
                    {latestScan.courier.name}
                  </span>
                  {latestScan.isDuplicate && (
                    <span className="duplicate-badge">DUPLIKAT</span>
                  )}
                </div>
                <div className="spotlight-code">{latestScan.code}</div>
                <div className="spotlight-meta">
                  Waktu scan: {latestScan.timestamp} • {latestScan.code.length} Karakter
                </div>
              </div>

              <div className="spotlight-actions">
                <button
                  className="btn-secondary"
                  onClick={() => handleCopy(latestScan.code)}
                >
                  <Copy size={15} />
                  Salin Resi
                </button>

                <a
                  className="btn-secondary"
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `Halo kak, pesanan Anda telah diproses dengan Nomor Resi: ${latestScan.code} (${latestScan.courier.name}). Terima kasih!`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Kirim ke WhatsApp"
                >
                  <MessageCircle size={15} />
                  Kirim WA
                </a>

                <a
                  className="btn-secondary"
                  href={`https://cekresi.com/?noresi=${encodeURIComponent(latestScan.code)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Lacak paket"
                >
                  <ExternalLink size={15} />
                  Lacak
                </a>
              </div>
            </div>
          )}

          {/* Quick History List */}
          <div className="history-card">
            <div className="history-header">
              <h2 className="history-title">
                Riwayat Terakhir ({filteredScans.length})
              </h2>

              <div className="search-wrap">
                <Search size={15} color="var(--text-dim)" />
                <input
                  id="search-input"
                  type="text"
                  placeholder="Cari resi / ekspedisi..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {filteredScans.length === 0 ? (
              <div className="empty-state">
                <p>Belum ada data scan.</p>
                <span>Tembak barcode menggunakan scanner USB atau input nomor resi di atas.</span>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="scan-table">
                  <thead>
                    <tr>
                      <th style={{ width: "60px" }}>No</th>
                      <th style={{ width: "160px" }}>Waktu (WIB)</th>
                      <th>Nomor Resi</th>
                      <th style={{ width: "180px" }}>Ekspedisi</th>
                      <th style={{ width: "110px" }}>Status</th>
                      <th style={{ width: "100px", textAlign: "right" }}>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredScans.slice(0, 10).map((scan, idx) => (
                      <tr key={scan.id}>
                        <td style={{ color: "var(--text-muted)" }}>{filteredScans.length - idx}</td>
                        <td style={{ color: "var(--text-secondary)", fontSize: "12px", fontFamily: "var(--font-mono)" }}>
                          {scan.timestamp && !scan.timestamp.includes("WIB") ? `${scan.timestamp} WIB` : scan.timestamp}
                        </td>
                        <td>
                          <div className="resi-cell">
                            <span>{scan.code}</span>
                            <button
                              className="btn-mini"
                              onClick={() => handleCopy(scan.code, scan.id)}
                              title="Salin Nomor Resi"
                            >
                              {copiedId === scan.id ? <Check size={14} color="#18181b" /> : <Copy size={14} />}
                            </button>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`courier-badge ${
                              (scan.courier?.tag || scan.courier?.name || "").toUpperCase().includes("J&T") ||
                              (scan.courier?.tag || scan.courier?.name || "").toUpperCase().includes("JNT")
                                ? "badge-jnt"
                                : (scan.courier?.tag || scan.courier?.name || "").toUpperCase().includes("SICEPAT")
                                ? "badge-sicepat"
                                : "badge-default"
                            }`}
                          >
                            {scan.courier.tag || scan.courier.name}
                          </span>
                        </td>
                        <td>
                          {scan.isDuplicate ? (
                            <span style={{ fontSize: "11px", fontWeight: 700, color: "#18181b", background: "#f4f4f5", border: "1px solid #d4d4d8", padding: "2px 6px", borderRadius: "3px" }}>
                              Duplikat
                            </span>
                          ) : (
                            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Unik</span>
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <a
                            className="btn-mini"
                            href={`https://wa.me/?text=${encodeURIComponent(
                              `Halo kak, pesanan Anda dikirim dengan No. Resi: ${scan.code} (${scan.courier.name}).`
                            )}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Kirim ke WhatsApp"
                          >
                            <MessageCircle size={15} />
                          </a>
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

      {/* PAGE 2: DEDICATED DATABASE TABLE PAGE (LINKED TO JSON) */}
      {activeTab === "DATABASE" && (
        <DataTablePage
          scans={scans}
          onDelete={handleDeleteScan}
          onRefresh={() => {
            fetchLocalJSON();
            showToast("Data dimuat ulang dari data_scan.json");
          }}
          onExportExcel={handleExportExcel}
          onCopy={handleCopy}
          copiedId={copiedId}
        />
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div className="toast-msg">
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}
