import React, { useState, useMemo, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Send,
  RotateCcw,
  CheckSquare,
  Square,
  AlertCircle,
  Loader2,
  BookOpen,
  FileCheck2,
  AlertTriangle,
} from "lucide-react";
import { Dialog, Button, Badge, Alert } from "../../ui/index.js";
import { toPersianDigits } from "@avana/domain";
import {
  getStudioApi,
  type StagingQuestionRecord,
  type StagingQuestionReviewStatus,
  type StagingQuestionReviewDecision,
  type TransferExamQuestionsResponse,
} from "../../../lib/api/studio-api.js";
import {
  useExamStagingQuestions,
  useExamOperationDetails,
  useReviewExamOperationQuestions,
  useTransferExamOperationQuestions,
} from "../../../hooks/useStudioExamOperation.js";

export interface ExamStagingReviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  operationId: string;
  quizId?: string;
  quizTitle?: string;
  chapterTitles?: Record<string, string>;
  onTransferSuccess?: (result: TransferExamQuestionsResponse) => void;
  studioApi?: ReturnType<typeof getStudioApi>;
}

type StatusFilter = "all" | StagingQuestionReviewStatus;

const statusMeta: Record<
  StagingQuestionReviewStatus,
  {
    label: string;
    variant: "warning" | "primary" | "error" | "success";
    icon: React.ReactNode;
  }
