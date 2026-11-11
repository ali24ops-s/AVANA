import { describe, test, expect, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { InMemoryCrmStore } from "../modules/admin/crm/crm-store.js";
import { v1Routes } from "../routes/v1.js";
import { Roles, type Role, type UserId, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Admin CRM Dynamic Customer Segmentation API (Phase 2)", () => {
  let app: ReturnType<typeof createApp>;
  let crmStore: InMemoryCrmStore;
  let adminStore: InMemoryAdminStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let sessionStore: InMemorySessionStore;
  let sessionService: SessionService;

  let platformAdminToken: string;
  let platformAdminId: UserId;
  let supportAgentToken: string;
  let studentToken: string;

  let customer1Id: string;
  let customer2Id: string;
  let customer3Id: string;
  let vipTagId: string;

  beforeEach(async () => {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";
    config.systemOrganizationId = "00000000-0000-0000-0000-000000000001";

    sessionStore = new InMemorySessionStore();
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    adminStore = new InMemoryAdminStore(userStore, orgStore);
    crmStore = new InMemoryCrmStore();
    sessionService = new SessionService(sessionStore, config.session);

    async function createUser(email: string, role: Role, name?: string) {
      const user = await userStore.createUserWithPassword({
        email,
        passwordHash: "hash123",
        role,
        fullName: name,
      });
      if (role === Roles.platform_admin || role === Roles.content_worker || role === Roles.support_agent) {
        user.globalRole = role;
        user.role = role;
        userStore.insert({ ...user });
      }
      const orgId = randomUUID() as OrganizationId;
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: user.id as UserId,
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const session = await sessionService.createSession(user.id);
      return { user, sessionToken: session.sessionToken };
    }

    // Actors
    const pAdmin = await createUser("admin@avana.org", Roles.platform_admin, "مدیر ارشد");
    platformAdminToken = pAdmin.sessionToken;
    platformAdminId = pAdmin.user.id as UserId;

    const sAgent = await createUser("support@avana.org", Roles.support_agent, "کارشناس پشتیبانی");
    supportAgentToken = sAgent.sessionToken;

    const student = await createUser("student@avana.org", Roles.student, "دانش‌آموز");
    studentToken = student.sessionToken;

    // Seed customer 1: High spender, math major, verified, high study time
    customer1Id = randomUUID();
    crmStore.memoryUsers.push({
      id: customer1Id,
      email: "vip_student@test.com",
      name: "امیرحسین VIP",
      phoneNumber: "+989121111111",
      createdAt: new Date("2026-01-01T10:00:00Z").toISOString(),
      deletedAt: null,
      emailVerifiedAt: new Date("2026-01-01T10:05:00Z").toISOString(),
      phoneVerifiedAt: new Date("2026-01-01T10:05:00Z").toISOString(),
      globalRole: "student",
      major: "math",
      teacherStatus: "approved",
    });

    // Customer 1: Paid cash payment (gateway: zarinpal)
    crmStore.memoryPayments.push({
      id: randomUUID(),
      userId: customer1Id,
      orderId: randomUUID(),
      amount: 5000000,
      status: "paid",
      gateway: "zarinpal",
      paidAt: new Date("2026-02-01T10:00:00Z").toISOString(),
    });

    // Customer 1: Study session (7200 seconds)
    crmStore.memoryStudySessions.push({
      userId: customer1Id,
      lastActivityAt: new Date().toISOString(),
      durationSeconds: 7200,
    });

    // Customer 1: Wallet balance
    crmStore.memoryWallets.set(customer1Id, 100000);

    // Customer 1: Tag
    vipTagId = randomUUID();
    crmStore.memoryTags.push({
      id: vipTagId,
      name: "vip",
      color: "#f59e0b",
      description: "کاربر طلایی",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    crmStore.memoryCustomerTags.push({
      userId: customer1Id,
      tagId: vipTagId,
      assignedBy: platformAdminId,
      assignedAt: new Date().toISOString(),
    });

    // Seed customer 2: Wallet spender only (no cash paid), experimental major, unverified
    customer2Id = randomUUID();
    crmStore.memoryUsers.push({
      id: customer2Id,
      email: "wallet_user@test.com",
      name: "مریم کیف‌پول",
      phoneNumber: null,
      createdAt: new Date("2026-02-01T10:00:00Z").toISOString(),
      deletedAt: null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      globalRole: "student",
      major: "experimental",
      teacherStatus: "approved",
    });

    // Customer 2: Paid wallet payment (gateway: wallet) -> Should NOT count as cash revenue!
    crmStore.memoryPayments.push({
      id: randomUUID(),
      userId: customer2Id,
      orderId: randomUUID(),
      amount: 1000000,
      status: "paid",
      gateway: "wallet",
      paidAt: new Date("2026-02-15T10:00:00Z").toISOString(),
    });

    // Customer 2: Wallet balance
    crmStore.memoryWallets.set(customer2Id, 0);

    // Seed customer 3: Inactive user, no payments, human sciences major
    customer3Id = randomUUID();
    crmStore.memoryUsers.push({
      id: customer3Id,
      email: "inactive@test.com",
      name: "مهدی کم‌فعالیت",
      phoneNumber: "+989352222222",
      createdAt: new Date("2025-10-01T10:00:00Z").toISOString(),
      deletedAt: null,
      emailVerifiedAt: new Date("2025-10-01T10:05:00Z").toISOString(),
      phoneVerifiedAt: null,
      globalRole: "student",
      major: "humanities",
      teacherStatus: "approved",
    });

    app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
      systemOrganizationId: "00000000-0000-0000-0000-000000000001",
      crmStore,
    });
  });

  // -------------------------------------------------------------------------
  // 1. RBAC & Access Control
  // -------------------------------------------------------------------------

  test("Platform admin can create segment, support agent is forbidden (403)", async () => {
    const payload = {
      name: "مشتریان پردرآمد",
      description: "کاربرانی با خرید نقدی بالا",
      filterRules: [
        {
          field: "payment.totalCashSpent",
          operator: "greater_than_or_equal",
          value: 1000000,
          timeWindow: "all_time",
        },
      ],
      matchOperator: "and",
    };

    // Support agent cannot create
    const supportRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/segments",
      headers: { authorization: `Bearer ${supportAgentToken}` },
      payload,
    });
    expect(supportRes.statusCode).toBe(403);

    // Platform admin can create
    const adminRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/segments",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload,
    });
    expect(adminRes.statusCode).toBe(201);
    const body = JSON.parse(adminRes.payload);
    expect(body.segment.name).toBe("مشتریان پردرآمد");
    expect(body.segment.estimatedCount).toBe(1); // customer 1 only (customer 2 has wallet payment)
  });

  test("Support agent can read segments and view members, but cannot update or delete", async () => {
    // 1. Create a segment as platform admin
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/segments",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "کاربران رشته ریاضی",
        filterRules: [
          {
            field: "user.major",
            operator: "equals",
            value: "math",
          },
        ],
        matchOperator: "and",
      },
    });
    const segmentId = JSON.parse(createRes.payload).segment.id;

    // 2. Support agent lists segments (200)
    const listRes = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/segments",
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.payload);
    expect(listBody.segments.length).toBeGreaterThanOrEqual(1);

    // 3. Support agent views single segment (200)
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/segments/${segmentId}`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(getRes.statusCode).toBe(200);

    // 4. Support agent views members (200)
    const membersRes = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/segments/${segmentId}/members`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(membersRes.statusCode).toBe(200);
    const membersBody = JSON.parse(membersRes.payload);
    expect(membersBody.totalCount).toBe(1);
    expect(membersBody.customers[0].id).toBe(customer1Id);

    // 5. Support agent tries to update (403)
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/crm/segments/${segmentId}`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
      payload: { name: "تغییر غیرمجاز" },
    });
    expect(updateRes.statusCode).toBe(403);

    // 6. Support agent tries to delete (403)
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/admin/crm/segments/${segmentId}`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(deleteRes.statusCode).toBe(403);
  });

  test("Student cannot access segments API at all (403)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/segments",
      headers: { authorization: `Bearer ${studentToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 2. Dynamic Rule Evaluation & Cash vs Wallet verification
  // -------------------------------------------------------------------------

  test("Preview count strictly distinguishes cash revenue from wallet consumption", async () => {
    // A rule with totalCashSpent >= 500,000
    const cashPreviewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/segments/preview-count",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        filterRules: [
          {
            field: "payment.totalCashSpent",
            operator: "greater_than_or_equal",
            value: 500000,
            timeWindow: "all_time",
          },
        ],
        matchOperator: "and",
      },
    });
    expect(cashPreviewRes.statusCode).toBe(200);
    const cashBody = JSON.parse(cashPreviewRes.payload);
    // Customer 1 paid 5,000,000 cash; Customer 2 paid 1,000,000 with wallet; Customer 3 paid 0.
    // Count MUST be 1, proving wallet payments are strictly excluded.
    expect(cashBody.count).toBe(1);
  });

  test("Preview count evaluates OR matchOperator (or)", async () => {
    // Either major is 'experimental' OR tag is vipTagId
    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/segments/preview-count",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        filterRules: [
          { field: "user.major", operator: "equals", value: "experimental" },
          { field: "crm.tag", operator: "equals", value: vipTagId },
        ],
        matchOperator: "or",
      },
    });
    expect(previewRes.statusCode).toBe(200);
    const body = JSON.parse(previewRes.payload);
    // Customer 1 has tag 'vip' (match), Customer 2 has major 'experimental' (match), Customer 3 has neither.
    expect(body.count).toBe(2);
  });

  test("Rule validation rejects invalid field, operator, or timeWindow", async () => {
    // Invalid field
    const invalidFieldRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/segments",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "سگمنت اشتباه",
        filterRules: [
          { field: "non_existent_column", operator: "equals", value: "test" },
        ],
        matchOperator: "and",
      },
    });
    expect(invalidFieldRes.statusCode).toBe(400);

    // Invalid operator for field
    const invalidOpRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/segments",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "اپراتور نامعتبر",
        filterRules: [
          { field: "user.major", operator: "greater_than", value: 5000 },
        ],
        matchOperator: "and",
      },
    });
    expect(invalidOpRes.statusCode).toBe(400);
  });

  // -------------------------------------------------------------------------
  // 3. Update, Delete & Member Listing
  // -------------------------------------------------------------------------

  test("Platform admin can update and delete a segment", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/segments",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "سگمنت آزمایشی",
        filterRules: [
          { field: "payment.successfulOrdersCount", operator: "greater_than_or_equal", value: 1 },
        ],
        matchOperator: "and",
      },
    });
    const segment = JSON.parse(createRes.payload).segment;

    // Update
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/crm/segments/${segment.id}`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "سگمنت به‌روزشده",
        isActive: false,
      },
    });
    expect(updateRes.statusCode).toBe(200);
    const updated = JSON.parse(updateRes.payload).segment;
    expect(updated.name).toBe("سگمنت به‌روزشده");
    expect(updated.isActive).toBe(false);

    // Delete
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/admin/crm/segments/${segment.id}`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(deleteRes.statusCode).toBe(200);

    // Get after delete -> 404
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/segments/${segment.id}`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(getRes.statusCode).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 4. Edge Cases: Empty Rules, Inactive Users & Preview vs Members Parity
  // -------------------------------------------------------------------------

  test("Empty rules segment matches all non-deleted users", async () => {
    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/segments/preview-count",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        filterRules: [],
        matchOperator: "and",
      },
    });
    expect(previewRes.statusCode).toBe(200);
    const body = JSON.parse(previewRes.payload);
    // All 3 non-deleted seeded customers are matched
    expect(body.count).toBe(3);
  });

  test("Parity: preview-count equals members totalCount for complex rules", async () => {
    const rules = [
      { field: "user.isVerified", operator: "is_true", value: true },
    ];

    // 1. Preview count
    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/segments/preview-count",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: { filterRules: rules, matchOperator: "and" },
    });
    const previewCount = JSON.parse(previewRes.payload).count;

    // 2. Create segment
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/segments",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "کاربران احرازشده",
        filterRules: rules,
        matchOperator: "and",
      },
    });
    const segmentId = JSON.parse(createRes.payload).segment.id;

    // 3. Get members
    const membersRes = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/segments/${segmentId}/members`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    const membersTotal = JSON.parse(membersRes.payload).totalCount;

    // Parity verification
    expect(previewCount).toBe(membersTotal);
  });

  test("Inactive user with zero sessions matches activity.lastActiveDate days_ago_greater_than", async () => {
    // Customer 3 has no sessions, no devices, no study sessions
    const previewRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/segments/preview-count",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        filterRules: [
          { field: "activity.lastActiveDate", operator: "days_ago_greater_than", value: 30 },
        ],
        matchOperator: "and",
      },
    });
    expect(previewRes.statusCode).toBe(200);
    const body = JSON.parse(previewRes.payload);
    // Customer 2 and Customer 3 have 0 activity, so they have been inactive for >30 days
    expect(body.count).toBeGreaterThanOrEqual(2);
  });

  test("Parity & Identity: exact member IDs match for compound AND/OR rules, multiple tags, and non-purchasers", async () => {
    // 1. Assign a second tag to Customer 1 to test multiple tags on a single customer
    const activeTagId = randomUUID();
    crmStore.memoryTags.push({
      id: activeTagId,
      name: "active_learner",
      color: "#10b981",
      description: "یادگیرنده فعال",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    crmStore.memoryCustomerTags.push({
      userId: customer1Id,
      tagId: activeTagId,
      assignedBy: platformAdminId,
      assignedAt: new Date().toISOString(),
    });

    // 2. Add a second cash payment to Customer 1 (multi-payments aggregation test)
    crmStore.memoryPayments.push({
      id: randomUUID(),
      userId: customer1Id,
      orderId: randomUUID(),
      amount: 2000000,
      status: "paid",
      gateway: "zarinpal",
      paidAt: new Date("2026-02-10T10:00:00Z").toISOString(),
    });

    // 3. Test Compound OR: matches customer1 (via vip tag) OR customer3 (via humanities major)
    const orRules = [
      { field: "crm.tag", operator: "equals", value: vipTagId },
      { field: "user.major", operator: "equals", value: "humanities" },
    ];
    const orCreateRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/segments",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "کاربران VIP یا علوم انسانی",
        filterRules: orRules,
        matchOperator: "or",
      },
    });
    expect(orCreateRes.statusCode).toBe(201);
    const orSegmentId = JSON.parse(orCreateRes.payload).segment.id;

    const orMembersRes = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/segments/${orSegmentId}/members`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(orMembersRes.statusCode).toBe(200);
    const orMembersBody = JSON.parse(orMembersRes.payload);
    expect(orMembersBody.totalCount).toBe(2);
    const orMemberIds = orMembersBody.customers.map((c: { id: string }) => c.id).sort();
    expect(orMemberIds).toEqual([customer1Id, customer3Id].sort());

    // 4. Test Compound AND: non-cash purchasers (payment.hasCashPurchase is_false) AND humanities major
    // Matches only customer3 (customer 2 has no cash purchase but is experimental major)
    const andRules = [
      { field: "payment.hasCashPurchase", operator: "is_false", value: false },
      { field: "user.major", operator: "equals", value: "humanities" },
    ];
    const andCreateRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/segments",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "بدون خرید نقدی و رشته علوم انسانی",
        filterRules: andRules,
        matchOperator: "and",
      },
    });
    expect(andCreateRes.statusCode).toBe(201);
    const andSegmentId = JSON.parse(andCreateRes.payload).segment.id;

    const andMembersRes = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/segments/${andSegmentId}/members`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(andMembersRes.statusCode).toBe(200);
    const andMembersBody = JSON.parse(andMembersRes.payload);
    expect(andMembersBody.totalCount).toBe(1);
    expect(andMembersBody.customers[0].id).toBe(customer3Id);

    // 5. Multi-tag test: crm.tag not_equals vipTagId
    // customer 1 has both vipTagId and activeTagId, so customer 1 must be excluded.
    // customers 2 and 3 do not have vipTagId, so they must be included.
    const notVipRules = [
      { field: "crm.tag", operator: "not_equals", value: vipTagId },
    ];
    const notVipCreateRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/segments",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "کاربران بدون تگ VIP",
        filterRules: notVipRules,
        matchOperator: "and",
      },
    });
    const notVipSegmentId = JSON.parse(notVipCreateRes.payload).segment.id;
    const notVipMembersRes = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/segments/${notVipSegmentId}/members`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    const notVipMembersBody = JSON.parse(notVipMembersRes.payload);
    const notVipMemberIds = notVipMembersBody.customers.map((c: { id: string }) => c.id).sort();
    expect(notVipMemberIds).toEqual([customer2Id, customer3Id].sort());
  });
});

