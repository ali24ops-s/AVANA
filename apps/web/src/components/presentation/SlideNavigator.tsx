import React from "react";
import { Layers, Wand2, AlertTriangle } from "lucide-react";
import type { PresentationSlideResource } from "@avana/contracts";
import type { PresentationSpeakerContent } from "@avana/domain";
import { Button, Badge } from "../ui/index.js";
import { toPersianDigits } from "./presentation-utils.js";

interface SlideNavigatorProps {
  slides: PresentationSlideResource[];
  selectedSlideId: string | null;
  onSelectSlide: (slideId: string) => void;
  onGenerateAll?: () => void;
  isGeneratingAll?: boolean;
  allCompleted?: boolean;
  completedCount?: number;
  totalSlides?: number;
  failedCount?: number;
  onRetryFailed?: () => void;
  currentGeneratingIndex?: number | null;
  className?: string;
}

export const SlideNavigator: React.FC<SlideNavigatorProps> = ({
  slides,
  selectedSlideId,
  onSelectSlide,
  onGenerateAll,
  isGeneratingAll = false,
  allCompleted = false,
  completedCount = 0,
  totalSlides = slides.length,
  failedCount = 0,
  onRetryFailed,
  currentGeneratingIndex = null,
  className = "",
}) => {
  // Sort slides by slide_index asc
  const sortedSlides = [...slides].sort((a, b) => a.slide_index - b.slide_index);

  return (
    <div
      className={`w-full h-full flex flex-col bg-white border-e border-[var(--color-border)] select-none ${className}`}
    >
      {/* Navigator Header */}
      <div className="p-3.5 border-b border-[var(--color-border)] flex items-center justify-between shrink-0 bg-slate-50/50">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-[#008080]" />
          <h3 className="text-xs sm:text-sm font-bold text-[var(--color-text)]">
            فهرست اسلایدها
          </h3>
        </div>
        <Badge variant="neutral" size="sm" className="font-bold">
          {toPersianDigits(sortedSlides.length)} اسلاید
        </Badge>
      </div>

      {/* Slide Thumbnails List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 min-h-0">
        {sortedSlides.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center text-slate-400 text-xs">
            <Layers className="w-8 h-8 text-slate-300 mb-2" />
            <p>هیچ اسلایدی یافت نشد.</p>
          </div>
        ) : (
          sortedSlides.map((slide) => {
            const isSelected = slide.id === selectedSlideId;
            const status = (slide.extraction_metadata?.generationStatus as string) || "draft";
            const isSlideGenerating =
              status === "generating" ||
              (isGeneratingAll && currentGeneratingIndex === slide.slide_index);
            const speechContent =
              slide.speech_content ??
              ((slide.extraction_metadata?.speechContent as PresentationSpeakerContent) || null);
            const hasSpeech = Boolean(speechContent?.speechText?.trim() || slide.speaker_notes?.trim());

            return (
              <div
                key={slide.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelectSlide(slide.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectSlide(slide.id);
                  }
                }}
                className={`group relative px-3 py-2.5 rounded-xl border text-start transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[#008080]/10 border-[#008080] shadow-xs ring-1 ring-[#008080]"
                    : "bg-white border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/60"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  {/* Slide Index Badge indicating status via color */}
                  <div
                    title={
                      hasSpeech
                        ? "متن ارائه آماده است"
                        : isSlideGenerating
                        ? "در حال تولید متن ارائه..."
                        : "در انتظار تولید متن ارائه"
                    }
                    className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 transition-colors ${
                      hasSpeech
                        ? isSelected
                          ? "bg-[#008080] text-white shadow-xs"
                          : "bg-[#008080]/15 text-[#008080] border border-[#008080]/30"
                        : isSlideGenerating
                        ? "bg-sky-100 text-sky-700 border border-sky-300 animate-pulse"
                        : isSelected
                        ? "bg-slate-700 text-white"
                        : "bg-slate-100 text-slate-500 border border-slate-200"
                    }`}
                  >
                    {toPersianDigits(slide.slide_index)}
                  </div>

                  {/* Title Only */}
                  <div className="flex-1 min-w-0">
                    <h4
                      className={`text-xs font-bold truncate leading-tight ${
                        isSelected ? "text-[#008080]" : "text-slate-800"
                      }`}
                    >
                      {slide.title || "اسلاید بدون عنوان"}
                    </h4>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Navigator Footer Action: Generate All Slides Presentation Text */}
      <div className="p-3 border-t border-[var(--color-border)] bg-slate-50/50 shrink-0 space-y-2.5">
        {/* Failed Slides Retry Alert */}
        {failedCount > 0 && !isGeneratingAll && onRetryFailed && (
          <div className="p-2 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-amber-900 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>{toPersianDigits(failedCount)} اسلاید نیاز به تلاش مجدد دارند.</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetryFailed}
              className="text-[11px] py-1 px-2 h-auto text-amber-800 border-amber-300 bg-white hover:bg-amber-100/60"
            >
              تلاش مجدد برای اسلایدهای ناموفق
            </Button>
          </div>
        )}

        {/* Real-time Progress Display */}
        {isGeneratingAll && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 flex items-center gap-1.5 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#008080] animate-ping" />
                در حال آماده‌سازی متن ارائه شما…
                {currentGeneratingIndex && (
                  <span className="text-slate-500 font-normal">
                    (اسلاید {toPersianDigits(currentGeneratingIndex)})
                  </span>
                )}
              </span>
              <span className="font-black text-[#008080] text-[11px]">
                {toPersianDigits(completedCount)} اسلاید از {toPersianDigits(totalSlides)} اسلاید آماده شده است
              </span>
            </div>

            <div className="w-full bg-slate-200/80 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-[#008080] h-1.5 rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${Math.min(
                    100,
                    Math.round((completedCount / Math.max(1, totalSlides)) * 100),
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        {onGenerateAll && (
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={onGenerateAll}
            disabled={isGeneratingAll || slides.length === 0}
            isLoading={isGeneratingAll}
            className="w-full gap-2 text-xs font-black shadow-xs cursor-pointer justify-center"
          >
            <Wand2 className="w-3.5 h-3.5" />
            <span>
              {isGeneratingAll
                ? "در حال تدوین متن اسلایدها..."
                : allCompleted
                ? "بازتولید متن تمام اسلایدها"
                : "تولید متن تمام اسلایدها"}
            </span>
          </Button>
        )}
      </div>
    </div>
  );
};
