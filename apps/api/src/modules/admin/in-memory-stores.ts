/**
 * In-memory implementation of AdminStore.
 * Used for local development (composeLocalDev) and testing.
 */

import { STAGE_LABELS_FA, type UserId, type Role } from "@avana/domain";
import type {
  DocumentGenerationProgressResource,
  GenerationPipelineStage,
  GenerationProgressStatus,
} from "@avana/contracts";
import type { UserStore, UserRecord } from "../identity/user-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import { checkRedisHealth } from "./redis-health.js";
import type {
  AdminStore,
  DashboardStats,
  AdminUsersList,
  AdminGenerationJobRecord,
  DataIntegrityReport,
  AdminCourseRecord,
  AdminDocumentRecord,
  AdminSystemHealth,
  AdminStoreOptions,
  AdminLogRecord,
  AdminAuditRecord,
  AdminLessonRecord,
  AdminFlashcardRecord,
  AdminExamRecord,
  AdminGenerationDetail,
  AdminCourseHierarchy,
  AdminAnalytics,
  AdminAiAnalytics,
  AdminCommerceStats,
  AdminOrderRecord,
  AdminOrdersList,
  AdminPaymentRecord,
  AdminPaymentsList,
  AdminSubscriptionRecord,
  AdminSubscriptionsList,
  AdminEntitlementRecord,
  AdminEntitlementsList,
  AdminProductRecord,
  AdminUserCommerceProfile,
  AdminGrantInput,
} from "./admin-store.js";

export class InMemoryAdminStore implements AdminStore {
  constructor(
    private readonly userStore?: UserStore & { insert?(user: UserRecord): void },
    private readonly organizationStore?: OrganizationStore & { listMembershipsByUserId?(userId: UserId): Promise<Array<{ role: Role; updatedAt: string }>> },
    private readonly options?: AdminStoreOptions,
  ) {}
  async getDashboardStats(): Promise<DashboardStats> {
    return {
      totalUsers: 0,
      newUsersToday: 0,
      totalCourses: 0,
      totalLessons: 0,
      totalFlashcards: 0,
      totalQuizzes: 0,
      totalDocuments: 0,
      generationSuccessRate: 100,
      generationsToday: 0,
    };
  }

  async listUsers(_params?: { page: number; pageSize: number; search?: string }): Promise<AdminUsersList> {
    return { users: [], totalCount: 0 };
  }

  async listGenerationJobs(_params?: { page: number; pageSize: number; status?: string }): Promise<{ jobs: AdminGenerationJobRecord[]; totalCount: number }> {
    return { jobs: [], totalCount: 0 };
  }

  async getDataIntegrityReport(): Promise<DataIntegrityReport> {
    return {
      lessonsWithoutModule: 0,
      flashcardsWithoutLesson: 0,
      quizzesWithoutLesson: 0,
      documentsWithoutCourse: 0,
      failedGenerations: 0,
    };
  }

