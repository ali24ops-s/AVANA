import { describe, test, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createDbClient } from "../../../../database/client.js";
import { DrizzleCommerceStore } from "../modules/commerce/commerce-store.js";
import { EntitlementService } from "../modules/commerce/entitlement-service.js";
import { DrizzleAdminStore } from "../modules/admin/drizzle-stores.js";
import { asUserId, asCourseId, asContentPackId, type Actor, asProductId } from "@avana/domain";
import { seedTestCommerceData } from "../../../../scripts/seed-test-commerce-data.js";
import { cleanupTestCommerceData } from "../../../../scripts/cleanup-test-commerce-data.js";
import * as schema from "../../../../database/schema/index.js";
import { eq, sql } from "drizzle-orm";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

describe("Isolated Test Commerce Dataset Verification Suite", () => {
  let dbClientObj: ReturnType<typeof createDbClient>;
  let db: ReturnType<typeof createDbClient>["db"];
  let commerceStore: DrizzleCommerceStore;
  let adminStore: DrizzleAdminStore;
  let entitlementService: EntitlementService;
  const userMap = new Map<string, any>();

  let targetCourseId: string;
  let targetPackId: string;
  let isConnected = false;

  beforeAll(async () => {
    try {
      dbClientObj = createDbClient(connectionString);
      db = dbClientObj.db;
      await db.execute(sql`SELECT 1;`);
      isConnected = true;

      commerceStore = new DrizzleCommerceStore(db);
      adminStore = new DrizzleAdminStore(db);
      entitlementService = new EntitlementService({ commerceStore });

      // Seed test commerce dataset (idempotent)
      await seedTestCommerceData(db);

      // Fetch test users
      const testUsers = await db.query.users.findMany({
        where: (u, { like }) => like(u.email, "commerce-test-%"),
      });

      for (const u of testUsers) {
        userMap.set(u.email, u);
      }

      const courseProduct = await db.query.products.findFirst({
        where: eq(schema.products.code, "test_prod_course_pharmacology"),
      });
      const packProduct = await db.query.products.findFirst({
        where: eq(schema.products.code, "test_prod_pack_pharmacokinetics"),
      });

      targetCourseId = courseProduct?.targetId ?? "";
      targetPackId = packProduct?.targetId ?? "";
    } catch {
      isConnected = false;
    }
  });

  beforeEach((ctx) => {
    if (!isConnected) {
      ctx.skip();
    }
  });

  afterAll(async () => {
    if (!isConnected) return;
    try {
      await cleanupTestCommerceData({ dryRun: false });
    } finally {
      await dbClientObj?.close();
    }
  });

  describe("1. EntitlementService Access Decision Verification across 12 Scenarios", () => {
    test("Scenario 01 (Active Monthly) -> GRANTED (reason: subscription)", async () => {
      const user = userMap.get("commerce-test-01-active-monthly@test.avana.dev")!;
      const actor: Actor = { userId: asUserId(user.id as any), role: "student" };

      const decision = await entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "course",
        resourceId: targetCourseId,
      });

      expect(decision.granted).toBe(true);
      expect(decision.reason).toBe("subscription");
      expect(decision.expiresAt).not.toBeNull();
      expect(new Date(decision.expiresAt!).getTime()).toBeGreaterThan(Date.now());
    });

    test("Scenario 02 (Active Quarterly) -> GRANTED (reason: subscription)", async () => {
      const user = userMap.get("commerce-test-02-active-quarterly@test.avana.dev")!;
      const actor: Actor = { userId: asUserId(user.id as any), role: "student" };

      const decision = await entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "course",
        resourceId: targetCourseId,
      });

      expect(decision.granted).toBe(true);
      expect(decision.reason).toBe("subscription");
      expect(new Date(decision.expiresAt!).getTime()).toBeGreaterThan(Date.now());
    });

    test("Scenario 03 (Active Yearly) -> GRANTED (reason: subscription)", async () => {
      const user = userMap.get("commerce-test-03-active-yearly@test.avana.dev")!;
      const actor: Actor = { userId: asUserId(user.id as any), role: "student" };

      const decision = await entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "course",
        resourceId: targetCourseId,
      });

      expect(decision.granted).toBe(true);
      expect(decision.reason).toBe("subscription");
      expect(new Date(decision.expiresAt!).getTime()).toBeGreaterThan(Date.now());
    });

    test("Scenario 04 (Expired Subscription) -> DENIED (reason: locked)", async () => {
      const user = userMap.get("commerce-test-04-expired-subscription@test.avana.dev")!;
      const actor: Actor = { userId: asUserId(user.id as any), role: "student" };

      const decision = await entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "course",
        resourceId: targetCourseId,
      });

      expect(decision.granted).toBe(false);
      expect(decision.reason).toBe("locked");
      expect(decision.availablePurchaseOptions.length).toBeGreaterThan(0);
    });

    test("Scenario 05 (No Subscription) -> DENIED (reason: locked)", async () => {
      const user = userMap.get("commerce-test-05-no-subscription@test.avana.dev")!;
      const actor: Actor = { userId: asUserId(user.id as any), role: "student" };

      const decision = await entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "course",
        resourceId: targetCourseId,
      });

      expect(decision.granted).toBe(false);
      expect(decision.reason).toBe("locked");
    });

    test("Scenario 06 (Failed Payment) -> DENIED (reason: locked)", async () => {
      const user = userMap.get("commerce-test-06-failed-payment@test.avana.dev")!;
      const actor: Actor = { userId: asUserId(user.id as any), role: "student" };

      const decision = await entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "course",
        resourceId: targetCourseId,
      });

      expect(decision.granted).toBe(false);
      expect(decision.reason).toBe("locked");
    });

    test("Scenario 07 (Pending Order) -> DENIED (reason: locked)", async () => {
      const user = userMap.get("commerce-test-07-pending-order@test.avana.dev")!;
      const actor: Actor = { userId: asUserId(user.id as any), role: "student" };

      const decision = await entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "course",
        resourceId: targetCourseId,
      });

      expect(decision.granted).toBe(false);
      expect(decision.reason).toBe("locked");
    });

    test("Scenario 08 (Cancelled Order) -> DENIED (reason: locked)", async () => {
      const user = userMap.get("commerce-test-08-cancelled-order@test.avana.dev")!;
      const actor: Actor = { userId: asUserId(user.id as any), role: "student" };

      const decision = await entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "course",
        resourceId: targetCourseId,
      });

      expect(decision.granted).toBe(false);
      expect(decision.reason).toBe("locked");
    });

    test("Scenario 09 (Lifetime Course Purchase) -> GRANTED for course, expiresAt = null", async () => {
      const user = userMap.get("commerce-test-09-lifetime-course@test.avana.dev")!;
      const actor: Actor = { userId: asUserId(user.id as any), role: "student" };

      const decision = await entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "course",
        resourceId: targetCourseId,
        courseId: asCourseId(targetCourseId as any),
      });

      expect(decision.granted).toBe(true);
      expect(decision.reason).toBe("course_purchase");
      expect(decision.expiresAt).toBeNull(); // Permanent Lifetime Ownership
    });

    test("Scenario 10 (Content Pack Purchase) -> GRANTED for pack, expiresAt = null", async () => {
      const user = userMap.get("commerce-test-10-content-pack@test.avana.dev")!;
      const actor: Actor = { userId: asUserId(user.id as any), role: "student" };

      const decision = await entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "content_pack",
        resourceId: targetPackId,
        contentPackId: asContentPackId(targetPackId as any),
      });

      expect(decision.granted).toBe(true);
      expect(decision.reason).toBe("content_pack_purchase");
      expect(decision.expiresAt).toBeNull(); // Permanent Lifetime Ownership
    });

    test("Scenario 11 (Admin Grant) -> GRANTED (reason: subscription)", async () => {
      const user = userMap.get("commerce-test-11-admin-grant@test.avana.dev")!;
      const actor: Actor = { userId: asUserId(user.id as any), role: "student" };

      const decision = await entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "course",
        resourceId: targetCourseId,
      });

      expect(decision.granted).toBe(true);
      expect(decision.reason).toBe("subscription");
      expect(decision.expiresAt).not.toBeNull();
      expect(new Date(decision.expiresAt!).getTime()).toBeGreaterThan(Date.now());
    });

    test("Scenario 12 (Multiple Purchases) -> GRANTED for sub, course, and content pack", async () => {
      const user = userMap.get("commerce-test-12-multiple-purchases@test.avana.dev")!;
      const actor: Actor = { userId: asUserId(user.id as any), role: "student" };

      // Sub check
      const subDecision = await entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "course",
        resourceId: "random-non-purchased-course-id",
      });
      expect(subDecision.granted).toBe(true);
      expect(subDecision.reason).toBe("subscription");

      // Course lifetime check
      const courseDecision = await entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "course",
        resourceId: targetCourseId,
        courseId: asCourseId(targetCourseId as any),
      });
      expect(courseDecision.granted).toBe(true);
      expect(courseDecision.reason).toBe("subscription"); // active subscription has priority or gives access

      // Content Pack lifetime check
      const packDecision = await entitlementService.checkAccess(actor, {
        userId: actor.userId,
        resourceType: "content_pack",
        resourceId: targetPackId,
        contentPackId: asContentPackId(targetPackId as any),
      });
      expect(packDecision.granted).toBe(true);
    });
  });

  describe("2. Admin Store Queries Verification with Real Drizzle Implementation", () => {
    test("getCommerceStats includes test transactions in totals", async () => {
      const stats = await adminStore.getCommerceStats();
      expect(stats.totalRevenue).toBeGreaterThanOrEqual(1000000);
      expect(stats.successfulOrders).toBeGreaterThanOrEqual(10);
      expect(stats.activeSubscriptions).toBeGreaterThanOrEqual(4);
      expect(stats.lifetimePurchases).toBeGreaterThanOrEqual(4);
      expect(stats.pendingOrders).toBeGreaterThanOrEqual(1);
      expect(stats.failedPayments).toBeGreaterThanOrEqual(2);
    });

    test("listCommerceOrders returns all order statuses accurately", async () => {
      const paidOrders = await adminStore.listCommerceOrders({ page: 1, pageSize: 50, status: "paid" });
      const failedOrders = await adminStore.listCommerceOrders({ page: 1, pageSize: 50, status: "failed" });
      const pendingOrders = await adminStore.listCommerceOrders({ page: 1, pageSize: 50, status: "pending" });
      const cancelledOrders = await adminStore.listCommerceOrders({ page: 1, pageSize: 50, status: "cancelled" });

      expect(paidOrders.orders.some((o) => o.orderNumber === "TEST-ORD-01-MONTHLY")).toBe(true);
      expect(failedOrders.orders.some((o) => o.orderNumber === "TEST-ORD-06-FAILED")).toBe(true);
      expect(pendingOrders.orders.some((o) => o.orderNumber === "TEST-ORD-07-PENDING")).toBe(true);
      expect(cancelledOrders.orders.some((o) => o.orderNumber === "TEST-ORD-08-CANCELLED")).toBe(true);
    });

    test("listCommercePayments returns gateway records with transaction IDs and Persian currency", async () => {
      const payments = await adminStore.listCommercePayments({ page: 1, pageSize: 50, search: "TEST-AUTH" });
      expect(payments.payments.length).toBe(14);
      const paidPay = payments.payments.find((p) => p.authority === "TEST-AUTH-01-MONTHLY");
      expect(paidPay).toBeDefined();
      expect(paidPay!.status).toBe("paid");
      expect(paidPay!.transactionId).toBe("TEST-TXN-01-MONTHLY");
      expect(paidPay!.currency).toBe("toman");
    });

    test("listCommerceSubscriptions resolves active vs expired status dynamically", async () => {
      const activeSubs = await adminStore.listCommerceSubscriptions({ page: 1, pageSize: 50, status: "active" });
      const expiredSubs = await adminStore.listCommerceSubscriptions({ page: 1, pageSize: 50, status: "expired" });

      expect(activeSubs.subscriptions.some((s) => s.userEmail === "commerce-test-01-active-monthly@test.avana.dev")).toBe(true);
      expect(activeSubs.subscriptions.some((s) => s.userEmail === "commerce-test-02-active-quarterly@test.avana.dev")).toBe(true);
      expect(activeSubs.subscriptions.some((s) => s.userEmail === "commerce-test-03-active-yearly@test.avana.dev")).toBe(true);
      expect(expiredSubs.subscriptions.some((s) => s.userEmail === "commerce-test-04-expired-subscription@test.avana.dev")).toBe(true);
    });

    test("listCommerceEntitlements categorizes lifetime, active, and admin grants", async () => {
      const lifetimeEnts = await adminStore.listCommerceEntitlements({ page: 1, pageSize: 50, status: "lifetime" });
      const adminGrants = await adminStore.listCommerceEntitlements({ page: 1, pageSize: 50, sourceType: "admin_grant" });

      expect(lifetimeEnts.entitlements.some((e) => e.userEmail === "commerce-test-09-lifetime-course@test.avana.dev")).toBe(true);
      expect(lifetimeEnts.entitlements.some((e) => e.userEmail === "commerce-test-10-content-pack@test.avana.dev")).toBe(true);
      expect(adminGrants.entitlements.some((e) => e.userEmail === "commerce-test-11-admin-grant@test.avana.dev")).toBe(true);
    });

    test("getUserCommerceProfile renders full financial drawer for Scenario 12 (Multiple Purchases)", async () => {
      const user = userMap.get("commerce-test-12-multiple-purchases@test.avana.dev")!;
      const profile = await adminStore.getUserCommerceProfile(user.id);

      expect(profile.user.email).toBe(user.email);
      expect(profile.activeSubscription).not.toBeNull();
      expect(profile.activeSubscription?.plan).toBe("sub_monthly");
      expect(profile.subscriptionHistory.length).toBe(2); // 1 active, 1 expired
      expect(profile.lifetimePurchases.length).toBe(2); // 1 course, 1 pack
      expect(profile.orders.length).toBe(5); // 4 paid, 1 failed
      expect(profile.payments.length).toBe(5); // 4 paid, 1 failed
      expect(profile.entitlements.length).toBe(4);
    });

    test("getUserCommerceProfile renders clean empty state for Scenario 05 (No Subscription)", async () => {
      const user = userMap.get("commerce-test-05-no-subscription@test.avana.dev")!;
      const profile = await adminStore.getUserCommerceProfile(user.id);

      expect(profile.user.email).toBe(user.email);
      expect(profile.activeSubscription).toBeNull();
      expect(profile.subscriptionHistory.length).toBe(0);
      expect(profile.lifetimePurchases.length).toBe(0);
      expect(profile.orders.length).toBe(0);
      expect(profile.payments.length).toBe(0);
      expect(profile.entitlements.length).toBe(0);
    });
  });
});
