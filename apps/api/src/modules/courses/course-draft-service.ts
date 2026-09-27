import { randomUUID } from "node:crypto";
import { eq, and, isNull, inArray } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  courses,
  modules,
  lessons,
  flashcards,
  quizzes,
  quizQuestions,
  courseDraftSessions,
  courseReleases,
} from "@avana/database/schema";
import {
  DomainError,
  asCourseDraftSessionId,
  asCourseReleaseId,
  asCourseId,
  asUserId,
  mergeDraftChange,
} from "@avana/domain";
import type {
  Actor,
  CourseId,
  CourseDraftSessionId,
  CourseDraftChangeId,
  CourseReleaseId,
  CourseDraftSessionRecord,
  CourseDraftChangeRecord,
  CourseReleaseRecord,
  DraftSessionSource,
  DraftEntityType,
  DraftAction,
  DraftChangePayload,
  IncomingDraftChange,
  DraftSessionValidationReport,
  ReleaseManifest,
  AdminCourseHierarchyPreview,
  CourseHierarchyPreviewModule,
} from "@avana/domain";
import type { CourseStore, CourseRecord } from "./course-store.js";
import type {
  CourseDraftSessionStore,
  CourseDraftChangeStore,
  CourseReleaseStore,
} from "./course-draft-store.js";
import type {
  ModuleStore,
  LessonStore,
  SubCourseGroupStore,
} from "../learning/learning-store.js";
import type {
  FlashcardStore,
  QuizStore,
  QuizQuestionStore,
} from "../study/study-store.js";
import type { AdminStore, AdminCourseHierarchy } from "../admin/admin-store.js";

export interface CourseDraftServiceDeps {
  courseStore: CourseStore;
  draftSessionStore: CourseDraftSessionStore;
  draftChangeStore: CourseDraftChangeStore;
  releaseStore: CourseReleaseStore;
  moduleStore?: ModuleStore;
  lessonStore?: LessonStore;
  flashcardStore?: FlashcardStore;
  quizStore?: QuizStore;
  quizQuestionStore?: QuizQuestionStore;
  subCourseGroupStore?: SubCourseGroupStore;
  adminStore?: AdminStore;
  db?: DbClient;
}

export class CourseDraftService {
  constructor(private readonly deps: CourseDraftServiceDeps) {}

  /**
   * 1. Get or create an active draft session for a course.
   * Invariant: Maximum 1 active draft per course.
   */
  async getOrCreateActiveSession(
    actor: Actor,
    courseId: CourseId,
    options?: {
      source?: DraftSessionSource;
      title?: string;
    },
  ): Promise<CourseDraftSessionRecord> {
    const course = await this.deps.courseStore.findById(courseId);
    if (!course || course.deletedAt) {
      throw new DomainError("not_found", "دوره یافت نشد.");
    }

    const existingActive = await this.deps.draftSessionStore.findActiveByCourse(courseId);
    if (existingActive) {
      return existingActive;
    }

    const newSessionId = asCourseDraftSessionId(randomUUID() as any);
    const newSession: Omit<CourseDraftSessionRecord, "createdAt" | "updatedAt"> = {
      id: newSessionId,
      courseId,
      baseCourseVersion: course.version ?? 1,
      source: options?.source ?? "manual",
      status: "draft",
      title: options?.title ?? null,
      createdBy: actor.userId,
    };

    return this.deps.draftSessionStore.create(newSession);
  }

  /**
   * 2. Get a session by ID.
   */
  async getSession(
    _actor: Actor,
    sessionId: CourseDraftSessionId,
  ): Promise<CourseDraftSessionRecord> {
    const session = await this.deps.draftSessionStore.findById(sessionId);
    if (!session) {
      throw new DomainError("not_found", "پیش‌نویس دوره یافت نشد.");
    }
    return session;
  }

  /**
   * 3. List all intended changes within a session.
   */
  async listChanges(
    _actor: Actor,
    sessionId: CourseDraftSessionId,
  ): Promise<CourseDraftChangeRecord[]> {
    const session = await this.deps.draftSessionStore.findById(sessionId);
    if (!session) {
      throw new DomainError("not_found", "پیش‌نویس دوره یافت نشد.");
    }
    return this.deps.draftChangeStore.listBySession(sessionId);
  }

  /**
   * 4. Record or merge an intended change into a draft session.
   */
  async recordChange(
    _actor: Actor,
    sessionId: CourseDraftSessionId,
    incoming: IncomingDraftChange,
  ): Promise<CourseDraftChangeRecord | null> {
    const session = await this.deps.draftSessionStore.findById(sessionId);
    if (!session) {
      throw new DomainError("not_found", "پیش‌نویس دوره یافت نشد.");
    }

    if (session.status !== "draft" && session.status !== "validating" && session.status !== "ready") {
      throw new DomainError(
        "conflict",
        `امکان ویرایش پیش‌نویس در وضعیت فعلی (${session.status}) وجود ندارد.`,
      );
    }

    this.validateDraftPayload(incoming.entityType, incoming.action, incoming.payload);

    // 1. Fetch existing change if any
    const existingChange = await this.deps.draftChangeStore.findBySessionAndEntity(
      sessionId,
      incoming.entityType,
      incoming.entityId,
    );

    // 2. Resolve initial liveState if needed
    let liveState: Record<string, unknown> | null =
      (existingChange?.payload.before as Record<string, unknown>) ?? null;

    if (!liveState && incoming.action !== "create") {
      liveState = await this.resolveLiveEntityState(incoming.entityType, incoming.entityId);
    }

    // 3. Pure domain merge
    const decision = mergeDraftChange(existingChange ?? null, incoming, liveState);

    if (decision.type === "delete") {
      if (existingChange) {
        await this.deps.draftChangeStore.delete(existingChange.id);
      }
      return null;
    }

    // 4. Upsert intended state
    const updatedRecord = await this.deps.draftChangeStore.upsert({
      draftSessionId: sessionId,
      courseId: session.courseId,
      entityType: incoming.entityType,
      entityId: incoming.entityId,
      action: decision.action,
      parentId: decision.parentId,
      sortOrder: decision.sortOrder,
      payload: decision.payload,
    });

    // Reset status to draft if it was previously ready/validating
    if (session.status === "ready" || session.status === "validating") {
      await this.deps.draftSessionStore.updateStatus(sessionId, "draft");
    }

    return updatedRecord;
  }

  /**
   * 5. Remove a specific change from draft.
   */
  async removeChange(
    _actor: Actor,
    changeId: CourseDraftChangeId,
  ): Promise<void> {
    await this.deps.draftChangeStore.delete(changeId);
  }

  /**
   * 6. Discard an entire draft session.
   */
  async discardSession(
    _actor: Actor,
    sessionId: CourseDraftSessionId,
  ): Promise<void> {
    const session = await this.deps.draftSessionStore.findById(sessionId);
    if (!session) {
      throw new DomainError("not_found", "پیش‌نویس دوره یافت نشد.");
    }

    if (session.status === "published") {
      throw new DomainError("conflict", "پیش‌نویسی که منتشر شده است قابل لغو نیست.");
    }

    await this.deps.draftSessionStore.updateStatus(sessionId, "discarded");
  }

