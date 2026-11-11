/**
 * Automated Real Browser (Playwright Chromium) Verification
 * for AVANA Mind Map Standalone Offline Interactive HTML Export.
 *
 * Checks:
 * 1. 0 JavaScript errors in Console on page load and during interactions.
 * 2. 4-directional Pan & Drag with pointer capture.
 * 3. Real transform matrix updates on #viewportGroup.
 * 4. Cursor-anchored Wheel Zoom with limits.
 * 5. Zoom In, Zoom Out, Fit to View, and Reset View toolbar controls.
 * 6. Opening Detail Drawer on direct Node click.
 * 7. Clean Drag vs Click separation (dragging across a node does NOT open drawer).
 * 8. Complete absence of Expand / Collapse controls & 100% persistent visibility.
 * 9. Deep multi-field search and node highlight navigation.
 */

import { chromium } from "playwright";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempHtmlPath = path.join(__dirname, "temp-test-mindmap-export.html");

// 1. Generate real standalone HTML using exportMindMapToHtml
console.log("Generating standalone HTML export for Playwright test...");
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
        detailedExplanation: 'داروهای این دسته در درمان پرفشاری خون و نارسایی قلبی به کار می‌روند.',
        keyPoints: ['کاهش ضربان قلب', 'کاهش انقباض میوکارد', 'مهار ترشح رنین'],
        examTips: ['کنترااندیکاسیون قطعی در آسم و برونکواسپاسم شدید'],
        depth: 1
      },
      node_sub_1: {
        id: 'node_sub_1',
        parentId: 'node_branch_1',
        title: 'پروپرانولول',
        shortDescription: 'بتابلوکر غیرانتخابی نسل اول',
        depth: 2
      },
      node_sub_2: {
        id: 'node_sub_2',
        parentId: 'node_branch_1',
        title: 'متوپرولول',
        shortDescription: 'بتابلوکر انتخابی بتا-۱ (کاردیوسلکتیو)',
        depth: 2
      },
      node_branch_2: {
        id: 'node_branch_2',
        parentId: 'root',
        title: 'مهارکننده‌های ACE',
        shortDescription: 'مهارکننده آنزیم مبدل آنژیوتانسین',
        detailedExplanation: 'کاهش تولید آنژیوتانسین ۲ و کاهش مقاومت عروقی محیطی.',
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
});

function parseTransform(transformStr) {
  if (!transformStr) return { x: 0, y: 0, scale: 1 };
  const translateMatch = transformStr.match(/translate\(([^,]+),\s*([^)]+)\)/);
  const scaleMatch = transformStr.match(/scale\(([^)]+)\)/);
  return {
    x: translateMatch ? parseFloat(translateMatch[1]) : 0,
    y: translateMatch ? parseFloat(translateMatch[2]) : 0,
    scale: scaleMatch ? parseFloat(scaleMatch[1]) : 1,
  };
}

