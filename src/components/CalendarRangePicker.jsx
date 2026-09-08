import React, { useState, useRef, useEffect } from "react";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Check } from "lucide-react";

export default function CalendarRangePicker({
  startDate,
  endDate,
  onChange,
  onReset
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoverDate, setHoverDate] = useState(null);
  const [viewDate, setViewDate] = useState(() => {
    if (startDate) {
      const [y, m] = startDate.split("-");
      return new Date(parseInt(y), parseInt(m) - 1, 1);
    }
    return new Date();
  });

  const popoverRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const monthNames = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const dayLabels = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();

  const prevMonth = () => {
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(currentYear, currentMonth, 1).getDay();

  const formatDateYMD = (year, month, day) => {
    const y = year;
    const m = String(month + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const handleDateClick = (ymd) => {
    if (!startDate || (startDate && endDate)) {
      // Set new start date
      onChange(ymd, "");
    } else if (startDate && !endDate) {
      if (ymd < startDate) {
        // Klik tanggal sebelum startDate -> jadikan startDate baru
        onChange(ymd, "");
      } else {
        // Set end date
        onChange(startDate, ymd);
      }
    }
  };

  // Presets
  const getTodayYMD = () => {
    const now = new Date();
    return formatDateYMD(now.getFullYear(), now.getMonth(), now.getDate());
  };

  const getDaysAgoYMD = (days) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return formatDateYMD(d.getFullYear(), d.getMonth(), d.getDate());
  };

  const getMonthStartYMD = () => {
    const now = new Date();
    return formatDateYMD(now.getFullYear(), now.getMonth(), 1);
  };

  const setPreset = (start, end) => {
    onChange(start, end);
    if (start) {
      const [y, m] = start.split("-");
      setViewDate(new Date(parseInt(y), parseInt(m) - 1, 1));
    }
  };

  const formatDisplayRange = () => {
    if (!startDate && !endDate) {
      return "Pilih Rentang Tanggal";
    }
    const formatShort = (ymd) => {
      if (!ymd) return "";
      const [y, m, d] = ymd.split("-");
      return `${parseInt(d)} ${monthNames[parseInt(m) - 1].slice(0, 3)} ${y}`;
    };

    if (startDate && endDate) {
      if (startDate === endDate) return formatShort(startDate);
      return `${formatShort(startDate)} — ${formatShort(endDate)}`;
    }
    if (startDate) return `Mulai: ${formatShort(startDate)}`;
    return `Sampai: ${formatShort(endDate)}`;
  };

  // Status visual sebuah tanggal
  const getDateStatus = (ymd) => {
    const activeEnd = endDate || (startDate && hoverDate && hoverDate >= startDate ? hoverDate : null);

    if (startDate && ymd === startDate && (!activeEnd || activeEnd === startDate)) {
      return "single";
    }
    if (startDate && ymd === startDate) {
      return "start";
    }
    if (activeEnd && ymd === activeEnd) {
      return "end";
    }
    if (startDate && activeEnd && ymd > startDate && ymd < activeEnd) {
      return "between";
    }
    return "normal";
  };

  return (
    <div className="range-picker-root" ref={popoverRef}>
      {/* Trigger Button */}
      <div className="range-picker-trigger" onClick={() => setIsOpen(!isOpen)}>
        <CalendarIcon size={14} className="trigger-cal-icon" />
        <span className={`trigger-text ${startDate || endDate ? "selected" : ""}`}>
          {formatDisplayRange()}
        </span>
        {(startDate || endDate) && (
          <button
            type="button"
            className="trigger-clear-btn"
            onClick={(e) => {
              e.stopPropagation();
              onReset();
            }}
            title="Hapus filter rentang"
          >
            <X size={13} />
          </button>
        )}
      </div>

      {/* Popover Calendar */}
      {isOpen && (
        <div className="range-picker-popover">
          {/* Quick Presets Bar */}
          <div className="popover-presets">
            <button
              type="button"
              className={`preset-pill ${startDate === getTodayYMD() && endDate === getTodayYMD() ? "active" : ""}`}
              onClick={() => setPreset(getTodayYMD(), getTodayYMD())}
            >
              Hari Ini
            </button>
            <button
              type="button"
              className={`preset-pill ${startDate === getDaysAgoYMD(6) && endDate === getTodayYMD() ? "active" : ""}`}
              onClick={() => setPreset(getDaysAgoYMD(6), getTodayYMD())}
            >
              7 Hari Terakhir
            </button>
            <button
              type="button"
              className={`preset-pill ${startDate === getMonthStartYMD() && endDate === getTodayYMD() ? "active" : ""}`}
              onClick={() => setPreset(getMonthStartYMD(), getTodayYMD())}
            >
              Bulan Ini
            </button>
            <button
              type="button"
              className="preset-pill reset-pill"
              onClick={() => {
                onReset();
              }}
            >
              Semua
            </button>
          </div>

          {/* Month Header Navigation */}
          <div className="popover-month-nav">
            <button type="button" className="nav-arrow" onClick={prevMonth}>
              <ChevronLeft size={16} />
            </button>
            <div className="month-year-label">
              {monthNames[currentMonth]} {currentYear}
            </div>
            <button type="button" className="nav-arrow" onClick={nextMonth}>
              <ChevronRight size={16} />
            </button>
          </div>

          {/* Day Names Row */}
          <div className="popover-weekdays">
            {dayLabels.map((lbl, idx) => (
              <span key={idx} className="weekday-col">
                {lbl}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div
            className="popover-days-grid"
            onMouseLeave={() => {
              if (startDate && !endDate) {
                setHoverDate(null);
              }
            }}
          >
            {/* Empty slots before first day */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="day-cell-empty" />
            ))}

            {/* Days in Month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const ymd = formatDateYMD(currentYear, currentMonth, day);
              const status = getDateStatus(ymd);
              const dayOfWeek = new Date(currentYear, currentMonth, day).getDay();

              return (
                <div
                  key={ymd}
                  className={`day-cell-wrap ${status} dow-${dayOfWeek}`}
                  onClick={() => handleDateClick(ymd)}
                  onMouseEnter={() => {
                    if (startDate && !endDate) {
                      setHoverDate(ymd);
                    }
                  }}
                >
                  <button type="button" className={`day-number-btn ${status}`}>
                    {day}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Popover Footer Info */}
          <div className="popover-footer">
            <span className="footer-status-text">
              {startDate && !endDate
                ? "Pilih tanggal akhir rentang..."
                : startDate && endDate
                ? `${formatDisplayRange()}`
                : "Klik tanggal mulai"}
            </span>
            <button
              type="button"
              className="btn-apply-range"
              onClick={() => setIsOpen(false)}
            >
              <Check size={13} />
              Selesai
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