  /**
   * 7. Validate draft session readiness before Publish.
   */
  async validateSession(
    _actor: Actor,
    sessionId: CourseDraftSessionId,
  ): Promise<DraftSessionValidationReport> {
    const session = await this.deps.draftSessionStore.findById(sessionId);
    if (!session) {
      throw new DomainError("not_found", "پیش‌نویس دوره یافت نشد.");
    }

    const course = await this.deps.courseStore.findById(session.courseId);
    if (!course || course.deletedAt) {
      throw new DomainError("not_found", "دوره یافت نشد.");
    }

    const changes = await this.deps.draftChangeStore.listBySession(sessionId);
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Version optimistic check
    if (session.baseCourseVersion !== (course.version ?? 1)) {
      errors.push(
        `تضاد نسخه: پیش‌نویس بر اساس نسخه ${session.baseCourseVersion} ساخته شده، اما دوره در حال حاضر در نسخه ${course.version ?? 1} است. لطفاً پیش‌نویس را بازبینی کنید.`,
      );
    }

    // 2. Check unresolved AI review items
    let unresolvedCount = 0;
    for (const c of changes) {
      if (c.payload.needsReview === true) {
        unresolvedCount++;
      }
    }
    if (unresolvedCount > 0) {
      errors.push(
        `تعداد ${unresolvedCount} مورد تغییر نیازمند بررسی ادمین در پیش‌نویس وجود دارد که هنوز تعیین تکلیف نشده‌اند.`,
      );
    }

    // 3. Parent-child referential validation
    const deletedModuleIds = new Set(
      changes.filter((c) => c.entityType === "module" && c.action === "delete").map((c) => c.entityId),
    );
    const deletedQuizIds = new Set(
      changes.filter((c) => c.entityType === "quiz" && c.action === "delete").map((c) => c.entityId),
    );

    let hasParentChildConflict = false;
    for (const c of changes) {
      if (c.action === "delete") continue;

      if (c.entityType === "lesson" && c.parentId && deletedModuleIds.has(c.parentId)) {
        hasParentChildConflict = true;
        errors.push(
          `درس «${c.payload.after?.title ?? c.entityId}» در فصلی قرار دارد که برای حذف علامت‌گذاری شده است.`,
        );
      }

      if (c.entityType === "quiz_question" && c.parentId && deletedQuizIds.has(c.parentId)) {
        hasParentChildConflict = true;
        errors.push(
          `سوال آزمونی به کانتینر آزمونی متصل است که برای حذف علامت‌گذاری شده است.`,
        );
      }
    }

    const valid = errors.length === 0;

    // Transition status
    if (valid) {
      await this.deps.draftSessionStore.updateStatus(sessionId, "ready");
    } else {
      await this.deps.draftSessionStore.updateStatus(sessionId, "draft");
    }

    return {
      valid,
      errors,
      warnings,
      changesCount: changes.length,
      unresolvedCount,
      hasParentChildConflict,
    };
  }

