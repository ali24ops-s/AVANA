import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Zap, FileText, Loader2, AlertCircle, Lock } from "lucide-react";
import { Card, Button } from "@avana/ui";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createDocumentsApi } from "../../lib/api/documents.js";
import { ReviewSummaryViewer } from "./ReviewSummaryViewer.js";
import { cleanEducationalTitle, toPersianDigits } from "@avana/domain";
import type { DocumentResource } from "@avana/contracts";

export interface CourseReviewSummaryViewProps {
  organizationId: string;
  courseId: string;
  modules?: Array<{ id: string; title: string; document_id?: string | null; sort_order?: number }>;
  previewDocumentId?: string | null;
  isPreview?: boolean;
  onNavigateToFlashcards?: () => void;
  onNavigateToQuiz?: () => void;
  onUnlock?: () => void;
}

export function stripChapterPrefix(title: string): string {
  if (!title) return "";
  const trimmed = title.trim();
  const stripped = trimmed.replace(
    /^فصل\s*(?:[0-9\u06F0-\u06F9]+(?:\.[0-9\u06F0-\u06F9]+)?|(?:بیست|سی|چهل|پنجاه|شصت|هفتاد|هشتاد|نود)\s*و\s*(?:اول|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم)|اول|دوم|سوم|چهارم|پنجم|ششم|هفتم|هشتم|نهم|دهم|یازدهم|دوازدهم|سیزدهم|چهاردهم|پانزدهم|شانزدهم|هفدهم|هجدهم|نوزدهم|بیستم)?\s*[:\-–—\.]?\s*/i,
    "",
  ).trim();
  return stripped.length > 0 ? stripped : trimmed;
}

