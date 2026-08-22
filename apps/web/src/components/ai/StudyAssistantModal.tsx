/**
 * StudyAssistantModal Component
 *
 * Floating modal for the AVANA Smart Assistant (دستیار هوشمند).
 * Renders via React Portal onto document.body to ensure complete isolation
 * from the Dashboard / page layout, preventing unwanted page scroll jumps
 * or layout reflows.
 */

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { StudyAssistantChat } from "./StudyAssistantChat.js";

export interface StudyAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  contextType?: "lesson" | "dashboard";
  courseId?: string;
  courseTitle?: string;
  lessonId?: string;
  lessonTitle?: string;
  moduleTitle?: string;
  initialPrompt?: string;
}

export function StudyAssistantModal({
  isOpen,
  onClose,
  contextType = "dashboard",
  courseId,
  courseTitle,
  lessonId,
  lessonTitle,
  moduleTitle,
  initialPrompt,
}: StudyAssistantModalProps) {
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Lock body scroll while modal is open without altering window scroll position
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Close modal on Escape key press
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="assistant-modal-title"
    >
      {/* Subtle backdrop overlay with smooth blur */}
      <div
        className="fixed inset-0 bg-slate-950/65 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Floating Modal Panel */}
      <div
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-[480px] h-[90vh] sm:h-[640px] max-h-[calc(100vh-2.5rem)] bg-slate-900/95 border border-purple-500/30 rounded-2xl sm:rounded-3xl shadow-2xl backdrop-blur-xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
      >
        <StudyAssistantChat
          contextType={contextType}
          courseId={courseId}
          courseTitle={courseTitle}
          lessonId={lessonId}
          lessonTitle={lessonTitle}
          moduleTitle={moduleTitle}
          initialPrompt={initialPrompt}
          onClose={onClose}
          className="h-full border-0 rounded-none bg-transparent shadow-none"
        />
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : null;
}
