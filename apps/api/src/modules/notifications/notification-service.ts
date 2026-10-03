import {
  asNotificationId,
  formatTomanPrice,
  type NotificationAction,
  type NotificationId,
  type NotificationItem,
  type NotificationType,
  type UserId,
} from "@avana/domain";
import { randomUUID } from "node:crypto";
import type {
  CreateNotificationInput,
  ListNotificationsOptions,
  ListNotificationsResult,
  NotificationRecord,
  NotificationStore,
} from "./notification-store.js";

export function toNotificationItem(
  record: NotificationRecord,
): NotificationItem {
  const action: NotificationAction | null = record.actionUrl
    ? {
        type: "navigate",
        url: record.actionUrl,
      }
    : null;

  return {
    id: record.id,
    userId: record.userId,
    type: record.type,
    title: record.title,
    message: record.message,
    isRead: record.isRead,
    readAt: record.readAt,
    metadata: record.metadata,
    action,
    createdAt: record.createdAt,
  };
}

export interface NotifyLoginDetails {
  sessionId?: string;
  deviceId?: string;
  ip?: string;
}

export interface NotifyPurchaseCompletedDetails {
  paymentId: string;
  orderId: string;
  productTitle: string;
  productType?: string;
  targetId?: string | null;
}

export interface NotifyPaymentFailedDetails {
  paymentId: string;
  orderId: string;
  reason?: string;
}

export interface NotifyWalletTopupApprovedDetails {
  paymentId: string;
  orderId: string;
  amount: number;
}

export interface NotifyWalletTopupRejectedDetails {
  paymentId: string;
  orderId: string;
  amount: number;
  reason?: string;
}

export interface NotifyGenerationCompletedDetails {
  jobId?: string;
  documentId: string;
  courseId?: string;
  lessonId?: string;
  quizId?: string;
  types?: string[];
}

export interface NotifyGenerationFailedDetails {
  jobId?: string;
  documentId: string;
  courseId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface NotifyContentReportStatusDetails {
  reportId: string;
  lessonId: string;
  courseId?: string | null;
  lessonTitle?: string | null;
  oldStatus: string;
  newStatus: string;
}

export class NotificationService {
  constructor(private readonly store: NotificationStore) {}

  async create(
    input: CreateNotificationInput,
  ): Promise<NotificationItem | null> {
    const record = await this.store.create(input);
    return record ? toNotificationItem(record) : null;
  }

  async createForUser(
    userId: UserId,
    data: {
      type: NotificationType;
      title: string;
      message: string;
      metadata?: Record<string, unknown> | null;
      actionUrl?: string | null;
      idempotencyKey?: string | null;
    },
  ): Promise<NotificationItem | null> {
    const record = await this.store.create({
      id: asNotificationId(randomUUID()),
      userId,
      ...data,
    });
    return record ? toNotificationItem(record) : null;
  }

  async findById(
    id: NotificationId,
    userId: UserId,
  ): Promise<NotificationItem | null> {
    const record = await this.store.findById(id, userId);
    return record ? toNotificationItem(record) : null;
  }

  async listForUser(
    userId: UserId,
    options?: ListNotificationsOptions,
  ): Promise<{
    items: NotificationItem[];
    total: number;
    unreadCount: number;
    page: number;
    limit: number;
  }> {
    const res: ListNotificationsResult = await this.store.listForUser(
      userId,
      options,
    );
    return {
      items: res.items.map(toNotificationItem),
      total: res.total,
      unreadCount: res.unreadCount,
      page: res.page,
      limit: res.limit,
    };
  }

  async getUnreadCount(userId: UserId): Promise<number> {
    return await this.store.getUnreadCount(userId);
  }

  async markAsRead(
    id: NotificationId,
    userId: UserId,
  ): Promise<NotificationItem | null> {
    const record = await this.store.markAsRead(id, userId);
    return record ? toNotificationItem(record) : null;
  }

  async markAllAsRead(userId: UserId): Promise<{ updatedCount: number }> {
    return await this.store.markAllAsRead(userId);
  }

  // -------------------------------------------------------------------------
  // High-level Domain Notification Methods (Production Events & Idempotency)
  // -------------------------------------------------------------------------

