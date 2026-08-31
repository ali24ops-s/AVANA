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
import { InMemoryAssistantConversationStore } from "../modules/study/index.js";
import { MockModelGateway } from "../modules/generation/gateway/mock.js";
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

describe("AI Study Assistant API Integration Tests (POST /v1/ai/ask)", () => {
  let config: ReturnType<typeof makeTestConfig>;
  let sessionStore: InMemorySessionStore;
  let userStore: InMemoryUserStore;
  let organizationStore: InMemoryOrganizationStore;
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let conversationStore: InMemoryAssistantConversationStore;
  let assistantGateway: MockModelGateway;

  let sessionCookie: string;
  let userId: UserId;
  let orgId: OrganizationId;
  let otherOrgId: OrganizationId;
  let courseId: CourseId;
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
      conversationStore,
      assistantGateway,
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
    conversationStore = new InMemoryAssistantConversationStore();
    assistantGateway = new MockModelGateway();

    // Register test user
    const app = await buildTestApp();
    const registerRes = await app.inject({
      method: "POST",
      url: "/v1/auth/register",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "student@avana.ai",
        password: "password123",
        name: "Student User",
      }),
    });

    expect(registerRes.statusCode).toBe(200);
    const parsedBody = registerRes.json();
    userId = parsedBody.user.id;
    sessionCookie = `avana_session=${extractSessionToken(registerRes)}`;

    // Create organization & membership
    orgId = randomUUID() as OrganizationId;
    await organizationStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "دانشگاه پزشکی",
        slug: "med-uni",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: "mem-api-1",
        organizationId: orgId,
        userId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    // Create course, module, lesson
    courseId = randomUUID() as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "فارماکولوژی",
        subject: "داروسازی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const moduleId = randomUUID() as ModuleId;
    const moduleRecord = await moduleStore.create({
      id: moduleId,
      courseId,
      title: "فصل ۱",
      description: null,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    lessonId = randomUUID() as LessonId;
    await lessonStore.create({
      id: lessonId,
      moduleId: moduleRecord.id,
      title: "مقدمات فارماکوکینتیک",
      contentType: "markdown",
      contentMarkdown: "# فارماکوکینتیک\n\nجذب، توزیع، متابولیسم و دفع داروها را بررسی می‌کند.",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });
  });

  it("POST /v1/ai/ask (Lesson Mode) returns 200 with answer, conversationId, and sources", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/ask",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        message: "چرا جذب دارو در معده با روده متفاوته؟",
        context: {
          type: "lesson",
          lessonId,
        },
      }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.request_id).toBeDefined();
    expect(body.answer).toBeDefined();
    expect(body.conversationId).toBeDefined();
    expect(body.sources).toEqual({
      courseTitle: "فارماکولوژی",
      moduleTitle: "فصل ۱",
      lessonTitle: "مقدمات فارماکوکینتیک",
    });
  });

  it("POST /v1/ai/ask (Dashboard Mode) returns 200 with answer without lesson sources", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/ask",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        message: "سلام آوانا، چطور فارماکولوژی بخونم؟",
        context: {
          type: "dashboard",
        },
      }),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.answer).toBeDefined();
    expect(body.conversationId).toBeDefined();
    expect(body.sources).toBeUndefined();
  });

  it("POST /v1/ai/ask continues conversation with conversationId", async () => {
    const app = await buildTestApp();

    // Turn 1
    const turn1Res = await app.inject({
      method: "POST",
      url: "/v1/ai/ask",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        message: "متابولیسم عبور اول چیه؟",
        context: { type: "lesson", lessonId },
      }),
    });

    expect(turn1Res.statusCode).toBe(200);
    const convId = turn1Res.json().conversationId;

    // Turn 2
    const turn2Res = await app.inject({
      method: "POST",
      url: "/v1/ai/ask",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        message: "پس کبد نقش اصلی رو داره؟",
        conversationId: convId,
        context: { type: "lesson", lessonId },
      }),
    });

    expect(turn2Res.statusCode).toBe(200);
    expect(turn2Res.json().conversationId).toBe(convId);

    // GET /v1/ai/conversations/:conversationId
    const getRes = await app.inject({
      method: "GET",
      url: `/v1/ai/conversations/${convId}`,
      headers: { cookie: sessionCookie },
    });

    expect(getRes.statusCode).toBe(200);
    const getBody = getRes.json();
    expect(getBody.messages.length).toBe(4); // 2 user turns + 2 assistant turns
  });

  it("POST /v1/ai/ask rejects unauthenticated requests with 401", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/ask",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "سوال بدون لاگین",
      }),
    });

    expect(res.statusCode).toBe(401);
  });

  it("POST /v1/ai/ask rejects empty message with 400 bad_request", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/ask",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        message: "    ",
      }),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("bad_request");
  });

  it("POST /v1/ai/ask prevents IDOR on unauthorized lesson (returns 403)", async () => {
    otherOrgId = randomUUID() as OrganizationId;
    await organizationStore.createWithAdminMembership({
      organization: {
        id: otherOrgId,
        name: "سازمان دیگر",
        slug: "other-uni-2",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: "mem-api-2",
        organizationId: otherOrgId,
        userId: "other-user-99" as UserId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    const otherCourseId = randomUUID() as CourseId;
    const otherCourse = await courseStore.create({
      course: {
        id: otherCourseId,
        organizationId: otherOrgId,
        name: "دوره دیگر",
        subject: null,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const otherModId = randomUUID() as ModuleId;
    const otherMod = await moduleStore.create({
      id: otherModId,
      courseId: otherCourse.id,
      title: "فصل دیگر",
      description: null,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const otherLessonId = randomUUID() as LessonId;
    const otherLesson = await lessonStore.create({
      id: otherLessonId,
      moduleId: otherMod.id,
      title: "درس غیرمجاز",
      contentType: "markdown",
      contentMarkdown: "محتوا",
      sortOrder: 1,
      estimatedMinutes: 5,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const app = await buildTestApp();
    const res = await app.inject({
      method: "POST",
      url: "/v1/ai/ask",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        message: "سوال از درس غیرمجاز",
        context: {
          type: "lesson",
          lessonId: otherLesson.id,
        },
      }),
    });

    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe("forbidden");
  });

  it("DELETE /v1/ai/conversations/:conversationId deletes conversation", async () => {
    const app = await buildTestApp();

    const askRes = await app.inject({
      method: "POST",
      url: "/v1/ai/ask",
      headers: {
        "content-type": "application/json",
        cookie: sessionCookie,
      },
      body: JSON.stringify({
        message: "پیام برای حذف",
      }),
    });

    const convId = askRes.json().conversationId;

    const delRes = await app.inject({
      method: "DELETE",
      url: `/v1/ai/conversations/${convId}`,
      headers: { cookie: sessionCookie },
    });

    expect(delRes.statusCode).toBe(200);

    const getRes = await app.inject({
      method: "GET",
      url: `/v1/ai/conversations/${convId}`,
      headers: { cookie: sessionCookie },
    });

    expect(getRes.statusCode).toBe(404);
  });
});
