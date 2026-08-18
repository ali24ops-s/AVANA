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
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createDocumentsApi } from "../../lib/api/documents.js";
import { createGenerationApi } from "../../lib/api/generation.js";
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

export function DocumentStatusCard({
  document,
  organizationId,
  courseId,
  onNavigateToReview,
}: DocumentStatusCardProps) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
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

  const currentStatus = statusQuery.data?.status.status ?? document.status;
  const pageCount = statusQuery.data?.status.page_count;
  const chunkCount = statusQuery.data?.status.chunk_count;
  const resolvedCourseId =
    (courseId && courseId.trim().length > 0 ? courseId : null) ??
    (document.course_id && document.course_id.trim().length > 0
      ? document.course_id
      : null);

  // Poll generation job status if active
  const jobQuery = useQuery({
    queryKey: ["generation-job", organizationId, resolvedCourseId, document.id, activeJobId],
    queryFn: () => genApi.getGenerationJob(organizationId, resolvedCourseId!, document.id, activeJobId!),
    enabled: Boolean(activeJobId && resolvedCourseId),
    refetchInterval: (query) => {
      const jobStatus = query.state.data?.job.status;
      if (jobStatus === "succeeded" || jobStatus === "failed") {
        return false;
      }
      return 2000;
    },
  });

  // Automatically refresh queries when generation finishes
  useEffect(() => {
    if (jobQuery.data?.job.status === "succeeded") {
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
    }
  }, [jobQuery.data?.job.status, organizationId, resolvedCourseId, document.id, queryClient]);

  // Trigger text extraction mutation (if retry needed)
  const extractMutation = useMutation({
    mutationFn: () => docsApi.triggerExtraction(organizationId, document.id),
    onSuccess: () => {
      setExtractError(null);
      void queryClient.invalidateQueries({
        queryKey: ["document-status", organizationId, document.id],
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
    },
    onError: (err: Error) => {
      setDeleteError(err.message || "خطا در حذف سند");
    },
  });

  // Trigger generation mutation
  const generateMutation = useMutation({
    mutationFn: () => {
      if (!resolvedCourseId) {
        throw new Error("لطفاً ابتدا یک دوره آموزشی انتخاب کنید.");
      }
      return genApi.triggerGeneration(
        organizationId,
        resolvedCourseId,
        document.id,
        {
          types: ["lesson", "flashcard", "quiz"],
        },
      );
    },
    onSuccess: (res) => {
      setGenerateError(null);
      setActiveJobId(res.job_id);
      if (resolvedCourseId) {
        void queryClient.invalidateQueries({
          queryKey: ["review-queue", organizationId, resolvedCourseId],
        });
      }
    },
    onError: (err: Error) => {
      setGenerateError(err.message || "خطا در شروع تولید هوشمند محتوا");
    },
  });

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
    Boolean(activeJobId && jobQuery.data?.job.status !== "succeeded" && jobQuery.data?.job.status !== "failed");

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
            <span>آیا از حذف این سند اطمینان دارید؟ تمامی پیش‌نویس‌ها و فایل‌های مرتبط پاک خواهند شد.</span>
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
      {jobQuery.data?.job.status === "failed" && (
        <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            خطا در تولید هوشمند: {jobQuery.data.job.error_message || "خطای ناشناخته در پردازش جاب"}
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
          <div className="flex items-center gap-3 w-full justify-between">
            <button
              type="button"
              onClick={() => generateMutation.mutate()}
              disabled={Boolean(isGenerating) || !resolvedCourseId}
              title={!resolvedCourseId ? "لطفاً ابتدا یک دوره آموزشی انتخاب کنید" : undefined}
              className="px-5 py-2.5 bg-[#008080] hover:bg-[#006666] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>در حال تولید هوشمند محتوا...</span>
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
                className="px-3.5 py-2 text-[#008080] hover:bg-[#008080]/10 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
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
      {jobQuery.data?.job.status === "succeeded" && (
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
    </div>
  );
}