  private formatDocumentGenerationProgress(
    p: any,
    docStatus: string,
    docErrorCode?: string | null,
  ): DocumentGenerationProgressResource {
    if (p) {
      let status = p.status as GenerationProgressStatus;
      if (docStatus === "ready" && status !== "completed") {
        status = "completed";
      } else if (docStatus === "failed" && status !== "failed") {
        status = "failed";
      }

      const stage = (p.stage as GenerationPipelineStage | null) ?? null;
      const stageLabel = stage ? STAGE_LABELS_FA[stage] || stage : null;
      let progress = null;
      if (status === "generating" || status === "planning" || status === "reviewing") {
        const total = p.progressTotal > 0 ? p.progressTotal : 1;
        const current = Math.min(p.progressCurrent, total);
        const percentage = Math.min(100, Math.round((current / total) * 100));
        progress = {
          current: p.progressCurrent,
          total: p.progressTotal,
          percentage,
        };
      }
      return {
        status,
        stage,
        stageLabel,
        progress,
        stageStartedAt: p.stageStartedAt ? (typeof p.stageStartedAt === "string" ? p.stageStartedAt : p.stageStartedAt.toISOString()) : null,
        lastActivityAt: p.lastActivityAt ? (typeof p.lastActivityAt === "string" ? p.lastActivityAt : p.lastActivityAt.toISOString()) : null,
        error: p.errorMessage,
      };
    }

    if (docStatus === "generating") {
      return {
        status: "generating",
        stage: null,
        stageLabel: null,
        progress: null,
        stageStartedAt: null,
        lastActivityAt: null,
        error: null,
      };
    }
    if (docStatus === "review_pending") {
      return {
        status: "reviewing",
        stage: "review",
        stageLabel: STAGE_LABELS_FA.review,
        progress: null,
        stageStartedAt: null,
        lastActivityAt: null,
        error: null,
      };
    }
    if (docStatus === "ready") {
      return {
        status: "completed",
        stage: null,
        stageLabel: null,
        progress: null,
        stageStartedAt: null,
        lastActivityAt: null,
        error: null,
      };
    }
    if (docStatus === "failed") {
      return {
        status: "failed",
        stage: null,
        stageLabel: null,
        progress: null,
        stageStartedAt: null,
        lastActivityAt: null,
        error: docErrorCode || "خطا در پردازش یا تولید سند",
      };
    }
    return {
      status: "idle",
      stage: null,
      stageLabel: null,
      progress: null,
      stageStartedAt: null,
      lastActivityAt: null,
      error: null,
    };
  }

  async listCourses(_params?: { page: number; pageSize: number; search?: string }): Promise<{ courses: AdminCourseRecord[]; totalCount: number }> {
    return { courses: [], totalCount: 0 };
  }

  async listDocuments(params?: { page: number; pageSize: number; search?: string; status?: string }): Promise<{ documents: AdminDocumentRecord[]; totalCount: number }> {
    if (this.options && (this.options as any).documentStore) {
      const docStore = (this.options as any).documentStore;
      let allDocs: any[] = [];
      if (typeof docStore.getAll === "function") {
        allDocs = docStore.getAll();
      } else if (typeof docStore.listAll === "function") {
        allDocs = await docStore.listAll();
      }
      
      let filtered = allDocs.filter((d: any) => !d.deletedAt);
      if (params?.search) {
        filtered = filtered.filter((d: any) => d.originalName?.toLowerCase().includes(params.search!.toLowerCase()));
      }
      if (params?.status) {
        filtered = filtered.filter((d: any) => d.status === params.status);
      }
      
      const progressStore = (this.options as any).generationProgressStore;
      const docsWithProgress: AdminDocumentRecord[] = await Promise.all(
        filtered.map(async (doc: any) => {
          let progressRecord = null;
          if (progressStore && typeof progressStore.findByDocument === "function") {
            progressRecord = await progressStore.findByDocument(doc.id, doc.organizationId);
          }
          return {
            id: doc.id,
            organizationId: doc.organizationId,
            originalName: doc.originalName,
            mimeType: doc.mimeType,
            sizeBytes: doc.sizeBytes,
            status: doc.status,
            createdAt: doc.createdAt,
            courseName: undefined,
            ownerEmail: undefined,
            generationProgress: this.formatDocumentGenerationProgress(progressRecord, doc.status, doc.errorCode),
          };
        })
      );

      const page = params?.page || 1;
      const pageSize = params?.pageSize || 20;
      const offset = (page - 1) * pageSize;
      const paged = docsWithProgress.slice(offset, offset + pageSize);
      return { documents: paged, totalCount: docsWithProgress.length };
    }
    return { documents: [], totalCount: 0 };
  }

