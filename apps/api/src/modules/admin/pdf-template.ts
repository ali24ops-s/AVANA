import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface LessonPdfData {
  title: string;
  courseName?: string;
  moduleTitle?: string;
  reference?: string | null;
  contentMarkdown: string;
  generationDate?: string;
}

export interface ReviewSummaryComparison {
  title?: string;
  aspects?: string[];
  items?: Record<string, Record<string, string>>;
  headers?: string[];
  rows?: string[][];
}

export interface ReviewSummarySection {
  title?: string;
  keyPoints?: string[];
  mechanisms?: string[];
  classifications?: string[];
  comparisons?: ReviewSummaryComparison[];
  memorizationPoints?: string[];
  examPoints?: string[];
}

export interface ReviewSummaryPdfData {
  title: string;
  courseName?: string;
  moduleTitle?: string;
  estimatedReadingMinutes?: number;
  overview?: string;
  sections?: ReviewSummarySection[];
  finalTakeaways?: string[];
  generationDate?: string;
}

let cachedFontBase64: string | null = null;
let cachedLogoBase64: string | null = null;

export function getVazirmatnFontBase64(): string {
  if (cachedFontBase64) return cachedFontBase64;
  const candidates = [
    path.resolve(__dirname, "../../../../../../node_modules/@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2"),
    path.resolve(process.cwd(), "node_modules/@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      cachedFontBase64 = fs.readFileSync(p).toString("base64");
      return cachedFontBase64;
    }
  }
  return "";
}

export function getAvanaLogoBase64(): string {
  if (cachedLogoBase64) return cachedLogoBase64;
  const candidates = [
    path.resolve(__dirname, "../../../../../web/public/brand/avana-logo.png"),
    path.resolve(process.cwd(), "apps/web/public/brand/avana-logo.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      cachedLogoBase64 = fs.readFileSync(p).toString("base64");
      return cachedLogoBase64;
    }
  }
  return "";
}

export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return "";
  const s = typeof str === "string" ? str : String(str);
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function markdownToSafeHtml(markdown: string): string {
  if (!markdown) return "";
  const lines = markdown.split("\n");
  const htmlParts: string[] = [];
  let inList = false;
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // End list if line is not a list item
    if (inList && !trimmed.startsWith("- ") && !trimmed.startsWith("* ") && !/^\d+\.\s/.test(trimmed)) {
      htmlParts.push("</ul>");
      inList = false;
    }

    // End table if line is not a table row
    if (inTable && !trimmed.startsWith("|")) {
      htmlParts.push("</tbody></table>");
      inTable = false;
    }

    if (!trimmed) {
      continue;
    }

    // Headings
    if (trimmed.startsWith("#### ")) {
      htmlParts.push(`<h4>${formatInline(trimmed.slice(5))}</h4>`);
    } else if (trimmed.startsWith("### ")) {
      htmlParts.push(`<h3>${formatInline(trimmed.slice(4))}</h3>`);
    } else if (trimmed.startsWith("## ")) {
      htmlParts.push(`<h2>${formatInline(trimmed.slice(3))}</h2>`);
    } else if (trimmed.startsWith("# ")) {
      htmlParts.push(`<h1>${formatInline(trimmed.slice(2))}</h1>`);
    }
    // Blockquotes & Callouts
    else if (trimmed.startsWith("> ")) {
      const bqText = trimmed.slice(2);
      const isImportant = bqText.includes("مهم") || bqText.includes("توجه") || bqText.includes("NOTE") || bqText.includes("IMPORTANT");
      const calloutClass = isImportant ? "callout callout-important" : "callout";
      htmlParts.push(`<div class="${calloutClass}"><p>${formatInline(bqText)}</p></div>`);
    }
    // Horizontal rule
    else if (trimmed === "---" || trimmed === "***" || trimmed === "___") {
      htmlParts.push('<hr class="divider" />');
    }
    // Tables
    else if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());

      // Check if separator row (|---|---|)
      const isSep = cells.every((c) => /^:?-+:?$/.test(c));
      if (isSep) {
        continue;
      }

      if (!inTable) {
        inTable = true;
        htmlParts.push('<table class="content-table"><thead><tr>');
        for (const c of cells) {
          htmlParts.push(`<th>${formatInline(c)}</th>`);
        }
        htmlParts.push("</tr></thead><tbody>");
      } else {
        htmlParts.push("<tr>");
        for (const c of cells) {
          htmlParts.push(`<td>${formatInline(c)}</td>`);
        }
        htmlParts.push("</tr>");
      }
    }
    // List items
    else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      if (!inList) {
        inList = true;
        htmlParts.push('<ul class="content-list">');
      }
      htmlParts.push(`<li>${formatInline(trimmed.slice(2))}</li>`);
    }
    // Regular paragraph
    else {
      htmlParts.push(`<p class="content-p">${formatInline(trimmed)}</p>`);
    }
  }

  if (inList) htmlParts.push("</ul>");
  if (inTable) htmlParts.push("</tbody></table>");

  return htmlParts.join("\n");
}

