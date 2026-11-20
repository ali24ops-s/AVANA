import type { PresentationPdfExportOptions } from "@avana/contracts";
import {
  getEstedadFontBase64,
  getAvanaLogoBase64,
  getInlinedKatexCss,
  getBaseStyles,
  renderClosingPage,
  escapeHtml,
  toPersianDigits,
} from "../admin/pdf-template.js";

export interface PresentationExportSlideItem {
  slideIndex: number;
  title: string | null;
  speechText: string | null;
  isUserEditedNotes?: boolean;
  keyPoints?: string[];
  supplementaryExplanation?: string;
  clinicalExample?: {
    scenario?: string;
    clinicalPearl?: string;
  } | null;
  transitionSentence?: string;
  suggestedDurationSeconds?: number;
  slideImageBase64?: string;
  fallbackContent?: {
    rawText?: string;
    textBlocks?: Array<{ type?: string; text?: string }>;
    tables?: Array<{ headers?: string[]; rows: string[][] }>;
  };
}

export interface PresentationPdfExportData {
  projectTitle: string;
  targetDurationMinutes?: number;
  academicLevel?: string;
  tone?: string;
  elaborationDepth?: string;
  totalSlides: number;
  generationDate?: string;
  options: PresentationPdfExportOptions;
  slides: PresentationExportSlideItem[];
}

function getAcademicLevelLabel(level?: string): string {
  switch (level) {
    case "introductory":
      return "مقدماتی (مفاهیم پایه)";
    case "advanced":
      return "پیشرفته و بالینی (تخصصی)";
    case "intermediate":
    default:
      return "متوسط (دانشگاهی و عمومی)";
  }
}

function splitSpeechIntoParagraphs(text?: string | null): string[] {
  if (!text || !text.trim()) return [];
  const normalized = text.trim().replace(/\r\n/g, "\n");
  const paras = normalized.split(/\n{2,}/);
  if (paras.length > 1) {
    return paras.map((p) => p.trim()).filter(Boolean);
  }
  // If no double newlines, split on single newline if substantial
  const lines = normalized.split(/\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    return lines;
  }
  return [normalized];
}

function getPresentationStyles(): string {
  return `
    /* Presentation Specific Print Layout Rules */
    .presentation-slide-section {
      page-break-inside: auto;
      break-inside: auto;
      margin-bottom: 24mm;
      padding-bottom: 12mm;
      border-bottom: 1px dashed rgba(148, 163, 184, 0.4);
    }
    .presentation-slide-section:last-of-type {
      border-bottom: none;
      margin-bottom: 0;
      padding-bottom: 0;
    }

    .presentation-slide-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #008080;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .presentation-slide-title-wrap {
      display: flex;
      align-items: baseline;
      gap: 10px;
      flex: 1;
    }

    .presentation-slide-badge {
      background: #008080;
      color: #ffffff;
      padding: 3px 10px;
      border-radius: 6px;
      font-size: 8.5pt;
      font-weight: 800;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .presentation-slide-title {
      font-size: 13pt;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.4;
      margin: 0;
    }

    .presentation-slide-duration-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 8pt;
      color: #475569;
      background: #f1f5f9;
      border: 1px solid #e2e8f0;
      padding: 2px 8px;
      border-radius: 6px;
      white-space: nowrap;
      font-weight: 600;
    }

    /* Slide Visual Container */
    .presentation-slide-figure {
      margin: 12px 0 16px 0;
      text-align: center;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .presentation-slide-img {
      max-width: 100%;
      width: 100%;
      max-height: 110mm;
      object-fit: contain;
      border-radius: 8px;
      border: 1px solid #cbd5e1;
      background: #0d1719;
      display: block;
      margin: 0 auto;
    }

    /* Fallback Structured Slide Box (Used when real PPTX PDF image is unavailable) */
    .presentation-slide-fallback-box {
      margin: 12px 0 16px 0;
      padding: 14px 18px;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    .presentation-slide-fallback-notice {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 8pt;
      color: #b45309;
      background: #fef3c7;
      border: 1px solid #fde68a;
      padding: 4px 10px;
      border-radius: 6px;
      margin-bottom: 12px;
      font-weight: 600;
    }

    .fallback-bullet-list {
      margin: 8px 0;
      padding-right: 20px;
      padding-left: 0;
      color: #334155;
      font-size: 9pt;
      line-height: 1.8;
    }

    /* Oral Presentation Speech Content */
    .presentation-speech-block {
      margin: 14px 0 16px 0;
      padding: 14px 16px;
      background: rgba(0, 128, 128, 0.04);
      border: 1px solid rgba(0, 128, 128, 0.2);
      border-right: 4px solid #008080;
      border-radius: 8px;
    }

    .presentation-speech-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .presentation-speech-title {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 9.5pt;
      font-weight: 800;
      color: #008080;
    }

    .presentation-user-badge {
      font-size: 7.5pt;
      font-weight: bold;
      color: #d97706;
      background: #fef3c7;
      border: 1px solid #fde68a;
      padding: 1px 6px;
      border-radius: 4px;
    }

    .presentation-speech-para {
      font-size: 9.5pt;
      line-height: 1.85;
      color: #1e293b;
      margin: 0 0 8px 0;
      text-align: justify;
      text-justify: inter-word;
    }
    .presentation-speech-para:last-child {
      margin-bottom: 0;
    }

    /* Callouts inside slide sections */
    .presentation-slide-section .callout {
      margin: 10px 0;
    }
  `;
}

