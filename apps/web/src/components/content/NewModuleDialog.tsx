/**
 * NewModuleDialog — Modal form for creating a new module within a course.
 *
 * PR5-D4: Module CRUD — create.
 * - Fields: title, description
 * - Client-side validation with inline error messages
 * - Loading state while creating
 * - Disables duplicate submissions while pending
 * - Displays server validation errors
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
    errors.title = "Module title is required";
  } else if (form.title.trim().length > 255) {
    errors.title = "Title must not exceed 255 characters";
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-module-dialog-title"
    >
      <div className="w-full max-w-lg bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-xl overflow-hidden">
        {/* Dialog header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-start justify-between gap-4">
          <div>
            <h2
              id="new-module-dialog-title"
              className="text-lg font-bold text-[var(--color-text)]"
            >
              New Module
            </h2>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              {courseTitle}
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
              htmlFor="new-module-title"
              className="block text-sm font-medium text-[var(--color-text)] mb-1"
            >
              Title
            </label>
            <input
              id="new-module-title"
              type="text"
              value={title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Module title"
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

          {/* Description */}
          <div>
            <label
              htmlFor="new-module-description"
              className="block text-sm font-medium text-[var(--color-text)] mb-1"
            >
              Description
            </label>
            <textarea
              id="new-module-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional module description"
              disabled={isPending}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] text-sm text-[var(--color-text)] leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
            />
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
                <FolderPlus className="w-4 h-4" />
                Create Module
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
