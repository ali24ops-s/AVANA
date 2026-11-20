// @vitest-environment node
/* eslint-disable no-secrets/no-secrets */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const screenshotsDir = path.resolve(__dirname, "screenshots");
const artifactScreenshotsDir = process.env.ARTIFACTS_DIR
  ? path.resolve(process.env.ARTIFACTS_DIR, "screenshots")
  : null;

describe("Playwright Browser E2E Tests: PublicPollPage & StudioPollResultsPage", () => {
  let viteServer: ViteDevServer;
  let serverUrl: string;
  let browser: Browser;
  let page: Page;

  const mockPollSlug = "test-avana-exp-playwright";
  const mockPollId = "11111111-2222-3333-4444-555555555555";

  const mockSanitizedPoll = {
    id: mockPollId,
    slug: mockPollSlug,
    title: "بررسی تجربه کاربران از AVANA",
    description:
      "این نظرسنجی با هدف بررسی تجربه استفاده از آوانا و شناسایی امکانات کاربردی‌تر و زمینه‌های بهبود آن طراحی شده است.",
    status: "published",
    settings: {
      allowAnonymous: true,
      showResultsAfterVote: true,
      requireAllQuestions: true,
    },
    questions: [
      {
        id: "q-1",
        questionText: "بیشتر از کدام بخش آوانا استفاده می‌کنید؟",
        questionType: "single_choice",
        isRequired: true,
        sortOrder: 1,
        options: [
          { id: "opt-1-1", optionText: "درسنامه‌ها", sortOrder: 1 },
          { id: "opt-1-2", optionText: "فلش‌کارت‌ها", sortOrder: 2 },
          { id: "opt-1-3", optionText: "آزمون‌ها", sortOrder: 3 },
          { id: "opt-1-4", optionText: "خلاصه‌های مرور", sortOrder: 4 },
          { id: "opt-1-5", optionText: "نقشه ذهنی", sortOrder: 5 },
        ],
      },
      {
        id: "q-2",
        questionText: "کدام امکانات آوانا برای شما کاربردی‌تر هستند؟",
        questionType: "multiple_choice",
        isRequired: true,
        sortOrder: 2,
        options: [
          { id: "opt-2-1", optionText: "تولید محتوای آموزشی با هوش مصنوعی", sortOrder: 1 },
          { id: "opt-2-2", optionText: "فلش‌کارت و مرور هوشمند", sortOrder: 2 },
          { id: "opt-2-3", optionText: "آزمون و ارزیابی", sortOrder: 3 },
          { id: "opt-2-4", optionText: "خلاصه‌سازی مطالب", sortOrder: 4 },
          { id: "opt-2-5", optionText: "نقشه ذهنی", sortOrder: 5 },
          { id: "opt-2-6", optionText: "دستیار هوشمند آموزشی", sortOrder: 6 },
        ],
      },
      {
        id: "q-3",
        questionText: "به نظر شما چه قابلیتی می‌تواند تجربه یادگیری در آوانا را بهتر کند؟",
        questionType: "short_text",
        isRequired: true,
        sortOrder: 3,
        options: [],
      },
      {
        id: "q-4",
        questionText: "رضایت کلی شما از تجربه استفاده از آوانا چقدر است؟",
        questionType: "single_choice",
        isRequired: true,
        sortOrder: 4,
        options: [
          { id: "opt-4-1", optionText: "۱ - خیلی ضعیف", sortOrder: 1 },
          { id: "opt-4-2", optionText: "۲ - ضعیف", sortOrder: 2 },
          { id: "opt-4-3", optionText: "۳ - متوسط", sortOrder: 3 },
          { id: "opt-4-4", optionText: "۴ - خوب", sortOrder: 4 },
          { id: "opt-4-5", optionText: "۵ - عالی", sortOrder: 5 },
        ],
      },
    ],
    userVoted: false,
  };

  const mockAdminResults = {
    pollId: mockPollId,
    pollTitle: "بررسی تجربه کاربران از AVANA",
    totalResponses: 10,
    isAdmin: true,
    questions: [
      {
        questionId: "q-1",
        questionText: "بیشتر از کدام بخش آوانا استفاده می‌کنید؟",
        questionType: "single_choice",
        totalAnswers: 10,
        options: [
          { optionId: "opt-1-1", optionText: "درسنامه‌ها", voteCount: 3, percentage: 30 },
          { optionId: "opt-1-2", optionText: "فلش‌کارت‌ها", voteCount: 2, percentage: 20 },
          { optionId: "opt-1-3", optionText: "آزمون‌ها", voteCount: 2, percentage: 20 },
          { optionId: "opt-1-4", optionText: "خلاصه‌های مرور", voteCount: 1, percentage: 10 },
          { optionId: "opt-1-5", optionText: "نقشه ذهنی", voteCount: 2, percentage: 20 },
        ],
      },
      {
        questionId: "q-2",
        questionText: "کدام امکانات آوانا برای شما کاربردی‌تر هستند؟",
        questionType: "multiple_choice",
        totalAnswers: 10,
        options: [
          { optionId: "opt-2-1", optionText: "تولید محتوای آموزشی با هوش مصنوعی", voteCount: 4, percentage: 40 },
          { optionId: "opt-2-2", optionText: "فلش‌کارت و مرور هوشمند", voteCount: 3, percentage: 30 },
          { optionId: "opt-2-3", optionText: "آزمون و ارزیابی", voteCount: 3, percentage: 30 },
          { optionId: "opt-2-4", optionText: "خلاصه‌سازی مطالب", voteCount: 3, percentage: 30 },
          { optionId: "opt-2-5", optionText: "نقشه ذهنی", voteCount: 4, percentage: 40 },
          { optionId: "opt-2-6", optionText: "دستیار هوشمند آموزشی", voteCount: 3, percentage: 30 },
        ],
      },
      {
        questionId: "q-3",
        questionText: "به نظر شما چه قابلیتی می‌تواند تجربه یادگیری در آوانا را بهتر کند؟",
        questionType: "short_text",
        totalAnswers: 10,
        textAnswers: [
          "افزودن کوئیزهای تعاملی وسط درسنامه‌ها و ویدیوها",
          "الگوریتم تکرار فاصله‌دار پیشرفته‌تر برای لغات تخصصی",
          "شبیه‌سازی دقیق آزمون‌های جامع با کارنامه تحلیلی تراز",
          "امکان تبدیل مستقیم بخش‌های هایلایت‌شده خلاصه به فلش‌کارت",
          "قابلیت خروجی برداری SVG با کیفیت بسیار بالا",
          "بهبود سرعت رندر فرمول‌های ریاضی و نمودارهای علمی در موبایل",
          "تلفظ صوتی هوشمند و خودکار برای کارت‌های آموزشی زبان",
          "دسته‌بندی موضوعی تست‌های دارای پاسخ غلط پس از اتمام آزمون",
          "امکان ترسیم دستی و کشیدن نودهای اختصاصی دلخواه",
          "افزایش سهمیه روزانه گفتگو با دستیار هوشمند رفع اشکال",
        ],
      },
      {
        questionId: "q-4",
        questionText: "رضایت کلی شما از تجربه استفاده از آوانا چقدر است؟",
        questionType: "single_choice",
        totalAnswers: 10,
        options: [
          { optionId: "opt-4-5", optionText: "۵ - عالی", voteCount: 3, percentage: 30 },
          { optionId: "opt-4-4", optionText: "۴ - خوب", voteCount: 3, percentage: 30 },
          { optionId: "opt-4-3", optionText: "۳ - متوسط", voteCount: 2, percentage: 20 },
          { optionId: "opt-4-2", optionText: "۲ - ضعیف", voteCount: 1, percentage: 10 },
          { optionId: "opt-4-1", optionText: "۱ - خیلی ضعیف", voteCount: 1, percentage: 10 },
        ],
      },
    ],
  };

  beforeAll(async () => {
    // Ensure screenshot directories exist
    fs.mkdirSync(screenshotsDir, { recursive: true });
    fs.mkdirSync(artifactScreenshotsDir, { recursive: true });

    // Start isolated Vite dev server
    viteServer = await createServer({
      root: path.resolve(__dirname, "../../"),
      server: {
        port: 5195,
        host: "127.0.0.1",
      },
      logLevel: "error",
    });
    await viteServer.listen();
    serverUrl = "http://127.0.0.1:5195";

    // Launch Chromium in headless mode
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });

    // Intercept /v1/me to provide authenticated Platform Admin user
    await page.route("**/v1/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "usr-platform-admin",
            email: "admin@avana.test",
            role: "platform_admin",
            name: "مدیر ارشد آوانا",
            emailVerified: true,
            isVerified: true,
          },
          memberships: [],
        }),
      });
    });

    // Intercept API calls to provide the exact test data without external dependencies
    await page.route("**/v1/public/polls/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/vote")) {
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            success: true,
            responseId: "resp-playwright-test-1",
            results: mockAdminResults,
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ poll: mockSanitizedPoll }),
        });
      }
    });

    await page.route("**/v1/studio/polls/**", async (route) => {
      const url = route.request().url();
      if (url.endsWith("/results")) {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ results: mockAdminResults }),
        });
      } else if (url.endsWith("/export")) {
        await route.fulfill({
          status: 200,
          contentType: "text/csv; charset=utf-8",
          headers: {
            "Content-Disposition": 'attachment; filename="poll-results.csv"',
          },
          body: '\uFEFF"عنوان نظرسنجی","بررسی تجربه کاربران از AVANA"\r\n"تعداد کل پاسخ‌ها","10"',
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            poll: {
              id: mockPollId,
              slug: mockPollSlug,
              title: "بررسی تجربه کاربران از AVANA",
              status: "published",
              settings: {},
            },
          }),
        });
      }
    });

    // Mock Auth state in LocalStorage for Studio Admin access
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "avana_auth_user",
        JSON.stringify({
          id: "usr-platform-admin",
          email: "admin@avana.test",
          role: "platform_admin",
          name: "مدیر ارشد آوانا",
        }),
      );
    });
  });

  afterAll(async () => {
    if (page) await page.close();
    if (browser) await browser.close();
    if (viteServer) await viteServer.close();
  });

  it(
    "Step 5.1: PublicPollPage renders RTL form, questions, allows selection, and captures screenshot",
    async () => {
    await page.goto(`${serverUrl}/polls/${mockPollSlug}`, {
      waitUntil: "networkidle",
    });

    // 1. Verify Page Title & Description
    await page.waitForSelector("h1");
    const heading = await page.textContent("h1");
    expect(heading).toContain("بررسی تجربه کاربران از AVANA");

    // 2. Verify RTL Direction
    const isRtl = await page.$eval("main, [dir='rtl']", (el) => el.getAttribute("dir") === "rtl" || window.getComputedStyle(el).direction === "rtl");
    expect(isRtl).toBe(true);

    // 3. Verify all 4 Questions are visible
    const pageText = await page.textContent("body");
    expect(pageText).toContain("بیشتر از کدام بخش آوانا استفاده می‌کنید؟");
    expect(pageText).toContain("کدام امکانات آوانا برای شما کاربردی‌تر هستند؟");
    expect(pageText).toContain("به نظر شما چه قابلیتی می‌تواند تجربه یادگیری در آوانا را بهتر کند؟");
    expect(pageText).toContain("رضایت کلی شما از تجربه استفاده از آوانا چقدر است؟");

    // 4. Select Answers
    // Q1: Select "درسنامه‌ها"
    await page.click('text="درسنامه‌ها"');

    // Q2: Select "تولید محتوای آموزشی با هوش مصنوعی"
    await page.click('text="تولید محتوای آموزشی با هوش مصنوعی"');

    // Q3: Fill textarea
    const textarea = page.locator("textarea").first();
    await textarea.fill("پیشنهاد بهبود تعاملی آزمون‌ها و درسنامه‌ها در تست مرورگر");

    // Q4: Select "۵ - عالی"
    await page.click('text="۵ - عالی"');

    // Capture screenshot of filled Public Form
    const publicScreenshotPath = path.join(screenshotsDir, "e2e-public-poll.png");
    await page.screenshot({ path: publicScreenshotPath, fullPage: true });
    if (artifactScreenshotsDir && fs.existsSync(artifactScreenshotsDir)) {
      fs.copyFileSync(publicScreenshotPath, path.join(artifactScreenshotsDir, "e2e-public-poll.png"));
    }

    // 5. Submit Form
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.click();

    // Verify Success screen / Summary
    await page.waitForTimeout(1000);
    const postSubmitText = await page.textContent("body");
    expect(postSubmitText).toMatch(/(پاسخ.*با موفقیت ثبت شد|نتایج آرا|متشکریم)/);
  }, 35000);

  it(
    "Step 5.2: StudioPollResultsPage renders KPI cards, charts, text responses, and captures screenshot",
    async () => {
      await page.goto(`${serverUrl}/studio/polls/${mockPollId}/results`, {
        waitUntil: "networkidle",
      });

      // 1. Verify Page Heading
      await page.waitForSelector("h1");
      const heading = await page.textContent("h1");
      expect(heading).toContain("بررسی تجربه کاربران از AVANA");

      // 2. Verify KPI Metrics (10 Participants, 4 Questions)
      const pageText = await page.textContent("body");
      expect(pageText).toContain("۱۰"); // Total responses in Persian digits
      expect(pageText).toContain("۴"); // 4 questions in Persian digits
      expect(pageText).toContain("فعال و در دسترس");

      // 3. Verify Question Percentages and Option Bars
      expect(pageText).toContain("درسنامه‌ها");
      expect(pageText).toContain("۳۰٪");
      expect(pageText).toContain("نقشه ذهنی");
      expect(pageText).toContain("۴۰٪");

      // 4. Verify Text Responses Displayed
      expect(pageText).toContain("افزودن کوئیزهای تعاملی وسط درسنامه‌ها و ویدیوها");
      expect(pageText).toContain("قابلیت خروجی برداری SVG با کیفیت بسیار بالا");

      // 5. Verify CSV Export Button is present and clickable
      const csvButton = page.locator("button:has-text('خروجی CSV')").first();
      expect(await csvButton.isVisible()).toBe(true);

      // Capture screenshot of Admin Results Dashboard
      const resultsScreenshotPath = path.join(screenshotsDir, "e2e-studio-poll-results.png");
      await page.screenshot({ path: resultsScreenshotPath, fullPage: true });
      if (artifactScreenshotsDir && fs.existsSync(artifactScreenshotsDir)) {
        fs.copyFileSync(resultsScreenshotPath, path.join(artifactScreenshotsDir, "e2e-studio-poll-results.png"));
      }
    },
    35000,
  );
});
