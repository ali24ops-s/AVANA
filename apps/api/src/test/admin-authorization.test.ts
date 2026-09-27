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
import { v1Routes } from "../routes/v1.js";
import { Roles, type Role, type UserId, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Admin Authorization & Role Resolution", () => {
  test("Denies access to non-admin roles and allows access to platform_admin across endpoints", async () => {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";
    config.systemOrganizationId = "00000000-0000-0000-0000-000000000001";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);

    const sessionService = new SessionService(sessionStore, config.session);

    // Helper to create a user with a specific role in an organization
    async function createUserWithRole(email: string, role: Role) {
      const user = await userStore.createUserWithPassword({ email, passwordHash: "x" });
      if (role === Roles.platform_admin || role === Roles.content_worker) {
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
      return { user, sessionToken: session.sessionToken, orgId };
    }

    // 1. Create users with each role
    const student = await createUserWithRole("student@test.com", Roles.student);
    const teacher = await createUserWithRole("teacher@test.com", Roles.teacher);
    const editor = await createUserWithRole("editor@test.com", Roles.course_editor);
    const orgAdmin = await createUserWithRole("orgadmin@test.com", Roles.organization_admin);
    const support = await createUserWithRole("support@test.com", Roles.support_agent);
    const platformAdmin = await createUserWithRole("platformadmin@test.com", Roles.platform_admin);

    const executeImportCalls: Array<{ planId: string; actorId: string; organizationId: string }> = [];

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      organizationStore: orgStore,
      systemOrganizationId: "00000000-0000-0000-0000-000000000001",
      contentExportService: {
        exportContent: async () => Buffer.from("mock-zip-content"),
      } as unknown as import("../modules/export/content-export-service.js").ContentExportService,
      contentImportService: {
        validatePackage: async () => ({
          packageChecksum: "mock-sha256-checksum",
          totalEntities: 1,
          actions: [],
          warnings: [],
          errors: [],
          summary: { toCreate: 1, toUpdate: 0, toSkip: 0 },
        }),
        executeImport: async (planId: string, actorId: string, organizationId: string) => {
          executeImportCalls.push({ planId, actorId, organizationId });
          return {
            success: true,
            importedCount: 1,
            errors: [],
          };
        },
      } as unknown as import("../modules/admin/content-import-service.js").ContentImportService,
    });

    const endpoints = [
      "/v1/admin/dashboard",
      "/v1/admin/users",
      "/v1/admin/courses",
      "/v1/admin/documents",
      "/v1/admin/content/lessons",
      "/v1/admin/content/flashcards",
      "/v1/admin/content/exams",
      "/v1/admin/documents/doc-123",
      "/v1/admin/generation",
      "/v1/admin/generation/providers",
      "/v1/admin/generation/prompts",
      "/v1/admin/generation/job-123",
      "/v1/admin/system/health",
      "/v1/admin/system/integrity",
      "/v1/admin/system/logs",
      "/v1/admin/system/audit",
      "/v1/admin/analytics",
      "/v1/admin/analytics/ai",
      "/v1/admin/settings",
      "/v1/admin/settings/features",
    ];

    const mutationEndpoints: Array<{ method: "PATCH" | "POST"; url: string; payload: Record<string, unknown> }> = [
      { method: "PATCH", url: "/v1/admin/users/user-123/role", payload: { role: "teacher" } },
      { method: "PATCH", url: "/v1/admin/courses/course-123", payload: { name: "test" } },
      { method: "POST", url: "/v1/admin/documents/doc-123/retry", payload: {} },
      { method: "POST", url: "/v1/admin/generation/job-123/retry", payload: {} },
    ];

    // 1. Verify 401 for unauthenticated requests on GET and mutation endpoints
    const unauthGet = await app.inject({ method: "GET", url: "/v1/admin/dashboard" });
    expect(unauthGet.statusCode).toBe(401);

    for (const ep of mutationEndpoints) {
      const resp = await app.inject({
        method: ep.method,
        url: ep.url,
        payload: ep.payload,
      });
      expect(resp.statusCode, `Expected 401 for unauthenticated on ${ep.method} ${ep.url}`).toBe(401);
    }

    // 2. Verify 403 for non-platform_admin roles on /v1/admin/dashboard
    const nonAdminTokens = [
      { name: "student", token: student.sessionToken },
      { name: "teacher", token: teacher.sessionToken },
      { name: "course_editor", token: editor.sessionToken },
      { name: "organization_admin", token: orgAdmin.sessionToken },
      { name: "support_agent", token: support.sessionToken },
    ];

    for (const { name, token } of nonAdminTokens) {
      const resp = await app.inject({
        method: "GET",
        url: "/v1/admin/dashboard",
        cookies: { avana_session: token },
      });
      expect(resp.statusCode, `Expected 403 for ${name} on /v1/admin/dashboard`).toBe(403);
    }

    // 3. Verify 403 for student across ALL admin endpoints
    for (const ep of endpoints) {
      const resp = await app.inject({
        method: "GET",
        url: ep,
        cookies: { avana_session: student.sessionToken },
      });
      expect(resp.statusCode, `Expected 403 for student on ${ep}`).toBe(403);
    }

    for (const ep of mutationEndpoints) {
      const resp = await app.inject({
        method: ep.method,
        url: ep.url,
        payload: ep.payload,
        cookies: { avana_session: student.sessionToken },
      });
      expect(resp.statusCode, `Expected 403 for student on ${ep.method} ${ep.url}`).toBe(403);
    }

    // 4. Verify 200/404 for platform_admin on all GET endpoints
    for (const ep of endpoints) {
      const resp = await app.inject({
        method: "GET",
        url: ep,
        cookies: { avana_session: platformAdmin.sessionToken },
      });
      expect([200, 404].includes(resp.statusCode), `Expected 200/404 for platform_admin on ${ep}, got ${resp.statusCode}`).toBe(true);
    }

    // 5. Verify input validation for platform_admin mutations
    const invalidRoleRes = await app.inject({
      method: "PATCH",
      url: "/v1/admin/users/user-123/role",
      payload: { role: "superman" },
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(invalidRoleRes.statusCode).toBe(400);

    const invalidCourseRes = await app.inject({
      method: "PATCH",
      url: "/v1/admin/courses/course-123",
      payload: { invalidField: "test" },
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(invalidCourseRes.statusCode).toBe(400);

    // Case A: User is "student" in Org 1, and globalRole is "platform_admin" -> effective role is platform_admin -> ALLOW (200)
    const multiAdmin = await userStore.createUserWithPassword({ email: "multiadmin@test.com", passwordHash: "x" });
    multiAdmin.globalRole = "platform_admin";
    multiAdmin.role = "platform_admin";
    userStore.insert({ ...multiAdmin });
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: randomUUID() as OrganizationId,
      userId: multiAdmin.id as UserId,
      role: Roles.student,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const multiAdminSession = await sessionService.createSession(multiAdmin.id);

    const multiAdminRes = await app.inject({
      method: "GET",
      url: "/v1/admin/dashboard",
      cookies: { avana_session: multiAdminSession.sessionToken },
    });
    expect(multiAdminRes.statusCode).toBe(200);

    // Case B: User is "teacher" in Org 1, and "organization_admin" in Org 2 -> effective role is organization_admin -> DENY (403)
    const multiTeacher = await userStore.createUserWithPassword({ email: "multiteacher@test.com", passwordHash: "x" });
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: randomUUID() as OrganizationId,
      userId: multiTeacher.id as UserId,
      role: Roles.teacher,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: randomUUID() as OrganizationId,
      userId: multiTeacher.id as UserId,
      role: Roles.organization_admin,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const multiTeacherSession = await sessionService.createSession(multiTeacher.id);

    const multiTeacherRes = await app.inject({
      method: "GET",
      url: "/v1/admin/dashboard",
      cookies: { avana_session: multiTeacherSession.sessionToken },
    });
    expect(multiTeacherRes.statusCode).toBe(403);

    // Case C: Platform admin assigns content_worker role via PATCH /v1/admin/users/:id/role
    const targetUser = await userStore.createUserWithPassword({ email: "targetworker@test.com", passwordHash: "x" });
    const targetOrgId = randomUUID() as OrganizationId;
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: targetOrgId,
      userId: targetUser.id as UserId,
      role: Roles.student,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const setContentWorkerRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${targetUser.id}/role`,
      payload: { role: "content_worker" },
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(setContentWorkerRes.statusCode).toBe(200);
    expect(setContentWorkerRes.json()).toEqual({ success: true });

    const updatedUser = await userStore.findById(targetUser.id as UserId);
    expect(updatedUser?.globalRole).toBe("content_worker");
    expect(updatedUser?.role).toBe("content_worker");

    // Case D: Platform admin demotes content_worker back to student
    const demoteRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/users/${targetUser.id}/role`,
      payload: { role: "student" },
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(demoteRes.statusCode).toBe(200);

    const demotedUser = await userStore.findById(targetUser.id as UserId);
    expect(demotedUser?.globalRole).toBeNull();
    expect(demotedUser?.role).toBe("student");

    // Case E: Worker Separation & Role Matrix Verification
    const contentWorkerUser = await createUserWithRole("contentworker@test.com", Roles.content_worker);
    
    // content_worker is allowed on content routes
    const workerCoursesRes = await app.inject({
      method: "GET",
      url: "/v1/admin/courses",
      cookies: { avana_session: contentWorkerUser.sessionToken },
    });
    expect([200, 404].includes(workerCoursesRes.statusCode)).toBe(true);

    const workerDocsRes = await app.inject({
      method: "GET",
      url: "/v1/admin/documents",
      cookies: { avana_session: contentWorkerUser.sessionToken },
    });
    expect([200, 404].includes(workerDocsRes.statusCode)).toBe(true);

    const workerGenRes = await app.inject({
      method: "GET",
      url: "/v1/admin/generation",
      cookies: { avana_session: contentWorkerUser.sessionToken },
    });
    expect([200, 404].includes(workerGenRes.statusCode)).toBe(true);

    const workerLessonsRes = await app.inject({
      method: "GET",
      url: "/v1/admin/content/lessons",
      cookies: { avana_session: contentWorkerUser.sessionToken },
    });
    expect([200, 404].includes(workerLessonsRes.statusCode)).toBe(true);

    // content_worker is forbidden on non-content administrative routes
    const workerUsersRes = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      cookies: { avana_session: contentWorkerUser.sessionToken },
    });
    expect(workerUsersRes.statusCode).toBe(403);

    const workerSystemRes = await app.inject({
      method: "GET",
      url: "/v1/admin/system/health",
      cookies: { avana_session: contentWorkerUser.sessionToken },
    });
    expect(workerSystemRes.statusCode).toBe(403);

    const workerSettingsRes = await app.inject({
      method: "GET",
      url: "/v1/admin/settings",
      cookies: { avana_session: contentWorkerUser.sessionToken },
    });
    expect(workerSettingsRes.statusCode).toBe(403);

    // support_agent is forbidden on admin content routes
    const supportCoursesRes = await app.inject({
      method: "GET",
      url: "/v1/admin/courses",
      cookies: { avana_session: support.sessionToken },
    });
    expect(supportCoursesRes.statusCode).toBe(403);

    const supportLessonsRes = await app.inject({
      method: "GET",
      url: "/v1/admin/content/lessons",
      cookies: { avana_session: support.sessionToken },
    });
    expect(supportLessonsRes.statusCode).toBe(403);

    // teacher is forbidden on admin content routes
    const teacherCoursesRes = await app.inject({
      method: "GET",
      url: "/v1/admin/courses",
      cookies: { avana_session: teacher.sessionToken },
    });
    expect(teacherCoursesRes.statusCode).toBe(403);

    // course_editor is allowed on admin content routes but forbidden on platform admin routes
    const editorCoursesRes = await app.inject({
      method: "GET",
      url: "/v1/admin/courses",
      cookies: { avana_session: editor.sessionToken },
    });
    expect([200, 404].includes(editorCoursesRes.statusCode)).toBe(true);

    const editorUsersRes = await app.inject({
      method: "GET",
      url: "/v1/admin/users",
      cookies: { avana_session: editor.sessionToken },
    });
    expect(editorUsersRes.statusCode).toBe(403);

    // Case F: Tenant Isolation in Export / Import
    // content_worker attempting to export from a foreign organization they don't belong to -> 403 Forbidden
    const foreignOrgId = randomUUID();
    const foreignExportRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content/export",
      payload: { organizationId: foreignOrgId },
      cookies: { avana_session: contentWorkerUser.sessionToken },
    });
    expect(foreignExportRes.statusCode).toBe(403);
    expect(foreignExportRes.json().code).toBe("forbidden");

    // Case G: Context-Aware Authorization on POST /v1/admin/content/import/validate
    function buildMultipartZip(filename = "content.zip") {
      const boundary = "----avana-import-test-boundary";
      const dummyZip = Buffer.from("PK\x05\x06" + "\x00".repeat(18));
      const body = Buffer.concat([
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/zip\r\n\r\n`,
        ),
        dummyZip,
        Buffer.from(`\r\n--${boundary}--\r\n`),
      ]);
      return {
        headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
        payload: body,
      };
    }

    // 1. content_worker attempting to validate import for a foreign tenant org -> 403 Forbidden
    const workerForeignImport = buildMultipartZip();
    const workerForeignImportRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content/import/validate?organizationId=${foreignOrgId}`,
      headers: workerForeignImport.headers,
      payload: workerForeignImport.payload,
      cookies: { avana_session: contentWorkerUser.sessionToken },
    });
    expect(workerForeignImportRes.statusCode).toBe(403);
    expect(workerForeignImportRes.json().code).toBe("forbidden");

    // 2. content_worker validating import for system organization -> 200 OK
    const workerSystemImport = buildMultipartZip();
    const workerSystemImportRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content/import/validate",
      headers: workerSystemImport.headers,
      payload: workerSystemImport.payload,
      cookies: { avana_session: contentWorkerUser.sessionToken },
    });
    expect(workerSystemImportRes.statusCode).toBe(200);
    expect(workerSystemImportRes.json().success).toBe(true);

    // 3. content_worker validating import for their own member organization -> 200 OK
    const workerMemberImport = buildMultipartZip();
    const workerMemberImportRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content/import/validate?organizationId=${contentWorkerUser.orgId}`,
      headers: workerMemberImport.headers,
      payload: workerMemberImport.payload,
      cookies: { avana_session: contentWorkerUser.sessionToken },
    });
    expect(workerMemberImportRes.statusCode).toBe(200);
    expect(workerMemberImportRes.json().success).toBe(true);

    // 4. course_editor validating import for their own member organization -> 200 OK
    const editorMemberImport = buildMultipartZip();
    const editorMemberImportRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content/import/validate?organizationId=${editor.orgId}`,
      headers: editorMemberImport.headers,
      payload: editorMemberImport.payload,
      cookies: { avana_session: editor.sessionToken },
    });
    expect(editorMemberImportRes.statusCode).toBe(200);
    expect(editorMemberImportRes.json().success).toBe(true);

    // 5. course_editor attempting to validate import for foreign tenant org -> 403 Forbidden
    const editorForeignImport = buildMultipartZip();
    const editorForeignImportRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content/import/validate?organizationId=${foreignOrgId}`,
      headers: editorForeignImport.headers,
      payload: editorForeignImport.payload,
      cookies: { avana_session: editor.sessionToken },
    });
    expect(editorForeignImportRes.statusCode).toBe(403);
    expect(editorForeignImportRes.json().code).toBe("forbidden");

    // 6. Non-content roles (student, teacher, support_agent) attempting import validation -> 403 Forbidden
    for (const nonContentUser of [student, teacher, support]) {
      const nonContentImport = buildMultipartZip();
      const nonContentRes = await app.inject({
        method: "POST",
        url: `/v1/admin/content/import/validate?organizationId=${nonContentUser.orgId}`,
        headers: nonContentImport.headers,
        payload: nonContentImport.payload,
        cookies: { avana_session: nonContentUser.sessionToken },
      });
      expect(nonContentRes.statusCode).toBe(403);
      const json = nonContentRes.json();
      expect(json.code === "forbidden" || json.error?.code === "forbidden").toBe(true);
    }

    // 7. platform_admin validating import for foreign tenant org -> 200 OK
    const adminForeignImport = buildMultipartZip();
    const adminForeignImportRes = await app.inject({
      method: "POST",
      url: `/v1/admin/content/import/validate?organizationId=${foreignOrgId}`,
      headers: adminForeignImport.headers,
      payload: adminForeignImport.payload,
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(adminForeignImportRes.statusCode).toBe(200);
    expect(adminForeignImportRes.json().success).toBe(true);

    // Case H: Context-Aware Authorization & Mutation Safety on POST /v1/admin/content/import
    const initialCalls = executeImportCalls.length;

    // 1. content_worker attempting import into foreign tenant -> 403 Forbidden, 0 executions
    const workerForeignExec = await app.inject({
      method: "POST",
      url: "/v1/admin/content/import",
      payload: { planId: "plan-worker-foreign", organizationId: foreignOrgId },
      cookies: { avana_session: contentWorkerUser.sessionToken },
    });
    expect(workerForeignExec.statusCode).toBe(403);
    expect(workerForeignExec.json().code).toBe("forbidden");
    expect(executeImportCalls.length).toBe(initialCalls); // No mutation executed

    // 2. content_worker executing import on system organization -> 200 OK
    const workerSystemExec = await app.inject({
      method: "POST",
      url: "/v1/admin/content/import",
      payload: { planId: "plan-worker-sys", organizationId: "00000000-0000-0000-0000-000000000001" },
      cookies: { avana_session: contentWorkerUser.sessionToken },
    });
    expect(workerSystemExec.statusCode).toBe(200);
    expect(workerSystemExec.json().success).toBe(true);
    expect(executeImportCalls.length).toBe(initialCalls + 1);

    // 3. content_worker executing import on their own member organization -> 200 OK
    const workerMemberExec = await app.inject({
      method: "POST",
      url: "/v1/admin/content/import",
      payload: { planId: "plan-worker-member", organizationId: contentWorkerUser.orgId },
      cookies: { avana_session: contentWorkerUser.sessionToken },
    });
    expect(workerMemberExec.statusCode).toBe(200);
    expect(workerMemberExec.json().success).toBe(true);

    // 4. course_editor executing import on their own member organization -> 200 OK
    const editorMemberExec = await app.inject({
      method: "POST",
      url: "/v1/admin/content/import",
      payload: { planId: "plan-editor-member", organizationId: editor.orgId },
      cookies: { avana_session: editor.sessionToken },
    });
    expect(editorMemberExec.statusCode).toBe(200);
    expect(editorMemberExec.json().success).toBe(true);

    // 5. course_editor attempting import into foreign tenant -> 403 Forbidden
    const editorForeignExec = await app.inject({
      method: "POST",
      url: "/v1/admin/content/import",
      payload: { planId: "plan-editor-foreign", organizationId: foreignOrgId },
      cookies: { avana_session: editor.sessionToken },
    });
    expect(editorForeignExec.statusCode).toBe(403);
    expect(editorForeignExec.json().code).toBe("forbidden");

    // 6. organization_admin executing import on their own organization -> 200 OK
    const orgAdminMemberExec = await app.inject({
      method: "POST",
      url: "/v1/admin/content/import",
      payload: { planId: "plan-orgadmin-member", organizationId: orgAdmin.orgId },
      cookies: { avana_session: orgAdmin.sessionToken },
    });
    expect(orgAdminMemberExec.statusCode).toBe(200);
    expect(orgAdminMemberExec.json().success).toBe(true);

    // 7. organization_admin attempting import into foreign tenant -> 403 Forbidden
    const orgAdminForeignExec = await app.inject({
      method: "POST",
      url: "/v1/admin/content/import",
      payload: { planId: "plan-orgadmin-foreign", organizationId: foreignOrgId },
      cookies: { avana_session: orgAdmin.sessionToken },
    });
    expect(orgAdminForeignExec.statusCode).toBe(403);
    expect(orgAdminForeignExec.json().code).toBe("forbidden");

    // 8. Non-content roles (student, teacher, support_agent) attempting import execution -> 403 Forbidden
    for (const nonContentUser of [student, teacher, support]) {
      const callsBefore = executeImportCalls.length;
      const nonContentExec = await app.inject({
        method: "POST",
        url: "/v1/admin/content/import",
        payload: { planId: "plan-noncontent", organizationId: nonContentUser.orgId },
        cookies: { avana_session: nonContentUser.sessionToken },
      });
      expect(nonContentExec.statusCode).toBe(403);
      const json = nonContentExec.json();
      expect(json.code === "forbidden" || json.error?.code === "forbidden").toBe(true);
      expect(executeImportCalls.length).toBe(callsBefore); // zero mutations occurred
    }

    // 9. platform_admin executing import on foreign tenant -> 200 OK
    const adminForeignExec = await app.inject({
      method: "POST",
      url: "/v1/admin/content/import",
      payload: { planId: "plan-admin-foreign", organizationId: foreignOrgId },
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(adminForeignExec.statusCode).toBe(200);
    expect(adminForeignExec.json().success).toBe(true);

    // Case I: Multi-Org Scoping Matrix (content_worker with orgA=teacher, orgB=course_editor, orgC=none)
    const multiWorker = await userStore.createUserWithPassword({ email: "multiworker@test.com", passwordHash: "x" });
    multiWorker.globalRole = "content_worker";
    multiWorker.role = "content_worker";
    userStore.insert({ ...multiWorker });

    const orgA = randomUUID() as OrganizationId;
    const orgB = randomUUID() as OrganizationId;
    const orgC = randomUUID() as OrganizationId;

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgA,
      userId: multiWorker.id as UserId,
      role: Roles.teacher,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgB,
      userId: multiWorker.id as UserId,
      role: Roles.course_editor,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const multiWorkerSession = await sessionService.createSession(multiWorker.id);
    const multiToken = multiWorkerSession.sessionToken;

    // A. system organization -> Allowed (via globalRole content_worker)
    const sysRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content/import",
      payload: { planId: "plan-multi-sys", organizationId: "00000000-0000-0000-0000-000000000001" },
      cookies: { avana_session: multiToken },
    });
    expect(sysRes.statusCode).toBe(200);

    // B. org-B (where user is course_editor) -> Allowed
    const orgBRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content/import",
      payload: { planId: "plan-multi-b", organizationId: orgB },
      cookies: { avana_session: multiToken },
    });
    expect(orgBRes.statusCode).toBe(200);

    // C. org-A (where user is teacher) -> Denied (403 Forbidden) because teacher does not have content:write
    const orgARes = await app.inject({
      method: "POST",
      url: "/v1/admin/content/import",
      payload: { planId: "plan-multi-a", organizationId: orgA },
      cookies: { avana_session: multiToken },
    });
    expect(orgARes.statusCode).toBe(403);
    expect(orgARes.json().code).toBe("forbidden");

    // D. org-C (where user has NO membership) -> Denied (403 Forbidden)
    const orgCRes = await app.inject({
      method: "POST",
      url: "/v1/admin/content/import",
      payload: { planId: "plan-multi-c", organizationId: orgC },
      cookies: { avana_session: multiToken },
    });
    expect(orgCRes.statusCode).toBe(403);
    expect(orgCRes.json().code).toBe("forbidden");

    await app.close();
  });
});

