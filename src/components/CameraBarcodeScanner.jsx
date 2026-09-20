import React, { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import {
  Camera,
  X,
  Zap,
  ZapOff,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  VolumeX,
  Layers,
  Sparkles
} from "lucide-react";
import { cleanTrackingCode, detectCourier } from "../utils/courier.js";

export default function CameraBarcodeScanner({
  isOpen,
  onClose,
  onScanSuccess,
  title = "Pemindai Kamera HP",
  subtitle = "Arahkan kamera ke Barcode Garis atau QR Code resi paket"
}) {
  const [scannerActive, setScannerActive] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [lastScanned, setLastScanned] = useState(null);
  const [scanCount, setScanCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [continuousMode, setContinuousMode] = useState(true);

  const scannerRef = useRef(null);
  const readerElementId = "camera-scanner-viewport";
  const lastScannedCodeRef = useRef("");
  const lastScanTimestampRef = useRef(0);

  // Simpan callbacks & props dalam ref agar stabil dan tidak memicu re-render / re-start scanner
  const onScanSuccessRef = useRef(onScanSuccess);
  onScanSuccessRef.current = onScanSuccess;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const continuousModeRef = useRef(continuousMode);
  continuousModeRef.current = continuousMode;

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (e) {
        console.warn("Gagal stop scanner:", e);
      }
      scannerRef.current = null;
    }
    setScannerActive(false);
    setTorchOn(false);
  }, []);

  const handleScanDecoded = useCallback((decodedText) => {
    if (!decodedText) return;

    const cleaned = cleanTrackingCode(decodedText);
    if (!cleaned || cleaned.length < 5) return;

    const now = Date.now();
    // Debounce: jika resi yang sama discan dalam waktu kurang dari 2.5 detik, abaikan agar tidak spam
    if (
      cleaned.toUpperCase() === lastScannedCodeRef.current.toUpperCase() &&
      now - lastScanTimestampRef.current < 2500
    ) {
      return;
    }

    lastScannedCodeRef.current = cleaned;
    lastScanTimestampRef.current = now;

    const courierInfo = detectCourier(cleaned);
    const timeStr = new Date()
      .toLocaleTimeString("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })
      .replace(/\./g, ":");

    // Perbarui scanCount dan spotlight kartu hasil scan
    setScanCount((prev) => {
      const nextCount = prev + 1;
      setLastScanned({
        code: cleaned,
        courier: courierInfo,
        time: timeStr,
        count: nextCount
      });
      return nextCount;
    });

    // Trigger haptic feedback jika HP mendukung vibration
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate([60, 40, 60]);
    }

    // Panggil callback parent (otomatis masuk database Supabase)
    if (onScanSuccessRef.current) {
      onScanSuccessRef.current(cleaned);
    }

    // Jika bukan mode continuous, tutup scanner setelah 1x scan
    if (!continuousModeRef.current) {
      setTimeout(() => {
        if (onCloseRef.current) {
          onCloseRef.current();
        }
      }, 800);
    }
  }, []);

  const startScanner = useCallback(async () => {
    setErrorMessage("");
    try {
      if (scannerRef.current) {
        await stopScanner();
      }

      const html5QrCode = new Html5Qrcode(readerElementId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF
        ],
        verbose: false
      });
      scannerRef.current = html5QrCode;

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth, viewfinderHeight) => {
          // Area scan persegi panjang horizontal (sangat ideal untuk barcode panjang dan QR code)
          const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
          const qrboxWidth = Math.floor(viewfinderWidth * 0.88);
          const qrboxHeight = Math.floor(Math.min(viewfinderHeight * 0.55, 260));
          return { width: qrboxWidth, height: qrboxHeight };
        },
        aspectRatio: 1.0,
        experimentalFeatures: {
          useBarCodeDetectorIfSupported: true
        }
      };

      await html5QrCode.start(
        { facingMode: "environment" },
        config,
        (decodedText) => handleScanDecoded(decodedText),
        () => {
          // ignore frame decode failures
        }
      );

      setScannerActive(true);

      // Cek apakah kamera mendukung fitur torch (lampu kilat)
      try {
        const capabilities = html5QrCode.getRunningTrackCapabilities();
        if (capabilities && capabilities.torch) {
          setHasTorch(true);
        }
      } catch {
        setHasTorch(false);
      }
    } catch (err) {
      console.error("Gagal start camera scanner:", err);
      setErrorMessage(
        "Kamera tidak dapat diakses. Pastikan Anda telah memberikan izin (permission) kamera pada browser HP Anda."
      );
      setScannerActive(false);
    }
  }, [handleScanDecoded, stopScanner]);

  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextTorch = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch }]
      });
      setTorchOn(nextTorch);
    } catch (e) {
      console.warn("Gagal toggle torch:", e);
    }
  };

  useEffect(() => {
    let timer;
    if (isOpen) {
      setLastScanned(null);
      setScanCount(0);
      lastScannedCodeRef.current = "";
      // Delay sedikit agar DOM element viewport ter-mount sempurna
      timer = setTimeout(() => {
        startScanner();
      }, 250);
    } else {
      stopScanner();
    }

    return () => {
      if (timer) clearTimeout(timer);
      stopScanner();
    };
  }, [isOpen, startScanner, stopScanner]);

  if (!isOpen) return null;

  return (
    <div className="camera-modal-overlay">
      <div className="camera-modal-content">
        {/* Header Modal */}
        <div className="camera-modal-header">
          <div className="camera-header-info">
            <div className="camera-icon-badge">
              <Camera size={18} />
            </div>
            <div>
              <h3 className="camera-modal-title">{title}</h3>
              <p className="camera-modal-sub">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            className="camera-close-btn"
            onClick={onClose}
            aria-label="Tutup Pemindai"
          >
            <X size={20} />
          </button>
        </div>

        {/* Viewport Kamera Live */}
        <div className="camera-viewport-container">
          <div id={readerElementId} className="camera-scanner-view"></div>

          {/* Animasi Garis Laser Pemindai */}
          {scannerActive && (
            <div className="scanner-laser-box">
              <div className="scanner-laser-line"></div>
              <div className="scanner-target-corners"></div>
            </div>
          )}

          {/* Controls di atas kamera: Flash & Mode */}
          <div className="camera-viewport-controls">
            {hasTorch && (
              <button
                type="button"
                className={`cam-ctrl-btn ${torchOn ? "active" : ""}`}
                onClick={toggleTorch}
              >
                {torchOn ? <Zap size={16} /> : <ZapOff size={16} />}
                <span>{torchOn ? "Lampu Nyala" : "Nyalakan Lampu"}</span>
              </button>
            )}

            <button
              type="button"
              className={`cam-ctrl-btn ${continuousMode ? "active" : ""}`}
              onClick={() => setContinuousMode(!continuousMode)}
            >
              <Layers size={15} />
              <span>{continuousMode ? "Mode Beruntun (Aktif)" : "Mode Tunggal"}</span>
            </button>
          </div>
        </div>

        {/* Error State */}
        {errorMessage && (
          <div className="camera-error-banner">
            <AlertTriangle size={18} color="#dc2626" />
            <div>
              <strong>Izin Kamera Ditolak / Tidak Tersedia</strong>
              <p>{errorMessage}</p>
              <button
                type="button"
                className="btn-primary"
                style={{ marginTop: "8px", fontSize: "12px", padding: "6px 12px" }}
                onClick={startScanner}
              >
                Coba Buka Kamera Lagi
              </button>
            </div>
          </div>
        )}

        {/* Status Spotlight Hasil Scan Terakhir */}
        <div className="camera-footer-status">
          {lastScanned ? (
            <div className="camera-last-scan-card">
              <div className="cam-scan-check">
                <CheckCircle2 size={18} color="#16a34a" />
              </div>
              <div className="cam-scan-details">
                <div className="cam-scan-row">
                  <span className="cam-scan-code">{lastScanned.code}</span>
                  <span className="cam-courier-pill">{lastScanned.courier.name}</span>
                </div>
                <div className="cam-scan-meta">
                  Pukul {lastScanned.time} WIB • Otomatis tersimpan ke Cloud
                </div>
              </div>
              <div className="cam-counter-badge">#{lastScanned.count || scanCount}</div>
            </div>
          ) : (
            <div className="camera-guide-box">
              <Sparkles size={16} color="#4f46e5" />
              <span>
                Arahkan barcode / QR code resi ke dalam kotak. Scanner membaca secara instan.
              </span>
            </div>
          )}

          <div className="camera-action-footer">
            <div className="camera-batch-counter">
              Total Scan Sesi Ini: <strong>{scanCount} Resi</strong>
            </div>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Selesai & Tutup
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