function renderSlideImageOrFallback(
  slide: PresentationExportSlideItem,
  slideTitle: string,
): string {
  // 1. Direct high-fidelity real slide image extracted from PDF
  if (slide.slideImageBase64 && typeof slide.slideImageBase64 === "string") {
    const trimmed = slide.slideImageBase64.trim();
    if (trimmed.startsWith("data:image/")) {
      return `
        <figure class="presentation-slide-figure">
          <img class="presentation-slide-img" src="${trimmed}" alt="${escapeHtml(slideTitle)}" />
        </figure>
      `;
    }
  }

  // 2. Structured fallback if original PPTX image is unavailable
  const fallback = slide.fallbackContent;
  const textBlocks = fallback?.textBlocks || [];
  const tables = fallback?.tables || [];
  const rawText = fallback?.rawText || "";

  return `
    <div class="presentation-slide-fallback-box">
      <div class="presentation-slide-fallback-notice">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <span>بازسازی ساختار محتوایی اسلاید (تصویر مستقیم پاورپوینت در دسترس نبود)</span>
      </div>
      ${
        textBlocks.length > 0
          ? `
            <ul class="fallback-bullet-list">
              ${textBlocks
                .filter((b) => b.text && b.text.trim())
                .map((b) => `<li>${escapeHtml(b.text!.trim())}</li>`)
                .join("")}
            </ul>
          `
          : rawText.trim()
          ? `<div class="content-p" style="font-size: 8.5pt; color: #475569;">${escapeHtml(rawText)}</div>`
          : `<div class="content-p" style="font-size: 8pt; color: #94a3b8; font-style: italic;">محتوای متنی مستقیمی برای این اسلاید ثبت نشده است.</div>`
      }
      ${
        tables.length > 0
          ? tables
              .map((table) => {
                const headers = table.headers || [];
                const rows = table.rows || [];
                return `
                  <div class="table-container" dir="rtl">
                    <table class="content-table" dir="rtl">
                      ${
                        headers.length > 0
                          ? `<thead><tr>${headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("")}</tr></thead>`
                          : ""
                      }
                      <tbody>
                        ${rows
                          .map(
                            (r) =>
                              `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`,
                          )
                          .join("")}
                      </tbody>
                    </table>
                  </div>
                `;
              })
              .join("")
          : ""
      }
    </div>
  `;
}