  /**
   * Helper to fetch current live entity snapshot for a change.
   */
  private async resolveLiveEntityState(
    entityType: DraftEntityType,
    entityId: string,
  ): Promise<Record<string, unknown> | null> {
    try {
      if (entityType === "module" && this.deps.moduleStore) {
        const mod = await this.deps.moduleStore.findById(entityId as any);
        return mod ? (mod as unknown as Record<string, unknown>) : null;
      }
      if (entityType === "lesson" && this.deps.lessonStore) {
        const les = await this.deps.lessonStore.findById(entityId as any);
        return les ? (les as unknown as Record<string, unknown>) : null;
      }
      if (entityType === "flashcard" && this.deps.flashcardStore?.findById) {
        const fc = await this.deps.flashcardStore.findById(entityId as any);
        return fc ? (fc as unknown as Record<string, unknown>) : null;
      }
      if (entityType === "quiz" && this.deps.quizStore?.findById) {
        const qz = await this.deps.quizStore.findById(entityId as any);
        return qz ? (qz as unknown as Record<string, unknown>) : null;
      }
      if (entityType === "quiz_question" && this.deps.quizQuestionStore) {
        const list = await this.deps.quizQuestionStore.listByIds([entityId as any]);
        return list[0] ? (list[0] as unknown as Record<string, unknown>) : null;
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * 8. In-Memory Preview Engine.
   * Renders the Base Course Hierarchy + Draft Changes Overlay in memory.
   */
  async getPreviewHierarchy(
    _actor: Actor,
    courseId: CourseId,
    sessionId?: CourseDraftSessionId,
  ): Promise<AdminCourseHierarchyPreview> {
    const course = await this.deps.courseStore.findById(courseId);
    if (!course || course.deletedAt) {
      throw new DomainError("not_found", "دوره یافت نشد.");
    }

    // 1. Fetch live base hierarchy
    let baseHierarchy: AdminCourseHierarchy | null = null;
    if (this.deps.adminStore) {
      baseHierarchy = await this.deps.adminStore.getCourseHierarchy(courseId);
    } else {
      const courseModules = this.deps.moduleStore
        ? (await this.deps.moduleStore.listByCourse(courseId)).filter((m) => !m.deletedAt)
        : [];
      const moduleIds = courseModules.map((m) => m.id);
      const courseLessons = this.deps.lessonStore
        ? (await this.deps.lessonStore.listByModules(moduleIds)).filter((l) => !l.deletedAt)
        : [];
      baseHierarchy = {
        id: course.id,
        name: course.name,
        subject: course.subject,
        modules: courseModules.map((m) => ({
          id: m.id,
          title: m.title,
          sortOrder: m.sortOrder,
          subCourseGroupId: m.subCourseGroupId ?? null,
          lessons: courseLessons.filter((l) => l.moduleId === m.id).map((l) => ({
            id: l.id,
            title: l.title,
            publicationStatus: l.publicationStatus,
            flashcardCount: 0,
            quizCount: 0,
            hasContent: Boolean(l.contentMarkdown && l.contentMarkdown.length > 0),
            createdAt: l.createdAt,
          })),
        })),
      };
    }

    if (!baseHierarchy) {
      throw new DomainError("not_found", "ساختار دوره یافت نشد.");
    }

    // 2. Resolve active draft session
    const activeSession = sessionId
      ? await this.deps.draftSessionStore.findById(sessionId)
      : await this.deps.draftSessionStore.findActiveByCourse(courseId);

    if (!activeSession) {
      return {
        ...baseHierarchy,
        version: course.version ?? 1,
        isDraftPreview: false,
        pendingChangesCount: 0,
        modules: baseHierarchy.modules.map((m) => ({
          ...m,
          lessons: m.lessons.map((l) => ({ ...l, moduleId: m.id })),
        })),
      };
    }

    const changes = await this.deps.draftChangeStore.listBySession(activeSession.id);
    if (changes.length === 0) {
      return {
        ...baseHierarchy,
        version: course.version ?? 1,
        isDraftPreview: true,
        draftSessionId: activeSession.id,
        draftStatus: activeSession.status,
        pendingChangesCount: 0,
        modules: baseHierarchy.modules.map((m) => ({
          ...m,
          lessons: m.lessons.map((l) => ({ ...l, moduleId: m.id })),
        })),
      };
    }

    // 3. Apply Draft Changes Overlay in-memory
    const modulesMap = new Map<string, CourseHierarchyPreviewModule>();
    for (const m of baseHierarchy.modules) {
      modulesMap.set(m.id, {
        id: m.id,
        title: m.title,
        sortOrder: m.sortOrder,
        subCourseGroupId: m.subCourseGroupId ?? null,
        draftAction: null,
        lessons: m.lessons.map((l) => ({
          id: l.id,
          moduleId: m.id,
          title: l.title,
          publicationStatus: l.publicationStatus,
          flashcardCount: l.flashcardCount,
          quizCount: l.quizCount,
          hasContent: l.hasContent,
          createdAt: l.createdAt,
          draftAction: null,
        })),
      });
    }

    // A. Apply module changes
    for (const c of changes) {
      if (c.entityType === "module") {
        if (c.action === "create") {
          modulesMap.set(c.entityId, {
            id: c.entityId,
            title: (c.payload.after?.title as string) || "فصل جدید (پیش‌نویس)",
            sortOrder: c.sortOrder ?? (c.payload.after?.sortOrder as number) ?? 999,
            subCourseGroupId: (c.payload.after?.subCourseGroupId as string) ?? null,
            draftAction: "create",
            lessons: [],
          });
        } else if (c.action === "update") {
          const mod = modulesMap.get(c.entityId);
          if (mod) {
            if (c.payload.after?.title) mod.title = c.payload.after.title as string;
            if (typeof c.sortOrder === "number") mod.sortOrder = c.sortOrder;
            if (typeof c.payload.after?.sortOrder === "number") mod.sortOrder = c.payload.after.sortOrder as number;
            if (c.payload.after?.subCourseGroupId !== undefined) {
              mod.subCourseGroupId = c.payload.after.subCourseGroupId as string;
            }
            mod.draftAction = "update";
          }
        } else if (c.action === "delete") {
          modulesMap.delete(c.entityId);
        }
      }
    }

    // B. Apply lesson changes
    for (const c of changes) {
      if (c.entityType === "lesson") {
        if (c.action === "create") {
          const targetModuleId = c.parentId || (c.payload.after?.moduleId as string);
          if (targetModuleId && modulesMap.has(targetModuleId)) {
            const mod = modulesMap.get(targetModuleId)!;
            mod.lessons.push({
              id: c.entityId,
              moduleId: targetModuleId,
              title: (c.payload.after?.title as string) || "درس جدید (پیش‌نویس)",
              publicationStatus: "draft",
              flashcardCount: 0,
              quizCount: 0,
              hasContent: Boolean(c.payload.after?.contentMarkdown),
              createdAt: new Date().toISOString(),
              draftAction: "create",
            });
          }
        } else if (c.action === "update") {
          for (const mod of modulesMap.values()) {
            const les = mod.lessons.find((l) => l.id === c.entityId);
            if (les) {
              if (c.payload.after?.title) les.title = c.payload.after.title as string;
              if (c.payload.after?.contentMarkdown !== undefined) {
                les.hasContent = Boolean((c.payload.after.contentMarkdown as string)?.length > 0);
              }
              if (c.payload.after?.publicationStatus) {
                les.publicationStatus = c.payload.after.publicationStatus as string;
              }
              les.draftAction = "update";
            }
          }
        } else if (c.action === "delete") {
          for (const mod of modulesMap.values()) {
            mod.lessons = mod.lessons.filter((l) => l.id !== c.entityId);
          }
        }
      }
    }

    const previewModules = Array.from(modulesMap.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );

    return {
      id: course.id,
      name: course.name,
      subject: course.subject,
      version: course.version ?? 1,
      isDraftPreview: true,
      draftSessionId: activeSession.id,
      draftStatus: activeSession.status,
      pendingChangesCount: changes.length,
      groups: baseHierarchy.groups,
      modules: previewModules,
      courseFlashcardCount: baseHierarchy.courseFlashcardCount,
      courseQuizCount: baseHierarchy.courseQuizCount,
    };
  }

  /**
   * 9. Atomic Publisher with Hierarchical Topological Execution.
   * Monotonically increments version, writes release manifest, preserves live IDs and student progress.
   */
  async publishDraftSession(
    actor: Actor,
    sessionId: CourseDraftSessionId,
  ): Promise<{ release: CourseReleaseRecord; course: CourseRecord }> {
    const session = await this.deps.draftSessionStore.findById(sessionId);
    if (!session) {
      throw new DomainError("not_found", "پیش‌نویس دوره یافت نشد.");
    }
    if (session.status === "published") {
      throw new DomainError("conflict", "این پیش‌نویس قبلاً منتشر شده است.");
    }
    if (session.status === "discarded") {
      throw new DomainError("conflict", "این پیش‌نویس لغو شده است و قابل انتشار نیست.");
    }

    // 1. Prevalidate outside transaction
    const validation = await this.validateSession(actor, sessionId);
    if (!validation.valid) {
      throw new DomainError(
        "bad_request",
        `امکان انتشار پیش‌نویس وجود ندارد:\n• ${validation.errors.join("\n• ")}`,
      );
    }

    const course = await this.deps.courseStore.findById(session.courseId);
    if (!course || course.deletedAt) {
      throw new DomainError("not_found", "دوره یافت نشد.");
    }

    if (session.baseCourseVersion !== (course.version ?? 1)) {
      throw new DomainError(
        "conflict",
        `تضاد نسخه: نسخه دوره از ${session.baseCourseVersion} به ${course.version ?? 1} تغییر یافته است. لطفاً پیش‌نویس را دوباره بررسی کنید.`,
      );
    }

    const changes = await this.deps.draftChangeStore.listBySession(sessionId);
    const now = new Date().toISOString();
    const nextVersion = (course.version ?? 1) + 1;

    if (this.deps.db) {
      return await this.deps.db.transaction(async (tx) => {
        const locked = await tx
          .select()
          .from(courses)
          .where(eq(courses.id, course.id))
          .for("update");

        if (!locked.length) {
          throw new DomainError("not_found", "دوره یافت نشد.");
        }
        const liveRow = locked[0];
        if (liveRow.version !== session.baseCourseVersion) {
          throw new DomainError(
            "conflict",
            `تضاد نسخه در زمان قفل: نسخه زنده ${liveRow.version} با نسخه پایه پیش‌نویس ${session.baseCourseVersion} تطابق ندارد.`,
          );
        }

        await this.applyTopologicalChangesDb(tx, changes, course);

        await tx
          .update(courses)
          .set({
            version: nextVersion,
            updatedAt: new Date(),
          })
          .where(eq(courses.id, course.id));

        const manifest = this.buildReleaseManifest(changes);
        const summary = this.buildReleaseSummary(changes);
        const releaseId = asCourseReleaseId(randomUUID() as any);

        const [releaseRow] = await tx
          .insert(courseReleases)
          .values({
            id: releaseId,
            courseId: course.id,
            versionNumber: nextVersion,
            baseVersion: session.baseCourseVersion,
            draftSessionId: sessionId,
            changesSummary: summary,
            manifest,
            publishedBy: actor.userId,
          })
          .returning();

        await tx
          .update(courseDraftSessions)
          .set({
            status: "published",
            updatedAt: new Date(),
          })
          .where(eq(courseDraftSessions.id, sessionId));

        const updatedCourse: CourseRecord = {
          ...course,
          version: nextVersion,
          updatedAt: now,
        };

        const releaseRecord: CourseReleaseRecord = {
          id: asCourseReleaseId(releaseRow.id as any),
          courseId: asCourseId(releaseRow.courseId as any),
          versionNumber: releaseRow.versionNumber,
          baseVersion: releaseRow.baseVersion,
          draftSessionId: releaseRow.draftSessionId
            ? asCourseDraftSessionId(releaseRow.draftSessionId as any)
            : null,
          changesSummary: releaseRow.changesSummary as any,
          manifest: releaseRow.manifest as any,
          publishedBy: asUserId(releaseRow.publishedBy as any),
          publishedAt: releaseRow.publishedAt.toISOString(),
        };

        return { release: releaseRecord, course: updatedCourse };
      });
    } else {
      await this.applyTopologicalChangesStores(changes, course);

      course.version = nextVersion;
      course.updatedAt = now;
      await this.deps.courseStore.update(course);

      const manifest = this.buildReleaseManifest(changes);
      const summary = this.buildReleaseSummary(changes);
      const releaseId = asCourseReleaseId(randomUUID() as any);

      const releaseRecord = await this.deps.releaseStore.create({
        id: releaseId,
        courseId: course.id,
        versionNumber: nextVersion,
        baseVersion: session.baseCourseVersion,
        draftSessionId: sessionId,
        changesSummary: summary,
        manifest,
        publishedBy: actor.userId,
      });

      await this.deps.draftSessionStore.updateStatus(sessionId, "published");

      return { release: releaseRecord, course };
    }
  }

  /**
   * 10. Release Rollback Engine.
   * Restores educational content to a prior release snapshot while preserving student progress.
   */
  async rollbackRelease(
    actor: Actor,
    courseId: CourseId,
    targetVersion: number,
    reason?: string,
  ): Promise<{ release: CourseReleaseRecord; course: CourseRecord }> {
    const course = await this.deps.courseStore.findById(courseId);
    if (!course || course.deletedAt) {
      throw new DomainError("not_found", "دوره یافت نشد.");
    }

    const targetRelease = await this.deps.releaseStore.findByCourseAndVersion(
      courseId,
      targetVersion,
    );
    if (!targetRelease) {
      throw new DomainError(
        "not_found",
        `نسخه انتشار ${targetVersion} برای این دوره یافت نشد.`,
      );
    }

    const nextVersion = (course.version ?? 1) + 1;
    const now = new Date().toISOString();

    if (this.deps.db) {
      return await this.deps.db.transaction(async (tx) => {
        await tx
          .select()
          .from(courses)
          .where(eq(courses.id, courseId))
          .for("update");

        await this.applyRollbackManifestDb(tx, courseId, targetRelease.manifest, course);

        await tx
          .update(courses)
          .set({
            version: nextVersion,
            updatedAt: new Date(),
          })
          .where(eq(courses.id, courseId));

        const releaseId = asCourseReleaseId(randomUUID() as any);
        const [releaseRow] = await tx
          .insert(courseReleases)
          .values({
            id: releaseId,
            courseId,
            versionNumber: nextVersion,
            baseVersion: course.version ?? 1,
            draftSessionId: null,
            changesSummary: {
              type: "rollback",
              targetVersion,
              reason: reason || `Rollback to version ${targetVersion}`,
              totalOperations: targetRelease.manifest.length,
            } as any,
            manifest: targetRelease.manifest,
            publishedBy: actor.userId,
          })
          .returning();

        const updatedCourse: CourseRecord = {
          ...course,
          version: nextVersion,
          updatedAt: now,
        };

        const releaseRecord: CourseReleaseRecord = {
          id: asCourseReleaseId(releaseRow.id as any),
          courseId: asCourseId(releaseRow.courseId as any),
          versionNumber: releaseRow.versionNumber,
          baseVersion: releaseRow.baseVersion,
          draftSessionId: null,
          changesSummary: releaseRow.changesSummary as any,
          manifest: releaseRow.manifest as any,
          publishedBy: asUserId(releaseRow.publishedBy as any),
          publishedAt: releaseRow.publishedAt.toISOString(),
        };

        return { release: releaseRecord, course: updatedCourse };
      });
    } else {
      await this.applyRollbackManifestStores(courseId, targetRelease.manifest, course);

      const baseVersion = course.version ?? 1;
      course.version = nextVersion;
      course.updatedAt = now;
      await this.deps.courseStore.update(course);

      const releaseId = asCourseReleaseId(randomUUID() as any);
      const releaseRecord = await this.deps.releaseStore.create({
        id: releaseId,
        courseId,
        versionNumber: nextVersion,
        baseVersion,
        draftSessionId: null,
        changesSummary: {
          type: "rollback",
          targetVersion,
          reason: reason || `Rollback to version ${targetVersion}`,
          totalOperations: targetRelease.manifest.length,
        } as any,
        manifest: targetRelease.manifest,
        publishedBy: actor.userId,
      });

      return { release: releaseRecord, course };
    }
  }

  /**
   * 11. List all releases for a course.
   */
  async listReleases(
    _actor: Actor,
    courseId: CourseId,
  ): Promise<CourseReleaseRecord[]> {
    return this.deps.releaseStore.listByCourse(courseId);
  }

  /**
   * 12. Get a specific release by ID.
   */
  async getRelease(
    _actor: Actor,
    releaseId: CourseReleaseId,
  ): Promise<CourseReleaseRecord> {
    const release = await this.deps.releaseStore.findById(releaseId);
    if (!release) {
      throw new DomainError("not_found", "تاریخچه انتشار یافت نشد.");
    }
    return release;
  }

  // --- Internal DB & Store Execution Helpers ---

  private async applyTopologicalChangesDb(
    tx: any,
    changes: CourseDraftChangeRecord[],
    course: CourseRecord,
  ): Promise<void> {
    const creates = changes.filter((c) => c.action === "create");
    const updates = changes.filter((c) => c.action === "update" || c.action === "reorder");
    const deletes = changes.filter((c) => c.action === "delete");

    // 1. Creates in topological parent -> child order
    for (const c of creates.filter((c) => c.entityType === "module")) {
      await tx
        .insert(modules)
        .values({
          id: c.entityId,
          courseId: c.courseId,
          title: (c.payload.after?.title as string) || "فصل جدید",
          description: (c.payload.after?.description as string) ?? null,
          sortOrder: c.sortOrder ?? (c.payload.after?.sortOrder as number) ?? 0,
          subCourseGroupId: (c.payload.after?.subCourseGroupId as string) ?? null,
          deletedAt: null,
        })
        .onConflictDoUpdate({
          target: modules.id,
          set: {
            title: (c.payload.after?.title as string) || "فصل جدید",
            description: (c.payload.after?.description as string) ?? null,
            sortOrder: c.sortOrder ?? (c.payload.after?.sortOrder as number) ?? 0,
            subCourseGroupId: (c.payload.after?.subCourseGroupId as string) ?? null,
            deletedAt: null,
            updatedAt: new Date(),
          },
        });
    }

    for (const c of creates.filter((c) => c.entityType === "lesson")) {
      await tx
        .insert(lessons)
        .values({
          id: c.entityId,
          moduleId: c.parentId || (c.payload.after?.moduleId as string),
          title: (c.payload.after?.title as string) || "درس جدید",
          contentType: "markdown",
          contentMarkdown: (c.payload.after?.contentMarkdown as string) || "",
          sortOrder: c.sortOrder ?? (c.payload.after?.sortOrder as number) ?? 0,
          publicationStatus: (c.payload.after?.publicationStatus as string) || "published",
          estimatedMinutes: (c.payload.after?.estimatedMinutes as number) ?? null,
          deletedAt: null,
        })
        .onConflictDoUpdate({
          target: lessons.id,
          set: {
            title: (c.payload.after?.title as string) || "درس جدید",
            contentMarkdown: (c.payload.after?.contentMarkdown as string) || "",
            sortOrder: c.sortOrder ?? (c.payload.after?.sortOrder as number) ?? 0,
            publicationStatus: (c.payload.after?.publicationStatus as string) || "published",
            estimatedMinutes: (c.payload.after?.estimatedMinutes as number) ?? null,
            deletedAt: null,
            updatedAt: new Date(),
          },
        });
    }

    for (const c of creates.filter((c) => c.entityType === "quiz")) {
      await tx
        .insert(quizzes)
        .values({
          id: c.entityId,
          organizationId: (c.payload.after?.organizationId as string) || course.organizationId,
          courseId: c.courseId,
          moduleId: (c.payload.after?.moduleId as string) ?? null,
          documentId: (c.payload.after?.documentId as string) ?? null,
          title: (c.payload.after?.title as string) || "آزمون",
          topic: (c.payload.after?.topic as string) ?? null,
          difficulty: (c.payload.after?.difficulty as string) || "medium",
          status: (c.payload.after?.status as string) || "draft",
          deletedAt: null,
        })
        .onConflictDoUpdate({
          target: quizzes.id,
          set: {
            title: (c.payload.after?.title as string) || "آزمون",
            topic: (c.payload.after?.topic as string) ?? null,
            difficulty: (c.payload.after?.difficulty as string) || "medium",
            status: (c.payload.after?.status as string) || "draft",
            deletedAt: null,
            updatedAt: new Date(),
          },
        });
    }

    for (const c of creates.filter((c) => c.entityType === "flashcard")) {
      await tx
        .insert(flashcards)
        .values({
          id: c.entityId,
          organizationId: (c.payload.after?.organizationId as string) || course.organizationId,
          courseId: c.courseId,
          documentId: (c.payload.after?.documentId as string) ?? null,
          lessonId: (c.parentId ?? (c.payload.after?.lessonId as string)) ?? null,
          question: (c.payload.after?.question as string) || "",
          answer: (c.payload.after?.answer as string) || "",
          explanation: (c.payload.after?.explanation as string) ?? null,
          cardType: (c.payload.after?.cardType as string) || "definition",
          difficulty: (c.payload.after?.difficulty as string) || "medium",
          deletedAt: null,
        })
        .onConflictDoUpdate({
          target: flashcards.id,
          set: {
            question: (c.payload.after?.question as string) || "",
            answer: (c.payload.after?.answer as string) || "",
            explanation: (c.payload.after?.explanation as string) ?? null,
            cardType: (c.payload.after?.cardType as string) || "definition",
            difficulty: (c.payload.after?.difficulty as string) || "medium",
            deletedAt: null,
            updatedAt: new Date(),
          },
        });
    }

    for (const c of creates.filter((c) => c.entityType === "quiz_question")) {
      await tx
        .insert(quizQuestions)
        .values({
          id: c.entityId,
          quizId: c.parentId || (c.payload.after?.quizId as string),
          lessonId: (c.payload.after?.lessonId as string) ?? null,
          question:
            (c.payload.after?.question as string) ||
            (c.payload.after?.prompt as string) ||
            "",
          topic: (c.payload.after?.topic as string) ?? null,
          difficulty: (c.payload.after?.difficulty as string) || "medium",
          questionType: (c.payload.after?.questionType as string) || "multiple_choice",
          choices: c.payload.after?.choices ?? [],
          correctAnswer: c.payload.after?.correctAnswer ?? "",
          explanation: (c.payload.after?.explanation as string) ?? null,
          sortOrder: c.sortOrder ?? (c.payload.after?.sortOrder as number) ?? 0,
          deletedAt: null,
        })
        .onConflictDoUpdate({
          target: quizQuestions.id,
          set: {
            question:
              (c.payload.after?.question as string) ||
              (c.payload.after?.prompt as string) ||
              "",
            topic: (c.payload.after?.topic as string) ?? null,
            difficulty: (c.payload.after?.difficulty as string) || "medium",
            questionType: (c.payload.after?.questionType as string) || "multiple_choice",
            choices: c.payload.after?.choices ?? [],
            correctAnswer: c.payload.after?.correctAnswer ?? "",
            explanation: (c.payload.after?.explanation as string) ?? null,
            sortOrder: c.sortOrder ?? (c.payload.after?.sortOrder as number) ?? 0,
            deletedAt: null,
            updatedAt: new Date(),
          },
        });
    }

    // 2. Updates (preserving live IDs)
    for (const c of updates) {
      if (c.entityType === "module" && c.payload.after) {
        const updateData: Record<string, any> = { updatedAt: new Date() };
        if (c.payload.after.title) updateData.title = c.payload.after.title;
        if (c.sortOrder !== null && c.sortOrder !== undefined) updateData.sortOrder = c.sortOrder;
        if (c.payload.after.sortOrder !== undefined) updateData.sortOrder = c.payload.after.sortOrder;
        if (c.payload.after.subCourseGroupId !== undefined) updateData.subCourseGroupId = c.payload.after.subCourseGroupId;
        await tx.update(modules).set(updateData).where(eq(modules.id, c.entityId));
      } else if (c.entityType === "lesson" && c.payload.after) {
        const updateData: Record<string, any> = { updatedAt: new Date() };
        if (c.payload.after.title) updateData.title = c.payload.after.title;
        if (c.payload.after.contentMarkdown !== undefined) updateData.contentMarkdown = c.payload.after.contentMarkdown;
        if (c.sortOrder !== null && c.sortOrder !== undefined) updateData.sortOrder = c.sortOrder;
        if (c.payload.after.sortOrder !== undefined) updateData.sortOrder = c.payload.after.sortOrder;
        if (c.payload.after.publicationStatus) updateData.publicationStatus = c.payload.after.publicationStatus;
        if (c.payload.after.moduleId) updateData.moduleId = c.payload.after.moduleId;
        await tx.update(lessons).set(updateData).where(eq(lessons.id, c.entityId));
      } else if (c.entityType === "flashcard" && c.payload.after) {
        const updateData: Record<string, any> = { updatedAt: new Date() };
        if (c.payload.after.question) updateData.question = c.payload.after.question;
        if (c.payload.after.answer) updateData.answer = c.payload.after.answer;
        if (c.payload.after.explanation !== undefined) updateData.explanation = c.payload.after.explanation;
        if (c.payload.after.cardType) updateData.cardType = c.payload.after.cardType;
        if (c.payload.after.difficulty) updateData.difficulty = c.payload.after.difficulty;
        await tx.update(flashcards).set(updateData).where(eq(flashcards.id, c.entityId));
      } else if (c.entityType === "quiz" && c.payload.after) {
        const updateData: Record<string, any> = { updatedAt: new Date() };
        if (c.payload.after.title) updateData.title = c.payload.after.title;
        if (c.payload.after.topic !== undefined) updateData.topic = c.payload.after.topic;
        if (c.payload.after.difficulty) updateData.difficulty = c.payload.after.difficulty;
        await tx.update(quizzes).set(updateData).where(eq(quizzes.id, c.entityId));
      } else if (c.entityType === "quiz_question" && c.payload.after) {
        const updateData: Record<string, any> = { updatedAt: new Date() };
        if (c.payload.after.question || c.payload.after.prompt) {
          updateData.question = c.payload.after.question || c.payload.after.prompt;
        }
        if (c.payload.after.choices !== undefined) updateData.choices = c.payload.after.choices;
        if (c.payload.after.correctAnswer !== undefined) updateData.correctAnswer = c.payload.after.correctAnswer;
        if (c.payload.after.explanation !== undefined) updateData.explanation = c.payload.after.explanation;
        if (c.sortOrder !== null && c.sortOrder !== undefined) updateData.sortOrder = c.sortOrder;
        await tx.update(quizQuestions).set(updateData).where(eq(quizQuestions.id, c.entityId));
      }
    }

    // 3. Deletions in child -> parent order (SOFT DELETE ONLY!)
    const now = new Date();
    for (const c of deletes.filter((c) => c.entityType === "quiz_question")) {
      await tx
        .update(quizQuestions)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(quizQuestions.id, c.entityId));
    }
    for (const c of deletes.filter((c) => c.entityType === "flashcard")) {
      await tx
        .update(flashcards)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(flashcards.id, c.entityId));
    }
    for (const c of deletes.filter((c) => c.entityType === "quiz")) {
      await tx
        .update(quizzes)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(quizzes.id, c.entityId));
    }
    for (const c of deletes.filter((c) => c.entityType === "lesson")) {
      await tx
        .update(lessons)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(lessons.id, c.entityId));
    }
    for (const c of deletes.filter((c) => c.entityType === "module")) {
      await tx
        .update(modules)
        .set({ deletedAt: now, updatedAt: now })
        .where(eq(modules.id, c.entityId));
    }
  }

  private async applyTopologicalChangesStores(
    changes: CourseDraftChangeRecord[],
    course: CourseRecord,
  ): Promise<void> {
    const now = new Date().toISOString();
    const creates = changes.filter((c) => c.action === "create");
    const updates = changes.filter((c) => c.action === "update" || c.action === "reorder");
    const deletes = changes.filter((c) => c.action === "delete");

    // 1. Creates
    for (const c of creates.filter((c) => c.entityType === "module")) {
      if (this.deps.moduleStore) {
        await this.deps.moduleStore.create({
          id: c.entityId as any,
          courseId: c.courseId,
          title: (c.payload.after?.title as string) || "فصل جدید",
          description: (c.payload.after?.description as string) ?? null,
          sortOrder: c.sortOrder ?? (c.payload.after?.sortOrder as number) ?? 0,
          subCourseGroupId: (c.payload.after?.subCourseGroupId as string) ?? null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }
    }
    for (const c of creates.filter((c) => c.entityType === "lesson")) {
      if (this.deps.lessonStore) {
        await this.deps.lessonStore.create({
          id: c.entityId as any,
          moduleId: (c.parentId || c.payload.after?.moduleId) as any,
          title: (c.payload.after?.title as string) || "درس جدید",
          contentType: "markdown",
          contentMarkdown: (c.payload.after?.contentMarkdown as string) || "",
          sortOrder: c.sortOrder ?? (c.payload.after?.sortOrder as number) ?? 0,
          publicationStatus: "published",
          estimatedMinutes: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }
    }
    for (const c of creates.filter((c) => c.entityType === "flashcard")) {
      if (this.deps.flashcardStore) {
        await this.deps.flashcardStore.create({
          id: c.entityId as any,
          organizationId: (c.payload.after?.organizationId as any) || course.organizationId,
          courseId: c.courseId,
          documentId: (c.payload.after?.documentId as any) ?? null,
          lessonId: (c.parentId || c.payload.after?.lessonId) as any,
          question: (c.payload.after?.question as string) || "",
          answer: (c.payload.after?.answer as string) || "",
          explanation: (c.payload.after?.explanation as string) ?? null,
          cardType: (c.payload.after?.cardType as string) || "definition",
          difficulty: (c.payload.after?.difficulty as string) || "medium",
          dueAt: now,
          intervalDays: 0,
          easeFactor: 2.5,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          generatedContentId: null,
        });
      }
    }
    for (const c of creates.filter((c) => c.entityType === "quiz")) {
      if (this.deps.quizStore) {
        await this.deps.quizStore.create({
          id: c.entityId as any,
          organizationId: (c.payload.after?.organizationId as any) || course.organizationId,
          courseId: c.courseId,
          moduleId: (c.payload.after?.moduleId as any) ?? null,
          documentId: (c.payload.after?.documentId as any) ?? null,
          title: (c.payload.after?.title as string) || "آزمون",
          topic: (c.payload.after?.topic as string) ?? null,
          difficulty: (c.payload.after?.difficulty as string) || "medium",
          status: "draft",
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }
    }
    for (const c of creates.filter((c) => c.entityType === "quiz_question")) {
      if (this.deps.quizQuestionStore?.create) {
        await this.deps.quizQuestionStore.create({
          id: c.entityId as any,
          quizId: (c.parentId || c.payload.after?.quizId) as any,
          lessonId: (c.payload.after?.lessonId as any) ?? null,
          generatedContentId: null,
          question: (c.payload.after?.question as string) || (c.payload.after?.prompt as string) || "",
          topic: (c.payload.after?.topic as string) ?? null,
          difficulty: (c.payload.after?.difficulty as string) || "medium",
          questionType: "multiple_choice",
          choices: (c.payload.after?.choices as any) ?? [],
          correctAnswer: (c.payload.after?.correctAnswer as any) ?? "",
          explanation: (c.payload.after?.explanation as string) ?? null,
          sortOrder: c.sortOrder ?? (c.payload.after?.sortOrder as number) ?? 0,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        });
      }
    }

    // 2. Updates
    for (const c of updates) {
      if (c.entityType === "module" && this.deps.moduleStore) {
        const mod = await this.deps.moduleStore.findById(c.entityId as any);
        if (mod) {
          if (c.payload.after?.title) mod.title = c.payload.after.title as string;
          if (c.sortOrder !== null && c.sortOrder !== undefined) mod.sortOrder = c.sortOrder;
          mod.updatedAt = now;
          await this.deps.moduleStore.update(mod);
        }
      } else if (c.entityType === "lesson" && this.deps.lessonStore) {
        const les = await this.deps.lessonStore.findById(c.entityId as any);
        if (les) {
          if (c.payload.after?.title) les.title = c.payload.after.title as string;
          if (c.payload.after?.contentMarkdown !== undefined) les.contentMarkdown = c.payload.after.contentMarkdown as string;
          if (c.sortOrder !== null && c.sortOrder !== undefined) les.sortOrder = c.sortOrder;
          les.updatedAt = now;
          await this.deps.lessonStore.update(les);
        }
      } else if (c.entityType === "flashcard" && this.deps.flashcardStore) {
        const fc = await this.deps.flashcardStore.findById?.(c.entityId as any);
        if (fc && this.deps.flashcardStore.update) {
          if (c.payload.after?.question) fc.question = c.payload.after.question as string;
          if (c.payload.after?.answer) fc.answer = c.payload.after.answer as string;
          fc.updatedAt = now;
          await this.deps.flashcardStore.update(fc);
        }
      } else if (c.entityType === "quiz" && this.deps.quizStore) {
        const qz = await this.deps.quizStore.findById?.(c.entityId as any);
        if (qz && this.deps.quizStore.update) {
          if (c.payload.after?.title) qz.title = c.payload.after.title as string;
          qz.updatedAt = now;
          await this.deps.quizStore.update(qz);
        }
      } else if (c.entityType === "quiz_question" && this.deps.quizQuestionStore) {
        const list = await this.deps.quizQuestionStore.listByIds([c.entityId as any]);
        if (list[0] && this.deps.quizQuestionStore.update) {
          const qu = list[0];
          if (c.payload.after?.question || c.payload.after?.prompt) {
            qu.question = (c.payload.after?.question || c.payload.after?.prompt) as string;
          }
          if (c.payload.after?.choices) qu.choices = c.payload.after.choices as any;
          if (c.payload.after?.correctAnswer) qu.correctAnswer = c.payload.after.correctAnswer as any;
          qu.updatedAt = now;
          await this.deps.quizQuestionStore.update(qu);
        }
      }
    }

    // 3. Deletions
    for (const c of deletes.filter((c) => c.entityType === "quiz_question")) {
      if (this.deps.quizQuestionStore?.delete) await this.deps.quizQuestionStore.delete(c.entityId as any);
    }
    for (const c of deletes.filter((c) => c.entityType === "flashcard")) {
      if (this.deps.flashcardStore?.delete) await this.deps.flashcardStore.delete(c.entityId as any);
    }
    for (const c of deletes.filter((c) => c.entityType === "quiz")) {
      if (this.deps.quizStore?.delete) await this.deps.quizStore.delete(c.entityId as any);
    }
    for (const c of deletes.filter((c) => c.entityType === "lesson")) {
      if (this.deps.lessonStore) await this.deps.lessonStore.delete(c.entityId as any);
    }
    for (const c of deletes.filter((c) => c.entityType === "module")) {
      if (this.deps.moduleStore) await this.deps.moduleStore.delete(c.entityId as any);
    }
  }

  private async applyRollbackManifestDb(
    tx: any,
    courseId: CourseId,
    manifest: ReleaseManifest,
    course: CourseRecord,
  ): Promise<void> {
    const now = new Date();

    // 1. Identify all entities that should be active in the target release
    const targetActiveModules = new Set(
      manifest.filter((m) => m.entityType === "module" && m.action !== "delete").map((m) => m.entityId),
    );
    const targetActiveLessons = new Set(
      manifest.filter((m) => m.entityType === "lesson" && m.action !== "delete").map((m) => m.entityId),
    );
    const targetActiveFlashcards = new Set(
      manifest.filter((m) => m.entityType === "flashcard" && m.action !== "delete").map((m) => m.entityId),
    );
    const targetActiveQuizzes = new Set(
      manifest.filter((m) => m.entityType === "quiz" && m.action !== "delete").map((m) => m.entityId),
    );
    const targetActiveQuestions = new Set(
      manifest.filter((m) => m.entityType === "quiz_question" && m.action !== "delete").map((m) => m.entityId),
    );

    // 2. Soft-delete any currently active entities created after targetVersion
    const liveModules = await tx
      .select({ id: modules.id })
      .from(modules)
      .where(eq(modules.courseId, courseId));
    const liveModuleIds = liveModules.map((m: { id: string }) => m.id);

    if (liveModuleIds.length > 0) {
      const liveLessons = await tx
        .select({ id: lessons.id })
        .from(lessons)
        .where(and(inArray(lessons.moduleId, liveModuleIds), isNull(lessons.deletedAt)));
      for (const l of liveLessons) {
        if (!targetActiveLessons.has(l.id)) {
          await tx.update(lessons).set({ deletedAt: now, updatedAt: now }).where(eq(lessons.id, l.id));
        }
      }
    }

    for (const m of liveModules) {
      if (!targetActiveModules.has(m.id)) {
        await tx.update(modules).set({ deletedAt: now, updatedAt: now }).where(eq(modules.id, m.id));
      }
    }

    const liveFlashcards = await tx
      .select({ id: flashcards.id })
      .from(flashcards)
      .where(and(eq(flashcards.courseId, courseId), isNull(flashcards.deletedAt)));
    for (const f of liveFlashcards) {
      if (!targetActiveFlashcards.has(f.id)) {
        await tx.update(flashcards).set({ deletedAt: now, updatedAt: now }).where(eq(flashcards.id, f.id));
      }
    }

    const liveQuizzes = await tx
      .select({ id: quizzes.id })
      .from(quizzes)
      .where(and(eq(quizzes.courseId, courseId), isNull(quizzes.deletedAt)));
    const liveQuizIds = liveQuizzes.map((q: { id: string }) => q.id);

    if (liveQuizIds.length > 0) {
      const liveQuestions = await tx
        .select({ id: quizQuestions.id })
        .from(quizQuestions)
        .where(and(inArray(quizQuestions.quizId, liveQuizIds), isNull(quizQuestions.deletedAt)));
      for (const qu of liveQuestions) {
        if (!targetActiveQuestions.has(qu.id)) {
          await tx.update(quizQuestions).set({ deletedAt: now, updatedAt: now }).where(eq(quizQuestions.id, qu.id));
        }
      }
    }

    for (const q of liveQuizzes) {
      if (!targetActiveQuizzes.has(q.id)) {
        await tx.update(quizzes).set({ deletedAt: now, updatedAt: now }).where(eq(quizzes.id, q.id));
      }
    }

    // 3. Restore all entities defined in target manifest
    for (const item of manifest) {
      if (item.action === "delete") {
        if (item.entityType === "module") {
          await tx.update(modules).set({ deletedAt: now, updatedAt: now }).where(eq(modules.id, item.entityId));
        } else if (item.entityType === "lesson") {
          await tx.update(lessons).set({ deletedAt: now, updatedAt: now }).where(eq(lessons.id, item.entityId));
        } else if (item.entityType === "flashcard") {
          await tx.update(flashcards).set({ deletedAt: now, updatedAt: now }).where(eq(flashcards.id, item.entityId));
        } else if (item.entityType === "quiz") {
          await tx.update(quizzes).set({ deletedAt: now, updatedAt: now }).where(eq(quizzes.id, item.entityId));
        } else if (item.entityType === "quiz_question") {
          await tx.update(quizQuestions).set({ deletedAt: now, updatedAt: now }).where(eq(quizQuestions.id, item.entityId));
        }
      } else {
        // Restore / Upsert from 'before' or 'after' snapshot
        const state = item.before || item.after;
        if (!state) continue;

        if (item.entityType === "module") {
          await tx
            .insert(modules)
            .values({
              id: item.entityId,
              courseId,
              title: (state.title as string) || "فصل بازگردانی‌شده",
              description: (state.description as string) ?? null,
              sortOrder: (state.sortOrder as number) ?? 0,
              subCourseGroupId: (state.subCourseGroupId as string) ?? null,
              deletedAt: null,
            })
            .onConflictDoUpdate({
              target: modules.id,
              set: {
                title: (state.title as string) || "فصل بازگردانی‌شده",
                description: (state.description as string) ?? null,
                sortOrder: (state.sortOrder as number) ?? 0,
                subCourseGroupId: (state.subCourseGroupId as string) ?? null,
                deletedAt: null,
                updatedAt: now,
              },
            });
        } else if (item.entityType === "lesson") {
          await tx
            .insert(lessons)
            .values({
              id: item.entityId,
              moduleId: item.parentId || (state.moduleId as string),
              title: (state.title as string) || "درس بازگردانی‌شده",
              contentType: "markdown",
              contentMarkdown: (state.contentMarkdown as string) || "",
              sortOrder: (state.sortOrder as number) ?? 0,
              publicationStatus: (state.publicationStatus as string) || "published",
              estimatedMinutes: (state.estimatedMinutes as number) ?? null,
              deletedAt: null,
            })
            .onConflictDoUpdate({
              target: lessons.id,
              set: {
                title: (state.title as string) || "درس بازگردانی‌شده",
                contentMarkdown: (state.contentMarkdown as string) || "",
                sortOrder: (state.sortOrder as number) ?? 0,
                publicationStatus: (state.publicationStatus as string) || "published",
                estimatedMinutes: (state.estimatedMinutes as number) ?? null,
                deletedAt: null,
                updatedAt: now,
              },
            });
        } else if (item.entityType === "flashcard") {
          await tx
            .insert(flashcards)
            .values({
              id: item.entityId,
              organizationId: (state.organizationId as string) || course.organizationId,
              courseId,
              documentId: (state.documentId as string) ?? null,
              lessonId: (item.parentId ?? (state.lessonId as string)) ?? null,
              question: (state.question as string) || "",
              answer: (state.answer as string) || "",
              explanation: (state.explanation as string) ?? null,
              cardType: (state.cardType as string) || "definition",
              difficulty: (state.difficulty as string) || "medium",
              deletedAt: null,
            })
            .onConflictDoUpdate({
              target: flashcards.id,
              set: {
                question: (state.question as string) || "",
                answer: (state.answer as string) || "",
                explanation: (state.explanation as string) ?? null,
                cardType: (state.cardType as string) || "definition",
                difficulty: (state.difficulty as string) || "medium",
                deletedAt: null,
                updatedAt: now,
              },
            });
        } else if (item.entityType === "quiz") {
          await tx
            .insert(quizzes)
            .values({
              id: item.entityId,
              organizationId: (state.organizationId as string) || course.organizationId,
              courseId,
              moduleId: (state.moduleId as string) ?? null,
              documentId: (state.documentId as string) ?? null,
              title: (state.title as string) || "آزمون",
              topic: (state.topic as string) ?? null,
              difficulty: (state.difficulty as string) || "medium",
              status: (state.status as string) || "draft",
              deletedAt: null,
            })
            .onConflictDoUpdate({
              target: quizzes.id,
              set: {
                title: (state.title as string) || "آزمون",
                topic: (state.topic as string) ?? null,
                difficulty: (state.difficulty as string) || "medium",
                status: (state.status as string) || "draft",
                deletedAt: null,
                updatedAt: now,
              },
            });
        } else if (item.entityType === "quiz_question") {
          await tx
            .insert(quizQuestions)
            .values({
              id: item.entityId,
              quizId: item.parentId || (state.quizId as string),
              lessonId: (state.lessonId as string) ?? null,
              question: (state.question as string) || (state.prompt as string) || "",
              topic: (state.topic as string) ?? null,
              difficulty: (state.difficulty as string) || "medium",
              questionType: (state.questionType as string) || "multiple_choice",
              choices: state.choices ?? [],
              correctAnswer: state.correctAnswer ?? "",
              explanation: (state.explanation as string) ?? null,
              sortOrder: (state.sortOrder as number) ?? 0,
              deletedAt: null,
            })
            .onConflictDoUpdate({
              target: quizQuestions.id,
              set: {
                question: (state.question as string) || (state.prompt as string) || "",
                topic: (state.topic as string) ?? null,
                difficulty: (state.difficulty as string) || "medium",
                questionType: (state.questionType as string) || "multiple_choice",
                choices: state.choices ?? [],
                correctAnswer: state.correctAnswer ?? "",
                explanation: (state.explanation as string) ?? null,
                sortOrder: (state.sortOrder as number) ?? 0,
                deletedAt: null,
                updatedAt: now,
              },
            });
        }
      }
    }
  }

  private async applyRollbackManifestStores(
    courseId: CourseId,
    manifest: ReleaseManifest,
    course: CourseRecord,
  ): Promise<void> {
    const now = new Date().toISOString();

    const targetActiveModules = new Set(
      manifest.filter((m) => m.entityType === "module" && m.action !== "delete").map((m) => m.entityId),
    );
    const targetActiveLessons = new Set(
      manifest.filter((m) => m.entityType === "lesson" && m.action !== "delete").map((m) => m.entityId),
    );
    const targetActiveFlashcards = new Set(
      manifest.filter((m) => m.entityType === "flashcard" && m.action !== "delete").map((m) => m.entityId),
    );
    const targetActiveQuizzes = new Set(
      manifest.filter((m) => m.entityType === "quiz" && m.action !== "delete").map((m) => m.entityId),
    );
    const targetActiveQuestions = new Set(
      manifest.filter((m) => m.entityType === "quiz_question" && m.action !== "delete").map((m) => m.entityId),
    );

    // 1. Soft-delete subsequent entities not in target release
    if (this.deps.moduleStore && this.deps.lessonStore) {
      const liveModules = await this.deps.moduleStore.listByCourse(courseId);
      for (const m of liveModules) {
        const liveLessons = await this.deps.lessonStore.listByModule(m.id);
        for (const l of liveLessons) {
          if (!targetActiveLessons.has(l.id) && !l.deletedAt) {
            await this.deps.lessonStore.delete(l.id);
          }
        }
        if (!targetActiveModules.has(m.id) && !m.deletedAt) {
          await this.deps.moduleStore.delete(m.id);
        }
      }
    }

    if (this.deps.flashcardStore) {
      const liveCards = await this.deps.flashcardStore.listByCourse(courseId, course.organizationId);
      for (const f of liveCards) {
        if (!targetActiveFlashcards.has(f.id) && !f.deletedAt && this.deps.flashcardStore.delete) {
          await this.deps.flashcardStore.delete(f.id);
        }
      }
    }

    if (this.deps.quizStore && this.deps.quizQuestionStore) {
      const liveQuizzes = await this.deps.quizStore.listByCourse(courseId, course.organizationId);
      for (const q of liveQuizzes) {
        const liveQuestions = await this.deps.quizQuestionStore.listByQuiz(q.id);
        for (const qu of liveQuestions) {
          if (!targetActiveQuestions.has(qu.id) && !qu.deletedAt && this.deps.quizQuestionStore.delete) {
            await this.deps.quizQuestionStore.delete(qu.id);
          }
        }
        if (!targetActiveQuizzes.has(q.id) && !q.deletedAt && this.deps.quizStore.delete) {
          await this.deps.quizStore.delete(q.id);
        }
      }
    }

    // 2. Restore/Upsert entities in manifest
    for (const item of manifest) {
      if (item.action === "delete") {
        if (item.entityType === "quiz_question" && this.deps.quizQuestionStore?.delete) {
          await this.deps.quizQuestionStore.delete(item.entityId as any);
        } else if (item.entityType === "flashcard" && this.deps.flashcardStore?.delete) {
          await this.deps.flashcardStore.delete(item.entityId as any);
        } else if (item.entityType === "quiz" && this.deps.quizStore?.delete) {
          await this.deps.quizStore.delete(item.entityId as any);
        } else if (item.entityType === "lesson" && this.deps.lessonStore) {
          await this.deps.lessonStore.delete(item.entityId as any);
        } else if (item.entityType === "module" && this.deps.moduleStore) {
          await this.deps.moduleStore.delete(item.entityId as any);
        }
      } else {
        const state = item.before || item.after;
        if (!state) continue;

        if (item.entityType === "module" && this.deps.moduleStore) {
          const existing = await this.deps.moduleStore.findById(item.entityId as any);
          if (existing) {
            existing.title = (state.title as string) || existing.title;
            existing.sortOrder = (state.sortOrder as number) ?? existing.sortOrder;
            existing.deletedAt = null;
            existing.updatedAt = now;
            await this.deps.moduleStore.update(existing);
          } else {
            await this.deps.moduleStore.create({
              id: item.entityId as any,
              courseId,
              title: (state.title as string) || "فصل بازگردانی‌شده",
              description: (state.description as string) ?? null,
              sortOrder: (state.sortOrder as number) ?? 0,
              subCourseGroupId: (state.subCourseGroupId as string) ?? null,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
            });
          }
        } else if (item.entityType === "lesson" && this.deps.lessonStore) {
          const existing = await this.deps.lessonStore.findById(item.entityId as any);
          if (existing) {
            existing.title = (state.title as string) || existing.title;
            existing.contentMarkdown = (state.contentMarkdown as string) || existing.contentMarkdown;
            existing.sortOrder = (state.sortOrder as number) ?? existing.sortOrder;
            existing.deletedAt = null;
            existing.updatedAt = now;
            await this.deps.lessonStore.update(existing);
          } else {
            await this.deps.lessonStore.create({
              id: item.entityId as any,
              moduleId: (item.parentId || state.moduleId) as any,
              title: (state.title as string) || "درس بازگردانی‌شده",
              contentType: "markdown",
              contentMarkdown: (state.contentMarkdown as string) || "",
              sortOrder: (state.sortOrder as number) ?? 0,
              publicationStatus: "published",
              estimatedMinutes: null,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
            });
          }
        } else if (item.entityType === "flashcard" && this.deps.flashcardStore) {
          const existing = await this.deps.flashcardStore.findById?.(item.entityId as any);
          if (existing && this.deps.flashcardStore.update) {
            existing.question = (state.question as string) || existing.question;
            existing.answer = (state.answer as string) || existing.answer;
            existing.deletedAt = null;
            existing.updatedAt = now;
            await this.deps.flashcardStore.update(existing);
          } else {
            await this.deps.flashcardStore.create({
              id: item.entityId as any,
              organizationId: (state.organizationId as any) || course.organizationId,
              courseId,
              documentId: (state.documentId as any) ?? null,
              lessonId: (item.parentId || state.lessonId) as any,
              question: (state.question as string) || "",
              answer: (state.answer as string) || "",
              explanation: (state.explanation as string) ?? null,
              cardType: (state.cardType as string) || "definition",
              difficulty: (state.difficulty as string) || "medium",
              dueAt: now,
              intervalDays: 0,
              easeFactor: 2.5,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
              generatedContentId: null,
            });
          }
        } else if (item.entityType === "quiz" && this.deps.quizStore) {
          const existing = await this.deps.quizStore.findById?.(item.entityId as any);
          if (existing && this.deps.quizStore.update) {
            existing.title = (state.title as string) || existing.title;
            existing.deletedAt = null;
            existing.updatedAt = now;
            await this.deps.quizStore.update(existing);
          } else {
            await this.deps.quizStore.create({
              id: item.entityId as any,
              organizationId: (state.organizationId as any) || course.organizationId,
              courseId,
              moduleId: (state.moduleId as any) ?? null,
              documentId: (state.documentId as any) ?? null,
              title: (state.title as string) || "آزمون",
              topic: (state.topic as string) ?? null,
              difficulty: (state.difficulty as string) || "medium",
              status: "draft",
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
            });
          }
        } else if (item.entityType === "quiz_question" && this.deps.quizQuestionStore) {
          const list = await this.deps.quizQuestionStore.listByIds([item.entityId as any]);
          if (list[0] && this.deps.quizQuestionStore.update) {
            const qu = list[0];
            qu.question = ((state.question || state.prompt) as string) || qu.question;
            qu.choices = (state.choices as any) ?? qu.choices;
            qu.correctAnswer = (state.correctAnswer as any) ?? qu.correctAnswer;
            qu.deletedAt = null;
            qu.updatedAt = now;
            await this.deps.quizQuestionStore.update(qu);
          } else if (this.deps.quizQuestionStore.create) {
            await this.deps.quizQuestionStore.create({
              id: item.entityId as any,
              quizId: (item.parentId || state.quizId) as any,
              lessonId: (state.lessonId as any) ?? null,
              generatedContentId: null,
              question: (state.question as string) || (state.prompt as string) || "",
              topic: (state.topic as string) ?? null,
              difficulty: (state.difficulty as string) || "medium",
              questionType: "multiple_choice",
              choices: (state.choices as any) ?? [],
              correctAnswer: (state.correctAnswer as any) ?? "",
              explanation: (state.explanation as string) ?? null,
              sortOrder: (state.sortOrder as number) ?? 0,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
            });
          }
        }
      }
    }
  }

  private validateDraftPayload(
    entityType: DraftEntityType,
    action: DraftAction,
    payload: DraftChangePayload,
  ): void {
    if (action === "delete") return;

    const after = payload.after as Record<string, unknown> | null;
    if (!after || typeof after !== "object" || Array.isArray(after)) {
      throw new DomainError(
        "bad_request",
        `فیلد after برای تغییر ${action} روی ${entityType} باید یک آبجکت معتبر باشد.`,
      );
    }

    if (entityType === "module") {
      if (action === "create" && (!after?.title || typeof after.title !== "string" || !after.title.trim())) {
        throw new DomainError("bad_request", "عنوان فصل در پیش‌نویس الزامی است.");
      }
    } else if (entityType === "lesson") {
      if (action === "create" && (!after?.title || typeof after.title !== "string" || !after.title.trim())) {
        throw new DomainError("bad_request", "عنوان درس در پیش‌نویس الزامی است.");
      }
    } else if (entityType === "flashcard") {
      if (action === "create") {
        const q = after?.question ?? after?.front;
        const a = after?.answer ?? after?.back;
        if (!q || typeof q !== "string" || !a || typeof a !== "string") {
          throw new DomainError("bad_request", "صورت و پاسخ فلش‌کارت در پیش‌نویس الزامی است.");
        }
      }
    } else if (entityType === "quiz") {
      if (action === "create" && (!after?.title || typeof after.title !== "string" || !after.title.trim())) {
        throw new DomainError("bad_request", "عنوان آزمون در پیش‌نویس الزامی است.");
      }
    } else if (entityType === "quiz_question") {
      if (action === "create") {
        const q = after?.question ?? after?.prompt;
        if (!q || typeof q !== "string" || !q.trim()) {
          throw new DomainError("bad_request", "متن سوال آزمون در پیش‌نویس الزامی است.");
        }
      }
    }
  }

  private buildReleaseManifest(changes: CourseDraftChangeRecord[]): ReleaseManifest {
    return changes.map((c) => ({
      entityType: c.entityType,
      entityId: c.entityId,
      action: c.action,
      identityOperation:
        c.action === "create"
          ? "created"
          : c.action === "delete"
          ? "soft_deleted"
          : "updated",
      parentId: c.parentId,
      sortOrderBefore: (c.payload.before?.sortOrder as number) ?? null,
      sortOrderAfter: (c.payload.after?.sortOrder as number) ?? null,
      before: (c.payload.before as Record<string, unknown>) ?? null,
      after: (c.payload.after as Record<string, unknown>) ?? null,
    }));
  }

  private buildReleaseSummary(changes: CourseDraftChangeRecord[]) {
    const summary = {
      modulesCreated: 0,
      modulesUpdated: 0,
      modulesDeleted: 0,
      lessonsCreated: 0,
      lessonsUpdated: 0,
      lessonsDeleted: 0,
      flashcardsCreated: 0,
      flashcardsUpdated: 0,
      flashcardsDeleted: 0,
      quizzesCreated: 0,
      quizzesUpdated: 0,
      quizzesDeleted: 0,
      questionsCreated: 0,
      questionsUpdated: 0,
      questionsDeleted: 0,
      totalOperations: changes.length,
    };

    for (const c of changes) {
      if (c.entityType === "module") {
        if (c.action === "create") summary.modulesCreated++;
        else if (c.action === "delete") summary.modulesDeleted++;
        else summary.modulesUpdated++;
      } else if (c.entityType === "lesson") {
        if (c.action === "create") summary.lessonsCreated++;
        else if (c.action === "delete") summary.lessonsDeleted++;
        else summary.lessonsUpdated++;
      } else if (c.entityType === "flashcard") {
        if (c.action === "create") summary.flashcardsCreated++;
        else if (c.action === "delete") summary.flashcardsDeleted++;
        else summary.flashcardsUpdated++;
      } else if (c.entityType === "quiz") {
        if (c.action === "create") summary.quizzesCreated++;
        else if (c.action === "delete") summary.quizzesDeleted++;
        else summary.quizzesUpdated++;
      } else if (c.entityType === "quiz_question") {
        if (c.action === "create") summary.questionsCreated++;
        else if (c.action === "delete") summary.questionsDeleted++;
        else summary.questionsUpdated++;
      }
    }
    return summary;
  }
}
