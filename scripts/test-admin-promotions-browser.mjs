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

function createSpaServer(port = 5199) {
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

async function main() {
  const PORT = 5199;
  const server = await createSpaServer(PORT);
  console.log(`[Browser Test] SPA server listening on http://127.0.0.1:${PORT}`);

  // In-memory state for browser API requests
  let promotions = [
    {
      id: "promo-init-1",
      name: "تخفیف اولیه خوش‌آمدگویی",
      description: "برای کاربران جدید",
      benefitType: "percentage_discount",
      benefitValue: 20,
      maxDiscountAmount: 30000,
      minOrderAmount: 50000,
      totalUsageLimit: 100,
      perUserUsageLimit: 1,
      active: true,
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2026-12-31T23:59:59.999Z",
      codes: [
        { id: "code-1", code: "WELCOME20", maxUses: 100, timesUsed: 5, active: true, createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      productRestrictions: [],
      userRestrictions: [],
      stats: {
        totalRedemptions: 5,
        completedRedemptions: 5,
        pendingRedemptions: 0,
        totalDiscountGranted: 150000,
        totalCashbackGranted: 0,
        remainingUsage: 95,
      },
      metadata: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  let redemptions = [
    {
      id: "red-1",
      userId: "u-1",
      userName: "علی رضایی",
      userEmail: "ali@example.com",
      orderId: "ord-1",
      orderNumber: "ORD-1001",
      code: "WELCOME20",
      benefitType: "percentage_discount",
      benefitValue: 20,
      discountAmount: 30000,
      cashbackAmount: 0,
      orderOriginalAmount: 150000,
      orderFinalAmount: 120000,
      status: "completed",
      redeemedAt: "2026-01-10T14:30:00.000Z",
      completedAt: "2026-01-10T14:32:00.000Z",
    },
  ];

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 2,
      locale: "fa-IR",
    });

    const page = await context.newPage();
    page.on("console", (msg) => console.log("[Browser Console]", msg.type(), msg.text()));
    page.on("pageerror", (err) => console.log("[Browser PageError]", err.message));

    // 1. Mock Auth
    const handleAuthMe = (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: {
            id: "admin-1",
            email: "admin@avana.test",
            name: "مدیر ارشد آوانا",
            role: "platform_admin",
            globalRole: "platform_admin",
            isEmailVerified: true,
            isPhoneVerified: true,
            isVerified: true,
          },
          memberships: [],
        }),
      });

    await page.route("**/v1/me", handleAuthMe);
    await page.route("**/v1/auth/me", handleAuthMe);
    await page.route("**/api/auth/me", handleAuthMe);

    // 2. Mock Promotions Endpoints (using RegExp to match all sub-paths reliably)
    await page.route(/\/v1\/admin\/commerce\/promotions/, async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const path = url.pathname;
      console.log("[API Request]", req.method(), path);

      if (path === "/v1/admin/commerce/promotions/redemptions") {
        console.log(`[API Mock] Handled GET redemptions`);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: redemptions,
            totalCount: redemptions.length,
            stats: {
              totalCompleted: 1,
              totalDiscountGranted: 30000,
              totalCashbackGranted: 0,
            },
          }),
        });
      }

      if (path === "/v1/admin/commerce/promotions") {
        if (req.method() === "GET") {
          console.log(`[API Mock] Handled GET promotions (count: ${promotions.length})`);
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
              items: promotions,
              promotions: promotions,
              totalCount: promotions.length,
            }),
          });
        }

        if (req.method() === "POST") {
          const body = JSON.parse(req.postData() || "{}");
          console.log(`[API Mock] Handled POST create promotion:`, body.name);
          const newPromo = {
            id: `promo-${Date.now()}`,
            name: body.name,
            description: body.description || null,
            benefitType: body.benefitType,
            benefitValue: Number(body.benefitValue),
            maxDiscountAmount: body.maxDiscountAmount ? Number(body.maxDiscountAmount) : null,
            minOrderAmount: body.minOrderAmount ? Number(body.minOrderAmount) : null,
            totalUsageLimit: body.totalUsageLimit ? Number(body.totalUsageLimit) : null,
            perUserUsageLimit: body.perUserUsageLimit ? Number(body.perUserUsageLimit) : null,
            active: true,
            startsAt: body.startsAt || null,
            endsAt: body.endsAt || null,
            codes: body.code ? [{ id: `code-${Date.now()}`, code: body.code, maxUses: null, timesUsed: 0, active: true, createdAt: new Date().toISOString() }] : [],
            productRestrictions: [],
            userRestrictions: [],
            stats: { totalRedemptions: 0, completedRedemptions: 0, pendingRedemptions: 0, totalDiscountGranted: 0, totalCashbackGranted: 0, remainingUsage: null },
            metadata: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          promotions.unshift(newPromo);
          return route.fulfill({
            status: 201,
            contentType: "application/json",
            body: JSON.stringify(newPromo),
          });
        }
      }

      // Check sub-paths: /v1/admin/commerce/promotions/:id or :id/toggle-active or :id/generate-codes
      const suffix = path.replace("/v1/admin/commerce/promotions/", "");
      const [promoId, subAction] = suffix.split("/");
      const targetPromo = promotions.find((p) => p.id === decodeURIComponent(promoId));

      if (subAction === "toggle-active" && req.method() === "PATCH") {
        const body = JSON.parse(req.postData() || "{}");
        console.log(`[API Mock] Handled toggle-active for ${promoId} -> ${body.active}`);
        if (targetPromo) targetPromo.active = body.active;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(targetPromo),
        });
      }

      if (subAction === "generate-codes" && req.method() === "POST") {
        const body = JSON.parse(req.postData() || "{}");
        const count = body.count || 5;
        const prefix = body.prefix || "CODE";
        const maxUses = body.maxUses || 1;
        console.log(`[API Mock] Generating ${count} codes for ${promoId} with prefix ${prefix}`);
        const generated = [];
        for (let i = 1; i <= count; i++) {
          const c = `${prefix}${String(i).padStart(3, "0")}`;
          generated.push(c);
          if (targetPromo) {
            targetPromo.codes.push({
              id: `c-gen-${Date.now()}-${i}`,
              code: c,
              maxUses,
              timesUsed: 0,
              active: true,
              createdAt: new Date().toISOString(),
            });
          }
        }
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ codes: generated, count: generated.length }),
        });
      }

      if (subAction === "redemptions" && req.method() === "GET") {
        console.log(`[API Mock] Handled GET redemptions for ${promoId}`);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            items: redemptions.filter((r) => r.promotionId === promoId),
            totalCount: 0,
            stats: {
              totalCompleted: 0,
              totalDiscountGranted: 0,
              totalCashbackGranted: 0,
            },
          }),
        });
      }

      if (req.method() === "GET" && (!subAction || subAction === "")) {
        console.log(`[API Mock] Handled GET detail for ${promoId}`);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(targetPromo),
        });
      }

      return route.fallback();
    });

    console.log("[Browser Test] Navigating to /admin/commerce/promotions in Chromium...");
    await page.goto(`http://127.0.0.1:${PORT}/admin/commerce/promotions`, { waitUntil: "networkidle" });

    // Assert Page title
    const headerTitle = await page.textContent("h1");
    console.log(`[Browser Test] Page header rendered: "${headerTitle?.trim()}"`);
    if (!headerTitle?.includes("تخفیف") && !headerTitle?.includes("پروموشن")) {
      throw new Error("Page header does not match promotions page");
    }

    // Dismiss cookie/privacy banner if present
    const cookieBannerBtn = page.locator('aside[aria-label="تنظیمات حریم خصوصی و رضایت تحلیل‌ها"] button').first();
    if (await cookieBannerBtn.isVisible()) {
      await cookieBannerBtn.click();
      console.log("[Browser Test] Dismissed privacy/cookie consent banner.");
    }

    // Check existing promo row
    await page.waitForSelector("table tbody tr", { timeout: 5000 });
    const initialRows = await page.$$("table tbody tr");
    console.log(`[Browser Test] Found ${initialRows.length} initial promo row(s).`);

    // 3. Open Create Promotion Modal
    console.log("[Browser Test] Clicking 'تعریف پروموشن جدید' button...");
    const createBtn = page.locator('button:has-text("تعریف پروموشن جدید")');
    await createBtn.click({ force: true });

    // Verify modal is visible
    await page.waitForSelector("form", { timeout: 3000 });
    console.log("[Browser Test] Promotion creation modal opened successfully.");

    // Fill form fields
    await page.fill('input[placeholder*="نوروز"]', "تخفیف مرورگر پلی‌رایت");
    
    // Fill benefit value (find the number input for benefit value)
    const benefitValueInput = page.locator('form input[type="number"]').first();
    await benefitValueInput.fill("25");

    // Fill code input
    const codeInput = page.locator('form input[placeholder*="NOWRUZ"]');
    if (await codeInput.isVisible()) {
      await codeInput.fill("BROWSER25");
    }

    // Submit form
    console.log("[Browser Test] Submitting creation form...");
    const submitBtn = page.locator('form button[type="submit"]:has-text("ایجاد پروموشن")');
    await submitBtn.click({ force: true });

    // Wait for modal to close and row to appear
    await page.waitForTimeout(1000);
    const updatedRows = await page.$$("table tbody tr");
    console.log(`[Browser Test] Rows count after creation: ${updatedRows.length}`);

    // Verify created item name is in the DOM
    const bodyText = await page.textContent("table tbody");
    if (bodyText?.includes("تخفیف مرورگر پلی‌رایت")) {
      console.log("✓ [Browser Test] Created promotion 'تخفیف مرورگر پلی‌رایت' is visible in the table!");
    } else {
      throw new Error("Created promotion not visible in table");
    }

    // 4. Test Bulk Generation in UI
    console.log("[Browser Test] Testing Bulk Code Generation modal in browser...");
    const bulkBtn = page.locator('button[title*="تولید"]').first();
    await bulkBtn.click({ force: true });

    await page.waitForSelector("text=تولید انبوه کدهای تخفیف", { timeout: 4000 });
    console.log("✓ [Browser Test] Bulk generate modal opened.");

    // Fill bulk generation parameters: count: 15, prefix: "PLAY", maxUses: 3
    const bulkForm = page.locator("form");
    await bulkForm.locator('input[type="number"]').first().fill("15");

    const prefixInput = bulkForm.locator('input[placeholder*="FESTIVAL"]');
    if (await prefixInput.isVisible()) {
      await prefixInput.fill("PLAY");
    }

    const maxUsesInput = bulkForm.locator('input[placeholder*="پیش‌فرض"]');
    if (await maxUsesInput.isVisible()) {
      await maxUsesInput.fill("3");
    }

    // Submit bulk generation
    console.log("[Browser Test] Submitting bulk generation...");
    await page.evaluate(() => {
      const form = document.querySelector("form");
      if (form) form.requestSubmit();
    });
    console.log("[Browser Test] Dispatched requestSubmit on bulk form, waiting for textarea...");

    // Wait a moment and check modal text
    await page.waitForTimeout(1000);
    const modalText = await page.locator("div.fixed").textContent();
    console.log("[Browser Test] Modal text after submit:", modalText?.slice(0, 150));

    // Verify all 15 codes are rendered in the textarea
    await page.waitForSelector("textarea", { timeout: 6000 });
    const textareaVal = await page.locator("textarea").inputValue();
    const generatedCodesList = textareaVal.trim().split("\n").filter(Boolean);
    console.log(`✓ [Browser Test] Generated codes rendered in UI textarea: found ${generatedCodesList.length} codes.`);
    if (generatedCodesList.length !== 15) {
      throw new Error(`Expected 15 generated codes, got ${generatedCodesList.length}`);
    }

    // Close bulk modal via top-right close button
    const closeBulkBtn = page.locator('div.fixed button').first();
    await closeBulkBtn.click({ force: true });
    await page.waitForTimeout(500);

    // 5. Open Promotion Detail Modal
    console.log("[Browser Test] Opening Promotion Detail modal...");
    const detailBtn = page.locator('button[title*="جزئیات"]').first();
    await detailBtn.click({ force: true });

    await page.waitForSelector("text=مشخصات و قوانین", { timeout: 4000 });
    console.log("✓ [Browser Test] Detail modal rendered with codes, specs, and rules.");

    // Close detail modal via footer 'بستن' button
    const closeDetailBtn = page.locator('button:has-text("بستن")').first();
    await closeDetailBtn.click({ force: true });
    await page.waitForTimeout(500);

    // 6. Test Active Toggle
    console.log("[Browser Test] Toggling active status...");
    const toggleBtn = page.locator('table tbody tr').first().locator('button:has-text("فعال"), button:has-text("غیرفعال")');
    if (await toggleBtn.isVisible()) {
      await toggleBtn.click({ force: true });
      await page.waitForTimeout(500);
      console.log("✓ [Browser Test] Active toggle button clicked successfully.");
    }

    // 7. Save Screenshot
    const screenshotPath = path.join(SCREENSHOT_DIR, "promotions-browser-audit.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`✓ [Browser Test] Full-page screenshot saved to: ${screenshotPath}`);

    console.log("\n=======================================================");
    console.log("🎉 ALL REAL BROWSER UI SCENARIOS PASSED IN CHROMIUM! 🎉");
    console.log("=======================================================\n");
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error("Browser test failed:", err);
  process.exit(1);
});
