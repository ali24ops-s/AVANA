import React from "react";
import {
  ChevronRight,
  ChevronLeft,
  Wand2,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Clock,
} from "lucide-react";
import type { PresentationSlideResource, PresentationReferenceResource } from "@avana/contracts";
import { SlideRenderer } from "./SlideRenderer.js";
import { SlideSpeechCard } from "./SlideSpeechCard.js";
import { Badge, Button } from "../ui/index.js";
import {
  toPersianDigits,
  SLIDE_GENERATION_STATUS_LABELS,
} from "./presentation-utils.js";

interface SlideCanvasProps {
  projectId?: string;
  slide: PresentationSlideResource | null;
  totalSlides: number;
  currentIndex: number;
  references?: PresentationReferenceResource[];
  onSelectSlide: (index: number) => void;
  onOpenPreview?: () => void;
  onOpenGenerate: () => void;
  isGenerating?: boolean;
  generateError?: string | null;
}

export const SlideCanvas: React.FC<SlideCanvasProps> = ({
  projectId,
  slide,
  totalSlides,
  currentIndex,
  references = [],
  onSelectSlide,
  onOpenGenerate,
  isGenerating = false,
  generateError = null,
}) => {
  if (!slide) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#F7F9FA]">
        <div className="w-16 h-16 rounded-3xl bg-slate-100 text-slate-400 flex items-center justify-center mb-4">
          <Layers className="w-8 h-8" />
        </div>
        <h3 className="text-base font-bold text-slate-700 mb-1">
          اسلایدی برای نمایش انتخاب نشده است
        </h3>
        <p className="text-xs text-slate-500 max-w-sm">
          از ستون سمت راست یک اسلاید را انتخاب کنید.
        </p>
      </div>
    );
  }

  // Determine slide status
  const generationStatus = (slide.extraction_metadata?.generationStatus as string) || "draft";
  const statusConfig = SLIDE_GENERATION_STATUS_LABELS[generationStatus] || {
    label: "پیش‌نویس",
    variant: "neutral" as const,
  };

  const hasPrevious = currentIndex > 1;
  const hasNext = currentIndex < totalSlides;

  return (
    <div className="flex-1 flex flex-col bg-[#F7F9FA] overflow-y-auto p-3 sm:p-5 lg:p-6 min-h-0">
      {/* Canvas Top Bar - Streamlined status and index counter without clutter */}
      <div className="w-full max-w-4xl mx-auto flex items-center justify-between mb-2 sm:mb-2.5 shrink-0">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <Badge variant={isGenerating ? "primary" : statusConfig.variant} size="sm">
            {isGenerating ? (
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#008080] animate-ping" />
                در حال تولید هوشمند...
              </span>
            ) : (
              statusConfig.label
            )}
          </Badge>

          <span className="text-xs font-bold text-slate-600">
            اسلاید {toPersianDigits(currentIndex)} از {toPersianDigits(totalSlides)}
          </span>
        </div>
      </div>

      {/* Main 16:9 Canvas Container */}
      <div className="w-full max-w-4xl mx-auto shrink-0 flex items-center justify-center">
        <div className="w-full relative group">
          <SlideRenderer
            slide={slide}
            totalSlides={totalSlides}
            className="transition-all duration-300 ring-1 ring-slate-200/80 hover:ring-slate-300 hover:shadow-md"
          />

          {isGenerating && (
            <div className="absolute inset-0 z-20 bg-white/70 backdrop-blur-xs rounded-2xl flex flex-col items-center justify-center p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#008080]/10 text-[#008080] flex items-center justify-center animate-spin mb-3">
                <Wand2 className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-1">
                دستیار هوشمند در حال تولید محتوای اسلاید است
              </h4>
              <p className="text-xs text-slate-500 max-w-xs">
                استنادهای علمی و ادعاها بر پایه منابع معتبر پروژه در حال استخراج و اعتبارسنجی هستند...
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Canvas Bottom Navigation Bar */}
      <div className="w-full max-w-4xl mx-auto flex items-center justify-between mt-3 sm:mt-4 pt-3 border-t border-slate-200/60 shrink-0">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onSelectSlide(currentIndex - 1)}
          disabled={!hasPrevious}
          className="gap-1 text-xs bg-white"
        >
          <ChevronRight className="w-4 h-4" />
          اسلاید قبلی
        </Button>

        <div className="text-xs font-semibold text-slate-500 hidden sm:block">
          کلیدهای جهت‌نما برای پیمایش اسلایدها
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onSelectSlide(currentIndex + 1)}
          disabled={!hasNext}
          className="gap-1 text-xs bg-white"
        >
          اسلاید بعدی
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>

      {/* Oral Presentation Speech Content (Primary Feature) */}
      <div className="w-full max-w-4xl mx-auto mt-6 shrink-0 pb-10">
        <SlideSpeechCard
          projectId={projectId}
          slide={slide}
          references={references}
          onGenerate={onOpenGenerate}
          isGenerating={isGenerating}
          generateError={generateError}
        />
      </div>
    </div>
  );
};
