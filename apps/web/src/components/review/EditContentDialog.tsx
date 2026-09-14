import { useState, useMemo, useEffect } from "react";
import { X, Save, Loader2, AlertCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createReviewApi } from "../../lib/api/review.js";
import type { GeneratedContentResource } from "@avana/contracts";
import { Badge } from "@avana/ui";
import {
  LessonFormEditor,
  type LessonFormEditorData,
  type LessonSessionData,
} from "./editors/LessonFormEditor.js";
import {
  FlashcardFormEditor,
  type FlashcardItemData,
} from "./editors/FlashcardFormEditor.js";
import {
  ExamFormEditor,
  type ExamFormEditorData,
  type ExamQuestionData,
} from "./editors/ExamFormEditor.js";

export interface EditContentDialogProps {
  content: GeneratedContentResource;
  organizationId: string;
  courseId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function EditContentDialog({
  content,
  organizationId,
  courseId,
  isOpen,
  onClose,
  onSaved,
}: EditContentDialogProps) {
  const payload = content.payload as Record<string, unknown>;

  // 1. Initial State Initialization
  const initialLessonState: LessonFormEditorData = useMemo(() => {
    const sessions = Array.isArray(payload.sessions)
      ? (payload.sessions as LessonSessionData[])
      : undefined;
    const contentMarkdown = String(
      payload.contentMarkdown ??
        payload.content_markdown ??
        payload.markdown ??
        "",
    );
    const title = String(payload.title ?? "");
    return { title, contentMarkdown, sessions };
  }, [payload]);

  const initialFlashcardState: FlashcardItemData[] = useMemo(() => {
    const rawCards = Array.isArray(payload.cards)
      ? (payload.cards as Array<Record<string, unknown>>)
      : Array.isArray(payload.flashcards)
      ? (payload.flashcards as Array<Record<string, unknown>>)
      : payload.question && payload.answer
      ? [payload]
      : [{ question: "", answer: "" }];

    return rawCards.map((c: Record<string, unknown>) => ({
      id: typeof c.id === "string" ? c.id : undefined,
      question: String(c.question ?? c.front ?? ""),
      answer: String(c.answer ?? c.back ?? ""),
      explanation: typeof c.explanation === "string" ? c.explanation : "",
      cardType: typeof c.cardType === "string" ? c.cardType : "definition",
      difficulty: (c.difficulty as "easy" | "medium" | "hard") || "medium",
    }));
  }, [payload]);

  const initialExamState: ExamFormEditorData = useMemo(() => {
    const title = String(payload.title ?? "آزمون ارزیابی");
    const rawQuestions = Array.isArray(payload.questions)
      ? (payload.questions as Array<Record<string, unknown>>)
      : payload.question
      ? [payload]
      : [
          {
            question: "",
            choices: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
            correctAnswer: "گزینه ۱",
          },
        ];

    const questions: ExamQuestionData[] = rawQuestions.map(
      (q: Record<string, unknown>) => {
        const choices = Array.isArray(q.choices)
          ? q.choices.map(String)
          : Array.isArray(q.options)
          ? q.options.map(String)
          : ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"];
        const correctAnswer = String(
          q.correctAnswer ?? q.correct_answer ?? q.answer ?? choices[0] ?? "",
        );
        return {
          question: String(q.question ?? ""),
          choices,
          correctAnswer,
          explanation: typeof q.explanation === "string" ? q.explanation : "",
          difficulty: (q.difficulty as "easy" | "medium" | "hard") || "medium",
          category: typeof q.category === "string" ? q.category : undefined,
        };
      },
    );

    return { title, questions };
  }, [payload]);

  // Form states
  const [lessonData, setLessonData] = useState<LessonFormEditorData>(initialLessonState);
  const [flashcardData, setFlashcardData] = useState<FlashcardItemData[]>(initialFlashcardState);
  const [examData, setExamData] = useState<ExamFormEditorData>(initialExamState);

  // Sync state if payload changes
  useEffect(() => {
    setLessonData(initialLessonState);
    setFlashcardData(initialFlashcardState);
    setExamData(initialExamState);
    setError(null);
  }, [initialLessonState, initialFlashcardState, initialExamState]);

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  // Dirty Tracking
  const isDirty = useMemo(() => {
    if (content.type === "lesson") {
      return JSON.stringify(lessonData) !== JSON.stringify(initialLessonState);
    }
    if (content.type === "flashcard") {
      return JSON.stringify(flashcardData) !== JSON.stringify(initialFlashcardState);
    }
    if (content.type === "quiz") {
      return JSON.stringify(examData) !== JSON.stringify(initialExamState);
    }
    return false;
  }, [content.type, lessonData, flashcardData, examData, initialLessonState, initialFlashcardState, initialExamState]);

  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const reviewApi = createReviewApi(apiClient);

  // Validation
  const validate = (): { isValid: boolean; errMessage: string | null; errors: Record<string, string> } => {
    const errs: Record<string, string> = {};

    if (content.type === "lesson") {
      if (!lessonData.title.trim()) {
        errs.title = "عنوان درسنامه نمی‌تواند خالی باشد.";
        return { isValid: false, errMessage: "عنوان درسنامه نمی‌تواند خالی باشد.", errors: errs };
      }
      if (lessonData.sessions && lessonData.sessions.length > 0) {
        for (let i = 0; i < lessonData.sessions.length; i++) {
          const sess = lessonData.sessions[i];
          if (!sess.title.trim()) {
            errs[`session_${i}_title`] = "عنوان جلسه الزامی است.";
            return { isValid: false, errMessage: `عنوان جلسه ${i + 1} الزامی است.`, errors: errs };
          }
          if (!sess.contentMarkdown.trim()) {
            errs[`session_${i}_content`] = "متن جلسه الزامی است.";
            return { isValid: false, errMessage: `متن آموزشی جلسه ${i + 1} نمی‌تواند خالی باشد.`, errors: errs };
          }
        }
      } else if (!lessonData.contentMarkdown.trim()) {
        errs.contentMarkdown = "متن درسنامه نمی‌تواند خالی باشد.";
        return { isValid: false, errMessage: "متن درسنامه نمی‌تواند خالی باشد.", errors: errs };
      }
    }

    if (content.type === "flashcard") {
      if (flashcardData.length === 0) {
        return { isValid: false, errMessage: "حداقل یک فلش‌کارت باید در مجموعه وجود داشته باشد.", errors: errs };
      }
      for (let i = 0; i < flashcardData.length; i++) {
        const card = flashcardData[i];
        if (!card.question.trim()) {
          errs[`card_${i}_question`] = "روی کارت الزامی است.";
          return { isValid: false, errMessage: `روی کارت (پرسش) در فلش‌کارت شماره ${i + 1} خالی است.`, errors: errs };
        }
        if (!card.answer.trim()) {
          errs[`card_${i}_answer`] = "پشت کارت الزامی است.";
          return { isValid: false, errMessage: `پشت کارت (پاسخ) در فلش‌کارت شماره ${i + 1} خالی است.`, errors: errs };
        }
      }
    }

    if (content.type === "quiz") {
      if (!examData.title.trim()) {
        errs.title = "عنوان آزمون الزامی است.";
        return { isValid: false, errMessage: "عنوان آزمون نمی‌تواند خالی باشد.", errors: errs };
      }
      if (examData.questions.length === 0) {
        return { isValid: false, errMessage: "حداقل یک سؤال باید در آزمون وجود داشته باشد.", errors: errs };
      }
      for (let i = 0; i < examData.questions.length; i++) {
        const q = examData.questions[i];
        if (!q.question.trim()) {
          errs[`q_${i}_question`] = "صورت سؤال الزامی است.";
          return { isValid: false, errMessage: `صورت سؤال در سؤال شماره ${i + 1} خالی است.`, errors: errs };
        }
        if (q.choices.length < 2) {
          return { isValid: false, errMessage: `سؤال شماره ${i + 1} باید حداقل دو گزینه داشته باشد.`, errors: errs };
        }
        const hasEmptyChoice = q.choices.some((c) => !c.trim());
        if (hasEmptyChoice) {
          return { isValid: false, errMessage: `تمامی گزینه‌های سؤال شماره ${i + 1} باید تکمیل شوند.`, errors: errs };
        }
        if (!q.choices.includes(q.correctAnswer)) {
          errs[`q_${i}_correct`] = "پاسخ صحیح باید از بین گزینه‌های موجود انتخاب شود.";
          return { isValid: false, errMessage: `در سؤال شماره ${i + 1}، پاسخ صحیح انتخاب‌نشده یا نامعتبر است.`, errors: errs };
        }
      }
    }

    return { isValid: true, errMessage: null, errors: {} };
  };

  const editMutation = useMutation({
    mutationFn: async () => {
      const validation = validate();
      if (!validation.isValid) {
        setFieldErrors(validation.errors);
        throw new Error(validation.errMessage || "اطلاعات فرم معتبر نیست.");
      }
      setFieldErrors({});

      let updatedPayload: Record<string, unknown> = { ...payload };

      if (content.type === "lesson") {
        if (lessonData.sessions && lessonData.sessions.length > 0) {
          const consolidatedMarkdown = lessonData.sessions
            .map((s) => `## ${s.title}\n\n${s.contentMarkdown}`)
            .join("\n\n---\n\n");

          updatedPayload = {
            ...payload,
            kind: "lesson",
            title: lessonData.title.trim(),
            sessions: lessonData.sessions.map((s, idx) => ({
              ...s,
              sessionIndex: idx,
              title: s.title.trim(),
              contentMarkdown: s.contentMarkdown,
            })),
            contentMarkdown: consolidatedMarkdown,
            content_markdown: consolidatedMarkdown,
          };
        } else {
          updatedPayload = {
            ...payload,
            kind: "lesson",
            title: lessonData.title.trim(),
            contentMarkdown: lessonData.contentMarkdown,
            content_markdown: lessonData.contentMarkdown,
          };
        }
      } else if (content.type === "flashcard") {
        const cleanedCards = flashcardData.map((c) => ({
          id: c.id,
          question: c.question.trim(),
          answer: c.answer.trim(),
          explanation: c.explanation?.trim() || undefined,
          cardType: c.cardType || "definition",
          difficulty: c.difficulty || "medium",
        }));

        updatedPayload = {
          ...payload,
          kind: "flashcard",
          cards: cleanedCards,
          // backward compatibility fields
          question: cleanedCards[0]?.question,
          answer: cleanedCards[0]?.answer,
          explanation: cleanedCards[0]?.explanation,
        };
      } else if (content.type === "quiz") {
        const cleanedQuestions = examData.questions.map((q, idx) => ({
          ...q,
          sessionIndex: idx,
          question: q.question.trim(),
          choices: q.choices.map((c) => c.trim()),
          options: q.choices.map((c) => c.trim()),
          correctAnswer: q.correctAnswer.trim(),
          correct_answer: q.correctAnswer.trim(),
          explanation: q.explanation?.trim() || undefined,
          questionType: "multiple_choice" as const,
        }));

        updatedPayload = {
          ...payload,
          kind: "quiz",
          title: examData.title.trim(),
          questions: cleanedQuestions,
          // backward compatibility single question fields
          question: cleanedQuestions[0]?.question,
          choices: cleanedQuestions[0]?.choices,
          options: cleanedQuestions[0]?.choices,
          correctAnswer: cleanedQuestions[0]?.correctAnswer,
          correct_answer: cleanedQuestions[0]?.correctAnswer,
          explanation: cleanedQuestions[0]?.explanation,
        };
      }

      return reviewApi.editContent(organizationId, courseId, content.id, {
        payload: updatedPayload,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["review-detail", organizationId, courseId, content.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["review-queue", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["official-review-workspace", courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-detail", courseId],
      });
      onSaved?.();
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "خطا در به‌روزرسانی محتوا");
    },
  });

  const handleRequestClose = () => {
    if (isDirty) {
      setShowDiscardConfirm(true);
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  const isAccepted = content.status === "accepted";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-draft-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 font-sans"
      dir="rtl"
    >
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2.5">
            <h3 id="edit-draft-dialog-title" className="font-bold text-base text-[var(--color-text)]">
              {isAccepted ? "ویرایش محتوای منتشرشده" : "ویرایش پیش‌نویس محتوا"}
            </h3>
            <Badge
              variant={isAccepted ? "success" : "neutral"}
              size="sm"
            >
              {isAccepted ? "تایید و منتشر شده" : "پیش‌نویس / در بازبینی"}
            </Badge>
          </div>
          <button
            type="button"
            onClick={handleRequestClose}
            aria-label="بستن پنجره"
            className="p-1.5 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Type-Specific Structured Form */}
          {content.type === "lesson" && (
            <LessonFormEditor
              data={lessonData}
              onChange={setLessonData}
              errors={fieldErrors}
            />
          )}

          {content.type === "flashcard" && (
            <FlashcardFormEditor
              cards={flashcardData}
              onChange={setFlashcardData}
              errors={fieldErrors}
            />
          )}

          {content.type === "quiz" && (
            <ExamFormEditor
              data={examData}
              onChange={setExamData}
              errors={fieldErrors}
            />
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between gap-3 p-4 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]/60">
          <span className="text-[11px] text-[var(--color-text-muted)] hidden sm:inline">
            {isDirty ? "تغییرات ذخیره‌نشده دارید." : "تغییری اعمال نشده است."}
          </span>
          <div className="flex items-center gap-2.5 ms-auto">
            <button
              type="button"
              onClick={handleRequestClose}
              disabled={editMutation.isPending}
              className="px-4 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] cursor-pointer"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={() => editMutation.mutate()}
              disabled={editMutation.isPending}
              className="px-5 py-2.5 bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-contrast)] rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 shadow-sm transition-colors cursor-pointer"
            >
              {editMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>در حال ذخیره...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>ذخیره تغییرات</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Discard confirmation overlay */}
      {showDiscardConfirm && (
        <div
          role="alertdialog"
          aria-modal="true"
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
        >
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 max-w-sm w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <h4 className="font-bold text-sm text-[var(--color-text)]">
                تغییرات ذخیره‌نشده
              </h4>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              شما تغییراتی اعمال کرده‌اید که ذخیره نشده‌اند. آیا از لغو تغییرات و بستن پنجره مطمئن هستید؟
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDiscardConfirm(false)}
                className="px-3.5 py-1.5 rounded-xl border border-[var(--color-border)] text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] cursor-pointer"
              >
                ادامه ویرایش
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowDiscardConfirm(false);
                  onClose();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                لغو تغییرات و خروج
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
