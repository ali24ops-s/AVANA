import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Loader2, AlertCircle } from "lucide-react";
import { toPersianDigits } from "./presentation-utils.js";

// Configure pdfjs worker once
if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

export interface PdfSlideViewerProps {
  pdfUrl: string;
  slideIndex: number;
  totalSlides?: number;
  isFullscreen?: boolean;
  className?: string;
  onError?: (err: Error) => void;
}

export const PdfSlideViewer: React.FC<PdfSlideViewerProps> = ({
  pdfUrl,
  slideIndex,
  totalSlides,
  isFullscreen = false,
  className = "",
  onError,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [isLoadingDoc, setIsLoadingDoc] = useState(true);
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const activeRenderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  // 1. Load PDF Document (Cached across slide changes)
  useEffect(() => {
    let isCancelled = false;
    setIsLoadingDoc(true);
    setRenderError(null);

    const loadingTask = pdfjsLib.getDocument({
      url: pdfUrl,
      withCredentials: true,
    });

    loadingTask.promise
      .then((doc) => {
        if (!isCancelled) {
          setPdfDoc(doc);
          setIsLoadingDoc(false);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load PDF presentation";
          setRenderError(msg);
          setIsLoadingDoc(false);
          onError?.(err instanceof Error ? err : new Error(msg));
        }
      });

    return () => {
      isCancelled = true;
      loadingTask.destroy();
    };
  }, [pdfUrl, onError]);

  // 2. Render current slide page onto Canvas
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    let isCurrent = true;
    setIsRenderingPage(true);

    // Cancel any ongoing render task before starting a new page
    if (activeRenderTaskRef.current) {
      activeRenderTaskRef.current.cancel();
      activeRenderTaskRef.current = null;
    }

    // PDF pages are 1-based; clamp between 1 and numPages
    const targetPageNum = Math.max(1, Math.min(slideIndex, pdfDoc.numPages));

    pdfDoc
      .getPage(targetPageNum)
      .then((page) => {
        if (!isCurrent || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const context = canvas.getContext("2d", { alpha: false });
        if (!context) return;

        // High-DPI Sharpness factor (Retina 2x or 3x)
        const devicePixelRatio = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        const scaleMultiplier = isFullscreen ? Math.max(devicePixelRatio, 2.5) : Math.max(devicePixelRatio, 2.0);

        const viewport = page.getViewport({ scale: scaleMultiplier });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: context,
          viewport,
        };

        const renderTask = page.render(renderContext);
        activeRenderTaskRef.current = renderTask;

        return renderTask.promise;
      })
      .then(() => {
        if (isCurrent) {
          setIsRenderingPage(false);
        }
      })
      .catch((err: unknown) => {
        // Ignore expected cancellation errors when user skips slides quickly
        if ((err as { name?: string })?.name === "RenderingCancelledException") {
          return;
        }
        if (isCurrent) {
          const msg = err instanceof Error ? err.message : "Failed to render slide page";
          setRenderError(msg);
          setIsRenderingPage(false);
          onError?.(err instanceof Error ? err : new Error(msg));
        }
      });

    return () => {
      isCurrent = false;
      if (activeRenderTaskRef.current) {
        activeRenderTaskRef.current.cancel();
        activeRenderTaskRef.current = null;
      }
    };
  }, [pdfDoc, slideIndex, isFullscreen, onError]);

  if (renderError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-slate-900 text-slate-300 text-center select-none">
        <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
        <p className="text-xs font-bold text-slate-200">عدم امکان بارگذاری نمای بصری اسلاید</p>
        <p className="text-[11px] text-slate-400 mt-1 max-w-sm">{renderError}</p>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full h-full bg-[#0d1719] flex items-center justify-center overflow-hidden select-none ${className}`}
      dir="ltr"
    >
      {/* Target Canvas */}
      <canvas
        ref={canvasRef}
        className={`w-full h-full object-contain transition-opacity duration-200 ${
          isLoadingDoc || isRenderingPage ? "opacity-30" : "opacity-100"
        }`}
      />

      {/* Loading Overlay */}
      {(isLoadingDoc || isRenderingPage) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/30 backdrop-blur-xs text-white z-10 pointer-events-none">
          <Loader2 className="w-6 h-6 animate-spin text-[#008080] mb-2" />
          <span className="text-[11px] font-medium text-slate-200" dir="rtl">
            {isLoadingDoc ? "در حال بارگذاری اسلاید اصلی..." : "در حال پردازش وضوح اسلاید..."}
          </span>
        </div>
      )}

      {/* Slide Badge */}
      <div
        className="absolute bottom-2.5 left-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-[11px] font-bold border border-white/10 z-10 pointer-events-none"
        dir="rtl"
      >
        <span>اسلاید {toPersianDigits(slideIndex)}</span>
        {totalSlides && <span className="text-white/60"> از {toPersianDigits(totalSlides)}</span>}
      </div>
    </div>
  );
};
