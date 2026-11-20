import { chromium } from "playwright";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempHtmlPath = path.join(__dirname, "temp-mobile-test-mindmap-export.html");
const screenshotDir = path.join(__dirname, "screenshots");
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

// 1. Generate real standalone HTML with rich content (including long text and multiple nodes)
console.log("Generating standalone HTML export for Mobile Drawer Playwright test...");
const generateScript = `
import { exportMindMapToHtml } from './apps/web/src/components/mindmap/export/mindMapHtmlExporter';
import fs from 'fs';

const payload = {
  aiBase: {
    rootNodeId: 'root',
    nodes: {
      root: {
        id: 'root',
        parentId: null,
        title: 'فارماکولوژی قلب و عروق',
        shortDescription: 'مرور جامع داروهای قلبی و دسته‌بندی آن‌ها',
        depth: 0,
        isRoot: true
      },
      node_branch_1: {
        id: 'node_branch_1',
        parentId: 'root',
        title: 'بتابلوکرها',
        shortDescription: 'داروهای مسدودکننده گیرنده بتا آدرنرژیک',
        detailedExplanation: 'داروهای این دسته در درمان پرفشاری خون، آنژین صدری، تاکی‌آریتمی و نارسایی قلبی به کار می‌روند. مکانیسم اصلی آن‌ها مهار اثرات تحریکی کاتکول‌آمین‌ها بر گیرنده‌های بتا-۱ و بتا-۲ است.',
        keyPoints: [
          'کاهش ضربان قلب (Chronotropic منفی)',
          'کاهش انقباض میوکارد (Inotropic منفی)',
          'مهار ترشح رنین از دستگاه جوکستاگلومرولی کلیه',
          'کاهش مصرف اکسیژن میوکارد'
        ],
        examTips: [
          'کنترااندیکاسیون قطعی در آسم و برونکواسپاسم شدید',
          'در بیماران دیابتی علائم هایپوگلایسمی به جز تعریق را ماسکه می‌کند',
          'قطع ناگهانی باعث سندرم Rebound و خطر انفارکتوس میوکارد می‌شود'
        ],
        depth: 1
      },
      node_sub_1: {
        id: 'node_sub_1',
        parentId: 'node_branch_1',
        title: 'پروپرانولول',
        shortDescription: 'بتابلوکر غیرانتخابی نسل اول',
        detailedExplanation: 'پروپرانولول اولین بتابلوکر موفق کلینیکی است. حلالیت بالا در چربی دارد و به راحتی از سد خونی-مغزی عبور می‌کند که باعث عوارضی چون رویاهای شفاف و افسردگی می‌شود.',
        depth: 2
      },
      node_sub_2: {
        id: 'node_sub_2',
        parentId: 'node_branch_1',
        title: 'متوپرولول',
        shortDescription: 'بتابلوکر انتخابی بتا-۱ (کاردیوسلکتیو)',
        detailedExplanation: 'در دوزهای پایین ترجیحاً گیرنده‌های بتا-۱ را مهار می‌کند و عوارض اسپاسم برونش کمتری نسبت به پروپرانولول دارد.',
        depth: 2
      },
      node_branch_2: {
        id: 'node_branch_2',
        parentId: 'root',
        title: 'مهارکننده‌های ACE',
        shortDescription: 'مهارکننده آنزیم مبدل آنژیوتانسین',
        detailedExplanation: 'آنزیم ACE را مهار کرده و تبدیل آنژیوتانسین ۱ به ۲ را بلوک می‌کند. همچنین تخریب برادی‌کینین را مهار کرده و باعث افزایش سطح آن می‌شود که علت اصلی سرفه خشک ناشی از این داروهاست.',
        keyPoints: [
          'کاهش مقاومت عروقی بدون ایجاد تاکی‌کاردی رفلکسی',
          'محافظت کلیوی در نفروپاتی دیابتی',
          'کاهش بازآرایی (Remodeling) بطنی پس از MI'
        ],
        examTips: [
          'کنترااندیکاسیون در تنگی دوطرفه شریان کلیوی',
          'کنترااندیکاسیون در بارداری (تراتوژنیک در سه ماهه دوم و سوم)',
          'شایع‌ترین عارضه سرفه خشک و خطرناک‌ترین آنژیوادم است'
        ],
        depth: 1
      }
    },
    customEdges: []
  }
};

const html = exportMindMapToHtml(payload, new Set(), 'مایندمپ داروشناسی بالینی', 'فصل ۳: فارماکولوژی قلب');
fs.writeFileSync('${tempHtmlPath}', html, 'utf8');
`;

