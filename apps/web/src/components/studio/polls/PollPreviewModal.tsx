import React, { useState } from "react";
import {
  Smartphone,
  Monitor,
  CheckCircle2,
  HelpCircle,
  ExternalLink,
} from "lucide-react";
import { Dialog, Badge, Button } from "../../../components/ui/index.js";
import type { Poll, PollQuestion } from "../../../lib/api/polls-api.js";
import { toPersianDigits } from "@avana/domain";

export interface PollPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  poll: Partial<Poll>;
}

export function PollPreviewModal({ isOpen, onClose, poll }: PollPreviewModalProps) {
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string | string[]>>({});

  const questions = (poll.questions || []) as PollQuestion[];

  const handleSelectOption = (questionId: string, optionId: string, isMultiple = false) => {
    setSelectedAnswers((prev) => {
      if (!isMultiple) {
        return { ...prev, [questionId]: optionId };
      }
      const current = (prev[questionId] as string[]) || [];
      const updated = current.includes(optionId)
        ? current.filter((id) => id !== optionId)
        : [...current, optionId];
      return { ...prev, [questionId]: updated };
    });
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title="پیش‌نمایش نظرسنجی"
      description="مشاهده نحوه نمایش نظرسنجی برای شرکت‌کنندگان در موبایل و دسکتاپ (حالت تعاملی)"
      maxWidth="4xl"
    >
      <div className="space-y-4" dir="rtl">
        {/* Device Switcher */}
        <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setDevice("mobile")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                device === "mobile"
                  ? "bg-[var(--color-surface)] text-[var(--color-primary-default)] font-bold shadow-xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>موبایل (Mobile)</span>
            </button>
            <button
              type="button"
              onClick={() => setDevice("desktop")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                device === "desktop"
                  ? "bg-[var(--color-surface)] text-[var(--color-primary-default)] font-bold shadow-xs"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>رایانه (Desktop)</span>
            </button>
          </div>

          <span className="text-[11px] text-[var(--color-text-muted)]">
            حالت پیش‌نمایش زنده (هیچ پاسخی ثبت نخواهد شد)
          </span>
        </div>

        {/* Viewport Container */}
        <div className="flex justify-center bg-[var(--color-background)] p-4 rounded-2xl border border-[var(--color-border)] min-h-[500px] max-h-[70vh] overflow-y-auto">
          <div
            className={`w-full transition-all duration-200 bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-sm overflow-hidden flex flex-col ${
              device === "mobile" ? "max-w-[390px]" : "max-w-2xl"
            }`}
          >
            {/* Poll Cover Image */}
            {poll.coverImageUrl && (
              <div className="w-full h-40 sm:h-48 overflow-hidden bg-[var(--color-surface-warm)] border-b border-[var(--color-border)]">
                <img
                  src={poll.coverImageUrl}
                  alt={poll.title}
                  className="w-full h-full object-cover"
                />
              </div>
            )}

            {/* Poll Header */}
            <div className="p-5 sm:p-6 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]/30">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-[#008080]" />
                <span className="text-xs font-bold text-[#008080]">نظرسنجی آوانا</span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-[var(--color-text)] mb-2">
                {poll.title || "عنوان نظرسنجی"}
              </h2>
              {poll.description && (
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed whitespace-pre-line">
                  {poll.description}
                </p>
              )}
            </div>

            {/* Questions List */}
            <div className="p-5 sm:p-6 space-y-6 flex-1">
              {questions.length === 0 ? (
                <div className="py-12 text-center text-xs text-[var(--color-text-muted)]">
                  هنوز سؤالی برای این نظرسنجی تعریف نشده است.
                </div>
              ) : (
                questions.map((question, qIdx) => {
                  const isMultiple = question.questionType === "multiple_choice";
                  const isSingle = question.questionType === "single_choice";
                  const isShortText = question.questionType === "short_text";
                  const selected = selectedAnswers[question.id];

                  return (
                    <div
                      key={question.id || qIdx}
                      className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xs space-y-3"
                    >
                      {/* Question Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary-dark)] text-[11px] font-bold flex items-center justify-center shrink-0">
                              {toPersianDigits(qIdx + 1)}
                            </span>
                            <span className="text-xs sm:text-sm font-bold text-[var(--color-text)]">
                              {question.questionText}
                            </span>
                            {question.isRequired && (
                              <span className="text-red-500 font-bold text-xs" title="پاسخ الزامی است">
                                *
                              </span>
                            )}
                          </div>
                          {question.description && (
                            <p className="text-[11px] text-[var(--color-text-muted)] pr-7">
                              {question.description}
                            </p>
                          )}
                        </div>

                        <span className="text-[10px] font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-2 py-0.5 rounded-md border border-[var(--color-border)] shrink-0">
                          {isSingle ? "تک‌گزینه‌ای" : isMultiple ? "چندگزینه‌ای" : "پاسخ متنی"}
                        </span>
                      </div>

                      {/* Options or Text Area */}
                      {isShortText ? (
                        <div className="pt-1">
                          <textarea
                            rows={3}
                            placeholder="پاسخ خود را اینجا بنویسید..."
                            className="w-full p-2.5 text-xs rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[#008080] transition-colors"
                          />
                        </div>
                      ) : (
                        <div className="space-y-2 pt-1">
                          {(question.options || []).map((opt) => {
                            const isChecked = isMultiple
                              ? Array.isArray(selected) && selected.includes(opt.id)
                              : selected === opt.id;

                            return (
                              <div
                                key={opt.id}
                                onClick={() => handleSelectOption(question.id, opt.id, isMultiple)}
                                className={`flex items-center gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                                  isChecked
                                    ? "bg-[#e0f2f2]/60 border-[#008080] text-[#006666] font-semibold shadow-2xs"
                                    : "border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)]"
                                }`}
                              >
                                <div
                                  className={`w-4 h-4 rounded-${isMultiple ? "md" : "full"} border flex items-center justify-center shrink-0 transition-colors ${
                                    isChecked
                                      ? "bg-[#008080] border-[#008080] text-white"
                                      : "border-[var(--color-border)] bg-[var(--color-surface)]"
                                  }`}
                                >
                                  {isChecked && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                                </div>
                                <span className="flex-1 leading-snug">{opt.optionText}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* CTA Preview if configured */}
              {poll.settings?.ctaTitle && (
                <div className="p-4 rounded-xl bg-[var(--color-primary-light)]/40 border border-[#b3d9d9] text-center space-y-2">
                  <h4 className="text-xs font-bold text-[var(--color-primary-dark)]">
                    {poll.settings.ctaTitle}
                  </h4>
                  {poll.settings?.ctaButtonText && (
                    <Button
                      variant="primary"
                      size="sm"
                      className="cursor-pointer"
                      rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
                    >
                      {poll.settings.ctaButtonText}
                    </Button>
                  )}
                </div>
              )}

              {/* Fake Submit Button */}
              {questions.length > 0 && (
                <div className="pt-2">
                  <Button variant="primary" size="md" className="w-full cursor-not-allowed opacity-80">
                    ثبت نهایی پاسخ‌ها (پیش‌نمایش)
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            بستن پیش‌نمایش
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
