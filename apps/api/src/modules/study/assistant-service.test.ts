import { describe, it, expect, beforeEach } from "vitest";
import {
  type Actor,
  type CourseId,
  type LessonId,
  type ModuleId,
  type OrganizationId,
  type UserId,
  DomainError,
  defaultPolicy,
} from "@avana/domain";
import { StudyAssistantService } from "./assistant-service.js";
import { InMemoryAssistantConversationStore } from "./assistant-store.js";
import {
  InMemoryLessonStore,
  InMemoryModuleStore,
} from "../learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../courses/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../organizations/test/in-memory-stores.js";
import { MockModelGateway } from "../generation/gateway/mock.js";
import type { CompletionRequest, CompletionResult } from "../generation/gateway/types.js";

// Custom Mock Gateway to inspect received messages and system prompts
class InspectableMockGateway extends MockModelGateway {
  public lastRequest?: CompletionRequest;
  public customResponse?: string;

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.lastRequest = req;
    if (this.customResponse) {
      return {
        text: this.customResponse,
        model: "mock-cloudflare-model",
        usage: { inputTokens: 50, outputTokens: 20 },
        finishReason: "stop",
      };
    }
    return {
      text: "داروی پروپرانولول یک بتابلاکر غیرانتخابی است که با مهار گیرنده‌های بتا باعث کاهش ضربان قلب می‌شود.",
      model: "mock-cloudflare-model",
      usage: { inputTokens: 50, outputTokens: 25 },
      finishReason: "stop",
    };
  }
}

