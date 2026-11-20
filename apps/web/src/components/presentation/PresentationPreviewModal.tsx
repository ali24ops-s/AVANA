import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, ChevronRight, ChevronLeft, Maximize2 } from "lucide-react";
import type { PresentationSlideResource } from "@avana/contracts";
import { SlideRenderer } from "./SlideRenderer.js";
import { toPersianDigits } from "./presentation-utils.js";

interface PresentationPreviewModalProps {
  slides: PresentationSlideResource[];
  initialSlideIndex?: number;
  isOpen: boolean;
  onClose: () => void;
}

export const PresentationPreviewModal: React.FC<PresentationPreviewModalProps> = ({
  slides,
  initialSlideIndex = 1,
  isOpen,
  onClose,
}) => {
  const sortedSlides = [...slides].sort((a, b) => a.slide_index - b.slide_index);
  const totalSlides = sortedSlides.length;

  const [currentIndex, setCurrentIndex] = useState(initialSlideIndex);

  // Sync index when initialSlideIndex changes or modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(initialSlideIndex);
    }
  }, [isOpen, initialSlideIndex]);

  // Keyboard navigation & lock
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurrentIndex((prev) => Math.min(totalSlides, prev + 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurrentIndex((prev) => Math.max(1, prev - 1));
      } else if (e.key === " " || e.key === "Spacebar") {
        e.preventDefault();
        setCurrentIndex((prev) => (prev < totalSlides ? prev + 1 : prev));
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, totalSlides, onClose]);

  if (!isOpen || sortedSlides.length === 0) return null;

  const currentSlide =
    sortedSlides.find((s) => s.slide_index === currentIndex) || sortedSlides[0];

  const hasPrevious = currentIndex > 1;
  const hasNext = currentIndex < totalSlides;

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-[#0d1719]/95 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 text-white font-sans select-none"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-label="پیش‌نمایش تمام‌صفحه ارائه"
    >
      {/* Top Header Bar */}
      <div className="w-full max-w-6xl mx-auto flex items-center justify-between gap-4 pb-3 border-b border-slate-700/60 shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded-lg bg-[#008080]/20 text-[#008080]">
            <Maximize2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white truncate max-w-md">
              {currentSlide?.title || "پیش‌نمایش ارائه"}
            </h3>
            <span className="text-xs text-slate-400">
              اسلاید {toPersianDigits(currentIndex)} از {toPersianDigits(totalSlides)}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors text-xs font-bold cursor-pointer"
          aria-label="خروج از پیش‌نمایش"
        >
          <span>خروج</span>
          <span className="text-[10px] text-slate-400 font-mono">(Esc)</span>
          <X className="w-4 h-4 ms-1" />
        </button>
      </div>

      {/* Main Slide Presentation Stage */}
      <div className="w-full max-w-6xl mx-auto flex-1 flex items-center justify-center p-2 sm:p-4 min-h-0">
        <div className="w-full aspect-[16/9] max-h-[78vh] flex items-center justify-center">
          <SlideRenderer
            slide={currentSlide}
            totalSlides={totalSlides}
            isFullscreen={true}
            className="shadow-2xl ring-1 ring-white/10"
          />
        </div>
      </div>

      {/* Bottom Controls Bar */}
      <div className="w-full max-w-6xl mx-auto flex items-center justify-between pt-3 border-t border-slate-700/60 shrink-0 text-xs">
        <button
          type="button"
          onClick={() => setCurrentIndex((prev) => Math.max(1, prev - 1))}
          disabled={!hasPrevious}
          className={`flex items-center gap-1 px-4 py-2 rounded-xl border transition-all cursor-pointer ${
            hasPrevious
              ? "bg-slate-800 text-white border-slate-700 hover:bg-slate-700"
              : "bg-slate-900/50 text-slate-600 border-slate-800 cursor-not-allowed"
          }`}
        >
          <ChevronRight className="w-4 h-4" />
          اسلاید قبلی
        </button>

        <div className="text-slate-400 text-xs hidden sm:block">
          برای تغییر اسلایدها از کلیدهای جهت‌نما یا دکمه Space استفاده فرمایید.
        </div>

        <button
          type="button"
          onClick={() => setCurrentIndex((prev) => Math.min(totalSlides, prev + 1))}
          disabled={!hasNext}
          className={`flex items-center gap-1 px-4 py-2 rounded-xl border transition-all cursor-pointer ${
            hasNext
              ? "bg-slate-800 text-white border-slate-700 hover:bg-slate-700"
              : "bg-slate-900/50 text-slate-600 border-slate-800 cursor-not-allowed"
          }`}
        >
          اسلاید بعدی
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    </div>,
    document.body,
  );
};