  async getDocument(id: string): Promise<AdminDocumentRecord | null> {
    if (this.options && (this.options as any).documentStore) {
      const doc = await (this.options as any).documentStore.findById(id);
      if (doc) {
        const progressStore = (this.options as any).generationProgressStore;
        let progressRecord = null;
        if (progressStore && typeof progressStore.findByDocument === "function") {
          progressRecord = await progressStore.findByDocument(doc.id, doc.organizationId);
        }
        return {
          id: doc.id,
          organizationId: doc.organizationId,
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          sizeBytes: doc.sizeBytes,
          status: doc.status,
          createdAt: doc.createdAt,
          courseName: undefined,
          ownerEmail: undefined,
          generationProgress: this.formatDocumentGenerationProgress(progressRecord, doc.status, doc.errorCode),
        };
      }
    }
    return null;
  }

  async getSystemHealth(): Promise<AdminSystemHealth> {
    const redisResult = await checkRedisHealth(this.options?.redisUrl, 1000);
    let aiStatus: string = "healthy";
    let aiReason: string | null | undefined = null;
    let aiLatency: number | null | undefined = 0;

    if (this.options?.gateway?.checkHealth) {
      try {
        const aiCheck = await this.options.gateway.checkHealth();
        aiStatus = aiCheck.status;
        aiReason = aiCheck.reason;
        aiLatency = aiCheck.latencyMs;
      } catch (err: unknown) {
        aiStatus = "unhealthy";
        aiReason = err instanceof Error ? err.message : "AI health check failed";
      }
    }

    return {
      database: "healthy",
      redis: redisResult.status,
      ai: aiStatus,
      lastCheck: new Date().toISOString(),
      services: {
        database: { status: "healthy", latencyMs: 0 },
        redis: { status: redisResult.status, reason: redisResult.reason, latencyMs: redisResult.latencyMs },
        ai: { status: aiStatus, reason: aiReason, latencyMs: aiLatency },
      },
    };
  }

  async listLogs(_params?: { page: number; pageSize: number; level?: string }): Promise<{ logs: AdminLogRecord[]; totalCount: number }> {
    return { logs: [], totalCount: 0 };
  }

  async listAuditLogs(_params?: { page: number; pageSize: number; search?: string; action?: string; entityType?: string; adminEmail?: string }): Promise<{ logs: AdminAuditRecord[]; totalCount: number }> {
    return { logs: [], totalCount: 0 };
  }

  async listLessons(_params?: { page: number; pageSize: number; search?: string }): Promise<{ lessons: AdminLessonRecord[]; totalCount: number }> {
    return { lessons: [], totalCount: 0 };
  }

  async listFlashcards(_params?: { page: number; pageSize: number; search?: string }): Promise<{ flashcards: AdminFlashcardRecord[]; totalCount: number }> {
    return { flashcards: [], totalCount: 0 };
  }

  async listExams(_params?: { page: number; pageSize: number; search?: string }): Promise<{ exams: AdminExamRecord[]; totalCount: number }> {
    return { exams: [], totalCount: 0 };
  }

  async getCourseHierarchy(_courseId: string): Promise<AdminCourseHierarchy | null> {
    return null;
  }

  async getGenerationJob(_id: string): Promise<AdminGenerationDetail | null> {
    return null;
  }

  async getAnalytics(): Promise<AdminAnalytics> {
    const emptyStats = {
      newUsers: 0,
      courses: 0,
      lessons: 0,
      flashcards: 0,
      quizzes: 0,
      aiJobs: 0,
      aiSuccess: 0,
      aiFailed: 0,
    };
    return {
      total: { totalUsers: 0, totalCourses: 0, totalLessons: 0, totalFlashcards: 0, totalQuizzes: 0 },
      today: emptyStats,
      last7Days: emptyStats,
      last30Days: emptyStats,
    };
  }

  async getAiAnalytics(): Promise<AdminAiAnalytics> {
    return {
      overview: {
        totalJobs: 0,
        successful: 0,
        failed: 0,
        processing: 0,
        successRate: 0,
        averageDurationMs: 0,
      },
      byType: {},
      tokens: {
        available: false,
        input: 0,
        output: 0,
        total: 0,
      },
    };
  }

