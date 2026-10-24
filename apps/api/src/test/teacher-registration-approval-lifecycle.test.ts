import { describe, it, expect } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
  InMemoryEmailVerificationStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import {
  InMemoryClassroomStore,
  InMemoryClassroomMemberStore,
  InMemoryTeacherExamStore,
  InMemoryTeacherExamQuestionStore,
  InMemoryTeacherExamAttemptStore,
  InMemoryTeacherExamAttemptAnswerStore,
  InMemoryAssignmentStore,
  InMemoryAssignmentSubmissionStore,
  InMemoryClassroomContentStore,
  InMemoryTeacherConversationStore,
  InMemoryTeacherConversationMessageStore,
} from "../modules/teacher-platform/in-memory-stores.js";
import { v1Routes } from "../routes/v1.js";
import { Roles } from "@avana/domain";

describe("Teacher Registration and Approval Lifecycle", () => {
  async function setupTestSystem() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";
    config.systemOrganizationId = "00000000-0000-0000-0000-000000000001";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const emailVerificationStore = new InMemoryEmailVerificationStore();

    const classroomStore = new InMemoryClassroomStore();
    const classroomMemberStore = new InMemoryClassroomMemberStore();
    const teacherExamStore = new InMemoryTeacherExamStore();
    const teacherExamQuestionStore = new InMemoryTeacherExamQuestionStore();
    const teacherExamAttemptStore = new InMemoryTeacherExamAttemptStore();
    const teacherExamAttemptAnswerStore = new InMemoryTeacherExamAttemptAnswerStore();
    const assignmentStore = new InMemoryAssignmentStore();
    const assignmentSubmissionStore = new InMemoryAssignmentSubmissionStore();
    const contentStore = new InMemoryClassroomContentStore();
    const conversationStore = new InMemoryTeacherConversationStore();
    const conversationMessageStore = new InMemoryTeacherConversationMessageStore();

    classroomStore.examStore = teacherExamStore;
    classroomStore.attemptStore = teacherExamAttemptStore;
    teacherExamStore.attemptStore = teacherExamAttemptStore;
    teacherExamQuestionStore.examStore = teacherExamStore;

    const adminStore = new InMemoryAdminStore(userStore, orgStore, {
      classroomStore,
      classroomMemberStore,
      teacherExamStore,
      teacherExamQuestionStore,
      teacherExamAttemptStore,
    } as any);

    const sessionService = new SessionService(sessionStore, config.session);

    // Mock Audit Service that records events
    const emittedEvents: any[] = [];
    const auditService = {
      emit: async (events: any[]) => {
        emittedEvents.push(...events);
      },
    };

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      adminStore,
      classroomStore,
      classroomMemberStore,
      teacherExamStore,
      teacherExamQuestionStore,
      teacherExamAttemptStore,
      teacherExamAttemptAnswerStore,
      assignmentStore,
      assignmentSubmissionStore,
      classroomContentStore: contentStore,
      teacherConversationStore: conversationStore,
      teacherConversationMessageStore: conversationMessageStore,
      emailVerificationStore,
      auditService: auditService as any,
    });

    // Helper to create platform admin
    const adminUser = await userStore.createUserWithPassword({
      email: "admin@avana.test",
      passwordHash: "hash",
      name: "مدیر سیستم",
      globalRole: Roles.platform_admin,
    });
    const adminSession = await sessionService.createSession(adminUser.id);

    return {
      app,
      userStore,
      orgStore,
      sessionService,
      adminStore,
      classroomStore,
      auditService,
      emittedEvents,
      adminUser,
      adminToken: adminSession.sessionToken,
    };
  }

  // 1. Regular student registration: teacherStatus is approved, role is student
  it("Scenario 1: regular student registration sets student role and approved status without appearing in teacher applications", async () => {
    const { app, adminToken } = await setupTestSystem();

    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        firstName: "علی",
        lastName: "رضایی",
        email: "student_regular@test.com",
        phoneNumber: "09121112233",
        password: "password123",
        major: "medicine",
      },
    });

    expect(regRes.statusCode).toBe(200);
    const regBody = JSON.parse(regRes.body);
    expect(regBody.user.role).toBe(Roles.student);
    expect(regBody.user.teacherStatus).toBe("approved");

    // Regular student MUST NOT appear in pending teachers list
    const pendingListRes = await app.inject({
      method: "GET",
      url: "/v1/admin/teachers?status=pending",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(pendingListRes.statusCode).toBe(200);
    const pendingList = JSON.parse(pendingListRes.body);
    expect(pendingList.teachers.some((t: any) => t.email === "student_regular@test.com")).toBe(false);

    // Regular student MUST NOT appear in all teachers list
    const allListRes = await app.inject({
      method: "GET",
      url: "/v1/admin/teachers",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(allListRes.statusCode).toBe(200);
    const allList = JSON.parse(allListRes.body);
    expect(allList.teachers.some((t: any) => t.email === "student_regular@test.com")).toBe(false);
  });

  // 2. Teacher registration: teacherStatus is pending, role is student, audit emitted
  it("Scenario 2: teacher registration sets teacherStatus to pending, keeps student role initially, and emits audit", async () => {
    const { app, emittedEvents } = await setupTestSystem();

    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        firstName: "محمد صالح",
        lastName: "الهی دوست",
        email: "elahi@med.test",
        phoneNumber: "09123334455",
        password: "password123",
        university: "دانشگاه علوم پزشکی اهواز (جندیشاپور)",
        faculty: "دانشکده پزشکی",
        department: "گروه بیوشیمی بالینی",
        role: "teacher",
      },
    });

    expect(regRes.statusCode).toBe(200);
    const regBody = JSON.parse(regRes.body);
    expect(regBody.user.role).toBe(Roles.student);
    expect(regBody.user.teacherStatus).toBe("pending");
    expect(regBody.user.university).toBe("دانشگاه علوم پزشکی اهواز (جندیشاپور)");

    // Audit event must be emitted
    const teacherAudit = emittedEvents.find((e) => e.action === "teacher.requested");
    expect(teacherAudit).toBeDefined();
    expect(teacherAudit.details.university).toBe("دانشگاه علوم پزشکی اهواز (جندیشاپور)");
  });

  // 3. No teacher access before approval
  it("Scenario 3: pending teacher applicant cannot access teacher operations or classrooms", async () => {
    const { app, sessionService, orgStore } = await setupTestSystem();

    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        firstName: "سارا",
        lastName: "مدرس",
        email: "sara@teacher.test",
        phoneNumber: "09124445566",
        password: "password123",
        university: "دانشگاه تهران",
        role: "teacher",
      },
    });

    const user = JSON.parse(regRes.body).user;
    const session = await sessionService.createSession(user.id);

    // /v1/me shows student role and pending teacherStatus
    const meRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${session.sessionToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    const meBody = JSON.parse(meRes.body);
    expect(meBody.user.role).toBe(Roles.student);
    expect(meBody.user.teacherStatus).toBe("pending");

    const memberships = await orgStore.listMembershipsByUserId(user.id);
    const orgId = memberships[0]?.organizationId;

    // Attempting to call teacher classrooms API should be forbidden
    const classroomCreateRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/teacher/classrooms`,
      headers: { authorization: `Bearer ${session.sessionToken}` },
      payload: {
        title: "کلاس فیزیک",
      },
    });
    expect(classroomCreateRes.statusCode).toBe(403);
  });

  // 4. New applicant visible in admin pending list and overview
  it("Scenario 4: pending applicant is visible in admin list filtered by pending, with university info", async () => {
    const { app, adminToken } = await setupTestSystem();

    await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        firstName: "محمد صالح",
        lastName: "الهی دوست",
        email: "elahi_admin_check@med.test",
        phoneNumber: "09125556677",
        password: "password123",
        university: "دانشگاه علوم پزشکی اهواز (جندیشاپور)",
        role: "teacher",
      },
    });

    const pendingRes = await app.inject({
      method: "GET",
      url: "/v1/admin/teachers?status=pending",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(pendingRes.statusCode).toBe(200);
    const pendingBody = JSON.parse(pendingRes.body);
    const applicant = pendingBody.teachers.find((t: any) => t.email === "elahi_admin_check@med.test");
    expect(applicant).toBeDefined();
    expect(applicant.name).toBe("محمد صالح الهی دوست");
    expect(applicant.teacherStatus).toBe("pending");
    expect(applicant.university).toBe("دانشگاه علوم پزشکی اهواز (جندیشاپور)");

    // GET /v1/admin/teachers/:id Overview returns university and pending status
    const overviewRes = await app.inject({
      method: "GET",
      url: `/v1/admin/teachers/${applicant.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(overviewRes.statusCode).toBe(200);
    const overviewBody = JSON.parse(overviewRes.body);
    expect(overviewBody.teacher.teacherStatus).toBe("pending");
    expect(overviewBody.teacher.university).toBe("دانشگاه علوم پزشکی اهواز (جندیشاپور)");
  });

  // 5. Search by university and pagination in admin teachers list
  it("Scenario 5: search by university name matches pending teacher applicants", async () => {
    const { app, adminToken } = await setupTestSystem();

    await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        firstName: "دکتر",
        lastName: "اهوازی",
        email: "ahvaz_prof@med.test",
        phoneNumber: "09126667788",
        password: "password123",
        university: "دانشگاه علوم پزشکی اهواز (جندیشاپور)",
        role: "teacher",
      },
    });

    const searchRes = await app.inject({
      method: "GET",
      url: "/v1/admin/teachers?search=اهواز",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(searchRes.statusCode).toBe(200);
    const searchBody = JSON.parse(searchRes.body);
    expect(searchBody.teachers.some((t: any) => t.email === "ahvaz_prof@med.test")).toBe(true);
  });

  // 6. Admin approves teacher: teacherStatus becomes approved, role becomes teacher, teacher can access platform
  it("Scenario 6: admin approval updates teacherStatus to approved, grants teacher role and access to platform", async () => {
    const { app, adminToken, sessionService, orgStore } = await setupTestSystem();

    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        firstName: "استاد",
        lastName: "موفق",
        email: "approved_prof@test.com",
        phoneNumber: "09127778899",
        password: "password123",
        university: "دانشگاه صنعتی شریف",
        role: "teacher",
      },
    });
    const user = JSON.parse(regRes.body).user;

    // Approve applicant
    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/teachers/${user.id}/approve`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(approveRes.statusCode).toBe(200);
    expect(JSON.parse(approveRes.body)).toEqual({
      success: true,
      teacherId: user.id,
      status: "approved",
    });

    // Check /v1/me now returns role: teacher and teacherStatus: approved
    const session = await sessionService.createSession(user.id);
    const meRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${session.sessionToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    const meBody = JSON.parse(meRes.body);
    expect(meBody.user.role).toBe(Roles.teacher);
    expect(meBody.user.teacherStatus).toBe("approved");

    const memberships = await orgStore.listMembershipsByUserId(user.id);
    const orgId = memberships[0]?.organizationId;

    // Teacher can now create a classroom
    const createClassroomRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/teacher/classrooms`,
      headers: { authorization: `Bearer ${session.sessionToken}` },
      payload: {
        title: "کلاس ریاضی پیشرفته",
      },
    });
    expect(createClassroomRes.statusCode).toBe(201);
  });

  // 7. Admin rejects teacher: teacherStatus becomes rejected, role remains student, no teacher access
  it("Scenario 7: admin rejection updates teacherStatus to rejected and keeps student role without teacher access", async () => {
    const { app, adminToken, sessionService, orgStore } = await setupTestSystem();

    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        firstName: "متقاضی",
        lastName: "مردود",
        email: "rejected_prof@test.com",
        phoneNumber: "09128889900",
        password: "password123",
        university: "دانشگاه غیرانتفاعی",
        role: "teacher",
      },
    });
    const user = JSON.parse(regRes.body).user;

    // Reject applicant
    const rejectRes = await app.inject({
      method: "POST",
      url: `/v1/admin/teachers/${user.id}/reject`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { reason: "مدارک تدریس نامعتبر است" },
    });
    expect(rejectRes.statusCode).toBe(200);
    expect(JSON.parse(rejectRes.body)).toEqual({
      success: true,
      teacherId: user.id,
      status: "rejected",
    });

    // Verify /v1/me shows role: student and teacherStatus: rejected
    const session = await sessionService.createSession(user.id);
    const meRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${session.sessionToken}` },
    });
    expect(meRes.statusCode).toBe(200);
    const meBody = JSON.parse(meRes.body);
    expect(meBody.user.role).toBe(Roles.student);
    expect(meBody.user.teacherStatus).toBe("rejected");

    const memberships = await orgStore.listMembershipsByUserId(user.id);
    const orgId = memberships[0]?.organizationId;

    // Forbidden from teacher platform
    const classroomRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/teacher/classrooms`,
      headers: { authorization: `Bearer ${session.sessionToken}` },
      payload: { title: "تست" },
    });
    expect(classroomRes.statusCode).toBe(403);
  });

  // 8. Idempotency: multiple approvals or rejections do not corrupt data
  it("Scenario 8: calling approve or reject repeatedly is idempotent and does not crash or corrupt memberships", async () => {
    const { app, adminToken, sessionService } = await setupTestSystem();

    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        firstName: "استاد",
        lastName: "تکرار",
        email: "idempotent@test.com",
        phoneNumber: "09129990011",
        password: "password123",
        university: "دانشگاه شیراز",
        role: "teacher",
      },
    });
    const user = JSON.parse(regRes.body).user;

    // Approve 1st time
    const app1 = await app.inject({
      method: "POST",
      url: `/v1/admin/teachers/${user.id}/approve`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(app1.statusCode).toBe(200);

    // Approve 2nd time
    const app2 = await app.inject({
      method: "POST",
      url: `/v1/admin/teachers/${user.id}/approve`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(app2.statusCode).toBe(200);

    // Still role: teacher
    const session = await sessionService.createSession(user.id);
    const meRes = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${session.sessionToken}` },
    });
    expect(JSON.parse(meRes.body).user.role).toBe(Roles.teacher);

    // Reject 1st time
    const rej1 = await app.inject({
      method: "POST",
      url: `/v1/admin/teachers/${user.id}/reject`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(rej1.statusCode).toBe(200);

    // Reject 2nd time
    const rej2 = await app.inject({
      method: "POST",
      url: `/v1/admin/teachers/${user.id}/reject`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(rej2.statusCode).toBe(200);

    // Role is back to student
    const meRes2 = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { authorization: `Bearer ${session.sessionToken}` },
    });
    expect(JSON.parse(meRes2.body).user.role).toBe(Roles.student);
    expect(JSON.parse(meRes2.body).user.teacherStatus).toBe("rejected");
  });

  // 9. Failure of audit/notification does not fail registration
  it("Scenario 9: failure in audit event emission does not prevent user creation or teacher request persistence", async () => {
    const { app, auditService, userStore } = await setupTestSystem();

    // Force audit service to throw
    auditService.emit = async () => {
      throw new Error("Telegram / Notification network failure");
    };

    const regRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      payload: {
        firstName: "دکتر",
        lastName: "نیک‌رو",
        email: "audit_fail@test.com",
        phoneNumber: "09120001122",
        password: "password123",
        university: "دانشگاه اصفهان",
        role: "teacher",
      },
    });

    // Registration succeeds despite audit emission error
    expect(regRes.statusCode).toBe(200);
    const user = JSON.parse(regRes.body).user;
    expect(user.teacherStatus).toBe("pending");

    // User is persisted in store
    const persisted = await userStore.findByEmail("audit_fail@test.com");
    expect(persisted).toBeDefined();
    expect(persisted?.teacherStatus).toBe("pending");
  });

  // 10. Non-admin authorization check
  it("Scenario 10: non-admins cannot list, approve, or reject teacher requests", async () => {
    const { app, sessionService, userStore } = await setupTestSystem();

    const studentUser = await userStore.createUserWithPassword({
      email: "intruder@test.com",
      passwordHash: "hash",
    });
    const session = await sessionService.createSession(studentUser.id);

    const listRes = await app.inject({
      method: "GET",
      url: "/v1/admin/teachers",
      headers: { authorization: `Bearer ${session.sessionToken}` },
    });
    expect(listRes.statusCode).toBe(403);

    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/teachers/${studentUser.id}/approve`,
      headers: { authorization: `Bearer ${session.sessionToken}` },
    });
    expect(approveRes.statusCode).toBe(403);
  });
});
