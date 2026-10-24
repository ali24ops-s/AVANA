import { describe, it, expect, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { v1Routes } from "../routes/v1.js";
import {
  Roles,
  type Role,
  type UserId,
  type OrganizationId,
} from "@avana/domain";
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
} from "../modules/teacher-platform/index.js";
import { randomUUID } from "node:crypto";

describe("Teacher Status & Permissions Security Regression Suite", () => {
  let app: ReturnType<typeof createApp>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let adminStore: InMemoryAdminStore;
  let sessionService: SessionService;

  let classroomStore: InMemoryClassroomStore;
  let memberStore: InMemoryClassroomMemberStore;
  let teacherExamStore: InMemoryTeacherExamStore;
  let teacherExamQuestionStore: InMemoryTeacherExamQuestionStore;
  let teacherExamAttemptStore: InMemoryTeacherExamAttemptStore;
  let teacherExamAttemptAnswerStore: InMemoryTeacherExamAttemptAnswerStore;
  let assignmentStore: InMemoryAssignmentStore;
  let assignmentSubmissionStore: InMemoryAssignmentSubmissionStore;
  let contentStore: InMemoryClassroomContentStore;
  let conversationStore: InMemoryTeacherConversationStore;
  let conversationMessageStore: InMemoryTeacherConversationMessageStore;

  const orgA = "11111111-1111-4111-8111-111111111111" as OrganizationId;
  const orgB = "22222222-2222-4222-8222-222222222222" as OrganizationId;

  async function createUser(params: {
    email: string;
    role: Role;
    globalRole?: Role | null;
    teacherStatus?: "pending" | "approved" | "rejected";
    organizationId?: OrganizationId;
  }) {
    const user = await userStore.createUserWithPassword({
      email: params.email,
      passwordHash: "hashed-pass",
      name: params.email.split("@")[0],
      globalRole: params.globalRole ?? (params.role === Roles.platform_admin ? Roles.platform_admin : null),
      teacherStatus: params.teacherStatus ?? "approved",
    });

    if (params.organizationId) {
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: params.organizationId,
        userId: user.id as UserId,
        role: params.role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    const session = await sessionService.createSession(user.id);
    return { user, sessionToken: session.sessionToken };
  }

  beforeEach(async () => {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";
    config.systemOrganizationId = orgA;

    sessionStore = new InMemorySessionStore();
    orgStore = new InMemoryOrganizationStore();
    userStore = new InMemoryUserStore(orgStore);
    adminStore = new InMemoryAdminStore(userStore, orgStore);
    sessionService = new SessionService(sessionStore, config.session);

    classroomStore = new InMemoryClassroomStore();
    memberStore = new InMemoryClassroomMemberStore();
    teacherExamStore = new InMemoryTeacherExamStore();
    teacherExamQuestionStore = new InMemoryTeacherExamQuestionStore();
    teacherExamAttemptStore = new InMemoryTeacherExamAttemptStore();
    teacherExamAttemptAnswerStore = new InMemoryTeacherExamAttemptAnswerStore();
    assignmentStore = new InMemoryAssignmentStore();
    assignmentSubmissionStore = new InMemoryAssignmentSubmissionStore();
    contentStore = new InMemoryClassroomContentStore();
    conversationStore = new InMemoryTeacherConversationStore();
    conversationMessageStore = new InMemoryTeacherConversationMessageStore();

    classroomStore.examStore = teacherExamStore;
    classroomStore.attemptStore = teacherExamAttemptStore;
    teacherExamStore.attemptStore = teacherExamAttemptStore;
    teacherExamQuestionStore.examStore = teacherExamStore;

    app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      adminStore,
      classroomStore,
      classroomMemberStore: memberStore,
      teacherExamStore,
      teacherExamQuestionStore,
      teacherExamAttemptStore,
      teacherExamAttemptAnswerStore,
      assignmentStore,
      assignmentSubmissionStore,
      classroomContentStore: contentStore,
      teacherConversationStore: conversationStore,
      teacherConversationMessageStore: conversationMessageStore,
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 1: دانشجوی عادی نمیتواند عملیات مختص استاد انجام دهد
  // -------------------------------------------------------------------------
  it("Scenario 1: Regular student cannot perform teacher-specific operations even if classroom.teacherId matches student ID", async () => {
    const student = await createUser({
      email: "student@avana.org",
      role: Roles.student,
      globalRole: "student",
      teacherStatus: "approved", // legacy default, but role is student
      organizationId: orgA,
    });

    // Create a classroom where teacherId happens to be student.id (e.g. data anomaly)
    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgA,
      teacherId: student.user.id,
      title: "Student Classroom",
      inviteCode: "STUDENT1",
      status: "active",
    });

    // 1. Cannot fetch classroom details via teacher endpoint
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/teacher/classrooms/${classroom.id}`,
      cookies: { avana_session: student.sessionToken },
    });
    expect(getRes.statusCode).toBe(404);

    // 2. Cannot create exam in classroom
    const examRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/exams`,
      cookies: { avana_session: student.sessionToken },
      payload: { title: "Illegal Exam" },
    });
    expect(examRes.statusCode).toBe(404);

    // 3. Cannot create assignment in classroom
    const assignRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/assignments`,
      cookies: { avana_session: student.sessionToken },
      payload: {
        title: "Illegal Assignment",
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    expect(assignRes.statusCode).toBe(404);

    // 4. Cannot create a new classroom as teacher
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgA}/teacher/classrooms`,
      cookies: { avana_session: student.sessionToken },
      payload: { title: "New Illegal Classroom" },
    });
    expect(createRes.statusCode).toBe(403);
  });

  // -------------------------------------------------------------------------
  // Scenario 2: استاد تأییدشده میتواند عملیات مجاز خود را انجام دهد
  // -------------------------------------------------------------------------
  it("Scenario 2: Approved teacher can perform authorized teacher operations", async () => {
    const teacher = await createUser({
      email: "teacher@avana.org",
      role: Roles.teacher,
      globalRole: "teacher",
      teacherStatus: "approved",
      organizationId: orgA,
    });

    // 1. Create classroom
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgA}/teacher/classrooms`,
      cookies: { avana_session: teacher.sessionToken },
      payload: { title: "Teacher Math 101" },
    });
    expect(createRes.statusCode).toBe(201);
    const createdClassroom = JSON.parse(createRes.body).classroom;
    expect(createdClassroom.id).toBeDefined();

    // 2. Read classroom details
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/teacher/classrooms/${createdClassroom.id}`,
      cookies: { avana_session: teacher.sessionToken },
    });
    expect(getRes.statusCode).toBe(200);

    // 3. Create exam
    const examRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${createdClassroom.id}/exams`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        title: "Midterm Exam",
        durationMinutes: 60,
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
      },
    });
    expect(examRes.statusCode).toBe(201);
  });

  // -------------------------------------------------------------------------
  // Scenario 3: استاد ردشده نمیتواند صرفاً با مالکیت قبلی کلاس، عملیات مختص استاد انجام دهد
  // -------------------------------------------------------------------------
  it("Scenario 3: Rejected teacher cannot perform teacher operations merely relying on prior classroom ownership", async () => {
    const teacher = await createUser({
      email: "revoked-teacher@avana.org",
      role: Roles.teacher,
      globalRole: "teacher",
      teacherStatus: "rejected", // Revoked / Rejected
      organizationId: orgA,
    });

    // Create a classroom previously owned by this teacher
    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgA,
      teacherId: teacher.user.id,
      title: "Former Class",
      inviteCode: "FORMER01",
      status: "active",
    });

    // 1. Cannot access classroom as teacher
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/teacher/classrooms/${classroom.id}`,
      cookies: { avana_session: teacher.sessionToken },
    });
    expect(getRes.statusCode).toBe(404);

    // 2. Cannot create exam in classroom
    const examRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/exams`,
      cookies: { avana_session: teacher.sessionToken },
      payload: { title: "Should Fail Exam" },
    });
    expect(examRes.statusCode).toBe(404);

    // 3. Cannot create assignment in classroom
    const assignRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/assignments`,
      cookies: { avana_session: teacher.sessionToken },
      payload: {
        title: "Should Fail Assignment",
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      },
    });
    expect(assignRes.statusCode).toBe(404);

    // 4. Cannot create new classroom
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgA}/teacher/classrooms`,
      cookies: { avana_session: teacher.sessionToken },
      payload: { title: "New Denied Classroom" },
    });
    expect(createRes.statusCode).toBe(403);
  });

  // -------------------------------------------------------------------------
  // Scenario 4: مدیر سازمان همچنان عملیات مدیریتی مجاز سازمان خود را انجام میدهد
  // -------------------------------------------------------------------------
  it("Scenario 4: Organization admin retains management access in their organization even if personal teacher status is rejected", async () => {
    const orgAdmin = await createUser({
      email: "orgadmin@avana.org",
      role: Roles.organization_admin,
      globalRole: "student",
      teacherStatus: "rejected", // Personal teacher approval was rejected
      organizationId: orgA,
    });

    const otherTeacher = await createUser({
      email: "faculty@avana.org",
      role: Roles.teacher,
      teacherStatus: "approved",
      organizationId: orgA,
    });

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgA,
      teacherId: otherTeacher.user.id,
      title: "Faculty Physics Class",
      inviteCode: "PHYSICS1",
      status: "active",
    });

    // 1. Org admin can read the classroom
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/teacher/classrooms/${classroom.id}`,
      cookies: { avana_session: orgAdmin.sessionToken },
    });
    expect(getRes.statusCode).toBe(200);

    // 2. Org admin can list classrooms in their organization
    const listRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgA}/teacher/classrooms`,
      cookies: { avana_session: orgAdmin.sessionToken },
    });
    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.classrooms.length).toBe(1);
    expect(listBody.classrooms[0].id).toBe(classroom.id);

    // 3. Org admin can create an exam in their organization's classroom
    const examRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroom.id}/exams`,
      cookies: { avana_session: orgAdmin.sessionToken },
      payload: {
        title: "Admin Oversight Exam",
        durationMinutes: 60,
        startsAt: new Date(Date.now() + 3600000).toISOString(),
        endsAt: new Date(Date.now() + 7200000).toISOString(),
      },
    });
    expect(examRes.statusCode).toBe(201);
  });

  // -------------------------------------------------------------------------
  // Scenario 5: مدیر سازمان به منابع سازمان دیگر دسترسی ندارد
  // -------------------------------------------------------------------------
  it("Scenario 5: Organization admin cannot access classrooms or resources belonging to another organization", async () => {
    const adminOrgA = await createUser({
      email: "adminA@orgA.com",
      role: Roles.organization_admin,
      organizationId: orgA,
    });

    const teacherB = await createUser({
      email: "teacherB@orgB.com",
      role: Roles.teacher,
      teacherStatus: "approved",
      organizationId: orgB,
    });

    const classroomInOrgB = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgB,
      teacherId: teacherB.user.id,
      title: "Org B Chemistry Class",
      inviteCode: "CHEMB001",
      status: "active",
    });

    // Admin of Org A tries to access classroom in Org B
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/teacher/classrooms/${classroomInOrgB.id}`,
      cookies: { avana_session: adminOrgA.sessionToken },
    });
    expect(getRes.statusCode).toBe(404);

    // Admin of Org A tries to create exam in Org B's classroom
    const examRes = await app.inject({
      method: "POST",
      url: `/v1/teacher/classrooms/${classroomInOrgB.id}/exams`,
      cookies: { avana_session: adminOrgA.sessionToken },
      payload: { title: "IDOR Attack Exam" },
    });
    expect(examRes.statusCode).toBe(404);
  });

  // -------------------------------------------------------------------------
  // Scenario 6: مدیر پلتفرم دسترسی مدیریتی معتبر خود را حفظ میکند
  // -------------------------------------------------------------------------
  it("Scenario 6: Platform admin retains global management access across any organization", async () => {
    const platformAdmin = await createUser({
      email: "platform-admin@avana.org",
      role: Roles.platform_admin,
      globalRole: Roles.platform_admin,
      teacherStatus: "approved",
    });

    const teacher = await createUser({
      email: "teacher@anyorg.org",
      role: Roles.teacher,
      teacherStatus: "approved",
      organizationId: orgB,
    });

    const classroom = await classroomStore.create({
      id: randomUUID(),
      organizationId: orgB,
      teacherId: teacher.user.id,
      title: "Biology 101",
      inviteCode: "BIO10101",
      status: "active",
    });

    // Platform admin accesses classroom in Org B without direct membership
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/teacher/classrooms/${classroom.id}`,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(getRes.statusCode).toBe(200);
    const body = JSON.parse(getRes.body);
    expect(body.classroom.id).toBe(classroom.id);
  });

  // -------------------------------------------------------------------------
  // Scenario 7: رد درخواست تدریس، دسترسیهای نامرتبط کاربر را ناخواسته تغییر نمیدهد
  // -------------------------------------------------------------------------
  it("Scenario 7: Rejecting teacher status does not alter unrelated roles, memberships, or student capabilities", async () => {
    const platformAdmin = await createUser({
      email: "admin@avana.org",
      role: Roles.platform_admin,
      globalRole: Roles.platform_admin,
    });

    const applicant = await createUser({
      email: "applicant@avana.org",
      role: Roles.organization_admin, // Org admin in personal/company org
      globalRole: "student",
      teacherStatus: "pending", // Applied to become a teacher
      organizationId: orgA,
    });

    // Platform admin rejects the applicant's teacher application
    const rejectRes = await app.inject({
      method: "POST",
      url: `/v1/admin/teachers/${applicant.user.id}/reject`,
      headers: {
        authorization: `Bearer ${platformAdmin.sessionToken}`,
      },
      payload: { reason: "Need more teaching certifications" },
    });
    expect(rejectRes.statusCode).toBe(200);

    // Verify user record
    const updatedUser = await userStore.findById(applicant.user.id);
    expect(updatedUser?.teacherStatus).toBe("rejected");
    // Global role remains student
    expect(updatedUser?.globalRole).toBe("student");

    // Organization membership as organization_admin is untouched!
    const memberships = await orgStore.listMembershipsByUserId(applicant.user.id);
    expect(memberships.length).toBe(1);
    expect(memberships[0].organizationId).toBe(orgA);
    expect(memberships[0].role).toBe("organization_admin");

    // Can still perform org admin management operations in Org A
    const listRes = await app.inject({
      method: "GET",
      url: `/v1/organizations/${orgA}/teacher/classrooms`,
      cookies: { avana_session: applicant.sessionToken },
    });
    expect(listRes.statusCode).toBe(200);
  });
});
