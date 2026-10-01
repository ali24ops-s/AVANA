import React, { useState } from "react";
import { CheckCircle2, XCircle, Lightbulb, RotateCcw } from "lucide-react";
import { Badge, Button } from "@avana/ui";
import { toPersianDigits } from "@avana/domain";

export interface QuizChoice {
  id: string;
  text: string;
  isCorrect: boolean;
}

const CHOICES: QuizChoice[] = [
  { id: "rv", text: "بطن راست", isCorrect: false },
  { id: "ra", text: "دهلیز راست", isCorrect: false },
  { id: "lv", text: "بطن چپ", isCorrect: true },
  { id: "pa", text: "شریان ریوی", isCorrect: false },
];

export function AnatomyQuizCard({ className = "" }: { className?: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setHasSubmitted(true);
  };

  const handleReset = () => {
    setSelectedId(null);
    setHasSubmitted(false);
  };

  const selectedChoice = CHOICES.find((c) => c.id === selectedId);
  const isCorrect = selectedChoice?.isCorrect ?? false;

  return (
    <div
      className={`my-6 sm:my-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-xs ${className}`}
      dir="rtl"
    >
      {/* Question Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Badge variant="primary" size="sm">
            پرسش تصویری درس
          </Badge>
          <span className="text-[11px] text-[var(--color-text-muted)]">
            ارزیابی سریع درک جریان خون
          </span>
        </div>
        {hasSubmitted && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleReset}
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            className="text-xs"
          >
            پاسخ مجدد
          </Button>
        )}
      </div>

      {/* Question Title */}
      <div className="pt-4">
        <h4 className="text-base sm:text-lg font-bold text-[var(--color-text)] leading-relaxed">
          کدام ساختار خون را وارد گردش سیستمیک می‌کند؟
        </h4>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          با توجه به تصویر مقطع قلب و مسیر جریان خون، گزینه صحیح را انتخاب کنید.
        </p>
      </div>

      {/* Choice Buttons List */}
      <div className="mt-5 space-y-2.5">
        {CHOICES.map((choice, idx) => {
          const isThisSelected = selectedId === choice.id;
          let containerClass =
            "border-[var(--color-border)] hover:border-teal-500/60 hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] bg-[var(--color-surface)]";
          let badgeClass =
            "bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)]";

          if (hasSubmitted) {
            if (choice.isCorrect) {
              containerClass =
                "border-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100 font-bold shadow-xs";
              badgeClass = "bg-emerald-600 text-white border-emerald-600";
            } else if (isThisSelected && !choice.isCorrect) {
              containerClass =
                "border-rose-400 bg-rose-500/10 text-rose-900 dark:text-rose-100";
              badgeClass = "bg-rose-500 text-white border-rose-500";
            } else {
              containerClass =
                "border-[var(--color-border)] opacity-60 text-[var(--color-text-muted)]";
            }
          } else if (isThisSelected) {
            containerClass =
              "border-[#008080] bg-[#e0f2f2] dark:bg-teal-950/40 text-[#006666] dark:text-teal-300 font-bold shadow-xs";
            badgeClass = "bg-[#008080] text-white";
          }

          return (
            <button
              key={choice.id}
              type="button"
              disabled={hasSubmitted}
              onClick={() => handleSelect(choice.id)}
              className={`w-full text-start p-3.5 sm:p-4 rounded-xl min-h-[48px] border transition-all flex items-center justify-between gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008080] cursor-pointer disabled:cursor-default ${containerClass}`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${badgeClass}`}
                >
                  {toPersianDigits(idx + 1)}
                </span>
                <span className="text-sm font-medium">{choice.text}</span>
              </div>

              {hasSubmitted && choice.isCorrect && (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-bold shrink-0">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>پاسخ صحیح</span>
                </div>
              )}
              {hasSubmitted && isThisSelected && !choice.isCorrect && (
                <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 font-bold shrink-0">
                  <XCircle className="w-4 h-4" />
                  <span>پاسخ نادرست</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Answer Explanation Box */}
      {hasSubmitted && (
        <div
          className={`mt-4 p-4 rounded-xl border text-xs sm:text-[13px] leading-relaxed transition-all animate-in fade-in duration-200 ${
            isCorrect
              ? "bg-[#fdf2e4] dark:bg-amber-950/30 border-[#e8c18a] dark:border-amber-800/40 text-[var(--color-text)]"
              : "bg-rose-500/10 border-rose-500/30 text-[var(--color-text)]"
          }`}
        >
          <div className="flex items-center gap-1.5 font-bold mb-1 text-[#8f5e27] dark:text-amber-300">
            <Lightbulb className="w-4 h-4 text-amber-500 shrink-0" />
            <span>توضیح آموزشی:</span>
          </div>
          <p className="text-[var(--color-text)] mr-5">
            بطن چپ خون اکسیژن‌دار را از طریق آئورت وارد گردش سیستمیک می‌کند. این حفره به دلیل نیاز به تولید فشار کافی برای رساندن خون به تمام اعضای بدن، دارای ضخیم‌ترین دیواره میوکارد در بین چهار حفره قلب است.
          </p>
        </div>
      )}
    </div>
  );
}
