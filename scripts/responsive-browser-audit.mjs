import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.resolve(ROOT_DIR, "apps/web/dist");
const SCREENSHOT_DIR = path.resolve(ROOT_DIR, "design-previews/responsive-audit");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

// 1. Static SPA Server
function createSpaServer(port = 5188) {
  const mimeTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
  };

  const server = http.createServer((req, res) => {
    const urlPath = req.url.split("?")[0];
    let filePath = path.join(DIST_DIR, urlPath);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // SPA fallback
    const indexPath = path.join(DIST_DIR, "index.html");
    res.writeHead(200, { "Content-Type": "text/html" });
    fs.createReadStream(indexPath).pipe(res);
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve(server);
    });
  });
}

// 2. Viewports to test
const VIEWPORTS = [
  { name: "320px", width: 320, height: 640 },
  { name: "360px", width: 360, height: 780 },
  { name: "375px", width: 375, height: 812 },
  { name: "390px", width: 390, height: 844 },
  { name: "430px", width: 430, height: 932 },
  { name: "desktop", width: 1280, height: 800 },
];

// 3. Target pages
const PAGES = [
  { name: "admin-dashboard", path: "/admin" },
  { name: "admin-courses", path: "/admin/courses" },
  { name: "admin-teachers", path: "/admin/teachers" },
  { name: "admin-content", path: "/admin/content" },
  { name: "admin-generation", path: "/admin/generation" },
  { name: "admin-blog", path: "/admin/blog" },
  { name: "admin-support", path: "/admin/support" },
  { name: "admin-settings", path: "/admin/settings" },
  { name: "admin-integrity", path: "/admin/integrity" },
  { name: "user-learning", path: "/learning" },
  { name: "user-flashcards", path: "/flashcards" },
  { name: "user-wallet", path: "/account/wallet" },
];

