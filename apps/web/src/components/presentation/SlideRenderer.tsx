import React, { useState } from "react";
import {
  Quote,
  Sparkles,
  BarChart3,
  BookOpen,
  Loader2,
} from "lucide-react";
import type { PresentationSlideResource } from "@avana/contracts";
import type {
  SlideLayoutAssembly,
  AssembledContentBlock,
  AssembledBulletListBlock,
  AssembledTableBlock,
  AssembledTextBlock,
  AssembledStatBlock,
  AssembledQuoteBlock,
  ExtractedTextBlock,
  ExtractedTable,
  SlideUnsupportedContent,
} from "@avana/domain";
import { toPersianDigits } from "./presentation-utils.js";
import { usePresentationPdfStatus } from "../../hooks/usePresentation.js";
import { presentationApi } from "../../lib/api/presentation.js";
import { PdfSlideViewer } from "./PdfSlideViewer.js";

interface SlideRendererProps {
  slide: PresentationSlideResource;
  totalSlides?: number;
  className?: string;
  isFullscreen?: boolean;
}

export const SlideRenderer: React.FC<SlideRendererProps> = ({
  slide,
  totalSlides,
  className = "",
  isFullscreen = false,
}) => {
  const currentSlideIndex = slide.slide_index;
  const [hasPdfError, setHasPdfError] = useState(false);

  // Poll or read PDF readiness status for this project
  const { data: pdfStatus } = usePresentationPdfStatus(slide.project_id);

  const isPdfReady = pdfStatus?.status === "ready" && !hasPdfError;
  const isPdfProcessing = pdfStatus?.status === "processing";
  const isPdfFailed = pdfStatus?.status === "failed";
  const pdfUrl =
    slide.project_id && typeof presentationApi?.getPdfUrl === "function"
      ? presentationApi.getPdfUrl(slide.project_id)
      : "";

  const isPptxImported = Boolean(
    slide.extraction_metadata?.importedFromPptx ||
    (slide.extraction_metadata?.textBlocks && (slide.extraction_metadata.textBlocks as unknown[]).length > 0) ||
    slide.extracted_tables?.length > 0,
  );

  const layoutAssembly = slide.extraction_metadata?.layoutAssembly as
    | SlideLayoutAssembly
    | undefined;

  // Invariant: Always prioritize the original PowerPoint slide content without AI alteration.
  // Fall back to RenderAssembledSlide ONLY for legacy synthetic test mocks that lack PPTX blocks.
  const shouldRenderAssembled = Boolean(layoutAssembly && !isPptxImported);

  // 1. High-Fidelity Original PDF Slide Render (Requirement 1 & 9)
  if (isPdfReady && pdfUrl) {
    return (
      <div
        className={`relative w-full aspect-[16/9] bg-[#0d1719] rounded-2xl shadow-sm border border-[var(--color-border)] overflow-hidden flex flex-col justify-between select-text font-sans transition-all duration-200 ${className}`}
      >
        <PdfSlideViewer
          pdfUrl={pdfUrl}
          slideIndex={currentSlideIndex}
          totalSlides={totalSlides}
          isFullscreen={isFullscreen}
          onError={() => setHasPdfError(true)}
        />
      </div>
    );
  }

  // 2. Fallback to existing structured text/tables renderer
  return (
    <div
      className={`relative w-full aspect-[16/9] bg-white rounded-2xl shadow-sm border border-[var(--color-border)] overflow-hidden flex flex-col justify-between select-text font-sans transition-all duration-200 ${className}`}
      dir={layoutAssembly?.direction ?? "rtl"}
    >
      {/* Background Decorative Accent */}
      <div className="absolute top-0 right-0 w-full h-1.5 bg-gradient-to-r from-[#008080] via-[#A7D0E6] to-[#008080]/30 pointer-events-none" />

      {/* Background Processing Indicator */}
      {isPdfProcessing && (
        <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full bg-[#008080]/10 border border-[#008080]/20 text-[#008080] text-[10px] font-bold flex items-center gap-1.5 animate-pulse">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>در حال آماده‌سازی نسخه باکیفیت اسلاید...</span>
        </div>
      )}

      {/* Gentle notice when conversion failed (informative, no spinner) */}
      {isPdfFailed && (
        <div className="absolute top-3 left-3 z-10 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-500 text-[10px] font-medium flex items-center gap-1.5">
          <span>در حال نمایش نسخه متنی اسلاید</span>
        </div>
      )}

      {shouldRenderAssembled && layoutAssembly ? (
        <RenderAssembledSlide
          assembly={layoutAssembly}
          slide={slide}
          totalSlides={totalSlides}
          isFullscreen={isFullscreen}
        />
      ) : (
        <RenderFaithfulOriginalSlide
          slide={slide}
          currentSlideIndex={currentSlideIndex}
          totalSlides={totalSlides}
          isFullscreen={isFullscreen}
        />
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Subcomponent: Render Assembled Slide Layout                                */
/* -------------------------------------------------------------------------- */
interface RenderAssembledSlideProps {
  assembly: SlideLayoutAssembly;
  slide: PresentationSlideResource;
  totalSlides?: number;
  isFullscreen?: boolean;
}

const RenderAssembledSlide: React.FC<RenderAssembledSlideProps> = ({
  assembly,
  slide,
  totalSlides,
  isFullscreen,
}) => {
  const { header, body, footer } = assembly;

  const densityPadding =
    assembly.density === "compact"
      ? "p-3 sm:p-5 lg:p-6"
      : assembly.density === "spacious"
        ? "p-4 sm:p-8 lg:p-12"
        : "p-3.5 sm:p-6 lg:p-8";

  return (
    <div className={`w-full h-full flex flex-col justify-between ${densityPadding} overflow-hidden`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 sm:pb-4 shrink-0">
        <div className="min-w-0 flex-1">
          <h2
            className={`font-black text-slate-800 tracking-tight leading-snug line-clamp-2 ${
              isFullscreen
                ? "text-2xl sm:text-3xl md:text-4xl"
                : "text-base sm:text-xl md:text-2xl"
            }`}
          >
            {header.title || slide.title || "اسلاید بدون عنوان"}
          </h2>
          {header.subtitle && (
            <p
              className={`text-[#008080] font-medium mt-1 line-clamp-1 ${
                isFullscreen ? "text-base sm:text-lg" : "text-xs sm:text-sm"
              }`}
            >
              {header.subtitle}
            </p>
          )}
        </div>

        {/* Slide Number Badge */}
        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100/90 text-slate-600 font-bold shrink-0 text-xs sm:text-sm border border-slate-200">
          <span>{toPersianDigits(assembly.slideIndex)}</span>
          {totalSlides && (
            <>
              <span className="text-slate-400">/</span>
              <span className="text-slate-400">{toPersianDigits(totalSlides)}</span>
            </>
          )}
        </div>
      </div>

      {/* Body Content */}
      <div className="flex-1 overflow-y-auto py-3 sm:py-4 min-h-0">
        <RenderSlideBody body={body} isFullscreen={isFullscreen} />
      </div>

      {/* Footer / Citations */}
      {footer.citations && footer.citations.length > 0 && (
        <div className="pt-2 sm:pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] sm:text-xs text-slate-500 shrink-0">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <span className="font-bold text-[#008080] flex items-center gap-1 shrink-0">
              <BookOpen className="w-3 h-3" />
              منابع:
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {footer.citations.map((cite, idx) => (
                <span
                  key={cite.chunkId || idx}
                  className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded text-[10px] text-slate-600 truncate max-w-[200px]"
                  title={cite.sourceTitle}
                >
                  <strong className="text-[#008080]">{cite.citationLabel || `[${toPersianDigits(idx + 1)}]`}</strong>{" "}
                  {cite.sourceTitle}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-slate-400 font-medium shrink-0">
            <span>آوانا</span>
            <span>•</span>
            <span>Gemini 3.5 Flash-Lite</span>
          </div>
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Subcomponent: Render Slide Body & Dynamic Layouts                          */
/* -------------------------------------------------------------------------- */
interface RenderSlideBodyProps {
  body: SlideLayoutAssembly["body"];
  isFullscreen?: boolean;
}

const RenderSlideBody: React.FC<RenderSlideBodyProps> = ({ body, isFullscreen }) => {
  const { layoutType, blocks, columnRatio } = body;

  if (!blocks || blocks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-slate-400 text-xs sm:text-sm">
        محتوای ساختاریافته‌ای یافت نشد.
      </div>
    );
  }

  // 1. Two-column Layout
  if (layoutType === "two_column") {
    const half = Math.ceil(blocks.length / 2);
    const col1 = blocks.slice(0, half);
    const col2 = blocks.slice(half);

    const ratioStyles =
      columnRatio === "60/40"
        ? "grid-cols-1 md:grid-cols-5 [&>div:first-child]:md:col-span-3 [&>div:last-child]:md:col-span-2"
        : columnRatio === "40/60"
          ? "grid-cols-1 md:grid-cols-5 [&>div:first-child]:md:col-span-2 [&>div:last-child]:md:col-span-3"
          : "grid-cols-1 md:grid-cols-2";

    return (
      <div className={`grid ${ratioStyles} gap-4 sm:gap-6 h-full items-start`}>
        <div className="space-y-3">
          {col1.map((block, idx) => (
            <RenderContentBlock key={idx} block={block} isFullscreen={isFullscreen} />
          ))}
        </div>
        <div className="space-y-3">
          {col2.map((block, idx) => (
            <RenderContentBlock key={idx} block={block} isFullscreen={isFullscreen} />
          ))}
        </div>
      </div>
    );
  }

  // 2. Single or Multi-block Normal Layout
  return (
    <div className="space-y-3 sm:space-y-4 h-full flex flex-col justify-center">
      {blocks.map((block, idx) => (
        <RenderContentBlock key={idx} block={block} isFullscreen={isFullscreen} />
      ))}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Subcomponent: Render Content Block by Kind                                 */
/* -------------------------------------------------------------------------- */
interface RenderContentBlockProps {
  block: AssembledContentBlock;
  isFullscreen?: boolean;
}

const RenderContentBlock: React.FC<RenderContentBlockProps> = ({ block, isFullscreen }) => {
  switch (block.kind) {
    case "bullet_list":
      return <RenderBulletBlock block={block} isFullscreen={isFullscreen} />;
    case "table":
      return <RenderTableBlock block={block} isFullscreen={isFullscreen} />;
    case "statistic_highlight":
      return <RenderStatBlock block={block} isFullscreen={isFullscreen} />;
    case "quote":
      return <RenderQuoteBlock block={block} isFullscreen={isFullscreen} />;
    case "text":
    default:
      return <RenderTextBlock block={block as AssembledTextBlock} isFullscreen={isFullscreen} />;
  }
};

const RenderBulletBlock: React.FC<{ block: AssembledBulletListBlock; isFullscreen?: boolean }> = ({
  block,
  isFullscreen,
}) => {
  return (
    <ul className="space-y-2 sm:space-y-2.5">
      {block.items.map((item, idx) => (
        <li
          key={idx}
          className={`flex items-start gap-2.5 text-slate-700 leading-relaxed font-medium ${
            isFullscreen ? "text-base sm:text-lg" : "text-xs sm:text-sm"
          }`}
        >
          <div className="w-2 h-2 rounded-full bg-[#008080] mt-1.5 shrink-0" />
          <span className="flex-1">{item}</span>
        </li>
      ))}
    </ul>
  );
};

const RenderTableBlock: React.FC<{ block: AssembledTableBlock; isFullscreen?: boolean }> = ({
  block,
  isFullscreen,
}) => {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-slate-200">
      <table
        className={`w-full text-start border-collapse ${
          isFullscreen ? "text-sm sm:text-base" : "text-xs sm:text-sm"
        }`}
      >
        {block.headers && block.headers.length > 0 && (
          <thead className="bg-[#008080]/10 border-b border-slate-200 text-[#008080] font-bold">
            <tr>
              {block.headers.map((h, idx) => (
                <th key={idx} className="p-2 sm:p-2.5 text-start font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody className="divide-y divide-slate-100 bg-white">
          {block.rows.map((row, rIdx) => (
            <tr key={rIdx} className="hover:bg-slate-50 transition-colors">
              {row.map((cell, cIdx) => (
                <td key={cIdx} className="p-2 sm:p-2.5 text-slate-700 font-medium">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {block.caption && (
        <div className="text-[10px] text-slate-500 p-1.5 bg-slate-50 border-t border-slate-200 text-center font-medium">
          {block.caption}
        </div>
      )}
    </div>
  );
};

const RenderStatBlock: React.FC<{ block: AssembledStatBlock; isFullscreen?: boolean }> = ({
  block,
  isFullscreen,
}) => {
  return (
    <div className="p-4 sm:p-6 rounded-2xl bg-gradient-to-br from-[#008080]/5 to-[#A7D0E6]/10 border border-[#008080]/20 flex flex-col items-center justify-center text-center">
      <div
        className={`font-black text-[#008080] tracking-tight ${
          isFullscreen ? "text-4xl sm:text-6xl" : "text-2xl sm:text-4xl"
        }`}
      >
        {block.metricValue}
      </div>
      <div
        className={`font-bold text-slate-800 mt-1 sm:mt-2 ${
          isFullscreen ? "text-lg sm:text-xl" : "text-xs sm:text-sm"
        }`}
      >
        {block.metricLabel}
      </div>
      {block.supportingText && (
        <div className="text-xs text-slate-500 mt-1 max-w-md font-medium">
          {block.supportingText}
        </div>
      )}
    </div>
  );
};

const RenderQuoteBlock: React.FC<{ block: AssembledQuoteBlock; isFullscreen?: boolean }> = ({
  block,
  isFullscreen,
}) => {
  return (
    <div className="relative p-4 sm:p-6 rounded-2xl bg-amber-50/50 border border-amber-200/60 my-2">
      <Quote className="w-8 h-8 text-amber-300 absolute top-2 right-2 -scale-x-100 opacity-40" />
      <p
        className={`italic text-slate-800 font-medium leading-relaxed relative z-10 ${
          isFullscreen ? "text-lg sm:text-xl" : "text-xs sm:text-sm"
        }`}
      >
        «{block.quoteText}»
      </p>
      {block.attribution && (
        <div className="text-start mt-2 text-xs font-bold text-[#008080]">
          — {block.attribution}
        </div>
      )}
    </div>
  );
};

const RenderTextBlock: React.FC<{ block: AssembledTextBlock; isFullscreen?: boolean }> = ({
  block,
  isFullscreen,
}) => {
  return (
    <div className="space-y-2">
      {block.paragraphs.map((p, idx) => (
        <p
          key={idx}
          className={`text-slate-700 leading-relaxed font-medium ${
            isFullscreen ? "text-base sm:text-lg" : "text-xs sm:text-sm"
          }`}
        >
          {p}
        </p>
      ))}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Subcomponent: Render Faithful Original PPTX Slide                          */
/* -------------------------------------------------------------------------- */
interface RenderFaithfulOriginalSlideProps {
  slide: PresentationSlideResource;
  currentSlideIndex: number;
  totalSlides?: number;
  isFullscreen?: boolean;
}

const RenderFaithfulOriginalSlide: React.FC<RenderFaithfulOriginalSlideProps> = ({
  slide,
  currentSlideIndex,
  totalSlides,
  isFullscreen,
}) => {
  const metadata = slide.extraction_metadata || {};
  const slideImageUrl =
    (metadata.slideImageUrl as string) ||
    (metadata.slideImage as string) ||
    null;

  // Mode A: Direct High-Quality Slide Image Rendering if available
  if (slideImageUrl) {
    return (
      <div className="w-full h-full relative bg-slate-900 flex items-center justify-center overflow-hidden">
        <img
          src={slideImageUrl}
          alt={slide.title || `اسلاید ${currentSlideIndex}`}
          className="w-full h-full object-contain"
        />
        <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-xs text-white text-xs font-bold">
          <span>{toPersianDigits(currentSlideIndex)}</span>
          {totalSlides && <span> / {toPersianDigits(totalSlides)}</span>}
        </div>
      </div>
    );
  }

  // Mode B: High-Fidelity Structured Original PowerPoint Content Rendering
  const textBlocks = (metadata.textBlocks as ExtractedTextBlock[] | undefined) || [];
  const tables = slide.extracted_tables || (metadata.extractedTables as ExtractedTable[] | undefined) || [];
  const unsupportedContent = metadata.unsupportedContent as SlideUnsupportedContent | undefined;
  const hasContent = Boolean(
    slide.title ||
    slide.raw_text ||
    textBlocks.length > 0 ||
    tables.length > 0,
  );

  return (
    <div className="w-full h-full flex flex-col justify-between p-3.5 sm:p-6 lg:p-8 overflow-hidden bg-white">
      {/* Header with Original PowerPoint Slide Title & Number */}
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2.5 sm:pb-4 shrink-0">
        <div className="min-w-0 flex-1">
          <h2
            className={`font-black text-slate-800 leading-snug line-clamp-2 ${
              isFullscreen
                ? "text-2xl sm:text-3xl md:text-4xl"
                : "text-sm sm:text-lg md:text-xl"
            }`}
          >
            {slide.title || "اسلاید بدون عنوان"}
          </h2>
          {slide.has_visuals && slide.visual_summary && (
            <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 mt-1 font-medium">
              <BarChart3 className="w-3 h-3 text-[#008080]" />
              {slide.visual_summary}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full bg-slate-100 text-slate-600 font-bold shrink-0 text-xs sm:text-sm border border-slate-200">
          <span>{toPersianDigits(currentSlideIndex)}</span>
          {totalSlides && (
            <>
              <span className="text-slate-400">/</span>
              <span className="text-slate-400">{toPersianDigits(totalSlides)}</span>
            </>
          )}
        </div>
      </div>

      {/* Main Body: Structured Text, Bullets, and Tables */}
      <div className="flex-1 overflow-y-auto py-2.5 sm:py-4 min-h-0 space-y-3">
        {hasContent ? (
          <>
            {/* 1. Structured Text Blocks from PPTX Shape Tree */}
            {textBlocks.length > 0 ? (
              <div className="space-y-2.5">
                {textBlocks.map((block, idx) => {
                  if (block.type === "title" && block.text !== slide.title) {
                    return (
                      <h3
                        key={idx}
                        className={`font-bold text-[#008080] ${
                          isFullscreen ? "text-lg sm:text-xl" : "text-xs sm:text-sm"
                        }`}
                      >
                        {block.text}
                      </h3>
                    );
                  }
                  if (block.type === "bullet") {
                    return (
                      <div
                        key={idx}
                        className={`flex items-start gap-2.5 text-slate-700 leading-relaxed font-medium pr-1 ${
                          isFullscreen ? "text-base sm:text-lg" : "text-xs sm:text-sm"
                        }`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#008080] shrink-0 mt-2" />
                        <span className="flex-1">{block.text}</span>
                      </div>
                    );
                  }
                  return (
                    <p
                      key={idx}
                      className={`text-slate-700 leading-relaxed font-medium ${
                        isFullscreen ? "text-base sm:text-lg" : "text-xs sm:text-sm"
                      }`}
                    >
                      {block.text}
                    </p>
                  );
                })}
              </div>
            ) : slide.raw_text ? (
              /* Fallback to original rawText split by paragraphs */
              <div className="space-y-2 sm:space-y-3">
                {slide.raw_text.split("\n\n").map((para, idx) => (
                  <p
                    key={idx}
                    className={`text-slate-700 leading-relaxed font-medium ${
                      isFullscreen ? "text-base sm:text-lg" : "text-xs sm:text-sm"
                    }`}
                  >
                    {para}
                  </p>
                ))}
              </div>
            ) : null}

            {/* 2. Extracted Tables with Row/Column Preservation */}
            {tables.length > 0 && (
              <div className="space-y-3 mt-3">
                {tables.map((table, tIdx) => (
                  <div
                    key={tIdx}
                    className="w-full overflow-x-auto rounded-xl border border-slate-200"
                  >
                    <table
                      className={`w-full text-start border-collapse ${
                        isFullscreen ? "text-sm" : "text-xs"
                      }`}
                    >
                      {table.headers && table.headers.length > 0 && (
                        <thead className="bg-[#008080]/10 border-b border-slate-200 text-[#008080] font-bold">
                          <tr>
                            {table.headers.map((h, hIdx) => (
                              <th key={hIdx} className="p-2 sm:p-2.5 text-start font-bold">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                      )}
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {table.rows.map((row, rIdx) => (
                          <tr key={rIdx} className="hover:bg-slate-50 transition-colors">
                            {row.map((cell, cIdx) => (
                              <td key={cIdx} className="p-2 sm:p-2.5 text-slate-700 font-medium">
                                {cell}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}

            {/* 3. Unsupported / Graphical Shape Indicator */}
            {unsupportedContent &&
              (unsupportedContent.hasCharts || unsupportedContent.hasSmartArt) && (
                <div className="mt-2 p-2.5 rounded-xl bg-amber-50/70 border border-amber-200/60 flex items-center gap-2 text-[11px] text-amber-800">
                  <BarChart3 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>
                    این اسلاید در فایل اصلی پاورپوینت دارای نمودار یا ساختار گرافیکی (SmartArt) است.
                  </span>
                </div>
              )}
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 sm:p-6 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-[#008080]/10 text-[#008080] flex items-center justify-center mb-2 sm:mb-3">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 mb-1">
              این اسلاید هنوز محتوایی ندارد
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-500 max-w-sm leading-relaxed">
              اسلاید در فایل پاورپوینت بدون متن یا محتوای بصری بوده است.
            </p>
          </div>
        )}
      </div>

      {/* Footer / Original Speaker Notes */}
      <div className="pt-2 sm:pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 shrink-0">
        <span className="text-[10px] sm:text-[11px] font-medium text-slate-500 truncate max-w-[200px] sm:max-w-md">
          {slide.speaker_notes
            ? `یادداشت سخنران در پاورپوینت: ${slide.speaker_notes.slice(0, 100)}`
            : "اسلاید اصلی پاورپوینت"}
        </span>
        <span className="text-[9px] sm:text-[10px] text-slate-400 shrink-0">AVANA</span>
      </div>
    </div>
  );
};