function formatInline(text: string): string {
  let safe = escapeHtml(text);
  // Bold: **text**
  safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  // Italic: *text*
  safe = safe.replace(/\*(.*?)\*/g, "<em>$1</em>");
  // Inline code: `code`
  safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");
  return safe;
}

function getBaseStyles(fontBase64: string): string {
  return `
    @font-face {
      font-family: 'Vazirmatn';
      src: url('data:font/woff2;base64,${fontBase64}') format('woff2');
      font-weight: 100 900;
      font-style: normal;
    }
    @page {
      size: A4;
      margin: 18mm 14mm 18mm 14mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: 'Vazirmatn', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      direction: rtl;
      text-align: right;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 0;
      font-size: 11pt;
      line-height: 1.8;
    }
    .page-cover {
      page-break-after: always;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 250mm;
      padding: 24mm 16mm;
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      position: relative;
      background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
    }
    .watermark {
      position: fixed;
      top: 45%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      font-size: 55pt;
      font-weight: 900;
      color: rgba(0, 128, 128, 0.04);
      z-index: -1;
      pointer-events: none;
      white-space: nowrap;
      user-select: none;
    }
    .cover-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #008080;
      padding-bottom: 12px;
    }
    .cover-logo {
      height: 48px;
      max-width: 140px;
      object-fit: contain;
    }
    .cover-fallback-logo {
      font-weight: 900;
      font-size: 18pt;
      color: #008080;
    }
    .cover-badge {
      font-size: 9pt;
      font-weight: bold;
      color: #008080;
      background: rgba(0, 128, 128, 0.1);
      padding: 4px 12px;
      border-radius: 6px;
      border: 1px solid rgba(0, 128, 128, 0.2);
    }
    .cover-body {
      margin: auto 0;
      text-align: center;
      padding: 20px 0;
    }
    .cover-title {
      font-size: 24pt;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.4;
      margin-bottom: 16px;
    }
    .cover-subtitle {
      font-size: 13pt;
      color: #475569;
      margin-bottom: 8px;
    }
    .cover-meta {
      display: flex;
      justify-content: center;
      gap: 20px;
      margin-top: 24px;
      font-size: 10pt;
      color: #64748b;
    }
    .cover-footer {
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 9pt;
      color: #64748b;
    }
    .page-closing {
      page-break-before: always;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 240mm;
      text-align: center;
      padding: 24mm 16mm;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      background: #f8fafc;
    }
    .closing-title {
      font-size: 18pt;
      font-weight: 800;
      color: #008080;
      margin-bottom: 12px;
    }
    .closing-desc {
      font-size: 10.5pt;
      color: #475569;
      max-width: 500px;
      line-height: 1.8;
      margin-bottom: 24px;
    }
    .closing-links {
      display: flex;
      flex-direction: column;
      gap: 8px;
      font-size: 10pt;
      margin-bottom: 24px;
    }
    .closing-link {
      color: #008080;
      text-decoration: none;
      font-weight: bold;
    }
    .closing-disclaimer {
      font-size: 8pt;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 12px;
      max-width: 440px;
    }
    .content-body {
      padding: 8px 0;
    }
    h1 {
      font-size: 18pt;
      font-weight: 800;
      color: #008080;
      border-bottom: 2px solid rgba(0, 128, 128, 0.2);
      padding-bottom: 6px;
      margin-top: 24px;
      margin-bottom: 12px;
      page-break-after: avoid;
    }
    h2 {
      font-size: 14pt;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
      margin-top: 20px;
      margin-bottom: 10px;
      page-break-after: avoid;
    }
    h3 {
      font-size: 12pt;
      font-weight: 700;
      color: #334155;
      margin-top: 16px;
      margin-bottom: 8px;
      page-break-after: avoid;
    }
    h4 {
      font-size: 11pt;
      font-weight: 600;
      color: #475569;
      margin-top: 14px;
      margin-bottom: 6px;
      page-break-after: avoid;
    }
    .content-p {
      margin: 0 0 10px 0;
      text-align: justify;
    }
    .callout {
      margin: 14px 0;
      padding: 12px 16px;
      border-radius: 8px;
      border-right: 4px solid #008080;
      background: rgba(0, 128, 128, 0.05);
      page-break-inside: avoid;
    }
    .callout-important {
      border-right-color: #f59e0b;
      background: rgba(245, 158, 11, 0.07);
    }
    .callout p {
      margin: 0;
      font-size: 10pt;
    }
    .content-table {
      width: 100%;
      border-collapse: collapse;
      margin: 16px 0;
      font-size: 9.5pt;
      page-break-inside: avoid;
    }
    .content-table th {
      background: #008080;
      color: #ffffff;
      padding: 8px 10px;
      text-align: right;
      font-weight: bold;
    }
    .content-table td {
      padding: 7px 10px;
      border-bottom: 1px solid #e2e8f0;
    }
    .content-table tr:nth-child(even) td {
      background: #f8fafc;
    }
    .content-list {
      margin: 8px 0 14px 0;
      padding-right: 20px;
    }
    .content-list li {
      margin-bottom: 5px;
    }
    .summary-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      margin-bottom: 14px;
      page-break-inside: avoid;
    }
    .summary-card-header {
      font-weight: bold;
      font-size: 11pt;
      color: #008080;
      border-bottom: 1px solid rgba(0, 128, 128, 0.2);
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    code {
      font-family: monospace;
      background: #f1f5f9;
      padding: 1px 4px;
      border-radius: 4px;
      font-size: 9.5pt;
      direction: ltr;
      display: inline-block;
    }
  `;
}

