/**
 * Comprehensive End-to-End Verification Script for User Account Deletion.
 *
 * Covers:
 * 1. Database snapshots (before and after deletion).
 * 2. Session revocation verification (token valid before -> 401 after).
 * 3. Business rule and financial blocks (wallet > 0, active subscription).
 * 4. RBAC and authorization guards (401 unauthenticated, 403 unauthorized, self-delete guard).
 * 5. Edge cases: 404 on non-existent, 404 on repeated delete, 400 on invalid UUID.
 * 6. Audit log preservation (historical actor anonymization, admin deletion audit event).
 * 7. Browser testing via Playwright (search by email/phone/uuid, modal open, cancel, confirm, loading state, error display).
 * 8. Clean teardown of all test-created entities.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { eq, or, and, like, isNull } from "drizzle-orm";
import { createDbClient } from "../database/client.js";
import * as schema from "../database/schema/index.js";
import { hashPassword } from "../apps/api/src/modules/identity/password-hasher.js";
import { generateSessionToken, hashToken } from "../apps/api/src/modules/identity/session-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const SCREENSHOT_DIR = path.resolve(ROOT_DIR, "design-previews/deletion-audit");

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const API_BASE = "http://127.0.0.1:3000";
const WEB_BASE = "http://127.0.0.1:5173";

// Dedicated test accounts (prefixed test_del_ for total isolation)
const TEST_ADMIN = {
  id: "d0000001-0000-4000-a000-000000000001",
  email: "test_del_platform_admin@avana.test",
  name: "مدیر ارشد تست سیستم",
  globalRole: "platform_admin",
  phoneNumber: "09990000000",
  password: "AdminTestPassword2026!",
};

const TEST_TARGET_NORMAL = {
  id: "d0000002-0000-4000-a000-000000000002",
  email: "test_del_target_normal@avana.test",
  name: "کاربر هدف حذف عادی",
  globalRole: null,
  phoneNumber: "09990000001",
  password: "TargetPassword2026!",
};

const TEST_TARGET_WALLET = {
  id: "d0000003-0000-4000-a000-000000000003",
  email: "test_del_target_wallet@avana.test",
  name: "کاربر دارای موجودی کیف پول",
  globalRole: null,
  phoneNumber: "09990000002",
  password: "TargetPassword2026!",
};

const TEST_TARGET_SUB = {
  id: "d0000004-0000-4000-a000-000000000004",
  email: "test_del_target_sub@avana.test",
  name: "کاربر دارای اشتراک فعال",
  globalRole: null,
  phoneNumber: "09990000003",
  password: "TargetPassword2026!",
};

const TEST_SUPPORT_AGENT = {
  id: "d0000005-0000-4000-a000-000000000005",
  email: "test_del_support@avana.test",
  name: "پشتیبان سیستم تست",
  globalRole: "support_agent",
  phoneNumber: "09990000004",
  password: "SupportPassword2026!",
};

const TEST_STUDENT = {
  id: "d0000006-0000-4000-a000-000000000006",
  email: "test_del_student@avana.test",
  name: "دانشجوی عادی تست",
  globalRole: null,
  phoneNumber: "09990000005",
  password: "StudentPassword2026!",
};

const ALL_TEST_USER_IDS = [
  TEST_ADMIN.id,
  TEST_TARGET_NORMAL.id,
  TEST_TARGET_WALLET.id,
  TEST_TARGET_SUB.id,
  TEST_SUPPORT_AGENT.id,
  TEST_STUDENT.id,
];

interface TestLog {
  section: string;
  testName: string;
  passed: boolean;
  details: string;
  extra?: any;
}

const testResults: TestLog[] = [];

function recordResult(section: string, testName: string, passed: boolean, details: string, extra?: any) {
  testResults.push({ section, testName, passed, details, extra });
  const status = passed ? "✅ [PASS]" : "❌ [FAIL]";
  console.log(`${status} [${section}] ${testName}: ${details}`);
}

async function cleanupTestData(db: any) {
  console.log("\n🧹 Cleaning up any previous test data...");
  for (const uid of ALL_TEST_USER_IDS) {
    try {
      await db.delete(schema.userSubscriptions).where(eq(schema.userSubscriptions.userId, uid));
      await db.delete(schema.wallets).where(eq(schema.wallets.userId, uid));
      await db.delete(schema.sessions).where(eq(schema.sessions.userId, uid));
      await db.delete(schema.userDevices).where(eq(schema.userDevices.userId, uid));
      await db.delete(schema.auditLogs).where(eq(schema.auditLogs.actorId, uid));
      await db.delete(schema.auditLogs).where(eq(schema.auditLogs.entityId, uid));
      await db.delete(schema.users).where(eq(schema.users.id, uid));
    } catch (err: any) {
      console.warn(`Warning during cleanup of ${uid}:`, err.message);
    }
  }
}

async function createSessionForUser(db: any, userId: string): Promise<string> {
  const token = generateSessionToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await db.insert(schema.sessions).values({
    id: randomUUID(),
    userId,
    tokenHash,
    expiresAt,
    createdAt: new Date(),
    lastUsedAt: new Date(),
  });

  return token;
}

async function main() {
  console.log("================================================================================");
  console.log("🚀 STARTING COMPREHENSIVE LOCAL TEST SUITE: AVANA USER ACCOUNT DELETION");
  console.log("================================================================================");

  const { db, close } = createDbClient(process.env.DATABASE_URL!);

  try {
    // 0. Preliminary cleanup
    await cleanupTestData(db);

    // =========================================================================
    // Phase 1: Environment & Health Verification
    // =========================================================================
    console.log("\n--- Phase 1: Environment & Services Verification ---");
    try {
      const apiHealthRes = await fetch(`${API_BASE}/v1/health`);
      const apiHealthy = apiHealthRes.ok;
      recordResult(
        "Environment",
        "API Health Check",
        apiHealthy,
        `Status ${apiHealthRes.status} on ${API_BASE}/v1/health`,
      );
    } catch (e: any) {
      recordResult("Environment", "API Health Check", false, e.message);
    }

    try {
      const viteRes = await fetch(WEB_BASE);
      recordResult(
        "Environment",
        "Web Frontend Dev Server Check",
        viteRes.ok,
        `Status ${viteRes.status} on ${WEB_BASE}`,
      );
    } catch (e: any) {
      recordResult("Environment", "Web Frontend Dev Server Check", false, e.message);
    }

    // =========================================================================
    // Phase 2: Seeding Dedicated Test Users
    // =========================================================================
    console.log("\n--- Phase 2: Seeding Isolated Test Users ---");
    const dummyHash = await hashPassword("TestPass123!");

    // Insert Admin
    await db.insert(schema.users).values({
      id: TEST_ADMIN.id,
      email: TEST_ADMIN.email,
      name: TEST_ADMIN.name,
      globalRole: TEST_ADMIN.globalRole,
      phoneNumber: TEST_ADMIN.phoneNumber,
      passwordHash: dummyHash,
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Insert Target Normal
    await db.insert(schema.users).values({
      id: TEST_TARGET_NORMAL.id,
      email: TEST_TARGET_NORMAL.email,
      name: TEST_TARGET_NORMAL.name,
      globalRole: null,
      phoneNumber: TEST_TARGET_NORMAL.phoneNumber,
      passwordHash: dummyHash,
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Insert Target with Wallet
    await db.insert(schema.users).values({
      id: TEST_TARGET_WALLET.id,
      email: TEST_TARGET_WALLET.email,
      name: TEST_TARGET_WALLET.name,
      globalRole: null,
      phoneNumber: TEST_TARGET_WALLET.phoneNumber,
      passwordHash: dummyHash,
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    // Create wallet with positive balance
    await db.insert(schema.wallets).values({
      id: randomUUID(),
      userId: TEST_TARGET_WALLET.id,
      balance: 150000, // 150,000 Tomans
      currency: "toman",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Insert Target with Active Subscription
    await db.insert(schema.users).values({
      id: TEST_TARGET_SUB.id,
      email: TEST_TARGET_SUB.email,
      name: TEST_TARGET_SUB.name,
      globalRole: null,
      phoneNumber: TEST_TARGET_SUB.phoneNumber,
      passwordHash: dummyHash,
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    // Find or create a test product for subscription
    const existingProducts = await db.select().from(schema.products).limit(1);
    let productId = existingProducts[0]?.id;
    if (!productId) {
      productId = randomUUID();
      await db.insert(schema.products).values({
        id: productId,
        type: "subscription",
        slug: "test-sub-prod",
        title: "اشتراک تستی",
        price: 10000,
        active: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    await db.insert(schema.userSubscriptions).values({
      id: randomUUID(),
      userId: TEST_TARGET_SUB.id,
      productId,
      status: "active",
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // active for 30 days
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Insert Support Agent
    await db.insert(schema.users).values({
      id: TEST_SUPPORT_AGENT.id,
      email: TEST_SUPPORT_AGENT.email,
      name: TEST_SUPPORT_AGENT.name,
      globalRole: TEST_SUPPORT_AGENT.globalRole,
      phoneNumber: TEST_SUPPORT_AGENT.phoneNumber,
      passwordHash: dummyHash,
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Insert Student
    await db.insert(schema.users).values({
      id: TEST_STUDENT.id,
      email: TEST_STUDENT.email,
      name: TEST_STUDENT.name,
      globalRole: null,
      phoneNumber: TEST_STUDENT.phoneNumber,
      passwordHash: dummyHash,
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Create session tokens for admin, support, student, and target normal
    const adminSessionToken = await createSessionForUser(db, TEST_ADMIN.id);
    const supportSessionToken = await createSessionForUser(db, TEST_SUPPORT_AGENT.id);
    const studentSessionToken = await createSessionForUser(db, TEST_STUDENT.id);
    const targetSessionToken = await createSessionForUser(db, TEST_TARGET_NORMAL.id);

    // Insert a historical audit log created by target user to verify FK handling
    const historicalAuditLogId = randomUUID();
    await db.insert(schema.auditLogs).values({
      id: historicalAuditLogId,
      actorId: TEST_TARGET_NORMAL.id,
      action: "USER_LOGIN_TEST",
      entityType: "user",
      entityId: TEST_TARGET_NORMAL.id,
      details: { sample: "historical_data_before_deletion" },
      createdAt: new Date(Date.now() - 3600000),
    });

    recordResult("Setup", "Seed Test Users & Sessions", true, "Created 5 isolated test users and sessions successfully");

    // =========================================================================
    // Phase 3: Direct API Security & Authorization Testing
    // =========================================================================
    console.log("\n--- Phase 3: Direct API Security & Authorization Tests ---");

    // 3.1 Unauthenticated call -> 401
    const unauthRes = await fetch(`${API_BASE}/v1/admin/users/${TEST_TARGET_NORMAL.id}`, {
      method: "DELETE",
    });
    recordResult(
      "Security / RBAC",
      "Unauthenticated Deletion Request",
      unauthRes.status === 401,
      `Expected 401, got ${unauthRes.status}`,
    );

    // 3.2 Student call -> 403
    const studentRes = await fetch(`${API_BASE}/v1/admin/users/${TEST_TARGET_NORMAL.id}`, {
      method: "DELETE",
      headers: { Cookie: `avana_session=${studentSessionToken}` },
    });
    recordResult(
      "Security / RBAC",
      "Regular Student Role Deletion Request",
      studentRes.status === 403,
      `Expected 403, got ${studentRes.status}`,
    );

    // 3.3 Support Agent call -> 403
    const supportRes = await fetch(`${API_BASE}/v1/admin/users/${TEST_TARGET_NORMAL.id}`, {
      method: "DELETE",
      headers: { Cookie: `avana_session=${supportSessionToken}` },
    });
    recordResult(
      "Security / RBAC",
      "Support Agent Role Deletion Request",
      supportRes.status === 403,
      `Expected 403, got ${supportRes.status}`,
    );

    // 3.4 Self-deletion guard (Admin deleting self) -> 409
    const selfRes = await fetch(`${API_BASE}/v1/admin/users/${TEST_ADMIN.id}`, {
      method: "DELETE",
      headers: { Cookie: `avana_session=${adminSessionToken}` },
    });
    const selfBody = await selfRes.json();
    recordResult(
      "Security / Guard",
      "Self-Deletion Prevention Guard",
      selfRes.status === 409 && selfBody.message?.includes("خودتان"),
      `Expected 409, got ${selfRes.status} with msg: "${selfBody.message}"`,
    );

    // 3.5 Non-existent user deletion -> 404
    const nonExistentId = "00000000-ffff-4000-a000-000000000000";
    const notFoundRes = await fetch(`${API_BASE}/v1/admin/users/${nonExistentId}`, {
      method: "DELETE",
      headers: { Cookie: `avana_session=${adminSessionToken}` },
    });
    recordResult(
      "Edge Cases",
      "Non-Existent User Deletion",
      notFoundRes.status === 404,
      `Expected 404, got ${notFoundRes.status}`,
    );

    // 3.6 Invalid UUID format -> 400
    const invalidUuidRes = await fetch(`${API_BASE}/v1/admin/users/invalid-not-a-uuid`, {
      method: "DELETE",
      headers: { Cookie: `avana_session=${adminSessionToken}` },
    });
    recordResult(
      "Edge Cases",
      "Invalid UUID Format Deletion Request",
      invalidUuidRes.status === 400,
      `Expected 400, got ${invalidUuidRes.status}`,
    );

    // =========================================================================
    // Phase 4: Financial & Business Constraint Blocks
    // =========================================================================
    console.log("\n--- Phase 4: Business Constraint & Financial Integrity Blocks ---");

    // 4.1 Delete user with active wallet balance > 0 -> 409 Conflict
    const walletRes = await fetch(`${API_BASE}/v1/admin/users/${TEST_TARGET_WALLET.id}`, {
      method: "DELETE",
      headers: { Cookie: `avana_session=${adminSessionToken}` },
    });
    const walletBody = await walletRes.json();
    recordResult(
      "Business Rules",
      "Block User Deletion with Active Wallet Balance",
      walletRes.status === 409 && walletBody.message?.includes("کیف پول"),
      `Expected 409, got ${walletRes.status} with msg: "${walletBody.message}"`,
    );

    // 4.2 Delete user with active subscription -> 409 Conflict
    const subRes = await fetch(`${API_BASE}/v1/admin/users/${TEST_TARGET_SUB.id}`, {
      method: "DELETE",
      headers: { Cookie: `avana_session=${adminSessionToken}` },
    });
    const subBody = await subRes.json();
    recordResult(
      "Business Rules",
      "Block User Deletion with Active Subscription",
      subRes.status === 409 && subBody.message?.includes("اشتراک"),
      `Expected 409, got ${subRes.status} with msg: "${subBody.message}"`,
    );

    // =========================================================================
    // Phase 5: Database Snapshot Before Deletion & Session Check
    // =========================================================================
    console.log("\n--- Phase 5: Database Snapshot & Session Validity Before Deletion ---");

    // 5.1 Check target user session is currently valid
    const targetMeResBefore = await fetch(`${API_BASE}/v1/me`, {
      headers: { Cookie: `avana_session=${targetSessionToken}` },
    });
    recordResult(
      "Session Security",
      "Target User Session Active Before Deletion",
      targetMeResBefore.status === 200,
      `Expected 200, got ${targetMeResBefore.status}`,
    );

    // 5.2 Snapshot DB records before deletion
    const dbUserBefore = await db.select().from(schema.users).where(eq(schema.users.id, TEST_TARGET_NORMAL.id));
    const dbSessionBefore = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, TEST_TARGET_NORMAL.id));
    const dbAuditBefore = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.id, historicalAuditLogId));

    recordResult(
      "DB Snapshot",
      "Target Normal User DB State Before Deletion",
      dbUserBefore.length === 1 && dbSessionBefore.length === 1 && dbAuditBefore[0]?.actorId === TEST_TARGET_NORMAL.id,
      `User exists: ${dbUserBefore.length}, Active Sessions: ${dbSessionBefore.length}, Historical Audit Actor: ${dbAuditBefore[0]?.actorId}`,
    );

    // =========================================================================
    // Phase 6: Browser UI Testing with Playwright
    // =========================================================================
    console.log("\n--- Phase 6: Real Browser UI Flow with Playwright ---");

    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const context = await browser.newContext({
      viewport: { width: 1366, height: 768 },
      locale: "fa-IR",
    });

    // Set admin cookie on context so browser is authenticated as Platform Admin
    await context.addCookies([
      {
        name: "avana_session",
        value: adminSessionToken,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
      {
        name: "avana_session",
        value: adminSessionToken,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    const page = await context.newPage();
    page.on("console", (msg) => {
      if (msg.type() === "error") console.log("[Browser Console Error]", msg.text());
    });
    page.on("pageerror", (err) => console.log("[Browser Page Error]", err.message));

    try {
      console.log(`[Browser] Navigating to ${WEB_BASE}/admin/users ...`);
      await page.goto(`${WEB_BASE}/admin/users`, { waitUntil: "networkidle", timeout: 15000 });

      // Verify page title / heading
      const pageHeading = await page.textContent("h1, h2");
      console.log("[Browser] Page heading found:", pageHeading);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "01_admin_users_initial.png") });

      // 6.1 Search by Email
      console.log("[Browser] Testing search by email...");
      const searchInput = page.locator('input[placeholder*="جستجو"]');
      await searchInput.fill(TEST_TARGET_NORMAL.email);
      await page.waitForTimeout(1000); // debounce
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02_search_by_email.png") });

      const emailFound = await page.getByText(TEST_TARGET_NORMAL.email).isVisible();
      recordResult(
        "Browser UI",
        "Search Users by Email in UI",
        emailFound,
        `Searched "${TEST_TARGET_NORMAL.email}", user row visible: ${emailFound}`,
      );

      // 6.2 Search by Phone
      console.log("[Browser] Testing search by phone number...");
      await searchInput.fill(TEST_TARGET_NORMAL.phoneNumber);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03_search_by_phone.png") });

      const phoneRowFound = await page.locator("tr", { hasText: TEST_TARGET_NORMAL.email }).isVisible();
      recordResult(
        "Browser UI",
        "Search Users by Phone Number in UI",
        phoneRowFound,
        `Searched "${TEST_TARGET_NORMAL.phoneNumber}", target user row visible: ${phoneRowFound}`,
      );

      // 6.3 Search by UUID
      console.log("[Browser] Testing search by UUID substring...");
      await searchInput.fill(TEST_TARGET_NORMAL.id.substring(0, 12));
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04_search_by_uuid.png") });

      const uuidFound = await page.getByText(TEST_TARGET_NORMAL.email).isVisible();
      recordResult(
        "Browser UI",
        "Search Users by UUID Substring in UI",
        uuidFound,
        `Searched UUID prefix "${TEST_TARGET_NORMAL.id.substring(0, 12)}", user row visible: ${uuidFound}`,
      );

      // 6.4 Open Delete Modal and test Cancel button
      console.log("[Browser] Testing Delete Modal Cancel action...");
      // Find row with target user email and click delete button
      const userRow = page.locator("tr", { hasText: TEST_TARGET_NORMAL.email });
      const deleteBtn = userRow.locator('button:has-text("حذف")');
      await deleteBtn.click();
      await page.waitForTimeout(500);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05_delete_modal_open.png") });

      // Check modal contents
      const dialog = page.locator('div[role="dialog"]');
      const modalTitle = await dialog.getByText("حذف حساب کاربر").isVisible();
      const modalWarning = await dialog.getByText(/غیرقابل بازگشت/).isVisible();
      const modalUserName = await dialog.getByText(TEST_TARGET_NORMAL.name).isVisible();
      const modalUserEmail = await dialog.getByText(TEST_TARGET_NORMAL.email).isVisible();
      const modalUserPhone = await dialog.getByText(TEST_TARGET_NORMAL.phoneNumber).isVisible();

      recordResult(
        "Browser UI",
        "Delete Confirmation Modal Display",
        modalTitle && modalWarning && modalUserName && modalUserEmail && modalUserPhone,
        `Title: ${modalTitle}, Warning: ${modalWarning}, Name: ${modalUserName}, Email: ${modalUserEmail}, Phone: ${modalUserPhone}`,
      );

      // Click Cancel
      const cancelBtn = dialog.locator('button:has-text("انصراف")');
      await cancelBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06_after_cancel.png") });

      // Verify user is still in database
      const checkUserStillExists = await db.select().from(schema.users).where(eq(schema.users.id, TEST_TARGET_NORMAL.id));
      recordResult(
        "Browser UI",
        "Cancel Deletion Leaves User Intact",
        checkUserStillExists.length === 1,
        `User still present in DB after cancel: ${checkUserStillExists.length === 1}`,
      );

      // 6.5 Test Error Display & Retry in Modal using Target User with Wallet Balance
      console.log("[Browser] Testing Modal Error Display & Retry state with wallet-restricted user...");
      await searchInput.fill(TEST_TARGET_WALLET.email);
      await page.waitForTimeout(1000);

      const walletUserRow = page.locator("tr", { hasText: TEST_TARGET_WALLET.email });
      const walletDeleteBtn = walletUserRow.locator('button:has-text("حذف")');
      await walletDeleteBtn.click();
      await page.waitForTimeout(500);

      // Confirm deletion of user with wallet balance
      const walletDialog = page.locator('div[role="dialog"]');
      const walletConfirmBtn = walletDialog.locator('button:has-text("حذف حساب")');
      await walletConfirmBtn.click();
      await page.waitForTimeout(1000);

      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07_modal_error_retry.png") });

      const errorMessageVisible = await walletDialog.getByText(/حساب کاربر دارای موجودی فعال در کیف پول است/).isVisible();
      const retryBtnVisible = await walletDialog.locator('button:has-text("تلاش مجدد")').isVisible();

      recordResult(
        "Browser UI",
        "Modal Server Error Display & Retry Button",
        errorMessageVisible && retryBtnVisible,
        `Error message visible: ${errorMessageVisible}, Retry button visible: ${retryBtnVisible}`,
      );

      // Close the error modal
      const closeErrorModalBtn = walletDialog.locator('button:has-text("انصراف")');
      await closeErrorModalBtn.click();
      await page.waitForTimeout(500);

      // 6.6 Re-open Modal for Normal Target, Confirm Delete, Verify Loading State and Auto-Refresh
      console.log("[Browser] Testing Normal Delete Confirm, Loading State, and Table Refresh...");
      await searchInput.fill(TEST_TARGET_NORMAL.email);
      await page.waitForTimeout(1000);

      const freshNormalRow = page.locator("tr", { hasText: TEST_TARGET_NORMAL.email });
      const freshDeleteBtn = freshNormalRow.locator('button:has-text("حذف")');
      await freshDeleteBtn.click();
      await page.waitForTimeout(500);

      // Locate the confirm button in the modal
      const modalConfirmBtn = page.locator('div[role="dialog"] button:has-text("حذف حساب")');
      
      // Click confirm
      await modalConfirmBtn.click();

      // Check for loading state ("در حال حذف...")
      const loadingStateVisible = await page.getByText("در حال حذف...").isVisible().catch(() => false);
      console.log("[Browser] Loading state detected:", loadingStateVisible);

      // Wait for modal to disappear and network to settle
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08_after_successful_delete.png") });

      const targetEmailVisibleAfter = await page.getByText(TEST_TARGET_NORMAL.email).isVisible();
      recordResult(
        "Browser UI",
        "Successful Deletion Flow & Table Auto-Update",
        !targetEmailVisibleAfter,
        `User disappeared from table UI: ${!targetEmailVisibleAfter}`,
      );

    } finally {
      await browser.close();
    }

    // =========================================================================
    // Phase 7: Post-Deletion Database State & Foreign Keys Verification
    // =========================================================================
    console.log("\n--- Phase 7: Post-Deletion Database Snapshots & FK Integrity ---");

    // 7.1 Verify target user row is deleted from `users`
    const dbUserAfter = await db.select().from(schema.users).where(eq(schema.users.id, TEST_TARGET_NORMAL.id));
    recordResult(
      "DB Verification",
      "User Row Permanently Removed from users Table",
      dbUserAfter.length === 0,
      `Rows found in users table for ID: ${dbUserAfter.length}`,
    );

    // 7.2 Verify session rows cascaded / deleted
    const dbSessionAfter = await db.select().from(schema.sessions).where(eq(schema.sessions.userId, TEST_TARGET_NORMAL.id));
    recordResult(
      "DB Verification",
      "User Sessions Cascade-Deleted from sessions Table",
      dbSessionAfter.length === 0,
      `Rows found in sessions table for ID: ${dbSessionAfter.length}`,
    );

    // 7.3 Verify session token invalidation via API (immediate 401)
    const targetMeResAfter = await fetch(`${API_BASE}/v1/me`, {
      headers: { Cookie: `avana_session=${targetSessionToken}` },
    });
    recordResult(
      "Session Security",
      "Target Session Token Revoked Immediately (Returns 401)",
      targetMeResAfter.status === 401,
      `Expected 401 Unauthorized, got ${targetMeResAfter.status}`,
    );

    // 7.4 Verify historical audit log has actorId = null (anonymized, not deleted)
    const dbHistoricalAuditAfter = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.id, historicalAuditLogId));
    recordResult(
      "Audit & Integrity",
      "Historical Audit Logs Preserved with Anonymized actorId (NULL)",
      dbHistoricalAuditAfter.length === 1 && dbHistoricalAuditAfter[0].actorId === null,
      `Historical audit log exists: ${dbHistoricalAuditAfter.length === 1}, actorId is null: ${dbHistoricalAuditAfter[0]?.actorId === null}`,
    );

    // 7.5 Verify admin deletion audit log is recorded with canonical action and zero PII
    const deletionAuditLogs = await db
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.entityId, TEST_TARGET_NORMAL.id),
          eq(schema.auditLogs.actorId, TEST_ADMIN.id),
          eq(schema.auditLogs.action, "admin.delete_user"),
        ),
      );
    const hasPii = deletionAuditLogs.some((l) => {
      const d = JSON.stringify(l.details || {});
      return d.includes(TEST_TARGET_NORMAL.email) || d.includes(TEST_TARGET_NORMAL.phoneNumber);
    });
    recordResult(
      "Audit & Integrity",
      "New admin.delete_user Audit Log Recorded with Zero PII",
      deletionAuditLogs.length > 0 && !hasPii,
      `Found ${deletionAuditLogs.length} audit logs. Action: ${deletionAuditLogs[0]?.action}, Zero PII: ${!hasPii}, Details: ${JSON.stringify(deletionAuditLogs[0]?.details)}`,
    );

    // 7.6 Verify Repeated Delete (Idempotency / 404)
    const repeatedDeleteRes = await fetch(`${API_BASE}/v1/admin/users/${TEST_TARGET_NORMAL.id}`, {
      method: "DELETE",
      headers: { Cookie: `avana_session=${adminSessionToken}` },
    });
    recordResult(
      "Edge Cases",
      "Repeated Deletion Returns 404 Not Found",
      repeatedDeleteRes.status === 404,
      `Expected 404 on already-deleted user, got ${repeatedDeleteRes.status}`,
    );

    // =========================================================================
    // Phase 8: Final Cleanup
    // =========================================================================
    console.log("\n--- Phase 8: Final Cleanup of Test Fixtures ---");
    await cleanupTestData(db);
    console.log("Cleanup completed successfully.");

  } finally {
    await close();
  }

  // =========================================================================
  // Test Summary
  // =========================================================================
  console.log("\n================================================================================");
  console.log("📊 COMPREHENSIVE TEST EXECUTION SUMMARY");
  console.log("================================================================================");
  const total = testResults.length;
  const passed = testResults.filter((r) => r.passed).length;
  const failed = testResults.filter((r) => !r.passed).length;

  console.log(`Total Scenarios Executed: ${total}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);

  if (failed > 0) {
    console.error(`\n❌ ${failed} test(s) failed:`);
    testResults.filter((r) => !r.passed).forEach((r) => {
      console.error(`  - [${r.section}] ${r.testName}: ${r.details}`);
    });
    process.exit(1);
  } else {
    console.log("\n🎉 ALL SCENARIOS PASSED WITH ZERO ERRORS!");
  }
}

main().catch((err) => {
  console.error("FATAL ERROR in test execution:", err);
  process.exit(1);
});
