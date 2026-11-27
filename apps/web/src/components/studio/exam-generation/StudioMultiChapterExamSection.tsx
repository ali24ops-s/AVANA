import React, { useState, useEffect, useMemo } from "react";
import {
  Sparkles,
  History,
  Eye,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { Button, Badge, Alert } from "../../ui/index.js";
import { toPersianDigits, type StudioExamOperationStatus } from "@avana/domain";
import { useAuth } from "../../../providers/AuthProvider.js";
import {
  getStudioApi,
  type TransferExamQuestionsResponse,
  type ExamOperationHistoryItem,
} from "../../../lib/api/studio-api.js";
import {
  useActiveExamOperation,
  useQuizExamOperations,
} from "../../../hooks/useStudioExamOperation.js";
import { MultiChapterExamModal } from "./MultiChapterExamModal.js";
import { ExamOperationProgressCard } from "./ExamOperationProgressCard.js";
import { ExamStagingReviewDrawer } from "./ExamStagingReviewDrawer.js";

export interface StudioMultiChapterExamSectionProps {
  quizId: string;
  quizTitle?: string;
  onQuestionsTransferred?: () => void | Promise<void>;
  studioApi?: ReturnType<typeof getStudioApi>;
}

const HISTORY_PAGE_SIZE = 20;

const historyStatusMeta: Record<
  StudioExamOperationStatus,
  {
    label: string;
    variant: "warning" | "primary" | "success" | "error" | "neutral";
    icon: React.ReactNode;
  }
> = {
  pending: {
    label: "در صف پردازش",
    variant: "warning",
    icon: <Clock className="w-3 h-3" />,
  },
  processing: {
    label: "در حال تولید",
    variant: "primary",
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  completed: {
    label: "تکمیل شد",
    variant: "success",
    icon: <CheckCircle2 className="w-3 h-3" />,
  },
  partial: {
    label: "تکمیل جزئی",
    variant: "warning",
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  failed: {
    label: "خطا در تولید",
    variant: "error",
    icon: <AlertCircle className="w-3 h-3" />,
  },
  cancelled: {
    label: "لغو شده",
    variant: "neutral",
    icon: <XCircle className="w-3 h-3" />,
  },
};

export const StudioMultiChapterExamSection: React.FC<StudioMultiChapterExamSectionProps> = ({
  quizId,
  quizTitle,
  onQuestionsTransferred,
  studioApi,
}) => {
  const { user } = useAuth();
  const api = useMemo(() => studioApi ?? getStudioApi(), [studioApi]);

  const isUnauthorizedRole = user?.role === "student";

  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [reviewingOperationId, setReviewingOperationId] = useState<string | null>(null);
  const [activeCardOperationId, setActiveCardOperationId] = useState<string | null>(null);
  const [historyOffset, setHistoryOffset] = useState(0);

  // Reset UI state when switching to a different quiz
  useEffect(() => {
    setActiveCardOperationId(null);
    setReviewingOperationId(null);
    setHistoryOffset(0);
  }, [quizId]);

  // 1. Recover active (pending / processing) operation from Backend for live polling
  const { data: activeData } = useActiveExamOperation(
    !isUnauthorizedRole ? quizId : undefined,
    { api },
  );

  useEffect(() => {
    const activeOp = activeData?.operation;
    if (activeOp && activeOp.quizId === quizId) {
      setActiveCardOperationId(activeOp.id);
    }
  }, [activeData, quizId]);

  // 2. Fetch persistent quiz-scoped operation history from Backend DB
  const {
    data: historyData,
    isLoading: isLoadingHistory,
    error: historyError,
    refetch: refetchHistory,
  } = useQuizExamOperations(
    !isUnauthorizedRole ? quizId : undefined,
    { limit: HISTORY_PAGE_SIZE, offset: historyOffset },
    { api },
  );

  const handleOperationCreated = (operationId: string) => {
    setActiveCardOperationId(operationId);
    setHistoryOffset(0);
  };

  const handleDismissCard = () => {
    setActiveCardOperationId(null);
  };

  const handleTransferSuccess = (_result: TransferExamQuestionsResponse) => {
    void onQuestionsTransferred?.();
  };

  if (isUnauthorizedRole) {
    return null;
  }

  const allOperations = historyData?.operations ?? [];
  const totalOperations = historyData?.total ?? 0;

  // Avoid duplicating the active operation currently shown in ExamOperationProgressCard
  const historyItems = allOperations.filter(
    (op) => op.quizId === quizId && op.id !== activeCardOperationId,
  );

  const currentPage = Math.floor(historyOffset / HISTORY_PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(totalOperations / HISTORY_PAGE_SIZE));

  return (
    <div className="space-y-3" dir="rtl">
      {/* Entry Bar for Multi-Chapter AI Generation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-[14px] border border-teal-200/80 bg-teal-50/50">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-white border border-teal-200 flex items-center justify-center text-[#008080] shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs sm:text-sm font-bold text-[var(--color-text)]">
              تولید هوشمند آزمون چندفصلی
            </p>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              تولید خودکار سؤالات از چند فصل دوره با بازبینی و انتقال کنترل‌شده به آزمون
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => setIsGenerateModalOpen(true)}
          leftIcon={<Sparkles className="w-3.5 h-3.5" />}
          className="shrink-0 w-full sm:w-auto"
        >
          تولید آزمون چندفصلی
        </Button>
      </div>

      {/* Active / Current Operation Progress Card (Live Polling) */}
      {activeCardOperationId && (
        <ExamOperationProgressCard
          operationId={activeCardOperationId}
          quizId={quizId}
          studioApi={api}
          onReviewQuestions={(opId) => setReviewingOperationId(opId)}
          onDismiss={handleDismissCard}
        />
      )}

      {/* Persistent Quiz-scoped Operation History */}
      {isLoadingHistory ? (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)]/30 text-xs text-[var(--color-text-muted)]">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#008080]" />
          <span>در حال بارگذاری تاریخچه عملیات‌های تولید...</span>
        </div>
      ) : historyError ? (
        <Alert variant="error" icon={<AlertCircle className="w-4 h-4" />}>
          <div className="flex items-center justify-between gap-2">
            <span>{historyError.message || "خطا در دریافت تاریخچه عملیات‌ها."}</span>
            <Button size="sm" variant="outline" onClick={() => void refetchHistory()}>
              تلاش مجدد
            </Button>
          </div>
        </Alert>
      ) : historyItems.length > 0 ? (
        <div className="space-y-2 p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)]/40">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-bold text-[var(--color-text)]">
              <History className="w-3.5 h-3.5 text-[#008080]" />
              <span>تاریخچه عملیات‌های این آزمون ({toPersianDigits(totalOperations)})</span>
            </span>
          </div>

          <div className="space-y-2">
            {historyItems.map((op: ExamOperationHistoryItem) => {
              const meta = historyStatusMeta[op.status] ?? historyStatusMeta.pending;
              const hasStagingQuestions = op.stagingStats.totalCount > 0;

              return (
                <div
                  key={op.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={meta.variant} size="sm" icon={meta.icon}>
                        {meta.label}
                      </Badge>
                      <span className="font-semibold text-[var(--color-text)]">
                        {toPersianDigits(op.totalGeneratedQuestions)} از{" "}
                        {toPersianDigits(op.totalRequestedQuestions)} سؤال
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap text-[11px] text-[var(--color-text-muted)]">
                      <span>کل Staging: {toPersianDigits(op.stagingStats.totalCount)}</span>
                      <span>•</span>
                      <span>در انتظار: {toPersianDigits(op.stagingStats.pendingReviewCount)}</span>
                      <span>•</span>
                      <span>تأییدشده: {toPersianDigits(op.stagingStats.acceptedCount)}</span>
                      <span>•</span>
                      <span className="text-emerald-700 font-medium">
                        منتقلشده: {toPersianDigits(op.stagingStats.transferredCount)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {hasStagingQuestions && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setReviewingOperationId(op.id)}
                        leftIcon={<Eye className="w-3.5 h-3.5" />}
                      >
                        بازبینی سؤالات
                      </Button>
                    )}
                    {(op.status === "pending" || op.status === "processing") && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setActiveCardOperationId(op.id)}
                      >
                        مشاهده پیشرفت
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)] text-xs">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={historyOffset === 0}
                onClick={() => setHistoryOffset((prev) => Math.max(0, prev - HISTORY_PAGE_SIZE))}
                leftIcon={<ChevronRight className="w-3.5 h-3.5" />}
              >
                صفحه قبل
              </Button>
              <span className="text-[var(--color-text-muted)]">
                صفحه {toPersianDigits(currentPage)} از {toPersianDigits(totalPages)}
              </span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={historyOffset + HISTORY_PAGE_SIZE >= totalOperations}
                onClick={() => setHistoryOffset((prev) => prev + HISTORY_PAGE_SIZE)}
                rightIcon={<ChevronLeft className="w-3.5 h-3.5" />}
              >
                صفحه بعد
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {/* Multi-Chapter Exam Generation Modal */}
      <MultiChapterExamModal
        isOpen={isGenerateModalOpen}
        onClose={() => setIsGenerateModalOpen(false)}
        quizId={quizId}
        onSuccess={handleOperationCreated}
        studioApi={api}
      />

      {/* Staging Questions Review & Transfer Drawer */}
      {reviewingOperationId && (
        <ExamStagingReviewDrawer
          isOpen={Boolean(reviewingOperationId)}
          onClose={() => setReviewingOperationId(null)}
          operationId={reviewingOperationId}
          quizId={quizId}
          quizTitle={quizTitle}
          onTransferSuccess={handleTransferSuccess}
          studioApi={api}
        />
      )}
    </div>
  );
};
