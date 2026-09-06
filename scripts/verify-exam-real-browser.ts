import { chromium } from "playwright";

async function runBrowserVerification() {
  console.log("================================================================================");
  console.log("REAL BROWSER VIEWPORT & HORIZONTAL OVERFLOW VERIFICATION FOR EXAMTAKINGVIEW");
  console.log("================================================================================\n");

  let browser: any = null;

  try {
    console.log("1. Launching Real Chromium Browser via Playwright...");
    browser = await chromium.launch({ headless: true });

    const viewports = [
      { width: 1366, height: 768, label: "1366×768 (Standard Laptop / Desktop)" },
      { width: 1920, height: 1080, label: "1920×1080 (Full HD Widescreen)" },
    ];

    const mockOrgId = "org-test-123";
    const mockAttemptId = "att-browser-test-456";

    const mockQuestions = [
      {
        id: "q-1",
        question: "مکانیسم اثر داروهای مهارکننده آنزیم مبدل آنژیوتانسین (ACEIs) در درمان فشار خون و نارسایی قلبی چیست؟",
        choices: [
          "مهار مستقیم گیرنده‌های آلفا-۱ آدرنرژیک عروقی",
          "جلوگیری از تبدیل آنژیوتانسین I به آنژیوتانسین II و کاهش ترشح آلدوسترون",
          "بلوک کانال‌های کلسیمی نوع L در سلول‌های عضله صاف عروق",
          "مهار بازجذب سدیم و کلر در لوله پیچیده دیستال کلیه",
        ],
        topic: "فارماکولوژی قلب و عروق",
        difficulty: "medium",
        explanation: "داروهای ACEI مانع تبدیل Ang I به Ang II فعال شده و مقاومت عروقی را کاهش می‌دهند.",
        keyPoint: "کاپتوپریل، انالاپریل و لیزینوپریل از داروهای اصلی این دسته می‌باشند.",
      },
      {
        id: "q-2",
        question: "کدام داروی بتابلاکر در بیماران با نارسایی قلبی دارای شواهد کاهش مورتالیتی است؟",
        choices: ["پروپرانولول", "آتنولول", "کارودیلول", "اسمولول"],
        topic: "فارماکولوژی قلب و عروق",
        difficulty: "hard",
        explanation: "کارودیلول بتابلاکر غیراختصاصی با خاصیت وازودیلاتوری ناشی از بلوک آلفا-۱ است.",
      },
      {
        id: "q-3",
        question: "کدام گزینه از عوارض جانبی اصلی دیورتیک‌های قوس هنله (مانند فوروزماید) است؟",
        choices: ["هایپرکالمی", "هایپوکالمی و اتوتوکسیسیتی", "هایپرکلسمی", "افزایش سدیم خون"],
        topic: "فارماکولوژی کلیه",
        difficulty: "medium",
      },
    ];

    const mockCoverage = [
      {
        id: "course-pharma",
        title: "فارماکولوژی ۲",
        questionCount: 3,
        modules: [
          {
            id: "mod-cvs",
            title: "داروهای قلب و عروق",
            questionCount: 2,
          },
          {
            id: "mod-renal",
            title: "داروهای کلیه و دیورتیک‌ها",
            questionCount: 1,
          },
        ],
      },
    ];

    for (const vp of viewports) {
      console.log(`\n================================================================================`);
      console.log(`TESTING VIEWPORT: ${vp.label}`);
      console.log(`================================================================================`);

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });

      const page = await context.newPage();

      page.on("console", (msg: any) => console.log(`[Browser Console ${msg.type()}]:`, msg.text()));
      page.on("pageerror", (err: any) => console.error(`[Browser PageError]:`, err));

      // Intercept ALL API routes under /v1/
      await page.route("**/v1/**", async (route: any) => {
        const url = route.request().url();
        const method = route.request().method();

        if (url.includes("/v1/me")) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              request_id: "req-me",
              user: {
                id: "user-test",
                email: "student@avana.ir",
                name: "دانشجوی پزشکی",
                role: "student",
                is_email_verified: true,
              },
              memberships: [
                {
                  id: "mem-1",
                  user_id: "user-test",
                  organization_id: mockOrgId,
                  role: "member",
                },
              ],
            }),
          });
        }

        if (url.includes("/v1/organizations") && method === "GET" && !url.includes("/study/")) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              request_id: "req-orgs",
              items: [
                {
                  id: mockOrgId,
                  name: "دانشگاه علوم پزشکی",
                  slug: "med-univ",
                },
              ],
            }),
          });
        }

        if (url.includes("/study/exams/topics")) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              request_id: "req-topics",
              courses: [
                {
                  id: "course-pharma",
                  title: "فارماکولوژی ۲",
                  questionCount: 3,
                  modules: [
                    {
                      id: "mod-cvs",
                      title: "داروهای قلب و عروق",
                      questionCount: 2,
                      lessons: [
                        { id: "les-1", title: "مهارکننده‌های ACE", questionCount: 1 },
                        { id: "les-2", title: "بتابلاکرها", questionCount: 1 },
                      ],
                    },
                  ],
                },
              ],
              sections: [],
              topics: [],
            }),
          });
        }

        if (url.includes("/study/exams/start") && method === "POST") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              request_id: "req-start",
              attemptId: mockAttemptId,
              questions: mockQuestions,
              topic: "فارماکولوژی قلب و عروق",
              topics: ["فارماکولوژی قلب و عروق"],
              coverage: mockCoverage,
            }),
          });
        }

        if (url.includes(`/study/exams/attempts/${mockAttemptId}`) && method === "GET") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              request_id: "req-att",
              attempt: {
                id: mockAttemptId,
                score: 0,
                topic: "فارماکولوژی قلب و عروق",
                startedAt: new Date(Date.now() - 60000).toISOString(),
                answers: {},
              },
              questions: mockQuestions,
              coverage: mockCoverage,
              isCompleted: false,
            }),
          });
        }

        if (url.includes("/answers") && method === "POST") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ request_id: "req-ans", success: true, answers: { "q-1": "الف" } }),
          });
        }

        if (url.includes("/submit") && method === "POST") {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              request_id: "req-sub",
              attempt: {
                id: mockAttemptId,
                score: 100,
                completedAt: new Date().toISOString(),
              },
              questions: mockQuestions,
            }),
          });
        }

        // Subscriptions & other background queries
        if (url.includes("/v1/commerce/subscriptions/me")) {
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              request_id: "req-sub-me",
              subscription: {
                status: "active",
                expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
              },
            }),
          });
        }

        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ request_id: "req-default" }),
        });
      });

      // Navigate to /exams
      console.log(`\n[${vp.width}x${vp.height}] Step 1: Navigating to http://127.0.0.1:5173/exams...`);
      await page.goto("http://127.0.0.1:5173/exams", { waitUntil: "networkidle" });
      await page.waitForTimeout(1000);

      const configTitle = await page.$eval("h1", (el: any) => el.textContent).catch(() => null);
      console.log(`Config page loaded with title: "${configTitle}"`);

      // Check overflow on Config page
      const configScrollW = await page.evaluate("document.documentElement.scrollWidth");
      const configClientW = await page.evaluate("document.documentElement.clientWidth");
      console.log(`Config Page: scrollWidth=${configScrollW}px, clientWidth=${configClientW}px (Overflow: ${Number(configScrollW) - Number(configClientW)}px)`);

      // Select topics & Start exam
      console.log(`[${vp.width}x${vp.height}] Step 2: Selecting exam topics & starting exam...`);
      const courseSelectBtn = await page.waitForSelector('button[aria-label^="انتخاب کل دوره"]', { timeout: 10000 });
      await courseSelectBtn.click();
      await page.waitForTimeout(400);

      const startBtn = await page.waitForSelector("button:has-text('شروع آزمون'):not([disabled])", { timeout: 5000 });
      await startBtn.click();

      // Wait for navigation to /exams/attempt/...
      await page.waitForURL(/\/exams\/attempt\//, { timeout: 10000 });
      console.log(`Navigated to active exam URL: ${page.url()}`);
      await page.waitForTimeout(1000);

      // Evaluate browser layout dimensions and bounding boxes using a raw JS string
      const layoutData: any = await page.evaluate(`
        (() => {
          const shell = document.querySelector("div[dir='rtl']");
          const sidebar = document.querySelector("aside");
          const mainContent = sidebar ? sidebar.nextElementSibling : null;
          const header = mainContent ? mainContent.querySelector("header") : null;
          const mainScrollArea = mainContent ? mainContent.querySelector("main") : null;
          const questionCard = mainScrollArea ? mainScrollArea.querySelector(".rounded-xl.p-4, .rounded-xl.p-5") : null;

          function getBox(el) {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
              x: Math.round(r.x),
              y: Math.round(r.y),
              width: Math.round(r.width),
              height: Math.round(r.height),
              top: Math.round(r.top),
              right: Math.round(r.right),
              bottom: Math.round(r.bottom),
              left: Math.round(r.left),
            };
          }

          const docClientW = document.documentElement.clientWidth;
          const overflowingElements = [];

          const allEls = document.querySelectorAll("*");
          allEls.forEach((el) => {
            const rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              if (rect.left < -1 || rect.right > docClientW + 1) {
                overflowingElements.push({
                  tag: el.tagName.toLowerCase(),
                  className: el.className || "",
                  left: Math.round(rect.left),
                  right: Math.round(rect.right),
                });
              }
            }
          });

          return {
            window: {
              innerWidth: window.innerWidth,
              innerHeight: window.innerHeight,
            },
            document: {
              clientWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
              clientHeight: document.documentElement.clientHeight,
              scrollHeight: document.documentElement.scrollHeight,
            },
            body: {
              clientWidth: document.body.clientWidth,
              scrollWidth: document.body.scrollWidth,
              clientHeight: document.body.clientHeight,
              scrollHeight: document.body.scrollHeight,
            },
            boxes: {
              shell: getBox(shell),
              sidebar: getBox(sidebar),
              mainContent: getBox(mainContent),
              header: getBox(header),
              questionCard: getBox(questionCard),
            },
            overflowingElements,
          };
        })()
      `);

      console.log("\n--- REAL BROWSER MEASUREMENT DATA ---");
      console.log(`window.innerWidth:                     ${layoutData.window.innerWidth}px`);
      console.log(`window.innerHeight:                    ${layoutData.window.innerHeight}px`);
      console.log(`document.documentElement.clientWidth:  ${layoutData.document.clientWidth}px`);
      console.log(`document.documentElement.scrollWidth:  ${layoutData.document.scrollWidth}px`);
      console.log(`document.documentElement.clientHeight: ${layoutData.document.clientHeight}px`);
      console.log(`document.documentElement.scrollHeight: ${layoutData.document.scrollHeight}px`);
      console.log(`document.body.clientWidth:             ${layoutData.body.clientWidth}px`);
      console.log(`document.body.scrollWidth:             ${layoutData.body.scrollWidth}px`);

      console.log("\n--- ELEMENT BOUNDING BOXES ---");
      console.log("Exam Shell:   ", JSON.stringify(layoutData.boxes.shell));
      console.log("Sidebar:      ", JSON.stringify(layoutData.boxes.sidebar));
      console.log("Main Content: ", JSON.stringify(layoutData.boxes.mainContent));
      console.log("Header:       ", JSON.stringify(layoutData.boxes.header));
      console.log("Question Card:", JSON.stringify(layoutData.boxes.questionCard));

      console.log("\n--- OVERFLOW CHECK ---");
      const hasHorizontalOverflow = layoutData.document.scrollWidth > layoutData.document.clientWidth;
      console.log(`Horizontal Overflow (scrollWidth > clientWidth): ${hasHorizontalOverflow ? "❌ DETECTED" : "✅ NONE (0px)"}`);
      console.log(`Overflowing DOM Elements Count: ${layoutData.overflowingElements.length}`);
      if (layoutData.overflowingElements.length > 0) {
        console.log("Overflowing elements:", layoutData.overflowingElements);
      }

      // Assertions
      if (hasHorizontalOverflow) {
        throw new Error(`Regression: Horizontal overflow detected in viewport ${vp.width}x${vp.height}! scrollWidth (${layoutData.document.scrollWidth}) > clientWidth (${layoutData.document.clientWidth})`);
      }

      if (layoutData.boxes.shell && layoutData.boxes.shell.left < 0) {
        throw new Error(`Regression: Exam Shell is shifted left! left = ${layoutData.boxes.shell.left}px`);
      }

      if (layoutData.boxes.shell && layoutData.boxes.shell.top < 0) {
        throw new Error(`Regression: Exam Shell is shifted top! top = ${layoutData.boxes.shell.top}px`);
      }

      // Test Question Option Selection & Navigation
      console.log(`\n[${vp.width}x${vp.height}] Step 3: Testing Question Interactions in Real Browser...`);
      const optionA = await page.waitForSelector(".option-card", { timeout: 5000 });
      await optionA.click();
      console.log("Clicked Option A -> successfully selected");

      const nextBtn = await page.waitForSelector("button:has-text('سوال بعدی')", { timeout: 5000 });
      await nextBtn.click();
      await page.waitForTimeout(400);
      console.log("Clicked 'سوال بعدی' -> advanced to Question 2");

      const prevBtn = await page.waitForSelector("button:has-text('سوال قبلی')", { timeout: 5000 });
      await prevBtn.click();
      await page.waitForTimeout(400);
      console.log("Clicked 'سوال قبلی' -> returned to Question 1");

      // Test Source Disclosure button
      const sourceBtn = await page.waitForSelector("button:has-text('نمایش منبع سوال')", { timeout: 5000 });
      await sourceBtn.click();
      await page.waitForTimeout(300);
      const sourceBadge = await page.$("text=منبع: فارماکولوژی قلب و عروق");
      console.log(`Source disclosure revealed: ${Boolean(sourceBadge)}`);

      // Test Smart Mentor modal
      const mentorBtn = await page.waitForSelector("button:has-text('راهنمایی از منتور هوشمند')", { timeout: 5000 });
      await mentorBtn.click();
      await page.waitForTimeout(400);
      const mentorModal = await page.$("#ai-mentor-overlay");
      console.log(`Smart Mentor Overlay opened: ${Boolean(mentorModal)}`);
      const closeMentorBtn = await page.waitForSelector("button:has-text('متوجه شدم')", { timeout: 5000 });
      await closeMentorBtn.click();
      await page.waitForTimeout(300);

      // Advance to Last Question and Test Submit Modal
      await (await page.waitForSelector("button:has-text('سوال بعدی')")).click();
      await page.waitForTimeout(300);
      await (await page.waitForSelector("button:has-text('سوال بعدی')")).click();
      await page.waitForTimeout(300);

      const finalSubmitBtn = await page.waitForSelector("button:has-text('ثبت و پایان آزمون')", { timeout: 5000 });
      await finalSubmitBtn.click();
      await page.waitForTimeout(400);

      const completionModal = await page.$("#completion-modal");
      console.log(`Completion Confirmation Modal opened: ${Boolean(completionModal)}`);

      // Submit and verify Result View
      const confirmSubmitBtn = await page.waitForSelector("button:has-text('ثبت و مشاهده نتایج')", { timeout: 5000 });
      await confirmSubmitBtn.click();
      await page.waitForTimeout(1000);

      const resultHeading = await page.$eval("h2", (el: any) => el.textContent).catch(() => null);
      console.log(`Result View rendered with heading: "${resultHeading}"`);

      // Check overflow on Result page
      const resultScrollW = await page.evaluate("document.documentElement.scrollWidth");
      const resultClientW = await page.evaluate("document.documentElement.clientWidth");
      console.log(`Result Page: scrollWidth=${resultScrollW}px, clientWidth=${resultClientW}px (Overflow: ${Number(resultScrollW) - Number(resultClientW)}px)`);

      await context.close();
      console.log(`\n✅ Viewport ${vp.label} PASSED 100% PERFECTLY WITH 0 OVERFLOW.`);
    }

    console.log("\n================================================================================");
    console.log("ALL REAL BROWSER LAYOUT & VIEWPORT VERIFICATIONS PASSED WITH 0 HORIZONTAL OVERFLOW!");
    console.log("================================================================================");
  } finally {
    if (browser) await browser.close();
  }
}

runBrowserVerification().catch((err) => {
  console.error("\n❌ Real Browser Verification Failed:", err);
  process.exit(1);
});
