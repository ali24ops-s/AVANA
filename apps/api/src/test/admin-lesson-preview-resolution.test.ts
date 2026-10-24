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
import { v1Routes } from "../routes/v1.js";
import { Roles, asCourseId, asCoursePublicationId, asUserId, type OrganizationId } from "@avana/domain";

describe("Admin Lesson Preview Resolution & Course Submissions", () => {
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
      email: "platform-admin@test.com",
      passwordHash: "x",
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
      coursePublicationStore,
      authHeaders: { cookie: `avana_session=${session.sessionToken}` },
    };
  }

  it("1. Returns live lesson from adminStore with flashcards and quiz questions", async () => {
    const { app, adminStore, authHeaders } = await setupTestApp();
    const lessonId = randomUUID();

    adminStore.getLesson = async (id: string) => {
      if (id === lessonId) {
        return {
          id: lessonId,
          title: "درس فارماکولوژی پایه",
          courseName: "فارماکولوژی عمومی",
          moduleTitle: "فصل ۱: گیرنده‌ها",
          moduleId: randomUUID(),
          publicationStatus: "published",
          contentMarkdown: "# مبانی گیرنده‌ها\n\nتوضیحات کامل درسنامه...",
          createdAt: new Date().toISOString(),
          flashcards: [
            {
              id: "fc-1",
              front: "گیرنده چیست؟",
              back: "یک ساختار پروتئینی...",
              explanation: "توضیح...",
              difficulty: "medium",
            },
          ],
          quizQuestions: [
            {
              id: "qq-1",
              question: "کدام گیرنده جفت‌شده با پروتئین G است؟",
              choices: ["آلفا-۱", "نیکوتینی", "انسولین", "استروژن"],
              correctAnswer: "آلفا-۱",
              explanation: "گیرنده آلفا-۱ از نوع GPCR است.",
              difficulty: "medium",
            },
          ],
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
    expect(body.title).toBe("درس فارماکولوژی پایه");
    expect(body.contentMarkdown).toContain("توضیحات کامل درسنامه");
    expect(body.flashcards).toHaveLength(1);
    expect(body.flashcards[0].front).toBe("گیرنده چیست؟");
    expect(body.quizQuestions).toHaveLength(1);
    expect(body.quizQuestions[0].choices).toHaveLength(4);
  });

  it("2. Falls back to course publication snapshot when lesson is from a submitted course", async () => {
    const { app, coursePublicationStore, authHeaders } = await setupTestApp();
    const courseId = asCourseId(randomUUID());
    const lessonId = "snapshot-lesson-99";
    const pubId = asCoursePublicationId(randomUUID());

    await coursePublicationStore.create({
      id: pubId,
      courseId,
      version: 1,
      title: "دوره جامع شیمی آلی",
      description: "دوره ارسالی توسط مدرس",
      subject: "شیمی",
      status: "pending_review",
      creatorUserId: asUserId(randomUUID()),
      creatorRole: "teacher",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      snapshot: {
        courseId,
        title: "دوره جامع شیمی آلی",
        chapters: [
          {
            id: "ch-1",
            title: "فصل آلکان‌ها",
            sortOrder: 1,
            lessons: [
              {
                id: lessonId,
                title: "ساختار متان و اتان",
                contentMarkdown: "## آلکان‌ها\n\nمتان ساده‌ترین هیدروکربن است.",
                sortOrder: 1,
              },
            ],
            flashcards: [
              {
                front: "فرمول عمومی آلکان‌ها؟",
                back: "CnH2n+2",
              },
            ],
            quiz: {
              title: "آزمون آلکان‌ها",
              questions: [
                {
                  question: "زاویه پیوندی در متان چقدر است؟",
                  choices: ["109.5", "120", "180", "90"],
                  correctAnswer: "109.5",
                },
              ],
            },
          },
        ],
        stats: {
          chapterCount: 1,
          lessonCount: 1,
          flashcardCount: 1,
          quizQuestionCount: 1,
          estimatedReadingMinutes: 10,
        },
      },
    });

    // Request with submissionId
    const resWithSubmission = await app.inject({
      method: "GET",
      url: `/v1/admin/content/lessons/${lessonId}?submissionId=${pubId}`,
      headers: authHeaders,
    });
    expect(resWithSubmission.statusCode).toBe(200);
    const body1 = resWithSubmission.json();
    expect(body1.id).toBe(lessonId);
    expect(body1.title).toBe("ساختار متان و اتان");
    expect(body1.contentMarkdown).toContain("متان ساده‌ترین هیدروکربن است.");
    expect(body1.moduleTitle).toBe("فصل آلکان‌ها");
    expect(body1.flashcards).toHaveLength(1);
    expect(body1.quizQuestions).toHaveLength(1);

    // Request with courseId
    const resWithCourse = await app.inject({
      method: "GET",
      url: `/v1/admin/content/lessons/${lessonId}?courseId=${courseId}`,
      headers: authHeaders,
    });
    expect(resWithCourse.statusCode).toBe(200);
    const body2 = resWithCourse.json();
    expect(body2.id).toBe(lessonId);
    expect(body2.title).toBe("ساختار متان و اتان");
  });

  it("3. Returns 404 when lesson is not found anywhere", async () => {
    const { app, authHeaders } = await setupTestApp();
    const missingId = randomUUID();

    const res = await app.inject({
      method: "GET",
      url: `/v1/admin/content/lessons/${missingId}`,
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe("not_found");
  });

  it("4. Filters course submissions by courseId in GET /course-submissions", async () => {
    const { app, coursePublicationStore, authHeaders } = await setupTestApp();
    const courseA = asCourseId(randomUUID());
    const courseB = asCourseId(randomUUID());

    await coursePublicationStore.create({
      id: asCoursePublicationId(randomUUID()),
      courseId: courseA,
      version: 1,
      title: "دوره الف",
      status: "pending_review",
      creatorUserId: asUserId(randomUUID()),
      creatorRole: "teacher",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      snapshot: { courseId: courseA, title: "دوره الف", chapters: [], stats: { chapterCount: 0, lessonCount: 0, flashcardCount: 0, quizQuestionCount: 0, estimatedReadingMinutes: 0 } },
    });

    await coursePublicationStore.create({
      id: asCoursePublicationId(randomUUID()),
      courseId: courseB,
      version: 1,
      title: "دوره ب",
      status: "pending_review",
      creatorUserId: asUserId(randomUUID()),
      creatorRole: "teacher",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      snapshot: { courseId: courseB, title: "دوره ب", chapters: [], stats: { chapterCount: 0, lessonCount: 0, flashcardCount: 0, quizQuestionCount: 0, estimatedReadingMinutes: 0 } },
    });

    const res = await app.inject({
      method: "GET",
      url: `/v1/admin/course-submissions?courseId=${courseA}`,
      headers: authHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.totalCount).toBe(1);
    expect(body.items[0].courseId).toBe(courseA);
  });
});
