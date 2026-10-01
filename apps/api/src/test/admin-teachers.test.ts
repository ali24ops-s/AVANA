import { describe, test, expect } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import {
  InMemoryClassroomStore,
  InMemoryClassroomMemberStore,
  InMemoryTeacherExamStore,
  InMemoryTeacherExamQuestionStore,
  InMemoryTeacherExamAttemptStore,
} from "../modules/teacher-platform/in-memory-stores.js";
import { v1Routes } from "../routes/v1.js";
import { Roles, type Role, type UserId, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Admin Teacher Management API", () => {
  test("Lists teachers, filters, computes stats and returns teacher overview with classrooms and attempts", async () => {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";
    config.systemOrganizationId = "00000000-0000-0000-0000-000000000001";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);

    const classroomStore = new InMemoryClassroomStore();
    const classroomMemberStore = new InMemoryClassroomMemberStore();
    const teacherExamStore = new InMemoryTeacherExamStore();
    const teacherExamQuestionStore = new InMemoryTeacherExamQuestionStore();
    const teacherExamAttemptStore = new InMemoryTeacherExamAttemptStore();

    const adminStore = new InMemoryAdminStore(userStore, orgStore, {
      classroomStore,
      classroomMemberStore,
      teacherExamStore,
      teacherExamQuestionStore,
      teacherExamAttemptStore,
    } as any);

    const sessionService = new SessionService(sessionStore, config.session);

    async function createUserWithRole(
      email: string,
      name: string,
      role: Role,
      verified = true,
      teacherStatus: "approved" | "pending" | "rejected" = "approved",
    ) {
      const user = await userStore.createUserWithPassword({ email, passwordHash: "hash" });
      user.name = name;
      user.emailVerified = verified;
      user.teacherStatus = teacherStatus;
      if (role === Roles.platform_admin) {
        user.globalRole = role;
        user.role = role;
      } else {
        user.role = role;
      }
      userStore.insert({ ...user });

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
      return { user, sessionToken: session.sessionToken, orgId };
    }

    const platformAdmin = await createUserWithRole("admin@avana.test", "مدیر سیستم", Roles.platform_admin);
    const teacher1 = await createUserWithRole("teacher1@avana.test", "دکتر احمدی", Roles.teacher, true, "approved");
    const teacher2 = await createUserWithRole("teacher2@avana.test", "مهندس حسینی", Roles.teacher, false, "pending");
    const student1 = await createUserWithRole("student1@avana.test", "علی رضایی", Roles.student, true);
    const student2 = await createUserWithRole("student2@avana.test", "سارا محمدی", Roles.student, true);

    // Create classroom for teacher1
    const classroom1 = await classroomStore.create({
      id: randomUUID(),
      organizationId: teacher1.orgId,
      teacherId: teacher1.user.id,
      title: "شیمی آلی پیشرفته",
      description: "کلاس آموزشی مباحث واکنش‌های آلی",
      inviteCode: "CHEM101",
      status: "active",
      courseId: null,
      archivedAt: null,
    });

    const classroom2 = await classroomStore.create({
      id: randomUUID(),
      organizationId: teacher1.orgId,
      teacherId: teacher1.user.id,
      title: "شیمی عمومی ۱",
      description: "مفاهیم پایه استوکیومتری",
      inviteCode: "CHEM102",
      status: "active",
      courseId: null,
      archivedAt: null,
    });

    // Add members: student1 in both classrooms, student2 in classroom1 -> unique students = 2
    await classroomMemberStore.addMember({
      id: randomUUID(),
      classroomId: classroom1.id,
      studentId: student1.user.id,
      status: "active",
      firstJoinedAt: new Date().toISOString(),
      lastJoinedAt: new Date().toISOString(),
      leftAt: null,
    });

    await classroomMemberStore.addMember({
      id: randomUUID(),
      classroomId: classroom2.id,
      studentId: student1.user.id,
      status: "active",
      firstJoinedAt: new Date().toISOString(),
      lastJoinedAt: new Date().toISOString(),
      leftAt: null,
    });

    await classroomMemberStore.addMember({
      id: randomUUID(),
      classroomId: classroom1.id,
      studentId: student2.user.id,
      status: "active",
      firstJoinedAt: new Date().toISOString(),
      lastJoinedAt: new Date().toISOString(),
      leftAt: null,
    });

    // Create exam in classroom1
    const exam1 = await teacherExamStore.create({
      id: randomUUID(),
      classroomId: classroom1.id,
      title: "میان‌ترم شیمی آلی",
      description: "آزمون تستی مبحث آروماتیک",
      durationMinutes: 45,
      startsAt: new Date().toISOString(),
      endsAt: new Date(Date.now() + 3600000).toISOString(),
      passingScorePercentage: "60.00",
      shuffleQuestions: true,
      shuffleOptions: true,
      showResultsImmediately: true,
      allowBackNavigation: true,
      perQuestionTimeSeconds: null,
      status: "published",
      closedAt: null,
      resultsReleasedAt: null,
      archivedAt: null,
    });

    // Create question for exam1
    await teacherExamQuestionStore.create({
      id: randomUUID(),
      examId: exam1.id,
      orderIndex: 1,
      questionType: "single_choice",
      prompt: "کدام گروه عاملی قطبی‌تر است؟",
      options: [{ id: "opt1", text: "هیدروکسیل" }, { id: "opt2", text: "متیل" }],
      correctOptionId: "opt1",
      points: "10.00",
      explanation: "گروه هیدروکسیل دارای پیوند هیدروژنی است.",
    });

    // Create attempt for student1
    await teacherExamAttemptStore.create({
      id: randomUUID(),
      examId: exam1.id,
      studentId: student1.user.id,
      status: "graded",
      gradingStatus: "fully_graded",
      startedAt: new Date().toISOString(),
      deadlineAt: new Date(Date.now() + 2700000).toISOString(),
      submittedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      score: "10.00",
      maxScore: "10.00",
      percentage: "100.00",
      passed: true,
      questionSnapshot: [],
    });

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
    });

    // 1. GET /v1/admin/teachers (Authorized as platform_admin)
    const listRes = await app.inject({
      method: "GET",
      url: "/v1/admin/teachers",
      headers: {
        authorization: `Bearer ${platformAdmin.sessionToken}`,
      },
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = JSON.parse(listRes.body);
    expect(listBody.totalCount).toBe(2);
    expect(listBody.stats.totalTeachers).toBe(2);
    expect(listBody.stats.totalClassrooms).toBe(2);
    expect(listBody.stats.totalExams).toBe(1);
    expect(listBody.stats.totalStudents).toBe(2); // unique count

    const t1 = listBody.teachers.find((t: any) => t.id === teacher1.user.id);
    expect(t1).toBeDefined();
    expect(t1.name).toBe("دکتر احمدی");
    expect(t1.teacherStatus).toBe("approved");
    expect(t1.classroomsCount).toBe(2);
    expect(t1.examsCount).toBe(1);
    expect(t1.studentsCount).toBe(2); // deduplicated between classrooms

    // 2. Filter by status: approved
    const approvedRes = await app.inject({
      method: "GET",
      url: "/v1/admin/teachers?status=approved",
      headers: {
        authorization: `Bearer ${platformAdmin.sessionToken}`,
      },
    });
    expect(approvedRes.statusCode).toBe(200);
    const approvedBody = JSON.parse(approvedRes.body);
    expect(approvedBody.totalCount).toBe(1);
    expect(approvedBody.teachers[0].name).toBe("دکتر احمدی");

    // 2b. Filter by status: pending
    const pendingRes = await app.inject({
      method: "GET",
      url: "/v1/admin/teachers?status=pending",
      headers: {
        authorization: `Bearer ${platformAdmin.sessionToken}`,
      },
    });
    expect(pendingRes.statusCode).toBe(200);
    const pendingBody = JSON.parse(pendingRes.body);
    expect(pendingBody.totalCount).toBe(1);
    expect(pendingBody.teachers[0].name).toBe("مهندس حسینی");

    // 3. Search by name
    const searchRes = await app.inject({
      method: "GET",
      url: "/v1/admin/teachers?search=حسینی",
      headers: {
        authorization: `Bearer ${platformAdmin.sessionToken}`,
      },
    });
    expect(searchRes.statusCode).toBe(200);
    const searchBody = JSON.parse(searchRes.body);
    expect(searchBody.totalCount).toBe(1);
    expect(searchBody.teachers[0].name).toBe("مهندس حسینی");

    // 4. GET /v1/admin/teachers/:id Overview
    const overviewRes = await app.inject({
      method: "GET",
      url: `/v1/admin/teachers/${teacher1.user.id}`,
      headers: {
        authorization: `Bearer ${platformAdmin.sessionToken}`,
      },
    });

    expect(overviewRes.statusCode).toBe(200);
    const overviewBody = JSON.parse(overviewRes.body);
    expect(overviewBody.teacher.name).toBe("دکتر احمدی");
    expect(overviewBody.stats.classroomsCount).toBe(2);
    expect(overviewBody.stats.examsCount).toBe(1);
    expect(overviewBody.stats.studentsCount).toBe(2);
    expect(overviewBody.stats.attemptsCount).toBe(1);

    expect(overviewBody.classrooms).toHaveLength(2);
    expect(overviewBody.classrooms[0].title).toBe("شیمی آلی پیشرفته");

    expect(overviewBody.exams).toHaveLength(1);
    expect(overviewBody.exams[0].title).toBe("میان‌ترم شیمی آلی");
    expect(overviewBody.exams[0].averageScore).toBe(100);

    expect(overviewBody.recentActivity).toHaveLength(1);
    expect(overviewBody.recentActivity[0].studentName).toBe("علی رضایی");
    expect(overviewBody.recentActivity[0].percentage).toBe(100);
    expect(overviewBody.recentActivity[0].passed).toBe(true);

    // 5. GET /v1/admin/teachers/:id Overview for teacher with 0 classrooms (teacher2)
    const teacher2Res = await app.inject({
      method: "GET",
      url: `/v1/admin/teachers/${teacher2.user.id}`,
      headers: {
        authorization: `Bearer ${platformAdmin.sessionToken}`,
      },
    });

    expect(teacher2Res.statusCode).toBe(200);
    const teacher2Body = JSON.parse(teacher2Res.body);
    expect(teacher2Body.teacher.name).toBe("مهندس حسینی");
    expect(teacher2Body.teacher.emailVerified).toBe(false);
    expect(teacher2Body.stats.classroomsCount).toBe(0);
    expect(teacher2Body.stats.examsCount).toBe(0);
    expect(teacher2Body.stats.studentsCount).toBe(0);
    expect(teacher2Body.stats.attemptsCount).toBe(0);
    expect(teacher2Body.classrooms).toEqual([]);
    expect(teacher2Body.exams).toEqual([]);
    expect(teacher2Body.recentActivity).toEqual([]);

    // 6. Authorization checks
    // Student role denied
    const studentRes = await app.inject({
      method: "GET",
      url: "/v1/admin/teachers",
      headers: {
        authorization: `Bearer ${student1.sessionToken}`,
      },
    });
    expect(studentRes.statusCode).toBe(403);

    // Teacher role denied from Admin API
    const teacherDeniedRes = await app.inject({
      method: "GET",
      url: "/v1/admin/teachers",
      headers: {
        authorization: `Bearer ${teacher1.sessionToken}`,
      },
    });
    expect(teacherDeniedRes.statusCode).toBe(403);

    // Unauthenticated denied
    const unauthRes = await app.inject({
      method: "GET",
      url: "/v1/admin/teachers",
    });
    expect(unauthRes.statusCode).toBe(401);

    // 7. Non-existent teacher overview -> 404
    const notFoundRes = await app.inject({
      method: "GET",
      url: `/v1/admin/teachers/${randomUUID()}`,
      headers: {
        authorization: `Bearer ${platformAdmin.sessionToken}`,
      },
    });
    expect(notFoundRes.statusCode).toBe(404);

    // 8. Malformed/non-existent teacher ID overview -> 404
    const invalidIdRes = await app.inject({
      method: "GET",
      url: "/v1/admin/teachers/non-existent-id-999",
      headers: {
        authorization: `Bearer ${platformAdmin.sessionToken}`,
      },
    });
    expect(invalidIdRes.statusCode).toBe(404);

    // 9. Teacher Approval / Rejection Lifecycle tests
    // 9a. Non-admin cannot approve or reject
    const nonAdminApprove = await app.inject({
      method: "POST",
      url: `/v1/admin/teachers/${teacher2.user.id}/approve`,
      headers: {
        authorization: `Bearer ${student1.sessionToken}`,
      },
    });
    expect(nonAdminApprove.statusCode).toBe(403);

    const nonAdminReject = await app.inject({
      method: "POST",
      url: `/v1/admin/teachers/${teacher2.user.id}/reject`,
      headers: {
        authorization: `Bearer ${teacher1.sessionToken}`,
      },
    });
    expect(nonAdminReject.statusCode).toBe(403);

    // 9b. Reject teacher2 with reason
    const rejectRes = await app.inject({
      method: "POST",
      url: `/v1/admin/teachers/${teacher2.user.id}/reject`,
      headers: {
        authorization: `Bearer ${platformAdmin.sessionToken}`,
      },
      payload: {
        reason: "مدارک تدریس ناقص است",
      },
    });
    expect(rejectRes.statusCode).toBe(200);
    const rejectBody = JSON.parse(rejectRes.body);
    expect(rejectBody.success).toBe(true);
    expect(rejectBody.status).toBe("rejected");

    // Verify overview after rejection: teacherStatus is rejected, emailVerified is still false (independent)
    const rejectedOverviewRes = await app.inject({
      method: "GET",
      url: `/v1/admin/teachers/${teacher2.user.id}`,
      headers: {
        authorization: `Bearer ${platformAdmin.sessionToken}`,
      },
    });
    expect(rejectedOverviewRes.statusCode).toBe(200);
    const rejectedOverviewBody = JSON.parse(rejectedOverviewRes.body);
    expect(rejectedOverviewBody.teacher.teacherStatus).toBe("rejected");
    expect(rejectedOverviewBody.teacher.emailVerified).toBe(false);

    // 9c. Verify filtering by rejected status
    const listRejectedRes = await app.inject({
      method: "GET",
      url: "/v1/admin/teachers?status=rejected",
      headers: {
        authorization: `Bearer ${platformAdmin.sessionToken}`,
      },
    });
    expect(listRejectedRes.statusCode).toBe(200);
    const listRejectedBody = JSON.parse(listRejectedRes.body);
    expect(listRejectedBody.totalCount).toBe(1);
    expect(listRejectedBody.teachers[0].id).toBe(teacher2.user.id);
    expect(listRejectedBody.teachers[0].teacherStatus).toBe("rejected");

    // 9d. Approve teacher2
    const approveRes = await app.inject({
      method: "POST",
      url: `/v1/admin/teachers/${teacher2.user.id}/approve`,
      headers: {
        authorization: `Bearer ${platformAdmin.sessionToken}`,
      },
    });
    expect(approveRes.statusCode).toBe(200);
    const approveBody = JSON.parse(approveRes.body);
    expect(approveBody.success).toBe(true);
    expect(approveBody.status).toBe("approved");

    // 9e. Verify overview shows approved status and email is still not verified (decoupled)
    const approvedOverviewRes = await app.inject({
      method: "GET",
      url: `/v1/admin/teachers/${teacher2.user.id}`,
      headers: {
        authorization: `Bearer ${platformAdmin.sessionToken}`,
      },
    });
    expect(approvedOverviewRes.statusCode).toBe(200);
    const approvedOverviewBody = JSON.parse(approvedOverviewRes.body);
    expect(approvedOverviewBody.teacher.teacherStatus).toBe("approved");
    expect(approvedOverviewBody.teacher.emailVerified).toBe(false);

    // 9f. Approving/Rejecting non-existent teacher returns 404
    const notFoundApprove = await app.inject({
      method: "POST",
      url: `/v1/admin/teachers/${randomUUID()}/approve`,
      headers: {
        authorization: `Bearer ${platformAdmin.sessionToken}`,
      },
    });
    expect(notFoundApprove.statusCode).toBe(404);
  });
});
