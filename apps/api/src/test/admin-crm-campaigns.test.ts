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

describe("Admin CRM Customer Campaign Management API (Phase 3)", () => {
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

  let activeSegmentId: string;
  let inactiveSegmentId: string;
  let user1Id: string;
  let user2Id: string;
  let user3Id: string;

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

    // Seed users
    user1Id = randomUUID();
    crmStore.memoryUsers.push({
      id: user1Id,
      email: "math_user1@test.com",
      name: "دانش‌آموز ریاضی ۱",
      phoneNumber: "+989121111111",
      createdAt: new Date("2026-01-01T10:00:00Z").toISOString(),
      deletedAt: null,
      emailVerifiedAt: new Date("2026-01-01T10:05:00Z").toISOString(),
      phoneVerifiedAt: new Date("2026-01-01T10:05:00Z").toISOString(),
      major: "math",
    });

    user2Id = randomUUID();
    crmStore.memoryUsers.push({
      id: user2Id,
      email: "math_user2@test.com",
      name: "دانش‌آموز ریاضی ۲",
      phoneNumber: "+989122222222",
      createdAt: new Date("2026-01-05T10:00:00Z").toISOString(),
      deletedAt: null,
      emailVerifiedAt: new Date("2026-01-05T10:05:00Z").toISOString(),
      phoneVerifiedAt: null,
      major: "math",
    });

    user3Id = randomUUID();
    crmStore.memoryUsers.push({
      id: user3Id,
      email: "biology_user@test.com",
      name: "دانش‌آموز تجربی",
      phoneNumber: "+989123333333",
      createdAt: new Date("2026-01-10T10:00:00Z").toISOString(),
      deletedAt: null,
      emailVerifiedAt: new Date("2026-01-10T10:05:00Z").toISOString(),
      phoneVerifiedAt: new Date("2026-01-10T10:05:00Z").toISOString(),
      major: "experimental",
    });

    // Seed Active Segment: Math students
    const seg1 = await crmStore.createSegment(
      {
        name: "دانش‌آموزان ریاضی",
        description: "تمام کاربران رشته ریاضی",
        isActive: true,
        matchOperator: "and",
        filterRules: [
          {
            field: "user.major",
            operator: "equals",
            value: "math",
          },
        ],
      },
      platformAdminId,
    );
    activeSegmentId = seg1.id;

    // Seed Inactive Segment
    const seg2 = await crmStore.createSegment(
      {
        name: "سگمنت غیرفعال",
        description: "این سگمنت آرشیو شده است",
        isActive: false,
        matchOperator: "and",
        filterRules: [],
      },
      platformAdminId,
    );
    inactiveSegmentId = seg2.id;

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

  test("Platform admin can create and manage campaign, support agent is forbidden (403)", async () => {
    const payload = {
      name: "کمپین تخفیف شب امتحان",
      description: "ارسال پیامک تخفیف به دانش‌آموزان رشته ریاضی",
      targetSegmentId: activeSegmentId,
      channel: "sms",
      messageContent: "سلام {name} عزیز، تخفیف ۵۰٪ دوره جمع‌بندی ریاضی برای شما فعال شد.",
    };

    // Support agent cannot create
    const supportRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/campaigns",
      headers: { authorization: `Bearer ${supportAgentToken}` },
      payload,
    });
    expect(supportRes.statusCode).toBe(403);

    // Platform admin creates successfully
    const adminRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/campaigns",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload,
    });
    expect(adminRes.statusCode).toBe(201);
    const body = JSON.parse(adminRes.body);
    expect(body.campaign.name).toBe("کمپین تخفیف شب امتحان");
    expect(body.campaign.status).toBe("draft");
    expect(body.campaign.channel).toBe("sms");
    expect(body.campaign.targetSegmentId).toBe(activeSegmentId);
  });

  test("Support agent can read campaigns, but cannot execute or delete", async () => {
    // Admin creates campaign
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/campaigns",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "کمپین نمونه",
        targetSegmentId: activeSegmentId,
        channel: "email",
      },
    });
    const campaignId = JSON.parse(createRes.body).campaign.id;

    // Support agent can read list
    const listRes = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/campaigns",
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.campaigns.length).toBeGreaterThan(0);

    // Support agent can view detail
    const detailRes = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/campaigns/${campaignId}`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(detailRes.statusCode).toBe(200);

    // Support agent cannot execute (403)
    const executeRes = await app.inject({
      method: "POST",
      url: `/v1/admin/crm/campaigns/${campaignId}/execute`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(executeRes.statusCode).toBe(403);

    // Support agent cannot delete (403)
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/admin/crm/campaigns/${campaignId}`,
      headers: { authorization: `Bearer ${supportAgentToken}` },
    });
    expect(deleteRes.statusCode).toBe(403);
  });

  test("Student cannot access campaigns API (403)", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/v1/admin/crm/campaigns",
      headers: { authorization: `Bearer ${studentToken}` },
    });
    expect(res.statusCode).toBe(403);
  });

  // -------------------------------------------------------------------------
  // 2. Validation & Inactive Segment Protection
  // -------------------------------------------------------------------------

  test("Rejects creating campaign with inactive or non-existent segment", async () => {
    // Inactive segment
    const inactiveRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/campaigns",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "کمپین سگمنت غیرفعال",
        targetSegmentId: inactiveSegmentId,
        channel: "telegram",
      },
    });
    expect(inactiveRes.statusCode).toBe(400);
    expect(JSON.parse(inactiveRes.body).error.message).toContain("غیرفعال است");

    // Non-existent segment
    const nonExistentRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/campaigns",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "کمپین سگمنت ناموجود",
        targetSegmentId: randomUUID(),
        channel: "email",
      },
    });
    expect(nonExistentRes.statusCode).toBe(400);
  });

  // -------------------------------------------------------------------------
  // 3. Execution: Dynamic Recipient Recalculation & Recipient Records
  // -------------------------------------------------------------------------

  test("Execution dynamically recalculates matching segment members at execution time", async () => {
    // Create draft campaign
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/campaigns",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "کمپین اطلاع‌رسانی ریاضی",
        targetSegmentId: activeSegmentId,
        channel: "sms",
        messageContent: "اطلاعیه مهم کلاس ریاضی",
      },
    });
    const campaignId = JSON.parse(createRes.body).campaign.id;

    // Execute campaign
    const execRes = await app.inject({
      method: "POST",
      url: `/v1/admin/crm/campaigns/${campaignId}/execute`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(execRes.statusCode).toBe(200);
    const execBody = JSON.parse(execRes.body);

    // Should have matched exactly 2 math students (user1 and user2), NOT biology (user3)
    expect(execBody.recipientsQueued).toBe(2);
    expect(execBody.execution.totalRecipients).toBe(2);
    expect(execBody.execution.status).toBe("running");
    expect(execBody.campaign.status).toBe("running");

    // Check recipients log
    const recipientsRes = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/campaigns/${campaignId}/recipients`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(recipientsRes.statusCode).toBe(200);
    const recBody = JSON.parse(recipientsRes.body);
    expect(recBody.totalCount).toBe(2);

    const recipientUserIds = recBody.recipients.map((r: { userId: string }) => r.userId);
    expect(recipientUserIds).toContain(user1Id);
    expect(recipientUserIds).toContain(user2Id);
    expect(recipientUserIds).not.toContain(user3Id);

    // Each recipient is queued, ready for background workers
    expect(recBody.recipients[0].status).toBe("queued");
    expect(recBody.recipients[0].channel).toBe("sms");
  });

  test("Prevent duplicate concurrent execution if already running", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/campaigns",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "کمپین همزمان",
        targetSegmentId: activeSegmentId,
        channel: "in_app",
      },
    });
    const campaignId = JSON.parse(createRes.body).campaign.id;

    // First execution succeeds
    const firstExec = await app.inject({
      method: "POST",
      url: `/v1/admin/crm/campaigns/${campaignId}/execute`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(firstExec.statusCode).toBe(200);

    // Second execution attempt while running fails with 400
    const secondExec = await app.inject({
      method: "POST",
      url: `/v1/admin/crm/campaigns/${campaignId}/execute`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(secondExec.statusCode).toBe(400);
    expect(JSON.parse(secondExec.body).error.message).toContain("در حال حاضر در حال اجرا است");
  });

  test("Execution fails if segment is deactivated after campaign was created", async () => {
    // Create draft campaign with active segment
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/campaigns",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "کمپین حساس به سگمنت",
        targetSegmentId: activeSegmentId,
        channel: "email",
      },
    });
    const campaignId = JSON.parse(createRes.body).campaign.id;

    // Now deactivate the segment
    await crmStore.updateSegment(activeSegmentId, { isActive: false });

    // Execution should refuse to run quietly
    const execRes = await app.inject({
      method: "POST",
      url: `/v1/admin/crm/campaigns/${campaignId}/execute`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(execRes.statusCode).toBe(400);
    expect(JSON.parse(execRes.body).error.message).toContain("غیرفعال است");
  });

  // -------------------------------------------------------------------------
  // 4. Lifecycle: Pause, Resume, and Cancel
  // -------------------------------------------------------------------------

  test("Admin can pause, resume, and cancel a campaign with proper state tracking", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/campaigns",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "کمپین چرخه حیات",
        targetSegmentId: activeSegmentId,
        channel: "telegram",
      },
    });
    const campaignId = JSON.parse(createRes.body).campaign.id;

    // 1. Execute
    await app.inject({
      method: "POST",
      url: `/v1/admin/crm/campaigns/${campaignId}/execute`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });

    // 2. Pause
    const pauseRes = await app.inject({
      method: "POST",
      url: `/v1/admin/crm/campaigns/${campaignId}/pause`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(pauseRes.statusCode).toBe(200);
    expect(JSON.parse(pauseRes.body).campaign.status).toBe("paused");

    // 3. Resume
    const resumeRes = await app.inject({
      method: "POST",
      url: `/v1/admin/crm/campaigns/${campaignId}/resume`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(resumeRes.statusCode).toBe(200);
    expect(JSON.parse(resumeRes.body).campaign.status).toBe("running");

    // 4. Cancel
    const cancelRes = await app.inject({
      method: "POST",
      url: `/v1/admin/crm/campaigns/${campaignId}/cancel`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(cancelRes.statusCode).toBe(200);
    expect(JSON.parse(cancelRes.body).campaign.status).toBe("cancelled");

    // Check execution history has records
    const executionsRes = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/campaigns/${campaignId}/executions`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(executionsRes.statusCode).toBe(200);
    const executions = JSON.parse(executionsRes.body).executions;
    expect(executions.length).toBe(1);
    expect(executions[0].status).toBe("cancelled");
  });

  // -------------------------------------------------------------------------
  // 5. Update and Delete
  // -------------------------------------------------------------------------

  test("Platform admin can update draft campaign and delete it", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/v1/admin/crm/campaigns",
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "پیش‌نویس اولیه",
        targetSegmentId: activeSegmentId,
        channel: "sms",
      },
    });
    const campaignId = JSON.parse(createRes.body).campaign.id;

    // Update
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/crm/campaigns/${campaignId}`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
      payload: {
        name: "عنوان ویرایش‌شده",
        channel: "email",
      },
    });
    expect(updateRes.statusCode).toBe(200);
    expect(JSON.parse(updateRes.body).campaign.name).toBe("عنوان ویرایش‌شده");
    expect(JSON.parse(updateRes.body).campaign.channel).toBe("email");

    // Delete
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/admin/crm/campaigns/${campaignId}`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(deleteRes.statusCode).toBe(200);

    // Verify gone
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/admin/crm/campaigns/${campaignId}`,
      headers: { authorization: `Bearer ${platformAdminToken}` },
    });
    expect(getRes.statusCode).toBe(404);
  });
});
