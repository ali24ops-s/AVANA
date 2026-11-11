import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDbClient } from "@avana/database/client";
import { sql, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  users,
  payments,
  orders,
  wallets,
  crmTags,
  crmCustomerTags,
  crmCustomerNotes,
  crmSegments,
  sessions,
  userDevices,
  studySessions,
} from "@avana/database/schema";
import { DrizzleCrmStore, InMemoryCrmStore } from "../modules/admin/crm/crm-store.js";
import { validateSegmentRules, type SegmentFilterRule } from "@avana/domain";

describe("Real PostgreSQL Integration & SQL vs InMemory Parity (DrizzleCrmStore)", () => {
  const explicitDbUrl = "postgres://ops@localhost:5432/avana_crm_test_pg?sslmode=disable";

  let client: ReturnType<typeof createDbClient>;
  let drizzleStore: DrizzleCrmStore;
  let inMemoryStore: InMemoryCrmStore;

  // Track all IDs created by this test suite for deterministic and targeted cleanup
  const createdUserIds: string[] = [];
  const createdSegmentIds: string[] = [];
  const createdTagIds: string[] = [];
  const createdOrderIds: string[] = [];
  const createdPaymentIds: string[] = [];

  // Dedicated test actors
  let adminUserId: string;
  let userAId: string; // Math, 150k cash spent, active 2 days ago, has VIP tag
  let userBId: string; // Experimental, 50k cash spent, active 45 days ago, has Trial tag
  let userCId: string; // Humanities, 0 cash spent (wallet only), zero activity, no tags
  let userDId: string; // Math, 0 cash spent, active 10 days ago, has VIP + Risk tags
  let userBoundaryId: string; // Math, exactly 100k cash spent, active 15 days ago, has Risk tag

  let tagVipId: string;
  let tagTrialId: string;
  let tagRiskId: string;

  beforeAll(async () => {
    client = createDbClient(explicitDbUrl);

    // 1. Database Safety Verification: Ensure we are strictly on avana_crm_test_pg
    const dbCheck = await client.db.execute(
      sql`SELECT current_database() as db_name, current_user as user_name;`,
    );
    const dbName = (dbCheck.rows[0] as { db_name: string }).db_name;
    if (dbName !== "avana_crm_test_pg") {
      throw new Error(
        `CRITICAL SAFETY VIOLATION: Expected database 'avana_crm_test_pg', but connected to '${dbName}'. Halting immediately.`,
      );
    }

    drizzleStore = new DrizzleCrmStore(client.db);
    inMemoryStore = new InMemoryCrmStore();

    // 2. Helper to insert user into both PostgreSQL and InMemory
    async function seedUser(userData: {
      id: string;
      email: string;
      name: string;
      major: string;
      createdAt: Date;
    }) {
      createdUserIds.push(userData.id);

      // PostgreSQL
      await client.db.insert(users).values({
        id: userData.id,
        email: userData.email,
        name: userData.name,
        major: userData.major,
        createdAt: userData.createdAt,
        updatedAt: userData.createdAt,
      });

      // InMemory
      inMemoryStore.memoryUsers.push({
        id: userData.id,
        email: userData.email,
        name: userData.name,
        major: userData.major,
        createdAt: userData.createdAt.toISOString(),
      });
    }

    // Seed Admin
    adminUserId = randomUUID();
    await seedUser({
      id: adminUserId,
      email: `admin-${adminUserId.slice(0, 8)}@test.com`,
      name: "مدیر آزمایشی",
      major: "math",
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });

    // Seed User A: Math, 150k cash spent, active 2 days ago
    userAId = randomUUID();
    await seedUser({
      id: userAId,
      email: `user-a-${userAId.slice(0, 8)}@test.com`,
      name: "کاربر الف (ریاضی، ۱۵۰ هزار)",
      major: "math",
      createdAt: new Date("2026-01-10T10:00:00Z"),
    });

    // Seed User B: Experimental, 50k cash spent, active 45 days ago
    userBId = randomUUID();
    await seedUser({
      id: userBId,
      email: `user-b-${userBId.slice(0, 8)}@test.com`,
      name: "کاربر ب (تجربی، ۵۰ هزار)",
      major: "experimental",
      createdAt: new Date("2026-01-15T10:00:00Z"),
    });

    // Seed User C: Humanities, 0 cash spent, zero activity
    userCId = randomUUID();
    await seedUser({
      id: userCId,
      email: `user-c-${userCId.slice(0, 8)}@test.com`,
      name: "کاربر ج (انسانی، بدون پرداخت)",
      major: "humanities",
      createdAt: new Date("2026-02-01T10:00:00Z"),
    });

    // Seed User D: Math, 0 cash spent, active 10 days ago
    userDId = randomUUID();
    await seedUser({
      id: userDId,
      email: `user-d-${userDId.slice(0, 8)}@test.com`,
      name: "کاربر د (ریاضی، بدون پرداخت)",
      major: "math",
      createdAt: new Date("2026-02-10T10:00:00Z"),
    });

    // Seed User Boundary: Math, exactly 100k cash spent, active 15 days ago
    userBoundaryId = randomUUID();
    await seedUser({
      id: userBoundaryId,
      email: `user-boundary-${userBoundaryId.slice(0, 8)}@test.com`,
      name: "کاربر مرزی (ریاضی، دقیقاً ۱۰۰ هزار)",
      major: "math",
      createdAt: new Date("2026-02-15T10:00:00Z"),
    });

    // 3. Seed Orders & Payments
    async function seedPayment(
      userId: string,
      amount: number,
      gateway: string,
      status: string,
    ) {
      const orderId = randomUUID();
      const paymentId = randomUUID();
      createdOrderIds.push(orderId);
      createdPaymentIds.push(paymentId);

      // PostgreSQL
      await client.db.insert(orders).values({
        id: orderId,
        userId,
        productId: "bbe93b80-c200-435c-b316-d1d8e8ed9421",
        orderNumber: `ORD-${randomUUID().slice(0, 10)}`,
        amount,
        status: status === "paid" ? "paid" : "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await client.db.insert(payments).values({
        id: paymentId,
        userId,
        orderId,
        amount,
        gateway,
        status,
        paidAt: status === "paid" ? new Date() : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // InMemory
      inMemoryStore.memoryOrders.push({
        id: orderId,
        userId,
        status: status === "paid" ? "paid" : "pending",
      });
      inMemoryStore.memoryPayments.push({
        id: paymentId,
        userId,
        orderId,
        amount,
        gateway,
        status,
        paidAt: status === "paid" ? new Date().toISOString() : null,
      });
    }

    // User A: 100k cash + 50k cash (total = 150k cash) + 1 pending 200k payment
    await seedPayment(userAId, 100_000, "zarinpal", "paid");
    await seedPayment(userAId, 50_000, "zarinpal", "paid");
    await seedPayment(userAId, 200_000, "zarinpal", "pending"); // pending must not count!

    // User B: 50k cash
    await seedPayment(userBId, 50_000, "saman", "paid");

    // User C: 70k internal wallet payment (must NOT count as cash spent!)
    await seedPayment(userCId, 70_000, "wallet", "paid");

    // User Boundary: exactly 100k cash spent
    await seedPayment(userBoundaryId, 100_000, "zarinpal", "paid");

    // 4. Seed Tags
    const tagVip = await drizzleStore.createTag({
      name: `VIP-${randomUUID().slice(0, 6)}`,
      color: "#10b981",
      description: "مشتری برتر",
    });
    tagVipId = tagVip.id;
    createdTagIds.push(tagVipId);
    inMemoryStore.memoryTags.push(tagVip);

    const tagTrial = await drizzleStore.createTag({
      name: `TRIAL-${randomUUID().slice(0, 6)}`,
      color: "#f59e0b",
      description: "دوره آزمایشی",
    });
    tagTrialId = tagTrial.id;
    createdTagIds.push(tagTrialId);
    inMemoryStore.memoryTags.push(tagTrial);

    const tagRisk = await drizzleStore.createTag({
      name: `RISK-${randomUUID().slice(0, 6)}`,
      color: "#ef4444",
      description: "ریسک ریزش",
    });
    tagRiskId = tagRisk.id;
    createdTagIds.push(tagRiskId);
    inMemoryStore.memoryTags.push(tagRisk);

    // Assign Tags:
    // User A: VIP
    await drizzleStore.assignTag(userAId, tagVipId, adminUserId);
    inMemoryStore.memoryCustomerTags.push({ userId: userAId, tagId: tagVipId });

    // User B: Trial
    await drizzleStore.assignTag(userBId, tagTrialId, adminUserId);
    inMemoryStore.memoryCustomerTags.push({ userId: userBId, tagId: tagTrialId });

    // User D: VIP + Risk
    await drizzleStore.assignTag(userDId, tagVipId, adminUserId);
    await drizzleStore.assignTag(userDId, tagRiskId, adminUserId);
    inMemoryStore.memoryCustomerTags.push({ userId: userDId, tagId: tagVipId });
    inMemoryStore.memoryCustomerTags.push({ userId: userDId, tagId: tagRiskId });

    // User Boundary: Risk
    await drizzleStore.assignTag(userBoundaryId, tagRiskId, adminUserId);
    inMemoryStore.memoryCustomerTags.push({ userId: userBoundaryId, tagId: tagRiskId });

    // 5. Seed Activity (Sessions & Devices)
    const now = Date.now();
    const twoDaysAgo = new Date(now - 2 * 86400000);
    const tenDaysAgo = new Date(now - 10 * 86400000);
    const fifteenDaysAgo = new Date(now - 15 * 86400000);
    const fortyFiveDaysAgo = new Date(now - 45 * 86400000);

    // User A active 2 days ago
    await client.db.insert(sessions).values({
      id: randomUUID(),
      userId: userAId,
      tokenHash: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      createdAt: twoDaysAgo,
      lastUsedAt: twoDaysAgo,
      expiresAt: new Date(now + 86400000),
    });
    inMemoryStore.memorySessions.push({ userId: userAId, lastUsedAt: twoDaysAgo.toISOString() });

    // User D active 10 days ago
    await client.db.insert(sessions).values({
      id: randomUUID(),
      userId: userDId,
      tokenHash: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      createdAt: tenDaysAgo,
      lastUsedAt: tenDaysAgo,
      expiresAt: new Date(now + 86400000),
    });
    inMemoryStore.memorySessions.push({ userId: userDId, lastUsedAt: tenDaysAgo.toISOString() });

    // User Boundary active 15 days ago
    await client.db.insert(sessions).values({
      id: randomUUID(),
      userId: userBoundaryId,
      tokenHash: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      createdAt: fifteenDaysAgo,
      lastUsedAt: fifteenDaysAgo,
      expiresAt: new Date(now + 86400000),
    });
    inMemoryStore.memorySessions.push({ userId: userBoundaryId, lastUsedAt: fifteenDaysAgo.toISOString() });

    // User B active 45 days ago
    await client.db.insert(sessions).values({
      id: randomUUID(),
      userId: userBId,
      tokenHash: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, ""),
      createdAt: fortyFiveDaysAgo,
      lastUsedAt: fortyFiveDaysAgo,
      expiresAt: new Date(now + 86400000),
    });
    inMemoryStore.memorySessions.push({ userId: userBId, lastUsedAt: fortyFiveDaysAgo.toISOString() });

    // User C: ZERO sessions, zero devices
  });

  afterAll(async () => {
    // Targeted, isolated cleanup of strictly created IDs
    try {
      if (createdSegmentIds.length > 0) {
        await client.db.delete(crmSegments).where(inArray(crmSegments.id, createdSegmentIds));
      }
      if (createdUserIds.length > 0) {
        await client.db.delete(crmCustomerNotes).where(inArray(crmCustomerNotes.userId, createdUserIds));
        await client.db.delete(crmCustomerTags).where(inArray(crmCustomerTags.userId, createdUserIds));
        await client.db.delete(payments).where(inArray(payments.userId, createdUserIds));
        await client.db.delete(orders).where(inArray(orders.userId, createdUserIds));
        await client.db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
        await client.db.delete(userDevices).where(inArray(userDevices.userId, createdUserIds));
        await client.db.delete(studySessions).where(inArray(studySessions.userId, createdUserIds));
        await client.db.delete(users).where(inArray(users.id, createdUserIds));
      }
      if (createdTagIds.length > 0) {
        await client.db.delete(crmTags).where(inArray(crmTags.id, createdTagIds));
      }
    } catch (err) {
      console.error("Cleanup error in integration test:", err);
    } finally {
      await client.close();
    }
  });

  // =========================================================================
  // A. Segment CRUD & Rules Validation
  // =========================================================================
  describe("A. Segment CRUD & Rules Validation", () => {
    it("creates, reads, and updates a dynamic customer segment in PostgreSQL", async () => {
      const segment = await drizzleStore.createSegment(
        {
          name: "دانش‌آموزان ریاضی با خرید بالای ۱۰۰ هزار",
          description: "سگمنت برای کمپین ویژه المپیاد",
          isActive: true,
          matchOperator: "and",
          filterRules: [
            { field: "user.major", operator: "equals", value: "math" },
            { field: "payment.totalCashSpent", operator: "greater_than_or_equal", value: 100_000 },
          ],
        },
        adminUserId,
      );

      createdSegmentIds.push(segment.id);
      expect(segment.id).toBeDefined();
      expect(segment.name).toBe("دانش‌آموزان ریاضی با خرید بالای ۱۰۰ هزار");
      expect(segment.matchOperator).toBe("and");
      expect(segment.filterRules).toHaveLength(2);
      expect(segment.estimatedCount).toBe(2); // User A and User Boundary

      // Read back
      const fetched = await drizzleStore.findSegmentById(segment.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(segment.id);
      expect(fetched!.createdById).toBe(adminUserId);

      // Update segment
      const updated = await drizzleStore.updateSegment(segment.id, {
        name: "نام ویرایش‌شده سگمنت",
        description: "توضیحات به‌روزشده",
        isActive: false,
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("نام ویرایش‌شده سگمنت");
      expect(updated!.description).toBe("توضیحات به‌روزشده");
      expect(updated!.isActive).toBe(false);
    });

    it("verifies default filter_rules column behavior in PostgreSQL", async () => {
      const segment = await drizzleStore.createSegment(
        {
          name: "سگمنت بدون قوانین اولیه",
          matchOperator: "and",
          filterRules: [],
        },
        adminUserId,
      );
      createdSegmentIds.push(segment.id);

      const fetched = await drizzleStore.findSegmentById(segment.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.filterRules).toEqual([]);
    });

    it("validates domain filter rules and prevents invalid payloads", () => {
      // Invalid operator for field
      const invalidRules = [
        { field: "user.major", operator: "greater_than", value: 123 },
      ];
      expect(() => validateSegmentRules(invalidRules)).toThrow();
    });

    it("handles duplicate segment names per project schema contract (allowed)", async () => {
      const seg1 = await drizzleStore.createSegment(
        { name: "سگمنت آزمایشی تکراری", matchOperator: "and", filterRules: [] },
        adminUserId,
      );
      const seg2 = await drizzleStore.createSegment(
        { name: "سگمنت آزمایشی تکراری", matchOperator: "and", filterRules: [] },
        adminUserId,
      );
      createdSegmentIds.push(seg1.id, seg2.id);

      expect(seg1.id).not.toBe(seg2.id);
      expect(seg1.name).toBe(seg2.name);
    });
  });

  // =========================================================================
  // B. AND & OR Evaluation
  // =========================================================================
  describe("B. AND & OR Evaluation", () => {
    it("evaluates single condition: user.major equals math", async () => {
      const rules: SegmentFilterRule[] = [
        { field: "user.major", operator: "equals", value: "math" },
      ];
      const count = await drizzleStore.previewSegmentCount(rules, "and");
      // Matches: User A, User D, User Boundary, and admin
      expect(count).toBe(4);

      // Verify exact members
      const segment = await drizzleStore.createSegment(
        { name: "Test Major Math", matchOperator: "and", filterRules: rules },
        adminUserId,
      );
      createdSegmentIds.push(segment.id);

      const members = await drizzleStore.getSegmentMembers({ segmentId: segment.id, page: 1, pageSize: 20 });
      const memberIds = members.customers.map((c) => c.id).sort();
      expect(memberIds).toEqual([adminUserId, userAId, userDId, userBoundaryId].sort());
    });

    it("evaluates two conditions with AND: user.major math AND totalCashSpent >= 100k", async () => {
      const rules: SegmentFilterRule[] = [
        { field: "user.major", operator: "equals", value: "math" },
        { field: "payment.totalCashSpent", operator: "greater_than_or_equal", value: 100_000 },
      ];
      const count = await drizzleStore.previewSegmentCount(rules, "and");
      // Matches User A (150k) and User Boundary (100k)
      expect(count).toBe(2);

      const segment = await drizzleStore.createSegment(
        { name: "Test Math AND >=100k", matchOperator: "and", filterRules: rules },
        adminUserId,
      );
      createdSegmentIds.push(segment.id);

      const members = await drizzleStore.getSegmentMembers({ segmentId: segment.id });
      const memberIds = members.customers.map((c) => c.id).sort();
      expect(memberIds).toEqual([userAId, userBoundaryId].sort());
    });

    it("evaluates two conditions with OR: user.major humanities OR totalCashSpent > 100k", async () => {
      const rules: SegmentFilterRule[] = [
        { field: "user.major", operator: "equals", value: "humanities" },
        { field: "payment.totalCashSpent", operator: "greater_than", value: 100_000 },
      ];
      const count = await drizzleStore.previewSegmentCount(rules, "or");
      // Matches User C (humanities) and User A (> 100k)
      expect(count).toBe(2);

      const segment = await drizzleStore.createSegment(
        { name: "Test Humanities OR >100k", matchOperator: "or", filterRules: rules },
        adminUserId,
      );
      createdSegmentIds.push(segment.id);

      const members = await drizzleStore.getSegmentMembers({ segmentId: segment.id });
      const memberIds = members.customers.map((c) => c.id).sort();
      expect(memberIds).toEqual([userAId, userCId].sort());
    });

    it("evaluates zero matching members", async () => {
      const rules: SegmentFilterRule[] = [
        { field: "user.major", operator: "equals", value: "astrophysics_nonexistent" },
      ];
      const count = await drizzleStore.previewSegmentCount(rules, "and");
      expect(count).toBe(0);
    });

    it("evaluates boundary condition: >= 100k (inclusive) vs > 100k (strict)", async () => {
      // Greater than or equal 100k: includes User A (150k) and User Boundary (100k)
      const gteRules: SegmentFilterRule[] = [
        { field: "payment.totalCashSpent", operator: "greater_than_or_equal", value: 100_000 },
      ];
      const gteCount = await drizzleStore.previewSegmentCount(gteRules, "and");
      expect(gteCount).toBe(2);

      // Strict greater than 100k: includes ONLY User A (150k)
      const gtRules: SegmentFilterRule[] = [
        { field: "payment.totalCashSpent", operator: "greater_than", value: 100_000 },
      ];
      const gtCount = await drizzleStore.previewSegmentCount(gtRules, "and");
      expect(gtCount).toBe(1);
    });
  });

  // =========================================================================
  // C. CRM Tags
  // =========================================================================
  describe("C. CRM Tags", () => {
    it("filters by single tag with equals operator", async () => {
      const rules: SegmentFilterRule[] = [
        { field: "crm.tag", operator: "equals", value: tagVipId },
      ];
      const count = await drizzleStore.previewSegmentCount(rules, "and");
      // User A and User D have VIP tag
      expect(count).toBe(2);
    });

    it("filters by multiple tags with in operator (matches ANY matching tag)", async () => {
      const rules: SegmentFilterRule[] = [
        { field: "crm.tag", operator: "in", value: [tagVipId, tagTrialId] },
      ];
      const count = await drizzleStore.previewSegmentCount(rules, "and");
      // VIP: User A, User D. Trial: User B. Total = 3
      expect(count).toBe(3);
    });

    it("filters users with multiple tags (User D has VIP and Risk)", async () => {
      const rules: SegmentFilterRule[] = [
        { field: "crm.tag", operator: "equals", value: tagRiskId },
      ];
      const count = await drizzleStore.previewSegmentCount(rules, "and");
      // User D and User Boundary
      expect(count).toBe(2);
    });

    it("filters users with no tags using not_in", async () => {
      const rules: SegmentFilterRule[] = [
        { field: "user.major", operator: "equals", value: "humanities" },
        { field: "crm.tag", operator: "not_in", value: [tagVipId, tagTrialId, tagRiskId] },
      ];
      const count = await drizzleStore.previewSegmentCount(rules, "and");
      // User C is humanities and has none of these tags
      expect(count).toBe(1);
    });

    it("prevents duplicate tag assignment to the same user idempotently", async () => {
      // Re-assign VIP tag to User A (already has it)
      const result = await drizzleStore.assignTag(userAId, tagVipId, adminUserId);
      expect(result).toBe(false); // returns false because already assigned

      // Verify no duplicate rows created in database
      const tagRows = await client.db
        .select()
        .from(crmCustomerTags)
        .where(eq(crmCustomerTags.userId, userAId));
      const vipMatches = tagRows.filter((r) => r.tagId === tagVipId);
      expect(vipMatches).toHaveLength(1);
    });
  });

  // =========================================================================
  // D. Financial Data
  // =========================================================================
  describe("D. Financial Data", () => {
    it("distinguishes paid from pending payments (pending 200k does not count)", async () => {
      // User A has 100k + 50k paid, and 200k pending. Total should be 150k.
      const rules: SegmentFilterRule[] = [
        { field: "payment.totalCashSpent", operator: "greater_than", value: 200_000 },
      ];
      const count = await drizzleStore.previewSegmentCount(rules, "and");
      // No user has > 200k in paid payments!
      expect(count).toBe(0);
    });

    it("distinguishes external gateway payments from internal wallet payments", async () => {
      // User C paid 70k via wallet. Has no fiat cash purchases!
      const rules: SegmentFilterRule[] = [
        { field: "user.major", operator: "equals", value: "humanities" },
        { field: "payment.hasCashPurchase", operator: "is_false" },
      ];
      const count = await drizzleStore.previewSegmentCount(rules, "and");
      expect(count).toBe(1);
    });

    it("handles users with zero purchases (totalCashSpent equals 0)", async () => {
      const rules: SegmentFilterRule[] = [
        { field: "payment.totalCashSpent", operator: "equals", value: 0 },
      ];
      const count = await drizzleStore.previewSegmentCount(rules, "and");
      // User C (wallet only), User D (no payments), and admin (no payments) = 3
      expect(count).toBe(3);
    });

    it("evaluates financial range between [50000, 150000]", async () => {
      const rules: SegmentFilterRule[] = [
        { field: "payment.totalCashSpent", operator: "between", value: [50_000, 150_000] },
      ];
      const count = await drizzleStore.previewSegmentCount(rules, "and");
      // User B (50k), User Boundary (100k), User A (150k) = 3
      expect(count).toBe(3);
    });
  });

  // =========================================================================
  // E. Temporal & Activity Filters
  // =========================================================================
  describe("E. Temporal & Activity Filters", () => {
    it("filters active within last 7 days", async () => {
      const rules: SegmentFilterRule[] = [
        { field: "activity.lastActiveDate", operator: "days_ago_less_than", value: 7 },
      ];
      const count = await drizzleStore.previewSegmentCount(rules, "and");
      // User A (2 days ago)
      expect(count).toBe(1);
    });

    it("filters inactive for more than 30 days (includes users with 0 activity)", async () => {
      const rules: SegmentFilterRule[] = [
        { field: "activity.lastActiveDate", operator: "days_ago_greater_than", value: 30 },
      ];
      const count = await drizzleStore.previewSegmentCount(rules, "and");
      // User B (active 45 days ago) + User C (0 activity) + admin (0 activity)
      expect(count).toBeGreaterThanOrEqual(3);
    });
  });

  // =========================================================================
  // F. Member Pagination
  // =========================================================================
  describe("F. Member Pagination", () => {
    let testSegmentId: string;

    beforeAll(async () => {
      // Segment matching User A, User B, User D, User Boundary (Math or Experimental)
      const segment = await drizzleStore.createSegment(
        {
          name: "Pagination Test Segment",
          matchOperator: "or",
          filterRules: [
            { field: "user.major", operator: "equals", value: "math" },
            { field: "user.major", operator: "equals", value: "experimental" },
          ],
        },
        adminUserId,
      );
      testSegmentId = segment.id;
      createdSegmentIds.push(testSegmentId);
    });

    it("returns correct page 1 with pageSize 2", async () => {
      const res = await drizzleStore.getSegmentMembers({
        segmentId: testSegmentId,
        page: 1,
        pageSize: 2,
        sortBy: "createdAt",
        sortOrder: "asc",
      });
      expect(res.customers).toHaveLength(2);
      expect(res.page).toBe(1);
      expect(res.pageSize).toBe(2);
      expect(res.totalCount).toBe(5); // Admin + User A + User B + User D + User Boundary
    });

    it("returns correct middle page 2 with pageSize 2 and no overlap", async () => {
      const page1 = await drizzleStore.getSegmentMembers({
        segmentId: testSegmentId,
        page: 1,
        pageSize: 2,
        sortBy: "createdAt",
        sortOrder: "asc",
      });
      const page2 = await drizzleStore.getSegmentMembers({
        segmentId: testSegmentId,
        page: 2,
        pageSize: 2,
        sortBy: "createdAt",
        sortOrder: "asc",
      });

      expect(page2.customers).toHaveLength(2);
      const page1Ids = page1.customers.map((c) => c.id);
      const page2Ids = page2.customers.map((c) => c.id);
      // Disjoint sets
      for (const id of page2Ids) {
        expect(page1Ids).not.toContain(id);
      }
    });

    it("returns empty customer array for out-of-bounds page", async () => {
      const res = await drizzleStore.getSegmentMembers({
        segmentId: testSegmentId,
        page: 99,
        pageSize: 20,
      });
      expect(res.customers).toHaveLength(0);
      expect(res.totalCount).toBe(5);
    });

    it("guarantees deterministic ordering with secondary tie-breaker", async () => {
      const run1 = await drizzleStore.getSegmentMembers({
        segmentId: testSegmentId,
        page: 1,
        pageSize: 5,
        sortBy: "totalSpent",
        sortOrder: "desc",
      });
      const run2 = await drizzleStore.getSegmentMembers({
        segmentId: testSegmentId,
        page: 1,
        pageSize: 5,
        sortBy: "totalSpent",
        sortOrder: "desc",
      });
      expect(run1.customers.map((c) => c.id)).toEqual(run2.customers.map((c) => c.id));
    });
  });

  // =========================================================================
  // G. SQL vs InMemory Parity Comparison
  // =========================================================================
  describe("G. SQL vs InMemory Parity Comparison", () => {
    it("achieves 100% parity on compound AND rules", async () => {
      const rules: SegmentFilterRule[] = [
        { field: "user.major", operator: "equals", value: "math" },
        { field: "payment.totalCashSpent", operator: "greater_than_or_equal", value: 100_000 },
      ];

      const drizzleCount = await drizzleStore.previewSegmentCount(rules, "and");
      const inMemCount = await inMemoryStore.previewSegmentCount(rules, "and");
      expect(drizzleCount).toBe(inMemCount);
      expect(drizzleCount).toBe(2);
    });

    it("achieves 100% parity on compound OR rules", async () => {
      const rules: SegmentFilterRule[] = [
        { field: "user.major", operator: "equals", value: "humanities" },
        { field: "payment.totalCashSpent", operator: "greater_than", value: 100_000 },
      ];

      const drizzleCount = await drizzleStore.previewSegmentCount(rules, "or");
      const inMemCount = await inMemoryStore.previewSegmentCount(rules, "or");
      expect(drizzleCount).toBe(inMemCount);
      expect(drizzleCount).toBe(2);
    });

    it("achieves 100% parity on tag filtering", async () => {
      const rules: SegmentFilterRule[] = [
        { field: "crm.tag", operator: "in", value: [tagVipId, tagTrialId] },
      ];

      const drizzleCount = await drizzleStore.previewSegmentCount(rules, "and");
      const inMemCount = await inMemoryStore.previewSegmentCount(rules, "and");
      expect(drizzleCount).toBe(inMemCount);
      expect(drizzleCount).toBe(3);
    });

    it("achieves 100% parity on zero-spenders (users with no payment records)", async () => {
      const rules: SegmentFilterRule[] = [
        { field: "payment.totalCashSpent", operator: "equals", value: 0 },
      ];

      const drizzleCount = await drizzleStore.previewSegmentCount(rules, "and");
      const inMemCount = await inMemoryStore.previewSegmentCount(rules, "and");
      expect(drizzleCount).toBe(inMemCount);
      expect(drizzleCount).toBe(3);
    });
  });
});
