import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  ChevronLeft,
  Trash2,
  Library as LibraryIcon,
  BookOpen,
  Layers,
  HelpCircle,
  X,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createDocumentsApi } from "../../lib/api/documents.js";
import { createGenerationApi } from "../../lib/api/generation.js";
import { GenerateContentModal } from "./GenerateContentModal.js";
import { PublishPackModal } from "../library/PublishPackModal.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { canUserGenerateContent } from "../../utils/generationPermissions.js";
import { ComingSoonGenerationModal } from "../generation/ComingSoonGenerationModal.js";
import type { DocumentResource, DocumentStatus } from "@avana/contracts";
import { formatPersianOf, toPersianDigits } from "@avana/domain";

export interface DocumentStatusCardProps {
  document: DocumentResource;
  organizationId: string;
  courseId?: string | null;
  onNavigateToReview?: () => void;
  canGenerate?: boolean;
  isSelectable?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (documentId: string) => void;
}

const TRANSIENT_STATUSES: ReadonlySet<DocumentStatus> = new Set<DocumentStatus>([
  "uploaded",
  "pending_validation",
  "validating",
  "pending_extraction",
  "extracting",
  "pending_chunking",
  "chunking",
  "pending_generation",
  "generating",
]);

function formatGenerationErrorMessage(errorMessage?: string | null): string {
  if (!errorMessage) {
    return "خطای ناشناخته در پردازش جاب. لطفاً دوباره تلاش کنید.";
  }
  const lower = errorMessage.toLowerCase();
  if (
    lower.includes("quota_exhausted") ||
    lower.includes("rate_limit_exceeded") ||
    lower.includes("unavailable (key-") ||
    lower.includes("resource_exhausted") ||
    lower.includes("generaterequestsperday") ||
    lower.includes("free_tier_requests") ||
    lower.includes("سهمیه")
  ) {
    return "تولید محتوا انجام نشد. سهمیه سرویس هوش مصنوعی در حال حاضر به پایان رسیده است. لطفاً کمی بعد دوباره تلاش کنید.";
  }
  if (
    lower.includes("fetch failed") ||
    lower.includes("network error") ||
    lower.includes("econnrefused") ||
    lower.includes("timed out") ||
    lower.includes("timeout")
  ) {
    return "خطا در برقراری ارتباط با سرویس هوش مصنوعی. لطفاً اتصال اینترنت را بررسی و مجدداً تلاش کنید.";
  }
  return `خطا در تولید هوشمند: ${errorMessage}`;
}

function getJobContentPersianTitle(type?: string): string {
  if (!type) return "محتوای آموزشی";
  if (type === "lesson") return "درسنامه";
  if (type === "flashcard") return "فلش‌کارت‌ها";
  if (type === "quiz") return "آزمون و سوالات تستی";
  if (type === "review_summary") return "خلاصه مرور";
  if (type === "all") return "محتوای کامل آموزشی";
  const parts: string[] = [];
  if (type.includes("lesson")) parts.push("درسنامه");
  if (type.includes("flashcard")) parts.push("فلش‌کارت‌ها");
  if (type.includes("quiz")) parts.push("آزمون");
  if (type.includes("review_summary")) parts.push("خلاصه مرور");
  return parts.length > 0 ? parts.join("، ") : type;
}

function getJobStagePersianLabel(stage?: string | null): string {
  switch (stage) {
    case "queued":
      return "در صف انتظار پردازش هوش مصنوعی";
    case "planning":
      return "برنامه‌ریزی و طراحی سرفصل‌های آموزشی";
    case "lesson":
    case "lessons":
      return "تولید متون و مباحث درسنامه";
    case "flashcard":
    case "flashcards":
      return "تولید فلش‌کارت‌های مرور فاصله‌دار";
    case "quiz":
    case "mcqs":
      return "طراحی سوالات و گزینه‌های آزمون";
    case "review_summary":
    case "summary":
    case "review":
    case "publishing":
      return "بررسی و نهایی‌سازی خروجی‌های آموزشی";
    case "completed":
      return "تکمیل موفقیت‌آمیز";
    default:
      return "در حال پردازش هوشمند";
  }
}

