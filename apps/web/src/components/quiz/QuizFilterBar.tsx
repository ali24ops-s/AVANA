import type { QuizQuestionFilterCount, QuizQuestionDifficulty } from "@avana/domain";
import { toPersianDigits } from "@avana/domain";

export interface QuizFilterBarProps {
  selectedCount: QuizQuestionFilterCount | null;
  selectedDifficulty: QuizQuestionDifficulty | null;
  onCountChange: (count: QuizQuestionFilterCount | null) => void;
  onDifficultyChange: (difficulty: QuizQuestionDifficulty | null) => void;
  onClearFilters?: () => void;
  className?: string;
}

export function QuizFilterBar({
  selectedCount,
  selectedDifficulty,
  onCountChange,
  onDifficultyChange,
  onClearFilters,
  className = "",
}: QuizFilterBarProps) {
  const countOptions: Array<{ id: QuizQuestionFilterCount | null; label: string }> = [
    { id: null, label: "همه سؤالات" },
    { id: 10, label: `${toPersianDigits(10)} سؤال` },
    { id: 20, label: `${toPersianDigits(20)} سؤال` },
    { id: 30, label: `${toPersianDigits(30)} سؤال` },
  ];

  const difficultyOptions: Array<{
    id: QuizQuestionDifficulty | null;
    label: string;
    dotClass?: string;
    activeClass?: string;
  }> = [
    { id: null, label: "همه سطوح" },
    {
      id: "easy",
      label: "آسان",
      dotClass: "bg-emerald-500",
      activeClass: "bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-emerald-300",
    },
    {
      id: "medium",
      label: "متوسط",
      dotClass: "bg-amber-500",
      activeClass: "bg-amber-500/15 border-amber-500 text-amber-700 dark:text-amber-300",
    },
    {
      id: "hard",
      label: "دشوار",
      dotClass: "bg-rose-500",
      activeClass: "bg-rose-500/15 border-rose-500 text-rose-700 dark:text-rose-300",
    },
  ];

  const hasActiveFilter = selectedCount !== null || selectedDifficulty !== null;

  return (
    <div
      className={`bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-3 sm:p-4 space-y-3 shadow-xs ${className}`}
      data-testid="quiz-filter-bar"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-xs font-bold text-[var(--color-text)]">
          تنظیمات و فیلترهای آزمون:
        </span>
        {hasActiveFilter && onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="text-xs text-[#008080] hover:underline font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008080] rounded px-1 cursor-pointer"
          >
            پاک کردن فیلترها
          </button>
        )}
      </div>

      {/* 1. Question Count Filter */}
      <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
        <span className="text-[11px] font-semibold text-[var(--color-text-muted)] shrink-0">
          تعداد سؤال:
        </span>
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="انتخاب تعداد سؤالات">
          {countOptions.map(({ id, label }) => {
            const isSelected = selectedCount === id;
            return (
              <button
                key={id ?? "all"}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onCountChange(id)}
                className={`px-3 py-1 text-xs rounded-lg border transition-all cursor-pointer font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008080] ${
                  isSelected
                    ? "bg-[#008080]/15 text-[#008080] border-[#008080] font-bold shadow-xs"
                    : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-text)]"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Difficulty Level Filter */}
      <div className="flex items-center justify-between gap-2 flex-wrap text-xs pt-2.5 border-t border-[var(--color-border)]">
        <span className="text-[11px] font-semibold text-[var(--color-text-muted)] shrink-0">
          سطح دشواری:
        </span>
        <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="انتخاب سطح دشواری">
          {difficultyOptions.map(({ id, label, dotClass, activeClass }) => {
            const isSelected = selectedDifficulty === id;
            return (
              <button
                key={id ?? "all"}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onDifficultyChange(id)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition-all cursor-pointer inline-flex items-center gap-1.5 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008080] ${
                  isSelected
                    ? (activeClass ?? "bg-[#008080]/15 text-[#008080] border-[#008080] font-bold shadow-xs")
                    : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-text)]"
                }`}
              >
                {dotClass && (
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} aria-hidden="true" />
                )}
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
