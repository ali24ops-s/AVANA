/**
 * StudyAssistantModal Component
 *
 * Floating modal for the AVANA Smart Assistant (دستیار هوشمند).
 * Powered by canonical @avana/ui Dialog primitive with single-scroll-owner architecture
 * and accessible focus/escape management.
 */

import { Dialog } from "@avana/ui";
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
  if (!isOpen) return null;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      hideHeader
      className="p-0 border-[var(--color-border)] bg-[var(--color-surface)] shadow-[0_8px_40px_rgba(0,0,0,0.16)] max-w-[480px] h-[90vh] sm:h-[640px] max-h-[calc(100vh-2.5rem)] rounded-dialog overflow-hidden flex flex-col"
      containerClassName="z-[9999]"
      ariaLabel="دستیار هوشمند آوانا"
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
    </Dialog>
  );
}

