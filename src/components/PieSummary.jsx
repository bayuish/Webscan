import React from "react";

function isScanToday(s) {
  if (!s) return false;
  
  // 1. Cek dari epoch timestamp di ID
  if (s.id && /^\d{12,14}/.test(s.id)) {
    const epoch = parseInt(s.id.match(/^(\d{12,14})/)[1]);
    const d = new Date(epoch);
    const now = new Date();
    if (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    ) {
      return true;
    }
  }

  // 2. Cek dari fullDate (misal "9/9/2026, 01.27.18" atau "09/09/2026")
  if (s.fullDate) {
    const match = s.fullDate.match(/(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (match) {
      const d1 = parseInt(match[1]);
      const d2 = parseInt(match[2]);
      const y = parseInt(match[3]);
      const now = new Date();
      if (y === now.getFullYear() && (d1 === now.getDate() || d2 === now.getDate())) {
        return true;
      }
    }
  }

  // 3. Fallback jika tidak ada tanggal khusus
  return true;
}

export default function PieSummary({ scans = [] }) {
  const todayScans = scans.filter(isScanToday);
  const totalToday = todayScans.length;

  let jntCount = 0;
  let sicepatCount = 0;
  let otherCount = 0;

  todayScans.forEach((s) => {
    const tag = (s.courier?.tag || s.courier?.name || "").toUpperCase();
    if (tag.includes("J&T") || tag.includes("JNT")) {
      jntCount++;
    } else if (tag.includes("SICEPAT")) {
      sicepatCount++;
    } else {
      otherCount++;
    }
  });

  const jntPct = totalToday > 0 ? ((jntCount / totalToday) * 100).toFixed(1) : 0;
  const sicepatPct = totalToday > 0 ? ((sicepatCount / totalToday) * 100).toFixed(1) : 0;
  const otherPct = totalToday > 0 ? ((otherCount / totalToday) * 100).toFixed(1) : 0;

  // Donut SVG Parameters
  const radius = 56;
  const circumference = 2 * Math.PI * radius; // ~351.86
  const strokeWidth = 16;

  const jntLen = totalToday > 0 ? (jntCount / totalToday) * circumference : 0;
  const sicepatLen = totalToday > 0 ? (sicepatCount / totalToday) * circumference : 0;
  const otherLen = totalToday > 0 ? (otherCount / totalToday) * circumference : 0;

  const jntOffset = 0;
  const sicepatOffset = -jntLen;
  const otherOffset = -(jntLen + sicepatLen);

  const todayFormatted = new Date().toLocaleDateString("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  return (
    <div className="pie-summary-card">
      <div className="pie-summary-header">
        <div>
          <h3 className="pie-summary-title">Ringkasan Pemindaian Hari Ini</h3>
          <p className="pie-summary-subtitle">{todayFormatted}</p>
        </div>
        <div className="pie-total-badge">
          <span>Total Hari Ini: <strong>{totalToday} Paket</strong></span>
        </div>
      </div>

      <div className="pie-summary-body">
        {/* SVG Donut Chart */}
        <div className="pie-chart-container">
          <svg className="pie-svg" viewBox="0 0 160 160" width="160" height="160">
            {/* Background Circle */}
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="transparent"
              stroke="#f4f4f5"
              strokeWidth={strokeWidth}
            />

            {totalToday === 0 ? (
              <circle
                cx="80"
                cy="80"
                r={radius}
                fill="transparent"
                stroke="#e4e4e7"
                strokeWidth={strokeWidth}
                strokeDasharray="4 4"
              />
            ) : (
              <g transform="rotate(-90 80 80)">
                {/* JNT Slice - Merah #dc2626 */}
                {jntCount > 0 && (
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="transparent"
                    stroke="#dc2626"
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${jntLen} ${circumference}`}
                    strokeDashoffset={jntOffset}
                    strokeLinecap="butt"
                    style={{ transition: "stroke-dasharray 0.5s ease" }}
                  />
                )}

                {/* SiCepat Slice - Biru #2563eb */}
                {sicepatCount > 0 && (
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="transparent"
                    stroke="#2563eb"
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${sicepatLen} ${circumference}`}
                    strokeDashoffset={sicepatOffset}
                    strokeLinecap="butt"
                    style={{ transition: "stroke-dasharray 0.5s ease" }}
                  />
                )}

                {/* Ekspedisi Lain - Abu-abu Muda #d4d4d8 */}
                {otherCount > 0 && (
                  <circle
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="transparent"
                    stroke="#d4d4d8"
                    strokeWidth={strokeWidth}
                    strokeDasharray={`${otherLen} ${circumference}`}
                    strokeDashoffset={otherOffset}
                    strokeLinecap="butt"
                    style={{ transition: "stroke-dasharray 0.5s ease" }}
                  />
                )}
              </g>
            )}

            {/* Center Label */}
            <text x="80" y="74" textAnchor="middle" className="pie-center-value">
              {totalToday}
            </text>
            <text x="80" y="92" textAnchor="middle" className="pie-center-label">
              TOTAL RESI
            </text>
          </svg>
        </div>

        {/* Legend Breakdown List */}
        <div className="pie-legend-list">
          {/* Row JNT */}
          <div className="pie-legend-item">
            <div className="pie-legend-left">
              <span className="pie-color-dot dot-jnt"></span>
              <div>
                <div className="pie-legend-name">J&T Express (JNT)</div>
                <div className="pie-legend-bar-wrap">
                  <div className="pie-legend-bar bar-jnt" style={{ width: `${jntPct}%` }}></div>
                </div>
              </div>
            </div>
            <div className="pie-legend-right">
              <div className="pie-legend-count">{jntCount} resi</div>
              <div className="pie-legend-pct">{jntPct}%</div>
            </div>
          </div>

          {/* Row SiCepat */}
          <div className="pie-legend-item">
            <div className="pie-legend-left">
              <span className="pie-color-dot dot-sicepat"></span>
              <div>
                <div className="pie-legend-name">SiCepat Ekspres</div>
                <div className="pie-legend-bar-wrap">
                  <div className="pie-legend-bar bar-sicepat" style={{ width: `${sicepatPct}%` }}></div>
                </div>
              </div>
            </div>
            <div className="pie-legend-right">
              <div className="pie-legend-count">{sicepatCount} resi</div>
              <div className="pie-legend-pct">{sicepatPct}%</div>
            </div>
          </div>

          {/* Row Lainnya (hanya jika ada) */}
          {otherCount > 0 && (
            <div className="pie-legend-item">
              <div className="pie-legend-left">
                <span className="pie-color-dot dot-other"></span>
                <div>
                  <div className="pie-legend-name">Ekspedisi Lain</div>
                  <div className="pie-legend-bar-wrap">
                    <div className="pie-legend-bar bar-other" style={{ width: `${otherPct}%` }}></div>
                  </div>
                </div>
              </div>
              <div className="pie-legend-right">
                <div className="pie-legend-count">{otherCount} resi</div>
                <div className="pie-legend-pct">{otherPct}%</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
