/**
 * Drizzle-backed implementation of AdminStore.
 */

import { count, eq, sql, gte, ilike, or, desc, isNull, isNotNull, and, inArray, type SQL } from "drizzle-orm";
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
  quizQuestions,
  auditLogs,
  generatedContents,
  organizationMemberships,
} from "@avana/database/schema";
import { resolveEffectiveRole, type Role } from "@avana/domain";
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
      })
      .from(documents)
      .leftJoin(courses, eq(documents.courseId, courses.id))
      .leftJoin(users, eq(documents.ownerUserId, users.id))
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
      })),
    };
  }

  async getDocument(id: string): Promise<AdminDocumentRecord | null> {
    const res = await this.db.select({
      doc: documents,
      courseName: courses.name,
      userEmail: users.email,
    })
    .from(documents)
    .leftJoin(courses, eq(documents.courseId, courses.id))
    .leftJoin(users, eq(documents.ownerUserId, users.id))
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
}
