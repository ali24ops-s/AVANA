import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Zap,
  FileText,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Lock,
  ListOrdered,
  X,
  Bookmark,
  FolderTree,
  Sparkles,
} from "lucide-react";
import { Card, Button, Badge } from "@avana/ui";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createDocumentsApi } from "../../lib/api/documents.js";
import { createGenerationApi } from "../../lib/api/generation.js";
import { ReviewSummaryViewer } from "./ReviewSummaryViewer.js";
import { PersonalSummaryConfirmationModal } from "./PersonalSummaryConfirmationModal.js";
import { MindMapCanvas } from "../mindmap/MindMapCanvas.js";
import { usePersonalSummary } from "../../hooks/usePersonalSummary.js";
import { useMindMap } from "../../hooks/useMindMap.js";
import {
  type ReviewSummaryPayload,
  cleanEducationalTitle,
  toPersianDigits,
  formatTomanPrice,
} from "@avana/domain";
import { resolveChapterDocument } from "../../utils/chapterResolver.js";

export type SummaryTab = "official" | "personal" | "mindmap";

export interface CourseReviewSummaryViewProps {
  organizationId: string;
  courseId: string;
  modules?: Array<{ id: string; title: string; document_id?: string | null; sort_order?: number }>;
  previewDocumentId?: string | null;
  isPreview?: boolean;
  isOfficial?: boolean;
  isManagerOrAdmin?: boolean;
  onNavigateToFlashcards?: () => void;
  onNavigateToQuiz?: () => void;
  onUnlock?: () => void;
  selectedChapterId?: string | null;
  onSelectChapter?: (chapterId: string) => void;
  activeSummaryTab?: SummaryTab;
  onSelectSummaryTab?: (tab: SummaryTab) => void;
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
  isOfficial,
  isManagerOrAdmin,
  onNavigateToFlashcards,
  onNavigateToQuiz,
  onUnlock,
  selectedChapterId,
  onSelectChapter,
  activeSummaryTab,
  onSelectSummaryTab,
}: CourseReviewSummaryViewProps) {
  const [uncontrolledDocId, setUncontrolledDocId] = useState<string | null>(null);
  const currentChapterId = selectedChapterId !== undefined ? selectedChapterId : uncontrolledDocId;

  const [uncontrolledTab, setUncontrolledTab] = useState<SummaryTab>("official");
  const effectiveTab = activeSummaryTab !== undefined ? activeSummaryTab : uncontrolledTab;

  const handleTabChange = (newTab: SummaryTab) => {
    if (onSelectSummaryTab) {
      onSelectSummaryTab(newTab);
    } else {
      setUncontrolledTab(newTab);
    }
  };

  const [isCurriculumDrawerOpen, setIsCurriculumDrawerOpen] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const docsApi = createDocumentsApi(apiClient);
  const genApi = createGenerationApi(apiClient);

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
      const courseRes = await docsApi.listDocuments(organizationId, {
        courseId,
        limit: 100,
      });
      return courseRes.items;
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
          title: cleanEducationalTitle((d as any).original_name || (d as any).title, "سرفصل آموزشی"),
        }));

  // Canonical source of truth for free preview chapter
  const canonicalPreviewDocId =
    previewDocumentId ||
    (modulesWithDocs.length > 0 ? modulesWithDocs[0].document_id : documents[0]?.id) ||
    null;

  const isDocsLoading = modulesWithDocs.length === 0 && docsQuery.isLoading;

  const { activeDocument, activeModule, canonicalChapterId } = resolveChapterDocument({
    chapterId: currentChapterId,
    modules,
    documents,
    canonicalPreviewDocId,
    isDocumentsLoading: isDocsLoading,
  });

  const activeModuleId = activeModule?.id ?? activeDocument?.id ?? null;

  const handleChapterClick = (doc: { id: string; title: string }) => {
    const matchingModule = (modules || []).find(
      (m) => m.document_id === doc.id || m.id === doc.id,
    );
    const newCanonicalId = matchingModule?.id ?? doc.id;
    if (onSelectChapter) {
      onSelectChapter(newCanonicalId);
    } else {
      setUncontrolledDocId(doc.id);
    }
    setIsCurriculumDrawerOpen(false);
  };

  // Official review summary query (shared cache key with ReviewSummaryViewer)
  const officialSummaryQuery = useQuery({
    queryKey: ["review-summary", organizationId, activeDocument?.id, courseId],
    queryFn: () => (activeDocument ? genApi.getReviewSummary(organizationId, activeDocument.id, courseId) : null),
    enabled: Boolean(organizationId && activeDocument?.id),
    staleTime: 30_000,
  });

  const officialPayload = officialSummaryQuery.data?.content?.payload as ReviewSummaryPayload | undefined;
  const hasOfficialSummary = Boolean(
    officialPayload && Array.isArray(officialPayload.sections) && officialPayload.sections.length > 0,
  );

  // Personal Summary Hook
  const {
    personalSummary,
    hasPersonalSummary,
    currentAnnotations,
    costToman,
    isLoading: isPersonalLoading,
    isGenerating: isGeneratingPersonal,
    generateMutation: personalGenerateMutation,
  } = usePersonalSummary(activeModuleId, courseId);

  const formattedCost = `${toPersianDigits((costToman || 3000).toLocaleString("en-US").replace(",", "٬"))} تومان`;

  // Mind Map Hook
  const mindMapHook = useMindMap(activeModuleId, courseId);
  const {
    hasMindMap,
    payload: mindMapPayload,
    isGenerating: isGeneratingMindMap,
    generateMindMap,
    generateMutation: mindMapGenerateMutation,
  } = mindMapHook;

  // Reset mind map mutation state on chapter change to prevent state leakage
  useEffect(() => {
    mindMapGenerateMutation.reset();
  }, [activeModuleId]);

  // Auto-switch tab if the active one has no data but another one does
  useEffect(() => {
    if (!hasOfficialSummary && hasPersonalSummary && effectiveTab === "official") {
      handleTabChange("personal");
    } else if (!hasOfficialSummary && !hasPersonalSummary && hasMindMap && effectiveTab === "official") {
      handleTabChange("mindmap");
    }
  }, [hasOfficialSummary, hasPersonalSummary, hasMindMap, effectiveTab]);

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
          <h3 className="text-base font-bold text-[var(--color-text)]">
            {isOfficial && !isManagerOrAdmin
              ? "خلاصه مروری برای این دوره هنوز منتشر نشده است"
              : "هنوز سندی برای این دوره بارگذاری نشده است"}
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            {isOfficial && !isManagerOrAdmin
              ? "خلاصه مروری این دوره آموزشی به زودی پس از انتشار در دسترس قرار خواهد گرفت."
              : "برای ساخت و مرور خلاصه مروری ۱۰ تا ۱۵ دقیقه‌ای، لطفاً ابتدا جزوه یا فایل آموزشی خود را در بخش «منابع و اسناد (PDF)» بارگذاری کنید."}
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
          onClick={() => handleChapterClick(doc)}
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
                  onClick={() => {
                    const matchingModule = (modules || []).find(
                      (m) =>
                        m.document_id === canonicalPreviewDocId ||
                        m.id === canonicalPreviewDocId,
                    );
                    const previewId = matchingModule?.id ?? canonicalPreviewDocId;
                    if (onSelectChapter) {
                      onSelectChapter(previewId);
                    } else {
                      setUncontrolledDocId(canonicalPreviewDocId);
                    }
                  }}
                  leftIcon={<Zap className="w-4 h-4 text-[var(--color-primary)]" />}
                >
                  <span>مشاهده فصل اول (پیش‌نمایش رایگان)</span>
                </Button>
              )}
            </div>
          </Card>
        ) : activeDocument ? (
          <div className="space-y-4">
            {/* The 3 Tabs Navigation Bar */}
            <div
              role="tablist"
              aria-label="نوع خلاصه"
              className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2 overflow-x-auto"
            >
              <button
                type="button"
                role="tab"
                id="tab-official"
                aria-controls="tabpanel-official"
                aria-selected={effectiveTab === "official"}
                onClick={() => handleTabChange("official")}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  effectiveTab === "official"
                    ? "bg-primary text-white shadow-xs"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>خلاصه رسمی آوانا</span>
              </button>

              <button
                type="button"
                role="tab"
                id="tab-personal"
                aria-controls="tabpanel-personal"
                aria-selected={effectiveTab === "personal"}
                onClick={() => handleTabChange("personal")}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  effectiveTab === "personal"
                    ? "bg-primary text-white shadow-xs"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
                }`}
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>خلاصه شخصی من</span>
                {currentAnnotations.total_count > 0 && (
                  <span
                    className={`inline-flex items-center justify-center min-w-[18px] h-4.5 px-1 rounded-md text-[10px] font-bold ${
                      effectiveTab === "personal"
                        ? "bg-white/25 text-white"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {toPersianDigits(currentAnnotations.total_count)}
                  </span>
                )}
              </button>

              <button
                type="button"
                role="tab"
                id="tab-mindmap"
                aria-controls="tabpanel-mindmap"
                aria-selected={effectiveTab === "mindmap"}
                onClick={() => handleTabChange("mindmap")}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  effectiveTab === "mindmap"
                    ? "bg-primary text-white shadow-xs"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
                }`}
              >
                <FolderTree className="w-3.5 h-3.5" />
                <span>نقشه مفهومی</span>
              </button>
            </div>

            {/* TAB 1: Official Summary */}
            {effectiveTab === "official" && (
              <div id="tabpanel-official" role="tabpanel" aria-labelledby="tab-official" className="space-y-4">
                {officialSummaryQuery.isLoading ? (
                  <Card className="flex flex-col items-center justify-center p-12 text-center space-y-4 font-sans" dir="rtl">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <span className="text-xs text-[var(--color-text-muted)]">در حال بارگذاری خلاصه رسمی...</span>
                  </Card>
                ) : officialSummaryQuery.isError ? (
                  <Card className="flex flex-col items-center justify-center p-10 text-center space-y-4 font-sans" dir="rtl">
                    <AlertTriangle className="w-8 h-8 text-[var(--color-error)]" />
                    <p className="text-xs text-[var(--color-error)]">خطا در دریافت خلاصه مروری رسمی</p>
                    <Button variant="outline" size="sm" onClick={() => officialSummaryQuery.refetch()}>
                      تلاش مجدد
                    </Button>
                  </Card>
                ) : hasOfficialSummary ? (
                  <div className="space-y-6">
                    <ReviewSummaryViewer
                      key={`official-${activeDocument.id}`}
                      organizationId={organizationId}
                      documentId={activeDocument.id}
                      courseId={courseId}
                      documentTitle={activeDocument.title}
                      onNavigateToFlashcards={onNavigateToFlashcards}
                      onNavigateToQuiz={onNavigateToQuiz}
                      onUnlock={onUnlock}
                    />

                    {/* Personal CTA banner when user has annotations and hasn't made personal summary */}
                    {!hasPersonalSummary && currentAnnotations.total_count > 0 && (
                      <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-teal-500/10 via-teal-500/5 to-transparent border border-teal-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-right">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-primary shrink-0" />
                            <h4 className="font-bold text-sm sm:text-base text-[var(--color-text)]">
                              تولید خلاصه شخصی اختصاصی شما
                            </h4>
                            <Badge variant="primary" size="sm">
                              {formattedCost}
                            </Badge>
                          </div>
                          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                            بر اساس {toPersianDigits(currentAnnotations.highlights_count)} هایلایت و {toPersianDigits(currentAnnotations.notes_count)} یادداشت ثبت‌شده شما در این فصل.
                          </p>
                        </div>
                        <Button
                          variant="primary"
                          size="md"
                          onClick={() => setIsConfirmModalOpen(true)}
                          leftIcon={<Sparkles className="w-4 h-4" />}
                          className="shrink-0"
                        >
                          ساخت خلاصه شخصی من
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Official summary does not exist yet */
                  currentAnnotations.total_count > 0 ? (
                    <Card className="p-8 sm:p-12 text-center space-y-5 font-sans" dir="rtl">
                      <div className="w-16 h-16 rounded-button bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-xs">
                        <Sparkles className="w-8 h-8" />
                      </div>
                      <div className="space-y-2 max-w-lg mx-auto">
                        <h3 className="text-lg font-black text-[var(--color-text)]">
                          تولید خلاصه شخصی بر اساس هایلایت‌ها و یادداشت‌های شما
                        </h3>
                        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                          شما {toPersianDigits(currentAnnotations.highlights_count)} هایلایت و {toPersianDigits(currentAnnotations.notes_count)} یادداشت در این فصل دارید.
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                          (خلاصه رسمی آوانا برای این فصل هنوز منتشر نشده است)
                        </p>
                      </div>
                      <Button
                        variant="primary"
                        size="md"
                        onClick={() => setIsConfirmModalOpen(true)}
                        leftIcon={<Sparkles className="w-4 h-4" />}
                      >
                        ساخت خلاصه شخصی من ({formattedCost})
                      </Button>
                    </Card>
                  ) : (
                    <Card className="p-8 sm:p-12 text-center space-y-5 font-sans" dir="rtl">
                      <div className="w-16 h-16 rounded-button bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center mx-auto shadow-xs">
                        <Zap className="w-8 h-8" />
                      </div>
                      <div className="space-y-2 max-w-lg mx-auto">
                        <h3 className="text-lg font-black text-[var(--color-text)]">
                          خلاصه مروری هنوز برای این فصل ایجاد نشده است
                        </h3>
                        <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
                          خلاصه رسمی آوانا به زودی پس از انتشار در دسترس قرار خواهد گرفت. شما همچنین می‌توانید از نقشه مفهومی هوشمند استفاده کنید.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                        <Button
                          variant="outline"
                          size="md"
                          onClick={() => {
                            handleTabChange("mindmap");
                            if (!hasMindMap) {
                              void generateMindMap();
                            }
                          }}
                          leftIcon={<FolderTree className="w-4 h-4 text-primary" />}
                        >
                          ساخت نقشه مفهومی با هوش مصنوعی
                        </Button>
                      </div>
                    </Card>
                  )
                )}
              </div>
            )}

            {/* TAB 2: Personal Summary */}
            {effectiveTab === "personal" && (
              <div id="tabpanel-personal" role="tabpanel" aria-labelledby="tab-personal" className="space-y-4">
                {isPersonalLoading ? (
                  <Card className="flex flex-col items-center justify-center p-12 text-center space-y-4 font-sans" dir="rtl">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <span className="text-xs text-[var(--color-text-muted)]">در حال بررسی خلاصه شخصی...</span>
                  </Card>
                ) : isGeneratingPersonal && !personalSummary ? (
                  <Card className="flex flex-col items-center justify-center p-12 text-center space-y-4 font-sans" dir="rtl">
                    <div className="w-16 h-16 rounded-button bg-primary/10 text-primary flex items-center justify-center relative shadow-xs">
                      <Sparkles className="w-8 h-8 animate-pulse" />
                    </div>
                    <div className="space-y-2 max-w-md">
                      <h3 className="text-lg font-black text-[var(--color-text)]">
                        در حال تولید خلاصه شخصی بر اساس هایلایت‌ها و یادداشت‌های شما
                      </h3>
                      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                        موتور هوش مصنوعی آوانا در حال ترکیب و ساختاربندی نکات اختصاصی شماست...
                      </p>
                    </div>
                  </Card>
                ) : hasPersonalSummary && personalSummary ? (
                  <div className="space-y-4">
                    {!hasOfficialSummary && (
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-900 dark:text-amber-300 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>خلاصه رسمی آوانا برای این فصل هنوز آماده نشده است</span>
                      </div>
                    )}
                    <ReviewSummaryViewer
                      key={`personal-${activeDocument.id}-${personalSummary.version}`}
                      organizationId={organizationId}
                      documentId={activeDocument.id}
                      courseId={courseId}
                      documentTitle={activeDocument.title}
                      isPersonalSummary={true}
                      personalPayload={personalSummary.payload as ReviewSummaryPayload}
                      personalSummaryVersion={personalSummary.version}
                      highlightsCount={personalSummary.highlightsCount}
                      notesCount={personalSummary.notesCount}
                      hasNewAnnotations={currentAnnotations.has_new_annotations}
                      onRegeneratePersonal={() => setIsConfirmModalOpen(true)}
                      isRegeneratingPersonal={isGeneratingPersonal}
                      onNavigateToFlashcards={onNavigateToFlashcards}
                      onNavigateToQuiz={onNavigateToQuiz}
                      onUnlock={onUnlock}
                    />
                  </div>
                ) : (
                  /* Personal summary not generated yet */
                  currentAnnotations.total_count > 0 ? (
                    <Card className="p-8 sm:p-12 text-center space-y-5 font-sans" dir="rtl">
                      <div className="w-16 h-16 rounded-button bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-xs">
                        <Sparkles className="w-8 h-8" />
                      </div>
                      <div className="space-y-2 max-w-lg mx-auto">
                        <h3 className="text-lg font-black text-[var(--color-text)]">
                          تولید خلاصه شخصی بر اساس هایلایت‌ها و یادداشت‌های شما
                        </h3>
                        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                          شما {toPersianDigits(currentAnnotations.highlights_count)} هایلایت و {toPersianDigits(currentAnnotations.notes_count)} یادداشت در این فصل دارید.
                        </p>
                        {!hasOfficialSummary && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                            (خلاصه رسمی آوانا برای این فصل هنوز منتشر نشده است)
                          </p>
                        )}
                      </div>
                      <Button
                        variant="primary"
                        size="md"
                        onClick={() => setIsConfirmModalOpen(true)}
                        leftIcon={<Sparkles className="w-4 h-4" />}
                      >
                        ساخت خلاصه شخصی من ({formattedCost})
                      </Button>
                    </Card>
                  ) : (
                    <Card className="p-8 sm:p-12 text-center space-y-5 font-sans" dir="rtl">
                      <div className="w-16 h-16 rounded-button bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-xs">
                        <Bookmark className="w-8 h-8" />
                      </div>
                      <div className="space-y-2 max-w-lg mx-auto">
                        <h3 className="text-lg font-black text-[var(--color-text)]">
                          هنوز هایلایت یا یادداشتی برای این فصل ثبت نکرده‌اید
                        </h3>
                        <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
                          برای تولید خلاصه شخصی اختصاصی، کافی است هنگام مطالعه درسنامه، نکات مهم را هایلایت کنید یا یادداشت شخصی بنویسید. هوش مصنوعی آوانا خلاصه مرور جامع را اختصاصاً برای شما تولید خواهد کرد.
                        </p>
                      </div>
                    </Card>
                  )
                )}
              </div>
            )}

            {/* TAB 3: Mind Map */}
            {effectiveTab === "mindmap" && (
              <div id="tabpanel-mindmap" role="tabpanel" aria-labelledby="tab-mindmap" className="space-y-4">
                {mindMapHook.isLoading ? (
                  <Card className="flex flex-col items-center justify-center p-12 text-center space-y-4 font-sans" dir="rtl">
                    <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
                    <span className="text-xs text-[var(--color-text-muted)]">در حال بارگذاری نقشه مفهومی...</span>
                  </Card>
                ) : isGeneratingMindMap && !mindMapPayload ? (
                  <Card className="flex flex-col items-center justify-center p-12 text-center space-y-4 font-sans" dir="rtl">
                    <div className="w-16 h-16 rounded-button bg-teal-500/10 text-teal-600 flex items-center justify-center relative shadow-xs">
                      <FolderTree className="w-8 h-8 animate-pulse" />
                    </div>
                    <div className="space-y-2 max-w-md">
                      <h3 className="text-lg font-black text-[var(--color-text)]">
                        در حال تولید نقشه مفهومی هوشمند با هوش مصنوعی
                      </h3>
                      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                        استخراج درخت مفاهیم، روابط سلسله‌مراتبی و نکات کلیدی توسط مدل هوش مصنوعی در حال انجام است...
                      </p>
                    </div>
                  </Card>
                ) : hasMindMap && mindMapPayload ? (
                  <div className="w-full h-[650px] sm:h-[750px] rounded-2xl overflow-hidden border border-[var(--color-border)] shadow-xs bg-[var(--color-surface)]">
                    <MindMapCanvas
                      key={`mindmap-${activeModuleId}-${activeDocument.id}`}
                      mindMapHook={mindMapHook}
                      chapterTitle={activeDocument.title}
                    />
                  </div>
                ) : (
                  /* Mind map not generated yet */
                  <Card className="p-8 sm:p-14 text-center space-y-5 font-sans shadow-xs" dir="rtl">
                    <div className="w-16 h-16 rounded-button bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center mx-auto shadow-xs">
                      <FolderTree className="w-8 h-8" />
                    </div>
                    <div className="space-y-2 max-w-lg mx-auto">
                      <div className="flex items-center justify-center gap-2">
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-900 dark:bg-teal-950 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                          رایگان (۰ تومان)
                        </span>
                      </div>
                      <h3 className="text-lg sm:text-xl font-black text-[var(--color-text)]">
                        نقشه مفهومی هوشمند (Interactive AI Mind Map)
                      </h3>
                      <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
                        نقشه مفهومی ساختار درختی و ارتباطات مفاهیم این فصل را به شکل بصری و تعاملی ترسیم می‌کند تا تثبیت مباحث در حافظه سریع‌تر انجام شود.
                      </p>
                    </div>
                    {mindMapGenerateMutation.isError && (
                      <div
                        data-testid="mind-map-generate-error"
                        className="p-4 max-w-lg mx-auto rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-700 dark:text-rose-400 text-xs sm:text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-right"
                        dir="rtl"
                      >
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
                          <span>
                            {mindMapGenerateMutation.error instanceof Error
                              ? mindMapGenerateMutation.error.message
                              : "خطا در برقراری ارتباط با هوش مصنوعی آوانا. لطفاً دوباره تلاش کنید."}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs shrink-0 self-start sm:self-auto border-rose-300 dark:border-rose-800 hover:bg-rose-500/10"
                          onClick={() => {
                            void generateMindMap().catch(() => {});
                          }}
                          disabled={isGeneratingMindMap}
                        >
                          تلاش مجدد
                        </Button>
                      </div>
                    )}
                    <div className="pt-2">
                      <Button
                        variant="primary"
                        size="md"
                        onClick={() => {
                          void generateMindMap().catch(() => {});
                        }}
                        disabled={isGeneratingMindMap}
                        leftIcon={
                          isGeneratingMindMap ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Sparkles className="w-4 h-4" />
                          )
                        }
                      >
                        {isGeneratingMindMap ? "در حال تولید نقشه مفهومی..." : "ساخت نقشه مفهومی با هوش مصنوعی"}
                      </Button>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </div>
        ) : null}
      </main>

      {/* Transparent Payment & Confirmation Modal for Personal Summary */}
      {activeDocument && (
        <PersonalSummaryConfirmationModal
          isOpen={isConfirmModalOpen}
          onClose={() => setIsConfirmModalOpen(false)}
          onConfirm={async () => {
            try {
              await personalGenerateMutation.mutateAsync();
              setIsConfirmModalOpen(false);
              handleTabChange("personal");
            } catch {
              // Mutation error handled in modal
            }
          }}
          isGenerating={isGeneratingPersonal}
          chapterTitle={activeDocument.title}
          highlightsCount={currentAnnotations.highlights_count}
          notesCount={currentAnnotations.notes_count}
          costToman={costToman}
          errorMessage={personalGenerateMutation.error?.message}
        />
      )}
    </div>
  );
}
