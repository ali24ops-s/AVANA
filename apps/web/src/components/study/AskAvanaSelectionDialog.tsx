/**
 * «از آوانا بپرس» Selection Dialog.
 *
 * Integrates the selected lesson text context seamlessly into the existing StudyAssistantChat.
 */

import React from "react";
import { Sparkles, Quote } from "lucide-react";
import { Dialog, DialogHeader, DialogContent } from "@avana/ui";
import { StudyAssistantChat } from "../ai/StudyAssistantChat.js";
import type { TextSelectionData } from "../../hooks/useTextSelection.js";

export interface AskAvanaSelectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectionData: TextSelectionData | null;
  lessonId?: string;
  courseId?: string;
  lessonTitle?: string;
  moduleTitle?: string;
  courseTitle?: string;
}

export function AskAvanaSelectionDialog({
  isOpen,
  onClose,
  selectionData,
  lessonId,
  courseId,
  lessonTitle,
  moduleTitle,
  courseTitle,
}: AskAvanaSelectionDialogProps) {
  if (!isOpen || !selectionData) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="3xl"
      ariaLabel="از آوانا بپرس درباره متن انتخاب‌شده"
      containerClassName="p-3 sm:p-6"
    >
      <DialogHeader onClose={onClose}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[var(--color-text)]">از آوانا بپرس</h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              پاسخ هوشمند با اتکا به متن درسنامه
            </p>
          </div>
        </div>
      </DialogHeader>

      <DialogContent className="p-4 sm:p-6 space-y-4">
        {/* Selected text context card */}
        <div className="p-3.5 rounded-card bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-teal-700 dark:text-teal-300">
            <Quote className="w-3.5 h-3.5" />
            <span>متن انتخاب‌شده:</span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--color-text)] leading-relaxed line-clamp-4 bg-[var(--color-surface)] p-2.5 rounded-lg border border-[var(--color-border)]">
            {selectionData.selectedText}
          </p>
        </div>

        {/* Embedded StudyAssistantChat */}
        <StudyAssistantChat
          contextType="lesson"
          lessonId={lessonId}
          courseId={courseId}
          lessonTitle={lessonTitle}
          moduleTitle={moduleTitle}
          courseTitle={courseTitle}
          initialPrompt={`درباره این بخش از درس راهنمایی می‌خواهم:\n«${selectionData.selectedText}»\n`}
          className="border border-[var(--color-border)] rounded-2xl min-h-[380px] max-h-[500px]"
        />
      </DialogContent>
    </Dialog>
  );
}
