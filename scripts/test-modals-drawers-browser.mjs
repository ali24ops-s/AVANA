import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const DIST_DIR = path.resolve(ROOT_DIR, "apps/web/dist");
const SCREENSHOT_DIR = path.resolve(ROOT_DIR, "design-previews/responsive-audit/drawers-modals");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function createSpaServer(port = 5189) {
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

const VIEWPORTS = [
  { name: "320px", width: 320, height: 640 },
  { name: "375px", width: 375, height: 812 },
  { name: "desktop", width: 1280, height: 800 },
];

async function main() {
  const PORT = 5189;
  const server = await createSpaServer(PORT);
  console.log(`Modal/Drawer server listening on http://127.0.0.1:${PORT}`);

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  for (const vp of VIEWPORTS) {
    console.log(`\nTesting Drawers & Modals on Viewport: ${vp.name} (${vp.width}x${vp.height})`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      locale: "fa-IR",
    });

    const page = await context.newPage();

    // Mock API requests
    await page.route("**/api/auth/me", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "admin-1",
            email: "admin@avana.test",
            name: "دکتر مریم احمدی",
            role: "platform_admin",
            emailVerified: true,
            isVerified: true,
          },
        }),
      })
    );

    await page.route("**/admin/teachers**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          teachers: [
            {
              id: "t-1",
              name: "دکتر حسام طباطبایی نائینی",
              email: "h.tabatabaei@tehran.ac.ir",
              role: "teacher",
              teacherStatus: "pending",
              emailVerified: true,
              createdAt: "2026-05-12T08:00:00Z",
              classroomsCount: 4,
              examsCount: 12,
              studentsCount: 240,
              university: "دانشگاه علوم پزشکی تهران",
            },
          ],
          totalCount: 1,
          stats: {
            totalTeachers: 48,
            totalClassrooms: 132,
            totalExams: 85,
            totalStudents: 1240,
          },
        }),
      })
    );

    // Mock teacher details for drawer
    await page.route("**/admin/teachers/t-1**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          teacher: {
            id: "t-1",
            name: "دکتر حسام طباطبایی نائینی",
            email: "h.tabatabaei@tehran.ac.ir",
            role: "teacher",
            teacherStatus: "pending",
            university: "دانشگاه علوم پزشکی تهران",
            faculty: "دانشکده داروسازی",
            department: "گروه فارماکولوژی و سم‌شناسی بالینی",
            createdAt: "2026-05-12T08:00:00Z",
          },
          classrooms: [
            {
              id: "cls-1",
              title: "فارماکولوژی بالینی ۲ - ورودی بهمن ۱۴۰۱",
              description: "بررسی فارماکوکینتیک بالینی و دوزبندی در نارسایی‌های کلیوی",
              inviteCode: "PHARM-1401",
              status: "active",
              createdAt: "2026-06-01T00:00:00Z",
              membersCount: 42,
              examsCount: 3,
            },
          ],
          exams: [
            {
              id: "ex-1",
              title: "آزمون میان‌ترم تداخلات دارویی و فارماکوکینتیک",
              status: "published",
              classroomTitle: "فارماکولوژی بالینی ۲",
              submissionsCount: 38,
              averageScore: 16.4,
              maxScore: 20,
              createdAt: "2026-07-01T00:00:00Z",
            },
          ],
        }),
      })
    );

    await page.goto(`http://127.0.0.1:${PORT}/admin/teachers`, {
      waitUntil: "networkidle",
      timeout: 10000,
    });
    await page.waitForTimeout(300);

    // 1. Open Reject Modal
    const rejectBtn = page.locator('button[data-testid="reject-teacher-t-1"]');
    if (await rejectBtn.count() > 0) {
      await rejectBtn.first().click();
      await page.waitForTimeout(300);

      const modalOverflow = await page.evaluate(() => {
        const modal = document.querySelector('div[role="dialog"]');
        if (!modal) return { exists: false };
        const rect = modal.getBoundingClientRect();
        return {
          exists: true,
          rect: { width: Math.round(rect.width), right: Math.round(rect.right) },
          winWidth: window.innerWidth,
          isContained: rect.right <= window.innerWidth && rect.left >= 0,
        };
      });

      console.log(`  Modal test: Contained within ${vp.width}px?`, modalOverflow.isContained ? "✅ Yes" : "❌ No", modalOverflow);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${vp.name}-reject-modal.png`) });

      // Close modal
      const cancelBtn = page.getByRole("button", { name: "انصراف" });
      if (await cancelBtn.count() > 0) await cancelBtn.click();
      await page.waitForTimeout(300);
    }

    // 2. Open Teacher Details Drawer by clicking the row
    const row = page.locator("tbody tr").first();
    if (await row.count() > 0) {
      await row.click();
      await page.waitForTimeout(500);

      const drawerOverflow = await page.evaluate(() => {
        const drawer = document.querySelector('div[role="dialog"]') || document.querySelector('.fixed.inset-y-0');
        if (!drawer) return { exists: false };
        const rect = drawer.getBoundingClientRect();
        return {
          exists: true,
          rect: { width: Math.round(rect.width), right: Math.round(rect.right) },
          winWidth: window.innerWidth,
          isContained: rect.right <= window.innerWidth && rect.left >= 0,
        };
      });

      console.log(`  Teacher Details Drawer test: Contained within ${vp.width}px?`, drawerOverflow.isContained ? "✅ Yes" : "❌ No", drawerOverflow);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${vp.name}-teacher-drawer.png`) });
    }

    await context.close();
  }

  await browser.close();
  server.close();
  console.log("\nModal/Drawer visual test completed successfully!");
}

main().catch((err) => {
  console.error("Modal test failed:", err);
  process.exit(1);
});
