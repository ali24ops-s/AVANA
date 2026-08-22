/**
 * Study Assistant Service (AI Study Assistant / «از آوانا بپرس»).
 *
 * Coordinates:
 * - Real-time conversational study mentoring using Cloudflare Workers AI.
 * - Context grounding from Lesson & Module & Course structures.
 * - Multi-turn conversation management with bounded history windows.
 * - Strict authorization, IDOR prevention, and secret redaction.
 */

import {
  DomainError,
  type Actor,
  type CourseId,
  type LessonId,
  type OrganizationId,
  type AuthorizationPolicy,
  defaultPolicy,
} from "@avana/domain";
import type { ModelGateway } from "../generation/gateway/types.js";
import type {
  AssistantConversationStore,
  AssistantConversation,
} from "./assistant-store.js";
import type {
  LessonStore,
  ModuleStore,
} from "../learning/learning-store.js";
import type { CourseStore } from "../courses/course-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { AuditService } from "../../observability/audit-service.js";

// Maximum character limit for lesson context markdown to prevent token overflow
const MAX_LESSON_CONTENT_CHARS = 6000;
// Maximum message history turns sent to the model (user + assistant pairs)
const MAX_HISTORY_MESSAGES = 6;
// Maximum input message length
export const MAX_USER_MESSAGE_LENGTH = 4000;

export interface AskAssistantContextInput {
  type: "lesson" | "dashboard";
  lessonId?: string;
  courseId?: string;
}

export interface AskAssistantInput {
  message: string;
  context?: AskAssistantContextInput;
  conversationId?: string;
}

export interface AskAssistantOutput {
  answer: string;
  conversationId: string;
  sources?: {
    courseTitle?: string;
    moduleTitle?: string;
    lessonTitle?: string;
  };
}

export interface ResolvedContext {
  type: "lesson" | "dashboard";
  courseTitle?: string;
  courseSubject?: string;
  moduleTitle?: string;
  lessonTitle?: string;
  lessonContent?: string;
  organizationId?: OrganizationId;
  courseId?: CourseId;
  lessonId?: LessonId;
}

export class StudyAssistantService {
  constructor(
    private readonly gateway: ModelGateway,
    private readonly conversationStore: AssistantConversationStore,
    private readonly lessonStore: LessonStore,
    private readonly moduleStore: ModuleStore,
    private readonly courseStore: CourseStore,
    private readonly organizationStore: OrganizationStore,
    private readonly policy: AuthorizationPolicy = defaultPolicy,
    private readonly auditService?: AuditService,
    private readonly systemOrganizationId?: OrganizationId,
  ) {}

  /**
   * Main entry point for student questions.
   */
  async ask(
    actor: Actor,
    input: AskAssistantInput,
    correlationId: string = "study-assistant",
  ): Promise<AskAssistantOutput> {
    // 1. Validate user message
    const rawMessage = input.message?.trim();
    if (!rawMessage || rawMessage.length === 0) {
      throw new DomainError("bad_request", "Message cannot be empty");
    }

    if (rawMessage.length > MAX_USER_MESSAGE_LENGTH) {
      throw new DomainError(
        "bad_request",
        `Message exceeds maximum length of ${MAX_USER_MESSAGE_LENGTH} characters`,
      );
    }

    // 2. Resolve and verify authorization for Context
    const resolvedContext = await this.resolveContext(actor, input.context);

    // 3. Resolve or create Conversation
    let conversation: AssistantConversation;
    if (input.conversationId) {
      const existing = await this.conversationStore.getConversation(
        input.conversationId,
        actor.userId,
      );
      if (!existing) {
        throw new DomainError(
          "not_found",
          "Conversation not found or access denied",
        );
      }
      conversation = existing;
    } else {
      conversation = await this.conversationStore.createConversation(
        actor.userId,
        {
          organizationId: resolvedContext.organizationId,
          courseId: resolvedContext.courseId,
          lessonId: resolvedContext.lessonId,
          title: rawMessage.slice(0, 60),
        },
      );
    }

    // 4. Load recent message history
    const history = await this.conversationStore.getRecentMessages(
      conversation.id,
      MAX_HISTORY_MESSAGES,
    );

    // 5. Build System Prompt & Messages Payload
    const systemPrompt = this.buildSystemPrompt(resolvedContext);

    const messagesPayload: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }> = [{ role: "system", content: systemPrompt }];