  /**
   * Notify user on successful login.
   * Anti-spam strategy: 1-hour deduplication window per user.
   * If a login notification exists within the last 1 hour, creation is skipped.
   */
  async notifyLogin(
    userId: UserId,
    details?: NotifyLoginDetails,
  ): Promise<NotificationItem | null> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recent = await this.store.findRecentByUserIdAndType(
      userId,
      "login_success",
      oneHourAgo,
    );

    if (recent) {
      return toNotificationItem(recent);
    }

    const hourSlot = Math.floor(Date.now() / (60 * 60 * 1000));
    const idempotencyKey = `login:${userId}:${hourSlot}`;

    const metadata: Record<string, unknown> = {};
    if (details?.deviceId) metadata.deviceId = details.deviceId;
    if (details?.sessionId) metadata.sessionId = details.sessionId;
    if (details?.ip) metadata.ip = details.ip;

    return await this.createForUser(userId, {
      type: "login_success",
      title: "ورود موفق",
      message: "ورود شما به آوانا با موفقیت انجام شد.",
      metadata: Object.keys(metadata).length > 0 ? metadata : null,
      idempotencyKey,
    });
  }

  /**
   * Notify user on successful registration.
   */
  async notifyRegistrationSuccess(
    userId: UserId,
  ): Promise<NotificationItem | null> {
    return await this.createForUser(userId, {
      type: "registration_success",
      title: "به آوانا خوش آمدید",
      message: "حساب کاربری شما با موفقیت در آوانا ایجاد شد.",
      idempotencyKey: `registration:${userId}`,
    });
  }

  /**
   * Notify user when email verification is complete.
   */
  async notifyEmailVerified(userId: UserId): Promise<NotificationItem | null> {
    return await this.createForUser(userId, {
      type: "email_verified",
      title: "تأیید ایمیل",
      message: "ایمیل شما با موفقیت تأیید شد.",
      idempotencyKey: `email_verified:${userId}`,
    });
  }

  /**
   * Notify user when a purchase is successfully completed and finalized.
   * Strictly idempotent via payment ID.
   */
  async notifyPurchaseCompleted(
    userId: UserId,
    details: NotifyPurchaseCompletedDetails,
  ): Promise<NotificationItem | null> {
    let actionUrl = "/library";
    let title = `خرید «${details.productTitle}»`;
    let message = `«${details.productTitle}» با موفقیت خریداری شد و به کتابخانه شما اضافه شد.`;

    if (details.productType === "course" && details.targetId) {
      actionUrl = `/courses/${details.targetId}`;
      title = `خرید دوره «${details.productTitle}»`;
      message = `دوره «${details.productTitle}» با موفقیت خریداری شد و به کتابخانه شما اضافه شد.`;
    } else if (details.productType === "content_pack") {
      actionUrl = "/library";
      title = `خرید بسته «${details.productTitle}»`;
      message = `بسته «${details.productTitle}» با موفقیت به کتابخانه شما اضافه شد.`;
    } else if (details.productType === "subscription") {
      actionUrl = "/account/subscription";
      title = `فعال‌سازی اشتراک «${details.productTitle}»`;
      message = `اشتراک «${details.productTitle}» با موفقیت برای شما فعال شد.`;
    } else if (details.productType === "special_exam") {
      actionUrl = "/library";
      title = `ثبت‌نام آزمون «${details.productTitle}»`;
      message = `دسترسی به آزمون «${details.productTitle}» با موفقیت برای شما فعال شد.`;
    }

    return await this.createForUser(userId, {
      type: "purchase_completed",
      title,
      message,
      actionUrl,
      metadata: {
        paymentId: details.paymentId,
        orderId: details.orderId,
        productType: details.productType,
        targetId: details.targetId,
      },
      idempotencyKey: `purchase:${details.paymentId}:completed`,
    });
  }

  /**
   * Notify user when payment fails.
   * Strictly idempotent via payment ID.
   */
  async notifyPaymentFailed(
    userId: UserId,
    details: NotifyPaymentFailedDetails,
  ): Promise<NotificationItem | null> {
    const reasonText = details.reason ? `: ${details.reason}` : ".";
    return await this.createForUser(userId, {
      type: "payment_failed",
      title: "پرداخت ناموفق",
      message: `پرداخت سفارش شما با مشکل مواجه شد${reasonText} لطفاً مجدداً تلاش کنید.`,
      actionUrl: "/pricing",
      metadata: {
        paymentId: details.paymentId,
        orderId: details.orderId,
        reason: details.reason,
      },
      idempotencyKey: `payment:${details.paymentId}:failed`,
    });
  }

