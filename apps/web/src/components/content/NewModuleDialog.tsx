/**
 * NewModuleDialog — Modal form for creating a new module within a course.
 */

import { useState } from "react";
import { AlertCircle, FolderPlus, Loader2, X } from "lucide-react";

export interface NewModuleFormData {
  title: string;
  description: string;
}

interface NewModuleDialogProps {
  open: boolean;
  courseTitle: string;
  isPending: boolean;
  serverError: string | null;
  onSubmit: (data: NewModuleFormData) => void;
  onClose: () => void;
}

interface FormErrors {
  title?: string;
}

function validate(form: NewModuleFormData): FormErrors {
  const errors: FormErrors = {};
  if (form.title.trim().length === 0) {
    errors.title = "عنوان فصل الزامی است.";
  } else if (form.title.trim().length > 255) {
    errors.title = "عنوان فصل نباید بیشتر از ۲۵۵ کاراکتر باشد.";
  }
  return errors;
}

export function NewModuleDialog({
  open,
  courseTitle,
  isPending,
  serverError,
  onSubmit,
  onClose,
}: NewModuleDialogProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  if (!open) return null;

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (errors.title) setErrors((prev) => ({ ...prev, title: undefined }));
  };

  const handleSubmit = () => {
    const v = validate({ title, description });
    if (v.title) {
      setErrors(v);
      return;
    }
    setErrors({});
    onSubmit({ title, description });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm font-sans"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-module-dialog-title"
      dir="rtl"
    >
      <div className="w-full max-w-lg bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] shadow-2xl overflow-hidden">
        {/* Dialog header */}
        <div className="px-6 py-5 border-b border-[var(--color-border)] flex items-start justify-between gap-4">
          <div>
            <h2
              id="new-module-dialog-title"
              className="text-base font-bold text-[var(--color-text)]"
            >
              افزودن فصل جدید
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              دوره: {courseTitle}
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
              htmlFor="new-module-title"
              className="block text-xs font-semibold text-[var(--color-text)] mb-1.5"
            >
              عنوان فصل *
            </label>
            <input
              id="new-module-title"
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="مثال: فارماکولوژی سیستم قلبی عروقی"
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

          {/* Description */}
          <div>
            <label
              htmlFor="new-module-description"
              className="block text-xs font-semibold text-[var(--color-text)] mb-1.5"
            >
              توضیحات فصل (اختیاری)
            </label>
            <textarea
              id="new-module-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="توضیح کوتاه درباره مباحث این فصل..."
              disabled={isPending}
              rows={3}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs text-[var(--color-text)] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-[#008080] disabled:opacity-60"
            />
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
                <FolderPlus className="w-4 h-4" />
                <span>ایجاد فصل</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
