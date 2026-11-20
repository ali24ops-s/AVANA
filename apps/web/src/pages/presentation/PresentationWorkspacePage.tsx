import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  BookOpen,
  Clock,
  GraduationCap,
  AlertCircle,
  SlidersHorizontal,
  FileDown,
} from "lucide-react";
import {
  usePresentationProject,
  useGeneratePresentationSlide,
  usePresentationReferences,
  useGenerateAllPresentationSlides,
  usePresentationGenerationStatus,
  usePresentationPdfStatus,
} from "../../hooks/usePresentation.js";
import { presentationApi } from "../../lib/api/presentation.js";
import { SlideNavigator } from "../../components/presentation/SlideNavigator.js";
import { SlideCanvas } from "../../components/presentation/SlideCanvas.js";
import { SlideInspector } from "../../components/presentation/SlideInspector.js";
import { PresentationReferencesDrawer } from "../../components/presentation/PresentationReferencesDrawer.js";
import { PresentationPreviewModal } from "../../components/presentation/PresentationPreviewModal.js";
import { PresentationPdfExportModal } from "../../components/presentation/PresentationPdfExportModal.js";
import { BatchGenerationConfirmationModal } from "../../components/presentation/BatchGenerationConfirmationModal.js";
import {
  Button,
  Badge,
  LoadingState,
} from "../../components/ui/index.js";
import {
  toPersianDigits,
  PROJECT_STATUS_LABELS,
  ACADEMIC_LEVEL_LABELS,
} from "../../components/presentation/presentation-utils.js";
import type { PresentationSpeakerContent } from "@avana/domain";