  /**
   * Notify user when wallet top-up is approved by admin.
   * Strictly idempotent via payment ID.
   */
  async notifyWalletTopupApproved(
    userId: UserId,
    details: NotifyWalletTopupApprovedDetails,
  ): Promise<NotificationItem | null> {
    const formattedAmount = formatTomanPrice(details.amount);
    return await this.createForUser(userId, {
      type: "wallet_topup_approved",
      title: "شارژ کیف پول تأیید شد",
      message: `شارژ کیف پول به مبلغ ${formattedAmount} با موفقیت تأیید و اعمال شد.`,
      actionUrl: "/account/wallet",
      metadata: {
        paymentId: details.paymentId,
        orderId: details.orderId,
        amount: details.amount,
      },
      idempotencyKey: `wallet_topup:${details.paymentId}:approved`,
    });
  }

  /**
   * Notify user when wallet top-up is rejected by admin.
   * Strictly idempotent via payment ID.
   */
  async notifyWalletTopupRejected(
    userId: UserId,
    details: NotifyWalletTopupRejectedDetails,
  ): Promise<NotificationItem | null> {
    const formattedAmount = formatTomanPrice(details.amount);
    const reasonText = details.reason?.trim() ? ` علت: ${details.reason.trim()}` : "";
    return await this.createForUser(userId, {
      type: "wallet_topup_rejected",
      title: "شارژ کیف پول رد شد",
      message: `درخواست شارژ کیف پول به مبلغ ${formattedAmount} رد شد.${reasonText}`,
      actionUrl: "/account/wallet",
      metadata: {
        paymentId: details.paymentId,
        orderId: details.orderId,
        amount: details.amount,
        reason: details.reason ?? null,
      },
      idempotencyKey: `wallet_topup:${details.paymentId}:rejected`,
    });
  }

  /**
   * Notify user when requested content generation completes and is ready for use/view.
   * Strictly idempotent via generation job ID / document ID.
   */
  async notifyGenerationCompleted(
    userId: UserId,
    details: NotifyGenerationCompletedDetails,
  ): Promise<NotificationItem | null> {
    const actionUrl = details.courseId
      ? `/courses/${details.courseId}/manage`
      : "/files";

    const keyRef = details.jobId ?? details.documentId;
    return await this.createForUser(userId, {
      type: "generation_completed",
      title: "محتوای شما آماده است",
      message: "محتوای درخواستی شما آماده شده و می‌توانید آن را مشاهده کنید.",
      actionUrl,
      metadata: {
        jobId: details.jobId,
        documentId: details.documentId,
        courseId: details.courseId,
        lessonId: details.lessonId,
        quizId: details.quizId,
        types: details.types,
      },
      idempotencyKey: `generation:${keyRef}:completed`,
    });
  }

  /**
   * Notify user when content generation fails.
   * Strictly idempotent via generation job ID / document ID.
   */
  async notifyGenerationFailed(
    userId: UserId,
    details: NotifyGenerationFailedDetails,
  ): Promise<NotificationItem | null> {
    const actionUrl = details.courseId
      ? `/courses/${details.courseId}/manage`
      : "/files";

    const keyRef = details.jobId ?? details.documentId;
    return await this.createForUser(userId, {
      type: "generation_failed",
      title: "تولید محتوا ناموفق بود",
      message:
        "تولید محتوای درخواستی شما با مشکل مواجه شد. لطفاً دوباره تلاش کنید.",
      actionUrl,
      metadata: {
        jobId: details.jobId,
        documentId: details.documentId,
        courseId: details.courseId,
        errorCode: details.errorCode,
      },
      idempotencyKey: `generation:${keyRef}:failed`,
    });
  }