export function CourseReviewSummaryView({
  organizationId,
  courseId,
  modules,
  previewDocumentId,
  isPreview,
  onNavigateToFlashcards,
  onNavigateToQuiz,
  onUnlock,
}: CourseReviewSummaryViewProps) {
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const docsApi = createDocumentsApi(apiClient);

  // Extract unique documents from modules in canonical module sort order
  const modulesWithDocs = (modules || []).filter(
    (m): m is typeof m & { document_id: string } => Boolean(m.document_id),
  );

  const docsQuery = useQuery({
    queryKey: ["course-documents", organizationId, courseId],
    queryFn: async () => {
      const [courseRes, unassignedRes] = await Promise.all([
        docsApi.listDocuments(organizationId, {
          courseId,
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
    enabled: modulesWithDocs.length === 0,
  });

  const documents: Array<{ id: string; title: string }> =
    modulesWithDocs.length > 0
      ? modulesWithDocs.map((m) => ({
          id: m.document_id,
          title: cleanEducationalTitle(m.title, "سرفصل آموزشی"),
        }))
      : (docsQuery.data ?? []).map((d) => ({
          id: d.id,
          title: cleanEducationalTitle(d.original_name, "سرفصل آموزشی"),
        }));

  // Canonical source of truth for free preview chapter
  const canonicalPreviewDocId =
    previewDocumentId ||
    (modulesWithDocs.length > 0 ? modulesWithDocs[0].document_id : documents[0]?.id) ||
    null;

  const activeDocument =
    documents.find((d) => d.id === selectedDocId) ??
    documents.find((d) => d.id === canonicalPreviewDocId) ??
    documents[0] ??
    null;

  if (modulesWithDocs.length === 0 && docsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (modulesWithDocs.length === 0 && docsQuery.isError) {
    return (
      <div className="p-6 rounded-card bg-[var(--color-surface)] border border-[var(--color-error)]/40 text-[var(--color-error)] text-xs flex items-center gap-2" dir="rtl">
        <AlertCircle className="w-5 h-5 shrink-0" />
        <span>خطا در دریافت اسناد دوره برای نمایش خلاصه مروری</span>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <Card className="p-12 text-center space-y-4 font-sans" dir="rtl">
        <div className="w-16 h-16 rounded-button bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center mx-auto shadow-xs">
          <Zap className="w-8 h-8" />
        </div>
        <div className="space-y-1 max-w-md mx-auto">
          <h3 className="text-base font-bold text-[var(--color-text)]">هنوز سندی برای این دوره بارگذاری نشده است</h3>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            برای ساخت و مرور خلاصه مروری ۱۰ تا ۱۵ دقیقه‌ای، لطفاً ابتدا جزوه یا فایل آموزشی خود را در بخش «منابع و اسناد (PDF)» بارگذاری کنید.
          </p>
        </div>
      </Card>
    );
  }

  const isActiveLocked = Boolean(
    isPreview && activeDocument && activeDocument.id !== canonicalPreviewDocId,
  );

  return (
    <div className="space-y-6 font-sans" dir="rtl">
      {/* Document Selector Header (if more than 1 document) */}
      {documents.length > 1 && (
        <Card className="p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <FileText className="w-4 h-4 text-[var(--color-primary)]" />
            <span className="font-bold text-[var(--color-text)]">انتخاب مبحث آموزشی:</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {documents.map((doc: { id: string; title: string }, index: number) => {
              const isSelected = activeDocument?.id === doc.id;
              const isDocPreview = Boolean(doc.id === canonicalPreviewDocId);
              const isDocLocked = Boolean(isPreview && !isDocPreview);
              const displayTitle = stripChapterPrefix(doc.title);

              return (
                <Button
                  key={doc.id}
                  variant={isSelected ? "primary" : "outline"}
                  size="md"
                  onClick={() => setSelectedDocId(doc.id)}
                  className="font-bold gap-2 h-auto min-h-[40px] px-3.5 sm:px-4 py-2 text-xs sm:text-sm leading-normal items-center"
                >
                  <span
                    className={`inline-flex items-center justify-center min-w-[22px] h-5.5 px-1.5 rounded-md text-xs font-bold shrink-0 leading-none ${
                      isSelected
                        ? "bg-white/25 text-white"
                        : "bg-[var(--color-primary-soft)] text-[var(--color-primary)] dark:bg-teal-950/60 dark:text-teal-300"
                    }`}
                  >
                    {toPersianDigits(index + 1)}
                  </span>
                  <span className="max-w-[180px] sm:max-w-[260px] truncate leading-normal py-0.5 inline-block text-right">
                    {displayTitle}
                  </span>
                  {isPreview && isDocPreview && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 font-medium leading-tight shrink-0">
                      رایگان
                    </span>
                  )}
                  {isDocLocked && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-medium flex items-center gap-1 leading-tight shrink-0">
                      <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>قفل</span>
                    </span>
                  )}
                </Button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Review Summary Content or Locked State */}
      {isActiveLocked && activeDocument ? (
        <Card className="p-8 sm:p-12 text-center space-y-5 font-sans shadow-xs" dir="rtl">
          <div className="w-16 h-16 rounded-button bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto shadow-xs">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2 max-w-lg mx-auto">
            <div className="flex items-center justify-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                <Lock className="w-3 h-3" />
                <span>مخصوص نسخه کامل دوره</span>
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-[var(--color-text)]">
              خلاصه مروری فصل «{activeDocument.title}» قفل است
            </h3>
            <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
              این فصل شامل خلاصه جامع نکات کلیدی، مقایسه‌ها و جمع‌بندی نکات پرتکرار آزمونی است که در نسخه کامل دوره یا با داشتن اشتراک آوانا پلاس در دسترس خواهد بود.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {onUnlock && (
              <Button
                variant="primary"
                size="md"
                onClick={onUnlock}
                leftIcon={<Lock className="w-4 h-4" />}
              >
                <span>مشاهده تعرفه‌ها و خرید دوره</span>
              </Button>
            )}
            {canonicalPreviewDocId && (
              <Button
                variant="outline"
                size="md"
                onClick={() => setSelectedDocId(canonicalPreviewDocId)}
                leftIcon={<Zap className="w-4 h-4 text-[var(--color-primary)]" />}
              >
                <span>مشاهده فصل اول (پیش‌نمایش رایگان)</span>
              </Button>
            )}
          </div>
        </Card>
      ) : activeDocument ? (
        <ReviewSummaryViewer
          key={activeDocument.id}
          organizationId={organizationId}
          documentId={activeDocument.id}
          courseId={courseId}
          documentTitle={activeDocument.title}
          onNavigateToFlashcards={onNavigateToFlashcards}
          onNavigateToQuiz={onNavigateToQuiz}
          onUnlock={onUnlock}
        />
      ) : null}
    </div>
  );
}
