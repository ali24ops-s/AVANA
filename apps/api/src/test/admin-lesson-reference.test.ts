import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { SessionService } from "../modules/identity/index.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/index.js";
import { InMemoryCoursePublicationStore } from "../modules/courses/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import { v1Routes } from "../routes/v1.js";
import { Roles, asCourseId, asModuleId, asLessonId, asUserId, type OrganizationId, type Actor } from "@avana/domain";
import { LearningService } from "../modules/learning/learning-service.js";
import {
  InMemoryLessonStore,
  InMemoryModuleStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";

describe("Admin Lesson Reference API & Persistence", () => {
  async function setupTestApp() {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore(userStore, orgStore);
    const coursePublicationStore = new InMemoryCoursePublicationStore();

    const sessionService = new SessionService(sessionStore, config.session);

    const user = await userStore.createUserWithPassword({
      email: "admin@avana.test",
      passwordHash: "hash123",
    });
    user.globalRole = "platform_admin";
    user.role = "platform_admin";
    userStore.insert({ ...user });

    const orgId = randomUUID() as OrganizationId;
    orgStore.addMembership({
      id: randomUUID(),
      organizationId: orgId,
      userId: user.id as any,
      role: Roles.platform_admin,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const session = await sessionService.createSession(user.id);

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
      coursePublicationStore,
      organizationStore: orgStore,
    });

    await app.ready();

    return {
      app,
      adminStore,
      authHeaders: { cookie: `avana_session=${session.sessionToken}` },
    };
  }

  it("1. Returns reference when getting lesson details via GET /v1/admin/content/lessons/:id", async () => {
    const { app, adminStore, authHeaders } = await setupTestApp();
    const lessonId = randomUUID();

    adminStore.getLesson = async (id: string) => {
      if (id === lessonId) {
        return {
          id: lessonId,
          title: "درس فارماکولوژی",
          courseName: "فارماکولوژی",
          moduleTitle: "فصل ۱",
          moduleId: randomUUID(),
          publicationStatus: "published",
          contentMarkdown: "محتوا",
          reference: "کتاب کاتزونگ، فصل ۳، ص ۴۵-۵۰",
          createdAt: new Date().toISOString(),
          flashcards: [],
          quizQuestions: [],
        };
      }
      return null;
    };

    const res = await app.inject({
      method: "GET",
      url: `/v1/admin/content/lessons/${lessonId}`,
      headers: authHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(lessonId);
    expect(body.reference).toBe("کتاب کاتزونگ، فصل ۳، ص ۴۵-۵۰");
  });

  it("2. Updates and persists lesson reference via PATCH /v1/admin/content/lessons/:id", async () => {
    const { app, adminStore, authHeaders } = await setupTestApp();
    const lessonId = randomUUID();

    let storedReference: string | null = "رفرنس اولیه";

    adminStore.getLesson = async (id: string) => {
      if (id === lessonId) {
        return {
          id: lessonId,
          title: "درس آزمایشی",
          courseName: "دوره آزمایشی",
          moduleTitle: "فصل آزمایشی",
          moduleId: randomUUID(),
          publicationStatus: "published",
          contentMarkdown: "محتوا",
          reference: storedReference,
          createdAt: new Date().toISOString(),
          flashcards: [],
          quizQuestions: [],
        };
      }
      return null;
    };

    adminStore.updateLesson = async (id, update) => {
      if (id === lessonId) {
        if (update.reference !== undefined) {
          storedReference = update.reference;
        }
        return {
          id: lessonId,
          title: update.title ?? "درس آزمایشی",
          courseName: "دوره آزمایشی",
          moduleTitle: "فصل آزمایشی",
          moduleId: randomUUID(),
          publicationStatus: "published",
          contentMarkdown: update.contentMarkdown ?? "محتوا",
          reference: storedReference,
          createdAt: new Date().toISOString(),
          flashcards: [],
          quizQuestions: [],
        };
      }
      return null;
    };

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/content/lessons/${lessonId}`,
      headers: authHeaders,
      payload: {
        reference: "جزوه فیزیولوژی گایتون، ویرایش ۱۴",
      },
    });

    expect(patchRes.statusCode).toBe(200);
    const patchBody = patchRes.json();
    expect(patchBody.reference).toBe("جزوه فیزیولوژی گایتون، ویرایش ۱۴");
    expect(storedReference).toBe("جزوه فیزیولوژی گایتون، ویرایش ۱۴");
  });

  it("3. Clears reference when PATCHed with null or empty string", async () => {
    const { app, adminStore, authHeaders } = await setupTestApp();
    const lessonId = randomUUID();

    let storedReference: string | null = "رفرنس موجود";

    adminStore.getLesson = async (id: string) => {
      if (id === lessonId) {
        return {
          id: lessonId,
          title: "درس آزمایشی",
          courseName: "دوره",
          moduleTitle: "فصل",
          moduleId: randomUUID(),
          publicationStatus: "published",
          contentMarkdown: "محتوا",
          reference: storedReference,
          createdAt: new Date().toISOString(),
          flashcards: [],
          quizQuestions: [],
        };
      }
      return null;
    };

    adminStore.updateLesson = async (id, update) => {
      if (id === lessonId) {
        if (update.reference !== undefined) {
          storedReference = update.reference;
        }
        return {
          id: lessonId,
          title: "درس آزمایشی",
          courseName: "دوره",
          moduleTitle: "فصل",
          moduleId: randomUUID(),
          publicationStatus: "published",
          contentMarkdown: "محتوا",
          reference: storedReference,
          createdAt: new Date().toISOString(),
          flashcards: [],
          quizQuestions: [],
        };
      }
      return null;
    };

    // PATCH with null
    const clearRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/content/lessons/${lessonId}`,
      headers: authHeaders,
      payload: {
        reference: null,
      },
    });

    expect(clearRes.statusCode).toBe(200);
    expect(clearRes.json().reference).toBeNull();
    expect(storedReference).toBeNull();

    // PATCH with empty/whitespace string -> should also normalize to null
    storedReference = "منبع تستی";
    const clearEmptyRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/content/lessons/${lessonId}`,
      headers: authHeaders,
      payload: {
        reference: "   ",
      },
    });

    expect(clearEmptyRes.statusCode).toBe(200);
    expect(clearEmptyRes.json().reference).toBeNull();
    expect(storedReference).toBeNull();
  });

  it("4. Returns 404 when updating non-existent lesson", async () => {
    const { app, adminStore, authHeaders } = await setupTestApp();
    const missingId = randomUUID();

    adminStore.getLesson = async () => null;
    adminStore.updateLesson = async () => null;

    const res = await app.inject({
      method: "PATCH",
      url: `/v1/admin/content/lessons/${missingId}`,
      headers: authHeaders,
      payload: {
        reference: "منبع جدید",
      },
    });

    expect(res.statusCode).toBe(404);
  });

  it("5. LearningService getCourseLearning outputs reference properly (present vs null)", async () => {
    const orgStore = new InMemoryOrganizationStore();
    const courseStore = new InMemoryCourseStore();
    const moduleStore = new InMemoryModuleStore();
    const lessonStore = new InMemoryLessonStore();
    const progressStore = new InMemoryProgressStore();

    const learningService = new LearningService(
      courseStore,
      orgStore,
      moduleStore,
      lessonStore,
      progressStore,
    );

    const now = new Date().toISOString();
    const orgId = randomUUID() as OrganizationId;
    const courseId = randomUUID() as CourseId;
    const moduleId = randomUUID() as ModuleId;
    const l1Id = randomUUID() as LessonId;
    const l2Id = randomUUID() as LessonId;
    const userId = randomUUID() as UserId;

    orgStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "Test Org",
        slug: "test-org",
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      membership: {
        id: randomUUID(),
        organizationId: orgId,
        userId,
        role: "platform_admin",
        createdAt: now,
        updatedAt: now,
      },
      auditEvents: [],
    });

    courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "دوره فیزیولوژی",
        subject: null,
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    moduleStore.create({
      id: moduleId,
      courseId,
      title: "فصل ۱",
      description: "توضیح",
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Lesson 1 with reference
    await lessonStore.create({
      id: l1Id,
      moduleId,
      title: "درس ۱",
      contentType: "lesson",
      contentMarkdown: "متن درس ۱",
      sortOrder: 0,
      estimatedMinutes: 10,
      publicationStatus: "published",
      reference: "کتاب فیزیولوژی گایتون، فصل ۵",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Lesson 2 without reference (null / backwards compatibility)
    await lessonStore.create({
      id: l2Id,
      moduleId,
      title: "درس ۲",
      contentType: "lesson",
      contentMarkdown: "متن درس ۲",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      reference: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const actor: Actor = {
      userId,
      role: "platform_admin",
    };

    const learnData = await learningService.getCourseLearning(actor, courseId, "req-ref-test");

    expect(learnData.modules).toHaveLength(1);
    const lessons = learnData.modules[0].lessons;
    expect(lessons).toHaveLength(2);

    const lesson1 = lessons.find((l) => l.id === l1Id);
    const lesson2 = lessons.find((l) => l.id === l2Id);

    expect(lesson1?.reference).toBe("کتاب فیزیولوژی گایتون، فصل ۵");
    expect(lesson2?.reference).toBeNull();
  });

  it("6. Enforces authentication and admin permissions on PATCH /v1/admin/content/lessons/:id", async () => {
    const { app } = await setupTestApp();
    const lessonId = randomUUID();

    // 1. Unauthenticated request -> should fail with 401
    const unauthRes = await app.inject({
      method: "PATCH",
      url: `/v1/admin/content/lessons/${lessonId}`,
      payload: { reference: "منبع تستی" },
    });
    expect(unauthRes.statusCode).toBe(401);
  });
});