  /**
   * Notify student when their content/lesson problem report status changes.
   * Handles:
   *   pending -> in_review
   *   pending/in_review -> resolved
   *   pending/in_review -> dismissed
   * Strictly idempotent via report ID and new status.
   */
  async notifyContentReportStatus(
    userId: UserId,
    details: NotifyContentReportStatusDetails,
  ): Promise<NotificationItem | null> {
    const { reportId, lessonId, courseId, lessonTitle, newStatus } = details;

    let title: string;
    let message: string;

    const lessonNameSuffix = lessonTitle
      ? ` در درسنامه «${lessonTitle}»`
      : " در درسنامه";

    if (newStatus === "in_review") {
      title = "بررسی گزارش اشکال";
      message = `گزارش شما${lessonNameSuffix} در حال بررسی توسط تیم آموزشی است.`;
    } else if (newStatus === "resolved") {
      title = "رفع اشکال گزارش‌شده";
      message = `اشکال گزارش‌شده توسط شما${lessonNameSuffix} بررسی و برطرف شد. از مشارکت شما سپاسگزاریم.`;
    } else if (newStatus === "dismissed") {
      title = "نتیجه بررسی گزارش اشکال";
      message = `گزارش شما${lessonNameSuffix} بررسی شد، اما به‌عنوان مشکل قابل اصلاح تأیید نگردید.`;
    } else {
      // Unhandled or pending reversal, no notification needed
      return null;
    }

    const actionUrl = courseId
      ? `/courses/${courseId}?lessonId=${lessonId}`
      : undefined;

    return await this.createForUser(userId, {
      type: "content_report_status_changed",
      title,
      message,
      actionUrl,
      metadata: {
        reportId,
        lessonId,
        courseId: courseId ?? null,
        oldStatus: details.oldStatus,
        newStatus,
      },
      idempotencyKey: `report:${reportId}:${newStatus}`,
    });
  }

  /**
   * Notify inviter when referral reward is granted to their wallet.
   * Strictly idempotent via referral ID.
   */
  async notifyReferralRewardEarned(
    userId: UserId,
    details: { referralId: string; amount: number; invitedUserId?: string },
  ): Promise<NotificationItem | null> {
    const formattedAmount = formatTomanPrice(details.amount);
    return await this.createForUser(userId, {
      type: "referral_reward_earned",
      title: "پاداش دعوت از دوستان",
      message: `مبلغ ${formattedAmount} اعتبار هدیه به دلیل ثبت اولین خرید دوست شما به کیف پول شما واریز گردید.`,
      actionUrl: "/account/wallet",
      metadata: {
        referralId: details.referralId,
        amount: details.amount,
        invitedUserId: details.invitedUserId ?? null,
      },
      idempotencyKey: `referral_reward:${details.referralId}:notification`,
    });
  }

  // -------------------------------------------------------------------------
  // Classroom Exam & Assignment Domain Notifications (Student-Facing)
  // -------------------------------------------------------------------------

  /**
   * Notify enrolled students when an exam is published in their classroom.
   * Strictly idempotent via exam ID and student ID.
   */
  async notifyClassroomExamPublished(
    studentIds: UserId[],
    details: {
      examId: string;
      classroomId: string;
      examTitle: string;
      classTitle: string;
    },
  ): Promise<NotificationItem[]> {
    if (studentIds.length === 0) return [];

    const results: NotificationItem[] = [];
    for (const studentId of studentIds) {
      try {
        const item = await this.createForUser(studentId, {
          type: "classroom_exam_published",
          title: "آزمون جدید",
          message: `آزمون «${details.examTitle}» در کلاس «${details.classTitle}» اضافه شد.`,
          actionUrl: `/classrooms/${details.classroomId}/exams/${details.examId}`,
          metadata: {
            examId: details.examId,
            classroomId: details.classroomId,
            examTitle: details.examTitle,
            classTitle: details.classTitle,
          },
          idempotencyKey: `exam:${details.examId}:published:${studentId}`,
        });
        if (item) results.push(item);
      } catch {
        // Graceful error handling for individual recipient failure
      }
    }
    return results;
  }