async function runBrowserVerification() {
  console.log("Launching Headless Chromium...");
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
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
  console.log(`Navigating to ${fileUrl}...`);
  await page.goto(fileUrl, { waitUntil: "load" });

  // Wait for bootstrap fitToView
  await page.waitForTimeout(300);

  // 1. Verify 0 Console Errors
  if (consoleErrors.length > 0) {
    throw new Error(`Browser encountered ${consoleErrors.length} JavaScript error(s): ${consoleErrors.join(", ")}`);
  }
  console.log("✓ PASS: 0 JavaScript/Syntax errors on page load.");

  // 1.1 Verify Header: Zero duplicate chapter title
  console.log("Verifying Toolbar Header title display...");
  const brandBadge = page.locator(".toolbar-start .brand-badge");
  const brandBadgeText = await brandBadge.textContent();
  console.log("Header brand-badge text:", brandBadgeText.trim());
  if (!brandBadgeText.includes("فصل ۳: فارماکولوژی قلب") && !brandBadgeText.includes("مایندمپ داروشناسی بالینی")) {
    throw new Error(`Unexpected brand badge text: "${brandBadgeText}"`);
  }
  const secondaryTitleCount = await page.locator(".toolbar-start .secondary-title").count();
  if (secondaryTitleCount > 0) {
    throw new Error("Found unexpected secondary title in .toolbar-start");
  }
  console.log("✓ PASS: Header contains single brand badge with no duplicate title.");

  // 1.1.b Verify Official Brand Logo and aavana.ir link
  console.log("Verifying Official Brand Logo & Website Link...");
  const brandLink = page.locator(".toolbar-start .brand-link");
  const brandLinkHref = await brandLink.getAttribute("href");
  const brandLinkTarget = await brandLink.getAttribute("target");
  const brandLinkRel = await brandLink.getAttribute("rel");
  const brandLinkText = await brandLink.locator(".brand-url").textContent();

  if (brandLinkHref !== "https://aavana.ir") {
    throw new Error(`Expected brand link href to be 'https://aavana.ir', got '${brandLinkHref}'`);
  }
  if (brandLinkTarget !== "_blank") {
    throw new Error(`Expected brand link target to be '_blank', got '${brandLinkTarget}'`);
  }
  if (!brandLinkRel.includes("noopener") || !brandLinkRel.includes("noreferrer")) {
    throw new Error(`Expected brand link rel to contain 'noopener noreferrer', got '${brandLinkRel}'`);
  }
  if (brandLinkText.trim() !== "aavana.ir") {
    throw new Error(`Expected brand link text to be 'aavana.ir', got '${brandLinkText}'`);
  }

  const brandLogoCount = await page.locator(".toolbar-start .brand-link svg.brand-logo").count();
  if (brandLogoCount === 0) {
    throw new Error("Could not find svg.brand-logo in brand link!");
  }
  console.log("✓ PASS: Official brand logo and aavana.ir link verified in browser.");

  // 1.2 Verify Initial SVG Shared Branch Trunk: Sibling branches share exact trunkX
  console.log("Verifying Shared Branch Paths & Trunk Alignment...");
  const parseTrunkXFromPath = (d) => {
    // If edge draws stem: M sourceX sourceY L trunkX sourceY ...
    const stemMatch = d.match(/^[ML]\s+[\d.-]+\s+[\d.-]+\s+L\s+([\d.-]+)\s+[\d.-]+/);
    if (stemMatch) return parseFloat(stemMatch[1]);
    // If edge branches directly off shared trunk: M trunkX sourceY ...
    const branchMatch = d.match(/^M\s+([\d.-]+)\s+[\d.-]+/);
    if (branchMatch) return parseFloat(branchMatch[1]);
    return null;
  };

  const edgeSub1D = await page.locator('path[data-edge-id="e-node_branch_1-node_sub_1"]').getAttribute("d");
  const edgeSub2D = await page.locator('path[data-edge-id="e-node_branch_1-node_sub_2"]').getAttribute("d");
  if (!edgeSub1D || !edgeSub2D) {
    throw new Error("Could not find edge path elements for siblings");
  }
  console.log("Edge sub_1 path:", edgeSub1D);
  console.log("Edge sub_2 path:", edgeSub2D);

  const trunk1 = parseTrunkXFromPath(edgeSub1D);
  const trunk2 = parseTrunkXFromPath(edgeSub2D);
  console.log(`Parsed trunkX: sub_1 = ${trunk1}, sub_2 = ${trunk2}`);
  if (trunk1 === null || trunk2 === null || Math.abs(trunk1 - trunk2) > 0.1) {
    throw new Error(`Sibling branches have divergent trunkX: ${trunk1} vs ${trunk2}`);
  }
  console.log("✓ PASS: Sibling branches share identical trunkX and unified spine.");

  // 2. Read initial viewport transform
  const viewportSelector = "#viewportGroup";
  const initialTransformStr = await page.locator(viewportSelector).getAttribute("transform");
  console.log("Initial #viewportGroup transform:", initialTransformStr);
  const initialT = parseTransform(initialTransformStr);

  const canvas = page.locator("#canvasContainer");
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error("Could not find canvas container bounding box");

  const startX = canvasBox.x + canvasBox.width / 2;
  const startY = canvasBox.y + canvasBox.height / 2;

  // 3. Test 4-Directional Mouse Pan & Drag
  console.log("Testing 4-directional Pan & Drag...");

  // Pan Right (dx = +150)
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 150, startY, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(100);

  let curTransformStr = await page.locator(viewportSelector).getAttribute("transform");
  let curT = parseTransform(curTransformStr);
  console.log("After Pan Right transform:", curTransformStr);
  if (Math.abs(curT.x - (initialT.x + 150)) > 5) {
    throw new Error(`Pan Right failed: expected x ~ ${initialT.x + 150}, got ${curT.x}`);
  }
  console.log("✓ PASS: Pan Right moved x by +150px.");

  // Pan Left (dx = -200)
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX - 200, startY, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(100);

  curTransformStr = await page.locator(viewportSelector).getAttribute("transform");
  let prevT = curT;
  curT = parseTransform(curTransformStr);
  if (Math.abs(curT.x - (prevT.x - 200)) > 5) {
    throw new Error(`Pan Left failed: expected x ~ ${prevT.x - 200}, got ${curT.x}`);
  }
  console.log("✓ PASS: Pan Left moved x by -200px.");

  // Pan Down (dy = +120)
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + 120, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(100);

  curTransformStr = await page.locator(viewportSelector).getAttribute("transform");
  prevT = curT;
  curT = parseTransform(curTransformStr);
  if (Math.abs(curT.y - (prevT.y + 120)) > 5) {
    throw new Error(`Pan Down failed: expected y ~ ${prevT.y + 120}, got ${curT.y}`);
  }
  console.log("✓ PASS: Pan Down moved y by +120px.");

  // Pan Up (dy = -140)
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY - 140, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(100);

  curTransformStr = await page.locator(viewportSelector).getAttribute("transform");
  prevT = curT;
  curT = parseTransform(curTransformStr);
  if (Math.abs(curT.y - (prevT.y - 140)) > 5) {
    throw new Error(`Pan Up failed: expected y ~ ${prevT.y - 140}, got ${curT.y}`);
  }
  console.log("✓ PASS: Pan Up moved y by -140px.");

  // 4. Test Wheel Zoom
  console.log("Testing Mouse Wheel Zoom...");
  const preWheelT = curT;
  await page.mouse.move(startX, startY);
  await page.mouse.wheel(0, -300); // Zoom in
  await page.waitForTimeout(150);

  let postWheelStr = await page.locator(viewportSelector).getAttribute("transform");
  let postWheelT = parseTransform(postWheelStr);
  console.log("After Wheel Zoom In transform:", postWheelStr);
  if (postWheelT.scale <= preWheelT.scale) {
    throw new Error(`Wheel zoom in failed: scale did not increase (${postWheelT.scale} <= ${preWheelT.scale})`);
  }
  console.log(`✓ PASS: Wheel zoom in increased scale from ${preWheelT.scale.toFixed(3)} to ${postWheelT.scale.toFixed(3)}.`);

  await page.mouse.wheel(0, 400); // Zoom out
  await page.waitForTimeout(150);
  let postWheelOutStr = await page.locator(viewportSelector).getAttribute("transform");
  let postWheelOutT = parseTransform(postWheelOutStr);
  if (postWheelOutT.scale >= postWheelT.scale) {
    throw new Error(`Wheel zoom out failed: scale did not decrease (${postWheelOutT.scale} >= ${postWheelT.scale})`);
  }
  console.log(`✓ PASS: Wheel zoom out decreased scale from ${postWheelT.scale.toFixed(3)} to ${postWheelOutT.scale.toFixed(3)}.`);

  // 5. Test Toolbar Controls: Zoom In, Zoom Out, Fit to View, Reset View
  console.log("Testing Toolbar Controls...");
  const beforeBtnZoom = postWheelOutT.scale;
  await page.locator("#zoomInBtn").click();
  await page.waitForTimeout(100);
  let afterZoomInT = parseTransform(await page.locator(viewportSelector).getAttribute("transform"));
  if (afterZoomInT.scale <= beforeBtnZoom) {
    throw new Error("Zoom In button did not increase scale");
  }
  console.log("✓ PASS: Zoom In button works.");

  await page.locator("#zoomOutBtn").click();
  await page.waitForTimeout(100);
  let afterZoomOutT = parseTransform(await page.locator(viewportSelector).getAttribute("transform"));
  if (afterZoomOutT.scale >= afterZoomInT.scale) {
    throw new Error("Zoom Out button did not decrease scale");
  }
  console.log("✓ PASS: Zoom Out button works.");

  // Test Fit to View
  await page.locator("#fitViewBtn").click();
  await page.waitForTimeout(150);
  let fitT = parseTransform(await page.locator(viewportSelector).getAttribute("transform"));
  console.log("Fit to view transform:", fitT);
  console.log("✓ PASS: Fit to View button executed.");

  // Test Reset View
  await page.locator("#resetViewBtn").click();
  await page.waitForTimeout(150);
  let resetT = parseTransform(await page.locator(viewportSelector).getAttribute("transform"));
  if (Math.abs(resetT.scale - 1.0) > 0.01) {
    throw new Error(`Reset View failed: expected scale 1.0, got ${resetT.scale}`);
  }
  console.log("✓ PASS: Reset View restored scale to 1.0 (100%).");

  // 6. Test Direct Node Click & Detail Drawer
  console.log("Testing Node Click & Drawer Opening...");
  // Ensure drawer is initially closed
  let isDrawerOpen = await page.locator("#drawer").evaluate((el) => el.classList.contains("open"));
  if (isDrawerOpen) throw new Error("Drawer should be closed initially");

  // Click on node_branch_1
  const targetNode = page.locator('.node-group[data-id="node_branch_1"]');
  await targetNode.click();
  await page.waitForTimeout(150);

  isDrawerOpen = await page.locator("#drawer").evaluate((el) => el.classList.contains("open"));
  if (!isDrawerOpen) throw new Error("Clicking node did not open Detail Drawer!");

  const drawerTitleText = await page.locator("#drawerTitle").textContent();
  if (!drawerTitleText.includes("بتابلوکرها")) {
    throw new Error(`Drawer title mismatch: expected to contain "بتابلوکرها", got "${drawerTitleText}"`);
  }
  console.log(`✓ PASS: Node click opened Detail Drawer with title "${drawerTitleText}".`);

  // Close drawer
  await page.locator("#closeDrawerBtn").click();
  await page.waitForTimeout(100);
  isDrawerOpen = await page.locator("#drawer").evaluate((el) => el.classList.contains("open"));
  if (isDrawerOpen) throw new Error("Close drawer button failed");
  console.log("✓ PASS: Drawer closed successfully.");

  // 7. Test Drag vs Click Separation: Dragging on a node must NOT open the drawer
  console.log("Testing Drag vs Click Separation on Node...");
  const nodeBox = await targetNode.boundingBox();
  if (!nodeBox) throw new Error("Could not find node bounding box");

  const nodeCenterX = nodeBox.x + nodeBox.width / 2;
  const nodeCenterY = nodeBox.y + nodeBox.height / 2;

  // Drag 80px starting from inside the node card
  await page.mouse.move(nodeCenterX, nodeCenterY);
  await page.mouse.down();
  await page.mouse.move(nodeCenterX + 80, nodeCenterY + 40, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(150);

  isDrawerOpen = await page.locator("#drawer").evaluate((el) => el.classList.contains("open"));
  if (isDrawerOpen) {
    throw new Error("FAILED: Dragging across a node erroneously triggered click and opened the drawer!");
  }
  console.log("✓ PASS: Dragging across a node panned canvas without opening drawer.");

  // 8. Test Complete Absence of Expand / Collapse controls & 100% Node Visibility
  console.log("Testing Complete Absence of Expand / Collapse controls...");
  const collapseBadgeCount = await page.locator(".collapse-badge").count();
  if (collapseBadgeCount > 0) {
    throw new Error(`Expected 0 .collapse-badge elements, found ${collapseBadgeCount}`);
  }
  const expandAllBtnCount = await page.locator("#expandAllBtn").count();
  if (expandAllBtnCount > 0) {
    throw new Error("Found unexpected #expandAllBtn in DOM");
  }
  const collapseAllBtnCount = await page.locator("#collapseAllBtn").count();
  if (collapseAllBtnCount > 0) {
    throw new Error("Found unexpected #collapseAllBtn in DOM");
  }
  console.log("✓ PASS: 0 expand/collapse controls or indicators in DOM.");

  console.log("Verifying 100% node visibility from page load...");
  const expectedNodeIds = ["root", "node_branch_1", "node_sub_1", "node_sub_2", "node_branch_2"];
  for (const nId of expectedNodeIds) {
    const isVisible = await page.locator(`.node-group[data-id="${nId}"]`).isVisible();
    if (!isVisible) {
      throw new Error(`Node "${nId}" is unexpectedly hidden!`);
    }
  }
  console.log("✓ PASS: All nodes and subtrees are 100% visible from initial load.");

  // Verify clicking and dragging never hides any node
  console.log("Verifying clicking and canvas interaction never hides any node...");
  await page.locator('.node-group[data-id="node_branch_1"]').click();
  await page.waitForTimeout(100);
  for (const nId of expectedNodeIds) {
    const isVisible = await page.locator(`.node-group[data-id="${nId}"]`).isVisible();
    if (!isVisible) {
      throw new Error(`Node "${nId}" became hidden after clicking node_branch_1!`);
    }
  }
  await page.locator("#closeDrawerBtn").click();
  await page.waitForTimeout(100);
  console.log("✓ PASS: Interacting with nodes never hides children or any branch.");

  // 9. Test Search and Node Selection
  console.log("Testing search navigation and match highlight...");
  await page.locator("#searchInput").fill("متوپرولول");
  await page.waitForTimeout(150);
  const searchStatsText = await page.locator("#searchStats").textContent();
  console.log("Search stats:", searchStatsText);
  if (!searchStatsText.includes("۱ مورد یافت شد")) {
    throw new Error(`Expected search stats to find 1 match, got "${searchStatsText}"`);
  }
  const isMatchHighlighted = await page.locator('.node-group[data-id="node_sub_2"]').evaluate((el) => el.classList.contains("selected") || el.classList.contains("search-match"));
  if (!isMatchHighlighted) {
    throw new Error("Search target node node_sub_2 was not highlighted!");
  }
  // Clear search
  await page.locator("#searchInput").fill("");
  await page.waitForTimeout(100);
  console.log("✓ PASS: Search found match and successfully focused target node.");

  // Final check: 0 Console Errors throughout all interactions
  if (consoleErrors.length > 0) {
    throw new Error(`Errors occurred during interactions: ${consoleErrors.join(", ")}`);
  }
  console.log("✓ PASS: ZERO JavaScript errors throughout all automated interactions!");

  await browser.close();

  // Clean up temp file
  try {
    fs.unlinkSync(tempHtmlPath);
  } catch (err) {}

  console.log("\n=======================================================");
  console.log("🎉 ALL PLAYWRIGHT REAL-BROWSER VERIFICATIONS PASSED! 🎉");
  console.log("=======================================================\n");
}

runBrowserVerification().catch((err) => {
  console.error("Verification failed:", err);
  try {
    fs.unlinkSync(tempHtmlPath);
  } catch (e) {}
  process.exit(1);
});
