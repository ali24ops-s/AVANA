import { useState, useRef, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  toPersianDigits,
  type ActivityHeatmapSummary,
  type ActivityHeatmapDay,
  type ActivityLevel,
} from "@avana/domain";

export interface StudyActivityHeatmapProps {
  heatmapData?: ActivityHeatmapSummary | null;
  streakStats?: {
    currentStreak: number;
    longestStreak?: number;
    todayIsActive?: boolean;
  } | null;
  isLoading?: boolean;
  className?: string;
}

const LEVEL_COLOR_CLASSES: Record<ActivityLevel, string> = {
  0: "bg-[#EEF1F3]",
  1: "bg-[#C2E5DE]",
  2: "bg-[#70C4B8]",
  3: "bg-[#2A9D8F]",
  4: "bg-[#008080]",
  5: "bg-[#004D40]",
};

const WEEKDAY_ROW_LABELS = [
  { dayIndex: 0, label: "شنبه" },
  { dayIndex: 1, label: "" },
  { dayIndex: 2, label: "دوشنبه" },
  { dayIndex: 3, label: "" },
  { dayIndex: 4, label: "چهارشنبه" },
  { dayIndex: 5, label: "" },
  { dayIndex: 6, label: "جمعه" },
];

export function StudyActivityHeatmap({
  heatmapData,
  isLoading = false,
  className = "",
}: StudyActivityHeatmapProps) {
  const [hoveredDay, setHoveredDay] = useState<{
    day: ActivityHeatmapDay;
    x: number;
    y: number;
  } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Auto scroll to latest weeks (left in RTL) on mount and when data updates
  useEffect(() => {
    const scrollToLatest = () => {
      if (!scrollContainerRef.current) return;
      const container = scrollContainerRef.current;
      // In RTL layout, latest weeks are at the far left edge.
      // Modern browsers use negative scrollLeft values for RTL (0 = far right, -scrollWidth = far left).
      container.scrollLeft = -container.scrollWidth;
      if (container.scrollLeft === 0 && container.scrollWidth > container.clientWidth) {
        // Fallback for browsers/environments that use positive scrollLeft values for RTL
        container.scrollLeft = container.scrollWidth;
      }
    };

    scrollToLatest();
    const frameId = requestAnimationFrame(scrollToLatest);
    return () => cancelAnimationFrame(frameId);
  }, [heatmapData]);

  if (isLoading) {
    return (
      <div
        className={`bg-[var(--color-surface)] p-5 rounded-card border border-[var(--color-border)] shadow-xs flex flex-col justify-center items-center h-full min-h-[170px] ${className}`}
      >
        <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
        <span className="text-xs text-[var(--color-text-muted)]">
          در حال بارگذاری فعالیت مطالعه...
        </span>
      </div>
    );
  }

  const activeDaysThisYear = heatmapData?.activeDaysThisYear ?? 0;
  const currentYear = heatmapData?.currentPersianYear ?? 1405;
  const weeks = heatmapData?.weeks ?? [];
  const monthLabels = heatmapData?.monthLabels ?? [];

  return (
    <div
      className={`bg-[var(--color-surface)] p-5 rounded-card border border-[var(--color-border)] shadow-xs flex flex-col justify-between hover:bg-[var(--color-surface-warm)] transition-colors relative ${className}`}
      dir="rtl"
    >
      {/* 1. Header: Title and Summary */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <h3 className="text-base font-bold text-[var(--color-text)]">
            فعالیت مطالعه
          </h3>
          <span className="text-xs text-[var(--color-text-muted)]">
            {toPersianDigits(activeDaysThisYear)} روز فعالیت در سال جاری (
            {toPersianDigits(currentYear)})
          </span>
        </div>
      </div>

      {/* 2. Calendar Grid with Month Labels */}
      <div
        ref={scrollContainerRef}
        className="w-full overflow-x-auto pb-2 scrollbar-thin"
      >
        <div className="min-w-fit flex flex-col gap-1.5 select-none">
          {/* Month Labels Row */}
          <div className="flex items-center text-[10px] text-[var(--color-text-muted)] h-4 pr-9">
            <div className="flex gap-1">
              {weeks.map((_, weekIdx) => {
                const monthLabel = monthLabels.find(
                  (m) => m.weekIndex === weekIdx,
                );
                return (
                  <div
                    key={`month-col-${weekIdx}`}
                    className="w-3.5 text-right overflow-visible whitespace-nowrap"
                  >
                    {monthLabel ? (
                      <span className="font-medium text-[var(--color-text-secondary)]">
                        {monthLabel.name}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Days Grid: 7 Weekday Rows x Weeks Columns */}
          <div className="flex items-start gap-2">
            {/* Weekday Labels Column */}
            <div className="flex flex-col gap-1 justify-between text-[9px] text-[var(--color-text-muted)] w-7 shrink-0 pt-0.5">
              {WEEKDAY_ROW_LABELS.map((row) => (
                <span
                  key={`label-${row.dayIndex}`}
                  className="h-3.5 flex items-center justify-start leading-none"
                >
                  {row.label}
                </span>
              ))}
            </div>

            {/* Weeks Columns */}
            <div className="flex gap-1 items-center">
              {weeks.map((week, weekIdx) => (
                <div
                  key={`week-${weekIdx}`}
                  className="flex flex-col gap-1 shrink-0"
                >
                  {week.map((day) => {
                    const colorClass = LEVEL_COLOR_CLASSES[day.level];
                    const ariaLabel = `${day.fullFormatted}: ${
                      day.level === 0
                        ? "فعالیتی ثبت نشده"
                        : `${day.formattedDuration} (${toPersianDigits(
                            day.sessionCount,
                          )} جلسه)`
                    }`;

                    return (
                      <button
                        type="button"
                        key={day.date}
                        aria-label={ariaLabel}
                        data-date={day.date}
                        data-level={day.level}
                        className={`w-3.5 h-3.5 rounded-[3px] transition-transform hover:scale-125 focus:scale-125 focus:outline-hidden focus:ring-1 focus:ring-primary relative flex items-center justify-center ${colorClass} ${
                          day.isToday ? "ring-1 ring-primary/60" : ""
                        } ${day.isFuture ? "opacity-30 cursor-default" : "cursor-pointer"}`}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredDay((prev) =>
                            prev?.day.date === day.date
                              ? null
                              : {
                                  day,
                                  x: rect.left + rect.width / 2,
                                  y: rect.top,
                                }
                          );
                        }}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredDay({
                            day,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }}
                        onMouseLeave={() => setHoveredDay(null)}
                        onFocus={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHoveredDay({
                            day,
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }}
                        onBlur={() => setHoveredDay(null)}
                      >
                        {day.level === 5 && (
                          <span className="pointer-events-none select-none flex items-center justify-center">
                            <svg
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              className="w-2 h-2 text-emerald-300 animate-pulse drop-shadow-[0_0_2px_rgba(110,231,183,0.9)]"
                            >
                              <path d="M12 2l2.4 7.4h7.6l-6.2 4.5 2.4 7.4-6.2-4.5-6.2 4.5 2.4-7.4-6.2-4.5h7.6z" />
                            </svg>
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. Legend at Footer */}
      <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)] pt-3 mt-1 border-t border-[var(--color-border-subtle)]">
        <span>استمرار مطالعه در گذر زمان</span>
        <div className="flex items-center gap-1.5">
          <span>کمتر</span>
          <div className="flex items-center gap-1">
            <span
              className="w-2.5 h-2.5 rounded-[2px] bg-[#EEF1F3]"
              title="سطح ۰: بدون فعالیت"
            />
            <span
              className="w-2.5 h-2.5 rounded-[2px] bg-[#C2E5DE]"
              title="سطح ۱: کمتر از ۲۵ دقیقه"
            />
            <span
              className="w-2.5 h-2.5 rounded-[2px] bg-[#70C4B8]"
              title="سطح ۲: ۲۵ تا ۴۵ دقیقه"
            />
            <span
              className="w-2.5 h-2.5 rounded-[2px] bg-[#2A9D8F]"
              title="سطح ۳: ۴۵ تا ۷۵ دقیقه"
            />
            <span
              className="w-2.5 h-2.5 rounded-[2px] bg-[#008080]"
              title="سطح ۴: ۷۵ تا ۱۵۰ دقیقه"
            />
            <span
              className="w-2.5 h-2.5 rounded-[2px] bg-[#004D40] relative flex items-center justify-center"
              title="سطح ویژه: بیش از ۱۵۰ دقیقه"
            >
              <svg
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-1.5 h-1.5 text-emerald-300 animate-pulse"
              >
                <path d="M12 2l2.4 7.4h7.6l-6.2 4.5 2.4 7.4-6.2-4.5-6.2 4.5 2.4-7.4-6.2-4.5h7.6z" />
              </svg>
            </span>
          </div>
          <span>بیشتر</span>
        </div>
      </div>

      {/* 4. Rich Accessible Floating Tooltip */}
      {hoveredDay && (
        <div
          className="fixed z-50 pointer-events-none px-2.5 py-1.5 rounded-md bg-[var(--color-surface)] border border-[var(--color-border)] shadow-md text-xs text-[var(--color-text)] -translate-x-1/2 -translate-y-full -mt-2 whitespace-nowrap"
          style={{
            left: `${hoveredDay.x}px`,
            top: `${hoveredDay.y}px`,
          }}
          role="tooltip"
        >
          <div className="font-bold text-xs text-[var(--color-text)] flex items-center justify-between gap-2">
            <span>{hoveredDay.day.fullFormatted}</span>
            {hoveredDay.day.level === 5 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-500/15 px-1.5 py-0.5 rounded border border-emerald-500/30">
                <span className="text-emerald-400 animate-pulse">★</span> ویژه (+۱۵۰ دقیقه)
              </span>
            )}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
            {hoveredDay.day.seconds > 0 ? (
              <>
                <span className="text-primary font-semibold">
                  {hoveredDay.day.formattedDuration}
                </span>{" "}
                مطالعه{" "}
                {hoveredDay.day.sessionCount > 0 && (
                  <span className="text-[10px]">
                    ({toPersianDigits(hoveredDay.day.sessionCount)} جلسه)
                  </span>
                )}
              </>
            ) : (
              "فعالیتی ثبت نشده"
            )}
          </div>
        </div>
      )}
    </div>
  );
}
