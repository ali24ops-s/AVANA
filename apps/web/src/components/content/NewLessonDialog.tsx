/**
 * NewLessonDialog — Modal form for creating a new lesson within a module.
 */

import { useState } from "react";
import { AlertCircle, Loader2, Plus, X } from "lucide-react";

export interface NewLessonFormData {
  title: string;
  contentMarkdown: string;
  estimatedMinutes: string;
}

interface NewLessonDialogProps {
  open: boolean;
  moduleTitle: string;
  isPending: boolean;
  serverError: string | null;
  onSubmit: (data: NewLessonFormData) => void;
  onClose: () => void;
}

interface FormErrors {
  title?: string;
  estimatedMinutes?: string;
}

function parseEstimatedMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return NaN;
  return num;
}

function validate(form: NewLessonFormData): FormErrors {
  const errors: FormErrors = {};
  if (form.title.trim().length === 0) {
    errors.title = "عنوان درس الزامی است.";
  } else if (form.title.trim().length > 255) {
    errors.title = "عنوان درس نباید بیشتر از ۲۵۵ کاراکتر باشد.";
  }
  if (form.estimatedMinutes.trim() !== "") {
    const parsed = parseEstimatedMinutes(form.estimatedMinutes);
    if (Number.isNaN(parsed)) {
      errors.estimatedMinutes = "مدت زمان باید یک عدد صحیح مثبت باشد.";
    }
  }
  return errors;
}

export function NewLessonDialog({
  open,
  moduleTitle,
  isPending,
  serverError,
  onSubmit,
  onClose,
}: NewLessonDialogProps) {
  const [title, setTitle] = useState("");
  const [contentMarkdown, setContentMarkdown] = useState("");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  if (!open) return null;

  const handleFieldChange = (
    field: "title" | "estimatedMinutes",
    value: string,
  ) => {
    if (field === "title") {
      setTitle(value);
      if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
    } else {
      setEstimatedMinutes(value);
      if (errors.estimatedMinutes)
        setErrors((prev) => ({ ...prev, estimatedMinutes: undefined }));
    }
  };

  const handleSubmit = () => {
    const v = validate({ title, contentMarkdown, estimatedMinutes });
    if (v.title || v.estimatedMinutes) {
      setErrors(v);
      return;
    }
    setErrors({});
    onSubmit({
      title,
      contentMarkdown,
      estimatedMinutes,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm font-sans"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-lesson-dialog-title"
      dir="rtl"
    >
      <div className="w-full max-w-lg bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] shadow-2xl overflow-hidden">
        {/* Dialog header */}
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-start justify-between gap-4">
          <div>
            <h2
              id="new-lesson-dialog-title"
              className="text-base font-bold text-[var(--color-text)]"
            >
              افزودن درس جدید
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              فصل: {moduleTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="بستن"
            className="p-1.5 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dialog body */}
        <div className="px-6 py-5 space-y-4">
          {/* Server error */}
          {serverError && (
            <div className="flex items-start gap-2 p-3 rounded-2xl bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs font-medium border border-red-200 dark:border-red-800">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label
              htmlFor="new-lesson-title"
              className="block text-xs font-semibold text-[var(--color-text)] mb-1.5"
            >
              عنوان درس *
            </label>
            <input
              id="new-lesson-title"
              type="text"
              value={title}
              onChange={(e) => handleFieldChange("title", e.target.value)}
              placeholder="مثال: مکانیسم اثر مسدودکننده‌های گیرنده بتا"
              disabled={isPending}
              autoFocus
              className={`w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-surface-warm)] border text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#008080] disabled:opacity-60 ${
                errors.title ? "border-red-400" : "border-[var(--color-border)]"
              }`}
            />
            {errors.title && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.title}
              </p>
            )}
          </div>

          {/* Markdown */}
          <div>
            <label
              htmlFor="new-lesson-markdown"
              className="block text-xs font-semibold text-[var(--color-text)] mb-1.5"
            >
              محتوای درس (فرمت Markdown)
            </label>
            <textarea
              id="new-lesson-markdown"
              value={contentMarkdown}
              onChange={(e) => setContentMarkdown(e.target.value)}
              placeholder="محتوای آموزشی درس را به صورت Markdown وارد کنید..."
              disabled={isPending}
              rows={6}
              dir="auto"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs text-[var(--color-text)] font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[#008080] disabled:opacity-60"
            />
          </div>

          {/* Estimated minutes */}
          <div>
            <label
              htmlFor="new-lesson-minutes"
              className="block text-xs font-semibold text-[var(--color-text)] mb-1.5"
            >
              زمان تخمینی مطالعه (دقیقه)
            </label>
            <input
              id="new-lesson-minutes"
              type="text"
              inputMode="numeric"
              value={estimatedMinutes}
              onChange={(e) =>
                handleFieldChange("estimatedMinutes", e.target.value)
              }
              placeholder="اختیاری (مثال: ۱۵)"
              disabled={isPending}
              dir="ltr"
              className={`w-36 px-3.5 py-2.5 rounded-xl bg-[var(--color-surface-warm)] border text-sm text-[var(--color-text)] text-right focus:outline-none focus:ring-2 focus:ring-[#008080] disabled:opacity-60 ${
                errors.estimatedMinutes
                  ? "border-red-400"
                  : "border-[var(--color-border)]"
              }`}
            />
            {errors.estimatedMinutes && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {errors.estimatedMinutes}
              </p>
            )}
          </div>
        </div>

        {/* Dialog footer */}
        <div className="px-6 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#008080] hover:bg-[#006666] text-white disabled:opacity-50 transition-colors disabled:cursor-not-allowed text-xs font-bold shadow-sm"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال ایجاد...</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>ایجاد درس</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