> = {
  pending_review: {
    label: "در انتظار بازبینی",
    variant: "warning",
    icon: <Clock className="w-3 h-3" />,
  },
  accepted: {
    label: "تأییدشده",
    variant: "primary",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  rejected: {
    label: "ردشده",
    variant: "error",
    icon: <XCircle className="w-3 h-3" />,
  },
  transferred: {
    label: "منتقلشده",
    variant: "success",
    icon: <FileCheck2 className="w-3 h-3" />,
  },
};

const difficultyLabels: Record<string, string> = {
  easy: "آسان",
  medium: "متوسط",
  hard: "دشوار",
};

function normalizeChoiceItem(
  choice: unknown,
  index: number,
): { id: string; text: string } {
  if (typeof choice === "string") {
    return { id: String(index + 1), text: choice.trim() };
  }
  if (typeof choice === "object" && choice !== null) {
    const obj = choice as { id?: unknown; text?: unknown };
    const id =
      typeof obj.id === "string" && obj.id.trim().length > 0
        ? obj.id.trim()
        : String(index + 1);
    const text =
      typeof obj.text === "string" ? obj.text.trim() : String(obj.text ?? "").trim();
    return { id, text };
  }
  return { id: String(index + 1), text: String(choice ?? "").trim() };
}

function isChoiceCorrect(
  choice: { id: string; text: string },
  correctAnswer: unknown,
): boolean {
  if (!correctAnswer) return false;
  if (typeof correctAnswer === "string") {
    const trimmed = correctAnswer.trim();
    return (
      choice.id === trimmed ||
      choice.text.trim() === trimmed ||
      choice.text.trim().toLowerCase() === trimmed.toLowerCase()
    );
  }
  if (typeof correctAnswer === "object") {
    const obj = correctAnswer as { choiceId?: unknown; choiceIds?: unknown };
    if (typeof obj.choiceId === "string") {
      const trimmedId = obj.choiceId.trim();
      if (
        choice.id === trimmedId ||
        choice.text.trim() === trimmedId ||
        choice.text.trim().toLowerCase() === trimmedId.toLowerCase()
      ) {
        return true;
      }
    }
    if (Array.isArray(obj.choiceIds) && obj.choiceIds.includes(choice.id)) {
      return true;
    }
  }
  return false;
}

function getReviewStatus(q: StagingQuestionRecord): StagingQuestionReviewStatus {
  if (q.reviewStatus) return q.reviewStatus;
  return q.isAccepted ? "accepted" : "pending_review";
}

export const ExamStagingReviewDrawer: React.FC<ExamStagingReviewDrawerProps> = ({
  isOpen,
  onClose,
  operationId,
  quizId,
  quizTitle,
  chapterTitles = {},
  onTransferSuccess,
  studioApi,
}) => {
  const api = useMemo(() => studioApi ?? getStudioApi(), [studioApi]);

  const [activeFilter, setActiveFilter] = useState<StatusFilter>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showTransferConfirm, setShowTransferConfirm] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Fetch staging questions when drawer is open
  const {
    data: questionsData,
    isLoading,
    error: fetchError,
    refetch,
  } = useExamStagingQuestions(isOpen ? operationId : undefined, undefined, { api });

  // Fetch operation details if quizId is not passed, so destination is strictly derived from Operation
  const { data: operationDetails } = useExamOperationDetails(
    isOpen && !quizId ? operationId : undefined,
    { api },
  );

  const effectiveQuizId = quizId ?? operationDetails?.operation?.quizId;

  const reviewMutation = useReviewExamOperationQuestions(operationId, {
    api,
    quizId: effectiveQuizId,
  });
  const transferMutation = useTransferExamOperationQuestions(
    operationId,
    effectiveQuizId,
    { api },
  );

  const isMutating = reviewMutation.isPending || transferMutation.isPending;

  // Reset transient feedback when closing or switching operation
  useEffect(() => {
    if (!isOpen) {
      setSelectedIds([]);
      setShowTransferConfirm(false);
      setActionError(null);
      setActionSuccess(null);
      setActiveFilter("all");
    }
  }, [isOpen, operationId]);

  const questions = useMemo(() => questionsData?.questions ?? [], [questionsData]);

  // Status counts
  const counts = useMemo(() => {
    const map: Record<StatusFilter, number> = {
      all: questions.length,
      pending_review: 0,
      accepted: 0,
      rejected: 0,
      transferred: 0,
    };
    for (const q of questions) {
      const st = getReviewStatus(q);
      map[st] += 1;
    }
    return map;
  }, [questions]);

  const filteredQuestions = useMemo(() => {
    if (activeFilter === "all") return questions;
    return questions.filter((q) => getReviewStatus(q) === activeFilter);
  }, [questions, activeFilter]);

  const reviewableInView = useMemo(
    () => filteredQuestions.filter((q) => getReviewStatus(q) !== "transferred"),
    [filteredQuestions],
  );

  const selectedQuestions = useMemo(
    () => questions.filter((q) => selectedIds.includes(q.id)),
    [questions, selectedIds],
  );

  const selectedAcceptedIds = useMemo(
    () =>
      selectedQuestions
        .filter((q) => getReviewStatus(q) === "accepted")
        .map((q) => q.id),
    [selectedQuestions],
  );

  const hasNonAcceptedSelected = useMemo(
    () =>
      selectedQuestions.some((q) => {
        const st = getReviewStatus(q);
        return st === "pending_review" || st === "rejected";
      }),
    [selectedQuestions],
  );

  const toggleSelect = (questionId: string, status: StagingQuestionReviewStatus) => {
    if (status === "transferred" || isMutating) return;
    setActionError(null);
    setActionSuccess(null);
    setShowTransferConfirm(false);
    setSelectedIds((prev) =>
      prev.includes(questionId)
        ? prev.filter((id) => id !== questionId)
        : [...prev, questionId],
    );
  };

  const handleSelectAllReviewable = () => {
    if (isMutating) return;
    setActionError(null);
    setActionSuccess(null);
    setShowTransferConfirm(false);
    const viewIds = reviewableInView.map((q) => q.id);
    const allSelected =
      viewIds.length > 0 && viewIds.every((id) => selectedIds.includes(id));

    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !viewIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...viewIds])));
    }
  };

  const handleReview = async (
    targetIds: string[],
    decision: StagingQuestionReviewDecision,
  ) => {
    if (isMutating || targetIds.length === 0) return;
    setActionError(null);
    setActionSuccess(null);
    setShowTransferConfirm(false);

    try {
      const res = await reviewMutation.mutateAsync({
        questionIds: targetIds,
        decision,
      });
      const label =
        decision === "accepted"
          ? "تأیید"
          : decision === "rejected"
            ? "رد"
            : "بازگشت به انتظار";
      setActionSuccess(
        res.updatedCount > 0
          ? `عملیات ${label} برای ${toPersianDigits(res.updatedCount)} سؤال با موفقیت ثبت شد.`
          : "وضعیت سؤالات انتخاب‌شده بدون تغییر باقی ماند.",
      );
      setSelectedIds((prev) => prev.filter((id) => !targetIds.includes(id)));
    } catch (err) {
      // Preserve user selection on error
      setActionError(
        err instanceof Error ? err.message : "خطا در ثبت وضعیت بازبینی سؤالات.",
      );
    }
  };

  const handleRequestTransfer = () => {
    if (isMutating) return;
    setActionError(null);
    setActionSuccess(null);

    if (selectedIds.length === 0) {
      setActionError("لطفاً ابتدا سؤالات تأییدشده را برای انتقال انتخاب کنید.");
      return;
    }

    if (hasNonAcceptedSelected || selectedAcceptedIds.length === 0) {
      setActionError(
        "فقط سؤالات تأییدشده قابل انتقال به آزمون هستند. لطفاً سؤالات در انتظار یا ردشده را از انتخاب خارج کرده یا ابتدا تأیید کنید.",
      );
      return;
    }

    setShowTransferConfirm(true);
  };

  const handleConfirmTransfer = async () => {
    if (isMutating || selectedAcceptedIds.length === 0) return;
    setActionError(null);
    setActionSuccess(null);

    try {
      const res = await transferMutation.mutateAsync({
        questionIds: selectedAcceptedIds,
      });
      setShowTransferConfirm(false);
      setSelectedIds((prev) =>
        prev.filter((id) => !selectedAcceptedIds.includes(id)),
      );
      setActionSuccess(
        res.transferredCount > 0
          ? `تعداد ${toPersianDigits(res.transferredCount)} سؤال با موفقیت به آزمون اصلی منتقل شد.`
          : "سؤالات انتخاب‌شده قبلاً به آزمون منتقل شده‌اند.",
      );
      onTransferSuccess?.(res);
    } catch (err) {
      setShowTransferConfirm(false);
      // Preserve user selection on error
      setActionError(
        err instanceof Error ? err.message : "خطا در انتقال سؤالات به آزمون اصلی.",
      );
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={isMutating ? () => {} : onClose}
      maxWidth="5xl"
    >
      <div className="flex flex-col gap-4 max-h-[82vh]" dir="rtl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-border)] pb-3.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-50 border border-teal-200 flex items-center justify-center text-[#008080] shrink-0">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-[var(--color-text)]">
                بازبینی و انتقال سؤالات تولیدشده
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {quizTitle
                  ? `آزمون مقصد: ${quizTitle}`
                  : effectiveQuizId
                    ? `شناسه آزمون مقصد: ${effectiveQuizId}`
                    : "سؤالات تأییدشده به آزمون اصلی منتقل می‌شوند"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="primary" size="sm">
              کل سؤالات: {toPersianDigits(counts.all)}
            </Badge>
            <Badge variant="success" size="sm">
              منتقلشده: {toPersianDigits(counts.transferred)}
            </Badge>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 shrink-0">
          {(
            [
              { id: "all", label: "همه" },
              { id: "pending_review", label: "در انتظار بازبینی" },
              { id: "accepted", label: "تأییدشده" },
              { id: "rejected", label: "ردشده" },
              { id: "transferred", label: "منتقلشده" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border whitespace-nowrap transition-colors cursor-pointer ${
                activeFilter === tab.id
                  ? "bg-[#008080] text-white border-[#008080]"
                  : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {tab.label} ({toPersianDigits(counts[tab.id])})
            </button>
          ))}
        </div>

        {/* Feedback Alerts */}
        {actionError && (
          <Alert variant="error" icon={<AlertCircle className="w-4 h-4" />} className="shrink-0">
            {actionError}
          </Alert>
        )}
        {actionSuccess && (
          <Alert variant="success" icon={<CheckCircle2 className="w-4 h-4" />} className="shrink-0">
            {actionSuccess}
          </Alert>
        )}

        {/* Transfer Confirmation Box */}
        {showTransferConfirm && (
          <div className="p-3.5 rounded-xl border border-teal-300 bg-teal-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shrink-0">
            <div className="flex items-start gap-2.5 text-teal-950">
              <AlertTriangle className="w-4 h-4 text-[#008080] shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-bold">تأیید نهایی انتقال به آزمون اصلی</p>
                <p>
                  تعداد {toPersianDigits(selectedAcceptedIds.length)} سؤال تأییدشده به{" "}
                  {quizTitle ? `آزمون «${quizTitle}»` : "آزمون مقصد"} منتقل خواهد شد. پس از
                  انتقال، وضعیت این سؤالات قابل بازگشت نخواهد بود.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 justify-end">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setShowTransferConfirm(false)}
                disabled={isMutating}
              >
                انصراف
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => void handleConfirmTransfer()}
                isLoading={transferMutation.isPending}
                leftIcon={<Send className="w-3.5 h-3.5" />}
              >
                تأیید و انتقال نهایی
              </Button>
            </div>
          </div>
        )}

        {/* Batch Action Toolbar */}
        {!isLoading && !fetchError && questions.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)]/60 shrink-0">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleSelectAllReviewable}
                disabled={isMutating || reviewableInView.length === 0}
                className="flex items-center gap-1.5 text-xs font-semibold text-[#008080] hover:underline disabled:opacity-50 cursor-pointer"
              >
                {reviewableInView.length > 0 &&
                reviewableInView.every((q) => selectedIds.includes(q.id)) ? (
                  <CheckSquare className="w-4 h-4" />
                ) : (
                  <Square className="w-4 h-4" />
                )}
                <span>انتخاب همه قابل بازبینی ({toPersianDigits(reviewableInView.length)})</span>
              </button>
              {selectedIds.length > 0 && (
                <span className="text-xs text-[var(--color-text-muted)]">
                  ({toPersianDigits(selectedIds.length)} مورد انتخاب‌شده)
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isMutating || selectedIds.length === 0}
                onClick={() => void handleReview(selectedIds, "accepted")}
              >
                تأیید گروهی
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isMutating || selectedIds.length === 0}
                onClick={() => void handleReview(selectedIds, "rejected")}
              >
                رد گروهی
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isMutating || selectedIds.length === 0}
                onClick={() => void handleReview(selectedIds, "pending_review")}
              >
                بازگشت به انتظار
              </Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={isMutating || selectedIds.length === 0}
                onClick={handleRequestTransfer}
                leftIcon={<Send className="w-3.5 h-3.5" />}
              >
                انتقال به آزمون ({toPersianDigits(selectedAcceptedIds.length)})
              </Button>
            </div>
          </div>
        )}

        {/* Questions List Body */}
        <div className="flex-1 overflow-y-auto min-h-[220px] space-y-3 pl-1">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-xs text-[var(--color-text-muted)]">
              <Loader2 className="w-7 h-7 animate-spin text-[#008080]" />
              <span>در حال بارگذاری سؤالات تولیدشده...</span>
            </div>
          ) : fetchError ? (
            <Alert variant="error" icon={<AlertCircle className="w-4 h-4" />}>
              <div className="flex items-center justify-between gap-2">
                <span>{fetchError.message || "خطا در دریافت سؤالات عملیات."}</span>
                <Button size="sm" variant="outline" onClick={() => void refetch()}>
                  تلاش مجدد
                </Button>
              </div>
            </Alert>
          ) : filteredQuestions.length === 0 ? (
            <div className="py-14 text-center border border-dashed border-[var(--color-border)] rounded-2xl text-xs text-[var(--color-text-muted)]">
              هیچ سؤالی در این وضعیت یافت نشد.
            </div>
          ) : (
            filteredQuestions.map((q, index) => {
              const status = getReviewStatus(q);
              const meta = statusMeta[status];
              const isTransferred = status === "transferred";
              const isSelected = selectedIds.includes(q.id);
              const chapterTitle = chapterTitles[q.moduleId] ?? q.topic;

              return (
                <div
                  key={q.id}
                  className={`p-4 rounded-2xl border transition-all space-y-3 ${
                    isSelected
                      ? "border-[#008080] bg-teal-50/30"
                      : "border-[var(--color-border)] bg-[var(--color-surface)]"
                  }`}
                >
                  {/* Question Card Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        aria-label={`انتخاب سؤال ${toPersianDigits(index + 1)}`}
                        disabled={isTransferred || isMutating}
                        onClick={() => toggleSelect(q.id, status)}
                        className="p-0.5 text-[#008080] disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isSelected ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4 text-[var(--color-text-muted)]" />
                        )}
                      </button>

                      <span className="text-xs font-bold text-[var(--color-text)]">
                        سؤال {toPersianDigits(index + 1)}
                      </span>

                      <Badge variant={meta.variant} size="sm" icon={meta.icon}>
                        {meta.label}
                      </Badge>

                      <Badge variant="neutral" size="sm">
                        {difficultyLabels[q.difficulty] ?? q.difficulty}
                      </Badge>

                      {chapterTitle && (
                        <span className="text-[11px] text-[var(--color-text-muted)]">
                          {chapterTitle}
                        </span>
                      )}
                    </div>

                    {/* Per-question quick actions */}
                    {!isTransferred && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {status !== "accepted" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isMutating}
                            onClick={() => void handleReview([q.id], "accepted")}
                          >
                            تأیید
                          </Button>
                        )}
                        {status !== "rejected" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={isMutating}
                            onClick={() => void handleReview([q.id], "rejected")}
                          >
                            رد
                          </Button>
                        )}
                        {status !== "pending_review" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={isMutating}
                            onClick={() => void handleReview([q.id], "pending_review")}
                            leftIcon={<RotateCcw className="w-3 h-3" />}
                          >
                            بازگشت به انتظار
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Question Text */}
                  <p className="text-xs sm:text-sm font-medium text-[var(--color-text)] leading-relaxed">
                    {q.question}
                  </p>

                  {/* Choices */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(Array.isArray(q.choices) ? q.choices : []).map((rawChoice, cIdx) => {
                      const choice = normalizeChoiceItem(rawChoice, cIdx);
                      const correct = isChoiceCorrect(choice, q.correctAnswer);
                      return (
                        <div
                          key={`${choice.id}-${cIdx}`}
                          className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                            correct
                              ? "border-emerald-300 bg-emerald-50/70 text-emerald-950 font-semibold"
                              : "border-[var(--color-border)] bg-[var(--color-surface-warm)]/40 text-[var(--color-text)]"
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[11px] font-bold text-[var(--color-text-muted)] shrink-0">
                              {toPersianDigits(cIdx + 1)}.
                            </span>
                            <span className="break-words">{choice.text}</span>
                          </div>
                          {correct && (
                            <span className="text-[10px] font-bold text-emerald-700 shrink-0">
                              پاسخ صحیح
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation */}
                  {q.explanation && (
                    <div className="p-2.5 rounded-xl bg-[var(--color-surface-warm)]/60 border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] leading-relaxed">
                      <span className="font-bold text-[var(--color-text)] ml-1">توضیح:</span>
                      {q.explanation}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 border-t border-[var(--color-border)] shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isMutating}
          >
            بستن
          </Button>
        </div>
      </div>
    </Dialog>
  );
};
