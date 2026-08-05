/**
 * NewLessonDialog — Modal form for creating a new lesson within a module.
 *
 * PR5-C3: Create lesson.
 * - Fields: title, markdown, estimated minutes
 * - Client-side validation with inline error messages
 * - Loading state while creating
 * - Disables duplicate submissions while pending
 * - Displays server validation errors
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
    errors.title = "Lesson title is required";
  } else if (form.title.trim().length > 255) {
    errors.title = "Title must not exceed 255 characters";
  }
  if (form.estimatedMinutes.trim() !== "") {
    const parsed = parseEstimatedMinutes(form.estimatedMinutes);
    if (Number.isNaN(parsed)) {
      errors.estimatedMinutes = "Must be a positive whole number or empty";
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-lesson-dialog-title"
    >
      <div className="w-full max-w-lg bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-xl overflow-hidden">
        {/* Dialog header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-start justify-between gap-4">
          <div>
            <h2
              id="new-lesson-dialog-title"
              className="text-lg font-bold text-[var(--color-text)]"
            >
              New Lesson
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              {moduleTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            aria-label="Close"
            className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dialog body */}
        <div className="px-6 py-4 space-y-4">
          {/* Server error */}
          {serverError && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{serverError}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label
              htmlFor="new-lesson-title"
              className="block text-sm font-medium text-[var(--color-text)] mb-1"
            >
              Title
            </label>
            <input
              id="new-lesson-title"
              type="text"
              value={title}
              onChange={(e) => handleFieldChange("title", e.target.value)}
              placeholder="Lesson title"
              disabled={isPending}
              autoFocus
              className={`w-full px-3 py-2 rounded-lg bg-[var(--color-background)] border text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60 ${
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
              className="block text-sm font-medium text-[var(--color-text)] mb-1"
            >
              Markdown
            </label>
            <textarea
              id="new-lesson-markdown"
              value={contentMarkdown}
              onChange={(e) => setContentMarkdown(e.target.value)}
              placeholder="Write your lesson content in markdown..."
              disabled={isPending}
              rows={6}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] text-sm text-[var(--color-text)] font-mono leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
              spellCheck
            />
          </div>

          {/* Estimated minutes */}
          <div>
            <label
              htmlFor="new-lesson-minutes"
              className="block text-sm font-medium text-[var(--color-text)] mb-1"
            >
              Estimated minutes
            </label>
            <input
              id="new-lesson-minutes"
              type="text"
              inputMode="numeric"
              value={estimatedMinutes}
              onChange={(e) =>
                handleFieldChange("estimatedMinutes", e.target.value)
              }
              placeholder="Optional"
              disabled={isPending}
              className={`w-32 px-3 py-2 rounded-lg bg-[var(--color-background)] border text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60 ${
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
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-[var(--color-border)] text-white disabled:text-[var(--color-text-muted)] transition-colors disabled:cursor-not-allowed text-sm font-medium"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Create Lesson
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
