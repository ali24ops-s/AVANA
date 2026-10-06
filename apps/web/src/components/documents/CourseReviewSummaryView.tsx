import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Zap, FileText, Loader2, AlertCircle, Lock, ListOrdered, X } from "lucide-react";
import { Card, Button, Badge } from "@avana/ui";
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
  const [isCurriculumDrawerOpen, setIsCurriculumDrawerOpen] = useState(false);
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const docsApi = createDocumentsApi(apiClient);

  // Close curriculum drawer on Escape key (matching lessons behavior in LearningPage)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isCurriculumDrawerOpen) {
        setIsCurriculumDrawerOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isCurriculumDrawerOpen]);

  // Lock body scroll when curriculum drawer is open (matching lessons behavior in LearningPage)
  useEffect(() => {
    if (!isCurriculumDrawerOpen || typeof document === "undefined") return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isCurriculumDrawerOpen]);

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

  const renderChapterNavList = () => {
    return documents.map((doc, index) => {
      const isSelected = activeDocument?.id === doc.id;
      const isDocPreview = Boolean(doc.id === canonicalPreviewDocId);
      const isDocLocked = Boolean(isPreview && !isDocPreview);
      const displayTitle = stripChapterPrefix(doc.title);

      return (
        <button
          key={doc.id}
          type="button"
          onClick={() => {
            setSelectedDocId(doc.id);
            setIsCurriculumDrawerOpen(false);
          }}
          aria-current={isSelected ? "true" : undefined}
          title={doc.title}
          className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-right rounded-xl text-xs transition-all cursor-pointer select-none ${
            isSelected
              ? "bg-primary/10 text-primary font-bold border-r-3 border-primary shadow-xs"
              : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
          }`}
        >
          <span
            className={`inline-flex items-center justify-center min-w-[22px] h-5.5 px-1.5 rounded-md text-xs font-bold shrink-0 leading-none ${
              isSelected
                ? "bg-primary text-white shadow-xs"
                : "bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
            }`}
          >
            {toPersianDigits(index + 1)}
          </span>

          <span className="flex-1 min-w-0 text-xs sm:text-[13px] font-medium leading-snug break-words line-clamp-2 text-right">
            {displayTitle}
          </span>

          {isPreview && isDocPreview && (
            <Badge variant="info" size="sm">
              رایگان
            </Badge>
          )}

          {isDocLocked && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-medium flex items-center gap-1 leading-tight shrink-0">
              <Lock className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>قفل</span>
            </span>
          )}
        </button>
      );
    });
  };

  return (
    <div className="space-y-4 font-sans" dir="rtl">
      {/* Top Header Bar with Curriculum Drawer Trigger (Unified for all viewports) */}
      {documents.length > 1 && (
        <div className="flex items-center justify-between p-3.5 bg-[var(--color-surface)] rounded-card border border-[var(--color-border)] shadow-xs">
          <div className="flex items-center gap-2 text-xs min-w-0 flex-1">
            <FileText className="w-4 h-4 text-primary shrink-0" />
            <span className="text-[11px] font-bold text-primary dark:text-teal-300 bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-button truncate">
              {activeDocument ? `فصل فعال: ${stripChapterPrefix(activeDocument.title)}` : "انتخاب سرفصل"}
            </span>
          </div>
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => setIsCurriculumDrawerOpen(true)}
            title="نمایش سرفصل‌های دوره"
            aria-label="نمایش سرفصل‌های دوره"
            leftIcon={<ListOrdered className="w-3.5 h-3.5 text-primary" />}
            className="shrink-0"
          >
            سرفصل‌ها ({toPersianDigits(documents.length)})
          </Button>
        </div>
      )}

      {/* Unified Responsive Syllabus Drawer (Mobile, Tablet & Desktop) */}
      {documents.length > 1 &&
        isCurriculumDrawerOpen &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="relative z-[60]" dir="rtl">
            <div
              data-testid="curriculum-backdrop"
              className="fixed inset-0 z-[60] bg-[#0d1719]/50 backdrop-blur-xs transition-opacity duration-200 animate-in fade-in"
              onClick={() => setIsCurriculumDrawerOpen(false)}
              aria-hidden="true"
            />
            <aside
              data-testid="curriculum-drawer"
              className="fixed inset-y-0 start-0 z-[70] w-[88vw] sm:w-[480px] md:w-[576px] max-w-[576px] bg-[var(--color-surface)] border-inline-end border-[var(--color-border)] shadow-[0_8px_32px_rgba(0,0,0,0.12)] p-4 sm:p-5 flex flex-col animate-in rtl:slide-in-from-right ltr:slide-in-from-left duration-200"
              aria-label="سرفصل‌های دوره"
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-center justify-between pb-3.5 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-sm sm:text-base text-[var(--color-text)]">
                    سرفصل‌های دوره
                  </h2>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary/10 text-primary border border-primary/20">
                    {toPersianDigits(documents.length)} فصل
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCurriculumDrawerOpen(false)}
                  className="p-1.5 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
                  aria-label="بستن منوی سرفصل‌ها"
                  title="بستن منوی سرفصل‌ها"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="py-3 space-y-1.5 overflow-y-auto flex-1 custom-scrollbar">
                {renderChapterNavList()}
              </nav>
            </aside>
          </div>,
          document.body,
        )}

      {/* Main Content Area (Review Summary Viewer or Locked State) */}
      <main className="w-full space-y-6">
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
      </main>
    </div>
  );
}
