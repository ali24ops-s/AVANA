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
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createDocumentsApi } from "../../lib/api/documents.js";
import { createGenerationApi } from "../../lib/api/generation.js";
import { GenerateContentModal } from "./GenerateContentModal.js";
import { PublishPackModal } from "../library/PublishPackModal.js";
import type { DocumentResource, DocumentStatus } from "@avana/contracts";

export interface DocumentStatusCardProps {
  document: DocumentResource;
  organizationId: string;
  courseId?: string | null;
  onNavigateToReview?: () => void;
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

export function DocumentStatusCard({
  document,
  organizationId,
  courseId,
  onNavigateToReview,
}: DocumentStatusCardProps) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
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
      const currentStatus = query.state.data?.status.status ?? document.status;
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

  // Automatically refresh queries when generation finishes
  useEffect(() => {
    if (jobQuery.data?.job?.status === "succeeded") {
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
    mutationFn: (options?: { types?: ("lesson" | "flashcard" | "quiz" | "review_summary")[] }) => {
      if (!resolvedCourseId) {
        throw new Error("لطفاً ابتدا یک دوره آموزشی انتخاب کنید.");
      }
      return genApi.triggerGeneration(
        organizationId,
        resolvedCourseId,
        document.id,
        {
          types: options?.types ?? ["lesson", "flashcard", "quiz", "review_summary"],
        },
      );
    },
    onSuccess: (res) => {
      setGenerateError(null);
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
  }) => {
    const types: Array<"lesson" | "flashcard" | "quiz" | "review_summary"> = [];
    if (selected.lesson) types.push("lesson");
    if (selected.flashcards) types.push("flashcard");
    if (selected.exam) types.push("quiz");
    if (selected.review_summary) types.push("review_summary");

    generateMutation.mutate({ types });
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
  const isGenerating =
    generateMutation.isPending ||
    Boolean(
      activeJobId &&
        jobQuery.data?.job?.status !== "succeeded" &&
        jobQuery.data?.job?.status !== "failed" &&
        !jobQuery.isError,
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

  return (
    <div className="glass-panel rounded-xl card-inner-border p-5 space-y-4 shadow-ambient">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-teal-900/40 border border-teal-500/30 text-teal-400 flex items-center justify-center flex-shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-sm text-white truncate" dir="ltr">
              {document.original_name}
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">
              {(document.size_bytes / (1024 * 1024)).toFixed(2)} MB • تاریخ بارگذاری:{" "}
              {new Date(document.created_at).toLocaleDateString("fa-IR")}
            </p>
          </div>
        </div>

        {/* Status badge & Delete button */}
        <div className="flex items-center gap-2 flex-shrink-0">
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

      {/* Processing stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
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
        {document.quality_score !== undefined && document.quality_score !== null && (
          <div className="col-span-2 sm:col-span-3 pt-2 mt-2 border-t border-[var(--color-border)] flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span>کیفیت فایل: </span>
              <span className={`font-bold ${
                document.quality_level === "excellent" ? "text-green-500" :
                document.quality_level === "medium" ? "text-amber-500" :
                "text-red-500"
              }`}>
                {document.quality_score}٪
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
      {jobQuery.data?.job?.status === "failed" && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            {formatGenerationErrorMessage(jobQuery.data.job?.error_message)}
          </span>
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
            <button
              type="button"
              onClick={() => {
                if (!isAllGenerated) {
                  setIsModalOpen(true);
                }
              }}
              disabled={Boolean(isGenerating) || !resolvedCourseId || isAllGenerated}
              title={
                isAllGenerated
                  ? "درس، فلش‌کارت و آزمون این فایل قبلاً تولید شده‌اند."
                  : !resolvedCourseId
                  ? "لطفاً ابتدا یک دوره آموزشی انتخاب کنید"
                  : undefined
              }
              className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm ${
                isAllGenerated
                  ? "bg-slate-800 text-teal-400/80 border border-teal-500/30 cursor-not-allowed opacity-90"
                  : "bg-[#008080] hover:bg-[#006666] disabled:opacity-50 text-white"
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>در حال تولید هوشمند محتوا...</span>
                </>
              ) : isAllGenerated ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
                  <span>تمام محتوای این فایل تولید شده است</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>تولید هوشمند محتوای آموزشی</span>
                </>
              )}
            </button>

            {onNavigateToReview && (
              <button
                type="button"
                onClick={onNavigateToReview}
                className="px-3.5 py-2 text-[#008080] hover:bg-[#008080]/10 rounded-xl text-xs font-bold flex items-center justify-center gap-1 transition-colors"
              >
                <span>صف بازبینی محتوا</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ) : isWaiting ? (
          <button
            type="button"
            onClick={() => extractMutation.mutate()}
            disabled={extractMutation.isPending}
            className="px-4 py-2 bg-[#a7d0e6]/30 hover:bg-[#a7d0e6]/50 text-[#008080] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
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
      {jobQuery.data?.job?.status === "succeeded" && (
        <div className="flex items-center justify-between p-3.5 bg-[#008080]/10 border border-[#008080]/30 rounded-2xl text-[#008080] text-xs font-bold">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            <span>پیش‌نویس درس‌ها، فلش‌کارت‌ها و آزمون‌ها با موفقیت تولید شد.</span>
          </div>
          {onNavigateToReview && (
            <button
              type="button"
              onClick={onNavigateToReview}
              className="underline hover:text-[#006666] mr-2"
            >
              مشاهده صف بازبینی
            </button>
          )}
        </div>
      )}

      {/* Publish to Public Library CTA */}
      {hasPublishableContent && (
        <div className="flex items-center justify-between p-3.5 bg-teal-500/10 border border-teal-500/20 rounded-2xl">
          <div className="flex items-center gap-2 text-xs font-bold text-teal-300">
            <LibraryIcon className="w-4 h-4 text-teal-400" />
            <span>آماده انتشار در کتابخانه عمومی آوانا</span>
          </div>

          {isPublished ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-500/30 text-xs font-bold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>منتشر شده در کتابخانه</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setIsPublishModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow-md shadow-teal-900/30 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>انتشار در کتابخانه آوانا</span>
            </button>
          )}
        </div>
      )}

      {/* Selective Content Generation Modal */}
      <GenerateContentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        documentName={document.original_name}
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
        defaultTitle={document.original_name.replace(/\.[^/.]+$/, "")}
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
