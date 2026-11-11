import { describe, test, expect, vi } from "vitest";
import fastifyCookie from "@fastify/cookie";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { studyRoutes } from "../modules/study/study-routes.js";
import { Roles, type Role, type UserId, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";

describe("Mind Map Export — Role & Access Control Verification", () => {
  test("allows platform_admin and rejects organization_admin, course_editor, teacher, student with 403 Forbidden", async () => {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const sessionService = new SessionService(sessionStore, config.session);

    async function createUserWithRole(email: string, role: Role) {
      const isPlatform = role === Roles.platform_admin;
      const user = await userStore.createUserWithPassword({
        email,
        passwordHash: "secret",
        globalRole: isPlatform ? Roles.platform_admin : null,
      });
      if (isPlatform) {
        user.globalRole = Roles.platform_admin;
        user.role = Roles.platform_admin;
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

    const platformAdmin = await createUserWithRole("platform_admin@avana.org", Roles.platform_admin);
    const orgAdmin = await createUserWithRole("org_admin@avana.org", Roles.organization_admin);
    const courseEditor = await createUserWithRole("editor@avana.org", Roles.course_editor);
    const teacher = await createUserWithRole("teacher@avana.org", Roles.teacher);
    const student = await createUserWithRole("student@avana.org", Roles.student);

    const targetModuleId = "11111111-2222-4333-8444-555555555555";
    const targetCourseId = "99999999-8888-4777-8666-555555555555";
    const emptyModuleId = "22222222-3333-4444-8555-666666666666";

    const mockMindMapService = {
      getMindMap: vi.fn(async (_actor, moduleId) => {
        if (moduleId === targetModuleId) {
          return {
            has_mind_map: true,
            mind_map: {
              id: "mm-123",
              userId: "user-owner",
              courseId: targetCourseId,
              moduleId: targetModuleId,
              version: 1,
              status: "ready",
              payload: {
                kind: "mind_map",
                version: 1,
                sourceType: "lessons",
                sourceId: "source-1",
                updatedAt: new Date().toISOString(),
                aiBase: {
                  rootNodeId: "root",
                  generatedAt: new Date().toISOString(),
                  model: "gemini",
                  nodes: {
                    root: { id: "root", parentId: null, title: "فارماکولوژی", shortDescription: "مقدمه" },
                  },
                },
                userModifications: { deletedNodeIds: [], customNodes: {}, overrides: {} },
                userNotes: {},
              },
              costToman: 0,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
            source_available: true,
            source_type: "lessons",
          };
        }
        return { has_mind_map: false, mind_map: null, source_available: false, source_type: null };
      }),
    };

    const app = createApp({ config });
    await app.register(fastifyCookie);
    await app.register(studyRoutes, {
      sessionService,
      userStore,
      organizationStore: orgStore,
      flashcardStore: {} as any,
      flashcardReviewStore: {} as any,
      quizStore: {} as any,
      quizQuestionStore: {} as any,
      quizAttemptStore: {} as any,
      moduleStore: {} as any,
      lessonStore: {} as any,
      progressStore: {} as any,
      mindMapService: mockMindMapService as any,
    });

    // 1. platform_admin can export SVG (200 OK)
    const resSvg = await app.inject({
      method: "GET",
      url: `/v1/study/modules/${targetModuleId}/personal-summary/mind-map/export?format=svg`,
      headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(resSvg.statusCode).toBe(200);
    const bodySvg = JSON.parse(resSvg.body);
    expect(bodySvg.success).toBe(true);
    expect(bodySvg.authorized).toBe(true);
    expect(bodySvg.format).toBe("svg");
    expect(bodySvg.moduleId).toBe(targetModuleId);

    // 2. platform_admin can export HTML via course-scoped route (200 OK)
    const resHtml = await app.inject({
      method: "GET",
      url: `/v1/courses/${targetCourseId}/modules/${targetModuleId}/personal-summary/mind-map/export?format=html`,
      headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
      cookies: { avana_session: platformAdmin.sessionToken },
    });
    expect(resHtml.statusCode).toBe(200);
    const bodyHtml = JSON.parse(resHtml.body);
    expect(bodyHtml.success).toBe(true);
    expect(bodyHtml.authorized).toBe(true);
    expect(bodyHtml.format).toBe("html");
    expect(bodyHtml.courseId).toBe(targetCourseId);

    // 3. organization_admin is rejected with 403 Forbidden
    const resOrgAdmin = await app.inject({
      method: "GET",
      url: `/v1/study/modules/${targetModuleId}/personal-summary/mind-map/export?format=svg`,
      headers: { authorization: `Bearer ${orgAdmin.sessionToken}` },
      cookies: { avana_session: orgAdmin.sessionToken },
    });
    expect(resOrgAdmin.statusCode).toBe(403);
    expect(JSON.parse(resOrgAdmin.body).error.code).toBe("forbidden");

    // 4. course_editor is rejected with 403 Forbidden
    const resEditor = await app.inject({
      method: "GET",
      url: `/v1/study/modules/${targetModuleId}/personal-summary/mind-map/export?format=svg`,
      headers: { authorization: `Bearer ${courseEditor.sessionToken}` },
      cookies: { avana_session: courseEditor.sessionToken },
    });
    expect(resEditor.statusCode).toBe(403);
    expect(JSON.parse(resEditor.body).error.code).toBe("forbidden");

    // 5. teacher is rejected with 403 Forbidden
    const resTeacher = await app.inject({
      method: "GET",
      url: `/v1/study/modules/${targetModuleId}/personal-summary/mind-map/export?format=svg`,
      headers: { authorization: `Bearer ${teacher.sessionToken}` },
      cookies: { avana_session: teacher.sessionToken },
    });
    expect(resTeacher.statusCode).toBe(403);

    // 6. student is rejected with 403 Forbidden
    const resStudent = await app.inject({
      method: "GET",
      url: `/v1/study/modules/${targetModuleId}/personal-summary/mind-map/export?format=html`,
      headers: { authorization: `Bearer ${student.sessionToken}` },
      cookies: { avana_session: student.sessionToken },
    });
    expect(resStudent.statusCode).toBe(403);

    // 7. Unauthenticated request is rejected with 401 Unauthorized
    const resUnauth = await app.inject({
      method: "GET",
      url: `/v1/study/modules/${targetModuleId}/personal-summary/mind-map/export?format=svg`,
    });
    expect(resUnauth.statusCode).toBe(401);

    // 8. Invalid moduleId format returns 400 Bad Request
    const resBadModule = await app.inject({
      method: "GET",
      url: `/v1/study/modules/not-a-uuid/personal-summary/mind-map/export?format=svg`,
      headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
    });
    expect(resBadModule.statusCode).toBe(400);

    // 9. Invalid format parameter (e.g. pdf) returns 400 Bad Request
    const resBadFormat = await app.inject({
      method: "GET",
      url: `/v1/study/modules/${targetModuleId}/personal-summary/mind-map/export?format=pdf`,
      headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
    });
    expect(resBadFormat.statusCode).toBe(400);

    // 10. Nonexistent mind map returns 404 Not Found
    const resNotFound = await app.inject({
      method: "GET",
      url: `/v1/study/modules/${emptyModuleId}/personal-summary/mind-map/export?format=svg`,
      headers: { authorization: `Bearer ${platformAdmin.sessionToken}` },
    });
    expect(resNotFound.statusCode).toBe(404);
  });
});
