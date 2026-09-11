import React from "react";
import { Card, Badge, Button } from "@/components/ui";
import { formatPersianOf } from "@avana/domain";

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestionProps {
  questionNumber?: number;
  totalQuestions?: number;
  questionText: string;
  options: QuizOption[];
  selectedOptionId?: string;
  correctOptionId?: string;
  showFeedback?: boolean;
  explanation?: string;
  onSelectOption: (optionId: string) => void;
  onNext?: () => void;
  className?: string;
}

export const QuizQuestion: React.FC<QuizQuestionProps> = ({
  questionNumber,
  totalQuestions,
  questionText,
  options,
  selectedOptionId,
  correctOptionId,
  showFeedback = false,
  explanation,
  onSelectOption,
  onNext,
  className = "",
}) => {
  return (
    <Card className={`flex flex-col gap-6 max-w-2xl mx-auto w-full ${className}`}>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] pb-3">
        {questionNumber !== undefined && totalQuestions !== undefined ? (
          <Badge variant="primary">
            {formatPersianOf(questionNumber, totalQuestions, { prefix: "سوال" })}
          </Badge>
        ) : (
          <Badge variant="primary">سوال آزمون</Badge>
        )}
        <span className="text-xs text-[var(--color-text-muted)]">گزینه صحیح را انتخاب کنید</span>
      </div>

      <div className="space-y-4">
        <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)] leading-relaxed">
          {questionText}
        </h3>

        <div className="flex flex-col gap-2.5">
          {options.map((opt, idx) => {
            const isSelected = selectedOptionId === opt.id;
            const isCorrect = correctOptionId === opt.id;

            let optionStyle =
              "bg-[var(--color-surface)] border-[var(--color-border)] hover:border-[#008080]/60 hover:bg-[var(--color-surface-warm)] text-[var(--color-text)]";

            if (isSelected && !showFeedback) {
              optionStyle = "bg-[#e0f2f2] border-[#008080] text-[#006666] font-bold shadow-[var(--shadow-subtle)] ring-2 ring-[#008080]/20";
            } else if (showFeedback) {
              if (isCorrect) {
                optionStyle = "bg-[#e4f4ec] border-[#3d8f6e] text-[#2a624b] font-bold";
              } else if (isSelected && !isCorrect) {
                optionStyle = "bg-[#fde8e8] border-[#b84c4c] text-[#7f3131] font-bold";
              }
            }

            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={isSelected}
                disabled={showFeedback}
                onClick={() => onSelectOption(opt.id)}
                className={`p-3.5 sm:p-4 rounded-[10px] min-h-[48px] border flex items-center justify-between text-start transition-all duration-150 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008080] disabled:cursor-default ${optionStyle}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-7 h-7 rounded-[6px] border text-xs font-bold flex items-center justify-center shrink-0 transition-colors ${
                      isSelected && !showFeedback
                        ? "bg-[#008080] text-white border-[#008080]"
                        : "bg-[var(--color-surface-warm)] border-[var(--color-border)] text-[var(--color-text)]"
                    }`}
                  >
                    {String.fromCharCode(1575 + idx)} {/* الف، ب، ج، د */}
                  </span>
                  <span className="text-xs sm:text-sm font-medium">{opt.text}</span>
                </div>

                {showFeedback && isCorrect && (
                  <Badge variant="success" size="sm">
                    صحیح ✓
                  </Badge>
                )}
                {showFeedback && isSelected && !isCorrect && (
                  <Badge variant="error" size="sm">
                    نادرست ✕
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {showFeedback && explanation && (
        <div className="p-4 rounded-[10px] bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs leading-relaxed space-y-1.5">
          <span className="font-bold text-[#008080] flex items-center gap-1">
            <span>💡</span>
            <span>پاسخ تشریحی:</span>
          </span>
          <p className="text-[var(--color-text-muted)] leading-relaxed">{explanation}</p>
        </div>
      )}

      {onNext && (
        <div className="flex justify-end pt-2">
          <Button onClick={onNext} variant="primary" disabled={!selectedOptionId}>
            سوال بعدی ➔
          </Button>
        </div>
      )}
    </Card>
  );
};