    for (const msg of history) {
      messagesPayload.push({
        role: msg.role,
        content: msg.content,
      });
    }

    messagesPayload.push({
      role: "user",
      content: rawMessage,
    });

    // 6. Execute Model Completion via Gateway
    const targetOrgId =
      resolvedContext.organizationId ??
      this.systemOrganizationId ??
      ("00000000-0000-0000-0000-000000000000" as OrganizationId);

    let completionResult;
    try {
      completionResult = await this.gateway.complete({
        promptVersion: "study-assistant-v1",
        messages: messagesPayload,
        temperature: 0.3,
        correlationId,
        organizationId: targetOrgId,
        documentId: "00000000-0000-0000-0000-000000000000" as any,
      });
    } catch (err: unknown) {
      if (err instanceof DomainError) {
        throw err;
      }
      const errMessage = err instanceof Error ? err.message : String(err);
      throw new DomainError(
        "unprocessable",
        `Study assistant service unavailable: ${errMessage}`,
      );
    }

    const answerText = completionResult.text?.trim() || "";
    if (!answerText) {
      throw new DomainError(
        "unprocessable",
        "No response generated by assistant",
      );
    }

    // 7. Persist turns in Conversation Store
    await this.conversationStore.addMessage(conversation.id, {
      role: "user",
      content: rawMessage,
    });

    await this.conversationStore.addMessage(conversation.id, {
      role: "assistant",
      content: answerText,
      tokenUsage: completionResult.usage,
    });

    // 8. Emit audit event if audit service configured
    if (this.auditService && resolvedContext.organizationId) {
      void this.auditService.emit([
        {
          actorId: actor.userId,
          organizationId: resolvedContext.organizationId,
          action: "lesson.progress_updated",
          entityType: "lesson",
          entityId: conversation.id,
          details: {
            context_type: resolvedContext.type,
            lesson_id: resolvedContext.lessonId ?? null,
            course_id: resolvedContext.courseId ?? null,
          },
          createdAt: new Date().toISOString(),
        },
      ]);
    }

    // 9. Build Sources attribution if lesson mode
    const sources =
      resolvedContext.type === "lesson" && resolvedContext.lessonTitle
        ? {
            courseTitle: resolvedContext.courseTitle,
            moduleTitle: resolvedContext.moduleTitle,
            lessonTitle: resolvedContext.lessonTitle,
          }
        : undefined;