export function renderPresentationPdfHtml(data: PresentationPdfExportData): string {
  const fontBase64 = getEstedadFontBase64();
  const logoBase64 = getAvanaLogoBase64();
  const katexCss = getInlinedKatexCss();

  const logoTag = logoBase64
    ? `<img class="cover-logo" src="data:image/png;base64,${logoBase64}" alt="AVANA Logo" />`
    : `<div class="cover-fallback-logo">AVANA</div>`;

  const dateStr = data.generationDate || new Date().toLocaleDateString("fa-IR");
  const options = data.options;

  // Render individual slide sections
  const slidesHtml = data.slides
    .map((slide) => {
      const slideIndexPersian = toPersianDigits(slide.slideIndex);
      const slideTitle = slide.title?.trim() || `اسلاید ${slideIndexPersian}`;

      // 1. Duration badge
      const durationSeconds = slide.suggestedDurationSeconds || 0;
      const durationMinutes =
        durationSeconds > 0 ? Math.ceil(durationSeconds / 60) : null;

      // 2. Slide visual image
      const slideVisualHtml = renderSlideImageOrFallback(slide, slideTitle);

      // 3. Oral presentation speech text
      let speechHtml = "";
      if (options.includeSpeechText !== false && slide.speechText && slide.speechText.trim()) {
        const paragraphs = splitSpeechIntoParagraphs(slide.speechText);
        speechHtml = `
          <div class="presentation-speech-block">
            <div class="presentation-speech-header">
              <span class="presentation-speech-title">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#008080" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
                متن ارائه شفاهی
              </span>
              ${
                slide.isUserEditedNotes
                  ? `<span class="presentation-user-badge">ویرایش‌شده توسط کاربر</span>`
                  : ""
              }
            </div>
            <div class="presentation-speech-content">
              ${paragraphs
                .map((p) => `<p class="presentation-speech-para">${escapeHtml(p)}</p>`)
                .join("")}
            </div>
          </div>
        `;
      }

      // 4. Key points callout
      let keyPointsHtml = "";
      if (
        options.includeKeyPoints !== false &&
        slide.keyPoints &&
        slide.keyPoints.length > 0
      ) {
        keyPointsHtml = `
          <div class="callout callout-key-point" style="border-right-color: #0d9488; background-color: rgba(13, 148, 136, 0.08);">
            <div class="callout-header" style="color: #0f766e;">
              <span class="callout-icon-wrap">
                <svg class="callout-icon" viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>
              </span>
              <span class="callout-title">نکات کلیدی برای ارائه (${toPersianDigits(slide.keyPoints.length)} نکته)</span>
            </div>
            <div class="callout-content">
              <ul class="content-ul" style="margin: 0; padding-right: 18px;">
                ${slide.keyPoints.map((kp) => `<li>${escapeHtml(kp)}</li>`).join("")}
              </ul>
            </div>
          </div>
        `;
      }

      // 5. Supplementary explanation callout
      let supplementaryHtml = "";
      if (
        options.includeSupplementary !== false &&
        slide.supplementaryExplanation &&
        slide.supplementaryExplanation.trim()
      ) {
        supplementaryHtml = `
          <div class="callout callout-supplementary" style="border-right-color: #6366f1; background-color: rgba(99, 102, 241, 0.08);">
            <div class="callout-header" style="color: #4f46e5;">
              <span class="callout-icon-wrap">
                <svg class="callout-icon" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/></svg>
              </span>
              <span class="callout-title">توضیحات تکمیلی</span>
            </div>
            <div class="callout-content">
              <p>${escapeHtml(slide.supplementaryExplanation.trim())}</p>
            </div>
          </div>
        `;
      }

      // 6. Clinical / scenario callout
      let clinicalHtml = "";
      if (
        options.includeClinicalExample !== false &&
        slide.clinicalExample &&
        (slide.clinicalExample.scenario || slide.clinicalExample.clinicalPearl)
      ) {
        const scenario = slide.clinicalExample.scenario?.trim();
        const pearl = slide.clinicalExample.clinicalPearl?.trim();
        clinicalHtml = `
          <div class="callout callout-clinical-point" style="border-right-color: #10b981; background-color: rgba(16, 185, 129, 0.08);">
            <div class="callout-header" style="color: #059669;">
              <span class="callout-icon-wrap">
                <svg class="callout-icon" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>
              </span>
              <span class="callout-title">سناریوی آموزشی و کاربردی</span>
            </div>
            <div class="callout-content">
              ${
                scenario
                  ? `<p><strong>سناریو: </strong>${escapeHtml(scenario)}</p>`
                  : ""
              }
              ${
                pearl
                  ? `<p style="margin-top: 4px; padding: 6px 10px; background: #ffffff; border-radius: 6px; border: 1px solid #a7f3d0;"><strong>نکته کلیدی بالینی: </strong>${escapeHtml(pearl)}</p>`
                  : ""
              }
            </div>
          </div>
        `;
      }

      // 7. Transition sentence callout
      let transitionHtml = "";
      if (
        options.includeTransitionSentence !== false &&
        slide.transitionSentence &&
        slide.transitionSentence.trim()
      ) {
        transitionHtml = `
          <div class="callout callout-tip" style="border-right-color: #f59e0b; background-color: rgba(245, 158, 11, 0.07);">
            <div class="callout-header" style="color: #d97706;">
              <span class="callout-icon-wrap">
                <svg class="callout-icon" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
              </span>
              <span class="callout-title">جمله انتقال به اسلاید بعدی</span>
            </div>
            <div class="callout-content">
              <p style="font-style: italic; color: #78350f;">«${escapeHtml(slide.transitionSentence.trim())}»</p>
            </div>
          </div>
        `;
      }

      return `
        <section class="presentation-slide-section">
          <!-- Slide Header -->
          <div class="presentation-slide-header">
            <div class="presentation-slide-title-wrap">
              <span class="presentation-slide-badge">اسلاید ${slideIndexPersian}</span>
              <h2 class="presentation-slide-title">${escapeHtml(slideTitle)}</h2>
            </div>
            ${
              options.includeEstimatedDuration !== false && durationMinutes
                ? `<div class="presentation-slide-duration-badge">⏱ زمان تقریبی: ${toPersianDigits(durationMinutes)} دقیقه</div>`
                : ""
            }
          </div>

          <!-- Slide Visual -->
          ${slideVisualHtml}

          <!-- Oral Speech Text -->
          ${speechHtml}

          <!-- Supplementary Sections -->
          ${keyPointsHtml}
          ${supplementaryHtml}
          ${clinicalHtml}
          ${transitionHtml}
        </section>
      `;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.projectTitle)} - دستیار ارائه آوانا</title>
  <style>
    ${getBaseStyles(fontBase64, katexCss)}
    ${getPresentationStyles()}
  </style>
</head>
<body>
  <div class="watermark">AVANA • آوانا</div>

  <!-- Cover Page -->
  <div class="page-cover">
    <div class="cover-header">
      ${logoTag}
      <div class="cover-badge">خروجی دستیار ارائه آوانا</div>
    </div>
    <div class="cover-body">
      <div class="cover-title">${escapeHtml(data.projectTitle)}</div>
      <div class="cover-subtitle">راهنمای سخنرانی، نکات کلیدی و اسلایدهای آموزشی</div>
      <div class="cover-meta">
        <div>تعداد اسلایدها: ${toPersianDigits(data.totalSlides)} اسلاید</div>
        ${
          data.targetDurationMinutes
            ? `<div>مدت زمان هدف ارائه: ${toPersianDigits(data.targetDurationMinutes)} دقیقه</div>`
            : ""
        }
        <div>سطح علمی: ${escapeHtml(getAcademicLevelLabel(data.academicLevel))}</div>
        <div>تاریخ دریافت: ${escapeHtml(dateStr)}</div>
      </div>
    </div>
    <div class="cover-footer">
      <div>پلتفرم هوشمند یادگیری آوانا</div>
      <div>https://aavana.ir</div>
    </div>
  </div>

  <!-- Main Slides Content -->
  <div class="content-body">
    ${slidesHtml}
  </div>

  <!-- Closing Page -->
  ${renderClosingPage()}
</body>
</html>`;
}