async function main() {
  const PORT = 5188;
  console.log("Starting static SPA server...");
  const server = await createSpaServer(PORT);
  console.log(`SPA server listening on http://127.0.0.1:${PORT}`);

  console.log("Launching Chromium headless browser...");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const auditResults = [];

  for (const vp of VIEWPORTS) {
    const vpDir = path.join(SCREENSHOT_DIR, vp.name);
    if (!fs.existsSync(vpDir)) fs.mkdirSync(vpDir, { recursive: true });

    console.log(`\n==================================================`);
    console.log(`Auditing Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    console.log(`==================================================`);

    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      locale: "fa-IR",
    });

    const page = await context.newPage();

    // Auto-grant cookie consent so banner does not occlude UI
    await page.addInitScript(() => {
      localStorage.setItem(
        "avana_analytics_consent",
        JSON.stringify({
          status: "granted",
          timestamp: Date.now(),
          expiresAt: Date.now() + 180 * 24 * 60 * 60 * 1000,
        })
      );
    });

    const mockAdminUser = {
      id: "admin-1",
      email: "admin@avana.test",
      name: "دکتر مریم احمدی",
      role: "platform_admin",
      emailVerified: true,
      phoneVerified: true,
      isVerified: true,
      status: "active",
      createdAt: "2026-01-01T00:00:00Z",
    };

    // Centralised Route Interception ensuring navigation documents are NEVER blocked
    await page.route("**", (route) => {
      const req = route.request();
      const url = req.url();
      const resourceType = req.resourceType();

      // Let document navigation and static assets pass through
      if (
        resourceType === "document" ||
        resourceType === "stylesheet" ||
        resourceType === "script" ||
        resourceType === "image" ||
        resourceType === "font"
      ) {
        return route.continue();
      }

      // Handle Auth
      if (url.includes("/v1/me") || url.includes("/api/auth/me") || url.includes("/v1/auth/me")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ user: mockAdminUser, memberships: [] }),
        });
      }

      // Handle Dashboard Stats
      if (url.includes("/admin/dashboard") || url.includes("/v1/admin/dashboard")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            totalUsers: 1420,
            newUsersToday: 18,
            totalCourses: 12,
            totalLessons: 84,
            totalFlashcards: 520,
            totalQuizzes: 45,
            totalDocuments: 38,
            generationSuccessRate: 96,
            generationsToday: 64,
            activeSubscriptions: 215,
            walletBalancesTotal: 45000000,
            revenueToday: 1250000,
            systemHealth: { database: "healthy", redis: "healthy", ai: "healthy" },
          }),
        });
      }

      if (url.includes("/v1/admin/system/health")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            database: "healthy",
            redis: "healthy",
            ai: "healthy",
            lastCheck: new Date().toISOString(),
          }),
        });
      }

      if (url.includes("/v1/admin/system/audit")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            logs: [
              {
                id: "aud-1",
                adminEmail: "admin@avana.test",
                action: "ویرایش سرفصل دوره داروشناسی بالینی",
                entity: "course",
                entityId: "c-101",
                timestamp: new Date().toISOString(),
              },
            ],
            totalCount: 1,
          }),
        });
      }

      if (url.includes("/v1/admin/courses") || url.includes("/api/courses")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            courses: [
              {
                id: "c-1",
                name: "فارماکولوژی بالینی و درمان‌شناسی پیشرفته بیمارستانی",
                subject: "داروسازی بالینی",
                description: "بررسی جامع فارماکوکینتیک بالینی، دوزبندی و تداخلات دارویی در بخش‌های مراقبت‌های ویژه",
                status: "published",
                isOfficial: true,
                scope: "official",
                counts: { modules: 6, lessons: 32, flashcards: 140, quizzes: 50 },
                createdAt: "2026-08-01T10:00:00Z",
                product: { price: 350000, active: true },
              },
              {
                id: "c-2",
                name: "شیمی دارویی ساختار و سنتز مولکول‌های درمانی ضد سرطان",
                subject: "شیمی دارویی",
                description: "مبانی مولکولی و طراحی مهارکننده‌های تیروزین کیناز",
                status: "draft",
                isOfficial: true,
                scope: "official",
                counts: { modules: 4, lessons: 18, flashcards: 90, quizzes: 25 },
                createdAt: "2026-09-10T12:00:00Z",
              },
            ],
            totalCount: 2,
            counts: { official: 2, teacher: 0, user: 0 },
          }),
        });
      }

      if (url.includes("/v1/admin/teachers")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            teachers: [
              {
                id: "t-1",
                name: "دکتر حسام طباطبایی نائینی",
                email: "h.tabatabaei@tehran.ac.ir",
                role: "teacher",
                teacherStatus: "approved",
                emailVerified: true,
                createdAt: "2026-05-12T08:00:00Z",
                classroomsCount: 4,
                examsCount: 12,
                studentsCount: 240,
                university: "دانشگاه علوم پزشکی تهران",
              },
              {
                id: "t-2",
                name: "دکتر فاطمه سادات میرمحمدی",
                email: "mirmohammadi@sbmu.ac.ir",
                role: "teacher",
                teacherStatus: "pending",
                emailVerified: true,
                createdAt: "2026-07-20T11:00:00Z",
                classroomsCount: 2,
                examsCount: 5,
                studentsCount: 85,
                university: "دانشگاه علوم پزشکی شهید بهشتی",
              },
            ],
            totalCount: 2,
            stats: {
              totalTeachers: 48,
              totalClassrooms: 132,
              totalExams: 85,
              totalStudents: 1240,
            },
          }),
        });
      }

      if (url.includes("/v1/admin/generation")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            jobs: [
              {
                id: "j-1",
                type: "lesson",
                status: "completed",
                errorMessage: null,
                createdAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                documentName: "pharmacology_chapter_4_renal_clearance.pdf",
                userEmail: "instructor@pharmacy.edu",
              },
            ],
            totalCount: 1,
          }),
        });
      }

      if (url.includes("/api/admin/blog/stats")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            stats: { totalPosts: 14, publishedPosts: 10, draftPosts: 4, totalViews: 8520 },
          }),
        });
      }

      if (url.includes("/api/admin/blog/posts")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            posts: [
              {
                id: "p-1",
                title: "راهنمای جامع مطالعه آزمون جامع داروسازی (۱۸۰ واحدی)",
                slug: "comprehensive-pharmacy-exam-guide",
                excerpt: "استراتژی‌های اثبات‌شده برای تسلط بر فارماکولوژی، فارماسیوتیکس و شیمی دارویی",
                status: "published",
                viewCount: 3200,
                readingTimeMinutes: 8,
                category: { id: "cat-1", name: "آزمون‌های جامع" },
                createdAt: new Date().toISOString(),
              },
            ],
            totalCount: 1,
          }),
        });
      }

      if (url.includes("/api/admin/blog/categories")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            categories: [{ id: "cat-1", name: "آزمون‌های جامع", slug: "exams", postCount: 5 }],
          }),
        });
      }

      if (url.includes("/api/admin/support/tickets")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: [
              {
                id: "tkt-1",
                title: "عدم نمایش درسنامه فصل سوم فارماسیوتیکس در اپلیکیشن",
                userName: "سارا رضایی",
                userEmail: "sara.rezaei@student.ac.ir",
                category: "technical",
                priority: "high",
                status: "open",
                lastActivityAt: new Date().toISOString(),
              },
            ],
            total: 1,
          }),
        });
      }

      if (url.includes("/api/admin/settings")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            general: {
              appName: "پلتفرم آموزشی آوانا",
              environment: "production",
              version: "2.5.0-mobile-stable",
            },
            ai: {
              defaultModel: "gemini-2.5-flash",
              maxTokens: "8192",
            },
            system: {
              region: "tehran-dc1",
              cacheEngine: "redis-cluster",
            },
          }),
        });
      }

      if (url.includes("/api/admin/features")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            features: [
              { id: "f1", name: "آزمون‌ساز پیشرفته چندفصلی", status: "enabled" },
              { id: "f2", name: "فلش‌کارت‌های تکرار فاصله‌دار لایتنر", status: "enabled" },
            ],
          }),
        });
      }

      if (url.includes("/v1/admin/system/integrity") || url.includes("/admin/integrity")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            orphanLessons: 0,
            orphanQuizzes: 0,
            brokenMedia: 0,
            unindexedDocuments: 0,
            stalledJobs: 0,
          }),
        });
      }

      if (url.includes("/api/wallet")) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ balance: 250000 }),
        });
      }

      return route.continue();
    });

    // Audit each page
    for (const pg of PAGES) {
      try {
        await page.goto(`http://127.0.0.1:${PORT}${pg.path}`, {
          waitUntil: "networkidle",
          timeout: 10000,
        });

        // Wait a moment for rendering
        await page.waitForTimeout(500);

        // Check horizontal window overflow
        const overflowCheck = await page.evaluate(() => {
          const docEl = document.documentElement;
          const body = document.body;
          const winWidth = window.innerWidth;
          const scrollWidth = Math.max(docEl.scrollWidth, body.scrollWidth);
          const hasHorizontalOverflow = scrollWidth > winWidth + 1; // 1px threshold for subpixel

          const elements = Array.from(document.querySelectorAll("*"));
          const overflowingElements = [];

          for (const el of elements) {
            if (["SCRIPT", "STYLE", "HEAD", "META", "TITLE", "LINK"].includes(el.tagName)) continue;
            const rect = el.getBoundingClientRect();
            if (rect.right > winWidth + 2 && !el.closest(".overflow-x-auto")) {
              overflowingElements.push({
                tag: el.tagName,
                className: el.className?.toString?.().slice(0, 80) || "",
                text: el.textContent?.trim?.().slice(0, 40) || "",
                rect: { right: Math.round(rect.right), width: Math.round(rect.width) },
              });
            }
          }

          return {
            winWidth,
            scrollWidth,
            hasHorizontalOverflow,
            overflowingElementsCount: overflowingElements.length,
            sampleOverflow: overflowingElements.slice(0, 3),
          };
        });

        // Check text wrapping anomalies
        const textAnomalyCheck = await page.evaluate(() => {
          const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, span, p, a, button"));
          const anomalies = [];

          for (const el of headings) {
            const text = el.innerText?.trim?.() || "";
            if (!text || text.length > 25 || text.length < 5) continue;
            if (/^[0-9\s/.,\-+]+$/.test(text)) continue;

            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) continue;

            const words = text.split(/\s+/).filter(Boolean);
            if (words.length >= 2 && rect.width < 50 && rect.height >= rect.width * 1.5) {
              anomalies.push({
                text,
                width: Math.round(rect.width),
                height: Math.round(rect.height),
                tag: el.tagName,
                className: el.className?.toString?.().slice(0, 60) || "",
              });
            }
          }

          return anomalies;
        });

        const screenshotPath = path.join(vpDir, `${pg.name}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: false });

        const result = {
          viewport: vp.name,
          page: pg.name,
          width: vp.width,
          scrollWidth: overflowCheck.scrollWidth,
          hasHorizontalOverflow: overflowCheck.hasHorizontalOverflow,
          overflowCount: overflowCheck.overflowingElementsCount,
          sampleOverflow: overflowCheck.sampleOverflow,
          textAnomalies: textAnomalyCheck,
          screenshot: path.relative(ROOT_DIR, screenshotPath),
        };

        auditResults.push(result);

        const statusIcon = result.hasHorizontalOverflow || result.textAnomalies.length > 0 ? "⚠️" : "✅";
        console.log(
          `  ${statusIcon} [${pg.name}] scrollWidth: ${result.scrollWidth}px (win: ${vp.width}px) | Text anomalies: ${result.textAnomalies.length}`
        );
      } catch (err) {
        console.error(`  ❌ Error testing ${pg.name} on ${vp.name}:`, err.message);
      }
    }

    await context.close();
  }

  await browser.close();
  server.close();

  const reportPath = path.resolve(ROOT_DIR, "design-previews/responsive-audit/audit-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(auditResults, null, 2));
  console.log(`\nAudit complete! Full JSON report written to: ${reportPath}`);
}

main().catch((err) => {
  console.error("Audit failed:", err);
  process.exit(1);
});
