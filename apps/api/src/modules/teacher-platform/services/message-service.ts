import { randomUUID } from "node:crypto";
import {
  DomainError,
  asUserId,
  type Actor,
  type TeacherConversation,
  type TeacherConversationMessage,
  canTransitionTeacherMessageStatus,
  validateCreateTeacherConversationInput,
  validateReplyTeacherConversationInput,
  validateUpdateTeacherConversationStatusInput,
  validateListTeacherConversationsQuery,
} from "@avana/domain";
import type {
  TeacherConversationStore,
  TeacherConversationMessageStore,
  ClassroomStore,
  ClassroomMemberStore,
} from "../stores.js";
import type { UserStore } from "../../identity/user-store.js";
import type { NotificationService } from "../../notifications/notification-service.js";

export interface TeacherConversationListItemDTO extends TeacherConversation {
  studentName: string;
  studentEmail: string;
  classroomTitle: string;
  messageCount: number;
}

export interface StudentConversationListItemDTO extends TeacherConversation {
  teacherName: string;
  classroomTitle: string;
  messageCount: number;
}

export interface TeacherConversationDetailDTO {
  conversation: TeacherConversation;
  messages: TeacherConversationMessage[];
  student: {
    id: string;
    name: string;
    email: string;
  };
  classroom: {
    id: string;
    title: string;
  };
}

export interface StudentConversationDetailDTO {
  conversation: TeacherConversation;
  messages: TeacherConversationMessage[];
  teacher: {
    id: string;
    name: string;
    email: string;
  };
  classroom: {
    id: string;
    title: string;
  };
}

export class TeacherMessageService {
  constructor(
    private readonly conversationStore: TeacherConversationStore,
    private readonly messageStore: TeacherConversationMessageStore,
    private readonly classroomStore: ClassroomStore,
    private readonly memberStore: ClassroomMemberStore,
    private readonly userStore: UserStore,
    private readonly notificationService?: NotificationService,
  ) {}

  // ---------------------------------------------------------------------------
  // Student Actions
  // ---------------------------------------------------------------------------

  /**
   * Creates a new conversation with a teacher for a classroom the student is enrolled in.
   */
  async createConversation(
    actor: Actor,
    rawInput: unknown,
  ): Promise<{
    conversation: TeacherConversation;
    message: TeacherConversationMessage;
  }> {
    const input = validateCreateTeacherConversationInput(rawInput);

    // Verify classroom existence
    const classroom = await this.classroomStore.getById(input.classroomId);
    if (!classroom || classroom.status === "archived") {
      throw new DomainError("not_found", "کلاس مورد نظر یافت نشد.");
    }

    // Verify student is not the teacher of the classroom (cannot message self)
    if (classroom.teacherId === actor.userId) {
      throw new DomainError(
        "bad_request",
        "امکان ارسال پیام به خود به عنوان استاد این کلاس وجود ندارد.",
      );
    }

    // Verify student membership (must be active member)
    const membership = await this.memberStore.getMembership(
      input.classroomId,
      actor.userId,
    );
    if (!membership || membership.status !== "active") {
      throw new DomainError(
        "forbidden",
        "شما عضو فعال این کلاس نیستید و امکان ارسال پیام برای استاد این کلاس را ندارید.",
      );
    }

    const convId = randomUUID();
    const msgId = randomUUID();
    const now = new Date().toISOString();

    const conversation = await this.conversationStore.create({
      id: convId,
      studentId: actor.userId,
      teacherId: classroom.teacherId,
      classroomId: classroom.id,
      category: input.category,
      subject: input.subject,
      status: "new",
      lastActivityAt: now,
      lastSenderRole: "student",
      studentReadAt: now,
      teacherReadAt: null,
      answeredAt: null,
      closedAt: null,
    });

    const message = await this.messageStore.create({
      id: msgId,
      conversationId: convId,
      senderId: actor.userId,
      senderRole: "student",
      body: input.body,
    });

    // Optional notification to teacher
    if (this.notificationService) {
      try {
        await this.notificationService.notifyTeacherNewMessage(
          asUserId(classroom.teacherId),
          {
            conversationId: convId,
            classroomId: classroom.id,
            studentId: actor.userId,
            subject: input.subject,
            classTitle: classroom.title || "کلاس",
          },
        );
      } catch {
        // Notification failure should not block message creation
      }
    }

    return { conversation, message };
  }