  /**
   * Notify enrolled students when exam results are released by the teacher.
   * Strictly idempotent via exam ID and student ID.
   */
  async notifyClassroomExamResultsReleased(
    studentIds: UserId[],
    details: {
      examId: string;
      classroomId: string;
      examTitle: string;
      classTitle: string;
    },
  ): Promise<NotificationItem[]> {
    if (studentIds.length === 0) return [];

    const results: NotificationItem[] = [];
    for (const studentId of studentIds) {
      try {
        const item = await this.createForUser(studentId, {
          type: "classroom_exam_results_released",
          title: "اعلام نتایج آزمون",
          message: `نتایج آزمون «${details.examTitle}» در کلاس «${details.classTitle}» منتشر شد.`,
          actionUrl: `/classrooms/${details.classroomId}/exams/${details.examId}/results`,
          metadata: {
            examId: details.examId,
            classroomId: details.classroomId,
            examTitle: details.examTitle,
            classTitle: details.classTitle,
          },
          idempotencyKey: `exam:${details.examId}:results_released:${studentId}`,
        });
        if (item) results.push(item);
      } catch {
        // Graceful error handling for individual recipient failure
      }
    }
    return results;
  }

  /**
   * Notify enrolled students when an exam is manually closed by the teacher.
   * Strictly idempotent via exam ID and student ID.
   */
  async notifyClassroomExamClosed(
    studentIds: UserId[],
    details: {
      examId: string;
      classroomId: string;
      examTitle: string;
      classTitle: string;
    },
  ): Promise<NotificationItem[]> {
    if (studentIds.length === 0) return [];

    const results: NotificationItem[] = [];
    for (const studentId of studentIds) {
      try {
        const item = await this.createForUser(studentId, {
          type: "classroom_exam_closed",
          title: "پایان آزمون",
          message: `آزمون «${details.examTitle}» در کلاس «${details.classTitle}» بسته شد.`,
          actionUrl: `/classrooms/${details.classroomId}/exams/${details.examId}`,
          metadata: {
            examId: details.examId,
            classroomId: details.classroomId,
            examTitle: details.examTitle,
            classTitle: details.classTitle,
          },
          idempotencyKey: `exam:${details.examId}:closed:${studentId}`,
        });
        if (item) results.push(item);
      } catch {
        // Graceful error handling for individual recipient failure
      }
    }
    return results;
  }

  /**
   * Notify enrolled students when an exam is cancelled/archived by the teacher.
   * Strictly idempotent via exam ID and student ID.
   */
  async notifyClassroomExamArchived(
    studentIds: UserId[],
    details: {
      examId: string;
      classroomId: string;
      examTitle: string;
      classTitle: string;
    },
  ): Promise<NotificationItem[]> {
    if (studentIds.length === 0) return [];

    const results: NotificationItem[] = [];
    for (const studentId of studentIds) {
      try {
        const item = await this.createForUser(studentId, {
          type: "classroom_exam_archived",
          title: "لغو آزمون",
          message: `آزمون «${details.examTitle}» در کلاس «${details.classTitle}» لغو شد.`,
          actionUrl: `/classrooms/${details.classroomId}`,
          metadata: {
            examId: details.examId,
            classroomId: details.classroomId,
            examTitle: details.examTitle,
            classTitle: details.classTitle,
          },
          idempotencyKey: `exam:${details.examId}:archived:${studentId}`,
        });
        if (item) results.push(item);
      } catch {
        // Graceful error handling for individual recipient failure
      }
    }
    return results;
  }

  /**
   * Notify enrolled students when an assignment is published in their classroom.
   * Strictly idempotent via assignment ID and student ID.
   */
  async notifyClassroomAssignmentPublished(
    studentIds: UserId[],
    details: {
      assignmentId: string;
      classroomId: string;
      assignmentTitle: string;
      classTitle: string;
    },
  ): Promise<NotificationItem[]> {
    if (studentIds.length === 0) return [];

    const results: NotificationItem[] = [];
    for (const studentId of studentIds) {
      try {
        const item = await this.createForUser(studentId, {
          type: "classroom_assignment_published",
          title: "تکلیف جدید",
          message: `تکلیف «${details.assignmentTitle}» در کلاس «${details.classTitle}» اضافه شد.`,
          actionUrl: `/classrooms/${details.classroomId}`,
          metadata: {
            assignmentId: details.assignmentId,
            classroomId: details.classroomId,
            assignmentTitle: details.assignmentTitle,
            classTitle: details.classTitle,
          },
          idempotencyKey: `assignment:${details.assignmentId}:published:${studentId}`,
        });
        if (item) results.push(item);
      } catch {
        // Graceful error handling for individual recipient failure
      }
    }
    return results;
  }

