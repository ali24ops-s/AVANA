import React, { useState } from "react";
import { Button, Badge } from "@/components/ui";

export interface FlashcardProps {
  id: string;
  frontText: string;
  backText: string;
  category?: string;
  hint?: string;
  onRateAnswer?: (rating: "again" | "hard" | "good" | "easy") => void;
  className?: string;
}

export const Flashcard: React.FC<FlashcardProps> = ({
  frontText,
  backText,
  category,
  hint,
  onRateAnswer,
  className = "",
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);

  return (
    <div className={`flex flex-col gap-4 w-full max-w-xl mx-auto ${className}`}>
      {/* 3D Flip Container */}
      <div
        className="perspective-1000 w-full min-h-[280px] sm:min-h-[320px] cursor-pointer"
        onClick={() => setIsFlipped(!isFlipped)}
      >
        <div
          className={`relative w-full h-full min-h-[280px] sm:min-h-[320px] rounded-3xl transition-transform duration-500 [transform-style:preserve-3d] ${
            isFlipped ? "[transform:rotateY(180deg)]" : ""
          }`}
        >
          {/* Front Side */}
          <div className="absolute inset-0 w-full h-full [backface-visibility:hidden] p-6 sm:p-8 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl shadow-xl flex flex-col justify-between text-center">
            <div className="flex items-center justify-between gap-2">
              {category && <Badge variant="primary">{category}</Badge>}
              <span className="text-xs text-[var(--color-text-muted)]">برای مشاهده پاسخ کلیک کنید 🔄</span>
            </div>

            <div className="my-auto space-y-3">
              <h3 className="text-lg sm:text-xl font-bold text-[var(--color-text)] leading-relaxed">
                {frontText}
              </h3>
              {hint && showHint && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-900 dark:text-amber-200 font-medium">
                  💡 راهنمایی: {hint}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
              {hint && !showHint ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowHint(true);
                  }}
                  className="hover:text-amber-800 dark:hover:text-amber-300 underline"
                >
                  نمایش راهنمایی 💡
                </button>
              ) : (
                <span />
              )}
              <span>کارت رویی (سوال)</span>
            </div>
          </div>

          {/* Back Side */}
          <div className="absolute inset-0 w-full h-full [backface-visibility:hidden] [transform:rotateY(180deg)] p-6 sm:p-8 bg-[var(--color-surface-warm)] border border-[#008080]/40 rounded-3xl shadow-2xl flex flex-col justify-between text-center">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="secondary">پاسخ کارت</Badge>
              <span className="text-xs text-[var(--color-text-muted)]">روی کارت کلیک کنید 🔄</span>
            </div>

            <div className="my-auto">
              <p className="text-sm sm:text-base text-[var(--color-text)] leading-relaxed font-medium">
                {backText}
              </p>
            </div>

            <span className="text-xs text-[var(--color-text-muted)]">کارت پشت (توضیحات)</span>
          </div>
        </div>
      </div>

      {/* Rating Bar (shown when flipped) */}
      {isFlipped && onRateAnswer && (
        <div className="flex items-center justify-center gap-2 p-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl animate-in fade-in duration-200">
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              setIsFlipped(false);
              onRateAnswer("again");
            }}
          >
            تکرار 🔴
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setIsFlipped(false);
              onRateAnswer("hard");
            }}
          >
            سخت 🟠
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setIsFlipped(false);
              onRateAnswer("good");
            }}
          >
            خوب 🔵
          </Button>
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setIsFlipped(false);
              onRateAnswer("easy");
            }}
          >
            عالی 🟢
          </Button>
        </div>
      )}
    </div>
  );
};