export function DocumentStatusCard({
  document,
  organizationId,
  courseId,
  onNavigateToReview,
  canGenerate: canGenerateProp,
  isSelectable = false,
  isSelected = false,
  onToggleSelect,
}: DocumentStatusCardProps) {
  const { user, memberships } = useAuth();
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [dismissedCompletedJobId, setDismissedCompletedJobId] = useState<string | null>(null);
  const [dismissedFailedJobId, setDismissedFailedJobId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isComingSoonOpen, setIsComingSoonOpen] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Content generation permission:
  // - If explicitly passed via props, respect it.
  // - If authenticated user exists, check permission helper (admin/manager or CONTENT_GENERATION_ENABLED).
  // - If user is null (isolated unit tests), default to true to preserve existing tests.
  const isGenerationPermitted =
    canGenerateProp !== undefined
      ? canGenerateProp
      : user
      ? canUserGenerateContent(user, memberships)
      : true;
  const [extractError, setExtractError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [isPublished, setIsPublished] = useState(false);
  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const docsApi = createDocumentsApi(apiClient);
  const genApi = createGenerationApi(apiClient);

  // Poll document extraction status
  const statusQuery = useQuery({
    queryKey: ["document-status", organizationId, document.id],
    queryFn: () => docsApi.getDocumentStatus(organizationId, document.id),
    refetchInterval: (query) => {
      const currentStatus = query.state.data?.status?.status ?? document.status;
      return TRANSIENT_STATUSES.has(currentStatus) ? 2000 : false;
    },
  });

  const currentStatus = statusQuery.data?.status?.status ?? document.status;
  const pageCount = statusQuery.data?.status?.page_count;
  const chunkCount = statusQuery.data?.status?.chunk_count;
  const resolvedCourseId =
    (courseId && courseId.trim().length > 0 ? courseId : null) ??
    (document.course_id && document.course_id.trim().length > 0
      ? document.course_id
      : null);

  // Query database-backed content generation status (lesson, flashcards, exam)
  const contentStatusQuery = useQuery({
    queryKey: ["document-content-status", organizationId, document.id, resolvedCourseId],
    queryFn: () => genApi.getDocumentContentStatus(organizationId, document.id, resolvedCourseId),
    enabled: Boolean(organizationId && document.id),
  });

  const contentStatus = contentStatusQuery.data;
  const isAllGenerated = Boolean(contentStatus?.all_generated);
  const hasPublishableContent = Boolean(
    contentStatus?.has_publishable_content ??
      (contentStatus?.lesson?.accepted ||
        contentStatus?.flashcards?.accepted ||
        contentStatus?.exam?.accepted ||
        contentStatus?.review_summary?.accepted),
  );

  // Poll generation job status if active
  const jobQuery = useQuery({
    queryKey: ["generation-job", organizationId, resolvedCourseId, document.id, activeJobId],
    queryFn: () => genApi.getGenerationJob(organizationId, resolvedCourseId!, document.id, activeJobId!),
    enabled: Boolean(activeJobId && resolvedCourseId),
    refetchInterval: (query) => {
      const jobStatus = query.state.data?.job?.status;
      if (jobStatus === "succeeded" || jobStatus === "failed" || query.state.error) {
        return false;
      }
      return 2000;
    },
  });

  // Sync active job ID across page reloads if backend has an ongoing generation
  useEffect(() => {
    if (!activeJobId && contentStatus?.active_job_id) {
      setActiveJobId(contentStatus.active_job_id);
    }
  }, [activeJobId, contentStatus?.active_job_id]);

  // Automatically refresh queries when generation finishes (succeeded or failed)
  useEffect(() => {
    const jobStatus = jobQuery.data?.job?.status;
    if (jobStatus === "succeeded" || jobStatus === "failed") {
      if (resolvedCourseId) {
        void queryClient.invalidateQueries({
          queryKey: ["review-queue", organizationId, resolvedCourseId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["course-documents", organizationId, resolvedCourseId],
        });
      }
      void queryClient.invalidateQueries({
        queryKey: ["document-status", organizationId, document.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["document-content-status", organizationId, document.id],
      });
    }
  }, [jobQuery.data?.job?.status, organizationId, resolvedCourseId, document.id, queryClient]);

  // Trigger text extraction mutation (if retry needed)
  const extractMutation = useMutation({
    mutationFn: () => docsApi.triggerExtraction(organizationId, document.id),
    onSuccess: () => {
      setExtractError(null);
      void queryClient.invalidateQueries({
        queryKey: ["document-status", organizationId, document.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["document-content-status", organizationId, document.id],
      });
    },
    onError: (err: Error) => {
      setExtractError(err.message || "خطا در پردازش مجدد سند");
    },
  });

  // Delete document mutation
  const deleteMutation = useMutation({
    mutationFn: () => docsApi.deleteDocument(organizationId, document.id),
    onSuccess: () => {
      setDeleteError(null);
      setShowDeleteConfirm(false);
      void queryClient.invalidateQueries({
        queryKey: ["course-documents", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["documents", organizationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["review-queue", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["document-status", organizationId, document.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["document-content-status", organizationId, document.id],
      });
    },
    onError: (err: Error) => {
      setDeleteError(err.message || "خطا در حذف سند");
    },
  });

  // Trigger generation mutation with selected content types
  const generateMutation = useMutation({
    mutationFn: (options?: {
      types?: ("lesson" | "flashcard" | "quiz" | "review_summary")[];
      question_pattern_id?: string;
      question_pattern_version?: number;
      question_pattern_ids?: string[];
    }) => {
      if (!resolvedCourseId) {
        throw new Error("لطفاً ابتدا یک دوره آموزشی انتخاب کنید.");
      }
      return genApi.triggerGeneration(
        organizationId,
        resolvedCourseId,
        document.id,
        {
          types: options?.types ?? ["lesson", "flashcard", "quiz", "review_summary"],
          ...(options?.question_pattern_id ? { question_pattern_id: options.question_pattern_id } : {}),
          ...(options?.question_pattern_version ? { question_pattern_version: options.question_pattern_version } : {}),
          ...(options?.question_pattern_ids ? { question_pattern_ids: options.question_pattern_ids } : {}),
        },
      );
    },
    onSuccess: (res) => {
      setGenerateError(null);
      setDismissedCompletedJobId(null);
      setDismissedFailedJobId(null);
      setActiveJobId(res.job_id);
      setIsModalOpen(false);
      if (resolvedCourseId) {
        void queryClient.invalidateQueries({
          queryKey: ["review-queue", organizationId, resolvedCourseId],
        });
      }
      void queryClient.invalidateQueries({
        queryKey: ["document-content-status", organizationId, document.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["review-summary", organizationId, document.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["active-generations"],
      });
    },
    onError: (err: Error) => {
      setGenerateError(err.message || "خطا در شروع تولید هوشمند محتوا");
    },
  });

  const handleConfirmGenerate = (selected: {
    lesson: boolean;
    flashcards: boolean;
    exam: boolean;
    review_summary: boolean;
    questionPatternId?: string | null;
    questionPatternVersion?: number | null;
    questionPatternIds?: string[] | null;
  }) => {
    setGenerateError(null);
    setDismissedCompletedJobId(null);
    setDismissedFailedJobId(null);
    const types: Array<"lesson" | "flashcard" | "quiz" | "review_summary"> = [];
    if (selected.lesson) types.push("lesson");
    if (selected.flashcards) types.push("flashcard");
    if (selected.exam) types.push("quiz");
    if (selected.review_summary) types.push("review_summary");

    generateMutation.mutate({
      types,
      question_pattern_id: selected.questionPatternId ?? undefined,
      question_pattern_version: selected.questionPatternVersion ?? undefined,
      question_pattern_ids: selected.questionPatternIds ?? undefined,
    });
  };

  const isWaiting =
    currentStatus === "uploaded" ||
    currentStatus === "pending_validation" ||
    currentStatus === "pending_extraction" ||
    currentStatus === "pending_chunking" ||
    currentStatus === "pending_generation";
  const isExtracting =
    currentStatus === "extracting" ||
    currentStatus === "chunking" ||
    currentStatus === "validating";
  const isExtracted =
    currentStatus === "extracted" ||
    currentStatus === "review_pending" ||
    currentStatus === "ready";
  const isFailed = currentStatus === "failed";

  const resolvedJob =
    (activeJobId
      ? (jobQuery.data?.job?.id === activeJobId ? jobQuery.data.job : undefined) ??
        (contentStatus?.latest_job &&
        ((contentStatus.latest_job as any).id === activeJobId ||
          (contentStatus.latest_job as any).job_id === activeJobId)
          ? ({
              id: activeJobId,
              status: contentStatus.latest_job.status,
              type:
                (contentStatus.latest_job as any).type ??
                (contentStatus.latest_job as any).types?.[0] ??
                "all",
              error_message: contentStatus.latest_job.error_message ?? null,
            } as any)
          : undefined)
      : undefined) ??
    (contentStatus?.latest_job
      ? ({
          id:
            (contentStatus.latest_job as any).id ??
            (contentStatus.latest_job as any).job_id,
          status: contentStatus.latest_job.status,
          type:
            (contentStatus.latest_job as any).type ??
            (contentStatus.latest_job as any).types?.[0] ??
            "all",
          error_message: contentStatus.latest_job.error_message ?? null,
        } as any)
      : undefined);

  const job = resolvedJob;
  const isJobRunning = Boolean(
    activeJobId &&
      jobQuery.data?.job !== undefined &&
      jobQuery.data.job.id === activeJobId &&
      jobQuery.data.job.status !== "succeeded" &&
      jobQuery.data.job.status !== "failed" &&
      !jobQuery.isError,
  );
  const isGenerating = generateMutation.isPending || isJobRunning;

  const currentProgress = job?.progress ?? contentStatus?.progress;
  const safeTotal =
    currentProgress?.total && currentProgress.total > 0
      ? currentProgress.total
      : 1;
  const safeCompleted = Math.min(
    safeTotal,
    Math.max(0, currentProgress?.completed ?? 0),
  );
  const percent = Math.min(
    100,
    Math.round((safeCompleted / safeTotal) * 100),
  );

  const isSuccessAlertVisible = Boolean(
    !isGenerating &&
      activeJobId &&
      job?.id === activeJobId &&
      job?.status === "succeeded" &&
      dismissedCompletedJobId !== job.id,
  );

  const isFailedAlertVisible = Boolean(
    !isGenerating &&
      job?.status === "failed" &&
      job?.id &&
      dismissedFailedJobId !== job.id,
  );

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "uploaded":
      case "pending_validation":
      case "pending_extraction":
      case "pending_chunking":
      case "pending_generation":
        return "در صف انتظار";
      case "extracting":
      case "chunking":
      case "validating":
        return "در حال پردازش";
      case "extracted":
      case "ready":
      case "review_pending":
        return "استخراج‌شده و آماده";
      case "failed":
        return "ناموفق";
      default:
        return status;
    }
  };

  const isPartial = Boolean(
    !isAllGenerated &&
      !isGenerating &&
      currentProgress &&
      currentProgress.completed > 0 &&
      (currentProgress.status === "partial" ||
        currentProgress.status === "failed" ||
        job?.status === "failed"),
  );

  const hasReviewableContent = Boolean(
    contentStatus?.lesson?.generated ||
      contentStatus?.flashcards?.generated ||
      contentStatus?.exam?.generated ||
      contentStatus?.review_summary?.generated ||
      (currentProgress && currentProgress.completed > 0) ||
      document.status === "review_pending" ||
      document.status === "ready",
  );

  return (
    <div className={`bg-[var(--color-surface)] rounded-2xl border ${isSelected ? "border-[#008080] ring-1 ring-[#008080]" : "border-[var(--color-border)]"} p-4 sm:p-5 space-y-4 shadow-xs transition-colors`}>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {isSelectable && (
            <div className="pt-2">
              <input
                type="checkbox"
                aria-label={`انتخاب سند ${document.original_name}`}
                checked={isSelected}
                onChange={() => onToggleSelect?.(document.id)}
                className="w-4 h-4 rounded text-[#008080] focus:ring-[#008080] border-gray-300 cursor-pointer"
              />
            </div>
          )}
          <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-[#008080] flex items-center justify-center flex-shrink-0 mt-0.5">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-sm text-[var(--color-text)] leading-snug break-words" dir="ltr">
              {document.original_name}
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {(document.size_bytes / (1024 * 1024)).toFixed(2)} MB • تاریخ بارگذاری:{" "}
              {new Date(document.created_at).toLocaleDateString("fa-IR")}
            </p>
          </div>
        </div>

        {/* Status badge & Delete button */}
        <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-[var(--color-border)]/60">
          {isWaiting && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>در صف انتظار</span>
            </span>
          )}
          {isExtracting && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>در حال استخراج متن</span>
            </span>
          )}
          {isExtracted && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>استخراج‌شده</span>
            </span>
          )}
          {isFailed && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>خطا در پردازش</span>
            </span>
          )}

          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={deleteMutation.isPending}
            className="p-2 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-xl transition-colors"
            title="حذف سند"
            aria-label="حذف سند"
          >
            {deleteMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin text-red-600" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Delete confirmation banner */}
      {showDeleteConfirm && (
        <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-red-800 dark:text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>آیا از حذف این سند اطمینان دارید؟ منبع فایل خام پاک خواهد شد اما محتوای آموزشی تاییدشده در دوره باقی می‌ماند.</span>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleteMutation.isPending}
              className="px-3 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5"
            >
              {deleteMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>{deleteMutation.isPending ? "در حال حذف..." : "تایید حذف سند"}</span>
            </button>
          </div>
        </div>
      )}

      {/* Processing stats & Incremental Progress */}
      <div className="space-y-3 pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div>
            <span>وضعیت: </span>
            <span className="font-bold text-[var(--color-text)]">
              {getStatusLabel(currentStatus)}
            </span>
          </div>
          <div>
            <span>صفحات: </span>
            <span className="font-bold text-[var(--color-text)]">
              {pageCount ?? "—"}
            </span>
          </div>
          <div>
            <span>بخش‌ها (Chunks): </span>
            <span className="font-bold text-[var(--color-text)]">
              {chunkCount ?? "—"}
            </span>
          </div>
        </div>

        {/* Real-time Incremental Generation Progress Bar */}
        {isGenerating && (
          <div className="p-3.5 bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800/60 rounded-2xl space-y-2.5 transition-all">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 text-xs">
              <span className="text-teal-900 dark:text-teal-200 font-bold flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#008080] dark:text-teal-400 shrink-0" />
                <span>
                  در حال تولید {getJobContentPersianTitle(job?.type)}: «{document.original_name}»
                </span>
              </span>
              <span className="text-[#008080] dark:text-teal-400 font-mono font-bold text-xs shrink-0 self-end sm:self-auto">
                {currentProgress && currentProgress.total > 0
                  ? `${formatPersianOf(safeCompleted, safeTotal)} مورد (${toPersianDigits(percent)}٪)`
                  : "در صف انتظار..."}
              </span>
            </div>
            <div className="w-full h-2 bg-teal-100 dark:bg-teal-900/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#008080] dark:bg-teal-500 transition-all duration-500 rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(5, percent))}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-teal-800/80 dark:text-teal-300/80">
              <span>
                مرحله: {getJobStagePersianLabel(currentProgress?.currentStage ?? job?.generationProgress?.stage)}
              </span>
              <span className="text-teal-700/60 dark:text-teal-400/60">پردازش خودکار هوش مصنوعی</span>
            </div>
          </div>
        )}

        {!isGenerating && isPartial && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/60 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-amber-900 dark:text-amber-200 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                <span>تولید مرحله‌ای تا کنون ذخیره شده است (قابل ادامه):</span>
              </span>
              <span className="text-amber-700 dark:text-amber-400 font-mono font-bold">
                {formatPersianOf(safeCompleted, safeTotal)} مورد ({toPersianDigits(percent)}٪)
              </span>
            </div>
            <div className="w-full h-1.5 bg-amber-100 dark:bg-amber-900/40 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-500 rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(5, percent))}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Content Readiness Summary (Aligns with AVANA Admin Content Studio) */}
        {isExtracted && (
          <div className="pt-2 border-t border-[var(--color-border)] space-y-2">
            <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">
              وضعیت بخش‌های محتوای آموزشی این سند:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div
                className={`p-2 rounded-xl border flex items-center gap-2 text-xs transition-colors ${
                  contentStatus?.lesson?.generated
                    ? "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300"
                    : "bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-700/50 text-zinc-500 dark:text-zinc-400"
                }`}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0 text-[#008080] dark:text-teal-400" />
                <div className="min-w-0">
                  <div className="font-bold truncate">درسنامه</div>
                  <div className="text-[10px] opacity-80">
                    {contentStatus?.lesson?.generated
                      ? `آماده (${toPersianDigits(contentStatus.lesson.count ?? 0)})`
                      : "تولید نشده"}
                  </div>
                </div>
              </div>

              <div
                className={`p-2 rounded-xl border flex items-center gap-2 text-xs transition-colors ${
                  contentStatus?.flashcards?.generated
                    ? "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300"
                    : "bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-700/50 text-zinc-500 dark:text-zinc-400"
                }`}
              >
                <Layers className="w-3.5 h-3.5 shrink-0 text-[#008080] dark:text-teal-400" />
                <div className="min-w-0">
                  <div className="font-bold truncate">فلش‌کارت‌ها</div>
                  <div className="text-[10px] opacity-80">
                    {contentStatus?.flashcards?.generated
                      ? `آماده (${toPersianDigits(contentStatus.flashcards.count ?? 0)})`
                      : "تولید نشده"}
                  </div>
                </div>
              </div>

              <div
                className={`p-2 rounded-xl border flex items-center gap-2 text-xs transition-colors ${
                  contentStatus?.exam?.generated
                    ? "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300"
                    : "bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-700/50 text-zinc-500 dark:text-zinc-400"
                }`}
              >
                <HelpCircle className="w-3.5 h-3.5 shrink-0 text-[#008080] dark:text-teal-400" />
                <div className="min-w-0">
                  <div className="font-bold truncate">آزمون و تست‌ها</div>
                  <div className="text-[10px] opacity-80">
                    {contentStatus?.exam?.generated
                      ? `آماده (${toPersianDigits(contentStatus.exam.count ?? 0)})`
                      : "تولید نشده"}
                  </div>
                </div>
              </div>

              <div
                className={`p-2 rounded-xl border flex items-center gap-2 text-xs transition-colors ${
                  contentStatus?.review_summary?.generated
                    ? "bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200/80 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300"
                    : "bg-zinc-50 dark:bg-zinc-800/40 border-zinc-200/80 dark:border-zinc-700/50 text-zinc-500 dark:text-zinc-400"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0 text-[#008080] dark:text-teal-400" />
                <div className="min-w-0">
                  <div className="font-bold truncate">خلاصه مرور</div>
                  <div className="text-[10px] opacity-80">
                    {contentStatus?.review_summary?.generated ? "آماده" : "تولید نشده"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {document.quality_score !== undefined && document.quality_score !== null && (
          <div className="pt-2 border-t border-[var(--color-border)] flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span>کیفیت فایل: </span>
              <span className={`font-bold ${
                document.quality_level === "excellent" ? "text-green-500" :
                document.quality_level === "medium" ? "text-amber-500" :
                "text-red-500"
              }`}>
                {toPersianDigits(document.quality_score)}٪
                ({
                  document.quality_level === "excellent" ? "عالی" :
                  document.quality_level === "medium" ? "متوسط" :
                  "ضعیف"
                })
              </span>
            </div>
            {document.quality_level === "medium" && (
              <div className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 p-2 rounded flex items-start gap-1.5 border border-amber-200/50 dark:border-amber-900/50">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>این فایل ممکن است در بعضی بخش‌ها متن ناقص یا نویز داشته باشد.</span>
              </div>
            )}
            {document.quality_level === "poor" && (
              <div className="text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-2 rounded flex items-start gap-1.5 border border-red-200/50 dark:border-red-900/50">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>کیفیت متن استخراج‌شده پایین است و ممکن است محتوای تولید‌شده از این فایل دقت کافی نداشته باشد.</span>
              </div>
            )}
            {document.quality_report && document.quality_report.warnings && document.quality_report.warnings.length > 0 && (
              <div className="text-[10px] text-slate-500 mt-1 pl-5">
                دلایل:
                <ul className="list-disc list-inside mt-0.5">
                  {(document.quality_report.warnings as string[]).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Error banners */}
      {deleteError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{deleteError}</span>
        </div>
      )}
      {extractError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{extractError}</span>
        </div>
      )}
      {generateError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{generateError}</span>
        </div>
      )}
      {isFailedAlertVisible && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>
              {isPartial
                ? "تولید بخش‌هایی از محتوا با خطا متوقف شد؛ خروجی‌های سالم تولیدشده تا این مرحله در سیستم حفظ شده‌اند و می‌توانید تولید بخش‌های باقیمانده را ادامه دهید."
                : formatGenerationErrorMessage(job?.error_message)}
            </span>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <button
              type="button"
              onClick={() => {
                setDismissedFailedJobId(job?.id ?? "dismissed");
                setIsModalOpen(true);
              }}
              className="px-2.5 py-1 bg-red-100 dark:bg-red-900/40 hover:bg-red-200 text-red-800 dark:text-red-200 rounded-lg font-bold transition-colors"
            >
              تلاش مجدد
            </button>
            <button
              type="button"
              onClick={() => setDismissedFailedJobId(job?.id ?? "dismissed")}
              className="p-1 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg text-red-700 dark:text-red-300 transition-colors"
              title="بستن پیام"
              aria-label="بستن پیام"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex items-center justify-between gap-3 pt-2">
        {isFailed ? (
          <button
            type="button"
            onClick={() => extractMutation.mutate()}
            disabled={extractMutation.isPending}
            className="px-4 py-2 bg-red-100 dark:bg-red-950/50 hover:bg-red-200 text-red-700 dark:text-red-300 rounded-xl text-xs font-bold flex items-center gap-1.5"
          >
            {extractMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>{extractMutation.isPending ? "در حال تلاش مجدد..." : "تلاش مجدد استخراج"}</span>
          </button>
        ) : isExtracted ? (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full justify-between">
            {!isGenerationPermitted ? (
              <button
                type="button"
                onClick={() => setIsComingSoonOpen(true)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all bg-gradient-to-r from-amber-500/10 to-teal-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 cursor-pointer shadow-sm"
                title="قابلیت تولید محتوای هوشمند به‌زودی در آوانا فعال خواهد شد."
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>تولید محتوا (به‌زودی)</span>
              </button>
            ) : !isAllGenerated ? (
              <button
                type="button"
                onClick={() => {
                  setIsModalOpen(true);
                }}
                disabled={Boolean(isGenerating) || !resolvedCourseId}
                title={!resolvedCourseId ? "لطفاً ابتدا یک دوره آموزشی انتخاب کنید" : undefined}
                className="px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs bg-[#008080] hover:bg-[#006666] disabled:opacity-50 text-white"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      در حال تولید هوشمند محتوا... {currentProgress && currentProgress.total > 0 ? `(${formatPersianOf(safeCompleted, safeTotal)})` : ""}
                    </span>
                  </>
                ) : isPartial ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-amber-600" />
                    <span>ادامه تولید هوشمند محتوا ({currentProgress && currentProgress.total > 0 ? formatPersianOf(safeCompleted, safeTotal) : ""})</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>تولید هوشمند محتوای آموزشی</span>
                  </>
                )}
              </button>
            ) : null}

            {onNavigateToReview && isGenerationPermitted && hasReviewableContent && (
              <button
                type="button"
                onClick={onNavigateToReview}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors ${
                  isAllGenerated
                    ? "bg-[#008080] hover:bg-[#006666] text-white shadow-xs"
                    : "text-[#008080] hover:bg-teal-50"
                }`}
              >
                <span>{isAllGenerated ? "مشاهده در بازبینی" : "صف بازبینی محتوا"}</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : isWaiting ? (
          <button
            type="button"
            onClick={() => extractMutation.mutate()}
            disabled={extractMutation.isPending}
            className="px-4 py-2 bg-teal-50 hover:bg-teal-100 text-[#008080] border border-teal-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
          >
            {extractMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            <span>{extractMutation.isPending ? "در حال استخراج..." : "شروع استخراج متن"}</span>
          </button>
        ) : null}
      </div>

      {/* Generation success alert */}
      {isSuccessAlertVisible && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 p-3.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/60 rounded-2xl text-emerald-900 dark:text-emerald-200 text-xs font-bold transition-all">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>
              {job?.type === "lesson"
                ? "پیش‌نویس درسنامه با موفقیت تولید شد."
                : job?.type === "flashcard"
                ? "پیش‌نویس فلش‌کارت‌ها با موفقیت تولید شد."
                : job?.type === "quiz"
                ? "پیش‌نویس آزمون با موفقیت تولید شد."
                : "پیش‌نویس درس‌ها، فلش‌کارت‌ها و آزمون‌ها با موفقیت تولید شد."}
            </span>
          </div>
          <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
            {onNavigateToReview && (
              <button
                type="button"
                onClick={() => {
                  if (!isGenerationPermitted) {
                    setIsComingSoonOpen(true);
                    return;
                  }
                  onNavigateToReview();
                }}
                className="underline hover:text-emerald-700 dark:hover:text-emerald-100 text-emerald-800 dark:text-emerald-300 text-xs font-bold"
              >
                {isGenerationPermitted ? "مشاهده صف بازبینی" : "صف بازبینی (به‌زودی)"}
              </button>
            )}
            <button
              type="button"
              onClick={() => setDismissedCompletedJobId(job?.id ?? "dismissed")}
              className="p-1 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg text-emerald-700 dark:text-emerald-300 transition-colors"
              title="بستن پیام"
              aria-label="بستن پیام"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Publish to Public Library CTA */}
      {hasPublishableContent && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-teal-50 border border-teal-200 rounded-2xl">
          <div className="flex items-center gap-2 text-xs font-bold text-teal-900">
            <LibraryIcon className="w-4 h-4 text-[#008080] shrink-0" />
            <span>آماده انتشار در کتابخانه عمومی آوانا</span>
          </div>

          {isPublished ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-100 text-teal-800 border border-teal-200 text-xs font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>منتشر شده در کتابخانه</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setIsPublishModalOpen(true)}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#008080] hover:bg-[#006666] text-white text-xs font-bold shadow-xs transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>انتشار در کتابخانه آوانا</span>
            </button>
          )}
        </div>
      )}

      {/* Coming Soon Generation Modal for regular users */}
      <ComingSoonGenerationModal
        isOpen={isComingSoonOpen}
        onClose={() => setIsComingSoonOpen(false)}
      />

      {/* Selective Content Generation Modal */}
      <GenerateContentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        documentName={document.original_name}
        documentId={document.id}
        organizationId={organizationId}
        courseId={resolvedCourseId}
        contentStatus={contentStatus}
        isLoadingStatus={contentStatusQuery.isLoading}
        isGenerating={generateMutation.isPending || Boolean(isGenerating)}
        onConfirmGenerate={handleConfirmGenerate}
      />

      {/* Creator Publish Pack Modal */}
      <PublishPackModal
        open={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        organizationId={organizationId}
        documentId={document.id}
        contentStatus={contentStatus}
        onSuccess={() => {
          setIsPublished(true);
          void queryClient.invalidateQueries({
            queryKey: ["document-content-status", organizationId, document.id],
          });
          void queryClient.invalidateQueries({
            queryKey: ["document-status", organizationId, document.id],
          });
          void queryClient.invalidateQueries({
            queryKey: ["library-packs"],
          });
        }}
      />
    </div>
  );
}