  /**
   * Notify enrolled students when an assignment due date is changed.
   * Strictly idempotent via assignment ID, new due date string, and student ID.
   */
  async notifyClassroomAssignmentDueChanged(
    studentIds: UserId[],
    details: {
      assignmentId: string;
      classroomId: string;
      assignmentTitle: string;
      classTitle: string;
      dueAt: string;
    },
  ): Promise<NotificationItem[]> {
    if (studentIds.length === 0) return [];

    const results: NotificationItem[] = [];
    for (const studentId of studentIds) {
      try {
        const item = await this.createForUser(studentId, {
          type: "classroom_assignment_due_changed",
          title: "تغییر مهلت تکلیف",
          message: `مهلت تکلیف «${details.assignmentTitle}» در کلاس «${details.classTitle}» تغییر کرد.`,
          actionUrl: `/classrooms/${details.classroomId}`,
          metadata: {
            assignmentId: details.assignmentId,
            classroomId: details.classroomId,
            assignmentTitle: details.assignmentTitle,
            classTitle: details.classTitle,
            dueAt: details.dueAt,
          },
          idempotencyKey: `assignment:${details.assignmentId}:due:${details.dueAt}:${studentId}`,
        });
        if (item) results.push(item);
      } catch {
        // Graceful error handling for individual recipient failure
      }
    }
    return results;
  }

  /**
   * Notify enrolled students when an assignment is archived/cancelled.
   * Strictly idempotent via assignment ID and student ID.
   */
  async notifyClassroomAssignmentArchived(
    studentIds: UserId[],
    details: {
      assignmentId: string;
      classroomId: string;
      assignmentTitle: string;
      classTitle: string;
    },
  ): Promise<NotificationItem[]> {
    if (studentIds.length === 0) return [];

    const results: NotificationItem[] = [];
    for (const studentId of studentIds) {
      try {
        const item = await this.createForUser(studentId, {
          type: "classroom_assignment_archived",
          title: "تغییر وضعیت تکلیف",
          message: `تکلیف «${details.assignmentTitle}» در کلاس «${details.classTitle}» بسته شد.`,
          actionUrl: `/classrooms/${details.classroomId}`,
          metadata: {
            assignmentId: details.assignmentId,
            classroomId: details.classroomId,
            assignmentTitle: details.assignmentTitle,
            classTitle: details.classTitle,
          },
          idempotencyKey: `assignment:${details.assignmentId}:archived:${studentId}`,
        });
        if (item) results.push(item);
      } catch {
        // Graceful error handling for individual recipient failure
      }
    }
    return results;
  }

  /**
   * Notify teacher when a student submits a new conversation/question.
   * Strictly idempotent via conversation ID.
   */
  async notifyTeacherNewMessage(
    teacherId: UserId,
    details: {
      conversationId: string;
      classroomId: string;
      studentId: string;
      subject: string;
      classTitle: string;
    },
  ): Promise<NotificationItem | null> {
    return await this.createForUser(teacherId, {
      type: "teacher_new_message",
      title: "پیام جدید از دانشجو",
      message: `پیام جدیدی با عنوان «${details.subject}» در کلاس «${details.classTitle}» دریافت کردید.`,
      actionUrl: `/teacher/messages/${details.conversationId}`,
      metadata: {
        conversationId: details.conversationId,
        classroomId: details.classroomId,
        studentId: details.studentId,
      },
      idempotencyKey: `msg:create:${details.conversationId}`,
    });
  }

  /**
   * Notify student when their teacher replies to a conversation.
   * Strictly idempotent via reply message ID.
   */
  async notifyTeacherReplyMessage(
    studentId: UserId,
    details: {
      messageId: string;
      conversationId: string;
      classroomId: string;
      teacherId: string;
      subject: string;
    },
  ): Promise<NotificationItem | null> {
    return await this.createForUser(studentId, {
      type: "teacher_reply_message",
      title: "پاسخ جدید از استاد",
      message: `استاد به پیام شما با عنوان «${details.subject}» پاسخ داد.`,
      actionUrl: `/classrooms/${details.classroomId}?tab=messages&id=${details.conversationId}`,
      metadata: {
        conversationId: details.conversationId,
        classroomId: details.classroomId,
        teacherId: details.teacherId,
      },
      idempotencyKey: `msg:reply:${details.messageId}`,
    });
  }
}
