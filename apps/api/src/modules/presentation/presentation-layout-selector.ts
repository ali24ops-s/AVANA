/**
 * Presentation Slide Layout Selector.
 *
 * Implements Phase 2A-2.3d Deterministic Priority Ladder:
 * - 8-tier deterministic priority evaluation.
 * - Handles overlapping conditions cleanly without splitting or reordering content.
 * - Strict safe fallback to `text_content` or stacked layout without content loss.
 */

import {
  type GeneratedPresentationSlide,
  type SlideDensity,
  type SlideLayoutType,
  type TextDirection,
} from "@avana/domain";

export interface LayoutSelectorInput {
  slide: GeneratedPresentationSlide;
  slideIndex: number;
  totalSlides?: number;
  isTerminalSlide?: boolean;
}

export interface LayoutSelectorResult {
  layoutType: SlideLayoutType;
  density: SlideDensity;
  direction: TextDirection;
  reasons: string[];
}

// Regex for Iranian Persian quotation marks and markdown blockquotes (with optional attribution)
const QUOTE_REGEX =
  /^(?:«|“|"|>|\s*['"])([\s\S]+?)(?:»|”|"|['"])(?:\s*(?:—|--|-)\s*[^\n\r]+)?\s*$/;
const BLOCKQUOTE_START_REGEX = /^\s*>\s+/;

// Regex for quantitative metrics: percentages, units, numbers with standard medical/academic suffixes
const STAT_METRIC_REGEX =
  /(?:\b\d+(?:[.,]\d+)?\s*(?:%|درصد|برابر|mg|g|kg|ml|L|mcg|IU|mmol|mmHg|bpm)(?!\w)|\bp\s*<\s*0?\.\d+)/iu;

// Regex for Persian/Arabic character detection
const PERSIAN_ARABIC_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

// Regex for conclusion/summary slide titles
const CONCLUSION_TITLE_REGEX = /^(?:نتیجه|جمع‌بندی|خلاصه|نتیجه‌گیری|conclu|summary)/i;

export class PresentationLayoutSelector {
  /**
   * Evaluates the slide content and metadata to determine the optimal layout deterministically.
   */
  static selectLayout(input: LayoutSelectorInput): LayoutSelectorResult {
    const { slide, slideIndex, totalSlides, isTerminalSlide } = input;
    const reasons: string[] = [];

    // 1. Text direction analysis
    const fullText = [
      slide.title,
      slide.subtitle ?? "",
      ...slide.content.map((c) => c.content),
    ].join(" ");

    const direction: TextDirection = PERSIAN_ARABIC_CHAR_REGEX.test(fullText)
      ? "rtl"
      : "ltr";

    // 2. Density calculation
    const totalContentLength = slide.content.reduce(
      (sum, item) => sum + item.content.length,
      0,
    );

    let totalBullets = 0;
    for (const item of slide.content) {
      if (item.type === "bullet_list") {
        const lines = item.content
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith("*") || l.startsWith("-") || l.startsWith("•") || /^\d+\./.test(l));
        totalBullets += lines.length;
      }
    }

    let density: SlideDensity = "normal";
    if (totalContentLength > 400 || totalBullets > 6) {
      density = "compact";
    } else if (totalContentLength < 150 && totalBullets <= 2) {
      density = "spacious";
    }

    // 3. Priority Ladder Evaluation

    // P1: Structural Table Check
    // If ANY content item is a table, table layout takes precedence.
    const hasTable = slide.content.some((item) => item.type === "table");
    if (hasTable) {
      reasons.push("Slide contains tabular data; prioritized table layout to ensure horizontal space.");
      return {
        layoutType: "table",
        density,
        direction,
        reasons,
      };
    }

    // P2: Title Hero Check
    // Strictly for slideIndex 1 when content is empty or minimal intro without claims.
    if (slideIndex === 1) {
      const isContentMinimal =
        slide.content.length === 0 ||
        (slide.content.length === 1 &&
          slide.content[0].type === "text" &&
          slide.content[0].content.trim().length <= 120 &&
          slide.content[0].claims.length === 0);

      if (isContentMinimal) {
        reasons.push("First slide with minimal intro text; selected title hero layout.");
        return {
          layoutType: "title",
          density: "spacious",
          direction,
          reasons,
        };
      }
      reasons.push("First slide has substantive content; falling through to substantive layouts.");
    }

    // P3: Conclusion / Summary Check
    const isTerminal =
      isTerminalSlide === true ||
      (typeof totalSlides === "number" && totalSlides > 1 && slideIndex === totalSlides);
    const hasConclusionTitle = CONCLUSION_TITLE_REGEX.test(slide.title.trim());

    if (isTerminal || hasConclusionTitle) {
      reasons.push(
        isTerminal
          ? "Terminal presentation slide; selected conclusion layout."
          : "Slide title indicates summary/conclusion; selected conclusion layout.",
      );
      return {
        layoutType: "conclusion",
        density,
        direction,
        reasons,
      };
    }

    // P4: Two-Column Check
    // Exactly 2 content items, neither is a table, and both have balanced character counts <= 350.
    if (
      slide.content.length === 2 &&
      slide.content.every((item) => item.content.length <= 350)
    ) {
      reasons.push("Slide contains two balanced content blocks; selected two-column layout.");
      return {
        layoutType: "two_column",
        density,
        direction,
        reasons,
      };
    }

    // P5: Quote Check
    // Single text item that is enclosed in quotation marks or starts with blockquote marker.
    // If a quote mentions numbers, quote takes precedence over statistic highlight.
    if (slide.content.length === 1 && slide.content[0].type === "text") {
      const trimmedText = slide.content[0].content.trim();
      const isQuoted =
        QUOTE_REGEX.test(trimmedText) || BLOCKQUOTE_START_REGEX.test(trimmedText);

      if (isQuoted && trimmedText.length <= 300) {
        reasons.push("Content is an authoritative quoted excerpt; selected quote layout.");
        return {
          layoutType: "quote",
          density,
          direction,
          reasons,
        };
      }
    }

    // P6: Statistic Highlight Check
    // Single text item with a prominent metric pattern, <= 250 characters, and <= 2 claims.
    if (slide.content.length === 1 && slide.content[0].type === "text") {
      const trimmedText = slide.content[0].content.trim();
      const hasStat = STAT_METRIC_REGEX.test(trimmedText);

      if (hasStat && trimmedText.length <= 250 && slide.content[0].claims.length <= 2) {
        reasons.push("Content features prominent quantitative metric; selected statistic highlight layout.");
        return {
          layoutType: "statistic_highlight",
          density,
          direction,
          reasons,
        };
      }
    }

    // P7: Bullet List Check
    // If primary content item is a bullet list.
    const hasBulletList = slide.content.some((item) => item.type === "bullet_list");
    if (hasBulletList) {
      reasons.push("Slide contains bulleted items; selected bullet list layout.");
      return {
        layoutType: "bullet_list",
        density,
        direction,
        reasons,
      };
    }

    // P8: Safe Fallback
    reasons.push("Default safe fallback to narrative text layout without rearranging content.");
    return {
      layoutType: "text_content",
      density,
      direction,
      reasons,
    };
  }
}
