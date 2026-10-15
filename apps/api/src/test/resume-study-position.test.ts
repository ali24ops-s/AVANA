/**
 * Backend integration test suite: Resume Study Position from last studied session.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import {
  InMemoryStudySessionStore,
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
} from "../modules/study/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import {
  type CourseId,
  type ModuleId,
  type LessonId,
  type OrganizationId,
  type UserId,
  Roles,
} from "@avana/domain";
import { randomUUID } from "node:crypto";

function makeTestConfig() {
  process.env.NODE_ENV = "test";
  process.env.AVANA_API_PORT = "0";
  return loadApiConfig();
}

function extractSessionToken(res: {
  cookies: Array<{ name: string; value: string }>;
}): string | undefined {
  const cookie = res.cookies.find((c) => c.name === "avana_session");
  return cookie?.value;
}

describe("Resume Study Position API", () => {
  let config: ReturnType<typeof loadApiConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let orgStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let studySessionStore: InMemoryStudySessionStore;
  let auditStore: InMemoryAuditStore;
  let auditService: AuditService;

  beforeEach(() => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    orgStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore(quizStore);
    studySessionStore = new InMemoryStudySessionStore();
    auditStore = new InMemoryAuditStore();
    auditService = new AuditService(auditStore);
  });

  async function buildTestApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore: orgStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      flashcardStore,
      flashcardReviewStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      studySessionStore,
      auditService,
    });
    return app;
  }

  async function signIn(
    app: Awaited<ReturnType<typeof buildTestApp>>,
    email: string,
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/v1/auth/sign-in",
      payload: { email, name: email.split("@")[0] },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      user: { id: string; email: string; role: string };
    };
    return {
      token: extractSessionToken(res)!,
      userId: body.user.id as UserId,
      email: body.user.email,
    };
  }

  async function createOrg(
    app: Awaited<ReturnType<typeof buildTestApp>>,
    token: string,
    name: string,
  ): Promise<OrganizationId> {
    const res = await app.inject({
      method: "POST",
      url: "/v1/organizations",
      cookies: { avana_session: token },
      payload: { name },
    });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as { organization: { id: string } };
    return body.organization.id as OrganizationId;
  }

  async function setupCourseWithModules(
    app: Awaited<ReturnType<typeof buildTestApp>>,
    token: string,
    orgId: OrganizationId,
    courseTitle: string,
  ) {
    const courseRes = await app.inject({
      method: "POST",
      url: `/v1/organizations/${orgId}/courses`,
      cookies: { avana_session: token },
      payload: {
        title: courseTitle,
        subject: "Science",
        exam_at: null,
      },
    });
    expect(courseRes.statusCode).toBe(201);
    const courseBody = JSON.parse(courseRes.body) as { course: { id: string } };
    const courseId = courseBody.course.id as CourseId;

    const now = new Date().toISOString();
    const mod1Id = randomUUID() as ModuleId;
    const mod2Id = randomUUID() as ModuleId;
    const mod3Id = randomUUID() as ModuleId;

    moduleStore.insert({
      id: mod1Id,
      courseId,
      title: "Module 1",
      description: null,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    moduleStore.insert({
      id: mod2Id,
      courseId,
      title: "Module 2",
      description: null,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    moduleStore.insert({
      id: mod3Id,
      courseId,
      title: "Module 3",
      description: null,
      sortOrder: 3,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const lesson1Mod1 = randomUUID() as LessonId;
    const lesson2Mod1 = randomUUID() as LessonId;
    const lesson1Mod2 = randomUUID() as LessonId;
    const lesson1Mod3 = randomUUID() as LessonId;

    lessonStore.insert({
      id: lesson1Mod1,
      moduleId: mod1Id,
      title: "Lesson 1-1",
      contentType: "markdown",
      contentMarkdown: "# Lesson 1-1",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published" as const,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    lessonStore.insert({
      id: lesson2Mod1,
      moduleId: mod1Id,
      title: "Lesson 1-2",
      contentType: "markdown",
      contentMarkdown: "# Lesson 1-2",
      sortOrder: 2,
      estimatedMinutes: 10,
      publicationStatus: "published" as const,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    lessonStore.insert({
      id: lesson1Mod2,
      moduleId: mod2Id,
      title: "Lesson 2-1",
      contentType: "markdown",
      contentMarkdown: "# Lesson 2-1",
      sortOrder: 1,
      estimatedMinutes: 15,
      publicationStatus: "published" as const,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    lessonStore.insert({
      id: lesson1Mod3,
      moduleId: mod3Id,
      title: "Lesson 3-1",
      contentType: "markdown",
      contentMarkdown: "# Lesson 3-1",
      sortOrder: 1,
      estimatedMinutes: 20,
      publicationStatus: "published" as const,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    return {
      courseId,
      mod1Id,
      mod2Id,
      mod3Id,
      lesson1Mod1,
      lesson2Mod1,
      lesson1Mod2,
      lesson1Mod3,
    };
  }

  it("returns null last_studied_lesson_id for first-time student", async () => {
    const app = await buildTestApp();
    const { token } = await signIn(app, "student1@example.com");
    const orgId = await createOrg(app, token, "Med Org 1");
    const { courseId } = await setupCourseWithModules(app, token, orgId, "Biochemistry");

    const res = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      cookies: { avana_session: token },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.progress.last_studied_lesson_id).toBeNull();
    expect(body.progress.last_studied_module_id).toBeNull();
  });

  it("returns last studied lesson and module after user starts a lesson session", async () => {
    const app = await buildTestApp();
    const { token } = await signIn(app, "student2@example.com");
    const orgId = await createOrg(app, token, "Med Org 2");
    const { courseId, mod1Id, lesson2Mod1 } = await setupCourseWithModules(
      app,
      token,
      orgId,
      "Pathology",
    );

    // User starts studying Lesson 1-2
    const startRes = await app.inject({
      method: "POST",
      url: "/v1/study-sessions/start",
      cookies: { avana_session: token },
      payload: {
        activityType: "lesson",
        courseId,
        moduleId: mod1Id,
        lessonId: lesson2Mod1,
      },
    });
    expect(startRes.statusCode).toBe(201);

    // Fetch learn structure
    const learnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      cookies: { avana_session: token },
    });

    expect(learnRes.statusCode).toBe(200);
    const body = JSON.parse(learnRes.body);
    expect(body.progress.last_studied_lesson_id).toBe(lesson2Mod1);
    expect(body.progress.last_studied_module_id).toBe(mod1Id);
    expect(body.progress.last_studied_at).toBeDefined();

    // Verify reading a lesson did NOT mark completed = true
    const lessonData = body.modules[0].lessons.find((l: { id: string; completed: boolean }) => l.id === lesson2Mod1);
    expect(lessonData.completed).toBe(false);
    expect(body.progress.completed_lessons).toBe(0);
  });

  it("updates position correctly when user navigates from module 1 to module 3", async () => {
    const app = await buildTestApp();
    const { token } = await signIn(app, "student3@example.com");
    const orgId = await createOrg(app, token, "Med Org 3");

    const { courseId, mod1Id, mod3Id, lesson1Mod1, lesson1Mod3 } =
      await setupCourseWithModules(app, token, orgId, "Immunology");

    // Study lesson in module 1
    await app.inject({
      method: "POST",
      url: "/v1/study-sessions/start",
      cookies: { avana_session: token },
      payload: {
        activityType: "lesson",
        courseId,
        moduleId: mod1Id,
        lessonId: lesson1Mod1,
      },
    });

    // Advance to module 3
    await app.inject({
      method: "POST",
      url: "/v1/study-sessions/start",
      cookies: { avana_session: token },
      payload: {
        activityType: "lesson",
        courseId,
        moduleId: mod3Id,
        lessonId: lesson1Mod3,
      },
    });

    const learnRes = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      cookies: { avana_session: token },
    });

    const body = JSON.parse(learnRes.body);
    expect(body.progress.last_studied_lesson_id).toBe(lesson1Mod3);
    expect(body.progress.last_studied_module_id).toBe(mod3Id);
  });

  it("keeps study positions of two courses completely independent", async () => {
    const app = await buildTestApp();
    const { token } = await signIn(app, "student4@example.com");
    const orgId = await createOrg(app, token, "Med Org 4");

    const courseA = await setupCourseWithModules(app, token, orgId, "Course A");
    const courseB = await setupCourseWithModules(app, token, orgId, "Course B");

    // Study lesson in Course A
    await app.inject({
      method: "POST",
      url: "/v1/study-sessions/start",
      cookies: { avana_session: token },
      payload: {
        activityType: "lesson",
        courseId: courseA.courseId,
        moduleId: courseA.mod1Id,
        lessonId: courseA.lesson2Mod1,
      },
    });

    // Study lesson in Course B
    await app.inject({
      method: "POST",
      url: "/v1/study-sessions/start",
      cookies: { avana_session: token },
      payload: {
        activityType: "lesson",
        courseId: courseB.courseId,
        moduleId: courseB.mod3Id,
        lessonId: courseB.lesson1Mod3,
      },
    });

    // Check Course A
    const resA = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseA.courseId}/learn`,
      cookies: { avana_session: token },
    });
    const bodyA = JSON.parse(resA.body);
    expect(bodyA.progress.last_studied_lesson_id).toBe(courseA.lesson2Mod1);

    // Check Course B
    const resB = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseB.courseId}/learn`,
      cookies: { avana_session: token },
    });
    const bodyB = JSON.parse(resB.body);
    expect(bodyB.progress.last_studied_lesson_id).toBe(courseB.lesson1Mod3);
  });

  it("isolates study position between different users on the same course", async () => {
    const app = await buildTestApp();
    const user1 = await signIn(app, "user1@example.com");
    const user2 = await signIn(app, "user2@example.com");

    const orgId = await createOrg(app, user1.token, "Med Org Shared");
    // Add user 2 to same organization
    orgStore.addMembership({
      id: randomUUID(),
      userId: user2.userId,
      organizationId: orgId,
      role: Roles.student,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { courseId, mod1Id, mod2Id, lesson1Mod1, lesson1Mod2 } =
      await setupCourseWithModules(app, user1.token, orgId, "Physiology");

    // User 1 studies Lesson 1-1
    await app.inject({
      method: "POST",
      url: "/v1/study-sessions/start",
      cookies: { avana_session: user1.token },
      payload: {
        activityType: "lesson",
        courseId,
        moduleId: mod1Id,
        lessonId: lesson1Mod1,
      },
    });

    // User 2 studies Lesson 2-1
    await app.inject({
      method: "POST",
      url: "/v1/study-sessions/start",
      cookies: { avana_session: user2.token },
      payload: {
        activityType: "lesson",
        courseId,
        moduleId: mod2Id,
        lessonId: lesson1Mod2,
      },
    });

    // Verify User 1 sees lesson 1-1
    const res1 = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      cookies: { avana_session: user1.token },
    });
    expect(JSON.parse(res1.body).progress.last_studied_lesson_id).toBe(lesson1Mod1);

    // Verify User 2 sees lesson 2-1
    const res2 = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      cookies: { avana_session: user2.token },
    });
    expect(JSON.parse(res2.body).progress.last_studied_lesson_id).toBe(lesson1Mod2);
  });

  it("handles deleted or non-existent saved lesson gracefully without crashing", async () => {
    const app = await buildTestApp();
    const { token } = await signIn(app, "student5@example.com");
    const orgId = await createOrg(app, token, "Med Org 5");

    const { courseId, mod1Id, lesson2Mod1 } = await setupCourseWithModules(
      app,
      token,
      orgId,
      "Genetics",
    );

    // Study lesson 1-2
    await app.inject({
      method: "POST",
      url: "/v1/study-sessions/start",
      cookies: { avana_session: token },
      payload: {
        activityType: "lesson",
        courseId,
        moduleId: mod1Id,
        lessonId: lesson2Mod1,
      },
    });

    // Soft-delete lesson 1-2
    await lessonStore.delete(lesson2Mod1);

    // Fetch learn structure
    const res = await app.inject({
      method: "GET",
      url: `/v1/courses/${courseId}/learn`,
      cookies: { avana_session: token },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Deleted lesson must not be returned as last_studied_lesson_id
    expect(body.progress.last_studied_lesson_id).toBeNull();
  });
});
