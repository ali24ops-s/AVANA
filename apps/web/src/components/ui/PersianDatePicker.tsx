import { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from "lucide-react";
import { toPersianDigits } from "@avana/domain";
import {
  PERSIAN_MONTH_NAMES,
  PERSIAN_WEEKDAY_NAMES_SHORT,
  gregorianToJalali,
  jalaliToGregorian,
  getJalaliMonthDays,
  getJalaliFirstDayOfWeek,
  formatPersianExamDate,
  type JalaliDateParts,
} from "../../utils/date.js";

export interface PersianDatePickerProps {
  id?: string;
  value?: string; // ISO date string e.g. "2026-09-15" or "2026-09-15T10:00:00.000Z"
  onChange: (isoString: string) => void;
  minDate?: Date | string; // Defaults to current date (today)
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function PersianDatePicker({
  id = "exam-date-input",
  value,
  onChange,
  minDate = new Date(),
  label,
  required = false,
  disabled = false,
  className = "",
  placeholder = "انتخاب تاریخ شمسی...",
}: PersianDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({
    position: "fixed",
    zIndex: 99999,
  });

  // Parse minDate into Jalali parts
  const minJalali = gregorianToJalali(minDate);

  // Today in Jalali
  const todayJalali = gregorianToJalali(new Date());

  // Currently selected Jalali date
  const selectedJalali: JalaliDateParts | null = value ? gregorianToJalali(value) : null;

  // Viewing month and year in the calendar
  const [viewYear, setViewYear] = useState<number>(() => {
    return selectedJalali ? selectedJalali.jy : todayJalali.jy;
  });

  const [viewMonth, setViewMonth] = useState<number>(() => {
    return selectedJalali ? selectedJalali.jm : todayJalali.jm;
  });

  // Sync view when selected value changes from props
  useEffect(() => {
    if (value) {
      const j = gregorianToJalali(value);
      setViewYear(j.jy);
      setViewMonth(j.jm);
    }
  }, [value]);

  // Dynamic Viewport-Aware Positioning Calculation (breaking out of any overflow/stacking context)
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const triggerRect = triggerRef.current.getBoundingClientRect();
    const popupWidth = popupRef.current?.offsetWidth || 320;
    const popupHeight = popupRef.current?.offsetHeight || 360;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1024;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 768;

    // Vertical positioning: default below trigger, flip above if not enough space below
    let top = triggerRect.bottom + 6;
    if (top + popupHeight > viewportHeight - 16 && triggerRect.top - popupHeight - 6 > 16) {
      top = triggerRect.top - popupHeight - 6;
    } else if (top + popupHeight > viewportHeight - 8) {
      top = Math.max(16, viewportHeight - popupHeight - 16);
    }

    // Horizontal positioning (RTL): align with right edge of trigger
    let right = viewportWidth - triggerRect.right;
    let left = triggerRect.right - popupWidth;

    // Prevent overflowing left screen edge
    if (left < 16) {
      left = 16;
      right = Math.max(16, viewportWidth - left - popupWidth);
    }
    // Prevent overflowing right screen edge
    if (right < 16) {
      right = 16;
    }

    setPopupStyle({
      position: "fixed",
      top: `${Math.round(top)}px`,
      right: `${Math.round(right)}px`,
      width: "320px",
      maxWidth: "calc(100vw - 32px)",
      zIndex: 99999,
    });
  }, []);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
    }
  }, [isOpen, updatePosition, viewMonth, viewYear]);

  // Update position on window resize or scroll
  useEffect(() => {
    if (!isOpen) return;
    const handleScrollOrResize = () => {
      updatePosition();
    };
    window.addEventListener("resize", handleScrollOrResize);
    window.addEventListener("scroll", handleScrollOrResize, true);
    return () => {
      window.removeEventListener("resize", handleScrollOrResize);
      window.removeEventListener("scroll", handleScrollOrResize, true);
    };
  }, [isOpen, updatePosition]);

  // Click outside & Escape key listeners
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      const clickedTrigger = triggerRef.current?.contains(target);
      const clickedPopup = popupRef.current?.contains(target);
      if (!clickedTrigger && !clickedPopup) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Month navigation
  const handlePrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Check if a specific day is disabled (before minDate)
  const isDayDisabled = (d: number): boolean => {
    if (viewYear < minJalali.jy) return true;
    if (viewYear === minJalali.jy && viewMonth < minJalali.jm) return true;
    if (viewYear === minJalali.jy && viewMonth === minJalali.jm && d < minJalali.jd) return true;
    return false;
  };

  // Check if day is today
  const isDayToday = (d: number): boolean => {
    return viewYear === todayJalali.jy && viewMonth === todayJalali.jm && d === todayJalali.jd;
  };

  // Check if day is currently selected
  const isDaySelected = (d: number): boolean => {
    if (!selectedJalali) return false;
    return (
      viewYear === selectedJalali.jy &&
      viewMonth === selectedJalali.jm &&
      d === selectedJalali.jd
    );
  };

  // Select a day
  const handleSelectDay = (d: number) => {
    if (isDayDisabled(d)) return;

    const gDate = jalaliToGregorian(viewYear, viewMonth, d);
    const yyyy = gDate.getFullYear();
    const mm = String(gDate.getMonth() + 1).padStart(2, "0");
    const dd = String(gDate.getDate()).padStart(2, "0");
    const isoString = `${yyyy}-${mm}-${dd}`;

    onChange(isoString);
    setIsOpen(false);
  };

  // Quick select today
  const handleSelectToday = () => {
    if (isDayDisabled(todayJalali.jd)) return;
    setViewYear(todayJalali.jy);
    setViewMonth(todayJalali.jm);
    handleSelectDay(todayJalali.jd);
  };

  // Month days & weekday offset
  const daysInMonth = getJalaliMonthDays(viewYear, viewMonth);
  const firstDayOfWeek = getJalaliFirstDayOfWeek(viewYear, viewMonth);

  // Generate array of selectable years (e.g. todayJalali.jy - 1 to todayJalali.jy + 5)
  const availableYears = Array.from({ length: 8 }, (_, i) => todayJalali.jy - 1 + i);

  // Formatted display text for trigger button
  const formattedDisplay = value ? formatPersianExamDate(value) : "";

  // Calendar Popup Content
  const popupContent = isOpen ? (
    <div
      ref={popupRef}
      role="dialog"
      aria-label="تقویم انتخاب تاریخ شمسی"
      style={popupStyle}
      dir="rtl"
      className="bg-slate-900/98 backdrop-blur-2xl border border-white/20 rounded-2xl shadow-2xl p-4 animate-in fade-in zoom-in-95 duration-150 text-slate-200 select-none ring-1 ring-white/10"
    >
      {/* Calendar Header with Navigation and Selects */}
      <div className="flex items-center justify-between gap-1 pb-3 mb-3 border-b border-white/10">
        {/* Next Month (in RTL, next month is on the left) */}
        <button
          type="button"
          onClick={handleNextMonth}
          aria-label="ماه بعد"
          className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {/* Month & Year Selects */}
        <div className="flex items-center gap-1.5 flex-1 justify-center">
          {/* Month Select */}
          <select
            value={viewMonth}
            aria-label="انتخاب ماه"
            onChange={(e) => setViewMonth(Number(e.target.value))}
            className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-xs font-semibold text-white focus:outline-none focus:border-teal-500 cursor-pointer"
          >
            {PERSIAN_MONTH_NAMES.map((name, idx) => (
              <option key={name} value={idx + 1}>
                {name}
              </option>
            ))}
          </select>

          {/* Year Select */}
          <select
            value={viewYear}
            aria-label="انتخاب سال"
            onChange={(e) => setViewYear(Number(e.target.value))}
            className="bg-slate-800 border border-white/10 rounded-lg px-2 py-1 text-xs font-semibold text-white focus:outline-none focus:border-teal-500 cursor-pointer"
          >
            {availableYears.map((yr) => (
              <option key={yr} value={yr}>
                {toPersianDigits(yr)}
              </option>
            ))}
          </select>
        </div>

        {/* Prev Month (in RTL, prev month is on the right) */}
        <button
          type="button"
          onClick={handlePrevMonth}
          aria-label="ماه قبل"
          className="p-1.5 rounded-lg hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 gap-1 text-center mb-1.5">
        {PERSIAN_WEEKDAY_NAMES_SHORT.map((dayName, idx) => (
          <span
            key={dayName}
            className={`text-[11px] font-semibold py-1 ${
              idx === 6 ? "text-rose-400/90" : "text-slate-400"
            }`}
          >
            {dayName}
          </span>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1 text-center">
        {/* Empty slots before first day */}
        {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
          <div key={`empty-${idx}`} className="h-8" />
        ))}

        {/* Days in Month */}
        {Array.from({ length: daysInMonth }).map((_, idx) => {
          const dayNumber = idx + 1;
          const disabled = isDayDisabled(dayNumber);
          const selected = isDaySelected(dayNumber);
          const today = isDayToday(dayNumber);

          return (
            <button
              key={dayNumber}
              type="button"
              disabled={disabled}
              onClick={() => handleSelectDay(dayNumber)}
              aria-label={`${toPersianDigits(dayNumber)} ${PERSIAN_MONTH_NAMES[viewMonth - 1]} ${toPersianDigits(viewYear)}`}
              className={`h-8 rounded-lg text-xs font-semibold flex items-center justify-center transition-all ${
                selected
                  ? "bg-teal-600 text-white font-bold shadow-md shadow-teal-900/60 ring-2 ring-teal-400/40"
                  : disabled
                    ? "text-slate-600 opacity-40 cursor-not-allowed"
                    : today
                      ? "bg-teal-500/15 text-teal-300 border border-teal-500/40 hover:bg-teal-500/25 cursor-pointer"
                      : "text-slate-200 hover:bg-white/10 hover:text-white cursor-pointer"
              }`}
            >
              {toPersianDigits(dayNumber)}
            </button>
          );
        })}
      </div>

      {/* Footer with Today / Quick action */}
      <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between text-xs">
        <button
          type="button"
          onClick={handleSelectToday}
          disabled={isDayDisabled(todayJalali.jd)}
          className="text-teal-400 hover:text-teal-300 font-bold px-2 py-1 rounded-lg hover:bg-teal-500/10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        >
          انتخاب امروز ({toPersianDigits(todayJalali.jd)} {PERSIAN_MONTH_NAMES[todayJalali.jm - 1]})
        </button>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          aria-label="بستن تقویم"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className={`relative ${className}`} ref={containerRef} dir="rtl">
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-semibold text-slate-300 mb-1.5 text-right"
        >
          {label}
          {required && <span className="text-rose-400 mr-1">*</span>}
        </label>
      )}

      {/* Trigger Button / Input */}
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-label={label || "تاریخ برگزاری امتحان"}
        aria-expanded={isOpen}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`w-full bg-slate-800/90 hover:bg-slate-800 border ${
          isOpen ? "border-teal-500 ring-2 ring-teal-500/20" : "border-white/15"
        } rounded-xl px-3.5 py-2.5 text-xs md:text-sm text-right flex items-center justify-between transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <CalendarIcon className="w-4 h-4 text-teal-400 shrink-0" />
          {formattedDisplay ? (
            <span className="text-white font-medium truncate">{formattedDisplay}</span>
          ) : (
            <span className="text-slate-400">{placeholder}</span>
          )}
        </div>
        {value && (
          <span className="text-[10px] text-teal-300/80 bg-teal-500/10 border border-teal-500/20 px-2 py-0.5 rounded-full shrink-0 font-medium">
            شمسی
          </span>
        )}
      </button>

      {/* Render Popup via React Portal directly into document.body */}
      {typeof document !== "undefined" && popupContent
        ? createPortal(popupContent, document.body)
        : null}
    </div>
  );
}