  /**
   * Lists conversations created by the student.
   */
  async listStudentConversations(
    actor: Actor,
    rawQuery: unknown,
  ): Promise<{
    conversations: StudentConversationListItemDTO[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    unreadCount: number;
  }> {
    const query = validateListTeacherConversationsQuery(rawQuery);
    const { conversations, total } =
      await this.conversationStore.listByStudent(actor.userId, {
        classroomId: query.classroomId,
        page: query.page,
        limit: query.limit,
      });

    const unreadCount = await this.conversationStore.countUnreadForStudent(
      actor.userId,
    );

    // Enrich with teacher and classroom details
    const enriched: StudentConversationListItemDTO[] = [];
    for (const conv of conversations) {
      const teacher = await this.userStore.findById(asUserId(conv.teacherId));
      const classroom = await this.classroomStore.getById(conv.classroomId);
      const messageCount = await this.messageStore.countByConversation(conv.id);

      const teacherName =
        teacher?.name?.trim() || teacher?.email || "استاد گرامی";
      const classroomTitle = classroom?.title || "کلاس";

      enriched.push({
        ...conv,
        teacherName,
        classroomTitle,
        messageCount,
      });
    }

    const totalPages = Math.ceil(total / query.limit) || 1;

    return {
      conversations: enriched,
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
      unreadCount,
    };
  }

  /**
   * Gets conversation details with full message history for the student.
   */
  async getStudentConversation(
    actor: Actor,
    conversationId: string,
  ): Promise<StudentConversationDetailDTO> {
    const conv = await this.conversationStore.getById(conversationId);
    if (!conv) {
      throw new DomainError("not_found", "مکالمه یافت نشد.");
    }

    // IDOR check: student can only view their own conversation
    if (conv.studentId !== actor.userId) {
      throw new DomainError("not_found", "مکالمه یافت نشد.");
    }

    // Mark read if teacher was the last sender
    if (conv.lastSenderRole === "teacher") {
      await this.conversationStore.markStudentRead(conversationId);
      conv.studentReadAt = new Date().toISOString();
    }

    const messages = await this.messageStore.listByConversation(conversationId);
    const teacher = await this.userStore.findById(asUserId(conv.teacherId));
    const classroom = await this.classroomStore.getById(conv.classroomId);

    return {
      conversation: conv,
      messages,
      teacher: {
        id: conv.teacherId,
        name: teacher?.name?.trim() || teacher?.email || "استاد گرامی",
        email: teacher?.email || "",
      },
      classroom: {
        id: conv.classroomId,
        title: classroom?.title || "کلاس",
      },
    };
  }

  /**
   * Replies to an existing conversation as the student.
   */
  async replyAsStudent(
    actor: Actor,
    conversationId: string,
    rawInput: unknown,
  ): Promise<{
    message: TeacherConversationMessage;
    conversation: TeacherConversation;
  }> {
    const input = validateReplyTeacherConversationInput(rawInput);
    const conv = await this.conversationStore.getById(conversationId);
    if (!conv) {
      throw new DomainError("not_found", "مکالمه یافت نشد.");
    }

    // IDOR check
    if (conv.studentId !== actor.userId) {
      throw new DomainError("not_found", "مکالمه یافت نشد.");
    }

    const msgId = randomUUID();
    const now = new Date().toISOString();

    const message = await this.messageStore.create({
      id: msgId,
      conversationId: conv.id,
      senderId: actor.userId,
      senderRole: "student",
      body: input.body,
    });

    // Update conversation status: if closed or answered, transition to in_progress
    const newStatus =
      conv.status === "closed" || conv.status === "answered"
        ? "in_progress"
        : conv.status;

    const updated = await this.conversationStore.update(conv.id, {
      status: newStatus,
      lastActivityAt: now,
      lastSenderRole: "student",
      studentReadAt: now,
      teacherReadAt: null,
      closedAt: null, // Clear closedAt if reopened
    });

    return {
      message,
      conversation: updated || conv,
    };
  }

  // ---------------------------------------------------------------------------
  // Teacher Actions
  // ---------------------------------------------------------------------------

  /**
   * Lists conversations assigned to the teacher with filters and pagination.
   */
  async listTeacherConversations(
    actor: Actor,
    rawQuery: unknown,
  ): Promise<{
    conversations: TeacherConversationListItemDTO[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    unreadCount: number;
  }> {
    const query = validateListTeacherConversationsQuery(rawQuery);
    const { conversations, total } =
      await this.conversationStore.listByTeacher(actor.userId, {
        status: query.status,
        category: query.category,
        classroomId: query.classroomId,
        page: query.page,
        limit: query.limit,
      });

    const unreadCount = await this.conversationStore.countUnreadForTeacher(
      actor.userId,
    );

    // Enrich with student and classroom details
    const enriched: TeacherConversationListItemDTO[] = [];
    for (const conv of conversations) {
      const student = await this.userStore.findById(asUserId(conv.studentId));
      const classroom = await this.classroomStore.getById(conv.classroomId);
      const messageCount = await this.messageStore.countByConversation(conv.id);

      const studentName =
        student?.name?.trim() || student?.email || "دانشجو";
      const classroomTitle = classroom?.title || "کلاس";

      enriched.push({
        ...conv,
        studentName,
        studentEmail: student?.email || "",
        classroomTitle,
        messageCount,
      });
    }

    const totalPages = Math.ceil(total / query.limit) || 1;

    return {
      conversations: enriched,
      total,
      page: query.page,
      limit: query.limit,
      totalPages,
      unreadCount,
    };
  }

  /**
   * Gets conversation details with full message history for the teacher.
   */
  async getTeacherConversation(
    actor: Actor,
    conversationId: string,
  ): Promise<TeacherConversationDetailDTO> {
    const conv = await this.conversationStore.getById(conversationId);
    if (!conv) {
      throw new DomainError("not_found", "مکالمه یافت نشد.");
    }

    // Teacher IDOR check: must be teacher of conversation or platform_admin
    const isOwner = conv.teacherId === actor.userId;
    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";
    if (!isOwner && !isPlatformAdmin) {
      throw new DomainError("not_found", "مکالمه یافت نشد.");
    }

    // Mark read if teacher is viewing and last sender was student
    if (isOwner && conv.lastSenderRole === "student") {
      await this.conversationStore.markTeacherRead(conversationId);
      conv.teacherReadAt = new Date().toISOString();
    }

    const messages = await this.messageStore.listByConversation(conversationId);
    const student = await this.userStore.findById(asUserId(conv.studentId));
    const classroom = await this.classroomStore.getById(conv.classroomId);

    return {
      conversation: conv,
      messages,
      student: {
        id: conv.studentId,
        name: student?.name?.trim() || student?.email || "دانشجو",
        email: student?.email || "",
      },
      classroom: {
        id: conv.classroomId,
        title: classroom?.title || "کلاس",
      },
    };
  }

  /**
   * Replies to a conversation as the teacher.
   * Automatically marks status as 'answered' and updates timestamps.
   */
  async replyAsTeacher(
    actor: Actor,
    conversationId: string,
    rawInput: unknown,
  ): Promise<{
    message: TeacherConversationMessage;
    conversation: TeacherConversation;
  }> {
    const input = validateReplyTeacherConversationInput(rawInput);
    const conv = await this.conversationStore.getById(conversationId);
    if (!conv) {
      throw new DomainError("not_found", "مکالمه یافت نشد.");
    }

    // Authorization
    const isOwner = conv.teacherId === actor.userId;
    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";
    if (!isOwner && !isPlatformAdmin) {
      throw new DomainError("not_found", "مکالمه یافت نشد.");
    }

    const msgId = randomUUID();
    const now = new Date().toISOString();

    const message = await this.messageStore.create({
      id: msgId,
      conversationId: conv.id,
      senderId: actor.userId,
      senderRole: "teacher",
      body: input.body,
    });

    const updated = await this.conversationStore.update(conv.id, {
      status: "answered",
      answeredAt: now,
      lastActivityAt: now,
      lastSenderRole: "teacher",
      teacherReadAt: now,
      studentReadAt: null,
      closedAt: null,
    });

    // Notify student
    if (this.notificationService) {
      try {
        await this.notificationService.notifyTeacherReplyMessage(
          asUserId(conv.studentId),
          {
            messageId: msgId,
            conversationId: conv.id,
            classroomId: conv.classroomId,
            teacherId: conv.teacherId,
            subject: conv.subject,
          },
        );
      } catch {
        // Non-blocking
      }
    }

    return {
      message,
      conversation: updated || conv,
    };
  }

  /**
   * Updates conversation status as the teacher (e.g. mark closed or in_progress).
   */
  async updateStatusAsTeacher(
    actor: Actor,
    conversationId: string,
    rawInput: unknown,
  ): Promise<{ conversation: TeacherConversation }> {
    const input = validateUpdateTeacherConversationStatusInput(rawInput);
    const conv = await this.conversationStore.getById(conversationId);
    if (!conv) {
      throw new DomainError("not_found", "مکالمه یافت نشد.");
    }

    // Authorization
    const isOwner = conv.teacherId === actor.userId;
    const isPlatformAdmin =
      actor.globalRole === "platform_admin" || actor.role === "platform_admin";
    if (!isOwner && !isPlatformAdmin) {
      throw new DomainError("not_found", "مکالمه یافت نشد.");
    }

    if (!canTransitionTeacherMessageStatus(conv.status, input.status)) {
      throw new DomainError(
        "bad_request",
        `امکان تغییر وضعیت از «${conv.status}» به «${input.status}» وجود ندارد.`,
      );
    }

    const updated = await this.conversationStore.updateStatus(
      conv.id,
      input.status,
    );

    return {
      conversation: updated || conv,
    };
  }
}
