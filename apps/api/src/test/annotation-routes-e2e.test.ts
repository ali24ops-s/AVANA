import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
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
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryLessonAnnotationStore,
  InMemoryContentReportStore,
} from "../modules/study/index.js";
import type {
  CourseId,
  LessonId,
  ModuleId,
  OrganizationId,
  UserId,
} from "@avana/domain";

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

describe("Lesson Annotation & Note API Routes End-to-End Suite", () => {
  let config: ReturnType<typeof makeTestConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let organizationStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let annotationStore: InMemoryLessonAnnotationStore;
  let reportStore: InMemoryContentReportStore;

  let sessionCookieUserA: string;
  let userAId: UserId;
  let sessionCookieUserB: string;
  let userBId: UserId;
  let orgId: OrganizationId;
  let courseId: CourseId;
  let moduleId: ModuleId;
  let lessonId: LessonId;

  async function buildTestApp() {
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      organizationStore,
      courseStore,
      moduleStore,
      lessonStore,
      progressStore,
      flashcardStore: new InMemoryFlashcardStore(),
      flashcardReviewStore: new InMemoryFlashcardReviewStore(),
      quizStore: new InMemoryQuizStore(),
      quizQuestionStore: new InMemoryQuizQuestionStore(),
      quizAttemptStore: new InMemoryQuizAttemptStore(new InMemoryQuizStore()),
      annotationStore,
      reportStore,
    });
    return app;
  }

  beforeEach(async () => {
    config = makeTestConfig();
    sessionStore = new InMemorySessionStore();
    userStore = new InMemoryUserStore();
    organizationStore = new InMemoryOrganizationStore();
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    annotationStore = new InMemoryLessonAnnotationStore();
    reportStore = new InMemoryContentReportStore();

    const app = await buildTestApp();

    // Register User A
    const regResA = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "studentA@avana.ai",
        password: "password123",
        name: "Student A",
        phoneNumber: "09121110001",
      }),
    });
    expect(regResA.statusCode).toBe(200);
    userAId = regResA.json().user.id;
    sessionCookieUserA = `avana_session=${extractSessionToken(regResA)}`;

    // Register User B
    const regResB = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "studentB@avana.ai",
        password: "password123",
        name: "Student B",
        phoneNumber: "09121110002",
      }),
    });
    expect(regResB.statusCode).toBe(200);
    userBId = regResB.json().user.id;
    sessionCookieUserB = `avana_session=${extractSessionToken(regResB)}`;

    // Create organization & memberships for both
    orgId = randomUUID() as OrganizationId;
    await organizationStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "دانشگاه پزشکی تهران",
        slug: "tums",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: "mem-a-1",
        organizationId: orgId,
        userId: userAId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    organizationStore.addMembership({
      id: "mem-b-1",
      organizationId: orgId,
      userId: userBId,
      role: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create course, module, lesson
    courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "فارماکولوژی پایه",
        subject: "پزشکی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    moduleId = randomUUID() as ModuleId;
    await moduleStore.create({
      id: moduleId,
      courseId,
      title: "فصل ۱: کلیات دارو",
      description: null,
      sortOrder: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    lessonId = randomUUID() as LessonId;
    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: "آنتی‌بیوتیک‌ها",
      contentType: "markdown",
      contentMarkdown: "# آنتی‌بیوتیک‌ها\n\nداروهای بتالاکتام شامل پنی‌سیلین‌ها دیواره سلولی را تخریب می‌کنند.",
      sortOrder: 0,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  });

  it("POST /v1/lessons/:lessonId/annotations — creates note within lesson text successfully", async () => {
    const app = await buildTestApp();

    const payload = {
      type: "note",
      selectedText: "دیواره سلولی",
      prefix: "پنی‌سیلین‌ها ",
      suffix: " را تخریب می‌کنند.",
      startOffset: 45,
      endOffset: 57,
      noteText: "نکته فارماکولوژی: اثر باکتریسیدی روی باکتری‌های گرم مثبت",
    };

    const res = await app.inject({
      method: "POST",
      url: `/v1/lessons/${lessonId}/annotations`,
      headers: {
        "content-type": "application/json",
        cookie: sessionCookieUserA,
      },
      body: JSON.stringify(payload),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.type).toBe("note");
    expect(body.userId).toBe(userAId);
    expect(body.lessonId).toBe(lessonId);
    expect(body.selectedText).toBe("دیواره سلولی");
    expect(body.prefix).toBe("پنی‌سیلین‌ها ");
    expect(body.suffix).toBe(" را تخریب می‌کنند.");
    expect(body.startOffset).toBe(45);
    expect(body.endOffset).toBe(57);
    expect(body.noteText).toBe("نکته فارماکولوژی: اثر باکتریسیدی روی باکتری‌های گرم مثبت");
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();

    // Verify GET lists the newly created note
    const listRes = await app.inject({
      method: "GET",
      url: `/v1/lessons/${lessonId}/annotations`,
      headers: { cookie: sessionCookieUserA },
    });

    expect(listRes.statusCode).toBe(200);
    const listBody = listRes.json();
    expect(listBody.items).toHaveLength(1);
    expect(listBody.items[0].id).toBe(body.id);
    expect(listBody.items[0].noteText).toBe("نکته فارماکولوژی: اثر باکتریسیدی روی باکتری‌های گرم مثبت");

    // Verify User B has an isolated empty list (privacy / IDOR isolation)
    const listResB = await app.inject({
      method: "GET",
      url: `/v1/lessons/${lessonId}/annotations`,
      headers: { cookie: sessionCookieUserB },
    });
    expect(listResB.statusCode).toBe(200);
    expect(listResB.json().items).toHaveLength(0);
  });

  it("PATCH /v1/lessons/annotations/:annotationId — edits existing note", async () => {
    const app = await buildTestApp();

    // Create note
    const createRes = await app.inject({
      method: "POST",
      url: `/v1/lessons/${lessonId}/annotations`,
      headers: {
        "content-type": "application/json",
        cookie: sessionCookieUserA,
      },
      body: JSON.stringify({
        type: "note",
        selectedText: "پنی‌سیلین‌ها",
        noteText: "یادداشت اولیه",
      }),
    });
    expect(createRes.statusCode).toBe(200);
    const annotationId = createRes.json().id;

    // Update note text
    const updateRes = await app.inject({
      method: "PATCH",
      url: `/v1/lessons/annotations/${annotationId}`,
      headers: {
        "content-type": "application/json",
        cookie: sessionCookieUserA,
      },
      body: JSON.stringify({
        noteText: "یادداشت ویرایش‌شده و تکمیل‌شده",
      }),
    });

    expect(updateRes.statusCode).toBe(200);
    const updateBody = updateRes.json();
    expect(updateBody.noteText).toBe("یادداشت ویرایش‌شده و تکمیل‌شده");

    // IDOR protection: User B cannot edit User A's note
    const forbiddenUpdate = await app.inject({
      method: "PATCH",
      url: `/v1/lessons/annotations/${annotationId}`,
      headers: {
        "content-type": "application/json",
        cookie: sessionCookieUserB,
      },
      body: JSON.stringify({
        noteText: "تلاش غیرمجاز کاربر ب",
      }),
    });
    expect(forbiddenUpdate.statusCode).toBe(403);
  });

  it("DELETE /v1/lessons/annotations/:annotationId — deletes note successfully", async () => {
    const app = await buildTestApp();

    const createRes = await app.inject({
      method: "POST",
      url: `/v1/lessons/${lessonId}/annotations`,
      headers: {
        "content-type": "application/json",
        cookie: sessionCookieUserA,
      },
      body: JSON.stringify({
        type: "note",
        selectedText: "پنی‌سیلین‌ها",
        noteText: "برای حذف",
      }),
    });
    const annotationId = createRes.json().id;

    // Delete as user A
    const deleteRes = await app.inject({
      method: "DELETE",
      url: `/v1/lessons/annotations/${annotationId}`,
      headers: { cookie: sessionCookieUserA },
    });

    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().ok).toBe(true);

    // Verify empty list
    const listRes = await app.inject({
      method: "GET",
      url: `/v1/lessons/${lessonId}/annotations`,
      headers: { cookie: sessionCookieUserA },
    });
    expect(listRes.json().items).toHaveLength(0);
  });

  it("POST /v1/lessons/:lessonId/reports — submits a content report on lesson text", async () => {
    const app = await buildTestApp();

    const res = await app.inject({
      method: "POST",
      url: `/v1/lessons/${lessonId}/reports`,
      headers: {
        "content-type": "application/json",
        cookie: sessionCookieUserA,
      },
      body: JSON.stringify({
        selectedText: "داروهای بتالاکتام",
        category: "scientific_error",
        comment: "نیاز به ذکر مهارکننده بتالاکتاماز مانند کلاوولانیک اسید",
        courseId,
      }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBeDefined();
    expect(body.status).toBe("pending");
    expect(body.message).toBe("گزارش شما ثبت شد.");
  });

  it("validates bad requests cleanly without 500", async () => {
    const app = await buildTestApp();

    // Empty text
    const emptyRes = await app.inject({
      method: "POST",
      url: `/v1/lessons/${lessonId}/annotations`,
      headers: {
        "content-type": "application/json",
        cookie: sessionCookieUserA,
      },
      body: JSON.stringify({
        type: "note",
        selectedText: "   ",
        noteText: "تست",
      }),
    });
    expect(emptyRes.statusCode).toBe(400);

    // Invalid type
    const invalidTypeRes = await app.inject({
      method: "POST",
      url: `/v1/lessons/${lessonId}/annotations`,
      headers: {
        "content-type": "application/json",
        cookie: sessionCookieUserA,
      },
      body: JSON.stringify({
        type: "invalid_type",
        selectedText: "متن",
      }),
    });
    expect(invalidTypeRes.statusCode).toBe(400);

    // Non-existent lesson
    const notFoundRes = await app.inject({
      method: "POST",
      url: `/v1/lessons/${randomUUID()}/annotations`,
      headers: {
        "content-type": "application/json",
        cookie: sessionCookieUserA,
      },
      body: JSON.stringify({
        type: "note",
        selectedText: "متن",
      }),
    });
    expect(notFoundRes.statusCode).toBe(404);
  });
});