  async updateUserRole(_adminId: string, targetUserId: string, newRole: string): Promise<void> {
    if (this.userStore) {
      const user = await this.userStore.findById(targetUserId as UserId);
      if (user) {
        if (newRole === "platform_admin") {
          user.globalRole = "platform_admin";
          user.role = "platform_admin";
        } else {
          user.globalRole = null;
          user.role = newRole as Role;
          if (this.organizationStore && typeof this.organizationStore.listMembershipsByUserId === "function") {
            const memberships = await this.organizationStore.listMembershipsByUserId(targetUserId as UserId);
            if (memberships.length === 1) {
              const mem = memberships[0];
              mem.role = newRole as Role;
              mem.updatedAt = new Date().toISOString();
            }
          }
        }
        if (typeof this.userStore.insert === "function") {
          this.userStore.insert({
            ...user,
            role: user.role,
            globalRole: user.globalRole,
          });
        }
      }
    }
  }

  async updateCourseMetadata(_adminId: string, _courseId: string, _payload: { name?: string; subject?: string }): Promise<void> {
    return;
  }

  async retryDocumentProcessing(_adminId: string, _documentId: string): Promise<void> {
    return;
  }

  async retryGenerationJob(_adminId: string, _jobId: string): Promise<void> {
    return;
  }

  // ---------------------------------------------------------------------------
  // Monetization & Commerce
  // ---------------------------------------------------------------------------

  private memoryProducts: AdminProductRecord[] = [
    {
      id: "prod_sub_monthly",
      code: "sub_monthly",
      type: "subscription",
      title: "اشتراک ماهانه آوانا",
      description: "دسترسی کامل یک‌ماهه به تمام محتوای ویژه و دستیار هوشمند آوانا",
      price: 99000,
      currency: "toman",
      targetType: "plan",
      targetId: null,
      durationDays: 30,
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: "prod_sub_quarterly",
      code: "sub_quarterly",
      type: "subscription",
      title: "اشتراک سه‌ماهه آوانا",
      description: "دسترسی کامل سه‌ماهه به تمام محتوای ویژه و دستیار هوشمند آوانا",
      price: 199000,
      currency: "toman",
      targetType: "plan",
      targetId: null,
      durationDays: 90,
      active: true,
      createdAt: new Date().toISOString(),
    },
    {
      id: "prod_sub_yearly",
      code: "sub_yearly",
      type: "subscription",
      title: "اشتراک سالانه آوانا",
      description: "دسترسی کامل دوازده‌ماهه به تمام محتوای ویژه و دستیار هوشمند آوانا با بیشترین تخفیف",
      price: 599000,
      currency: "toman",
      targetType: "plan",
      targetId: null,
      durationDays: 365,
      active: true,
      createdAt: new Date().toISOString(),
    },
  ];

  private memoryOrders: AdminOrderRecord[] = [];
  private memoryPayments: AdminPaymentRecord[] = [];
  private memorySubscriptions: AdminSubscriptionRecord[] = [];
  private memoryEntitlements: AdminEntitlementRecord[] = [];

  async getCommerceStats(): Promise<AdminCommerceStats> {
    let totalRevenue = 0;
    let todayRevenue = 0;
    let currentMonthRevenue = 0;
    let subscriptionRevenue = 0;
    let courseRevenue = 0;
    let contentPackRevenue = 0;

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    for (const p of this.memoryPayments) {
      if (p.status === "paid") {
        totalRevenue += p.amount;
        const paidDate = p.paidAt ? new Date(p.paidAt) : new Date(p.createdAt);
        if (paidDate >= today) todayRevenue += p.amount;
        if (paidDate >= monthStart) currentMonthRevenue += p.amount;
      }
    }

    let successfulOrders = 0;
    let pendingOrders = 0;
    for (const o of this.memoryOrders) {
      if (o.status === "paid") successfulOrders++;
      if (o.status === "pending") pendingOrders++;
    }

    let failedPayments = 0;
    for (const p of this.memoryPayments) {
      if (p.status === "failed" || p.status === "cancelled") failedPayments++;
    }

    let activeSubscriptions = 0;
    for (const s of this.memorySubscriptions) {
      if (s.status === "active" && new Date(s.expiresAt) >= now) activeSubscriptions++;
    }

    let lifetimePurchases = 0;
    for (const e of this.memoryEntitlements) {
      if (e.lifetime) lifetimePurchases++;
    }

    return {
      totalRevenue,
      todayRevenue,
      currentMonthRevenue,
      successfulOrders,
      activeSubscriptions,
      lifetimePurchases,
      subscriptionRevenue,
      courseRevenue,
      contentPackRevenue,
      pendingOrders,
      failedPayments,
    };
  }

