/**
 * Drizzle-backed implementation of AdminStore.
 */

import { count, eq, sql, gte, ilike, or, desc, isNull, and, inArray } from "drizzle-orm";
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
import type { AdminStore, DashboardStats, AdminUsersList, AdminGenerationJobRecord, DataIntegrityReport, AdminCourseRecord, AdminDocumentRecord, AdminSystemHealth, AdminLogRecord, AdminAuditRecord, AdminLessonRecord, AdminFlashcardRecord, AdminExamRecord, AdminGenerationDetail } from "./admin-store.js";

export class DrizzleAdminStore implements AdminStore {
  constructor(private readonly db: DbClient) {}

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

    let baseFilter = isNull(users.deletedAt) as any;

    if (search) {
      baseFilter = and(
        baseFilter,
        or(
          ilike(users.email, `%${search}%`),
          ilike(users.name, `%${search}%`)
        )
      ) as any;
    }

    if (status) {
      if (status === "active") {
        baseFilter = and(baseFilter, sql`${users.emailVerifiedAt} IS NOT NULL`) as any;
      } else if (status === "inactive") {
        baseFilter = and(baseFilter, sql`${users.emailVerifiedAt} IS NULL`) as any;
      }
    }

    if (role) {
      baseFilter = and(
        baseFilter,
        inArray(
          users.id,
          this.db.select({ userId: organizationMemberships.userId })
            .from(organizationMemberships)
            .where(eq(organizationMemberships.role, role))
        )
      ) as any;
    }

    let baseQuery = this.db.select().from(users).where(baseFilter) as any;
    let countQuery = this.db.select({ count: count() }).from(users).where(baseFilter) as any;

    const [totalRes, userRows] = await Promise.all([
      countQuery,
      baseQuery.limit(pageSize).offset(offset).orderBy(desc(users.createdAt)),
    ]);