export function PresentationWorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const {
    data: projectData,
    isLoading,
    isError,
    error,
    refetch,
  } = usePresentationProject(projectId);

  const { data: refData } = usePresentationReferences(projectId);
  const generateMutation = useGeneratePresentationSlide(projectId || "");
  const generateAllMutation = useGenerateAllPresentationSlides(projectId || "");

  // Real-time batch generation status polling
  const { data: genStatus } = usePresentationGenerationStatus(projectId);

  // Active slide selection
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null);

  // Modals and Panes state
  const [isReferencesOpen, setIsReferencesOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isBatchConfirmOpen, setIsBatchConfirmOpen] = useState(false);

  // PDF Status for slide extraction
  const { data: pdfStatus } = usePresentationPdfStatus(projectId);
  const isPdfReady = pdfStatus?.status === "ready";
  const pdfUrl = projectId ? presentationApi.getPdfUrl(projectId) : "";

  // Mobile active tab view: 'navigator' | 'canvas' | 'inspector'
  const [mobileView, setMobileView] = useState<"navigator" | "canvas" | "inspector">("canvas");

  const project = projectData?.project;
  const slides = projectData?.slides || [];
  const referencesCount = refData?.total ?? projectData?.references?.length ?? 0;

  const slideParam = searchParams.get("slide");

  const isGeneratingAll = Boolean(genStatus?.is_generating || generateAllMutation.isPending);

  const completedCount = slides.filter((s) => {
    const sp =
      s.speech_content ??
      ((s.extraction_metadata?.speechContent as PresentationSpeakerContent) || null);
    return Boolean(sp?.speechText || s.speaker_notes);
  }).length;

  const failedCount =
    genStatus?.failed_slides ??
    slides.filter((s) => s.extraction_metadata?.generationStatus === "failed").length;

  const totalSlides = slides.length;
  const allCompleted = totalSlides > 0 && completedCount === totalSlides;

  // Ensure an active slide is selected and synced with URL
  useEffect(() => {
    if (slides.length > 0) {
      // 1. Try to match by slideParam (ID or 1-based index)
      let targetSlide = slideParam
        ? slides.find((s) => s.id === slideParam || String(s.slide_index) === slideParam)
        : null;

      // 2. Fallback to existing selectedSlideId if valid
      if (!targetSlide && selectedSlideId) {
        targetSlide = slides.find((s) => s.id === selectedSlideId) || null;
      }

      // 3. Fallback to first slide sorted by slide_index
      if (!targetSlide) {
        const sorted = [...slides].sort((a, b) => a.slide_index - b.slide_index);
        targetSlide = sorted[0];
      }

      if (targetSlide && targetSlide.id !== selectedSlideId) {
        setSelectedSlideId(targetSlide.id);
        if (!slideParam || slideParam !== targetSlide.id) {
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.set("slide", targetSlide.id);
              return next;
            },
            { replace: true },
          );
        }
      }
    } else {
      setSelectedSlideId(null);
    }
  }, [slides, slideParam, selectedSlideId, setSearchParams]);

  const handleSelectSlide = (id: string) => {
    setSelectedSlideId(id);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("slide", id);
        return next;
      },
      { replace: true },
    );
    setMobileView("canvas");
  };

  // Find active slide
  const activeSlide =
    slides.find((s) => s.id === selectedSlideId) ||
    (slides.length > 0 ? slides[0] : null);

  const activeIndex = activeSlide?.slide_index || 1;

  // Handle slide selection by index (e.g. from Canvas arrows)
  const handleSelectByIndex = (targetIndex: number) => {
    const targetSlide = slides.find((s) => s.slide_index === targetIndex);
    if (targetSlide) {
      handleSelectSlide(targetSlide.id);
    }
  };

  // Single-slide generation
  const handleGenerateSlide = async (slideId: string) => {
    if (generateMutation.isPending || isGeneratingAll) return;
    try {
      await generateMutation.mutateAsync({ slideId });
    } catch {
      // Handled in mutation state and rendered in alert
    }
  };

  // Batch generation for all slides
  const handleGenerateAll = async (onlyUnprocessed = false) => {
    if (isGeneratingAll || slides.length === 0) return;
    try {
      await generateAllMutation.mutateAsync({ only_unprocessed: onlyUnprocessed });
    } catch {
      // Handled in mutation state
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F7F9FA] flex items-center justify-center font-sans" dir="rtl">
        <LoadingState message="در حال بارگذاری محیط کار دستیار ارائه..." />
      </div>
    );
  }

  // Error state / 404
  if (isError || !project) {
    return (
      <div className="min-h-screen bg-[#F7F9FA] flex items-center justify-center p-4 font-sans" dir="rtl">
        <div className="max-w-md w-full p-8 bg-white rounded-3xl border border-red-200 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-500 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            پروژه ارائه یافت نشد یا دسترسی غیرمجاز است
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {error instanceof Error
              ? error.message
              : "ممکن است این پروژه حذف شده باشد یا حساب کاربری شما اجازه دسترسی به آن را نداشته باشد."}
          </p>
          <div className="flex justify-center gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate("/presentations")}
            >
              بازگشت به فهرست ارائه‌ها
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => refetch()}
            >
              تلاش مجدد
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const statusConfig = PROJECT_STATUS_LABELS[project.status] || {
    label: project.status,
    variant: "neutral" as const,
  };

  const currentDisplayCompleted = genStatus?.completed_slides ?? completedCount;

  return (
    <div className="h-screen flex flex-col bg-[#F7F9FA] text-[var(--color-text)] font-sans overflow-hidden" dir="rtl">
      {/* Top Workspace Navigation Bar */}
      <header className="h-16 px-4 sm:px-6 bg-white border-b border-[var(--color-border)] flex items-center justify-between gap-4 shrink-0 z-30 shadow-xs">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to="/presentations"
            onClick={(e) => {
              if (typeof window !== "undefined" && window.sessionStorage) {
                const dirtyKeys = Object.keys(sessionStorage).filter((k) =>
                  k.startsWith(`avana_speech_draft_${projectId}`),
                );
                if (dirtyKeys.length > 0) {
                  const confirmExit = window.confirm(
                    "تغییرات ذخیره‌نشده‌ای در پیش‌نویس متن ارائه وجود دارد. آیا از بازگشت به فهرست ارائه‌ها اطمینان دارید؟",
                  );
                  if (!confirmExit) {
                    e.preventDefault();
                  }
                }
              }
            }}
            className="p-1.5 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0"
            title="بازگشت به فهرست ارائه‌ها"
          >
            <ChevronRight className="w-5 h-5" />
          </Link>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-black text-slate-800 truncate">
                {project.title}
              </h1>
              <Badge variant={statusConfig.variant} size="sm" className="hidden sm:inline-flex text-[10px]">
                {statusConfig.label}
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 hidden sm:flex">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#008080]" />
                {toPersianDigits(project.target_duration_minutes)} دقیقه
              </span>
              <span>•</span>
              <span className="flex items-center gap-1">
                <GraduationCap className="w-3 h-3 text-[#008080]" />
                {ACADEMIC_LEVEL_LABELS[project.academic_level] || project.academic_level}
              </span>
              <span>•</span>
              <span>{toPersianDigits(slides.length)} اسلاید</span>
            </div>
          </div>
        </div>

        {/* Center / Right Controls: Actions */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsExportModalOpen(true)}
            className="gap-1.5 text-xs text-slate-700 bg-white hover:text-[#008080] hover:border-[#008080]/40 transition-colors"
            title="دریافت فایل PDF ارائه شامل اسلایدها و متن سخنرانی"
          >
            <FileDown className="w-3.5 h-3.5 text-[#008080]" />
            <span className="hidden sm:inline">دریافت PDF</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsReferencesOpen(true)}
            className="gap-1.5 text-xs text-slate-700 bg-white"
          >
            <BookOpen className="w-3.5 h-3.5 text-[#008080]" />
            <span className="hidden sm:inline">منابع علمی</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-100 text-[#008080] font-bold text-[10px]">
              {toPersianDigits(referencesCount)}
            </span>
          </Button>

          <Button
            type="button"
            variant={isInspectorOpen ? "primary" : "outline"}
            size="sm"
            onClick={() => setIsInspectorOpen((prev) => !prev)}
            className={`gap-1.5 text-xs transition-colors ${
              isInspectorOpen
                ? "bg-[#008080] text-white hover:bg-[#006666]"
                : "text-slate-700 bg-white hover:text-slate-900"
            }`}
            title={isInspectorOpen ? "بستن سایدبار تنظیمات اسلاید" : "باز کردن سایدبار تنظیمات اسلاید"}
            aria-expanded={isInspectorOpen}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">تنظیمات اسلاید</span>
          </Button>
        </div>
      </header>

      {/* Workspace Content: Slide Canvas as Sole Primary View */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Column 1: Slide Navigator (Right Sidebar in RTL) */}
        <div
          className={`w-full lg:w-72 shrink-0 h-full ${
            mobileView === "navigator" ? "block" : "hidden lg:block"
          }`}
        >
          <SlideNavigator
            slides={slides}
            selectedSlideId={selectedSlideId}
            onSelectSlide={handleSelectSlide}
            onGenerateAll={() => setIsBatchConfirmOpen(true)}
            isGeneratingAll={isGeneratingAll}
            allCompleted={allCompleted}
            completedCount={currentDisplayCompleted}
            totalSlides={totalSlides}
            failedCount={failedCount}
            onRetryFailed={() => setIsBatchConfirmOpen(true)}
            currentGeneratingIndex={genStatus?.current_slide_index ?? null}
          />
        </div>

        {/* Column 2: Slide Canvas */}
        <div
          className={`flex-1 h-full min-w-0 ${
            mobileView === "canvas" ? "flex" : "hidden lg:flex"
          }`}
        >
          <SlideCanvas
            projectId={project.id}
            slide={activeSlide}
            totalSlides={slides.length}
            currentIndex={activeIndex}
            references={projectData?.references || []}
            onSelectSlide={handleSelectByIndex}
            onOpenGenerate={() => {
              if (activeSlide) {
                handleGenerateSlide(activeSlide.id);
              }
            }}
            isGenerating={
              (generateMutation.isPending &&
                generateMutation.variables?.slideId === activeSlide?.id) ||
              (isGeneratingAll && genStatus?.current_slide_index === activeSlide?.slide_index)
            }
              generateError={
                generateMutation.error instanceof Error
                  ? generateMutation.error.message
                  : null
              }
            />
          </div>

          {/* Column 3: Slide Inspector (Desktop side panel & Mobile slide-over drawer) */}
          <div
            className={`transition-all duration-200 ${
              isInspectorOpen
                ? "fixed inset-y-0 end-0 z-40 w-full sm:w-96 lg:static lg:w-88 shrink-0 h-full block shadow-2xl lg:shadow-none"
                : "hidden"
            }`}
          >
            <SlideInspector
              projectId={project.id}
              slide={activeSlide}
              references={projectData?.references || []}
              onClose={() => setIsInspectorOpen(false)}
            />
          </div>

          {/* Backdrop on mobile when inspector is open */}
          {isInspectorOpen && (
            <div
              className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-30 lg:hidden"
              onClick={() => setIsInspectorOpen(false)}
              aria-hidden="true"
            />
          )}
        </div>

      {/* Presentation References Drawer/Modal */}
      {projectId && (
        <PresentationReferencesDrawer
          projectId={projectId}
          isOpen={isReferencesOpen}
          onClose={() => setIsReferencesOpen(false)}
        />
      )}

      {/* Fullscreen Presentation Preview Modal */}
      {slides.length > 0 && (
        <PresentationPreviewModal
          slides={slides}
          initialSlideIndex={activeIndex}
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
        />
      )}

      {/* Presentation PDF Export Settings Modal */}
      {project && (
        <PresentationPdfExportModal
          projectId={project.id}
          projectTitle={project.title}
          slides={slides}
          isPdfReady={isPdfReady}
          pdfUrl={pdfUrl}
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
        />
      )}

      {/* Batch Generation Confirmation Modal with Real-time Balance Preview */}
      {projectId && (
        <BatchGenerationConfirmationModal
          projectId={projectId}
          isOpen={isBatchConfirmOpen}
          onClose={() => setIsBatchConfirmOpen(false)}
          onConfirm={(onlyUnprocessed) => {
            setIsBatchConfirmOpen(false);
            handleGenerateAll(onlyUnprocessed);
          }}
          isStarting={generateAllMutation.isPending}
        />
      )}
    </div>
  );
}
