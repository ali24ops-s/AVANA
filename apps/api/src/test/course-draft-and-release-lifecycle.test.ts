import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  asCourseId,
  asModuleId,
  asLessonId,
  asUserId,
  asOrganizationId,
  asCourseDraftChangeId,
  asCourseReleaseId,
  parseUUID,
  type Actor,
  type CourseDraftSessionRecord,
  type CourseDraftChangeRecord,
  type CourseReleaseRecord,
} from "@avana/domain";
import { CourseDraftService } from "../modules/courses/course-draft-service.js";
import type { CourseStore, CourseRecord } from "../modules/courses/course-store.js";
import type {
  CourseDraftSessionStore,
  CourseDraftChangeStore,
  CourseReleaseStore,
} from "../modules/courses/course-draft-store.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemoryDocumentStore,
} from "../modules/learning/test/in-memory-stores.js";
import { LearningService } from "../modules/learning/learning-service.js";
import type {
  FlashcardStore,
  FlashcardRecord,
  QuizStore,
  QuizRecord,
  QuizQuestionStore,
  QuizQuestionRecord,
  QuizAttemptStore,
  QuizAttemptRecord,
  UserFlashcardScheduleStore,
  UserFlashcardScheduleRecord,
} from "../modules/study/study-store.js";

describe("Course Draft & Atomic Release Lifecycle Integration Test", () => {
  const courseId = asCourseId(parseUUID("11111111-1111-4111-8111-111111111111"));
  const orgId = asOrganizationId(parseUUID("22222222-2222-4222-8222-222222222222"));
  const studentId = asUserId(parseUUID("33333333-3333-4333-8333-333333333333"));
  const adminId = asUserId(parseUUID("44444444-4444-4444-8444-444444444444"));

  const studentActor: Actor = { userId: studentId, role: "student" };
  const adminActor: Actor = { userId: adminId, role: "platform_admin" };

  // Stores
  let coursesMap: Map<string, CourseRecord>;
  let courseStore: CourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let documentStore: InMemoryDocumentStore;

  // Study stores
  let flashcardsMap: Map<string, FlashcardRecord>;
  let flashcardStore: FlashcardStore;
  let userSchedulesMap: Map<string, UserFlashcardScheduleRecord>;
  let scheduleStore: UserFlashcardScheduleStore;
  let quizzesMap: Map<string, QuizRecord>;
  let quizStore: QuizStore;
  let quizQuestionsMap: Map<string, QuizQuestionRecord>;
  let quizQuestionStore: QuizQuestionStore;
  let quizAttemptsMap: Map<string, QuizAttemptRecord>;
  let quizAttemptStore: QuizAttemptStore;

  // Draft stores
  let draftSessionsMap: Map<string, CourseDraftSessionRecord>;
  let draftSessionStore: CourseDraftSessionStore;
  let draftChangesMap: Map<string, CourseDraftChangeRecord>;
  let draftChangeStore: CourseDraftChangeStore;
  let releasesMap: Map<string, CourseReleaseRecord>;
  let releaseStore: CourseReleaseStore;

  // Services
  let draftService: CourseDraftService;
  let learningService: LearningService;

  beforeEach(() => {
    coursesMap = new Map();
    const now = new Date().toISOString();

    coursesMap.set(courseId, {
      id: courseId,
      organizationId: orgId,
      name: "Official Biology 101",
      subject: "Biology",
      status: "published",
      isOfficial: true,
      version: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    courseStore = {
      findById: async (id) => coursesMap.get(id),
      findByIdForUser: async (id) => coursesMap.get(id),
      listByOrganization: async (oId) => Array.from(coursesMap.values()).filter((c) => c.organizationId === oId),
      create: async (c) => { coursesMap.set(c.id, { ...c }); return c; },
      update: async (c) => { coursesMap.set(c.id, { ...c }); return c; },
      delete: async (id) => { const c = coursesMap.get(id); if (c) c.deletedAt = new Date().toISOString(); },
    } as unknown as CourseStore;

    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    documentStore = new InMemoryDocumentStore();

    flashcardsMap = new Map();
    flashcardStore = {
      create: async (fc) => { flashcardsMap.set(fc.id, { ...fc }); return fc; },
      createMany: async (fcs) => { for (const fc of fcs) flashcardsMap.set(fc.id, { ...fc }); return fcs; },
      findById: async (id) => flashcardsMap.get(id),
      listByCourse: async (cId) => Array.from(flashcardsMap.values()).filter((f) => f.courseId === cId),
      findByGeneratedContent: async (gcId) => Array.from(flashcardsMap.values()).find((f) => f.generatedContentId === gcId),
      update: async (fc) => { flashcardsMap.set(fc.id, { ...fc }); return fc; },
      delete: async (id) => { const f = flashcardsMap.get(id); if (f) f.deletedAt = new Date().toISOString(); },
      deleteByDocument: async (dId) => {
        for (const f of flashcardsMap.values()) {
          if (f.documentId === dId) f.deletedAt = new Date().toISOString();
        }
      },
    } as unknown as FlashcardStore;

    userSchedulesMap = new Map();
    scheduleStore = {
      getByUserAndCard: async (uId, fcId) => Array.from(userSchedulesMap.values()).find((s) => s.userId === uId && s.flashcardId === fcId),
      listByUser: async (uId) => Array.from(userSchedulesMap.values()).filter((s) => s.userId === uId),
      upsertSchedule: async (s) => {
        const id = randomUUID() as any;
        const rec = { ...s, id, createdAt: now, updatedAt: now };
        userSchedulesMap.set(id, rec);
        return rec;
      },
    } as unknown as UserFlashcardScheduleStore;

    quizzesMap = new Map();
    quizStore = {
      create: async (q) => { quizzesMap.set(q.id, { ...q }); return q; },
      findById: async (id) => quizzesMap.get(id),
      findByIdForOrganization: async (id) => quizzesMap.get(id),
      listByCourse: async (cId) => Array.from(quizzesMap.values()).filter((q) => q.courseId === cId),
      listByOrganization: async () => Array.from(quizzesMap.values()),
      findByGeneratedContent: async (gcId) => Array.from(quizzesMap.values()).find((q) => q.generatedContentId === gcId),
      update: async (q) => { quizzesMap.set(q.id, { ...q }); return q; },
      delete: async (id) => { const q = quizzesMap.get(id); if (q) q.deletedAt = new Date().toISOString(); },
      deleteByDocument: async (dId) => {
        for (const q of quizzesMap.values()) {
          if (q.documentId === dId) q.deletedAt = new Date().toISOString();
        }
      },
    } as unknown as QuizStore;

    quizQuestionsMap = new Map();
    quizQuestionStore = {
      create: async (qq) => { quizQuestionsMap.set(qq.id, { ...qq }); return qq; },
      createMany: async (qqs) => { for (const qq of qqs) quizQuestionsMap.set(qq.id, { ...qq }); return qqs; },
      listByQuiz: async (qId) => Array.from(quizQuestionsMap.values()).filter((qq) => qq.quizId === qId),
      listByIds: async (ids) => Array.from(quizQuestionsMap.values()).filter((qq) => ids.includes(qq.id)),
      listByFilter: async () => Array.from(quizQuestionsMap.values()),
      countByTopicAndDifficulty: async () => [],
      update: async (qq) => { quizQuestionsMap.set(qq.id, { ...qq }); return qq; },
      delete: async (id) => { const qq = quizQuestionsMap.get(id); if (qq) qq.deletedAt = new Date().toISOString(); },
      deleteByQuiz: async (qId) => {
        for (const qq of quizQuestionsMap.values()) {
          if (qq.quizId === qId) qq.deletedAt = new Date().toISOString();
        }
      },
      restore: async (id) => { const qq = quizQuestionsMap.get(id); if (qq) qq.deletedAt = null; },
    } as unknown as QuizQuestionStore;

    quizAttemptsMap = new Map();
    quizAttemptStore = {
      findById: async (id) => quizAttemptsMap.get(id),
      listByUserAndQuiz: async (uId, qId) => Array.from(quizAttemptsMap.values()).filter((a) => a.userId === uId && a.quizId === qId),
      listByUser: async (uId) => Array.from(quizAttemptsMap.values()).filter((a) => a.userId === uId),
      countCompletedByUser: async (uId) => Array.from(quizAttemptsMap.values()).filter((a) => a.userId === uId && a.submittedAt).length,
      listByUserAndCourse: async (uId, cId) => Array.from(quizAttemptsMap.values()).filter((a) => a.userId === uId && a.courseId === cId),
      create: async (a) => { quizAttemptsMap.set(a.id, { ...a }); return a; },
      update: async (a) => { quizAttemptsMap.set(a.id, { ...a }); return a; },
    } as unknown as QuizAttemptStore;

    draftSessionsMap = new Map();
    draftSessionStore = {
      create: async (s) => {
        const rec = { ...s, createdAt: now, updatedAt: now };
        draftSessionsMap.set(s.id, rec);
        return rec;
      },
      findById: async (id) => draftSessionsMap.get(id),
      findActiveByCourse: async (cId) =>
        Array.from(draftSessionsMap.values()).find(
          (s) => s.courseId === cId && ["draft", "validating", "ready"].includes(s.status),
        ),
      listByCourse: async (cId) =>
        Array.from(draftSessionsMap.values()).filter((s) => s.courseId === cId),
      updateStatus: async (id, status) => {
        const s = draftSessionsMap.get(id);
        if (s) {
          s.status = status;
          s.updatedAt = new Date().toISOString();
        }
      },
      update: async (s) => {
        draftSessionsMap.set(s.id, { ...s, updatedAt: new Date().toISOString() });
        return draftSessionsMap.get(s.id)!;
      },
    };

    draftChangesMap = new Map();
    draftChangeStore = {
      upsert: async (c) => {
        const existing = Array.from(draftChangesMap.values()).find(
          (x) => x.draftSessionId === c.draftSessionId && x.entityType === c.entityType && x.entityId === c.entityId,
        );
        const id = existing?.id ?? (asCourseDraftChangeId(randomUUID() as any));
        const rec: CourseDraftChangeRecord = {
          id,
          draftSessionId: c.draftSessionId,
          courseId: c.courseId,
          entityType: c.entityType,
          entityId: c.entityId,
          action: c.action,
          parentId: c.parentId ?? null,
          sortOrder: c.sortOrder ?? null,
          payload: c.payload,
          createdAt: existing?.createdAt ?? now,
          updatedAt: new Date().toISOString(),
        };
        draftChangesMap.set(id, rec);
        return rec;
      },
      delete: async (id) => { draftChangesMap.delete(id); },
      deleteBySessionAndEntity: async (sId, type, eId) => {
        for (const [k, v] of draftChangesMap.entries()) {
          if (v.draftSessionId === sId && v.entityType === type && v.entityId === eId) {
            draftChangesMap.delete(k);
          }
        }
      },
      findBySessionAndEntity: async (sId, type, eId) =>
        Array.from(draftChangesMap.values()).find(
          (x) => x.draftSessionId === sId && x.entityType === type && x.entityId === eId,
        ),
      listBySession: async (sId) =>
        Array.from(draftChangesMap.values()).filter((x) => x.draftSessionId === sId),
      deleteBySession: async (sId) => {
        for (const [k, v] of draftChangesMap.entries()) {
          if (v.draftSessionId === sId) draftChangesMap.delete(k);
        }
      },
    };

    releasesMap = new Map();
    releaseStore = {
      create: async (r) => {
        const rec = { ...r, publishedAt: now };
        releasesMap.set(r.id, rec);
        return rec;
      },
      findById: async (id) => releasesMap.get(id),
      findByCourseAndVersion: async (cId, ver) =>
        Array.from(releasesMap.values()).find((r) => r.courseId === cId && r.versionNumber === ver),
      listByCourse: async (cId) =>
        Array.from(releasesMap.values())
          .filter((r) => r.courseId === cId)
          .sort((a, b) => b.versionNumber - a.versionNumber),
      findLatestByCourse: async (cId) => {
        const list = Array.from(releasesMap.values())
          .filter((r) => r.courseId === cId)
          .sort((a, b) => b.versionNumber - a.versionNumber);
        return list[0];
      },
    };

    draftService = new CourseDraftService({
      courseStore,
      draftSessionStore,
      draftChangeStore,
      releaseStore,
      moduleStore,
      lessonStore,
      flashcardStore,
      quizStore,
      quizQuestionStore,
    });

    const mockOrgStore = {
      findMembership: async () => ({ role: "student" }),
    };

    learningService = new LearningService(
      courseStore,
      mockOrgStore as any,
      moduleStore,
      lessonStore,
      progressStore,
      undefined,
      undefined,
      orgId, // systemOrganizationId
    );
  });

  it("Full lifecycle: live published course -> draft -> preview -> atomic publish -> rollback with progress preservation", async () => {
    const now = new Date().toISOString();

    // 1. Initial State: Course has 1 module, 1 lesson, 1 flashcard, 1 quiz
    const mod1Id = asModuleId(randomUUID() as any);
    await moduleStore.create({
      id: mod1Id,
      courseId,
      title: "فصل ۱: مبانی ژنتیک",
      description: "مفاهیم پایه ژنتیک و توارث",
      sortOrder: 0,
      subCourseGroupId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const les1Id = asLessonId(randomUUID() as any);
    await lessonStore.create({
      id: les1Id,
      moduleId: mod1Id,
      title: "درس ۱: قوانین مندل",
      contentType: "markdown",
      contentMarkdown: "# قوانین مندل\nقانون تفکیک صفات...",
      sortOrder: 0,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const fc1Id = randomUUID() as any;
    await flashcardStore.create({
      id: fc1Id,
      organizationId: orgId,
      courseId,
      lessonId: les1Id,
      question: "مندل روی چه گیاهی تحقیق کرد؟",
      answer: "نخود فرنگی",
      difficulty: "easy" as any,
      cardType: "definition" as any,
      dueAt: now,
      intervalDays: 1,
      easeFactor: 2.5,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const quiz1Id = randomUUID() as any;
    await quizStore.create({
      id: quiz1Id,
      organizationId: orgId,
      courseId,
      title: "آزمون فصل ۱",
      topic: "ژنتیک مندلی",
      difficulty: "medium",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const q1Id = randomUUID() as any;
    await quizQuestionStore.create({
      id: q1Id,
      quizId: quiz1Id,
      lessonId: les1Id,
      question: "نسبت فنوتیپی فرزندان در نسل F2 صفات تک‌هیبریدی مندل چیست؟",
      choices: ["3:1", "1:2:1", "9:3:3:1", "1:1"],
      correctAnswer: "3:1",
      difficulty: "medium" as any,
      questionType: "multiple_choice" as any,
      sortOrder: 0,
      topic: "ژنتیک مندلی",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Seed Release 1 manifest record for initial published course
    await releaseStore.create({
      id: asCourseReleaseId(randomUUID() as any),
      courseId,
      versionNumber: 1,
      baseVersion: 1,
      draftSessionId: null,
      changesSummary: { type: "initial_publication" },
      manifest: [
        {
          entityType: "module",
          entityId: mod1Id,
          action: "create",
          identityOperation: "created",
          parentId: null,
          sortOrderBefore: null,
          sortOrderAfter: 0,
          before: null,
          after: {
            id: mod1Id,
            courseId,
            title: "فصل ۱: ژنتیک پایه",
            sortOrder: 0,
          },
        },
        {
          entityType: "lesson",
          entityId: les1Id,
          action: "create",
          identityOperation: "created",
          parentId: mod1Id,
          sortOrderBefore: null,
          sortOrderAfter: 0,
          before: null,
          after: {
            id: les1Id,
            moduleId: mod1Id,
            title: "درس ۱: قوانین مندل",
            contentType: "markdown",
            contentMarkdown: "# قوانین مندل\nقانون تفکیک صفات...",
            sortOrder: 0,
            publicationStatus: "published",
          },
        },
        {
          entityType: "flashcard",
          entityId: fc1Id,
          action: "create",
          identityOperation: "created",
          parentId: les1Id,
          sortOrderBefore: null,
          sortOrderAfter: 0,
          before: null,
          after: {
            id: fc1Id,
            courseId,
            lessonId: les1Id,
            question: "تعریف فنوتیپ چیست؟",
            answer: "ویژگی‌های قابل مشاهده یا اندازه‌گیری یک جاندار.",
          },
        },
        {
          entityType: "quiz",
          entityId: quiz1Id,
          action: "create",
          identityOperation: "created",
          parentId: mod1Id,
          sortOrderBefore: null,
          sortOrderAfter: 0,
          before: null,
          after: {
            id: quiz1Id,
            courseId,
            title: "کوییز ژنتیک مندلی",
          },
        },
        {
          entityType: "quiz_question",
          entityId: q1Id,
          action: "create",
          identityOperation: "created",
          parentId: quiz1Id,
          sortOrderBefore: null,
          sortOrderAfter: 0,
          before: null,
          after: {
            id: q1Id,
            quizId: quiz1Id,
            question: "نسبت فنوتیپی فرزندان در نسل F2 صفات تک‌هیبریدی مندل چیست؟",
          },
        },
      ],
      publishedBy: adminId,
    });

    // 2. Student Activity: Record learning progress, flashcard schedule, quiz attempt
    await progressStore.upsert({
      userId: studentId,
      lessonId: les1Id,
      courseId,
      completed: true,
      lastAccessedAt: now,
    });

    await scheduleStore.upsertSchedule({
      userId: studentId,
      flashcardId: fc1Id,
      dueAt: now,
      intervalDays: 3,
      easeFactor: 2.6,
      state: "review" as any,
      repetitions: 2,
      lapses: 0,
    });

    const attemptId = randomUUID() as any;
    await quizAttemptStore.create({
      id: attemptId,
      userId: studentId,
      quizId: quiz1Id,
      courseId,
      answers: { [q1Id]: "3:1" },
      score: 100,
      totalQuestions: 1,
      correctCount: 1,
      completedAt: now,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // 3. Verify Student Initial Read: version = 1, lesson is completed
    const initialLearn = await learningService.getCourseLearning(studentActor, courseId, "req-1");
    expect((initialLearn.course as any).version).toBe(1);
    expect(initialLearn.modules.length).toBe(1);
    expect(initialLearn.modules[0].lessons.length).toBe(1);
    expect(initialLearn.modules[0].lessons[0].id).toBe(les1Id);
    expect(initialLearn.progress.completed_lessons).toBe(1);
    expect(initialLearn.progress.progress_percent).toBe(100);

    // 4. Admin creates active draft session for course
    const draftSession = await draftService.getOrCreateActiveSession(adminActor, courseId, {
      title: "تغییرات سال تحصیلی جدید",
    });
    expect(draftSession.baseCourseVersion).toBe(1);
    expect(draftSession.status).toBe("draft");

    // 5. Admin stages draft changes:
    // Change A: Update lesson 1 title and content
    await draftService.recordChange(adminActor, draftSession.id, {
      entityType: "lesson",
      entityId: les1Id,
      parentId: mod1Id,
      action: "update",
      sortOrder: 0,
      payload: {
        before: { title: "درس ۱: قوانین مندل" },
        after: {
          title: "درس ۱: مبانی ژنتیک مندلی و شواهد آزمایشگاهی",
          contentMarkdown: "# مبانی ژنتیک مندلی (نسخه به‌روزرسانی شده)\nمفاهیم تکمیلی...",
        },
      },
    });

    // Change B: Create a brand new lesson in mod1
    const newLessonId = randomUUID();
    await draftService.recordChange(adminActor, draftSession.id, {
      entityType: "lesson",
      entityId: newLessonId,
      parentId: mod1Id,
      action: "create",
      sortOrder: 1,
      payload: {
        before: null,
        after: {
          title: "درس ۲: صفات پیوسته به جنس",
          contentMarkdown: "# وراثت پیوسته به جنس\nتوارث در کروموزوم X...",
          publicationStatus: "published",
        },
      },
    });

    // 6. Draft Isolation Invariant: Student still sees published v1 unchanged!
    const midDraftLearn = await learningService.getCourseLearning(studentActor, courseId, "req-2");
    expect((midDraftLearn.course as any).version).toBe(1);
    expect(midDraftLearn.modules[0].lessons.length).toBe(1); // new lesson not leaked to students
    expect(midDraftLearn.modules[0].lessons[0].title).toBe("درس ۱: قوانین مندل"); // not overwritten

    // 7. Preview Engine Verification: In-memory Overlay shows both changes
    const preview = await draftService.getPreviewHierarchy(adminActor, courseId, draftSession.id);
    expect(preview.version).toBe(1);
    expect(preview.isDraftPreview).toBe(true);
    expect(preview.pendingChangesCount).toBe(2);

    const previewModule = preview.modules.find((m) => m.id === mod1Id)!;
    expect(previewModule.lessons.length).toBe(2);

    const prevLes1 = previewModule.lessons.find((l) => l.id === les1Id)!;
    expect(prevLes1.title).toBe("درس ۱: مبانی ژنتیک مندلی و شواهد آزمایشگاهی");
    expect(prevLes1.draftAction).toBe("update");

    const prevLes2 = previewModule.lessons.find((l) => l.id === newLessonId)!;
    expect(prevLes2.title).toBe("درس ۲: صفات پیوسته به جنس");
    expect(prevLes2.draftAction).toBe("create");

    // 8. Validate Draft Session
    const validation = await draftService.validateSession(adminActor, draftSession.id);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);

    // 9. Atomic Publish Draft Session
    const { release, course: publishedCourse } = await draftService.publishDraftSession(
      adminActor,
      draftSession.id,
    );

    // Course version bumped to 2
    expect(publishedCourse.version).toBe(2);
    expect(release.versionNumber).toBe(2);
    expect(release.baseVersion).toBe(1);
    expect(release.manifest.length).toBe(2);

    // Session status marked published
    const finalSession = await draftService.getSession(adminActor, draftSession.id);
    expect(finalSession.status).toBe("published");

    // 10. Student Post-Publish Verification:
    // Course version is 2, both lessons visible, and student progress on lesson 1 is 100% PRESERVED!
    const postPublishLearn = await learningService.getCourseLearning(studentActor, courseId, "req-3");
    expect((postPublishLearn.course as any).version).toBe(2);
    expect(postPublishLearn.modules[0].lessons.length).toBe(2);

    const liveLes1 = postPublishLearn.modules[0].lessons.find((l) => l.id === les1Id)!;
    expect(liveLes1.title).toBe("درس ۱: مبانی ژنتیک مندلی و شواهد آزمایشگاهی");
    expect(liveLes1.completed).toBe(true); // Progress preserved!

    const liveLes2 = postPublishLearn.modules[0].lessons.find((l) => l.id === newLessonId)!;
    expect(liveLes2.title).toBe("درس ۲: صفات پیوسته به جنس");
    expect(liveLes2.completed).toBe(false); // New lesson is not completed yet

    // Total progress updated correctly without error
    expect(postPublishLearn.progress.total_lessons).toBe(2);
    expect(postPublishLearn.progress.completed_lessons).toBe(1);
    expect(postPublishLearn.progress.progress_percent).toBe(50);

    // Flashcard and quiz attempts remain pointing to stable IDs!
    const studentSchedule = await scheduleStore.getByUserAndCard(studentId, fc1Id);
    expect(studentSchedule).toBeDefined();
    expect(studentSchedule?.repetitions).toBe(2);

    const studentAttempts = await quizAttemptStore.listByUserAndQuiz(studentId, quiz1Id);
    expect(studentAttempts).toHaveLength(1);
    expect(studentAttempts[0].score).toBe(100);

    // 11. Rollback Release: Rollback to base snapshot version 1
    const { release: rollbackRel, course: rolledBackCourse } = await draftService.rollbackRelease(
      adminActor,
      courseId,
      1, // rollback to version 1
      "Emergency revert to baseline content",
    );

    // Invariant: Monotonic versioning strictly increments (2 -> 3, never decrements to 1)
    expect(rolledBackCourse.version).toBe(3);
    expect(rollbackRel.versionNumber).toBe(3);
    expect(rollbackRel.changesSummary).toMatchObject({
      type: "rollback",
      targetVersion: 1,
    });

    // Student read path: sees version = 3, lesson 1 progress is STILL preserved!
    const postRollbackLearn = await learningService.getCourseLearning(studentActor, courseId, "req-4");
    expect((postRollbackLearn.course as any).version).toBe(3);
    expect(postRollbackLearn.modules[0].lessons.find((l) => l.id === les1Id)?.completed).toBe(true);
  });
});