    const userIds = userRows.map((u: any) => u.id);
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
      users: userRows.map((u: any) => {
        const userRoles = rolesMap.get(u.id) || [];
        const effectiveRole = resolveEffectiveRole(userRoles);
        return {
          id: u.id,
          email: u.email,
          name: u.name,
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

    let baseQuery = this.db.select({
      job: generationJobs,
      documentName: documents.originalName,
      userEmail: users.email,
    })
    .from(generationJobs)
    .leftJoin(documents, eq(generationJobs.documentId, documents.id))
    .leftJoin(users, eq(documents.ownerUserId, users.id))
    .where(isNull(generationJobs.deletedAt)) as any;

    let countQuery = this.db.select({ count: count() })
      .from(generationJobs)
      .where(isNull(generationJobs.deletedAt)) as any;

    if (status) {
      const statusFilter = and(isNull(generationJobs.deletedAt), eq(generationJobs.status, status));
      
      baseQuery = this.db.select({
        job: generationJobs,
        documentName: documents.originalName,
        userEmail: users.email,
      })
      .from(generationJobs)
      .leftJoin(documents, eq(generationJobs.documentId, documents.id))
      .leftJoin(users, eq(documents.ownerUserId, users.id))
      .where(statusFilter) as any;

      countQuery = this.db.select({ count: count() })
        .from(generationJobs)
        .where(statusFilter) as any;
    }

    const [totalRes, rows] = await Promise.all([
      countQuery,
      baseQuery.limit(pageSize).offset(offset).orderBy(desc(generationJobs.createdAt)),
    ]);

    return {
      totalCount: totalRes[0].count,
      jobs: rows.map((r: any) => ({
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

    let baseQuery = this.db.select().from(courses).where(isNull(courses.deletedAt)) as any;
    let countQuery = this.db.select({ count: count() }).from(courses).where(isNull(courses.deletedAt)) as any;

    if (search) {
      const searchFilter = and(isNull(courses.deletedAt), ilike(courses.name, `%${search}%`));
      baseQuery = this.db.select().from(courses).where(searchFilter) as any;
      countQuery = this.db.select({ count: count() }).from(courses).where(searchFilter) as any;
    }

    const [totalRes, courseRows] = await Promise.all([
      countQuery,
      baseQuery.limit(pageSize).offset(offset).orderBy(sql`${courses.createdAt} DESC`),
    ]);

    // For simplicity, we can fetch counts per course in a separate query if courseRows is small (e.g. 20)
    // or use a single subquery. For 20 rows, 4 parallel count queries per row is fine for a lightweight Admin panel,
    // but better to do it cleanly. We will use a group by query for the IDs.
    const courseIds = courseRows.map((c: any) => c.id);
    const courseStats = new Map();

    if (courseIds.length > 0) {
      const [modulesCounts, lessonsCounts, flashcardsCounts, quizzesCounts] = await Promise.all([
        this.db.select({ courseId: modules.courseId, count: count() }).from(modules).where(inArray(modules.courseId, courseIds)).groupBy(modules.courseId),
        // lessons are linked to courses via modules. Oh, wait, lessons have moduleId.
        this.db.select({ courseId: modules.courseId, count: count() }).from(lessons).innerJoin(modules, eq(lessons.moduleId, modules.id)).where(and(inArray(modules.courseId, courseIds), isNull(lessons.deletedAt))).groupBy(modules.courseId),
        // flashcards linked via lessons
        this.db.select({ courseId: modules.courseId, count: count() }).from(flashcards).innerJoin(lessons, eq(flashcards.lessonId, lessons.id)).innerJoin(modules, eq(lessons.moduleId, modules.id)).where(and(inArray(modules.courseId, courseIds), isNull(flashcards.deletedAt))).groupBy(modules.courseId),
        // quizzes linked via quiz_questions -> lesson -> module
        this.db.select({ courseId: modules.courseId, count: count() })
          .from(quizzes)
          .innerJoin(quizQuestions, eq(quizzes.id, quizQuestions.quizId))
          .innerJoin(lessons, eq(quizQuestions.lessonId, lessons.id))
          .innerJoin(modules, eq(lessons.moduleId, modules.id))
          .where(and(inArray(modules.courseId, courseIds), isNull(quizzes.deletedAt)))
          .groupBy(modules.courseId),
      ]);

      for (const id of courseIds) {
        courseStats.set(id, { modules: 0, lessons: 0, flashcards: 0, quizzes: 0 });
      }
      for (const row of modulesCounts) courseStats.get(row.courseId).modules = row.count;
      for (const row of lessonsCounts) courseStats.get(row.courseId).lessons = row.count;
      for (const row of flashcardsCounts) courseStats.get(row.courseId).flashcards = row.count;
      for (const row of quizzesCounts) courseStats.get(row.courseId).quizzes = row.count;
    }

    return {
      totalCount: totalRes[0].count,
      courses: courseRows.map((c: any) => ({
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

    let baseFilter = isNull(documents.deletedAt);
    if (search) {
      baseFilter = and(baseFilter, ilike(documents.originalName, `%${search}%`)) as any;
    }
    if (status) {
      baseFilter = and(baseFilter, eq(documents.status, status)) as any;
    }

    const [totalRes, docRows] = await Promise.all([
      this.db.select({ count: count() }).from(documents).where(baseFilter),
      this.db.select({
        doc: documents,
        courseName: courses.name,
        userEmail: users.email,
      })
      .from(documents)
      .leftJoin(courses, eq(documents.courseId, courses.id))
      .leftJoin(users, eq(documents.ownerUserId, users.id))
      .where(baseFilter)
      .limit(pageSize)
      .offset(offset)
      .orderBy(sql`${documents.createdAt} DESC`),
    ]);

    return {
      totalCount: totalRes[0].count,
      documents: docRows.map((row: any) => ({
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
    // Basic DB check
    let dbStatus: "healthy" | "error" = "error";
    try {
      await this.db.select({ val: sql`1` });
      dbStatus = "healthy";
    } catch {
      // Ignore
    }

    return {
      database: dbStatus,
      redis: "unknown",
      ai: "unknown",
      lastCheck: new Date().toISOString(),
    };
  }

  async listLogs(_params: { page: number; pageSize: number; level?: string }): Promise<{ logs: AdminLogRecord[]; totalCount: number }> {
    // If there is no DB logs table, we return empty. Admin panel shouldn't crash if logs aren't in DB.
    return { logs: [], totalCount: 0 };
  }

  async listAuditLogs(params: { page: number; pageSize: number; search?: string; action?: string; entityType?: string; adminEmail?: string }): Promise<{ logs: AdminAuditRecord[]; totalCount: number }> {
    const { page, pageSize, search, action, entityType, adminEmail } = params;
    const offset = (page - 1) * pageSize;

    let baseFilter = undefined as any;
    if (action) baseFilter = baseFilter ? and(baseFilter, eq(auditLogs.action, action)) : eq(auditLogs.action, action);
    if (entityType) baseFilter = baseFilter ? and(baseFilter, eq(auditLogs.entityType, entityType)) : eq(auditLogs.entityType, entityType);
    if (adminEmail) baseFilter = baseFilter ? and(baseFilter, eq(users.email, adminEmail)) : eq(users.email, adminEmail);
    if (search) {
      const searchFilter = or(
        ilike(auditLogs.action, `%${search}%`),
        ilike(auditLogs.entityType, `%${search}%`),
        ilike(users.email, `%${search}%`),
        sql`${auditLogs.details}::text ILIKE ${`%${search}%`}`
      );
      baseFilter = baseFilter ? and(baseFilter, searchFilter) : searchFilter;
    }

    const [totalRes, rows] = await Promise.all([
      this.db.select({ count: count() }).from(auditLogs)
        .leftJoin(users, eq(auditLogs.actorId, users.id))
        .where(baseFilter),
      this.db.select({
        log: auditLogs,
        adminEmail: users.email,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .where(baseFilter)
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
        metadata: r.log.details || {},
      })),
    };
  }

  async listLessons(params: { page: number; pageSize: number; search?: string }): Promise<{ lessons: AdminLessonRecord[]; totalCount: number }> {
    const { page, pageSize, search } = params;
    const offset = (page - 1) * pageSize;

    let baseFilter = isNull(lessons.deletedAt);
    if (search) {
      baseFilter = and(baseFilter, ilike(lessons.title, `%${search}%`)) as any;
    }

    const [totalRes, rows] = await Promise.all([
      this.db.select({ count: count() }).from(lessons).where(baseFilter),
      this.db.select({
        lesson: lessons,
        moduleTitle: modules.title,
        courseName: courses.name,
      })
      .from(lessons)
      .leftJoin(modules, eq(lessons.moduleId, modules.id))
      .leftJoin(courses, eq(modules.courseId, courses.id))
      .where(baseFilter)
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

    let baseFilter = isNull(flashcards.deletedAt);
    if (search) {
      baseFilter = and(baseFilter, ilike(flashcards.question, `%${search}%`)) as any;
    }

    const [totalRes, rows] = await Promise.all([
      this.db.select({ count: count() }).from(flashcards).where(baseFilter),
      this.db.select({
        flashcard: flashcards,
        lessonTitle: lessons.title,
      })
      .from(flashcards)
      .leftJoin(lessons, eq(flashcards.lessonId, lessons.id))
      .where(baseFilter)
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

    let baseFilter = isNull(quizzes.deletedAt);
    if (search) {
      baseFilter = and(baseFilter, ilike(quizzes.title, `%${search}%`)) as any;
    }

    const [totalRes, rows] = await Promise.all([
      this.db.select({ count: count() }).from(quizzes).where(baseFilter),
      this.db.select({
        exam: quizzes,
      })
      .from(quizzes)
      .where(baseFilter)
      .limit(pageSize)
      .offset(offset)
      .orderBy(sql`${quizzes.createdAt} DESC`),
    ]);
    
    // fetch question counts for rows
    const examIds = rows.map(r => r.exam.id);
    const questionCounts = new Map();
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

  async getCourseHierarchy(courseId: string): Promise<any | null> {
    const courseRes = await this.db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
    if (!courseRes.length) return null;
    const course = courseRes[0];

    const courseModules = await this.db.select().from(modules)
      .where(and(eq(modules.courseId, courseId), isNull(modules.deletedAt)))
      .orderBy(modules.sortOrder);

    const moduleIds = courseModules.map((m) => m.id);
    let courseLessons: any[] = [];
    if (moduleIds.length > 0) {
      courseLessons = await this.db.select({
        id: lessons.id,
        moduleId: lessons.moduleId,
        title: lessons.title,
        publicationStatus: lessons.publicationStatus,
        createdAt: lessons.createdAt,
        hasContent: sql<boolean>`length(${lessons.contentMarkdown}) > 0`.as('has_content')
      }).from(lessons)
      .where(and(inArray(lessons.moduleId, moduleIds), isNull(lessons.deletedAt)))
      .orderBy(lessons.sortOrder);
      
      const lessonIds = courseLessons.map((l) => l.id);
      
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

        courseLessons = courseLessons.map((l) => ({
          ...l,
          flashcards: fcMap.get(l.id) || 0,
          quizzes: qMap.get(l.id) || 0,
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

  async getAnalytics(): Promise<any> {
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
        const u = await this.db.select({ count: count() }).from(users).where(isNull(users.deletedAt)).then(r => r[0].count);
        const l = await this.db.select({ count: count() }).from(lessons).where(isNull(lessons.deletedAt)).then(r => r[0].count);
        return { totalUsers: u, totalLessons: l };
      })(),
      getStats(today),
      getStats(d7),
      getStats(d30),
    ]);

    return { total, today: tToday, last7Days: t7, last30Days: t30 };
  }

  async getAiAnalytics(): Promise<any> {
    const jobs = await this.db.select({
      type: generationJobs.type,
      status: generationJobs.status,
      startedAt: generationJobs.startedAt,
      completedAt: generationJobs.completedAt,
    })
    .from(generationJobs)
    .where(isNull(generationJobs.deletedAt));

    const totalJobs = jobs.length;
    const successful = jobs.filter(j => j.status === 'completed').length;
    const failed = jobs.filter(j => j.status === 'failed').length;
    const processing = jobs.filter(j => j.status === 'processing').length;
    
    let totalLatency = 0;
    let latencyCount = 0;
    const typeStats: Record<string, { total: number; success: number }> = {};

    for (const job of jobs) {
      if (!typeStats[job.type]) typeStats[job.type] = { total: 0, success: 0 };
      typeStats[job.type].total++;
      if (job.status === 'completed') typeStats[job.type].success++;

      if (job.startedAt && job.completedAt) {
        totalLatency += (job.completedAt.getTime() - job.startedAt.getTime());
        latencyCount++;
      }
    }

    const contents = await this.db.select({
      tokenUsage: generatedContents.tokenUsage
    }).from(generatedContents);

    let input = 0;
    let output = 0;
    let hasTokenData = false;

    for (const row of contents) {
      if (row.tokenUsage) {
        const usage = row.tokenUsage as any;
        if (typeof usage.inputTokens === 'number' || typeof usage.outputTokens === 'number' || typeof usage.prompt_tokens === 'number') {
          hasTokenData = true;
          input += (usage.inputTokens || usage.prompt_tokens || 0);
          output += (usage.outputTokens || usage.completion_tokens || 0);
        }
      }
    }

    return {
      overview: {
        totalJobs,
        successful,
        failed,
        processing,
        successRate: totalJobs ? (successful / totalJobs) * 100 : 0,
        averageDurationMs: latencyCount ? totalLatency / latencyCount : 0,
      },
      byType: typeStats,
      tokens: hasTokenData ? {
        available: true,
        input,
        output,
        total: input + output
      } : {
        available: false,
        input: 0,
        output: 0,
        total: 0
      }
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
      
      await tx.update(organizationMemberships)
        .set({ role: newRole, updatedAt: new Date() })
        .where(eq(organizationMemberships.id, membership.id));
        
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
      const updateData: any = { updatedAt: new Date() };
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
