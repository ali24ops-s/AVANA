import React from "react";
import { Check, CheckCircle2, HelpCircle } from "lucide-react";
import type { PublicSanitizedPoll } from "../../lib/api/polls-api.js";
import { toPersianDigits } from "@avana/domain";

type Question = NonNullable<PublicSanitizedPoll["questions"]>[number];

export interface PollQuestionCardProps {
  question: Question;
  index: number;
  value: string | string[] | undefined;
  onChange: (val: string | string[]) => void;
  showError?: boolean;
}

export function PollQuestionCard({
  question,
  index,
  value,
  onChange,
  showError = false,
}: PollQuestionCardProps) {
  const isSingle = question.questionType === "single_choice";
  const isMultiple = question.questionType === "multiple_choice";
  const isShortText = question.questionType === "short_text";

  const selectedList = isMultiple && Array.isArray(value) ? value : [];
  const selectedSingle = typeof value === "string" ? value : "";

  const handleSelectSingle = (optionId: string) => {
    onChange(optionId);
  };

  const handleToggleMultiple = (optionId: string) => {
    if (selectedList.includes(optionId)) {
      onChange(selectedList.filter((id) => id !== optionId));
    } else {
      if (question.maxChoices && selectedList.length >= question.maxChoices) {
        return; // Exceeded max
      }
      onChange([...selectedList, optionId]);
    }
  };

  const isMaxReached =
    isMultiple && Boolean(question.maxChoices && selectedList.length >= question.maxChoices);

  return (
    <div
      className={`p-5 sm:p-6 rounded-2xl bg-[var(--color-surface)] border transition-all shadow-xs ${
        showError
          ? "border-red-400 bg-red-50/20"
          : "border-[var(--color-border)] hover:border-[var(--color-border-hover,#b3d9d9)]"
      }`}
      dir="rtl"
    >
      {/* Question Header */}
      <div className="space-y-1.5 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <span className="w-6 h-6 rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary-dark)] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              {toPersianDigits(index + 1)}
            </span>
            <div className="space-y-1">
              <h3 className="text-sm sm:text-base font-bold text-[var(--color-text)] leading-snug">
                {question.questionText}
                {question.isRequired && (
                  <span className="text-red-500 font-bold mr-1" title="پاسخ الزامی است">
                    *
                  </span>
                )}
              </h3>
              {question.description && (
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  {question.description}
                </p>
              )}
            </div>
          </div>

          <span className="text-[10px] font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-2 py-0.5 rounded-md border border-[var(--color-border)] shrink-0">
            {isSingle ? "یک گزینه" : isMultiple ? "چند گزینه" : "پاسخ متنی"}
          </span>
        </div>

        {/* Multiple choice hint */}
        {isMultiple && (
          <div className="text-[11px] text-[var(--color-text-muted)] pr-8 flex items-center gap-2">
            <span>
              {selectedList.length > 0
                ? `${toPersianDigits(selectedList.length)} مورد انتخاب شده`
                : "می‌توانید چند مورد را انتخاب کنید"}
            </span>
            {question.minChoices && (
              <span>(حداقل {toPersianDigits(question.minChoices)} مورد)</span>
            )}
            {question.maxChoices && (
              <span>(حداکثر {toPersianDigits(question.maxChoices)} مورد)</span>
            )}
          </div>
        )}
      </div>

      {/* Options or Text Input */}
      {isShortText ? (
        <div className="space-y-1.5">
          <textarea
            rows={3}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="پاسخ خود را در این قسمت بنویسید..."
            maxLength={1000}
            className="w-full p-3 text-xs sm:text-sm rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[#008080] focus:ring-1 focus:ring-[#008080] transition-colors leading-relaxed"
          />
          <div className="text-left text-[10px] text-[var(--color-text-muted)] font-mono" dir="ltr">
            {toPersianDigits(typeof value === "string" ? value.length : 0)} / ۱۰۰۰
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {(question.options || []).map((option) => {
            const isChecked = isSingle
              ? selectedSingle === option.id
              : selectedList.includes(option.id);

            const isOptionDisabled =
              isMultiple && isMaxReached && !selectedList.includes(option.id);

            return (
              <div
                key={option.id}
                onClick={() => {
                  if (isOptionDisabled) return;
                  if (isSingle) handleSelectSingle(option.id);
                  else handleToggleMultiple(option.id);
                }}
                className={`flex items-center gap-3.5 p-3.5 sm:p-4 rounded-xl border text-xs sm:text-sm transition-all select-none ${
                  isOptionDisabled
                    ? "opacity-40 cursor-not-allowed border-[var(--color-border)] bg-[var(--color-surface-warm)]/40"
                    : isChecked
                      ? "bg-[#e0f2f2]/70 border-[#008080] text-[#006666] font-bold shadow-2xs cursor-pointer"
                      : "border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] hover:border-slate-300 cursor-pointer"
                }`}
              >
                {/* Radio or Checkbox indicator */}
                <div
                  className={`w-5 h-5 rounded-${isMultiple ? "md" : "full"} border flex items-center justify-center shrink-0 transition-all ${
                    isChecked
                      ? "bg-[#008080] border-[#008080] text-white"
                      : "border-[var(--color-border)] bg-[var(--color-surface)]"
                  }`}
                >
                  {isChecked && <Check className="w-3.5 h-3.5 text-white stroke-[3]" />}
                </div>

                <span className="flex-1 leading-relaxed">{option.optionText}</span>
              </div>
            );
          })}
        </div>
      )}

      {showError && (
        <p className="text-[11px] text-red-600 font-semibold mt-2">
          {isMultiple && question.minChoices && selectedList.length < question.minChoices
            ? `لطفاً حداقل ${toPersianDigits(question.minChoices)} مورد را انتخاب کنید.`
            : "پاسخ به این سؤال الزامی است."}
        </p>
      )}
    </div>
  );
}