execSync(`npx tsx -e "${generateScript.replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`, {
  stdio: "inherit",
  cwd: "/Users/ops/Desktop/avana-landing-and-onboarding"
});

async function runMobileVerification() {
  console.log("Launching Headless Chromium for Mobile UX Tests...");
  const browser = await chromium.launch({
    headless: true,
  });

  const mobileWidths = [360, 390, 430];

  for (const width of mobileWidths) {
    const height = 844;
    console.log(`\\n==================================================`);
    console.log(`📱 TESTING MOBILE VIEWPORT: ${width}x${height}`);
    console.log(`==================================================`);

    const context = await browser.newContext({
      viewport: { width, height },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on("pageerror", (err) => {
      console.error("PAGE ERROR:", err.message);
      consoleErrors.push(err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        console.error("CONSOLE ERROR:", msg.text());
        consoleErrors.push(msg.text());
      }
    });

    const fileUrl = `file://${tempHtmlPath}`;
    await page.goto(fileUrl, { waitUntil: "load" });
    await page.waitForTimeout(300);

    // TEST 1: Initial State immediately after page load
    console.log("1. Verifying Closed Initial State (Zero Bleed & Hidden)...");
    const drawer = page.locator("#drawer");
    const drawerOverlay = page.locator("#drawerOverlay");

    const isDrawerOpen = await drawer.evaluate((el) => el.classList.contains("open"));
    if (isDrawerOpen) throw new Error("Drawer should NOT have 'open' class on initial load");

    const drawerStyles = await drawer.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        visibility: computed.visibility,
        pointerEvents: computed.pointerEvents,
        boxShadow: computed.boxShadow,
        opacity: computed.opacity,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          bottom: rect.bottom,
        },
        ariaHidden: el.getAttribute("aria-hidden"),
      };
    });

    console.log(`   Drawer computed: visibility=${drawerStyles.visibility}, pointerEvents=${drawerStyles.pointerEvents}, y=${drawerStyles.rect.y}, height=${drawerStyles.rect.height}`);

    if (drawerStyles.visibility !== "hidden") {
      throw new Error(`Drawer visibility must be 'hidden' on initial load, got '${drawerStyles.visibility}'`);
    }
    if (drawerStyles.pointerEvents !== "none") {
      throw new Error(`Drawer pointerEvents must be 'none' on initial load, got '${drawerStyles.pointerEvents}'`);
    }
    if (drawerStyles.ariaHidden !== "true") {
      throw new Error(`Drawer aria-hidden must be 'true' on initial load, got '${drawerStyles.ariaHidden}'`);
    }
    if (drawerStyles.boxShadow !== "none" && !drawerStyles.boxShadow.includes("none")) {
      throw new Error(`Drawer box-shadow must be 'none' on initial load, got '${drawerStyles.boxShadow}'`);
    }
    // Check that drawer rect is at or below the bottom of the viewport
    if (drawerStyles.rect.y < height - 1) {
      throw new Error(`Drawer rect.y (${drawerStyles.rect.y}) is inside viewport (${height})! Must be offscreen at bottom.`);
    }

    const overlayStyles = await drawerOverlay.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        visibility: computed.visibility,
        pointerEvents: computed.pointerEvents,
        opacity: computed.opacity,
      };
    });
    if (overlayStyles.visibility !== "hidden" || overlayStyles.pointerEvents !== "none" || parseFloat(overlayStyles.opacity) > 0.05) {
      throw new Error(`Drawer overlay must be hidden on initial load, got ${JSON.stringify(overlayStyles)}`);
    }

    if (width === 390) {
      await page.screenshot({ path: path.join(screenshotDir, `mobile-${width}-1-initial-closed.png`) });
    }
    console.log(`✓ PASS: Initial state is 100% closed, hidden, zero-shadow, and non-interactive.`);

    // TEST 2: Pan canvas up and Open Bottom Sheet on Node Click
    console.log("2. Testing Node Click & Opening Mobile Bottom Sheet...");
    // Pan canvas up so nodes are visible in upper area above bottom sheet
    await page.mouse.move(width / 2, 550);
    await page.mouse.down();
    await page.mouse.move(width / 2, 170, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const targetNode1 = page.locator('.node-group[data-id="node_branch_1"]');
    const n1Box = await targetNode1.boundingBox();
    if (!n1Box) throw new Error("Could not find node_branch_1 bounding box");
    await page.mouse.click(n1Box.x + n1Box.width / 2, n1Box.y + n1Box.height / 2);
    await page.waitForTimeout(350); // allow transition

    const openStyles = await drawer.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        isOpen: el.classList.contains("open"),
        visibility: computed.visibility,
        pointerEvents: computed.pointerEvents,
        boxShadow: computed.boxShadow,
        rect: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          bottom: rect.bottom,
        },
        borderRadius: computed.borderRadius,
        computedWidth: computed.width,
        computedMaxWidth: computed.maxWidth,
        windowWidth: window.innerWidth,
        matchMedia768: window.matchMedia('(max-width: 768px)').matches,
      };
    });
    console.log("   DEBUG openStyles:", openStyles);

    if (!openStyles.isOpen) throw new Error("Drawer did not acquire 'open' class!");
    if (openStyles.visibility !== "visible") throw new Error("Drawer visibility is not 'visible' when open!");
    if (openStyles.pointerEvents !== "auto") throw new Error("Drawer pointerEvents is not 'auto' when open!");
    if (Math.abs(openStyles.rect.width - width) > 2) {
      throw new Error(`Bottom Sheet width (${openStyles.rect.width}) should match viewport width (${width})!`);
    }
    if (Math.abs(openStyles.rect.bottom - height) > 2) {
      throw new Error(`Bottom Sheet bottom (${openStyles.rect.bottom}) should match viewport bottom (${height})!`);
    }
    if (openStyles.rect.height > height * 0.86) {
      throw new Error(`Bottom Sheet height (${openStyles.rect.height}) exceeded 85% of viewport (${height * 0.85})!`);
    }

    const drawerTitleText = await page.locator("#drawerTitle").textContent();
    if (!drawerTitleText.includes("بتابلوکرها")) {
      throw new Error(`Unexpected title: "${drawerTitleText}"`);
    }

    // Verify close button is visible and within bounds
    const closeBtn = page.locator("#closeDrawerBtn");
    const closeBtnBox = await closeBtn.boundingBox();
    if (!closeBtnBox || closeBtnBox.y < 0 || closeBtnBox.y + closeBtnBox.height > height) {
      throw new Error("Close button is not properly positioned within viewport!");
    }

    if (width === 390) {
      await page.screenshot({ path: path.join(screenshotDir, `mobile-${width}-2-opened-sheet.png`) });
    }
    console.log(`✓ PASS: Bottom Sheet opened with width=${openStyles.rect.width}px, height=${openStyles.rect.height}px, bottom=${openStyles.rect.bottom}px.`);

    // TEST 3: Switching to another node while drawer is open
    console.log("3. Testing switching to another node while Drawer is open...");
    const targetNode2 = page.locator('.node-group[data-id="node_branch_2"]');
    const n2Box = await targetNode2.boundingBox();
    if (!n2Box) throw new Error("Could not find node_branch_2 bounding box");

    // First scroll the drawer body down to test that scroll resets on switch
    await page.locator("#drawerBody").evaluate((el) => {
      el.scrollTop = 120;
    });

    // Tap on node 2 through the backdrop
    await page.mouse.click(n2Box.x + n2Box.width / 2, n2Box.y + n2Box.height / 2);
    await page.waitForTimeout(300);

    const newTitleText = await page.locator("#drawerTitle").textContent();
    console.log(`   Updated Drawer Title: "${newTitleText}"`);
    if (!newTitleText.includes("مهارکننده‌های ACE")) {
      throw new Error(`Expected title to switch to "مهارکننده‌های ACE", got "${newTitleText}"`);
    }

    const resetScrollPos = await page.locator("#drawerBody").evaluate((el) => el.scrollTop);
    console.log(`   DrawerBody scrollTop after switch: ${resetScrollPos}px`);
    if (resetScrollPos !== 0) {
      throw new Error(`Drawer body scrollTop was not reset to 0! Current: ${resetScrollPos}`);
    }

    if (width === 390) {
      await page.screenshot({ path: path.join(screenshotDir, `mobile-${width}-3-switched-node.png`) });
    }
    console.log("✓ PASS: Node switched seamlessly and scrollTop reset to 0.");

    // TEST 4: Close with Close Button
    console.log("4. Testing Close Button...");
    await closeBtn.click();
    await page.waitForTimeout(350);
    let closedStatus = await drawer.evaluate((el) => ({
      isOpen: el.classList.contains("open"),
      visibility: window.getComputedStyle(el).visibility,
    }));
    if (closedStatus.isOpen || closedStatus.visibility !== "hidden") {
      throw new Error("Drawer failed to close with close button");
    }
    console.log("✓ PASS: Drawer closed via close button.");

    // TEST 5: Re-open and Close via Backdrop Click
    console.log("5. Testing Re-open and Close via Backdrop Click...");
    await page.mouse.click(n1Box.x + n1Box.width / 2, n1Box.y + n1Box.height / 2);
    await page.waitForTimeout(300);
    if (!(await drawer.evaluate((el) => el.classList.contains("open")))) {
      throw new Error("Failed to re-open drawer");
    }
    // Click on empty backdrop (top area of screen e.g. x: 50, y: 50)
    await page.mouse.click(50, 50);
    await page.waitForTimeout(350);
    closedStatus = await drawer.evaluate((el) => ({
      isOpen: el.classList.contains("open"),
      visibility: window.getComputedStyle(el).visibility,
    }));
    if (closedStatus.isOpen || closedStatus.visibility !== "hidden") {
      throw new Error("Drawer failed to close via backdrop click");
    }
    console.log("✓ PASS: Drawer closed via backdrop click.");

    // TEST 6: Re-open and Close via Escape key
    console.log("6. Testing Close via Escape Key...");
    await page.mouse.click(n1Box.x + n1Box.width / 2, n1Box.y + n1Box.height / 2);
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
    closedStatus = await drawer.evaluate((el) => ({
      isOpen: el.classList.contains("open"),
      visibility: window.getComputedStyle(el).visibility,
    }));
    if (closedStatus.isOpen || closedStatus.visibility !== "hidden") {
      throw new Error("Drawer failed to close via Escape key");
    }
    console.log("✓ PASS: Drawer closed via Escape key.");

    // TEST 7: Independent Scroll Test (Map Canvas remains stationary when scrolling drawer)
    console.log("7. Testing Independent Scroll Isolation...");
    await page.mouse.click(n1Box.x + n1Box.width / 2, n1Box.y + n1Box.height / 2);
    await page.waitForTimeout(300);
    const canvasTransformBefore = await page.locator("#viewportGroup").getAttribute("transform");

    // Scroll drawer body
    await page.locator("#drawerBody").evaluate((el) => {
      el.scrollTop = 80;
    });
    await page.waitForTimeout(100);

    const canvasTransformAfter = await page.locator("#viewportGroup").getAttribute("transform");
    if (canvasTransformBefore !== canvasTransformAfter) {
      throw new Error(`Scrolling drawer moved canvas transform! Before: ${canvasTransformBefore}, After: ${canvasTransformAfter}`);
    }
    console.log("✓ PASS: Drawer scrolls independently without affecting canvas viewport.");

    // TEST 8: Landscape Mode Test
    console.log("8. Testing Portrait to Landscape Rotation...");
    await page.setViewportSize({ width: height, height: width }); // e.g. 844 x 390
    await page.waitForTimeout(300);

    const landscapeStyles = await drawer.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        height: rect.height,
        bottom: rect.bottom,
        viewportH: window.innerHeight,
      };
    });

    console.log(`   Landscape: viewportHeight=${landscapeStyles.viewportH}, drawerHeight=${landscapeStyles.height}, bottom=${landscapeStyles.bottom}`);
    if (landscapeStyles.height > landscapeStyles.viewportH * 0.96) {
      throw new Error(`Drawer height in landscape (${landscapeStyles.height}) exceeded viewport limit (${landscapeStyles.viewportH})!`);
    }

    const landscapeCloseBtn = await closeBtn.boundingBox();
    if (!landscapeCloseBtn || landscapeCloseBtn.y < 0) {
      throw new Error("Close button inaccessible in landscape mode!");
    }

    if (width === 390) {
      await page.screenshot({ path: path.join(screenshotDir, `mobile-${width}-4-landscape.png`) });
    }
    console.log("✓ PASS: Landscape rotation handled cleanly with proper max-height and accessible close button.");

    // Rotate back to portrait and close
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(200);
    await closeBtn.click();
    await page.waitForTimeout(300);

    if (consoleErrors.length > 0) {
      throw new Error(`Encountered console errors: ${consoleErrors.join("; ")}`);
    }

    await context.close();
  }

  await browser.close();

  // Cleanup temp html
  try {
    fs.unlinkSync(tempHtmlPath);
  } catch (e) {}

  console.log("\\n=======================================================");
  console.log("🎉 ALL MOBILE REAL-BROWSER UX TESTS PASSED! 🎉");
  console.log("=======================================================\\n");
}

runMobileVerification().catch((err) => {
  console.error("Mobile verification failed:", err);
  try {
    fs.unlinkSync(tempHtmlPath);
  } catch (e) {}
  process.exit(1);
});
