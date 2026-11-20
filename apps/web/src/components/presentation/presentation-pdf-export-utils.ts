import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

// Ensure worker is configured
if (typeof window !== "undefined" && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
}

export interface ExtractSlideImagesOptions {
  pdfUrl: string;
  totalSlides: number;
  onProgress?: (current: number, total: number) => void;
  signal?: AbortSignal;
}

/**
 * Sequentially extracts crisp, memory-optimized slide images from the converted presentation PDF.
 * Sequential processing avoids spikes in GPU/canvas memory.
 * Uses JPEG quality 0.82 to keep payload small (~70-120KB per slide) while maintaining sharp print quality.
 */
export async function extractSlideImagesFromPdf(
  options: ExtractSlideImagesOptions,
): Promise<Record<number, string>> {
  const { pdfUrl, totalSlides, onProgress, signal } = options;
  const slideImages: Record<number, string> = {};

  if (!pdfUrl) return slideImages;

  let doc: pdfjsLib.PDFDocumentProxy | null = null;
  let loadingTask: pdfjsLib.PDFDocumentLoadingTask | null = null;

  try {
    loadingTask = pdfjsLib.getDocument({
      url: pdfUrl,
      withCredentials: true,
    });

    doc = await loadingTask.promise;
    if (signal?.aborted) return slideImages;

    const numPages = Math.min(totalSlides, doc.numPages);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });

    if (!ctx) {
      return slideImages;
    }

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      if (signal?.aborted) break;

      const page = await doc.getPage(pageNum);
      const unscaledViewport = page.getViewport({ scale: 1.0 });

      // Optimal 1280px width for standard 16:9 presentation slides in print (1280x720)
      const targetWidth = 1280;
      const scale = targetWidth / Math.max(1, unscaledViewport.width);
      const viewport = page.getViewport({ scale });

      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);

      await page.render({
        canvasContext: ctx,
        viewport,
      }).promise;

      // Quality 0.82 JPEG produces sharp readable slide text with small footprint
      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      slideImages[pageNum] = dataUrl;

      // Free page resources
      page.cleanup();

      onProgress?.(pageNum, numPages);
    }

    // Clean up temporary canvas
    canvas.width = 0;
    canvas.height = 0;
  } catch (err) {
    // If PDF extraction fails (e.g. network or corrupted PDF), log and return any extracted images
    // The backend and UI gracefully fallback to structured content reconstruction.
    // eslint-disable-next-line no-console
    console.warn("[PresentationPdfExport] Note: Could not extract real slide images from PDF:", err);
  } finally {
    if (doc) {
      try {
        await doc.destroy();
      } catch {
        // ignore
      }
    }
  }

  return slideImages;
}