function renderClosingPage(): string {
  return `
    <div class="page-closing">
      <div class="closing-title">سامانه هوشمند یادگیری آوانا</div>
      <div class="closing-desc">
        آوانا بستر هوشمند آموزش و یادگیری دانشگاهی است که محتوای درسی را به خلاصه، درسنامه، فلش‌کارت و آزمون‌های تحلیلی تبدیل می‌کند.
      </div>
      <div class="closing-links">
        <div>وب‌سایت: <a class="closing-link" href="https://aavana.ir">https://aavana.ir</a></div>
        <div>کانال تلگرام: <a class="closing-link" href="https://t.me/AavanaClub">@AavanaClub</a></div>
        <div>اینستاگرام: <a class="closing-link" href="https://instagram.com/aavana.ir">@aavana.ir</a></div>
      </div>
      <div class="closing-disclaimer">
        کلیه حقوق مادی و معنوی این اثر متعلق به پلتفرم آوانا است. هرگونه بازنشر، تکثیر یا فروش بدون مجوز کتبی ممنوع و قابل پیگرد می‌باشد.
      </div>
    </div>
  `;
}

export function renderLessonPdfHtml(data: LessonPdfData): string {
  const fontBase64 = getVazirmatnFontBase64();
  const logoBase64 = getAvanaLogoBase64();
  const logoTag = logoBase64
    ? `<img class="cover-logo" src="data:image/png;base64,${logoBase64}" alt="AVANA Logo" />`
    : `<div class="cover-fallback-logo">AVANA</div>`;

  const dateStr = data.generationDate || new Date().toLocaleDateString("fa-IR");
  const bodyHtml = markdownToSafeHtml(data.contentMarkdown);

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.title)} - درسنامه آوانا</title>
  <style>
    ${getBaseStyles(fontBase64)}
  </style>
