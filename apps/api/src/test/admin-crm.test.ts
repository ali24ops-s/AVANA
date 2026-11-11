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

describe("Admin CRM & Customer Club API (Phase 1)", () => {
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
  let supportAgentId: UserId;
  let otherSupportToken: string;
  let otherSupportId: UserId;
  let studentToken: string;

  let customer1Id: string;
  let customer2Id: string;

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

    // Create actors
    const pAdmin = await createUser("admin@avana.org", Roles.platform_admin, "مدیر سیستم");
    platformAdminToken = pAdmin.sessionToken;
    platformAdminId = pAdmin.user.id as UserId;

    const sAgent = await createUser("support1@avana.org", Roles.support_agent, "پشتیبان یک");
    supportAgentToken = sAgent.sessionToken;
    supportAgentId = sAgent.user.id as UserId;

    const sAgent2 = await createUser("support2@avana.org", Roles.support_agent, "پشتیبان دو");
    otherSupportToken = sAgent2.sessionToken;
    otherSupportId = sAgent2.user.id as UserId;

    const student = await createUser("student@avana.org", Roles.student, "دانش‌آموز");
    studentToken = student.sessionToken;

    // Seed customer 1
    customer1Id = randomUUID();
    crmStore.memoryUsers.push({
      id: customer1Id,
      email: "ali@test.com",
      name: "علی رضایی",
      phoneNumber: "+989123456789",
      createdAt: new Date("2026-01-01T10:00:00Z").toISOString(),
      deletedAt: null,
      emailVerifiedAt: new Date("2026-01-01T10:05:00Z").toISOString(),
      phoneVerifiedAt: new Date("2026-01-01T10:05:00Z").toISOString(),
      globalRole: "student",
      major: "math",
      teacherStatus: "approved",
    });

    // Customer 1 payments & orders
    const order1Id = randomUUID();
    const order2Id = randomUUID();
    crmStore.memoryOrders.push(
      { id: order1Id, userId: customer1Id, status: "paid" },
      { id: order2Id, userId: customer1Id, status: "paid" },
    );
    crmStore.memoryPayments.push(
      {
        id: randomUUID(),
        userId: customer1Id,
        orderId: order1Id,
        amount: 150000,
        status: "paid",
        paidAt: new Date().toISOString(),
      },
      {
        id: randomUUID(),
        userId: customer1Id,
        orderId: order2Id,
        amount: 100000,
        status: "paid",
        paidAt: new Date().toISOString(),
      },
    );

    // Customer 1 wallet
    crmStore.memoryWallets.set(customer1Id, 50000);
    crmStore.memoryWalletTransactions.push({
      id: randomUUID(),
      userId: customer1Id,
      type: "credit",
      source: "welcome_gift",
      amount: 50000,
    });

    // Customer 1 devices & study sessions
    crmStore.memoryDevices.push({
      userId: customer1Id,
      lastSeenAt: new Date().toISOString(),
      revokedAt: null,
    });
    crmStore.memoryStudySessions.push({
      userId: customer1Id,
      lastActivityAt: new Date().toISOString(),
      durationSeconds: 3600,
    });

    // Seed customer 2
    customer2Id = randomUUID();
    crmStore.memoryUsers.push({
      id: customer2Id,
      email: "sara@test.com",
      name: "سارا احمدی",
      phoneNumber: null,
      createdAt: new Date("2026-02-01T10:00:00Z").toISOString(),
      deletedAt: null,
      emailVerifiedAt: null,
      phoneVerifiedAt: null,
      globalRole: "student",
      major: "experimental",
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
  // 1. Customer List & Search Tests
  // -------------------------------------------------------------------------

  test("Platform admin and Support agent can list customers", async () => {
    // Platform admin
    const res1 = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers",
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(res1.statusCode).toBe(200);
    const body1 = JSON.parse(res1.payload);
    expect(body1.totalCount).toBe(2);
    expect(body1.customers).toHaveLength(2);
    // Platform admin receives complete financial data
    expect(typeof body1.customers[0].totalPaidAmount).toBe("number");
    expect(typeof body1.customers[0].successfulOrdersCount).toBe("number");

    // Support agent receives list without any financial fields (omitted, not fake 0)
    const res2 = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers",
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(res2.statusCode).toBe(200);
    const body2 = JSON.parse(res2.payload);
    expect(body2.totalCount).toBe(2);
    expect(body2.customers[0].totalPaidAmount).toBeUndefined();
    expect(body2.customers[0].successfulOrdersCount).toBeUndefined();
    expect(body2.customers[1].totalPaidAmount).toBeUndefined();
    expect(body2.customers[1].successfulOrdersCount).toBeUndefined();
  });

  test("Filter customers by search keyword (name / email / phone)", async () => {
    const resName = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers?search=علی",
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    const bodyName = JSON.parse(resName.payload);
    expect(bodyName.totalCount).toBe(1);
    expect(bodyName.customers[0].name).toBe("علی رضایی");

    const resEmail = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers?search=sara@test.com",
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    const bodyEmail = JSON.parse(resEmail.payload);
    expect(bodyEmail.totalCount).toBe(1);
    expect(bodyEmail.customers[0].name).toBe("سارا احمدی");
  });

  test("Filter customers by verification status and purchase status", async () => {
    // Only verified
    const resVerified = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers?verifiedStatus=verified",
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    const bodyVerified = JSON.parse(resVerified.payload);
    expect(bodyVerified.totalCount).toBe(1);
    expect(bodyVerified.customers[0].id).toBe(customer1Id);

    // Only unverified
    const resUnverified = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers?verifiedStatus=unverified",
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    const bodyUnverified = JSON.parse(resUnverified.payload);
    expect(bodyUnverified.totalCount).toBe(1);
    expect(bodyUnverified.customers[0].id).toBe(customer2Id);

    // Has purchases = true
    const resPurchased = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers?hasPurchases=true",
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    const bodyPurchased = JSON.parse(resPurchased.payload);
    expect(bodyPurchased.totalCount).toBe(1);
    expect(bodyPurchased.customers[0].id).toBe(customer1Id);

    // Min spent > 300,000 -> 0 results
    const resMinSpent = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers?minSpent=300000",
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    const bodyMinSpent = JSON.parse(resMinSpent.payload);
    expect(bodyMinSpent.totalCount).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 2. Customer 360 Profile Tests
  // -------------------------------------------------------------------------

  test("Retrieve 360-degree profile for customer with complete data separation and role-based masking", async () => {
    // 1. Platform admin gets full profile including financial summary
    const resAdmin = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/customers/${customer1Id}/360`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(resAdmin.statusCode).toBe(200);
    const bodyAdmin = JSON.parse(resAdmin.payload);
    const adminProfile = bodyAdmin.profile;

    expect(adminProfile.identity.id).toBe(customer1Id);
    expect(adminProfile.identity.name).toBe("علی رضایی");
    expect(adminProfile.identity.phoneNumber).toBe("+989123456789");
    expect(adminProfile.identity.activeDevicesCount).toBe(1);

    // Fiat payments separation from wallet for platform_admin
    expect(adminProfile.financial).toBeDefined();
    expect(adminProfile.financial.totalPaidAmount).toBe(250000);
    expect(adminProfile.financial.successfulOrdersCount).toBe(2);
    expect(adminProfile.financial.walletBalance).toBe(50000);
    expect(adminProfile.financial.totalGiftCredits).toBe(50000);

    // 2. Support agent gets profile WITHOUT financial summary (property omitted entirely)
    const resSupport = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/customers/${customer1Id}/360`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(resSupport.statusCode).toBe(200);
    const bodySupport = JSON.parse(resSupport.payload);
    const supportProfile = bodySupport.profile;

    expect(supportProfile.identity.id).toBe(customer1Id);
    expect(supportProfile.identity.name).toBe("علی رضایی");
    expect(supportProfile.education.totalStudyTimeSeconds).toBe(3600);
    expect(supportProfile.tags).toBeDefined();
    expect(supportProfile.notes).toBeDefined();
    expect(supportProfile.financial).toBeUndefined();
    expect("financial" in supportProfile).toBe(false);
  });

  test("Return 404 for nonexistent customer 360 profile", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/customers/${randomUUID()}/360`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(res.statusCode).toBe(404);
  });

  // -------------------------------------------------------------------------
  // 3. CRM Tags Management Tests
  // -------------------------------------------------------------------------

  test("Tags CRUD: Only platform_admin can create/delete/attach/detach tags; support_agent has read-only access", async () => {
    // 1. Support agent tries to create tag -> Forbidden (403)
    const resCreateForbidden = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/tags",
      headers: { authorization: `Bearer ${supportAgentToken}` },
      payload: { name: "VIP", color: "#e11d48", description: "مشتری طلایی" },
    });
    expect(resCreateForbidden.statusCode).toBe(403);

    // 2. Platform admin creates tag -> Success (201)
    const resCreate = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/tags",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: { name: "VIP", color: "#e11d48", description: "مشتری طلایی" },
    });
    expect(resCreate.statusCode).toBe(201);
    const createdTag = JSON.parse(resCreate.payload).tag;
    expect(createdTag.name).toBe("VIP");
    expect(createdTag.color).toBe("#e11d48");

    // 3. List tags (both support_agent and platform_admin can read)
    const resList = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/tags",
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(resList.statusCode).toBe(200);
    const tags = JSON.parse(resList.payload).tags;
    expect(tags).toHaveLength(1);

    // 4. Support agent tries to attach tag to customer1 -> Forbidden (403)
    const resAttachForbidden = await app.inject({
      method: "POST",
      url: `/v1/admin/crm/customers/${customer1Id}/tags`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
      payload: { tagId: createdTag.id },
    });
    expect(resAttachForbidden.statusCode).toBe(403);

    // 5. Platform admin attaches tag to customer1 -> Success (200)
    const resAttachAdmin = await app.inject({
      method: "POST",
      url: `/v1/admin/crm/customers/${customer1Id}/tags`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: { tagId: createdTag.id },
    });
    expect(resAttachAdmin.statusCode).toBe(200);

    // Verify tag is in customer1's 360 profile (read-only viewable by support agent)
    const res360 = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/customers/${customer1Id}/360`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    const profileTags = JSON.parse(res360.payload).profile.tags;
    expect(profileTags).toHaveLength(1);
    expect(profileTags[0].id).toBe(createdTag.id);

    // 6. Support agent tries to detach tag from customer1 -> Forbidden (403)
    const resDetachForbidden = await app.inject({
      method: "DELETE",
      url: `/v1/admin/crm/customers/${customer1Id}/tags/${createdTag.id}`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(resDetachForbidden.statusCode).toBe(403);

    // 7. Platform admin detaches tag from customer1 -> Success (200)
    const resDetachAdmin = await app.inject({
      method: "DELETE",
      url: `/v1/admin/crm/customers/${customer1Id}/tags/${createdTag.id}`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(resDetachAdmin.statusCode).toBe(200);

    // 8. Support agent tries to delete tag definition -> Forbidden (403)
    const resDelForbidden = await app.inject({
      method: "DELETE",
      url: `/v1/admin/crm/tags/${createdTag.id}`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(resDelForbidden.statusCode).toBe(403);

    // 7. Platform admin deletes tag definition -> Success (200)
    const resDel = await app.inject({
      method: "DELETE",
      url: `/v1/admin/crm/tags/${createdTag.id}`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(resDel.statusCode).toBe(200);
  });

  // -------------------------------------------------------------------------
  // 4. CRM Customer Notes Tests
  // -------------------------------------------------------------------------

  test("Notes CRUD: Authors and platform_admin can edit/delete; support agent cannot edit other's note", async () => {
    // 1. Support Agent 1 creates a note
    const resCreateNote1 = await app.inject({
      method: "POST",
      url: `/v1/admin/crm/customers/${customer1Id}/notes`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
      payload: { content: "تماس تلفنی برقرار شد و نیاز به راهنمایی داشت.", isPinned: false },
    });
    expect(resCreateNote1.statusCode).toBe(201);
    const note1 = JSON.parse(resCreateNote1.payload).note;
    expect(note1.authorId).toBe(supportAgentId);
    expect(note1.content).toContain("تماس تلفنی");

    // 2. Platform Admin creates a pinned note
    const resCreateNote2 = await app.inject({
      method: "POST",
      url: `/v1/admin/crm/customers/${customer1Id}/notes`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: { content: "مشتری دارای تخفیف ویژه است.", isPinned: true },
    });
    expect(resCreateNote2.statusCode).toBe(201);
    const note2 = JSON.parse(resCreateNote2.payload).note;
    expect(note2.isPinned).toBe(true);

    // 3. List notes: Pinned note should appear FIRST
    const resListNotes = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/customers/${customer1Id}/notes`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(resListNotes.statusCode).toBe(200);
    const notes = JSON.parse(resListNotes.payload).notes;
    expect(notes).toHaveLength(2);
    expect(notes[0].id).toBe(note2.id); // Pinned note is first!

    // 4. Support Agent 2 tries to edit Support Agent 1's note -> Forbidden (403)
    const resEditForbidden = await app.inject({
      method: "PATCH",
      url: `/v1/admin/crm/customers/${customer1Id}/notes/${note1.id}`,
      headers: { authorization: `Bearer ${otherSupportToken}` },
      payload: { content: "تلاش غیرمجاز برای تغییر یادداشت دیگری" },
    });
    expect(resEditForbidden.statusCode).toBe(403);

    // 5. Support Agent 1 edits own note -> Success (200)
    const resEditOwn = await app.inject({
      method: "PATCH",
      url: `/v1/admin/crm/customers/${customer1Id}/notes/${note1.id}`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
      payload: { content: "تماس دوم برقرار شد و مشکل حل شد." },
    });
    expect(resEditOwn.statusCode).toBe(200);
    expect(JSON.parse(resEditOwn.payload).note.content).toContain("مشکل حل شد");

    // 6. Platform Admin can edit any note -> Success (200)
    const resAdminEdit = await app.inject({
      method: "PATCH",
      url: `/v1/admin/crm/customers/${customer1Id}/notes/${note1.id}`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: { isPinned: true },
    });
    expect(resAdminEdit.statusCode).toBe(200);
    expect(JSON.parse(resAdminEdit.payload).note.isPinned).toBe(true);

    // 7. Support Agent 2 tries to delete Support Agent 1's note -> Forbidden (403)
    const resDeleteForbidden = await app.inject({
      method: "DELETE",
      url: `/v1/admin/crm/customers/${customer1Id}/notes/${note1.id}`,
      headers: { authorization: `Bearer ${otherSupportToken}` },
    });
    expect(resDeleteForbidden.statusCode).toBe(403);

    // 8. Platform Admin deletes note -> Success (200)
    const resAdminDelete = await app.inject({
      method: "DELETE",
      url: `/v1/admin/crm/customers/${customer1Id}/notes/${note1.id}`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(resAdminDelete.statusCode).toBe(200);
  });

  // -------------------------------------------------------------------------
  // 5. Authentication & Authorization Security Tests
  // -------------------------------------------------------------------------

  test("Deny unauthenticated requests with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers",
    });
    expect(res.statusCode).toBe(401);
  });

  test("Deny unauthorized roles (e.g. student) with 403", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers",
      headers: { authorization: `Bearer ${studentToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 6. Security Audit & Boundary Verifications
  // -------------------------------------------------------------------------

  test("Support agent cannot access non-CRM admin routes (route boundary test)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  test("Cross-customer note mutation rejection: cannot update or delete customer 1's note using customer 2's URL", async () => {
    // 1. Create a note on customer 1
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/admin/crm/customers/${customer1Id}/notes`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: { content: "یادداشت امنیتی برای مشتری یک" },
    });
    expect(createRes.statusCode).toBe(201);
    const noteId = JSON.parse(createRes.payload).note.id;

    // 2. Try to update note using customer2's URL -> 404 Not Found
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/crm/customers/${customer2Id}/notes/${noteId}`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: { content: "تلاش غیرمجاز برای تغییر یادداشت از طریق مشتری دیگر" },
    });
    expect(updateRes.statusCode).toBe(404);

    // 3. Try to delete note using customer2's URL -> 404 Not Found
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/admin/crm/customers/${customer2Id}/notes/${noteId}`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(deleteRes.statusCode).toBe(404);
  });

  test("Invalid UUID parameters reject with 400 Bad Request", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers/invalid-uuid-123/360",
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.payload).error.message).toContain("نامعتبر");
  });

  test("Input validation: tag name and note content boundaries", async () => {
    // Empty tag name -> 400
    const resEmptyTag = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/tags",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: { name: "   " },
    });
    expect(resEmptyTag.statusCode).toBe(400);

    // Tag name > 100 chars -> 400
    const resLongTag = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/tags",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: { name: "a".repeat(101) },
    });
    expect(resLongTag.statusCode).toBe(400);

    // Empty note content -> 400
    const resEmptyNote = await app.inject({
      method: "POST",
      url: `/v1/admin/crm/customers/${customer1Id}/notes`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
      payload: { content: "   " },
    });
    expect(resEmptyNote.statusCode).toBe(400);

    // Note content > 5000 chars -> 400
    const resLongNote = await app.inject({
      method: "POST",
      url: `/v1/admin/crm/customers/${customer1Id}/notes`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
      payload: { content: "a".repeat(5001) },
    });
    expect(resLongNote.statusCode).toBe(400);
  });

  test("Internal wallet gateway payments do NOT count towards fiat totalPaidAmount or hasPurchases", async () => {
    const walletUserId = randomUUID();
    crmStore.memoryUsers.push({
      id: walletUserId,
      email: "wallet-only@test.com",
      name: "کاربر کیف پول",
      createdAt: new Date().toISOString(),
      deletedAt: null,
      emailVerifiedAt: new Date().toISOString(),
      phoneVerifiedAt: null,
    });
    // Add payment with gateway = 'wallet'
    crmStore.memoryPayments.push({
      id: randomUUID(),
      userId: walletUserId,
      orderId: randomUUID(),
      amount: 80000,
      gateway: "wallet",
      status: "paid",
      paidAt: new Date().toISOString(),
    });

    // 1. Should NOT qualify as having external purchases
    const resFilter = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers?hasPurchases=true&search=wallet-only@test.com",
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(resFilter.statusCode).toBe(200);
    const filterBody = JSON.parse(resFilter.payload);
    expect(filterBody.totalCount).toBe(0);

    // 2. In 360 profile, totalPaidAmount is 0 (tested as platform_admin)
    const res360 = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/customers/${walletUserId}/360`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(res360.statusCode).toBe(200);
    const profile = JSON.parse(res360.payload).profile;
    expect(profile.financial.totalPaidAmount).toBe(0);

    // 3. Add external fiat payment
    crmStore.memoryPayments.push({
      id: randomUUID(),
      userId: walletUserId,
      orderId: randomUUID(),
      amount: 120000,
      gateway: "zarinpal",
      status: "paid",
      paidAt: new Date().toISOString(),
    });

    // Now qualifies for hasPurchases and totalPaidAmount = 120000 (not 200000)
    const res360Updated = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/customers/${walletUserId}/360`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(JSON.parse(res360Updated.payload).profile.financial.totalPaidAmount).toBe(120000);
  });

  test("Deterministic customer sorting by totalSpent for platform_admin and neutralization for support_agent", async () => {
    // customer1 has spent 250000 and has 2 orders
    // customer2 has spent 0 and has 0 orders
    // 1. Platform admin gets ordered results
    const resSpentDesc = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers?sortBy=totalSpent&sortOrder=desc",
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(resSpentDesc.statusCode).toBe(200);
    const bodySpent = JSON.parse(resSpentDesc.payload);
    expect(bodySpent.customers[0].id).toBe(customer1Id);
    expect(bodySpent.customers[0].totalPaidAmount).toBe(250000);

    const resSpentAsc = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers?sortBy=totalSpent&sortOrder=asc",
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(resSpentAsc.statusCode).toBe(200);
    const bodySpentAsc = JSON.parse(resSpentAsc.payload);
    expect(bodySpentAsc.customers[0].id).toBe(customer2Id);

    // 2. Anti-Inferential Leakage: Support agent requesting sortBy=totalSpent is neutralized to createdAt
    const resSupportSpent = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers?sortBy=totalSpent&sortOrder=asc",
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(resSupportSpent.statusCode).toBe(200);
    const bodySupportSpent = JSON.parse(resSupportSpent.payload);
    // Financial fields are completely omitted
    expect(bodySupportSpent.customers[0].totalPaidAmount).toBeUndefined();
    expect(bodySupportSpent.customers[0].successfulOrdersCount).toBeUndefined();

    // 3. Anti-Inferential Leakage: Support agent requesting financial filters hasPurchases & minSpent are ignored
    const resSupportProbe = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/customers?minSpent=500000&hasPurchases=false",
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(resSupportProbe.statusCode).toBe(200);
    const bodySupportProbe = JSON.parse(resSupportProbe.payload);
    // For support agent, financial filters are neutralized and do not probe spending
    expect(bodySupportProbe.totalCount).toBe(2);
  });

  test("Segment members security: support_agent is blocked (403) from segments with financial rules", async () => {
    // 1. Create a segment with financial rules using platform_admin
    const resCreateFinSegment = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/segments",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "کاربران با خرید بالا",
        filterRules: [
          {
            field: "payment.totalCashSpent",
            operator: "greater_than",
            value: 100000,
          },
        ],
      },
    });
    expect(resCreateFinSegment.statusCode).toBe(201);
    const finSegmentId = JSON.parse(resCreateFinSegment.payload).segment.id;

    // 2. Support agent attempting to view members of financial segment is blocked (403 Forbidden)
    const resSupportMembers = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/segments/${finSegmentId}/members`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(resSupportMembers.statusCode).toBe(403);
    const errBody = JSON.parse(resSupportMembers.payload);
    const errMsg = errBody.error?.message || errBody.message;
    expect(errMsg).toContain("قواعد مالی");

    // 3. Platform admin can view members with full financial data
    const resAdminMembers = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/segments/${finSegmentId}/members`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(resAdminMembers.statusCode).toBe(200);
    const adminMembersBody = JSON.parse(resAdminMembers.payload);
    expect(adminMembersBody.customers.length).toBeGreaterThan(0);
    expect(typeof adminMembersBody.customers[0].totalPaidAmount).toBe("number");
  });
});
