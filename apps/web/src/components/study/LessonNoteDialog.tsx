/**
 * «یادداشت» (Personal Note) & «هایلایت» Management Dialog.
 *
 * - For notes: Allows student to write, view, edit or delete a note attached to lesson text.
 * - For highlights: Allows removing the highlight without any note creation/editing capability.
 */

import React, { useState, useEffect } from "react";
import { StickyNote, Quote, Trash2, Highlighter } from "lucide-react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Textarea,
} from "@avana/ui";
import type { TextSelectionData } from "../../hooks/useTextSelection.js";
import type { LessonAnnotationResource } from "@avana/contracts";

export interface LessonNoteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectionData?: TextSelectionData | null;
  existingNote?: LessonAnnotationResource | null;
  onSave: (noteText: string) => Promise<void>;
  onDelete?: () => Promise<void>;
  isSaving?: boolean;
}

export function LessonNoteDialog({
  isOpen,
  onClose,
  selectionData,
  existingNote,
  onSave,
  onDelete,
  isSaving = false,
}: LessonNoteDialogProps) {
  const [noteText, setNoteText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isHighlight = existingNote?.type === "highlight";
  const selectedText =
    existingNote?.selectedText || selectionData?.selectedText || "";

  useEffect(() => {
    if (isOpen) {
      setNoteText(existingNote?.noteText || "");
      setError(null);
    }
  }, [isOpen, existingNote]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isHighlight) {
      // Highlights do not allow notes
      return;
    }

    if (!noteText.trim()) {
      setError("لطفاً متن یادداشت را وارد کنید.");
      return;
    }

    try {
      await onSave(noteText.trim());
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "خطا در ذخیره یادداشت. دوباره تلاش کنید.",
      );
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    try {
      await onDelete();
      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "خطا در حذف. دوباره تلاش کنید.",
      );
    }
  };

  const dialogAriaLabel = isHighlight
    ? "مدیریت هایلایت"
    : existingNote
      ? "ویرایش یادداشت شخصی"
      : "افزودن یادداشت شخصی";

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="lg"
      ariaLabel={dialogAriaLabel}
    >
      <DialogHeader onClose={onClose}>
        <div className="flex items-center gap-2.5">
          {isHighlight ? (
            <div className="w-8 h-8 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
              <Highlighter className="w-4 h-4" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
              <StickyNote className="w-4 h-4" />
            </div>
          )}
          <div>
            <h3 className="text-base font-bold text-[var(--color-text)]">
              {isHighlight
                ? "مدیریت هایلایت"
                : existingNote
                  ? "ویرایش یادداشت شخصی"
                  : "یادداشت روی متن"}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              {isHighlight
                ? "متن هایلایت‌شده در این درسنامه"
                : "یادداشت‌های شخصی شما در این درسنامه ذخیره می‌ماند"}
            </p>
          </div>
        </div>
      </DialogHeader>

      <form onSubmit={handleSubmit}>
        <DialogContent className="p-5 sm:p-6 space-y-4">
          {/* Selected Text context */}
          {selectedText && (
            <div className="p-3.5 rounded-card bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-sky-700 dark:text-sky-300">
                <Quote className="w-3.5 h-3.5" />
                <span>متن هایلایت‌شده / انتخاب‌شده:</span>
              </div>
              <p className="text-xs sm:text-sm text-[var(--color-text)] leading-relaxed bg-[var(--color-surface)] p-2.5 rounded-lg border border-[var(--color-border)] line-clamp-3">
                {selectedText}
              </p>
            </div>
          )}

          {/* Note Input — Only rendered for notes, never for highlights */}
          {!isHighlight && (
            <Textarea
              label="یادداشت من:"
              rows={4}
              value={noteText}
              onChange={(e) => {
                setNoteText(e.target.value);
                if (error) setError(null);
              }}
              placeholder="نکته، جمع‌بندی یا تحلیل خود درباره این بخش را بنویسید..."
              error={error || undefined}
              autoFocus
            />
          )}
        </DialogContent>

        <DialogFooter className="p-4 sm:p-5 flex items-center justify-between gap-3">
          {onDelete && (existingNote || isHighlight) ? (
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isSaving}
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
            >
              {isHighlight ? "حذف هایلایت" : "حذف یادداشت"}
            </Button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              onClick={onClose}
              disabled={isSaving}
            >
              انصراف
            </Button>
            {!isHighlight && (
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={isSaving}
              >
                ذخیره یادداشت
              </Button>
            )}
          </div>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