</head>
<body>
  <div class="watermark">AVANA • آوانا</div>

  <!-- Cover Page -->
  <div class="page-cover">
    <div class="cover-header">
      ${logoTag}
      <div class="cover-badge">درسنامه اختصاصی آوانا</div>
    </div>
    <div class="cover-body">
      <div class="cover-title">${escapeHtml(data.title)}</div>
      ${data.moduleTitle ? `<div class="cover-subtitle">فصل: ${escapeHtml(data.moduleTitle)}</div>` : ""}
      ${data.courseName ? `<div class="cover-subtitle">دوره: ${escapeHtml(data.courseName)}</div>` : ""}
      <div class="cover-meta">
        <div>تاریخ تولید: ${escapeHtml(dateStr)}</div>
        ${data.reference ? `<div>مرجع: ${escapeHtml(data.reference)}</div>` : ""}
      </div>
    </div>
    <div class="cover-footer">
      <div>پلتفرم هوشمند یادگیری آوانا</div>
      <div>https://aavana.ir</div>
    </div>
  </div>

  <!-- Main Content -->
  <div class="content-body">
    ${bodyHtml}
  </div>

  <!-- Closing Page -->
  ${renderClosingPage()}
</body>
</html>`;
}

export function renderReviewSummaryPdfHtml(data: ReviewSummaryPdfData): string {
  const fontBase64 = getVazirmatnFontBase64();
  const logoBase64 = getAvanaLogoBase64();
  const logoTag = logoBase64
    ? `<img class="cover-logo" src="data:image/png;base64,${logoBase64}" alt="AVANA Logo" />`
    : `<div class="cover-fallback-logo">AVANA</div>`;

  const dateStr = data.generationDate || new Date().toLocaleDateString("fa-IR");

  const sectionsHtml: string[] = [];

  // Overview
  if (data.overview) {
    sectionsHtml.push(`
      <div class="summary-card" style="border-right: 4px solid #008080;">
        <div class="summary-card-header">چکیده یک‌دقیقه‌ای مبحث</div>
        <div>${markdownToSafeHtml(data.overview)}</div>
      </div>
    `);
  }

  // Sections
  if (Array.isArray(data.sections)) {
    for (const sec of data.sections) {
      if (sec.title) {
        sectionsHtml.push(`<h2>${escapeHtml(sec.title)}</h2>`);
      }

      if (sec.keyPoints && sec.keyPoints.length > 0) {
        sectionsHtml.push(`
          <div class="summary-card">
            <div class="summary-card-header">نکات کلیدی و مفاهیم اصلی</div>
            <ul class="content-list">
              ${sec.keyPoints.map((p) => `<li>${formatInline(p)}</li>`).join("")}
            </ul>
          </div>
        `);
      }

      if (sec.mechanisms && sec.mechanisms.length > 0) {
        sectionsHtml.push(`
          <div class="summary-card">
            <div class="summary-card-header">مکانیزم‌ها و فرآیندها</div>
            <ul class="content-list">
              ${sec.mechanisms.map((m) => `<li>${formatInline(m)}</li>`).join("")}
            </ul>
          </div>
        `);
      }

      if (sec.classifications && sec.classifications.length > 0) {
        sectionsHtml.push(`
          <div class="summary-card">
            <div class="summary-card-header">طبقه‌بندی‌ها و دسته‌ها</div>
            <ul class="content-list">
              ${sec.classifications.map((c) => `<li>${formatInline(c)}</li>`).join("")}
            </ul>
          </div>
        `);
      }

      if (sec.comparisons && sec.comparisons.length > 0) {
        for (const comp of sec.comparisons) {
          sectionsHtml.push(`
            <div class="summary-card">
              <div class="summary-card-header">${escapeHtml(comp.title || "جدول مقایسه‌ای")}</div>
          `);
          if (comp.headers && comp.rows) {
            sectionsHtml.push('<table class="content-table"><thead><tr>');
            for (const h of comp.headers) {
              sectionsHtml.push(`<th>${escapeHtml(h)}</th>`);
            }
            sectionsHtml.push("</tr></thead><tbody>");
            for (const row of comp.rows) {
              sectionsHtml.push("<tr>");
              for (const cell of row) {
                sectionsHtml.push(`<td>${formatInline(cell)}</td>`);
              }
              sectionsHtml.push("</tr>");
            }
            sectionsHtml.push("</tbody></table>");
          }
          sectionsHtml.push("</div>");
        }
      }

      if (sec.memorizationPoints && sec.memorizationPoints.length > 0) {
        sectionsHtml.push(`
          <div class="summary-card" style="border-right: 4px solid #6366f1;">
            <div class="summary-card-header" style="color: #6366f1;">نکات حفظی و رمزگذاری‌ها</div>
            <ul class="content-list">
              ${sec.memorizationPoints.map((mp) => `<li>${formatInline(mp)}</li>`).join("")}
            </ul>
          </div>
        `);
      }

      if (sec.examPoints && sec.examPoints.length > 0) {
        sectionsHtml.push(`
          <div class="summary-card" style="border-right: 4px solid #f59e0b;">
            <div class="summary-card-header" style="color: #d97706;">نکات کنکوری و دام‌های تستی</div>
            <ul class="content-list">
              ${sec.examPoints.map((ep) => `<li>${formatInline(ep)}</li>`).join("")}
            </ul>
          </div>
        `);
      }
    }
  }

  // Final Takeaways
  if (data.finalTakeaways && data.finalTakeaways.length > 0) {
    sectionsHtml.push(`
      <div class="summary-card" style="border-right: 4px solid #10b981;">
        <div class="summary-card-header" style="color: #059669;">جمع‌بندی و نتیجه‌گیری نهایی</div>
        <ul class="content-list">
          ${data.finalTakeaways.map((t) => `<li>${formatInline(t)}</li>`).join("")}
        </ul>
      </div>
    `);
  }

  return `<!DOCTYPE html>
