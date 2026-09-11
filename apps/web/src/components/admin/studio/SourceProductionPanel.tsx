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
import type { OfficialCourse } from "../../../lib/api/admin.js";
import { DocumentUploader } from "../../documents/DocumentUploader.js";
import { GenerateContentModal } from "../../documents/GenerateContentModal.js";
import type { DocumentResource, DocumentStatus } from "@avana/contracts";

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
  const [selectedDocForGeneration, setSelectedDocForGeneration] =
    useState<DocumentResource | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [deleteConfirmDocId, setDeleteConfirmDocId] = useState<string | null>(
    null,
  );

  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const docsApi = createDocumentsApi(apiClient);

  // List documents for this course
  const docsQuery = useQuery({
    queryKey: ["course-documents", organizationId, course.id],
    queryFn: async () => {
      const res = await docsApi.listDocuments(organizationId);
      return res.items.filter(
        (d) => d.course_id === course.id || d.course_id === null,
      );
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
    const isDocAlreadyGenerated =
      selectedDocForGeneration.status === "review_pending" ||
      selectedDocForGeneration.status === "ready";
    generateMutation.mutate({
      documentId: selectedDocForGeneration.id,
      options: {
        ...selected,
        force: isDocAlreadyGenerated,
      },
    });
  };

  const isGenerating = generateMutation.isPending || course.status === "generating";

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
              {documents.length} سند
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
          {documents.map((doc) => {
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
            const isExtracted = doc.status === "extracted";
            const isGenerated =
              doc.status === "review_pending" || doc.status === "ready";
            const isFailed = doc.status === "failed";

            return (
              <div
                key={doc.id}
                className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4 sm:p-5 space-y-4 hover:border-[var(--color-border-hover,var(--color-border))] transition-all shadow-sm"
              >
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
                        {(doc.size_bytes / (1024 * 1024)).toFixed(2)} MB • تاریخ بارگذاری:{" "}
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
                    {isExtracted && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>استخراج‌شده و آماده</span>
                      </span>
                    )}
                    {isGenerated && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/20">
                        <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        <span>محتوا تولید شده (در انتظار بازبینی)</span>
                      </span>
                    )}
                    {isFailed && (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                        <span>خطا در استخراج</span>
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => setDeleteConfirmDocId(doc.id)}
                      disabled={deleteMutation.isPending}
                      className="p-1.5 text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-500/10 rounded-xl transition-colors"
                      title="حذف سند"
                      aria-label="حذف سند"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Delete Confirmation Box */}
                {deleteConfirmDocId === doc.id && (
                  <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl space-y-3">
                    <p className="text-xs text-rose-700 dark:text-rose-300 font-bold">
                      آیا از حذف این منبع اطمینان دارید؟
                    </p>
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setDeleteConfirmDocId(null)}
                        className="px-3 py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                      >
                        انصراف
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(doc.id)}
                        disabled={deleteMutation.isPending}
                        className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5"
                      >
                        {deleteMutation.isPending && (
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
                          {doc.quality_score}٪
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isFailed && (
                      <button
                        type="button"
                        onClick={() => extractMutation.mutate(doc.id)}
                        disabled={extractMutation.isPending}
                        className="px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-500/20 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <RefreshCw
                          className={`w-3.5 h-3.5 ${
                            extractMutation.isPending ? "animate-spin" : ""
                          }`}
                        />
                        <span>تلاش مجدد استخراج</span>
                      </button>
                    )}

                    {isExtracted && (
                      <button
                        type="button"
                        onClick={() => setSelectedDocForGeneration(doc)}
                        disabled={Boolean(isGenerating)}
                        className="px-4 sm:px-5 py-2.5 rounded-xl bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
                      >
                        {isGenerating ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>پایپ‌لاین تولید در حال اجراست...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="w-3.5 h-3.5" />
                            <span>تولید هوشمند محتوای آموزشی (AI Generation)</span>
                          </>
                        )}
                      </button>
                    )}

                    {isGenerated && (
                      <div className="flex items-center gap-2">
                        {onNavigateToReview && (
                          <button
                            type="button"
                            onClick={onNavigateToReview}
                            className="px-4 py-2 bg-[var(--color-primary-default)]/10 hover:bg-[var(--color-primary-default)]/20 text-[var(--color-primary-default)] border border-[var(--color-primary-default)]/20 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                          >
                            <span>مشاهده در بازبینی</span>
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setSelectedDocForGeneration(doc)}
                          disabled={Boolean(isGenerating)}
                          className="px-3.5 py-2 bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-card)] text-[var(--color-text)] border border-[var(--color-border)] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all"
                          title="تولید مجدد محتوا با هوش مصنوعی"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>تولید مجدد</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Generation Modal */}
      {selectedDocForGeneration && (
        <GenerateContentModal
          isOpen={Boolean(selectedDocForGeneration)}
          onClose={() => setSelectedDocForGeneration(null)}
          documentName={selectedDocForGeneration.original_name}
          isGenerating={generateMutation.isPending}
          onConfirmGenerate={handleConfirmGenerate}
        />
      )}
    </div>
  );
}
