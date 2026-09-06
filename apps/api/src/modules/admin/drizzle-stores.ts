import { count, eq, sql, gte, lte, gt, ilike, or, desc, isNull, isNotNull, and, inArray, type SQL } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import { randomUUID } from "node:crypto";
import {
  users,
  courses,
  modules,
  lessons,
  flashcards,
  quizzes,
  documents,
  generationJobs,
  documentGenerationProgress,
  quizQuestions,
  auditLogs,
  generatedContents,
  organizationMemberships,
  products,
  orders,
  payments,
  userSubscriptions,
  userEntitlements,
  contentPacks,
} from "@avana/database/schema";
import {
  resolveEffectiveRole,
  calculateSubscriptionExpiry,
  type Role,
  STAGE_LABELS_FA,
  type GenerationPipelineStage,
  type GenerationProgressStatus,
  type DocumentGenerationProgressResource,
} from "@avana/domain";
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

export class DrizzleAdminStore implements AdminStore {
  constructor(
    private readonly db: DbClient,
    private readonly options?: AdminStoreOptions,
  ) {}

  async getDashboardStats(): Promise<DashboardStats> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      usersCount,
      newUsersCount,
      coursesCount,
      lessonsCount,
      flashcardsCount,
      quizzesCount,
      documentsCount,
      generationsTodayTotal,
      generationsTodaySuccess,
    ] = await Promise.all([
      this.db.select({ count: count() }).from(users).where(isNull(users.deletedAt)).then((res) => res[0].count),
      this.db.select({ count: count() }).from(users).where(and(gte(users.createdAt, today), isNull(users.deletedAt))).then((res) => res[0].count),
      this.db.select({ count: count() }).from(courses).where(isNull(courses.deletedAt)).then((res) => res[0].count),
      this.db.select({ count: count() }).from(lessons).where(isNull(lessons.deletedAt)).then((res) => res[0].count),
      this.db.select({ count: count() }).from(flashcards).where(isNull(flashcards.deletedAt)).then((res) => res[0].count),
      this.db.select({ count: count() }).from(quizzes).where(isNull(quizzes.deletedAt)).then((res) => res[0].count),
      this.db.select({ count: count() }).from(documents).where(isNull(documents.deletedAt)).then((res) => res[0].count),
      this.db.select({ count: count() }).from(generationJobs).where(and(gte(generationJobs.createdAt, today), isNull(generationJobs.deletedAt))).then((res) => res[0].count),
      this.db.select({ count: count() }).from(generationJobs).where(and(gte(generationJobs.createdAt, today), eq(generationJobs.status, "completed"), isNull(generationJobs.deletedAt))).then((res) => res[0].count),
    ]);

    const generationSuccessRate = generationsTodayTotal > 0 
      ? Math.round((generationsTodaySuccess / generationsTodayTotal) * 100) 
      : 0;

    return {
      totalUsers: usersCount,
      newUsersToday: newUsersCount,
      totalCourses: coursesCount,
      totalLessons: lessonsCount,
      totalFlashcards: flashcardsCount,
      totalQuizzes: quizzesCount,
      totalDocuments: documentsCount,
      generationsToday: generationsTodayTotal,
      generationSuccessRate,
    };
  }

  async listUsers(params: { page: number; pageSize: number; search?: string; role?: string; status?: string }): Promise<AdminUsersList> {
    const { page, pageSize, search, role, status } = params;
    const offset = (page - 1) * pageSize;

    const conditions: Array<SQL | undefined> = [isNull(users.deletedAt)];

    if (search) {
      conditions.push(
        or(
          ilike(users.email, `%${search}%`),
          ilike(users.name, `%${search}%`)
        )
      );
    }

    if (status) {
      if (status === "active") {
        conditions.push(isNotNull(users.emailVerifiedAt));
      } else if (status === "inactive") {
        conditions.push(isNull(users.emailVerifiedAt));
      }
    }

    if (role) {
      conditions.push(
        inArray(
          users.id,
          this.db.select({ userId: organizationMemberships.userId })
            .from(organizationMemberships)
            .where(eq(organizationMemberships.role, role))
        )
      );
    }

    const whereClause = and(...conditions);
    const baseQuery = this.db.select().from(users).where(whereClause);
    const countQuery = this.db.select({ count: count() }).from(users).where(whereClause);

    const [totalRes, userRows] = await Promise.all([
      countQuery,
      baseQuery.limit(pageSize).offset(offset).orderBy(desc(users.createdAt)),
    ]);

    const userIds = userRows.map((u) => u.id);
    let membershipRows: Array<{ userId: string; role: string }> = [];
    if (userIds.length > 0) {
      membershipRows = await this.db
        .select({
          userId: organizationMemberships.userId,
          role: organizationMemberships.role,
        })
        .from(organizationMemberships)
        .where(inArray(organizationMemberships.userId, userIds));
    }

    const rolesMap = new Map<string, Role[]>();
    for (const m of membershipRows) {
      const list = rolesMap.get(m.userId) || [];
      list.push(m.role as Role);
      rolesMap.set(m.userId, list);
    }

    return {
      totalCount: totalRes[0].count,
      users: userRows.map((u) => {
        const userRoles = rolesMap.get(u.id) || [];
        const effectiveRole = resolveEffectiveRole(userRoles);
        return {
          id: u.id,
          email: u.email,
          name: u.name ?? undefined,
          role: effectiveRole,
          emailVerified: u.emailVerifiedAt != null,
          createdAt: u.createdAt.toISOString(),
          lastActiveAt: u.updatedAt.toISOString(), // proxy for last active
        };
      }),
    };
  }

  async listGenerationJobs(params: { page: number; pageSize: number; status?: string }): Promise<{ jobs: AdminGenerationJobRecord[]; totalCount: number }> {
    const { page, pageSize, status } = params;
    const offset = (page - 1) * pageSize;

    const conditions: Array<SQL | undefined> = [isNull(generationJobs.deletedAt)];
    if (status) {
      conditions.push(eq(generationJobs.status, status));
    }
    const whereClause = and(...conditions);

    const baseQuery = this.db.select({
      job: generationJobs,
      documentName: documents.originalName,
      userEmail: users.email,
    })
    .from(generationJobs)
    .leftJoin(documents, eq(generationJobs.documentId, documents.id))
    .leftJoin(users, eq(documents.ownerUserId, users.id))
    .where(whereClause);

    const countQuery = this.db.select({ count: count() })
      .from(generationJobs)
      .where(whereClause);

    const [totalRes, rows] = await Promise.all([
      countQuery,
      baseQuery.limit(pageSize).offset(offset).orderBy(desc(generationJobs.createdAt)),
    ]);

    return {
      totalCount: totalRes[0].count,
      jobs: rows.map((r) => ({
        id: r.job.id,
        type: r.job.type,
        status: r.job.status,
        errorMessage: r.job.errorMessage,
        createdAt: r.job.createdAt.toISOString(),
        completedAt: r.job.completedAt?.toISOString() ?? null,
        documentName: r.documentName ?? undefined,
        userEmail: r.userEmail ?? undefined,
      })),
    };
  }

  async getDataIntegrityReport(): Promise<DataIntegrityReport> {
    const [
      lessonsNoModule,
      flashcardsNoLesson,
      quizzesNoLesson,
      docsNoCourse,
      failedGens,
    ] = await Promise.all([
      this.db.select({ count: count() }).from(lessons).where(and(isNull(lessons.moduleId), isNull(lessons.deletedAt))).then((res) => res[0].count),
      this.db.select({ count: count() }).from(flashcards).where(and(isNull(flashcards.lessonId), isNull(flashcards.deletedAt))).then((res) => res[0].count),
      this.db.select({ count: count() }).from(quizzes).where(
        and(
          sql`NOT EXISTS (SELECT 1 FROM ${quizQuestions} qq WHERE qq.quiz_id = ${quizzes.id} AND qq.lesson_id IS NOT NULL)`,
          isNull(quizzes.deletedAt)
        )
      ).then((res) => res[0].count),
      this.db.select({ count: count() }).from(documents).where(and(isNull(documents.courseId), isNull(documents.deletedAt))).then((res) => res[0].count),
      this.db.select({ count: count() }).from(generationJobs).where(and(eq(generationJobs.status, "failed"), isNull(generationJobs.deletedAt))).then((res) => res[0].count),
    ]);

    return {
      lessonsWithoutModule: lessonsNoModule,
      flashcardsWithoutLesson: flashcardsNoLesson,
      quizzesWithoutLesson: quizzesNoLesson,
      documentsWithoutCourse: docsNoCourse,
      failedGenerations: failedGens,
    };
  }

  // --- Phase 2 ---

  async listCourses(params: { page: number; pageSize: number; search?: string }): Promise<{ courses: AdminCourseRecord[]; totalCount: number }> {
    const { page, pageSize, search } = params;
    const offset = (page - 1) * pageSize;

    const conditions: Array<SQL | undefined> = [isNull(courses.deletedAt)];
    if (search) {
      conditions.push(ilike(courses.name, `%${search}%`));
    }
    const whereClause = and(...conditions);

    const baseQuery = this.db.select().from(courses).where(whereClause);
    const countQuery = this.db.select({ count: count() }).from(courses).where(whereClause);

    const [totalRes, courseRows] = await Promise.all([
      countQuery,
      baseQuery.limit(pageSize).offset(offset).orderBy(sql`${courses.createdAt} DESC`),
    ]);

    const courseIds = courseRows.map((c) => c.id);
    const courseStats = new Map<string, { modules: number; lessons: number; flashcards: number; quizzes: number }>();

    if (courseIds.length > 0) {
      const [modulesCounts, lessonsCounts, flashcardsCounts, quizzesCounts] = await Promise.all([
        this.db.select({ courseId: modules.courseId, count: count() }).from(modules).where(inArray(modules.courseId, courseIds)).groupBy(modules.courseId),
        this.db.select({ courseId: modules.courseId, count: count() }).from(lessons).innerJoin(modules, eq(lessons.moduleId, modules.id)).where(and(inArray(modules.courseId, courseIds), isNull(lessons.deletedAt))).groupBy(modules.courseId),
        this.db.select({ courseId: flashcards.courseId, count: count() }).from(flashcards).where(and(inArray(flashcards.courseId, courseIds), isNull(flashcards.deletedAt))).groupBy(flashcards.courseId),
        this.db.select({ courseId: quizzes.courseId, count: count() }).from(quizzes).where(and(inArray(quizzes.courseId, courseIds), isNull(quizzes.deletedAt))).groupBy(quizzes.courseId),
      ]);

      for (const id of courseIds) {
        courseStats.set(id, { modules: 0, lessons: 0, flashcards: 0, quizzes: 0 });
      }
      for (const row of modulesCounts) {
        const stats = courseStats.get(row.courseId);
        if (stats) stats.modules = row.count;
      }
      for (const row of lessonsCounts) {
        const stats = courseStats.get(row.courseId);
        if (stats) stats.lessons = row.count;
      }
      for (const row of flashcardsCounts) {
        const stats = courseStats.get(row.courseId);
        if (stats) stats.flashcards = row.count;
      }
      for (const row of quizzesCounts) {
        const stats = courseStats.get(row.courseId);
        if (stats) stats.quizzes = row.count;
      }
    }

    return {
      totalCount: totalRes[0].count,
      courses: courseRows.map((c) => ({
        id: c.id,
        name: c.name,
        subject: c.subject,
        createdAt: c.createdAt.toISOString(),
        counts: courseStats.get(c.id) || { modules: 0, lessons: 0, flashcards: 0, quizzes: 0 }
      })),
    };
  }

  private formatDocumentGenerationProgress(
    p: typeof documentGenerationProgress.$inferSelect | null | undefined,
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
        stageStartedAt: p.stageStartedAt ? p.stageStartedAt.toISOString() : null,
        lastActivityAt: p.lastActivityAt ? p.lastActivityAt.toISOString() : null,
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

  async listDocuments(params: { page: number; pageSize: number; search?: string; status?: string }): Promise<{ documents: AdminDocumentRecord[]; totalCount: number }> {
    const { page, pageSize, search, status } = params;
    const offset = (page - 1) * pageSize;

    const conditions: Array<SQL | undefined> = [isNull(documents.deletedAt)];
    if (search) {
      conditions.push(ilike(documents.originalName, `%${search}%`));
    }
    if (status) {
      conditions.push(eq(documents.status, status));
    }
    const whereClause = and(...conditions);

    const [totalRes, docRows] = await Promise.all([
      this.db.select({ count: count() }).from(documents).where(whereClause),
      this.db.select({
        doc: documents,
        courseName: courses.name,
        userEmail: users.email,
        progress: documentGenerationProgress,
      })
      .from(documents)
      .leftJoin(courses, eq(documents.courseId, courses.id))
      .leftJoin(users, eq(documents.ownerUserId, users.id))
      .leftJoin(documentGenerationProgress, eq(documents.id, documentGenerationProgress.documentId))
      .where(whereClause)
      .limit(pageSize)
      .offset(offset)
      .orderBy(sql`${documents.createdAt} DESC`),
    ]);

    return {
      totalCount: totalRes[0].count,
      documents: docRows.map((row) => ({
        id: row.doc.id,
        organizationId: row.doc.organizationId,
        originalName: row.doc.originalName,
        mimeType: row.doc.mimeType,
        sizeBytes: row.doc.sizeBytes,
        status: row.doc.status,
        createdAt: row.doc.createdAt.toISOString(),
        courseName: row.courseName || undefined,
        ownerEmail: row.userEmail || undefined,
        generationProgress: this.formatDocumentGenerationProgress(row.progress, row.doc.status, row.doc.errorCode),
      })),
    };
  }

  async getDocument(id: string): Promise<AdminDocumentRecord | null> {
    const res = await this.db.select({
      doc: documents,
      courseName: courses.name,
      userEmail: users.email,
      progress: documentGenerationProgress,
    })
    .from(documents)
    .leftJoin(courses, eq(documents.courseId, courses.id))
    .leftJoin(users, eq(documents.ownerUserId, users.id))
    .leftJoin(documentGenerationProgress, eq(documents.id, documentGenerationProgress.documentId))
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)))
    .limit(1);

    if (res.length === 0) return null;

    const row = res[0];
    return {
      id: row.doc.id,
      organizationId: row.doc.organizationId,
      originalName: row.doc.originalName,
      mimeType: row.doc.mimeType,
      sizeBytes: row.doc.sizeBytes,
      status: row.doc.status,
      createdAt: row.doc.createdAt.toISOString(),
      courseName: row.courseName || undefined,
      ownerEmail: row.userEmail || undefined,
      generationProgress: this.formatDocumentGenerationProgress(row.progress, row.doc.status, row.doc.errorCode),
    };
  }

  async getSystemHealth(): Promise<AdminSystemHealth> {
    let dbStatus: "healthy" | "error" = "healthy";
    let dbReason: string | null = null;
    try {
      await this.db.select({ val: sql`1` });
    } catch (err: unknown) {
      dbStatus = "error";
      dbReason = err instanceof Error ? err.message : "Database connection failed";
    }

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
      database: dbStatus,
      redis: redisResult.status,
      ai: aiStatus,
      lastCheck: new Date().toISOString(),
      services: {
        database: { status: dbStatus, reason: dbReason, latencyMs: 0 },
        redis: { status: redisResult.status, reason: redisResult.reason, latencyMs: redisResult.latencyMs },
        ai: { status: aiStatus, reason: aiReason, latencyMs: aiLatency },
      },
    };
  }

  async listLogs(_params: { page: number; pageSize: number; level?: string }): Promise<{ logs: AdminLogRecord[]; totalCount: number }> {
    // If there is no DB logs table, we return empty. Admin panel shouldn't crash if logs aren't in DB.
    return { logs: [], totalCount: 0 };
  }

  async listAuditLogs(params: { page: number; pageSize: number; search?: string; action?: string; entityType?: string; adminEmail?: string }): Promise<{ logs: AdminAuditRecord[]; totalCount: number }> {
    const { page, pageSize, search, action, entityType, adminEmail } = params;
    const offset = (page - 1) * pageSize;

    const conditions: Array<SQL | undefined> = [];
    if (action) conditions.push(eq(auditLogs.action, action));
    if (entityType) conditions.push(eq(auditLogs.entityType, entityType));
    if (adminEmail) conditions.push(eq(users.email, adminEmail));
    if (search) {
      conditions.push(
        or(
          ilike(auditLogs.action, `%${search}%`),
          ilike(auditLogs.entityType, `%${search}%`),
          ilike(users.email, `%${search}%`),
          sql`${auditLogs.details}::text ILIKE ${`%${search}%`}`
        )
      );
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRes, rows] = await Promise.all([
      this.db.select({ count: count() }).from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorId, users.id))
        .where(whereClause),
      this.db.select({
        log: auditLogs,
        adminEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .where(whereClause)
      .limit(pageSize)
      .offset(offset)
      .orderBy(sql`${auditLogs.createdAt} DESC`),
    ]);

    return {
      totalCount: totalRes[0].count,
      logs: rows.map(r => ({
        id: r.log.id,
        adminEmail: r.adminEmail || "system",
        action: r.log.action,
        entity: r.log.entityType,
        entityId: r.log.entityId,
        timestamp: r.log.createdAt.toISOString(),
        metadata: (r.log.details as Record<string, unknown> | null) ?? null,
      })),
    };
  }

  async listLessons(params: { page: number; pageSize: number; search?: string }): Promise<{ lessons: AdminLessonRecord[]; totalCount: number }> {
    const { page, pageSize, search } = params;
    const offset = (page - 1) * pageSize;

    const conditions: Array<SQL | undefined> = [isNull(lessons.deletedAt)];
    if (search) {
      conditions.push(ilike(lessons.title, `%${search}%`));
    }
    const whereClause = and(...conditions);

    const [totalRes, rows] = await Promise.all([
      this.db.select({ count: count() }).from(lessons).where(whereClause),
      this.db.select({
        lesson: lessons,
        moduleTitle: modules.title,
        courseName: courses.name,
      })
      .from(lessons)
      .leftJoin(modules, eq(lessons.moduleId, modules.id))
      .leftJoin(courses, eq(modules.courseId, courses.id))
      .where(whereClause)
      .limit(pageSize)
      .offset(offset)
      .orderBy(sql`${lessons.createdAt} DESC`),
    ]);

    return {
      totalCount: totalRes[0].count,
      lessons: rows.map(r => ({
        id: r.lesson.id,
        title: r.lesson.title,
        courseName: r.courseName || undefined,
        moduleTitle: r.moduleTitle || undefined,
        publicationStatus: r.lesson.publicationStatus,
        createdAt: r.lesson.createdAt.toISOString(),
      })),
    };
  }

  async listFlashcards(params: { page: number; pageSize: number; search?: string }): Promise<{ flashcards: AdminFlashcardRecord[]; totalCount: number }> {
    const { page, pageSize, search } = params;
    const offset = (page - 1) * pageSize;

    const conditions: Array<SQL | undefined> = [isNull(flashcards.deletedAt)];
    if (search) {
      conditions.push(ilike(flashcards.question, `%${search}%`));
    }
    const whereClause = and(...conditions);

    const [totalRes, rows] = await Promise.all([
      this.db.select({ count: count() }).from(flashcards).where(whereClause),
      this.db.select({
        flashcard: flashcards,
        lessonTitle: lessons.title,
      })
      .from(flashcards)
      .leftJoin(lessons, eq(flashcards.lessonId, lessons.id))
      .where(whereClause)
      .limit(pageSize)
      .offset(offset)
      .orderBy(sql`${flashcards.createdAt} DESC`),
    ]);

    return {
      totalCount: totalRes[0].count,
      flashcards: rows.map(r => ({
        id: r.flashcard.id,
        front: r.flashcard.question,
        back: r.flashcard.answer,
        lessonTitle: r.lessonTitle || undefined,
        createdAt: r.flashcard.createdAt.toISOString(),
      })),
    };
  }

  async listExams(params: { page: number; pageSize: number; search?: string }): Promise<{ exams: AdminExamRecord[]; totalCount: number }> {
    const { page, pageSize, search } = params;
    const offset = (page - 1) * pageSize;

    const conditions: Array<SQL | undefined> = [isNull(quizzes.deletedAt)];
    if (search) {
      conditions.push(ilike(quizzes.title, `%${search}%`));
    }
    const whereClause = and(...conditions);

    const [totalRes, rows] = await Promise.all([
      this.db.select({ count: count() }).from(quizzes).where(whereClause),
      this.db.select({
        exam: quizzes,
      })
      .from(quizzes)
      .where(whereClause)
      .limit(pageSize)
      .offset(offset)
      .orderBy(sql`${quizzes.createdAt} DESC`),
    ]);
    
    // fetch question counts for rows
    const examIds = rows.map(r => r.exam.id);
    const questionCounts = new Map<string, number>();
    if (examIds.length > 0) {
      const counts = await this.db.select({ quizId: quizQuestions.quizId, count: count() })
        .from(quizQuestions)
        .where(inArray(quizQuestions.quizId, examIds))
        .groupBy(quizQuestions.quizId);
      for (const id of examIds) questionCounts.set(id, 0);
      for (const row of counts) questionCounts.set(row.quizId, row.count);
    }

    return {
      totalCount: totalRes[0].count,
      exams: rows.map(r => ({
        id: r.exam.id,
        title: r.exam.title,
        passingScore: 80, // Default passing score
        questionCount: questionCounts.get(r.exam.id) || 0,
        createdAt: r.exam.createdAt.toISOString(),
      })),
    };
  }

  async getCourseHierarchy(courseId: string): Promise<AdminCourseHierarchy | null> {
    const courseRes = await this.db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
    if (!courseRes.length) return null;
    const course = courseRes[0];

    const courseModules = await this.db.select().from(modules)
      .where(and(eq(modules.courseId, courseId), isNull(modules.deletedAt)))
      .orderBy(modules.sortOrder);

    const moduleIds = courseModules.map((m) => m.id);
    let courseLessons: Array<{
      id: string;
      moduleId: string;
      title: string;
      publicationStatus: string;
      createdAt: Date;
      hasContent: boolean;
      flashcards?: number;
      quizzes?: number;
    }> = [];
    if (moduleIds.length > 0) {
      const dbLessons = await this.db.select({
        id: lessons.id,
        moduleId: lessons.moduleId,
        title: lessons.title,
        publicationStatus: lessons.publicationStatus,
        createdAt: lessons.createdAt,
        hasContent: sql<boolean>`length(${lessons.contentMarkdown}) > 0`.as('has_content')
      }).from(lessons)
      .where(and(inArray(lessons.moduleId, moduleIds), isNull(lessons.deletedAt)))
      .orderBy(lessons.sortOrder);
      
      const lessonIds = dbLessons.map((l) => l.id);
      
      if (lessonIds.length > 0) {
        const fcCounts = await this.db.select({ lessonId: flashcards.lessonId, count: count() })
          .from(flashcards)
          .where(and(inArray(flashcards.lessonId, lessonIds), isNull(flashcards.deletedAt)))
          .groupBy(flashcards.lessonId);
          
        const qCounts = await this.db.select({ lessonId: quizQuestions.lessonId, count: count() })
          .from(quizQuestions)
          .where(inArray(quizQuestions.lessonId, lessonIds))
          .groupBy(quizQuestions.lessonId);
          
        const fcMap = new Map(fcCounts.map((r) => [r.lessonId, r.count]));
        const qMap = new Map(qCounts.map((r) => [r.lessonId, r.count]));

        courseLessons = dbLessons.map((l) => ({
          ...l,
          flashcards: fcMap.get(l.id) || 0,
          quizzes: qMap.get(l.id) || 0,
          hasContent: Boolean(l.hasContent),
        }));
      } else {
        courseLessons = dbLessons.map((l) => ({
          ...l,
          flashcards: 0,
          quizzes: 0,
          hasContent: Boolean(l.hasContent),
        }));
      }
    }

    return {
      id: course.id,
      name: course.name,
      subject: course.subject,
      modules: courseModules.map((m) => ({
        id: m.id,
        title: m.title,
        lessons: courseLessons.filter((l) => l.moduleId === m.id).map((l) => ({
          id: l.id,
          title: l.title,
          publicationStatus: l.publicationStatus,
          flashcardCount: l.flashcards || 0,
          quizCount: l.quizzes || 0,
          hasContent: l.hasContent || false,
          createdAt: l.createdAt.toISOString()
        })),
      }))
    };
  }

  async getGenerationJob(id: string): Promise<AdminGenerationDetail | null> {
    const res = await this.db.select({
      job: generationJobs,
    })
    .from(generationJobs)
    .where(eq(generationJobs.id, id))
    .limit(1);

    if (res.length === 0) return null;

    const row = res[0];
    let durationMs: number | undefined;
    if (row.job.startedAt && row.job.completedAt) {
      durationMs = row.job.completedAt.getTime() - row.job.startedAt.getTime();
    }

    return {
      id: row.job.id,
      type: row.job.type,
      status: row.job.status,
      errorMessage: row.job.errorMessage ?? null,
      createdAt: row.job.createdAt.toISOString(),
      completedAt: row.job.completedAt ? row.job.completedAt.toISOString() : null,
      startedAt: row.job.startedAt?.toISOString(),
      durationMs,
      retryCount: row.job.attempts,
      errorType: row.job.errorCode || undefined,
    };
  }

  async getAnalytics(): Promise<AdminAnalytics> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d7 = new Date(today);
    d7.setDate(today.getDate() - 7);
    const d30 = new Date(today);
    d30.setDate(today.getDate() - 30);

    const getStats = async (date: Date) => {
      const [u, cu, l, f, q, g, gs, gf] = await Promise.all([
        this.db.select({ count: count() }).from(users).where(and(gte(users.createdAt, date), isNull(users.deletedAt))).then(r => r[0].count),
        this.db.select({ count: count() }).from(courses).where(and(gte(courses.createdAt, date), isNull(courses.deletedAt))).then(r => r[0].count),
        this.db.select({ count: count() }).from(lessons).where(and(gte(lessons.createdAt, date), isNull(lessons.deletedAt))).then(r => r[0].count),
        this.db.select({ count: count() }).from(flashcards).where(and(gte(flashcards.createdAt, date), isNull(flashcards.deletedAt))).then(r => r[0].count),
        this.db.select({ count: count() }).from(quizzes).where(and(gte(quizzes.createdAt, date), isNull(quizzes.deletedAt))).then(r => r[0].count),
        this.db.select({ count: count() }).from(generationJobs).where(and(gte(generationJobs.createdAt, date), isNull(generationJobs.deletedAt))).then(r => r[0].count),
        this.db.select({ count: count() }).from(generationJobs).where(and(gte(generationJobs.createdAt, date), eq(generationJobs.status, 'completed'), isNull(generationJobs.deletedAt))).then(r => r[0].count),
        this.db.select({ count: count() }).from(generationJobs).where(and(gte(generationJobs.createdAt, date), eq(generationJobs.status, 'failed'), isNull(generationJobs.deletedAt))).then(r => r[0].count),
      ]);
      return { newUsers: u, courses: cu, lessons: l, flashcards: f, quizzes: q, aiJobs: g, aiSuccess: gs, aiFailed: gf };
    };

    const [total, tToday, t7, t30] = await Promise.all([
      (async () => {
        const [u, cu, l, f, q] = await Promise.all([
          this.db.select({ count: count() }).from(users).where(isNull(users.deletedAt)).then(r => r[0].count),
          this.db.select({ count: count() }).from(courses).where(isNull(courses.deletedAt)).then(r => r[0].count),
          this.db.select({ count: count() }).from(lessons).where(isNull(lessons.deletedAt)).then(r => r[0].count),
          this.db.select({ count: count() }).from(flashcards).where(isNull(flashcards.deletedAt)).then(r => r[0].count),
          this.db.select({ count: count() }).from(quizzes).where(isNull(quizzes.deletedAt)).then(r => r[0].count),
        ]);
        return {
          totalUsers: u,
          totalCourses: cu,
          totalLessons: l,
          totalFlashcards: f,
          totalQuizzes: q,
        };
      })(),
      getStats(today),
      getStats(d7),
      getStats(d30),
    ]);

    return { total, today: tToday, last7Days: t7, last30Days: t30 };
  }

  async getAiAnalytics(): Promise<AdminAiAnalytics> {
    const [overviewRows, byTypeRows, tokenRows] = await Promise.all([
      this.db
        .select({
          totalJobs: count(),
          successful: sql<number>`count(case when ${generationJobs.status} = 'completed' then 1 end)`,
          failed: sql<number>`count(case when ${generationJobs.status} = 'failed' then 1 end)`,
          processing: sql<number>`count(case when ${generationJobs.status} = 'processing' then 1 end)`,
          averageDurationMs: sql<number>`coalesce(avg(extract(epoch from (${generationJobs.completedAt} - ${generationJobs.startedAt})) * 1000), 0)`,
        })
        .from(generationJobs)
        .where(isNull(generationJobs.deletedAt)),

      this.db
        .select({
          type: generationJobs.type,
          total: count(),
          success: sql<number>`count(case when ${generationJobs.status} = 'completed' then 1 end)`,
        })
        .from(generationJobs)
        .where(isNull(generationJobs.deletedAt))
        .groupBy(generationJobs.type),

      this.db
        .select({
          tokenRecordsCount: sql<number>`count(case when ${generatedContents.tokenUsage} is not null then 1 end)`,
          totalInput: sql<number>`coalesce(sum(case when (${generatedContents.tokenUsage}->>'inputTokens') ~ '^[0-9]+$' then (${generatedContents.tokenUsage}->>'inputTokens')::numeric when (${generatedContents.tokenUsage}->>'prompt_tokens') ~ '^[0-9]+$' then (${generatedContents.tokenUsage}->>'prompt_tokens')::numeric else 0 end), 0)`,
          totalOutput: sql<number>`coalesce(sum(case when (${generatedContents.tokenUsage}->>'outputTokens') ~ '^[0-9]+$' then (${generatedContents.tokenUsage}->>'outputTokens')::numeric when (${generatedContents.tokenUsage}->>'completion_tokens') ~ '^[0-9]+$' then (${generatedContents.tokenUsage}->>'completion_tokens')::numeric else 0 end), 0)`,
        })
        .from(generatedContents)
        .where(isNull(generatedContents.deletedAt)),
    ]);

    const overview = overviewRows?.[0] ?? {
      totalJobs: 0,
      successful: 0,
      failed: 0,
      processing: 0,
      averageDurationMs: 0,
    };

    const totalJobs = Number(overview.totalJobs) || 0;
    const successful = Number(overview.successful) || 0;
    const failed = Number(overview.failed) || 0;
    const processing = Number(overview.processing) || 0;
    const averageDurationMs = Number(overview.averageDurationMs) || 0;
    const successRate = totalJobs > 0 ? (successful / totalJobs) * 100 : 0;

    const byType: Record<string, { total: number; success: number }> = {};
    if (Array.isArray(byTypeRows)) {
      for (const row of byTypeRows) {
        if (row?.type) {
          byType[row.type] = {
            total: Number(row.total) || 0,
            success: Number(row.success) || 0,
          };
        }
      }
    }

    const tokenData = tokenRows?.[0];
    const tokenCount = Number(tokenData?.tokenRecordsCount) || 0;
    const input = Number(tokenData?.totalInput) || 0;
    const output = Number(tokenData?.totalOutput) || 0;
    const hasTokenData = tokenCount > 0 || input > 0 || output > 0;

    return {
      overview: {
        totalJobs,
        successful,
        failed,
        processing,
        successRate,
        averageDurationMs,
      },
      byType,
      tokens: {
        available: hasTokenData,
        input: hasTokenData ? input : 0,
        output: hasTokenData ? output : 0,
        total: hasTokenData ? input + output : 0,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Phase 4: Mutations
  // ---------------------------------------------------------------------------
  
  async updateUserRole(adminId: string, targetUserId: string, newRole: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      const memberships = await tx.select().from(organizationMemberships)
        .where(eq(organizationMemberships.userId, targetUserId));
      
      if (memberships.length === 0) {
        throw new Error("user_has_no_org");
      }
      
      if (memberships.length > 1) {
        throw new Error("multi_org_requires_explicit_handling");
      }
      
      const membership = memberships[0];
      
      if (newRole === "platform_admin") {
        await tx.update(users)
          .set({ globalRole: "platform_admin", updatedAt: new Date() })
          .where(eq(users.id, targetUserId));
      } else {
        await tx.update(users)
          .set({ globalRole: null, updatedAt: new Date() })
          .where(eq(users.id, targetUserId));

        await tx.update(organizationMemberships)
          .set({ role: newRole, updatedAt: new Date() })
          .where(eq(organizationMemberships.id, membership.id));
      }

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorId: adminId,
        action: "USER_ROLE_CHANGED",
        entityType: "user",
        entityId: targetUserId,
        details: { newRole, organizationId: membership.organizationId },
        createdAt: new Date()
      });
    });
  }
  
  async updateCourseMetadata(adminId: string, courseId: string, payload: { name?: string; subject?: string }): Promise<void> {
    await this.db.transaction(async (tx) => {
      const updateData: { updatedAt: Date; name?: string; subject?: string } = { updatedAt: new Date() };
      if (payload.name !== undefined) updateData.name = payload.name;
      if (payload.subject !== undefined) updateData.subject = payload.subject;
      
      const [res] = await tx.update(courses)
        .set(updateData)
        .where(eq(courses.id, courseId))
        .returning({ id: courses.id });
        
      if (!res) throw new Error("not_found");
      
      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorId: adminId,
        action: "COURSE_UPDATED",
        entityType: "course",
        entityId: courseId,
        details: payload,
        createdAt: new Date()
      });
    });
  }
  
  async retryDocumentProcessing(adminId: string, documentId: string): Promise<void> {
    await this.db.insert(auditLogs).values({
      id: randomUUID(),
      actorId: adminId,
      action: "DOCUMENT_RETRY_REQUESTED",
      entityType: "document",
      entityId: documentId,
      details: {},
      createdAt: new Date()
    });
  }
  
  async retryGenerationJob(adminId: string, jobId: string): Promise<void> {
    await this.db.insert(auditLogs).values({
      id: randomUUID(),
      actorId: adminId,
      action: "GENERATION_RETRY_REQUESTED",
      entityType: "generation_job",
      entityId: jobId,
      details: {},
      createdAt: new Date()
    });
  }

  // ---------------------------------------------------------------------------
  // Monetization & Commerce Methods
  // ---------------------------------------------------------------------------

  async getCommerceStats(): Promise<AdminCommerceStats> {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalRevRow,
      todayRevRow,
      monthRevRow,
      subRevRow,
      courseRevRow,
      packRevRow,
      ordersSuccessfulCount,
      ordersPendingCount,
      failedPaymentsCount,
      activeSubsCount,
      lifetimePurchasesCount,
    ] = await Promise.all([
      // Total Revenue from paid payments
      this.db
        .select({ total: sql<number>`COALESCE(SUM(${payments.amount}), 0)` })
        .from(payments)
        .where(eq(payments.status, "paid"))
        .then((res) => Number(res[0]?.total ?? 0)),

      // Today Revenue
      this.db
        .select({ total: sql<number>`COALESCE(SUM(${payments.amount}), 0)` })
        .from(payments)
        .where(and(eq(payments.status, "paid"), gte(payments.paidAt, today)))
        .then((res) => Number(res[0]?.total ?? 0)),

      // Current Month Revenue
      this.db
        .select({ total: sql<number>`COALESCE(SUM(${payments.amount}), 0)` })
        .from(payments)
        .where(and(eq(payments.status, "paid"), gte(payments.paidAt, currentMonth)))
        .then((res) => Number(res[0]?.total ?? 0)),

      // Subscription Revenue (join payments -> orders -> products)
      this.db
        .select({ total: sql<number>`COALESCE(SUM(${payments.amount}), 0)` })
        .from(payments)
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .innerJoin(products, eq(orders.productId, products.id))
        .where(and(eq(payments.status, "paid"), eq(products.type, "subscription")))
        .then((res) => Number(res[0]?.total ?? 0)),

      // Course Revenue
      this.db
        .select({ total: sql<number>`COALESCE(SUM(${payments.amount}), 0)` })
        .from(payments)
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .innerJoin(products, eq(orders.productId, products.id))
        .where(and(eq(payments.status, "paid"), eq(products.type, "course")))
        .then((res) => Number(res[0]?.total ?? 0)),

      // Content Pack Revenue
      this.db
        .select({ total: sql<number>`COALESCE(SUM(${payments.amount}), 0)` })
        .from(payments)
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .innerJoin(products, eq(orders.productId, products.id))
        .where(and(eq(payments.status, "paid"), eq(products.type, "content_pack")))
        .then((res) => Number(res[0]?.total ?? 0)),

      // Successful Orders
      this.db
        .select({ count: count() })
        .from(orders)
        .where(eq(orders.status, "paid"))
        .then((res) => Number(res[0]?.count ?? 0)),

      // Pending Orders
      this.db
        .select({ count: count() })
        .from(orders)
        .where(eq(orders.status, "pending"))
        .then((res) => Number(res[0]?.count ?? 0)),

      // Failed / Cancelled Payments
      this.db
        .select({ count: count() })
        .from(payments)
        .where(inArray(payments.status, ["failed", "cancelled"]))
        .then((res) => Number(res[0]?.count ?? 0)),

      // Active Subscriptions
      this.db
        .select({ count: count() })
        .from(userSubscriptions)
        .where(and(eq(userSubscriptions.status, "active"), gte(userSubscriptions.expiresAt, now)))
        .then((res) => Number(res[0]?.count ?? 0)),

      // Lifetime Purchases (courses & content packs)
      this.db
        .select({ count: count() })
        .from(userEntitlements)
        .where(and(isNull(userEntitlements.expiresAt), inArray(userEntitlements.resourceType, ["course", "content_pack"])))
        .then((res) => Number(res[0]?.count ?? 0)),
    ]);

    return {
      totalRevenue: totalRevRow,
      todayRevenue: todayRevRow,
      currentMonthRevenue: monthRevRow,
      successfulOrders: ordersSuccessfulCount,
      activeSubscriptions: activeSubsCount,
      lifetimePurchases: lifetimePurchasesCount,
      subscriptionRevenue: subRevRow,
      courseRevenue: courseRevRow,
      contentPackRevenue: packRevRow,
      pendingOrders: ordersPendingCount,
      failedPayments: failedPaymentsCount,
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
    const { page, pageSize, search, status, from, to } = params;
    const offset = (page - 1) * pageSize;

    const conditions: Array<SQL | undefined> = [];

    if (status && status !== "all") {
      conditions.push(eq(orders.status, status));
    }
    if (from) {
      conditions.push(gte(orders.createdAt, new Date(from)));
    }
    if (to) {
      conditions.push(lte(orders.createdAt, new Date(to)));
    }

    if (search && search.trim().length > 0) {
      const q = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(orders.orderNumber, q),
          ilike(users.email, q),
          ilike(users.name, q),
          ilike(products.title, q),
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalCountRes, rows] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(orders)
        .innerJoin(users, eq(orders.userId, users.id))
        .innerJoin(products, eq(orders.productId, products.id))
        .where(whereClause),
      this.db
        .select({
          order: orders,
          user: { id: users.id, email: users.email, name: users.name },
          product: { id: products.id, title: products.title, type: products.type },
        })
        .from(orders)
        .innerJoin(users, eq(orders.userId, users.id))
        .innerJoin(products, eq(orders.productId, products.id))
        .where(whereClause)
        .orderBy(desc(orders.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const orderIds = rows.map((r) => r.order.id);
    let paymentRows: Array<{ orderId: string; status: string; gateway: string; transactionId: string | null }> = [];
    if (orderIds.length > 0) {
      paymentRows = await this.db
        .select({
          orderId: payments.orderId,
          status: payments.status,
          gateway: payments.gateway,
          transactionId: payments.transactionId,
        })
        .from(payments)
        .where(inArray(payments.orderId, orderIds));
    }

    const paymentMap = new Map<string, { status: string; gateway: string; transactionId: string | null }>();
    for (const p of paymentRows) {
      paymentMap.set(p.orderId, p);
    }

    const ordersList: AdminOrderRecord[] = rows.map((r) => {
      const pay = paymentMap.get(r.order.id);
      return {
        id: r.order.id,
        orderNumber: r.order.orderNumber,
        userId: r.user.id,
        userName: r.user.name || undefined,
        userEmail: r.user.email,
        productId: r.product.id,
        productTitle: r.product.title,
        productType: r.product.type,
        amount: r.order.amount,
        currency: r.order.currency,
        status: r.order.status,
        createdAt: r.order.createdAt.toISOString(),
        updatedAt: r.order.updatedAt.toISOString(),
        paymentStatus: pay?.status,
        paymentGateway: pay?.gateway,
        paymentTransactionId: pay?.transactionId || undefined,
      };
    });

    return {
      orders: ordersList,
      totalCount: Number(totalCountRes[0]?.count ?? 0),
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
    const { page, pageSize, search, gateway, status, from, to } = params;
    const offset = (page - 1) * pageSize;

    const conditions: Array<SQL | undefined> = [];

    if (gateway && gateway !== "all") {
      conditions.push(eq(payments.gateway, gateway));
    }
    if (status && status !== "all") {
      conditions.push(eq(payments.status, status));
    }
    if (from) {
      conditions.push(gte(payments.createdAt, new Date(from)));
    }
    if (to) {
      conditions.push(lte(payments.createdAt, new Date(to)));
    }

    if (search && search.trim().length > 0) {
      const q = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(payments.authority, q),
          ilike(payments.transactionId, q),
          ilike(payments.trackingNumber, q),
          ilike(payments.payerName, q),
          ilike(orders.orderNumber, q),
          ilike(users.email, q),
          ilike(users.name, q),
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalCountRes, rows] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(payments)
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .innerJoin(users, eq(payments.userId, users.id))
        .innerJoin(products, eq(orders.productId, products.id))
        .where(whereClause),
      this.db
        .select({
          payment: payments,
          order: { id: orders.id, orderNumber: orders.orderNumber },
          user: { id: users.id, email: users.email, name: users.name },
          product: { id: products.id, title: products.title },
        })
        .from(payments)
        .innerJoin(orders, eq(payments.orderId, orders.id))
        .innerJoin(users, eq(payments.userId, users.id))
        .innerJoin(products, eq(orders.productId, products.id))
        .where(whereClause)
        .orderBy(desc(payments.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const paymentsList: AdminPaymentRecord[] = rows.map((r) => ({
      id: r.payment.id,
      orderId: r.order.id,
      orderNumber: r.order.orderNumber,
      userId: r.user.id,
      userName: r.user.name || undefined,
      userEmail: r.user.email,
      productTitle: r.product.title,
      amount: r.payment.amount,
      currency: r.payment.currency,
      gateway: r.payment.gateway,
      authority: r.payment.authority,
      transactionId: r.payment.transactionId,
      status: r.payment.status,
      trackingNumber: r.payment.trackingNumber ?? null,
      sourceCardLast4: r.payment.sourceCardLast4 ?? null,
      payerName: r.payment.payerName ?? null,
      receiptUrl: r.payment.receiptUrl ?? null,
      initialValidationResult:
        (r.payment.initialValidationResult as Record<string, unknown>) ?? null,
      rejectionReason: r.payment.rejectionReason ?? null,
      reviewedAt: r.payment.reviewedAt
        ? r.payment.reviewedAt.toISOString()
        : null,
      reviewedBy: r.payment.reviewedBy ?? null,
      paidAt: r.payment.paidAt ? r.payment.paidAt.toISOString() : null,
      createdAt: r.payment.createdAt.toISOString(),
    }));

    return {
      payments: paymentsList,
      totalCount: Number(totalCountRes[0]?.count ?? 0),
    };
  }

  async listCommerceSubscriptions(params: {
    page: number;
    pageSize: number;
    search?: string;
    status?: string;
  }): Promise<AdminSubscriptionsList> {
    const { page, pageSize, search, status } = params;
    const offset = (page - 1) * pageSize;
    const now = new Date();

    const conditions: Array<SQL | undefined> = [];

    if (status === "active") {
      conditions.push(and(eq(userSubscriptions.status, "active"), gte(userSubscriptions.expiresAt, now)));
    } else if (status === "expired") {
      conditions.push(or(eq(userSubscriptions.status, "expired"), sql`${userSubscriptions.expiresAt} < ${now}`));
    } else if (status === "cancelled") {
      conditions.push(eq(userSubscriptions.status, "cancelled"));
    }

    if (search && search.trim().length > 0) {
      const q = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(users.email, q),
          ilike(users.name, q),
          ilike(products.title, q),
          ilike(products.code, q),
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalCountRes, rows] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(userSubscriptions)
        .innerJoin(users, eq(userSubscriptions.userId, users.id))
        .innerJoin(products, eq(userSubscriptions.productId, products.id))
        .where(whereClause),
      this.db
        .select({
          sub: userSubscriptions,
          user: { id: users.id, email: users.email, name: users.name },
          product: { id: products.id, title: products.title, code: products.code },
        })
        .from(userSubscriptions)
        .innerJoin(users, eq(userSubscriptions.userId, users.id))
        .innerJoin(products, eq(userSubscriptions.productId, products.id))
        .where(whereClause)
        .orderBy(desc(userSubscriptions.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    const subscriptionsList: AdminSubscriptionRecord[] = rows.map((r) => {
      let resolvedStatus = r.sub.status;
      if (r.sub.status === "active" && new Date(r.sub.expiresAt).getTime() < now.getTime()) {
        resolvedStatus = "expired";
      }

      return {
        id: r.sub.id,
        userId: r.user.id,
        userName: r.user.name || undefined,
        userEmail: r.user.email,
        productId: r.product.id,
        productTitle: r.product.title,
        plan: r.product.code,
        status: resolvedStatus,
        startedAt: r.sub.startedAt.toISOString(),
        expiresAt: r.sub.expiresAt.toISOString(),
        orderId: r.sub.orderId,
        createdAt: r.sub.createdAt.toISOString(),
      };
    });

    return {
      subscriptions: subscriptionsList,
      totalCount: Number(totalCountRes[0]?.count ?? 0),
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
    const { page, pageSize, search, resourceType, sourceType, status } = params;
    const offset = (page - 1) * pageSize;
    const now = new Date();

    const conditions: Array<SQL | undefined> = [];

    if (resourceType && resourceType !== "all") {
      conditions.push(eq(userEntitlements.resourceType, resourceType));
    }
    if (sourceType && sourceType !== "all") {
      conditions.push(eq(userEntitlements.sourceType, sourceType));
    }

    if (status === "lifetime") {
      conditions.push(isNull(userEntitlements.expiresAt));
    } else if (status === "active") {
      conditions.push(or(isNull(userEntitlements.expiresAt), gte(userEntitlements.expiresAt, now)));
    } else if (status === "expired") {
      conditions.push(and(isNotNull(userEntitlements.expiresAt), sql`${userEntitlements.expiresAt} < ${now}`));
    }

    if (search && search.trim().length > 0) {
      const q = `%${search.trim()}%`;
      conditions.push(
        or(
          ilike(users.email, q),
          ilike(users.name, q),
          sql`CAST(${userEntitlements.resourceId} AS text) ILIKE ${q}`,
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalCountRes, rows] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(userEntitlements)
        .innerJoin(users, eq(userEntitlements.userId, users.id))
        .where(whereClause),
      this.db
        .select({
          ent: userEntitlements,
          user: { id: users.id, email: users.email, name: users.name },
        })
        .from(userEntitlements)
        .innerJoin(users, eq(userEntitlements.userId, users.id))
        .where(whereClause)
        .orderBy(desc(userEntitlements.createdAt))
        .limit(pageSize)
        .offset(offset),
    ]);

    // Resource titles lookup
    const courseIds = rows.filter((r) => r.ent.resourceType === "course" && r.ent.resourceId).map((r) => r.ent.resourceId!);
    const packIds = rows.filter((r) => r.ent.resourceType === "content_pack" && r.ent.resourceId).map((r) => r.ent.resourceId!);

    const [courseRows, packRows] = await Promise.all([
      courseIds.length > 0
        ? this.db.select({ id: courses.id, name: courses.name }).from(courses).where(inArray(courses.id, courseIds))
        : Promise.resolve([]),
      packIds.length > 0
        ? this.db.select({ id: contentPacks.id, title: contentPacks.title }).from(contentPacks).where(inArray(contentPacks.id, packIds))
        : Promise.resolve([]),
    ]);

    const titleMap = new Map<string, string>();
    for (const c of courseRows) titleMap.set(c.id, c.name);
    for (const p of packRows) titleMap.set(p.id, p.title);

    const entitlementsList: AdminEntitlementRecord[] = rows.map((r) => {
      const isLifetime = r.ent.expiresAt === null;
      const isActive = isLifetime || new Date(r.ent.expiresAt!).getTime() >= now.getTime();

      let resourceTitle: string | undefined;
      if (r.ent.resourceType === "subscription") {
        resourceTitle = "اشتراک سراسری آوانا";
      } else if (r.ent.resourceId) {
        resourceTitle = titleMap.get(r.ent.resourceId);
      }

      return {
        id: r.ent.id,
        userId: r.user.id,
        userName: r.user.name || undefined,
        userEmail: r.user.email,
        resourceType: r.ent.resourceType,
        resourceId: r.ent.resourceId,
        resourceTitle,
        sourceType: r.ent.sourceType,
        orderId: r.ent.orderId,
        startsAt: r.ent.startsAt.toISOString(),
        expiresAt: r.ent.expiresAt ? r.ent.expiresAt.toISOString() : null,
        lifetime: isLifetime,
        active: isActive,
        createdAt: r.ent.createdAt.toISOString(),
      };
    });

    return {
      entitlements: entitlementsList,
      totalCount: Number(totalCountRes[0]?.count ?? 0),
    };
  }

  async listCommerceProducts(): Promise<AdminProductRecord[]> {
    const rows = await this.db
      .select()
      .from(products)
      .where(isNull(products.deletedAt))
      .orderBy(products.type, products.price);

    const courseIds = rows.filter((r) => r.targetType === "course" && r.targetId).map((r) => r.targetId!);
    const packIds = rows.filter((r) => r.targetType === "content_pack" && r.targetId).map((r) => r.targetId!);
    const lessonIds = rows.filter((r) => (r.targetType === "content" || r.targetType === "lesson") && r.targetId).map((r) => r.targetId!);

    const [courseRows, packRows, lessonRows] = await Promise.all([
      courseIds.length > 0
        ? this.db.select({ id: courses.id, name: courses.name }).from(courses).where(inArray(courses.id, courseIds))
        : Promise.resolve([]),
      packIds.length > 0
        ? this.db.select({ id: contentPacks.id, title: contentPacks.title }).from(contentPacks).where(inArray(contentPacks.id, packIds))
        : Promise.resolve([]),
      lessonIds.length > 0
        ? this.db.select({ id: lessons.id, title: lessons.title }).from(lessons).where(inArray(lessons.id, lessonIds))
        : Promise.resolve([]),
    ]);

    const titleMap = new Map<string, string>();
    for (const c of courseRows) titleMap.set(c.id, c.name);
    for (const p of packRows) titleMap.set(p.id, p.title);
    for (const l of lessonRows) titleMap.set(l.id, l.title);

    return rows.map((r) => {
      let targetTitle: string | undefined;
      if (r.targetId) {
        targetTitle = titleMap.get(r.targetId);
      }

      return {
        id: r.id,
        code: r.code,
        type: r.type,
        title: r.title,
        description: r.description,
        price: r.price,
        currency: r.currency,
        targetType: r.targetType,
        targetId: r.targetId,
        durationDays: r.durationDays,
        active: r.active,
        createdAt: r.createdAt.toISOString(),
        targetTitle,
      };
    });
  }

  async updateCommerceProduct(
    adminId: string,
    productId: string,
    payload: { active?: boolean; price?: number },
  ): Promise<AdminProductRecord> {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, productId), isNull(products.deletedAt)))
        .limit(1);

      if (!existing) {
        throw new Error("not_found");
      }


      const updateData: { active?: boolean; price?: number; updatedAt: Date } = {
        updatedAt: new Date(),
      };
      if (payload.active !== undefined) updateData.active = payload.active;
      if (payload.price !== undefined) updateData.price = payload.price;

      const [updated] = await tx
        .update(products)
        .set(updateData)
        .where(eq(products.id, productId))
        .returning();

      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorId: adminId,
        action: "COMMERCE_PRODUCT_UPDATED",
        entityType: "product",
        entityId: productId,
        details: {
          previousPrice: existing.price,
          newPrice: updated.price,
          previousActive: existing.active,
          newActive: updated.active,
        },
        createdAt: new Date(),
      });

      return {
        id: updated.id,
        code: updated.code,
        type: updated.type,
        title: updated.title,
        description: updated.description,
        price: updated.price,
        currency: updated.currency,
        targetType: updated.targetType,
        targetId: updated.targetId,
        durationDays: updated.durationDays,
        active: updated.active,
        createdAt: updated.createdAt.toISOString(),
      };
    });
  }

  async grantCommerceEntitlement(
    adminId: string,
    input: AdminGrantInput,
  ): Promise<AdminEntitlementRecord> {
    return this.db.transaction(async (tx) => {
      // 1. Verify User exists
      const [targetUser] = await tx
        .select({ id: users.id, email: users.email, name: users.name })
        .from(users)
        .where(and(eq(users.id, input.userId), isNull(users.deletedAt)))
        .limit(1);

      if (!targetUser) {
        throw new Error("user_not_found");
      }

      const now = new Date();
      let resourceTitle: string | undefined;

      // 2. Resource-specific verification and setup
      if (input.resourceType === "course") {
        if (!input.resourceId) throw new Error("missing_resource_id");
        const [courseRecord] = await tx
          .select({ id: courses.id, name: courses.name })
          .from(courses)
          .where(and(eq(courses.id, input.resourceId), isNull(courses.deletedAt)))
          .limit(1);

        if (!courseRecord) throw new Error("course_not_found");
        resourceTitle = courseRecord.name;

        // Insert Lifetime Course Entitlement (expires_at = null)
        const [inserted] = await tx
          .insert(userEntitlements)
          .values({
            id: randomUUID(),
            userId: targetUser.id,
            resourceType: "course",
            resourceId: input.resourceId,
            sourceType: "admin_grant",
            orderId: null,
            startsAt: now,
            expiresAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning();

        let finalEntitlement = inserted;
        if (!finalEntitlement) {
          const [existing] = await tx
            .select()
            .from(userEntitlements)
            .where(
              and(
                eq(userEntitlements.userId, targetUser.id),
                eq(userEntitlements.resourceType, "course"),
                eq(userEntitlements.resourceId, input.resourceId),
                isNull(userEntitlements.expiresAt)
              )
            )
            .limit(1);
          finalEntitlement = existing;
        }

        await tx.insert(auditLogs).values({
          id: randomUUID(),
          actorId: adminId,
          action: "COMMERCE_ADMIN_GRANT",
          entityType: "entitlement",
          entityId: finalEntitlement.id,
          details: {
            userId: targetUser.id,
            userEmail: targetUser.email,
            resourceType: "course",
            resourceId: input.resourceId,
            resourceTitle,
            lifetime: true,
          },
          createdAt: now,
        });

        return {
          id: finalEntitlement.id,
          userId: targetUser.id,
          userName: targetUser.name || undefined,
          userEmail: targetUser.email,
          resourceType: "course",
          resourceId: input.resourceId,
          resourceTitle,
          sourceType: "admin_grant",
          orderId: null,
          startsAt: finalEntitlement.startsAt.toISOString(),
          expiresAt: null,
          lifetime: true,
          active: true,
          createdAt: finalEntitlement.createdAt.toISOString(),
        };
      } else if (input.resourceType === "content_pack") {
        if (!input.resourceId) throw new Error("missing_resource_id");
        const [packRecord] = await tx
          .select({ id: contentPacks.id, title: contentPacks.title })
          .from(contentPacks)
          .where(and(eq(contentPacks.id, input.resourceId), isNull(contentPacks.deletedAt)))
          .limit(1);

        if (!packRecord) throw new Error("content_pack_not_found");
        resourceTitle = packRecord.title;

        // Insert Lifetime Content Pack Entitlement (expires_at = null)
        const [inserted] = await tx
          .insert(userEntitlements)
          .values({
            id: randomUUID(),
            userId: targetUser.id,
            resourceType: "content_pack",
            resourceId: input.resourceId,
            sourceType: "admin_grant",
            orderId: null,
            startsAt: now,
            expiresAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning();

        let finalEntitlement = inserted;
        if (!finalEntitlement) {
          const [existing] = await tx
            .select()
            .from(userEntitlements)
            .where(
              and(
                eq(userEntitlements.userId, targetUser.id),
                eq(userEntitlements.resourceType, "content_pack"),
                eq(userEntitlements.resourceId, input.resourceId),
                isNull(userEntitlements.expiresAt)
              )
            )
            .limit(1);
          finalEntitlement = existing;
        }

        await tx.insert(auditLogs).values({
          id: randomUUID(),
          actorId: adminId,
          action: "COMMERCE_ADMIN_GRANT",
          entityType: "entitlement",
          entityId: finalEntitlement.id,
          details: {
            userId: targetUser.id,
            userEmail: targetUser.email,
            resourceType: "content_pack",
            resourceId: input.resourceId,
            resourceTitle,
            lifetime: true,
          },
          createdAt: now,
        });

        return {
          id: finalEntitlement.id,
          userId: targetUser.id,
          userName: targetUser.name || undefined,
          userEmail: targetUser.email,
          resourceType: "content_pack",
          resourceId: input.resourceId,
          resourceTitle,
          sourceType: "admin_grant",
          orderId: null,
          startsAt: finalEntitlement.startsAt.toISOString(),
          expiresAt: null,
          lifetime: true,
          active: true,
          createdAt: finalEntitlement.createdAt.toISOString(),
        };
      } else if (input.resourceType === "content") {
        if (!input.resourceId) throw new Error("missing_resource_id");
        const [lessonRecord] = await tx
          .select({ id: lessons.id, title: lessons.title })
          .from(lessons)
          .where(and(eq(lessons.id, input.resourceId), isNull(lessons.deletedAt)))
          .limit(1);

        if (!lessonRecord) throw new Error("lesson_not_found");
        resourceTitle = lessonRecord.title;

        // Insert Lifetime Content Entitlement (expires_at = null)
        const [inserted] = await tx
          .insert(userEntitlements)
          .values({
            id: randomUUID(),
            userId: targetUser.id,
            resourceType: "content",
            resourceId: input.resourceId,
            sourceType: "admin_grant",
            orderId: null,
            startsAt: now,
            expiresAt: null,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing()
          .returning();

        let finalEntitlement = inserted;
        if (!finalEntitlement) {
          const [existing] = await tx
            .select()
            .from(userEntitlements)
            .where(
              and(
                eq(userEntitlements.userId, targetUser.id),
                eq(userEntitlements.resourceType, "content"),
                eq(userEntitlements.resourceId, input.resourceId),
                isNull(userEntitlements.expiresAt),
              ),
            )
            .limit(1);
          finalEntitlement = existing;
        }

        await tx.insert(auditLogs).values({
          id: randomUUID(),
          actorId: adminId,
          action: "COMMERCE_ADMIN_GRANT",
          entityType: "entitlement",
          entityId: finalEntitlement.id,
          details: {
            userId: targetUser.id,
            userEmail: targetUser.email,
            resourceType: "content",
            resourceId: input.resourceId,
            resourceTitle,
            lifetime: true,
          },
          createdAt: now,
        });

        return {
          id: finalEntitlement.id,
          userId: targetUser.id,
          userName: targetUser.name || undefined,
          userEmail: targetUser.email,
          resourceType: "content",
          resourceId: input.resourceId,
          resourceTitle,
          sourceType: "admin_grant",
          orderId: null,
          startsAt: finalEntitlement.startsAt.toISOString(),
          expiresAt: null,
          lifetime: true,
          active: true,
          createdAt: finalEntitlement.createdAt.toISOString(),
        };
      } else {
        // Subscription Grant
        resourceTitle = "اشتراک سراسری آوانا";
        const durationDays = input.durationDays && input.durationDays > 0 ? input.durationDays : 30;

        // Check if user has active subscription to extend
        const [activeSub] = await tx
          .select()
          .from(userSubscriptions)
          .where(and(eq(userSubscriptions.userId, targetUser.id), eq(userSubscriptions.status, "active"), gte(userSubscriptions.expiresAt, now)))
          .orderBy(desc(userSubscriptions.expiresAt))
          .limit(1);

        const baseDate = activeSub && new Date(activeSub.expiresAt).getTime() > now.getTime()
          ? new Date(activeSub.expiresAt)
          : now;

        const expiryDate = calculateSubscriptionExpiry(baseDate, durationDays);

        // Fetch standard subscription product for record linking
        const [subProduct] = await tx
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.type, "subscription"), isNull(products.deletedAt)))
          .limit(1);

        const subProductId = subProduct ? subProduct.id : randomUUID();

        // Create user_subscriptions record
        await tx.insert(userSubscriptions).values({
          id: randomUUID(),
          userId: targetUser.id,
          productId: subProductId,
          orderId: null,
          status: "active",
          startedAt: now,
          expiresAt: expiryDate,
          createdAt: now,
          updatedAt: now,
        });

        // Insert / Update user_entitlements record for subscription
        const [insertedEnt] = await tx
          .insert(userEntitlements)
          .values({
            id: randomUUID(),
            userId: targetUser.id,
            resourceType: "subscription",
            resourceId: null,
            sourceType: "admin_grant",
            orderId: null,
            startsAt: now,
            expiresAt: expiryDate,
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        await tx.insert(auditLogs).values({
          id: randomUUID(),
          actorId: adminId,
          action: "COMMERCE_ADMIN_GRANT",
          entityType: "entitlement",
          entityId: insertedEnt.id,
          details: {
            userId: targetUser.id,
            userEmail: targetUser.email,
            resourceType: "subscription",
            durationDays,
            expiresAt: expiryDate.toISOString(),
          },
          createdAt: now,
        });

        return {
          id: insertedEnt.id,
          userId: targetUser.id,
          userName: targetUser.name || undefined,
          userEmail: targetUser.email,
          resourceType: "subscription",
          resourceId: null,
          resourceTitle,
          sourceType: "admin_grant",
          orderId: null,
          startsAt: insertedEnt.startsAt.toISOString(),
          expiresAt: insertedEnt.expiresAt ? insertedEnt.expiresAt.toISOString() : null,
          lifetime: false,
          active: true,
          createdAt: insertedEnt.createdAt.toISOString(),
        };
      }
    });
  }

  async cancelCommerceSubscription(
    adminId: string,
    subscriptionId: string,
    reason?: string,
  ): Promise<{ success: boolean; subscription: AdminSubscriptionRecord; message?: string }> {
    const now = new Date();

    const [sub] = await this.db
      .select({
        sub: userSubscriptions,
        product: { id: products.id, title: products.title, code: products.code },
        user: { id: users.id, email: users.email, name: users.name },
      })
      .from(userSubscriptions)
      .innerJoin(products, eq(userSubscriptions.productId, products.id))
      .innerJoin(users, eq(userSubscriptions.userId, users.id))
      .where(eq(userSubscriptions.id, subscriptionId))
      .limit(1);

    if (!sub) {
      throw new Error("not_found");
    }

    // Idempotent: If already cancelled, return existing state without duplicate mutation
    if (sub.sub.status === "cancelled") {
      return {
        success: true,
        subscription: {
          id: sub.sub.id,
          userId: sub.user.id,
          userName: sub.user.name || undefined,
          userEmail: sub.user.email,
          productId: sub.product.id,
          productTitle: sub.product.title,
          plan: sub.product.code,
          status: "cancelled",
          startedAt: sub.sub.startedAt.toISOString(),
          expiresAt: sub.sub.expiresAt.toISOString(),
          orderId: sub.sub.orderId,
          createdAt: sub.sub.createdAt.toISOString(),
        },
        message: "اشتراک قبلاً لغو شده است.",
      };
    }

    // Expired subscriptions cannot be cancelled
    const isExpired =
      sub.sub.status === "expired" ||
      new Date(sub.sub.expiresAt).getTime() <= now.getTime();
    if (isExpired) {
      throw new Error("subscription_already_expired");
    }

    return this.db.transaction(async (tx) => {
      // 1. Update user_subscriptions status to 'cancelled' and expiresAt to 'now'
      const [updatedSub] = await tx
        .update(userSubscriptions)
        .set({
          status: "cancelled",
          expiresAt: now,
          updatedAt: now,
        })
        .where(eq(userSubscriptions.id, subscriptionId))
        .returning();

      // 2. Identify and expire strictly the entitlement linked to this subscription
      if (sub.sub.orderId) {
        // Linked by purchase orderId
        await tx
          .update(userEntitlements)
          .set({
            expiresAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(userEntitlements.userId, sub.user.id),
              eq(userEntitlements.resourceType, "subscription"),
              eq(userEntitlements.orderId, sub.sub.orderId),
              or(isNull(userEntitlements.expiresAt), gt(userEntitlements.expiresAt, now)),
            ),
          );
      } else {
        // Linked by admin_grant - strictly target the exact matching entitlement
        await tx
          .update(userEntitlements)
          .set({
            expiresAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(userEntitlements.userId, sub.user.id),
              eq(userEntitlements.resourceType, "subscription"),
              eq(userEntitlements.sourceType, "admin_grant"),
              isNull(userEntitlements.orderId),
              eq(userEntitlements.startsAt, sub.sub.startedAt),
              eq(userEntitlements.expiresAt, sub.sub.expiresAt),
            ),
          );
      }

      // 3. Emit immutable audit log
      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorId: adminId,
        action: "COMMERCE_SUBSCRIPTION_CANCELLED",
        entityType: "subscription",
        entityId: subscriptionId,
        details: {
          userId: sub.user.id,
          userEmail: sub.user.email,
          orderId: sub.sub.orderId,
          plan: sub.product.code,
          productTitle: sub.product.title,
          previousStatus: sub.sub.status,
          previousExpiresAt: sub.sub.expiresAt.toISOString(),
          cancelledAt: now.toISOString(),
          reason: reason?.trim() || null,
          immediate: true,
        },
        createdAt: now,
      });

      return {
        success: true,
        subscription: {
          id: updatedSub.id,
          userId: sub.user.id,
          userName: sub.user.name || undefined,
          userEmail: sub.user.email,
          productId: sub.product.id,
          productTitle: sub.product.title,
          plan: sub.product.code,
          status: "cancelled",
          startedAt: updatedSub.startedAt.toISOString(),
          expiresAt: updatedSub.expiresAt.toISOString(),
          orderId: updatedSub.orderId,
          createdAt: updatedSub.createdAt.toISOString(),
        },
      };
    });
  }

  async approveCommercePayment(
    adminId: string,
    paymentId: string,
  ): Promise<{ success: boolean; payment: AdminPaymentRecord; message?: string }> {
    const now = new Date();

    const [record] = await this.db
      .select({
        payment: payments,
        order: { id: orders.id, orderNumber: orders.orderNumber },
        user: { id: users.id, email: users.email, name: users.name },
        product: { id: products.id, title: products.title },
      })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .innerJoin(users, eq(payments.userId, users.id))
      .innerJoin(products, eq(orders.productId, products.id))
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!record) {
      throw new Error("not_found");
    }

    // Idempotent: If already approved or paid
    if (
      record.payment.status === "admin_approved" ||
      record.payment.status === "paid"
    ) {
      return {
        success: true,
        payment: {
          id: record.payment.id,
          orderId: record.order.id,
          orderNumber: record.order.orderNumber,
          userId: record.user.id,
          userName: record.user.name || undefined,
          userEmail: record.user.email,
          productTitle: record.product.title,
          amount: record.payment.amount,
          currency: record.payment.currency,
          gateway: record.payment.gateway,
          authority: record.payment.authority,
          transactionId: record.payment.transactionId,
          status: record.payment.status,
          trackingNumber: record.payment.trackingNumber ?? null,
          sourceCardLast4: record.payment.sourceCardLast4 ?? null,
          payerName: record.payment.payerName ?? null,
          receiptUrl: record.payment.receiptUrl ?? null,
          initialValidationResult:
            (record.payment.initialValidationResult as Record<string, unknown>) ??
            null,
          rejectionReason: record.payment.rejectionReason ?? null,
          reviewedAt: record.payment.reviewedAt
            ? record.payment.reviewedAt.toISOString()
            : null,
          reviewedBy: record.payment.reviewedBy ?? null,
          paidAt: record.payment.paidAt
            ? record.payment.paidAt.toISOString()
            : null,
          createdAt: record.payment.createdAt.toISOString(),
        },
        message: "پرداخت قبلاً تأیید شده است.",
      };
    }

    if (
      record.payment.status === "admin_rejected" ||
      record.payment.status === "cancelled"
    ) {
      throw new Error("payment_already_rejected");
    }

    if (record.payment.status !== "pending_admin_review") {
      throw new Error("invalid_payment_status");
    }

    return this.db.transaction(async (tx) => {
      // 1. Update payment to admin_approved
      const [updatedPayment] = await tx
        .update(payments)
        .set({
          status: "admin_approved",
          reviewedAt: now,
          reviewedBy: adminId,
          updatedAt: now,
        })
        .where(eq(payments.id, paymentId))
        .returning();

      // 2. Update order to paid
      await tx
        .update(orders)
        .set({
          status: "paid",
          updatedAt: now,
        })
        .where(eq(orders.id, record.order.id));

      // 3. Update user subscription status to active
      await tx
        .update(userSubscriptions)
        .set({
          status: "active",
          updatedAt: now,
        })
        .where(eq(userSubscriptions.orderId, record.order.id));

      // 4. Emit Audit Log
      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorId: adminId,
        action: "COMMERCE_PAYMENT_ADMIN_APPROVED",
        entityType: "payment",
        entityId: paymentId,
        details: {
          userId: record.user.id,
          userEmail: record.user.email,
          orderId: record.order.id,
          orderNumber: record.order.orderNumber,
          amount: record.payment.amount,
          trackingNumber: record.payment.trackingNumber,
          sourceCardLast4: record.payment.sourceCardLast4,
          approvedAt: now.toISOString(),
        },
        createdAt: now,
      });

      return {
        success: true,
        payment: {
          id: updatedPayment.id,
          orderId: record.order.id,
          orderNumber: record.order.orderNumber,
          userId: record.user.id,
          userName: record.user.name || undefined,
          userEmail: record.user.email,
          productTitle: record.product.title,
          amount: updatedPayment.amount,
          currency: updatedPayment.currency,
          gateway: updatedPayment.gateway,
          authority: updatedPayment.authority,
          transactionId: updatedPayment.transactionId,
          status: updatedPayment.status,
          trackingNumber: updatedPayment.trackingNumber ?? null,
          sourceCardLast4: updatedPayment.sourceCardLast4 ?? null,
          payerName: updatedPayment.payerName ?? null,
          receiptUrl: updatedPayment.receiptUrl ?? null,
          initialValidationResult:
            (updatedPayment.initialValidationResult as Record<
              string,
              unknown
            >) ?? null,
          rejectionReason: updatedPayment.rejectionReason ?? null,
          reviewedAt: updatedPayment.reviewedAt
            ? updatedPayment.reviewedAt.toISOString()
            : null,
          reviewedBy: updatedPayment.reviewedBy ?? null,
          paidAt: updatedPayment.paidAt
            ? updatedPayment.paidAt.toISOString()
            : null,
          createdAt: updatedPayment.createdAt.toISOString(),
        },
        message: "پرداخت کارت‌به‌کارت با موفقیت تأیید شد.",
      };
    });
  }

  async rejectCommercePayment(
    adminId: string,
    paymentId: string,
    reason: string,
  ): Promise<{ success: boolean; payment: AdminPaymentRecord; message?: string }> {
    const trimmedReason = reason?.trim();
    if (!trimmedReason) {
      throw new Error("rejection_reason_required");
    }

    const now = new Date();

    const [record] = await this.db
      .select({
        payment: payments,
        order: { id: orders.id, orderNumber: orders.orderNumber },
        user: { id: users.id, email: users.email, name: users.name },
        product: { id: products.id, title: products.title },
      })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .innerJoin(users, eq(payments.userId, users.id))
      .innerJoin(products, eq(orders.productId, products.id))
      .where(eq(payments.id, paymentId))
      .limit(1);

    if (!record) {
      throw new Error("not_found");
    }

    // Idempotent: If already rejected
    if (record.payment.status === "admin_rejected") {
      return {
        success: true,
        payment: {
          id: record.payment.id,
          orderId: record.order.id,
          orderNumber: record.order.orderNumber,
          userId: record.user.id,
          userName: record.user.name || undefined,
          userEmail: record.user.email,
          productTitle: record.product.title,
          amount: record.payment.amount,
          currency: record.payment.currency,
          gateway: record.payment.gateway,
          authority: record.payment.authority,
          transactionId: record.payment.transactionId,
          status: record.payment.status,
          trackingNumber: record.payment.trackingNumber ?? null,
          sourceCardLast4: record.payment.sourceCardLast4 ?? null,
          payerName: record.payment.payerName ?? null,
          receiptUrl: record.payment.receiptUrl ?? null,
          initialValidationResult:
            (record.payment.initialValidationResult as Record<string, unknown>) ??
            null,
          rejectionReason: record.payment.rejectionReason ?? null,
          reviewedAt: record.payment.reviewedAt
            ? record.payment.reviewedAt.toISOString()
            : null,
          reviewedBy: record.payment.reviewedBy ?? null,
          paidAt: record.payment.paidAt
            ? record.payment.paidAt.toISOString()
            : null,
          createdAt: record.payment.createdAt.toISOString(),
        },
        message: "پرداخت قبلاً رد شده است.",
      };
    }

    if (
      record.payment.status === "admin_approved" ||
      record.payment.status === "paid"
    ) {
      throw new Error("payment_already_approved");
    }

    if (record.payment.status !== "pending_admin_review") {
      throw new Error("invalid_payment_status");
    }

    return this.db.transaction(async (tx) => {
      // 1. Update payment to admin_rejected with reason
      const [updatedPayment] = await tx
        .update(payments)
        .set({
          status: "admin_rejected",
          rejectionReason: trimmedReason,
          reviewedAt: now,
          reviewedBy: adminId,
          updatedAt: now,
        })
        .where(eq(payments.id, paymentId))
        .returning();

      // 2. Update order to cancelled
      await tx
        .update(orders)
        .set({
          status: "cancelled",
          updatedAt: now,
        })
        .where(eq(orders.id, record.order.id));

      // 3. Update subscription status to cancelled_payment_rejected and expire it
      await tx
        .update(userSubscriptions)
        .set({
          status: "cancelled_payment_rejected",
          expiresAt: now,
          updatedAt: now,
        })
        .where(eq(userSubscriptions.orderId, record.order.id));

      // 4. Centralized Access Control Revocation: Immediately expire user_entitlements linked to this order
      await tx
        .update(userEntitlements)
        .set({
          expiresAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(userEntitlements.userId, record.user.id),
            eq(userEntitlements.resourceType, "subscription"),
            eq(userEntitlements.orderId, record.order.id),
          ),
        );

      // 5. Emit Audit Log
      await tx.insert(auditLogs).values({
        id: randomUUID(),
        actorId: adminId,
        action: "COMMERCE_PAYMENT_ADMIN_REJECTED",
        entityType: "payment",
        entityId: paymentId,
        details: {
          userId: record.user.id,
          userEmail: record.user.email,
          orderId: record.order.id,
          orderNumber: record.order.orderNumber,
          amount: record.payment.amount,
          trackingNumber: record.payment.trackingNumber,
          sourceCardLast4: record.payment.sourceCardLast4,
          reason: trimmedReason,
          rejectedAt: now.toISOString(),
        },
        createdAt: now,
      });

      return {
        success: true,
        payment: {
          id: updatedPayment.id,
          orderId: record.order.id,
          orderNumber: record.order.orderNumber,
          userId: record.user.id,
          userName: record.user.name || undefined,
          userEmail: record.user.email,
          productTitle: record.product.title,
          amount: updatedPayment.amount,
          currency: updatedPayment.currency,
          gateway: updatedPayment.gateway,
          authority: updatedPayment.authority,
          transactionId: updatedPayment.transactionId,
          status: updatedPayment.status,
          trackingNumber: updatedPayment.trackingNumber ?? null,
          sourceCardLast4: updatedPayment.sourceCardLast4 ?? null,
          payerName: updatedPayment.payerName ?? null,
          receiptUrl: updatedPayment.receiptUrl ?? null,
          initialValidationResult:
            (updatedPayment.initialValidationResult as Record<
              string,
              unknown
            >) ?? null,
          rejectionReason: updatedPayment.rejectionReason ?? null,
          reviewedAt: updatedPayment.reviewedAt
            ? updatedPayment.reviewedAt.toISOString()
            : null,
          reviewedBy: updatedPayment.reviewedBy ?? null,
          paidAt: updatedPayment.paidAt
            ? updatedPayment.paidAt.toISOString()
            : null,
          createdAt: updatedPayment.createdAt.toISOString(),
        },
        message: "پرداخت رد شد و دسترسی اشتراک بلافاصله لغو گردید.",
      };
    });
  }

  async getUserCommerceProfile(userId: string): Promise<AdminUserCommerceProfile> {
    const now = new Date();

    const [userRecord] = await this.db
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);

    if (!userRecord) {
      throw new Error("user_not_found");
    }

    // Subscriptions
    const subRows = await this.db
      .select({
        sub: userSubscriptions,
        product: { id: products.id, title: products.title, code: products.code },
      })
      .from(userSubscriptions)
      .innerJoin(products, eq(userSubscriptions.productId, products.id))
      .where(eq(userSubscriptions.userId, userId))
      .orderBy(desc(userSubscriptions.createdAt));

    let activeSubscription: AdminSubscriptionRecord | null = null;
    const subscriptionHistory: AdminSubscriptionRecord[] = [];

    for (const r of subRows) {
      let resolvedStatus = r.sub.status;
      const isSubActive = r.sub.status === "active" && new Date(r.sub.expiresAt).getTime() >= now.getTime();
      if (r.sub.status === "active" && !isSubActive) {
        resolvedStatus = "expired";
      }

      const rec: AdminSubscriptionRecord = {
        id: r.sub.id,
        userId: userRecord.id,
        userName: userRecord.name || undefined,
        userEmail: userRecord.email,
        productId: r.product.id,
        productTitle: r.product.title,
        plan: r.product.code,
        status: resolvedStatus,
        startedAt: r.sub.startedAt.toISOString(),
        expiresAt: r.sub.expiresAt.toISOString(),
        orderId: r.sub.orderId,
        createdAt: r.sub.createdAt.toISOString(),
      };

      subscriptionHistory.push(rec);
      if (isSubActive && !activeSubscription) {
        activeSubscription = rec;
      }
    }

    // Entitlements
    const entRows = await this.db
      .select()
      .from(userEntitlements)
      .where(eq(userEntitlements.userId, userId))
      .orderBy(desc(userEntitlements.createdAt));

    const courseIds = entRows.filter((r) => r.resourceType === "course" && r.resourceId).map((r) => r.resourceId!);
    const packIds = entRows.filter((r) => r.resourceType === "content_pack" && r.resourceId).map((r) => r.resourceId!);

    const [courseRows, packRows] = await Promise.all([
      courseIds.length > 0
        ? this.db.select({ id: courses.id, name: courses.name }).from(courses).where(inArray(courses.id, courseIds))
        : Promise.resolve([]),
      packIds.length > 0
        ? this.db.select({ id: contentPacks.id, title: contentPacks.title }).from(contentPacks).where(inArray(contentPacks.id, packIds))
        : Promise.resolve([]),
    ]);

    const titleMap = new Map<string, string>();
    for (const c of courseRows) titleMap.set(c.id, c.name);
    for (const p of packRows) titleMap.set(p.id, p.title);

    const entitlements: AdminEntitlementRecord[] = [];
    const lifetimePurchases: AdminEntitlementRecord[] = [];

    for (const r of entRows) {
      const isLifetime = r.expiresAt === null;
      const isActive = isLifetime || new Date(r.expiresAt!).getTime() >= now.getTime();

      let resourceTitle: string | undefined;
      if (r.resourceType === "subscription") {
        resourceTitle = "اشتراک سراسری آوانا";
      } else if (r.resourceId) {
        resourceTitle = titleMap.get(r.resourceId);
      }

      const rec: AdminEntitlementRecord = {
        id: r.id,
        userId: userRecord.id,
        userName: userRecord.name || undefined,
        userEmail: userRecord.email,
        resourceType: r.resourceType,
        resourceId: r.resourceId,
        resourceTitle,
        sourceType: r.sourceType,
        orderId: r.orderId,
        startsAt: r.startsAt.toISOString(),
        expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
        lifetime: isLifetime,
        active: isActive,
        createdAt: r.createdAt.toISOString(),
      };

      entitlements.push(rec);
      if (isLifetime) {
        lifetimePurchases.push(rec);
      }
    }

    // Orders
    const orderRows = await this.db
      .select({
        order: orders,
        product: { id: products.id, title: products.title, type: products.type },
      })
      .from(orders)
      .innerJoin(products, eq(orders.productId, products.id))
      .where(eq(orders.userId, userId))
      .orderBy(desc(orders.createdAt));

    const orderList: AdminOrderRecord[] = orderRows.map((r) => ({
      id: r.order.id,
      orderNumber: r.order.orderNumber,
      userId: userRecord.id,
      userName: userRecord.name || undefined,
      userEmail: userRecord.email,
      productId: r.product.id,
      productTitle: r.product.title,
      productType: r.product.type,
      amount: r.order.amount,
      currency: r.order.currency,
      status: r.order.status,
      createdAt: r.order.createdAt.toISOString(),
      updatedAt: r.order.updatedAt.toISOString(),
    }));

    // Payments
    const paymentRows = await this.db
      .select({
        payment: payments,
        order: { id: orders.id, orderNumber: orders.orderNumber },
      })
      .from(payments)
      .innerJoin(orders, eq(payments.orderId, orders.id))
      .where(eq(payments.userId, userId))
      .orderBy(desc(payments.createdAt));

    const paymentList: AdminPaymentRecord[] = paymentRows.map((r) => ({
      id: r.payment.id,
      orderId: r.order.id,
      orderNumber: r.order.orderNumber,
      userId: userRecord.id,
      userName: userRecord.name || undefined,
      userEmail: userRecord.email,
      amount: r.payment.amount,
      currency: r.payment.currency,
      gateway: r.payment.gateway,
      authority: r.payment.authority,
      transactionId: r.payment.transactionId,
      status: r.payment.status,
      paidAt: r.payment.paidAt ? r.payment.paidAt.toISOString() : null,
      createdAt: r.payment.createdAt.toISOString(),
    }));

    return {
      user: {
        id: userRecord.id,
        email: userRecord.email,
        name: userRecord.name || undefined,
      },
      activeSubscription,
      subscriptionHistory,
      lifetimePurchases,
      entitlements,
      orders: orderList,
      payments: paymentList,
    };
  }
}