  async listCommerceOrders(params: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
    from?: string;
    to?: string;
  }): Promise<AdminOrdersList> {
    let filtered = [...this.memoryOrders];
    if (params.status && params.status !== "all") {
      filtered = filtered.filter((o) => o.status === params.status);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(q) ||
          o.userEmail.toLowerCase().includes(q) ||
          o.productTitle.toLowerCase().includes(q)
      );
    }
    const offset = (params.page - 1) * params.pageSize;
    return {
      orders: filtered.slice(offset, offset + params.pageSize),
      totalCount: filtered.length,
    };
  }

  async listCommercePayments(params: {
    page: number;
    pageSize: number;
    search?: string;
    gateway?: string;
    status?: string;
    from?: string;
    to?: string;
  }): Promise<AdminPaymentsList> {
    let filtered = [...this.memoryPayments];
    if (params.gateway && params.gateway !== "all") {
      filtered = filtered.filter((p) => p.gateway === params.gateway);
    }
    if (params.status && params.status !== "all") {
      filtered = filtered.filter((p) => p.status === params.status);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.orderNumber.toLowerCase().includes(q) ||
          p.userEmail.toLowerCase().includes(q) ||
          (p.authority && p.authority.toLowerCase().includes(q)) ||
          (p.trackingNumber && p.trackingNumber.toLowerCase().includes(q)) ||
          (p.payerName && p.payerName.toLowerCase().includes(q)),
      );
    }
    const offset = (params.page - 1) * params.pageSize;
    return {
      payments: filtered.slice(offset, offset + params.pageSize),
      totalCount: filtered.length,
    };
  }

  async listCommerceSubscriptions(params: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
  }): Promise<AdminSubscriptionsList> {
    let filtered = [...this.memorySubscriptions];
    if (params.status && params.status !== "all") {
      filtered = filtered.filter((s) => s.status === params.status);
    }
    if (params.search) {
      const q = params.search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.userEmail.toLowerCase().includes(q) ||
          s.productTitle.toLowerCase().includes(q)
      );
    }
    const offset = (params.page - 1) * params.pageSize;
    return {
      subscriptions: filtered.slice(offset, offset + params.pageSize),
      totalCount: filtered.length,
    };
  }

  async listCommerceEntitlements(params: {
    page: number;
    pageSize: number;
    search?: string;
    resourceType?: string;
    sourceType?: string;
    status?: string;
  }): Promise<AdminEntitlementsList> {
    let filtered = [...this.memoryEntitlements];
    if (params.resourceType && params.resourceType !== "all") {
      filtered = filtered.filter((e) => e.resourceType === params.resourceType);
    }
    if (params.sourceType && params.sourceType !== "all") {
      filtered = filtered.filter((e) => e.sourceType === params.sourceType);
    }
    if (params.status === "lifetime") {
      filtered = filtered.filter((e) => e.lifetime);
    }
    const offset = (params.page - 1) * params.pageSize;
    return {
      entitlements: filtered.slice(offset, offset + params.pageSize),
      totalCount: filtered.length,
    };
  }

  async listCommerceProducts(): Promise<AdminProductRecord[]> {
    return [...this.memoryProducts];
  }

  async updateCommerceProduct(
    _adminId: string,
    productId: string,
    payload: { active?: boolean; price?: number }
  ): Promise<AdminProductRecord> {
    const idx = this.memoryProducts.findIndex((p) => p.id === productId);
    if (idx === -1) throw new Error("not_found");
    const existing = this.memoryProducts[idx];

    if (payload.active !== undefined) existing.active = payload.active;
    if (payload.price !== undefined) existing.price = payload.price;

    this.memoryProducts[idx] = existing;
    return existing;
  }

  async grantCommerceEntitlement(
    _adminId: string,
    input: AdminGrantInput
  ): Promise<AdminEntitlementRecord> {
    let userEmail = "student@test.com";
    if (this.userStore) {
      const u = await this.userStore.findById(input.userId as any);
      if (!u) throw new Error("user_not_found");
      userEmail = u.email;
    }

    const now = new Date();
    const isLifetime = input.resourceType !== "subscription";
    const durationDays = input.durationDays ?? 30;

    let expiresAt: string | null = null;
    if (!isLifetime) {
      const activeSubs = this.memorySubscriptions.filter(
        (s) => s.userId === input.userId && s.status === "active" && new Date(s.expiresAt) > now
      );
      let baseTime = now.getTime();
      if (activeSubs.length > 0) {
        const latestExp = Math.max(...activeSubs.map((s) => new Date(s.expiresAt).getTime()));
        if (latestExp > baseTime) baseTime = latestExp;
      }
      expiresAt = new Date(baseTime + durationDays * 86400000).toISOString();
    }

    const record: AdminEntitlementRecord = {
      id: `ent_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      userId: input.userId,
      userEmail,
      resourceType: input.resourceType,
      resourceId: input.resourceId || null,
      resourceTitle: input.resourceType === "subscription" ? "اشتراک سراسری آوانا" : "منبع آموزشی اعطایی",
      sourceType: "admin_grant",
      orderId: null,
      startsAt: now.toISOString(),
      expiresAt,
      lifetime: isLifetime,
      active: true,
      createdAt: now.toISOString(),
    };

    this.memoryEntitlements.push(record);

    if (input.resourceType === "subscription") {
      const subRecord: AdminSubscriptionRecord = {
        id: `sub_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        userId: input.userId,
        userEmail,
        productId: "prod_sub_monthly",
        productTitle: "اشتراک سراسری آوانا",
        plan: "sub_monthly",
        status: "active",
        startedAt: record.startsAt,
        expiresAt: expiresAt!,
        orderId: null,
        createdAt: now.toISOString(),
      };
      this.memorySubscriptions.push(subRecord);
    }

    return record;
  }

  async cancelCommerceSubscription(
    _adminId: string,
    subscriptionId: string,
    _reason?: string,
  ): Promise<{ success: boolean; subscription: AdminSubscriptionRecord; message?: string }> {
    const sub = this.memorySubscriptions.find((s) => s.id === subscriptionId);
    if (!sub) {
      throw new Error("not_found");
    }

    if (sub.status === "cancelled") {
      return {
        success: true,
        subscription: sub,
        message: "اشتراک قبلاً لغو شده است.",
      };
    }

    const now = new Date();
    if (sub.status === "expired" || new Date(sub.expiresAt).getTime() <= now.getTime()) {
      throw new Error("subscription_already_expired");
    }

    const previousExpiresAt = sub.expiresAt;
    sub.status = "cancelled";
    sub.expiresAt = now.toISOString();

    // Expire strictly the matching entitlement linked to this subscription (exact startsAt and expiresAt match)
    const matchingEnt = this.memoryEntitlements.find(
      (e) =>
        e.userId === sub.userId &&
        e.resourceType === "subscription" &&
        ((sub.orderId && e.orderId === sub.orderId) ||
          (!sub.orderId &&
            e.sourceType === "admin_grant" &&
            !e.orderId &&
            e.startsAt === sub.startedAt &&
            e.expiresAt === previousExpiresAt)),
    );
    if (matchingEnt) {
      matchingEnt.expiresAt = now.toISOString();
      matchingEnt.active = false;
    }

    return {
      success: true,
      subscription: sub,
    };
  }

  async approveCommercePayment(
    adminId: string,
    paymentId: string,
  ): Promise<{ success: boolean; payment: AdminPaymentRecord; message?: string }> {
    const payment = this.memoryPayments.find((p) => p.id === paymentId);
    if (!payment) throw new Error("not_found");

    if (payment.status === "admin_approved" || payment.status === "paid") {
      return {
        success: true,
        payment,
        message: "پرداخت قبلاً تأیید شده است.",
      };
    }

    if (payment.status === "admin_rejected" || payment.status === "cancelled") {
      throw new Error("payment_already_rejected");
    }

    if (payment.status !== "pending_admin_review") {
      throw new Error("invalid_payment_status");
    }

    const now = new Date().toISOString();
    payment.status = "admin_approved";
    payment.reviewedAt = now;
    payment.reviewedBy = adminId;

    const order = this.memoryOrders.find((o) => o.id === payment.orderId);
    if (order) order.status = "paid";

    const sub = this.memorySubscriptions.find((s) => s.orderId === payment.orderId);
    if (sub) sub.status = "active";

    return {
      success: true,
      payment,
      message: "پرداخت با موفقیت تأیید شد.",
    };
  }

  async rejectCommercePayment(
    adminId: string,
    paymentId: string,
    reason: string,
  ): Promise<{ success: boolean; payment: AdminPaymentRecord; message?: string }> {
    const trimmedReason = reason?.trim();
    if (!trimmedReason) throw new Error("rejection_reason_required");

    const payment = this.memoryPayments.find((p) => p.id === paymentId);
    if (!payment) throw new Error("not_found");

    if (payment.status === "admin_rejected") {
      return {
        success: true,
        payment,
        message: "پرداخت قبلاً رد شده است.",
      };
    }

    if (payment.status === "admin_approved" || payment.status === "paid") {
      throw new Error("payment_already_approved");
    }

    if (payment.status !== "pending_admin_review") {
      throw new Error("invalid_payment_status");
    }

    const now = new Date().toISOString();
    payment.status = "admin_rejected";
    payment.rejectionReason = trimmedReason;
    payment.reviewedAt = now;
    payment.reviewedBy = adminId;

    const order = this.memoryOrders.find((o) => o.id === payment.orderId);
    if (order) order.status = "cancelled";

    const sub = this.memorySubscriptions.find((s) => s.orderId === payment.orderId);
    if (sub) {
      sub.status = "cancelled_payment_rejected" as any;
      sub.expiresAt = now;
    }

    const ent = this.memoryEntitlements.find(
      (e) =>
        e.userId === payment.userId &&
        e.orderId === payment.orderId,
    );
    if (ent) {
      ent.expiresAt = now;
      ent.active = false;
    }

    return {
      success: true,
      payment,
      message: "پرداخت رد شد و دسترسی اشتراک لغو گردید.",
    };
  }

  async getUserCommerceProfile(userId: string): Promise<AdminUserCommerceProfile> {
    let email = "user@test.com";
    let name: string | undefined;
    if (this.userStore) {
      const u = await this.userStore.findById(userId as any);
      if (u) {
        email = u.email;
        name = u.name;
      }
    }

    const userOrders = this.memoryOrders.filter((o) => o.userId === userId);
    const userPayments = this.memoryPayments.filter((p) => p.userId === userId);
    const userSubs = this.memorySubscriptions.filter((s) => s.userId === userId);
    const userEnts = this.memoryEntitlements.filter((e) => e.userId === userId);

    return {
      user: { id: userId, email, name },
      activeSubscription: userSubs.find((s) => s.status === "active") || null,
      subscriptionHistory: userSubs,
      lifetimePurchases: userEnts.filter((e) => e.lifetime),
      entitlements: userEnts,
      orders: userOrders,
      payments: userPayments,
    };
  }
}