describe("StudyAssistantService Unit Tests", () => {
  let gateway: InspectableMockGateway;
  let conversationStore: InMemoryAssistantConversationStore;
  let lessonStore: InMemoryLessonStore;
  let moduleStore: InMemoryModuleStore;
  let courseStore: InMemoryCourseStore;
  let organizationStore: InMemoryOrganizationStore;
  let service: StudyAssistantService;

  const orgId = "11111111-1111-1111-1111-111111111111" as OrganizationId;
  const otherOrgId = "22222222-2222-2222-2222-222222222222" as OrganizationId;
  const studentUser = "33333333-3333-3333-3333-333333333333" as UserId;
  const actor: Actor = { userId: studentUser, role: "student" };

  let courseId: CourseId;
  let lessonId: LessonId;

  beforeEach(async () => {
    gateway = new InspectableMockGateway();
    conversationStore = new InMemoryAssistantConversationStore();
    lessonStore = new InMemoryLessonStore();
    moduleStore = new InMemoryModuleStore();
    courseStore = new InMemoryCourseStore();
    organizationStore = new InMemoryOrganizationStore();

    // Create student org and membership
    await organizationStore.createWithAdminMembership({
      organization: {
        id: orgId,
        name: "دانشگاه داروسازی",
        slug: "pharm-uni",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: "mem-1",
        organizationId: orgId,
        userId: studentUser,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    // Create course
    courseId = "44444444-4444-4444-4444-444444444444" as CourseId;
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "فارماکولوژی قلب و عروق",
        subject: "داروشناسی تخصصی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Create module
    const moduleId = "66666666-6666-6666-6666-666666666666" as ModuleId;
    const moduleRecord = await moduleStore.create({
      id: moduleId,
      courseId,
      title: "داروهای بتابلاکر",
      description: "آشنایی با گیرنده‌های بتا و آنتاگونیست‌ها",
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Create lesson
    lessonId = "77777777-7777-7777-7777-777777777777" as LessonId;
    await lessonStore.create({
      id: lessonId,
      moduleId: moduleRecord.id,
      title: "پروپرانولول و متوپرولول",
      contentType: "markdown",
      contentMarkdown: "# بتابلاکرها\n\nپروپرانولول داروی بتابلاکر غیرانتخابی (بتا ۱ و بتا ۲) است.",
      sortOrder: 1,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    service = new StudyAssistantService(
      gateway,
      conversationStore,
      lessonStore,
      moduleStore,
      courseStore,
      organizationStore,
      defaultPolicy,
    );
  });

  it("answers question in Lesson mode and grounds in lesson context", async () => {
    const result = await service.ask(actor, {
      message: "پروپرانولول روی کدام گیرنده‌ها اثر میگذاره؟",
      context: {
        type: "lesson",
        lessonId,
      },
    });

    expect(result.answer).toBeTruthy();
    expect(result.conversationId).toBeTruthy();
    expect(result.sources).toEqual({
      courseTitle: "فارماکولوژی قلب و عروق",
      moduleTitle: "داروهای بتابلاکر",
      lessonTitle: "پروپرانولول و متوپرولول",
    });

    // Check that gateway received the grounded system prompt
    expect(gateway.lastRequest).toBeDefined();
    const systemMessage = gateway.lastRequest?.messages.find(
      (m) => m.role === "system",
    );
    expect(systemMessage?.content).toContain("فارماکولوژی قلب و عروق");
    expect(systemMessage?.content).toContain("داروهای بتابلاکر");
    expect(systemMessage?.content).toContain("پروپرانولول و متوپرولول");
    expect(systemMessage?.content).toContain("پروپرانولول داروی بتابلاکر غیرانتخابی");
  });

  it("answers question in Dashboard mode with AVANA product knowledge and no course grounding", async () => {
    const result = await service.ask(actor, {
      message: "چطور از یک PDF درس و فلش‌کارت بسازم؟",
      context: {
        type: "dashboard",
      },
    });

    expect(result.answer).toBeTruthy();
    expect(result.conversationId).toBeTruthy();
    expect(result.sources).toBeUndefined();

    const systemMessage = gateway.lastRequest?.messages.find(
      (m) => m.role === "system",
    );
    expect(systemMessage?.content).toContain("دستیار هوشمند آوانا");
    expect(systemMessage?.content).toContain("مدیریت فایل‌ها و اسناد");
    expect(systemMessage?.content).toContain("تولید هوشمند بسته آموزشی");
    expect(systemMessage?.content).toContain("Active Recall");
    expect(systemMessage?.content).not.toContain("اطلاعات درس در حال مطالعه");
    expect(systemMessage?.content).not.toContain("فارماکولوژی قلب و عروق");
  });

  it("does not bind to any course in Dashboard mode even if user is enrolled in multiple courses", async () => {
    // Add 2 more courses
    const c2Id = "55555555-5555-5555-5555-555555555555" as CourseId;
    await courseStore.create({
      course: {
        id: c2Id,
        organizationId: orgId,
        name: "شیمی دارویی پیشرفته",
        subject: "شیمی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const c3Id = "66666666-6666-6666-6666-666666666666" as CourseId;
    await courseStore.create({
      course: {
        id: c3Id,
        organizationId: orgId,
        name: "پاتولوژی عمومی",
        subject: "پزشکی",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const result = await service.ask(actor, {
      message: "چطور با آزمون خودم را ارزیابی کنم؟",
      context: {
        type: "dashboard",
      },
    });

    expect(result.answer).toBeTruthy();
    expect(result.sources).toBeUndefined();

    const systemMessage = gateway.lastRequest?.messages.find(
      (m) => m.role === "system",
    );
    expect(systemMessage?.content).toContain("دستیار هوشمند آوانا");
    expect(systemMessage?.content).not.toContain("شیمی دارویی پیشرفته");
    expect(systemMessage?.content).not.toContain("پاتولوژی عمومی");
    expect(systemMessage?.content).not.toContain("فارماکولوژی قلب و عروق");
  });

  it("maintains conversation history across multiple turns", async () => {
    // Turn 1
    const turn1 = await service.ask(actor, {
      message: "پروپرانولول چیه؟",
      context: { type: "lesson", lessonId },
    });

    // Turn 2 (with conversationId)
    const turn2 = await service.ask(actor, {
      message: "پس روی ریه هم اثر منفی داره؟",
      conversationId: turn1.conversationId,
      context: { type: "lesson", lessonId },
    });

    expect(turn2.conversationId).toBe(turn1.conversationId);

    // Verify messages sent to gateway for turn 2 include turn 1 history
    const msgs = gateway.lastRequest?.messages || [];
    expect(msgs.length).toBe(4); // system + user1 + assistant1 + user2
    expect(msgs[1].content).toBe("پروپرانولول چیه؟");
    expect(msgs[2].role).toBe("assistant");
    expect(msgs[3].content).toBe("پس روی ریه هم اثر منفی داره؟");
  });

  it("prevents IDOR: forbids accessing lesson belonging to unauthorized organization", async () => {
    // Create unauthorized course in another org
    await organizationStore.createWithAdminMembership({
      organization: {
        id: otherOrgId,
        name: "سازمان دیگر",
        slug: "other-uni",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      membership: {
        id: "mem-2",
        organizationId: otherOrgId,
        userId: "other-user-99" as UserId,
        role: "student",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      auditEvents: [],
    });

    const otherCourseId = "55555555-5555-5555-5555-555555555555" as CourseId;
    const otherCourse = await courseStore.create({
      course: {
        id: otherCourseId,
        organizationId: otherOrgId,
        name: "دوره غیرمجاز",
        subject: null,
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const otherModuleId = "88888888-8888-8888-8888-888888888888" as ModuleId;
    const otherModule = await moduleStore.create({
      id: otherModuleId,
      courseId: otherCourse.id,
      title: "فصل غیرمجاز",
      description: null,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    const otherLessonId = "99999999-9999-9999-9999-999999999999" as LessonId;
    const otherLesson = await lessonStore.create({
      id: otherLessonId,
      moduleId: otherModule.id,
      title: "درس غیرمجاز",
      contentType: "markdown",
      contentMarkdown: "محتوای محرمانه",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await expect(
      service.ask(actor, {
        message: "محتوای این درس چیه؟",
        context: {
          type: "lesson",
          lessonId: otherLesson.id,
        },
      }),
    ).rejects.toThrow(DomainError);
  });

  it("throws not_found when querying non-existent lesson", async () => {
    await expect(
      service.ask(actor, {
        message: "سلام",
        context: {
          type: "lesson",
          lessonId: "99999999-9999-9999-9999-999999999999" as LessonId,
        },
      }),
    ).rejects.toThrow(/Lesson not found/i);
  });

  it("throws bad_request for empty message", async () => {
    await expect(
      service.ask(actor, {
        message: "   ",
      }),
    ).rejects.toThrow(/Message cannot be empty/i);
  });

  it("retrieves and deletes conversation history", async () => {
    const turn = await service.ask(actor, {
      message: "سؤال تست",
    });

    const detail = await service.getConversation(actor, turn.conversationId);
    expect(detail.messages.length).toBe(2); // user + assistant

    const deleted = await service.deleteConversation(actor, turn.conversationId);
    expect(deleted).toBe(true);

    await expect(
      service.getConversation(actor, turn.conversationId),
    ).rejects.toThrow(/Conversation not found/i);
  });
});