<html dir="rtl" lang="fa">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.title)} - خلاصه مرور آوانا</title>
  <style>
    ${getBaseStyles(fontBase64)}
  </style>
</head>
<body>
  <div class="watermark">AVANA • آوانا</div>

  <!-- Cover Page -->
  <div class="page-cover">
    <div class="cover-header">
      ${logoTag}
      <div class="cover-badge">خلاصه مرور سریع آوانا</div>
    </div>
    <div class="cover-body">
      <div class="cover-title">${escapeHtml(data.title)}</div>
      ${data.moduleTitle ? `<div class="cover-subtitle">فصل: ${escapeHtml(data.moduleTitle)}</div>` : ""}
      ${data.courseName ? `<div class="cover-subtitle">دوره: ${escapeHtml(data.courseName)}</div>` : ""}
      <div class="cover-meta">
        <div>تاریخ تولید: ${escapeHtml(dateStr)}</div>
        ${data.estimatedReadingMinutes ? `<div>زمان مطالعه: ${data.estimatedReadingMinutes} دقیقه</div>` : ""}
      </div>
    </div>
    <div class="cover-footer">
      <div>پلتفرم هوشمند یادگیری آوانا</div>
      <div>https://aavana.ir</div>
    </div>
  </div>

  <!-- Main Content -->
  <div class="content-body">
    ${sectionsHtml.join("\n")}
  </div>

  <!-- Closing Page -->
  ${renderClosingPage()}
</body>
</html>`;
}