    return {
      answer: answerText,
      conversationId: conversation.id,
      sources,
    };
  }

  /**
   * Retrieves full conversation history for the authenticated user.
   */
  async getConversation(
    actor: Actor,
    conversationId: string,
  ): Promise<{
    conversation: AssistantConversation;
    messages: Array<{
      id: string;
      role: "user" | "assistant" | "system";
      content: string;
      createdAt: string;
    }>;
  }> {
    const conversation = await this.conversationStore.getConversation(
      conversationId,
      actor.userId,
    );
    if (!conversation) {
      throw new DomainError("not_found", "Conversation not found");
    }

    const messages = await this.conversationStore.getRecentMessages(
      conversationId,
      50,
    );

    return {
      conversation,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Clears/deletes a conversation.
   */
  async deleteConversation(
    actor: Actor,
    conversationId: string,
  ): Promise<boolean> {
    const deleted = await this.conversationStore.deleteConversation(
      conversationId,
      actor.userId,
    );
    if (!deleted) {
      throw new DomainError("not_found", "Conversation not found");
    }
    return true;
  }

  /**
   * Resolves context metadata and verifies user authorization.
   */
  private async resolveContext(
    actor: Actor,
    contextInput?: AskAssistantContextInput,
  ): Promise<ResolvedContext> {
    if (!contextInput || contextInput.type === "dashboard" || !contextInput.lessonId) {
      // In dashboard mode, Assistant operates at general user level across AVANA features without course lock
      return { type: "dashboard" };
    }

    // Lesson mode
    const lessonId = contextInput.lessonId as LessonId;
    const lesson = await this.lessonStore.findById(lessonId);
    if (!lesson) {
      throw new DomainError("not_found", "Lesson not found");
    }

    const moduleRecord = await this.moduleStore.findById(lesson.moduleId);
    if (!moduleRecord) {
      throw new DomainError("not_found", "Module not found for lesson");
    }

    const course = await this.courseStore.findByIdForUser(
      moduleRecord.courseId,
      actor.userId,
      this.systemOrganizationId,
    );
    if (!course) {
      throw new DomainError(
        "forbidden",
        "You do not have access to this course or lesson",
      );
    }

    // Verify user authorization for this course / org (IDOR protection)
    await this.verifyCourseAccess(actor, course.organizationId, course.id);

    // Truncate lesson content to fit within token budgets safely
    let contentMarkdown = lesson.contentMarkdown || "";
    if (contentMarkdown.length > MAX_LESSON_CONTENT_CHARS) {
      contentMarkdown = contentMarkdown.slice(0, MAX_LESSON_CONTENT_CHARS) + "\n\n...(ادامه درس)...";
    }

    return {
      type: "lesson",
      courseTitle: course.name,
      courseSubject: course.subject || undefined,
      moduleTitle: moduleRecord.title,
      lessonTitle: lesson.title,
      lessonContent: contentMarkdown,
      organizationId: course.organizationId,
      courseId: course.id,
      lessonId: lesson.id,
    };
  }

  /**
   * Enforces that the actor has legitimate access to the course and organization.
   */
  private async verifyCourseAccess(
    actor: Actor,
    organizationId: OrganizationId,
    courseId: CourseId,
  ): Promise<void> {
    // Check if system organization or user has membership
    const isSystemOrg =
      this.systemOrganizationId &&
      this.systemOrganizationId === organizationId;

    if (!isSystemOrg) {
      const membership = await this.organizationStore.findMembership(
        organizationId,
        actor.userId,
      );
      if (!membership) {
        throw new DomainError(
          "forbidden",
          "You do not have access to this course or organization",
        );
      }
    }

    this.policy.require("study:read", actor, {
      organizationId,
      courseId,
    });
  }

  /**
   * Constructs the specialized Persian Study Assistant system prompt.
   */
  private buildSystemPrompt(context: ResolvedContext): string {
    if (context.type === "lesson" && context.lessonTitle) {
      return `شما «دستیار هوشمند مطالعه آوانا» (AVANA AI Study Assistant) هستید؛ یک مربی آموزشی تخصصی، علمی و دقیق در زمینه داروسازی و علوم پزشکی.

اطلاعات درس در حال مطالعه:
- دوره: ${context.courseTitle || "نامشخص"} ${context.courseSubject ? `(${context.courseSubject})` : ""}
- سرفصل: ${context.moduleTitle || "نامشخص"}
- عنوان درس: ${context.lessonTitle}

محتوای آموزشی درس:
"""
${context.lessonContent || "بدون محتوا"}
"""

دستورالعمل‌ها:
۱. پاسخ‌ها را به زبان فارسی روان، علمی، مستدل و دقیق ارائه دهید.
۲. در وهله اول بر اساس محتوای درس فوق به سوال کاربر پاسخ دهید.
۳. اگر سوال به گونه‌ای بود که پاسخش در متن درس وجود نداشت، از دانش علمی و داروشناسی عمومی خود استفاده کنید، اما حتماً به کاربر بگویید که این نکته تکمیلی خارج از متن درس است.
۴. پاسخ‌ها کوتاه، ساختاریافته و متمرکز باشند (معمولاً بین ۲ تا ۵ جمله یا در صورت نیاز با نکات کلیدی بالت‌پوینت). از زیاده‌گویی خودداری کنید مگر اینکه کاربر درخواست توضیح بیشتر داشته باشد.
۵. متن درس را به صورت طوطی‌وار تکرار نکنید؛ بلکه با زبان آموزشی و شفاف، مفهوم را تبیین کنید.`;
    }

    return `شما «دستیار هوشمند آوانا» (AVANA AI Assistant) هستید؛ راهنمای جامع پلتفرم یادگیری هوشمند آوانا و مشاور روش‌های بهینه مطالعه.

هویت و نقش شما در صفحه اصلی (Dashboard):
۱. راهنمای امکانات و قابلیت‌های محصول آوانا:
   - مدیریت فایل‌ها و اسناد (/files): بارگذاری فایل‌های جزوه، اسلاید یا کتاب درسی (PDF, DOCX, PPTX) و اتصال به دوره‌ها.
   - تولید هوشمند بسته آموزشی (Smart Content Generation): استخراج خودکار و تبدیل جزوات به درسنامه‌های سرفصل‌بندی‌شده، فلش‌کارت‌های مرور فاصله‌دار، آزمون‌های خودسنجی چندگزینه‌ای و برنامه مرور.
   - دوره‌های آموزشی و «دوره‌های من» (/courses): امکان انتخاب دوره‌های سازمان، افزودن به دوره‌های من، و مشاهده فهرست سرفصل‌ها و درس‌ها.
   - محیط یادگیری و مطالعه درس‌ها (/courses/:id/learn): مطالعه درسنامه‌ها با قالب‌بندی مرتب و ثبت پیشرفت مطالعه.
   - فلش‌کارت‌ها و مرور فاصله‌دار (/flashcards): مرور کارت‌های حفظی با متد لایتنر و درجه‌بندی تسلط (دوباره، سخت، خوب، آسان).
   - آزمون‌های خودسنجی (/quiz): ساخت و شرکت در آزمون‌های تستی زمان‌دار با تصحیح آنی، پاسخ تشریحی و کارنامه تحلیلی.
   - برنامه‌ریزی مطالعه (/planner): مدیریت برنامه روزانه و تایمر مطالعه متمرکز.
   - آمار و تحلیل یادگیری (/analytics): مشاهده ساعات مطالعه، درس‌های خوانده‌شده، پیشرفت دوره‌ها و میزان تسلط.

۲. مشاوره استراتژی‌های علمی مطالعه:
   - روش بازیابی فعال (Active Recall) با فلش‌کارت‌ها و آزمون‌های سنجش به جای بازخوانی منفعلانه.
   - تکنیک مرور فاصله‌دار (Spaced Repetition) جهت تثبیت مفاهیم در حافظه بلندمدت.
   - روش برخورد با جزوات حجیم PDF: بارگذاری در آوانا و تبدیل به بخش‌های کوچک و قابل یادگیری.
   - برنامه‌ریزی برای ایام امتحانات و سنجش مداوم نقاط ضعف.

۳. رفتار در صورت پرسش‌های تخصصی و درسی در دشبورد:
   - شما در دشبورد هستید و به دوره، درس یا فایل خاصی متصل نیستید؛ بنابراین پاسخ خود را مستند بر جزوات شخصی کاربر ندانید.
   - اگر کاربر سوال علمی یا درسی پرسید، یک پاسخ علمی عمومی، کوتاه و آموزنده ارائه دهید.
   - اگر کاربر پاسخی دقیقاً بر اساس جزوه یا فایل PDF شخصی خود می‌خواهد، با احترام او را راهنمایی کنید که وارد دوره یا درس مربوطه در صفحه یادگیری شود تا دستیار تخصصی آن درس با دسترسی مستقیم به متن جزوه پاسخ دهد.

۴. لحن و ساختار:
   - پاسخ‌ها به زبان فارسی روان، آموزشی، ساختاریافته (همراه با بالت‌پوینت‌های خوانا) و کامپکت باشند (بین ۲ تا ۵ پاراگراف یا نکته).
   - از زیاده‌گویی و فرض‌های غیرواقعی پرهیز کنید.`;
  }
}
