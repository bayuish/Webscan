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
  Scan,
  RotateCcw,
  PackagePlus,
  TrendingDown,
  LogOut,
  UserCheck,
  Camera,
  Smartphone
} from "lucide-react";
import { detectCourier, cleanTrackingCode } from "./utils/courier";
import { playCourierSound, playDuplicateSound, unlockAudio, playSuccessBeep } from "./utils/audio";
import { exportToExcel } from "./utils/exporter";
import PieSummary from "./components/PieSummary";
import DataTablePage from "./components/DataTablePage";
import ReturnHubPage from "./components/ReturnHubPage";
import CameraBarcodeScanner from "./components/CameraBarcodeScanner";
import StockInPage from "./components/StockInPage";
import StockOutPage from "./components/StockOutPage";
import LoginPage from "./components/LoginPage";
import { supabase, getActiveSession, refreshActiveSession } from "./utils/supabaseClient";
import {
  fetchScansHistory,
  insertScanRecord,
  deleteScanRecord,
  fetchStockInList,
  insertStockInItem,
  updateStockInItem,
  deleteStockInItem,
  fetchStockOutList,
  insertStockOutItem,
  deleteStockOutItem,
  formatWIBDateTime
} from "./utils/supabaseDb";
import "./App.css";

// Helper menentukan rute halaman aktif dari URL browser
const getTabFromPath = () => {
  if (typeof window === "undefined") return "SCANNER";
  const path = window.location.pathname.toLowerCase();
  if (path.startsWith("/stok-masuk") || path.startsWith("/stock-in")) return "STOCK_IN";
  if (path.startsWith("/stok-keluar") || path.startsWith("/stock-out")) return "STOCK_OUT";
  if (path.startsWith("/retur") || path.startsWith("/returns")) return "RETURNS";
  if (path.startsWith("/database") || path.startsWith("/data")) return "DATABASE";
  return "SCANNER";
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => {
    try {
      const saved = localStorage.getItem("webscan_auth_user");
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState(() => {
    const tab = getTabFromPath();
    // Jika karyawan, langsung default ke stok keluar
    const savedUser = localStorage.getItem("webscan_auth_user");
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u?.role === "EMPLOYEE") return "STOCK_OUT";
      } catch {}
    }
    return tab;
  });

  const [scans, setScans] = useState([]);
  const [stockInItems, setStockInItems] = useState([]);
  const [stockOutItems, setStockOutItems] = useState([]);
  const [isLoadingDb, setIsLoadingDb] = useState(true);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);
  const [showAudioPrompt, setShowAudioPrompt] = useState(false);

  // Sync awal dari Database Supabase (Cloud)
  const loadDatabaseFromSupabase = async () => {
    setIsLoadingDb(true);
    try {
      const [scansData, stockInData, stockOutData] = await Promise.all([
        fetchScansHistory(),
        fetchStockInList(),
        fetchStockOutList()
      ]);
      if (scansData) setScans(scansData);
      if (stockInData) setStockInItems(stockInData);
      if (stockOutData) setStockOutItems(stockOutData);
    } catch (err) {
      console.error("Gagal memuat data dari Supabase:", err);
    } finally {
      setIsLoadingDb(false);
    }
  };

  useEffect(() => {
    loadDatabaseFromSupabase();
    // Bersihkan cache lama di localStorage agar tidak ada data basi
    try {
      localStorage.removeItem("webscan_history");
      localStorage.removeItem("webscan_stock_in");
      localStorage.removeItem("webscan_stock_out");
    } catch (e) {}
  }, []);

  const handleAddStockIn = async (newItem) => {
    try {
      const saved = await insertStockInItem(newItem);
      setStockInItems((prev) => [saved || newItem, ...prev]);
    } catch (err) {
      console.error("Gagal simpan stok masuk:", err);
      showToast("Gagal menyimpan stok masuk ke database.", "error");
    }
  };

  const handleUpdateStockIn = async (updatedItem) => {
    try {
      const saved = await updateStockInItem(updatedItem);
      setStockInItems((prev) =>
        prev.map((item) => (item.id === updatedItem.id ? (saved || updatedItem) : item))
      );
    } catch (err) {
      console.error("Gagal update stok masuk:", err);
      showToast("Gagal memperbarui stok masuk di database.", "error");
    }
  };

  const handleDeleteStockIn = async (id) => {
    try {
      await deleteStockInItem(id);
      setStockInItems((prev) => prev.filter((item) => item.id !== id));
      setStockOutItems((prev) => prev.filter((out) => out.stockInId !== id));
      showToast("✓ Stok masuk berhasil dihapus dari database.");
    } catch (err) {
      console.error("Gagal hapus stok masuk:", err);
      showToast("Gagal menghapus stok masuk dari database.", "error");
    }
  };

  const handleAddStockOut = async (newItem) => {
    try {
      const saved = await insertStockOutItem(newItem);
      setStockOutItems((prev) => [saved || newItem, ...prev]);
    } catch (err) {
      console.error("Gagal simpan stok keluar:", err);
      showToast("Gagal menyimpan stok keluar ke database.", "error");
    }
  };

  const handleDeleteStockOut = async (id) => {
    try {
      await deleteStockOutItem(id);
      setStockOutItems((prev) => prev.filter((item) => item.id !== id));
      showToast("✓ Riwayat stok keluar berhasil dihapus dari database.");
    } catch (err) {
      console.error("Gagal hapus stok keluar:", err);
      showToast("Gagal menghapus stok keluar dari database.", "error");
    }
  };

  const handleLoginSuccess = (user) => {
    setCurrentUser(user);
    try {
      localStorage.setItem("webscan_auth_user", JSON.stringify(user));
    } catch (e) {}
    if (user.role === "EMPLOYEE") {
      setActiveTab("STOCK_OUT");
      if (window.location.pathname !== "/stok-keluar") {
        window.history.pushState({ tab: "STOCK_OUT" }, "", "/stok-keluar");
      }
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn("SignOut warning:", err);
    }
    localStorage.removeItem("webscan_auth_user");
    setCurrentUser(null);
  };

  // Sinkronisasi Sesi Supabase pada saat halaman dimuat
  useEffect(() => {
    getActiveSession().then((sessionData) => {
      if (sessionData?.user) {
        setCurrentUser(sessionData.user);
        try {
          localStorage.setItem("webscan_auth_user", JSON.stringify(sessionData.user));
        } catch (e) {}
      }
    });

    // Dengarkan event perubahan otentikasi Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (session?.user) {
          const meta = session.user.user_metadata || {};
          const emailPrefix = session.user.email ? session.user.email.split("@")[0] : "";
          const userObj = {
            id: session.user.id,
            username: meta.username || emailPrefix,
            full_name: meta.name || meta.username || emailPrefix,
            role: meta.role || (emailPrefix === "fathanaj" ? "OWNER" : "EMPLOYEE"),
            email: session.user.email
          };
          setCurrentUser(userObj);
          try {
            localStorage.setItem("webscan_auth_user", JSON.stringify(userObj));
          } catch (e) {}
        }
      } else if (event === "SIGNED_OUT") {
        setCurrentUser(null);
        localStorage.removeItem("webscan_auth_user");
      }
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Heartbeat Aktivitas: Selama pengguna aktif berinteraksi, segarkan sesi secara berkala agar tidak expired / logout otomatis
  useEffect(() => {
    if (!currentUser) return;

    let lastActivity = Date.now();
    const markActive = () => {
      lastActivity = Date.now();
    };

    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }));

    // Cek setiap 5 menit: Jika pengguna aktif dalam 15 menit terakhir, perbarui sesi Supabase
    const interval = setInterval(() => {
      const now = Date.now();
      const isActiveRecently = now - lastActivity < 15 * 60 * 1000;
      if (isActiveRecently) {
        refreshActiveSession();
      }
    }, 5 * 60 * 1000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, markActive));
      clearInterval(interval);
    };
  }, [currentUser]);

  // Navigasi halaman dengan URL resmi (HTML5 History API)
  // Proteksi Karyawan: Karyawan hanya boleh mengakses STOCK_OUT (/stok-keluar)
  const navigateToTab = (tab) => {
    if (currentUser?.role === "EMPLOYEE" && tab !== "STOCK_OUT") {
      return;
    }
    setActiveTab(tab);
    let targetPath = "/";
    if (tab === "DATABASE") targetPath = "/database";
    if (tab === "RETURNS") targetPath = "/retur";
    if (tab === "STOCK_IN") targetPath = "/stok-masuk";
    if (tab === "STOCK_OUT") targetPath = "/stok-keluar";
    if (window.location.pathname !== targetPath) {
      window.history.pushState({ tab }, "", targetPath);
    }
  };

  // Dengarkan tombol Back & Forward pada browser
  useEffect(() => {
    const handlePopState = () => {
      const targetTab = getTabFromPath();
      if (currentUser?.role === "EMPLOYEE") {
        setActiveTab("STOCK_OUT");
        if (window.location.pathname !== "/stok-keluar") {
          window.history.replaceState({ tab: "STOCK_OUT" }, "", "/stok-keluar");
        }
      } else {
        setActiveTab(targetTab);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [currentUser]);

  // Jaga agar karyawan tidak bisa berada di rute selain /stok-keluar
  useEffect(() => {
    if (currentUser?.role === "EMPLOYEE" && activeTab !== "STOCK_OUT") {
      setActiveTab("STOCK_OUT");
      if (window.location.pathname !== "/stok-keluar") {
        window.history.replaceState({ tab: "STOCK_OUT" }, "", "/stok-keluar");
      }
    }
  }, [currentUser, activeTab]);

  const [inputVal, setInputVal] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCourierFilter, setActiveCourierFilter] = useState("ALL");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toast, setToast] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  const inputRef = useRef(null);
  const bufferRef = useRef("");
  const lastKeyTimeRef = useRef(0);

  // Toast message helper
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
    // Sanitasi prefix noise scanner seperti AVJY -> JY, AVAV002 -> 002
    const code = cleanTrackingCode(rawCode);
    if (!code) return;

    const courier = detectCourier(code);
    const isDuplicate = scans.some((s) => s.code.toLowerCase() === code.toLowerCase());

    const now = new Date();
    const fullDateWIB = formatWIBDateTime(now);
    const timeParts = fullDateWIB.split(", ");
    const timeWIB = timeParts.length > 1 ? timeParts[1] : fullDateWIB;

    const newScan = {
      id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 7)}`,
      code,
      courier,
      timestamp: timeWIB,
      fullDate: fullDateWIB,
      dateRaw: now.toISOString(),
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

    // Simpan otomatis ke database Supabase
    insertScanRecord(newScan)
      .then((saved) => {
        if (saved) {
          setScans((prev) => prev.map((s) => (s.id === newScan.id ? { ...s, id: saved.id } : s)));
        }
      })
      .catch((err) => console.error("Gagal simpan scan ke Supabase:", err));

    return {
      code,
      courier,
      isDuplicate,
      newScan
    };
  };

  // Global listener for USB Barcode Scanner
  // PROTEKSI KETAT: Hanya aktif di Pemindai Live ("/")
  // Bila user sedang di halaman Retur ("/retur") atau Database ("/database"),
  // scanner global ini dinonaktifkan total sehingga scan retur tidak masuk ke Pemindai Live!
  useEffect(() => {
    if (activeTab !== "SCANNER") {
      bufferRef.current = "";
      return;
    }

    const handleKeyDown = (e) => {
      // Abaikan jika user sedang mengetik di input box manapun
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) {
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
  }, [activeTab, scans, soundEnabled]);

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
    if (!window.confirm(`Hapus nomor resi ${code} dari database Supabase?`)) return;
    try {
      setScans((prev) => prev.filter((s) => s.id !== id));
      await deleteScanRecord(id);
      showToast(`✓ Resi ${code} berhasil dihapus dari database.`);
    } catch (err) {
      console.error(err);
      showToast("Gagal menghapus data dari database.");
    }
  };

  const totalScans = scans.length;
  const jntScansCount = scans.filter((s) => {
    const tag = (s.courier?.tag || s.courier?.name || "").toUpperCase();
    return tag.includes("J&T") || tag.includes("JNT");
  }).length;
  const sicepatScansCount = scans.filter((s) => {
    const tag = (s.courier?.tag || s.courier?.name || "").toUpperCase();
    return tag.includes("SICEPAT");
  }).length;
  const otherScansCount = scans.filter((s) => {
    const tag = (s.courier?.tag || s.courier?.name || "").toUpperCase();
    return !tag.includes("J&T") && !tag.includes("JNT") && !tag.includes("SICEPAT");
  }).length;
  const duplicateScans = scans.filter((s) => s.isDuplicate).length;

  const filteredScans = scans.filter((s) => {
    const matchesSearch =
      s.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.courier.name.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (activeCourierFilter === "JNT") {
      const tag = (s.courier?.tag || s.courier?.name || "").toUpperCase();
      return tag.includes("J&T") || tag.includes("JNT");
    }
    if (activeCourierFilter === "SICEPAT") {
      const tag = (s.courier?.tag || s.courier?.name || "").toUpperCase();
      return tag.includes("SICEPAT");
    }
    if (activeCourierFilter === "OTHER") {
      const tag = (s.courier?.tag || s.courier?.name || "").toUpperCase();
      return !tag.includes("J&T") && !tag.includes("JNT") && !tag.includes("SICEPAT");
    }
    if (activeCourierFilter === "DUPLICATE") {
      return s.isDuplicate;
    }
    return true;
  });

  const latestScan = scans[0] || null;

  // Jika belum login, tampilkan layar login eksklusif Supabase
  if (!currentUser) {
    return <LoginPage onLoginSuccess={handleLoginSuccess} />;
  }

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
              Engkong Stuff
              <span className="status-pill">
                <span className="status-dot"></span>
                USB Siap
              </span>
            </h1>
            <p className="brand-subtitle">Sistem Pemindai Barcode & Inventaris Gudang</p>
          </div>
        </div>

        <div className="header-actions">
          {/* User Profile & Role Info */}
          <div className="user-profile-header">
            <div className="user-profile-info">
              <span className="user-profile-name">
                <UserCheck size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                {currentUser.username}
              </span>
              {currentUser.role === "OWNER" && (
                <span className="user-role-badge badge-owner">
                  👑 Owner
                </span>
              )}
            </div>
            <button
              className="btn-logout"
              onClick={handleLogout}
              title="Keluar / Ganti Akun"
            >
              <LogOut size={14} />
              <span>Keluar</span>
            </button>
          </div>

          {/* Sound & Export (Khusus Owner) */}
          {currentUser.role === "OWNER" && (
            <>
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
            </>
          )}
        </div>
      </header>

      {/* Main Navigation Tabs dengan Hak Akses Berbasis Role */}
      <nav className="main-nav">
        {currentUser.role === "OWNER" && (
          <>
            <button
              className={`nav-tab ${activeTab === "SCANNER" ? "active" : ""}`}
              onClick={() => navigateToTab("SCANNER")}
            >
              <Scan size={15} />
              <span>Pemindai Live</span>
            </button>

            <button
              className={`nav-tab ${activeTab === "DATABASE" ? "active" : ""}`}
              onClick={() => navigateToTab("DATABASE")}
            >
              <Database size={15} />
              <span>Tabel Data (JSON)</span>
              <span className="nav-badge">{scans.length}</span>
            </button>

            <button
              className={`nav-tab ${activeTab === "RETURNS" ? "active" : ""}`}
              onClick={() => navigateToTab("RETURNS")}
            >
              <RotateCcw size={15} />
              <span>Manajemen Retur</span>
            </button>

            <button
              className={`nav-tab ${activeTab === "STOCK_IN" ? "active" : ""}`}
              onClick={() => navigateToTab("STOCK_IN")}
            >
              <PackagePlus size={15} />
              <span>Stok Masuk</span>
              <span className="nav-badge">{stockInItems.length}</span>
            </button>
          </>
        )}

        <button
          className={`nav-tab ${activeTab === "STOCK_OUT" ? "active" : ""}`}
          onClick={() => navigateToTab("STOCK_OUT")}
        >
          <TrendingDown size={15} />
          <span>Stok Keluar</span>
          <span className="nav-badge">{stockOutItems.length}</span>
        </button>
      </nav>

      {/* PAGE 1: SCANNER DASHBOARD */}
      {activeTab === "SCANNER" && (
        <>
          {/* Scanner Input Card */}
          <div className="scanner-card">
            {/* Tombol Utama: Scan Kamera HP Simultan */}
            <button
              type="button"
              className="btn-camera-scan-main"
              onClick={() => {
                setShowAudioPrompt(true);
              }}
            >
              <div className="btn-camera-scan-icon">
                <Camera size={22} />
              </div>
              <div className="btn-camera-scan-text">
                <span className="btn-camera-scan-title">
                  📷 Buka Scanner Kamera HP
                </span>
                <span className="btn-camera-scan-sub">
                  Membaca Barcode 1D & QR Code J&T / SiCepat langsung ke Database
                </span>
              </div>
            </button>

            <div className="scanner-card-header">
              <div className="scanner-label">
                <Barcode size={16} />
                <span>Atau gunakan scanner USB / ketik nomor resi:</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="scanner-input-group">
              <input
                ref={inputRef}
                type="text"
                className="scanner-input"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="Scanner USB / ketik resi..."
                autoFocus
              />
              <button type="submit" className="btn-primary">
                Input
              </button>
            </form>
          </div>

          {/* Stats Row per Ekspedisi (Sesuai Struktur Data Asli Laporan) */}
          <div className="stats-grid">
            <div
              className={`stat-card clickable ${activeCourierFilter === "ALL" ? "stat-active" : ""}`}
              onClick={() => setActiveCourierFilter("ALL")}
              style={{ cursor: "pointer" }}
              title="Klik untuk tampilkan Semua Data Scan"
            >
              <span className="stat-label">Total Semua Scan</span>
              <span className="stat-value">{totalScans}</span>
            </div>

            <div
              className={`stat-card clickable ${activeCourierFilter === "JNT" ? "stat-active" : ""}`}
              onClick={() => setActiveCourierFilter(activeCourierFilter === "JNT" ? "ALL" : "JNT")}
              style={{ cursor: "pointer", borderLeft: "3px solid #dc2626" }}
              title="Klik untuk filter khusus J&T Express (JNT)"
            >
              <span className="stat-label" style={{ color: "#dc2626", fontWeight: 600 }}>J&T Express (JNT)</span>
              <span className="stat-value">{jntScansCount}</span>
            </div>

            <div
              className={`stat-card clickable ${activeCourierFilter === "SICEPAT" ? "stat-active" : ""}`}
              onClick={() => setActiveCourierFilter(activeCourierFilter === "SICEPAT" ? "ALL" : "SICEPAT")}
              style={{ cursor: "pointer", borderLeft: "3px solid #2563eb" }}
              title="Klik untuk filter khusus SiCepat Ekspres"
            >
              <span className="stat-label" style={{ color: "#2563eb", fontWeight: 600 }}>SiCepat Ekspres</span>
              <span className="stat-value">{sicepatScansCount}</span>
            </div>

            <div
              className={`stat-card clickable ${activeCourierFilter === "OTHER" ? "stat-active" : ""}`}
              onClick={() => setActiveCourierFilter(activeCourierFilter === "OTHER" ? "ALL" : "OTHER")}
              style={{ cursor: "pointer", borderLeft: "3px solid #71717a" }}
              title="Klik untuk filter Ekspedisi Lain"
            >
              <span className="stat-label">Ekspedisi Lain</span>
              <span className="stat-value">{otherScansCount}</span>
            </div>

            <div
              className={`stat-card clickable ${activeCourierFilter === "DUPLICATE" ? "stat-active" : ""}`}
              onClick={() => setActiveCourierFilter(activeCourierFilter === "DUPLICATE" ? "ALL" : "DUPLICATE")}
              style={{ cursor: "pointer", borderLeft: duplicateScans > 0 ? "3px solid #e11d48" : "3px solid #d4d4d8" }}
              title="Klik untuk filter Scan Duplikat"
            >
              <span className="stat-label">Duplikat Terdeteksi</span>
              <span className="stat-value" style={{ color: duplicateScans > 0 ? "#e11d48" : "inherit" }}>
                {duplicateScans}
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
              <div>
                <h2 className="history-title">
                  Riwayat Terakhir ({filteredScans.length})
                </h2>
                {activeCourierFilter !== "ALL" && (
                  <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                    Filter: <strong>{activeCourierFilter === "JNT" ? "J&T Express" : activeCourierFilter === "SICEPAT" ? "SiCepat" : activeCourierFilter === "OTHER" ? "Ekspedisi Lain" : "Duplikat"}</strong> •{" "}
                    <button
                      type="button"
                      onClick={() => setActiveCourierFilter("ALL")}
                      style={{ background: "none", border: "none", color: "#4f46e5", cursor: "pointer", padding: 0, textDecoration: "underline", fontSize: "12px" }}
                    >
                      Reset Filter
                    </button>
                  </div>
                )}
              </div>

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

            {/* Quick Filter Buttons Sesuai Ekspedisi */}
            <div className="db-filter-tabs" style={{ padding: "0 0 16px 0", borderBottom: "1px solid var(--border-main)", marginBottom: "16px" }}>
              <button
                className={`filter-tab ${activeCourierFilter === "ALL" ? "active" : ""}`}
                onClick={() => setActiveCourierFilter("ALL")}
              >
                Semua ({totalScans})
              </button>
              <button
                className={`filter-tab ${activeCourierFilter === "JNT" ? "active" : ""}`}
                onClick={() => setActiveCourierFilter("JNT")}
              >
                J&T Express ({jntScansCount})
              </button>
              <button
                className={`filter-tab ${activeCourierFilter === "SICEPAT" ? "active" : ""}`}
                onClick={() => setActiveCourierFilter("SICEPAT")}
              >
                SiCepat ({sicepatScansCount})
              </button>
              <button
                className={`filter-tab ${activeCourierFilter === "OTHER" ? "active" : ""}`}
                onClick={() => setActiveCourierFilter("OTHER")}
              >
                Lainnya ({otherScansCount})
              </button>
              <button
                className={`filter-tab ${activeCourierFilter === "DUPLICATE" ? "active" : ""}`}
                onClick={() => setActiveCourierFilter("DUPLICATE")}
              >
                Duplikat ({duplicateScans})
              </button>
            </div>

            {filteredScans.length === 0 ? (
              <div className="empty-state">
                <p>Belum ada data scan yang cocok.</p>
                <span>Coba ganti filter ekspedisi atau kata kunci pencarian resi.</span>
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
                    {filteredScans.slice(0, 15).map((scan, idx) => (
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
                            <span className="badge-status-duplikat">
                              Duplikat
                            </span>
                          ) : (
                            <span className="badge-status-asli">Asli</span>
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
          onRefresh={async () => {
            showToast("Memuat ulang data dari database Supabase...");
            await loadDatabaseFromSupabase();
            showToast("✓ Data berhasil disinkronkan dengan database Supabase!");
          }}
          onExportExcel={handleExportExcel}
          onCopy={handleCopy}
          copiedId={copiedId}
        />
      )}

      {/* PAGE 3: RETURN HUB (TIKTOK SHOP RETURNS) */}
      {activeTab === "RETURNS" && (
        <ReturnHubPage soundEnabled={soundEnabled} />
      )}

      {/* PAGE 4: MANAJEMEN STOK MASUK */}
      {activeTab === "STOCK_IN" && (
        <StockInPage
          stockInItems={stockInItems}
          stockOutItems={stockOutItems}
          onAddStockIn={handleAddStockIn}
          onUpdateStockIn={handleUpdateStockIn}
          onDeleteStockIn={handleDeleteStockIn}
        />
      )}

      {/* PAGE 5: MANAJEMEN STOK KELUAR */}
      {activeTab === "STOCK_OUT" && (
        <StockOutPage
          stockInItems={stockInItems}
          stockOutItems={stockOutItems}
          onAddStockOut={handleAddStockOut}
          onDeleteStockOut={handleDeleteStockOut}
          currentUser={currentUser}
        />
      )}

      {/* Modal Pemindai Kamera Barcode & QR Code HP */}
      <CameraBarcodeScanner
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        onScanSuccess={(code) => processScan(code)}
        existingScans={scans}
        title="Pemindai Kamera HP - Live"
        subtitle="Arahkan kamera HP ke Barcode Garis atau QR Code resi paket"
      />

      {/* Pop-up Dialog Interaksi Pengguna untuk Mengaktifkan Suara HP & Kamera */}
      {showAudioPrompt && (
        <div className="audio-prompt-overlay" onClick={() => setShowAudioPrompt(false)}>
          <div className="audio-prompt-card" onClick={(e) => e.stopPropagation()}>
            <div className="audio-prompt-icon">
              <Volume2 size={30} />
            </div>
            <h3 className="audio-prompt-title">Aktifkan Pemindai & Audio HP</h3>
            <p className="audio-prompt-desc">
              Browser HP (Safari & Chrome) membutuhkan 1x sentuhan agar suara kurir & scan otomatis berbunyi secara lancar.
            </p>
            <div className="audio-prompt-actions">
              <button
                type="button"
                className="btn-audio-start"
                onClick={() => {
                  unlockAudio();
                  playSuccessBeep();
                  setShowAudioPrompt(false);
                  setIsCameraScannerOpen(true);
                }}
              >
                <Sparkles size={18} />
                <span>Mulai Scan & Aktifkan Audio</span>
              </button>
              <button
                type="button"
                className="btn-audio-cancel"
                onClick={() => setShowAudioPrompt(false)}
              >
                Batal
              </button>
            </div>
          </div>
        </div>
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
