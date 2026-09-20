import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Trash2,
  UploadCloud,
  ChevronLeft,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../../lib/api/client.js";
import { createDocumentsApi } from "../../../lib/api/documents.js";
import { createGenerationApi, type DocumentContentStatusResponse } from "../../../lib/api/generation.js";
import type { OfficialCourse } from "../../../lib/api/admin.js";
import { DocumentUploader } from "../../documents/DocumentUploader.js";
import { GenerateContentModal } from "../../documents/GenerateContentModal.js";
import type { DocumentResource, DocumentStatus } from "@avana/contracts";
import { formatPersianOf, toPersianDigits } from "@avana/domain";

export interface SourceProductionPanelProps {
  course: OfficialCourse;
  organizationId: string;
  onGenerationComplete?: () => void;
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
    lower.includes("quota") ||
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
  if (errorMessage.startsWith("خطا در تولید هوشمند:")) {
    return errorMessage;
  }
  return `خطا در تولید هوشمند: ${errorMessage}`;
}

export function SourceProductionPanel({
  course,
  organizationId,
  onGenerationComplete,
  onNavigateToReview,
}: SourceProductionPanelProps) {
  const [selectedDocForGeneration, setSelectedDocForGeneration] = useState<{
    doc: DocumentResource;
    contentStatus?: DocumentContentStatusResponse;
  } | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [deleteConfirmDocId, setDeleteConfirmDocId] = useState<string | null>(
    null,
  );

  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const docsApi = createDocumentsApi(apiClient);

  // List documents for this course (including course-assigned and general unassigned documents)
  const docsQuery = useQuery({
    queryKey: ["course-documents", organizationId, course.id],
    queryFn: async () => {
      const [courseRes, unassignedRes] = await Promise.all([
        docsApi.listDocuments(organizationId, {
          courseId: course.id,
          limit: 100,
        }),
        docsApi.listDocuments(organizationId, {
          used: "unused",
          limit: 100,
        }),
      ]);

      const docMap = new Map<string, DocumentResource>();
      for (const item of courseRes.items) {
        docMap.set(item.id, item);
      }
      for (const item of unassignedRes.items) {
        docMap.set(item.id, item);
      }
      return Array.from(docMap.values());
    },
    refetchInterval: (query) => {
      const docs = query.state.data ?? [];
      const hasTransient = docs.some((d) => TRANSIENT_STATUSES.has(d.status));
      return hasTransient ? 3000 : false;
    },
  });

  const documents = docsQuery.data ?? [];

  // Extract retry mutation
  const extractMutation = useMutation({
    mutationFn: (documentId: string) =>
      docsApi.triggerExtraction(organizationId, documentId),
    onSuccess: () => {
      setExtractError(null);
      void queryClient.invalidateQueries({
        queryKey: ["course-documents", organizationId, course.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["document-content-status"],
      });
    },
    onError: (err: Error) => {
      setExtractError(err.message || "خطا در استخراج مجدد متن سند");
    },
  });

  // Delete document mutation
  const deleteMutation = useMutation({
    mutationFn: (documentId: string) =>
      docsApi.deleteDocument(organizationId, documentId),
    onSuccess: () => {
      setDeleteConfirmDocId(null);
      void queryClient.invalidateQueries({
        queryKey: ["course-documents", organizationId, course.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["official-review-workspace", course.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["document-content-status"],
      });
    },
  });

  // Generation mutation calling existing official generation endpoint
  const generateMutation = useMutation({
    mutationFn: async ({
      documentId,
      options,
    }: {
      documentId: string;
      options: {
        lesson: boolean;
        flashcards: boolean;
        exam: boolean;
        review_summary: boolean;
        force?: boolean;
      };
    }) => {
      setGenerateError(null);
      const res = await fetch(
        `/v1/admin/content-studio/courses/${course.id}/generate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            documentId,
            lesson: options.lesson,
            flashcards: options.flashcards,
            exam: options.exam,
            review_summary: options.review_summary,
            force: options.force,
          }),
        },
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          errData.error?.message ||
            errData.message ||
            "خطا در شروع پایپ‌لاین تولید هوشمند محتوا",
        );
      }

      return res.json();
    },
    onSuccess: () => {
      setSelectedDocForGeneration(null);
      setGenerateError(null);
      void queryClient.invalidateQueries({
        queryKey: ["official-courses"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["official-review-workspace", course.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-documents", organizationId, course.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-hierarchy", course.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["active-generations"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["document-content-status"],
      });
      if (onGenerationComplete) onGenerationComplete();
    },
    onError: (err: Error) => {
      setGenerateError(formatGenerationErrorMessage(err.message));
    },
  });

  const handleConfirmGenerate = (selected: {
    lesson: boolean;
    flashcards: boolean;
    exam: boolean;
    review_summary: boolean;
  }) => {
    if (!selectedDocForGeneration) return;
    generateMutation.mutate({
      documentId: selectedDocForGeneration.doc.id,
      options: {
        lesson: selected.lesson,
        flashcards: selected.flashcards,
        exam: selected.exam,
        review_summary: selected.review_summary,
        force: false,
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Source Document Uploader */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-[var(--color-primary-default)]" />
              <span>بارگذاری منابع درسی (Source Ingestion)</span>
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              جزوات، رفرنس‌ها و کتب درسی (PDF/DOCX) را برای استخراج و تولید هوشمند محتوا بارگذاری کنید.
            </p>
          </div>
          <span className="text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-3 py-1 rounded-full border border-[var(--color-border)] w-fit">
            سازمان رسمی: {organizationId.slice(0, 8)}...
          </span>
        </div>

        <DocumentUploader
          organizationId={organizationId}
          courseId={course.id}
          onUploaded={() => {
            void docsQuery.refetch();
          }}
        />
      </div>

      {/* Uploaded Documents List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-bold text-[var(--color-text)] flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--color-primary-default)]" />
            <span>اسناد و متون استخراج‌شده</span>
          </h3>
          <div className="flex items-center gap-2">
            {onNavigateToReview && (
              <button
                type="button"
                onClick={onNavigateToReview}
                className="text-xs text-[var(--color-primary-default)] hover:text-[var(--color-primary-hover)] font-bold px-3 py-1 bg-[var(--color-primary-default)]/10 border border-[var(--color-primary-default)]/20 rounded-xl transition-colors"
              >
                مشاهده پیش‌نویس‌ها ←
              </button>
            )}
            <span className="text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-3 py-1 rounded-full border border-[var(--color-border)]">
              {toPersianDigits(documents.length)} سند
            </span>
          </div>
        </div>

        {/* Global Error Banner */}
        {generateError && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
            <div className="space-y-0.5">
              <div className="font-bold">خطا در تولید هوشمند:</div>
              <div>{generateError}</div>
            </div>
          </div>
        )}

        {extractError && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{extractError}</span>
          </div>
        )}

        {/* Loading state */}
        {docsQuery.isLoading && documents.length === 0 && (
          <div className="py-12 flex flex-col items-center justify-center gap-3 text-[var(--color-text-muted)] bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)]">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary-default)]" />
            <p className="text-xs">در حال بارگذاری اسناد دوره...</p>
          </div>
        )}

        {/* Empty state */}
        {documents.length === 0 && !docsQuery.isLoading && (
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-10 text-center space-y-3">
            <UploadCloud className="w-10 h-10 text-[var(--color-text-muted)] opacity-60 mx-auto" />
            <h4 className="text-sm font-bold text-[var(--color-text)]">
              هنوز سندی برای این دوره بارگذاری نشده است
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] max-w-md mx-auto">
              برای آغاز فرآیند تولید هوشمند دوره رسمی، فایل PDF رفرنس درسی را از کادر بالا بارگذاری نمایید.
            </p>
          </div>
        )}

        {/* Document Cards */}
        <div className="grid gap-3 sm:gap-4">
          {documents.map((doc) => (
            <SourceDocumentCard
              key={doc.id}
              doc={doc}
              organizationId={organizationId}
              courseId={course.id}
              isGenerating={generateMutation.isPending && selectedDocForGeneration?.doc.id === doc.id}
              isCourseGenerating={course.status === "generating"}
              onSelectGenerate={(selectedDoc, status) => {
                setSelectedDocForGeneration({ doc: selectedDoc, contentStatus: status });
              }}
              onNavigateToReview={onNavigateToReview}
              isDeleteConfirmOpen={deleteConfirmDocId === doc.id}
              onOpenDeleteConfirm={() => setDeleteConfirmDocId(doc.id)}
              onCloseDeleteConfirm={() => setDeleteConfirmDocId(null)}
              onConfirmDelete={() => deleteMutation.mutate(doc.id)}
              isDeleting={deleteMutation.isPending}
              onRetryExtract={() => extractMutation.mutate(doc.id)}
              isExtractingRetry={extractMutation.isPending}
            />
          ))}
        </div>
      </div>

      {/* Generation Modal */}
      {selectedDocForGeneration && (
        <GenerateContentModal
          isOpen={Boolean(selectedDocForGeneration)}
          onClose={() => setSelectedDocForGeneration(null)}
          documentName={selectedDocForGeneration.doc.original_name}
          documentId={selectedDocForGeneration.doc.id}
          organizationId={organizationId}
          courseId={course.id}
          contentStatus={selectedDocForGeneration.contentStatus}
          isGenerating={generateMutation.isPending}
          hideCostEstimate={true}
          onConfirmGenerate={handleConfirmGenerate}
        />
      )}
    </div>
  );
}

function SourceDocumentCard({
  doc,
  organizationId,
  courseId,
  isGenerating,
  isCourseGenerating,
  onSelectGenerate,
  onNavigateToReview,
  isDeleteConfirmOpen,
  onOpenDeleteConfirm,
  onCloseDeleteConfirm,
  onConfirmDelete,
  isDeleting,
  onRetryExtract,
  isExtractingRetry,
}: {
  doc: DocumentResource;
  organizationId: string;
  courseId: string;
  isGenerating: boolean;
  isCourseGenerating: boolean;
  onSelectGenerate: (doc: DocumentResource, contentStatus?: DocumentContentStatusResponse) => void;
  onNavigateToReview?: () => void;
  isDeleteConfirmOpen: boolean;
  onOpenDeleteConfirm: () => void;
  onCloseDeleteConfirm: () => void;
  onConfirmDelete: () => void;
  isDeleting: boolean;
  onRetryExtract: () => void;
  isExtractingRetry: boolean;
}) {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const genApi = createGenerationApi(apiClient);

  const contentStatusQuery = useQuery({
    queryKey: ["document-content-status", organizationId, doc.id, courseId],
    queryFn: () => genApi.getDocumentContentStatus(organizationId, doc.id, courseId),
    enabled: Boolean(organizationId && doc.id),
  });

  const contentStatus = contentStatusQuery.data;
  const isAllGenerated = Boolean(contentStatus?.all_generated);
  const hasReviewableContent = Boolean(
    contentStatus?.lesson?.generated ||
      contentStatus?.flashcards?.generated ||
      contentStatus?.exam?.generated ||
      contentStatus?.review_summary?.generated ||
      (contentStatus?.progress && contentStatus.progress.completed > 0) ||
      doc.status === "review_pending" ||
      doc.status === "ready",
  );
  const hasAnyGenerated = Boolean(
    contentStatus?.lesson?.generated ||
      contentStatus?.flashcards?.generated ||
      contentStatus?.exam?.generated ||
      contentStatus?.review_summary?.generated,
  );

  const completedCount = [
    contentStatus?.lesson?.generated,
    contentStatus?.flashcards?.generated,
    contentStatus?.exam?.generated,
    contentStatus?.review_summary?.generated,
  ].filter(Boolean).length;

  const isWaiting =
    doc.status === "uploaded" ||
    doc.status === "pending_validation" ||
    doc.status === "pending_extraction" ||
    doc.status === "pending_chunking" ||
    doc.status === "pending_generation";
  const isExtracting =
    doc.status === "extracting" ||
    doc.status === "chunking" ||
    doc.status === "validating";
  const isExtracted =
    doc.status === "extracted" ||
    doc.status === "review_pending" ||
    doc.status === "ready";
  const isFailed = doc.status === "failed";

  const isBusyGenerating = isGenerating || isCourseGenerating;

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4 sm:p-5 space-y-4 hover:border-[var(--color-border-hover,var(--color-border))] transition-all shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-default)]/10 border border-[var(--color-primary-default)]/20 text-[var(--color-primary-default)] flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h4
              className="font-bold text-sm text-[var(--color-text)] truncate"
              dir="ltr"
            >
              {doc.original_name}
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {toPersianDigits((doc.size_bytes / (1024 * 1024)).toFixed(2))} مگابایت • تاریخ بارگذاری:{" "}
              {new Date(doc.created_at).toLocaleDateString("fa-IR")}
            </p>
          </div>
        </div>

        {/* Status badge */}
        <div className="flex items-center gap-2 shrink-0">
          {isWaiting && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-text-muted)]" />
              <span>در صف انتظار</span>
            </span>
          )}
          {isExtracting && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600 dark:text-amber-400" />
              <span>در حال استخراج متن</span>
            </span>
          )}
          {isFailed && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
              <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span>خطا در استخراج</span>
            </span>
          )}
          {!isWaiting && !isExtracting && !isFailed && isAllGenerated && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
              <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>محتوا کامل تولید شده (در انتظار بازبینی)</span>
            </span>
          )}
          {!isWaiting && !isExtracting && !isFailed && !isAllGenerated && hasAnyGenerated && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>تولید بخشی از محتوا ({formatPersianOf(completedCount, 4)})</span>
            </span>
          )}
          {!isWaiting && !isExtracting && !isFailed && !hasAnyGenerated && isExtracted && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>استخراج‌شده و آماده</span>
            </span>
          )}

          <button
            type="button"
            onClick={onOpenDeleteConfirm}
            disabled={isDeleting}
            className="p-1.5 text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-500/10 rounded-xl transition-colors"
            title="حذف سند"
            aria-label="حذف سند"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Delete Confirmation Box */}
      {isDeleteConfirmOpen && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-3">
          <p className="text-xs text-rose-700 dark:text-rose-300 font-bold">
            آیا از حذف این منبع اطمینان دارید؟
          </p>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onCloseDeleteConfirm}
              className="px-3 py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={isDeleting}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5"
            >
              {isDeleting && (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              )}
              <span>تایید حذف</span>
            </button>
          </div>
        </div>
      )}

      {/* Action Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-[var(--color-border)]">
        <div className="text-xs text-[var(--color-text-muted)]">
          {doc.quality_score !== undefined && (
            <span className="flex items-center gap-1.5">
              <span>کیفیت استخراج:</span>
              <span
                className={`font-bold ${
                  doc.quality_level === "excellent"
                    ? "text-emerald-600 dark:text-emerald-400"
                    : doc.quality_level === "medium"
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {toPersianDigits(doc.quality_score)}٪
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isFailed && (
            <button
              type="button"
              onClick={onRetryExtract}
              disabled={isExtractingRetry}
              className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/20 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  isExtractingRetry ? "animate-spin" : ""
                }`}
              />
              <span>تلاش مجدد استخراج</span>
            </button>
          )}

          {!isAllGenerated && isExtracted && (
            <button
              type="button"
              onClick={() => onSelectGenerate(doc, contentStatus)}
              disabled={Boolean(isBusyGenerating)}
              className="px-4 sm:px-5 py-2.5 rounded-xl bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
            >
              {isBusyGenerating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>پایپ‌لاین تولید در حال اجراست...</span>
                </>
              ) : hasAnyGenerated ? (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>ادامه تولید هوشمند محتوا ({toPersianDigits(completedCount)} از ۴)</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>تولید هوشمند محتوای آموزشی (AI Generation)</span>
                </>
              )}
            </button>
          )}

          {hasReviewableContent && onNavigateToReview && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onNavigateToReview}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm ${
                  isAllGenerated
                    ? "bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-hover)] text-white"
                    : "bg-[var(--color-surface-warm)] hover:bg-[var(--color-border)] text-[var(--color-text)] border border-[var(--color-border)]"
                }`}
              >
                <span>مشاهده در بازبینی</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
