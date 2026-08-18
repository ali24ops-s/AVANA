import { describe, it, expect, beforeEach } from "vitest";
import type {
  Actor,
  CourseId,
  DocumentId,
  LessonId,
  ModuleId,
  OrganizationId,
  QuizId,
} from "@avana/domain";
import { defaultPolicy } from "@avana/domain";

import { StudyService } from "../modules/study/study-service.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryUserFlashcardScheduleStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
} from "../modules/study/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";

describe("Standardized Taxonomy (Course -> Module -> Lesson)", () => {
  let orgId: OrganizationId;
  let courseId: CourseId;
  let moduleId: ModuleId;
  let lessonId: LessonId;
  let actor: Actor;

  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let userFlashcardScheduleStore: InMemoryUserFlashcardScheduleStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;

  let studyService: StudyService;

  beforeEach(async () => {
    orgId = "org-tax-100" as OrganizationId;
    courseId = "course-tax-100" as CourseId;
    moduleId = "module-tax-100" as ModuleId;
    lessonId = "lesson-tax-100" as LessonId;
    actor = {
      userId: "user-tax-1",
      role: "organization_admin",
    };

    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    userFlashcardScheduleStore = new InMemoryUserFlashcardScheduleStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore();

    studyService = new StudyService(
      flashcardStore,
      flashcardReviewStore,
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      moduleStore,
      lessonStore,
      undefined as any,
      defaultPolicy,
      undefined,
      undefined,
      userFlashcardScheduleStore,
      courseStore,
    );

    // Seed Course, Module, Lesson in Learning Core
    const now = new Date().toISOString();
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        name: "فارماکولوژی پزشکی",
        subject: "Medical Pharmacology",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    await moduleStore.create({
      id: moduleId,
      courseId,
      title: "بخش ۱: سیستم عصب خودمختار",
      description: null,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await lessonStore.create({
      id: lessonId,
      moduleId,
      title: "سرفصل ۱.۱: داروهای آگونیست کلینرژیک",
      contentType: "text",
      contentMarkdown: "# داروهای آگونیست کلینرژیک",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
  });

  it("should aggregate exam topic summary strictly via Course -> Module -> Lesson hierarchy without mock topic fallbacks", async () => {
    const now = new Date().toISOString();

    // Insert Quiz and Questions linked to real lessonId
    const quizId = "quiz-tax-1" as QuizId;
    quizStore.insert({
      id: quizId,
      organizationId: orgId,
      courseId,
      documentId: "doc-1" as DocumentId,
      title: "آزمون کلینرژیک",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    quizQuestionStore.createMany([
      {
        id: "qq-1" as any,
        quizId,
        generatedContentId: "gen-1" as any,
        lessonId,
        question: "سوال ۱: کدام داروی کلینرژیک اثر طولانی‌تر دارد؟",
        topic: "داروهای آگونیست کلینرژیک",
        difficulty: "hard",
        questionType: "multiple_choice",
        choices: ["بثانکل", "پیلوکارپین", "کارباکول"],
        correctAnswer: "کارباکول",
        explanation: null,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "qq-2" as any,
        quizId,
        generatedContentId: "gen-1" as any,
        lessonId,
        question: "سوال ۲: مکانیسم کارباکول چیست؟",
        topic: "داروهای آگونیست کلینرژیک",
        difficulty: "medium",
        questionType: "multiple_choice",
        choices: ["آگونیست مستقیم", "مهارکننده آنزیم"],
        correctAnswer: "آگونیست مستقیم",
        explanation: null,
        sortOrder: 2,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const res = await studyService.getExamTopicSummary(actor, orgId);

    expect(res.courses).toHaveLength(1);
    const courseSummary = res.courses[0];
    expect(courseSummary.courseId).toBe(courseId);
    expect(courseSummary.courseTitle).toBe("فارماکولوژی پزشکی");
    expect(courseSummary.questionCount).toBe(2);
    expect(courseSummary.hardCount).toBe(1);
    expect(courseSummary.mediumCount).toBe(1);

    expect(courseSummary.modules).toHaveLength(1);
    const moduleSummary = courseSummary.modules[0];
    expect(moduleSummary.moduleId).toBe(moduleId);
    expect(moduleSummary.moduleTitle).toBe("بخش ۱: سیستم عصب خودمختار");
    expect(moduleSummary.questionCount).toBe(2);

    expect(moduleSummary.lessons).toHaveLength(1);
    const lessonSummary = moduleSummary.lessons[0];
    expect(lessonSummary.lessonId).toBe(lessonId);
    expect(lessonSummary.lessonTitle).toBe("سرفصل ۱.۱: داروهای آگونیست کلینرژیک");
    expect(lessonSummary.questionCount).toBe(2);

    // Verify NO mock topic fallbacks (such as sec- or ch- prefix strings) exist
    const hasMockSecId = res.sections.some((s) => s.id.startsWith("sec-"));
    expect(hasMockSecId).toBe(false);
  });

  it("should group questions with lessonId=null under the authoritative document Module, NOT under 'سایر سرفصل‌ها'", async () => {
    const docId = "doc-unmapped-test" as DocumentId;
    const now = new Date().toISOString();

    const docModuleId = "mod-doc-unmapped" as ModuleId;
    await moduleStore.create({
      id: docModuleId,
      courseId,
      documentId: docId,
      title: "فصل: فارماکولوژی غدد فوق کلیوی",
      description: "ماژول استخراج‌شده از جزوه",
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const quizId = "quiz-unmapped-1" as QuizId;
    quizStore.insert({
      id: quizId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      title: "آزمون غدد فوق کلیوی",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Question with lessonId = null
    quizQuestionStore.createMany([
      {
        id: "qq-unmapped-1" as any,
        quizId,
        generatedContentId: "gen-unmapped" as any,
        lessonId: null,
        question: "سوال ۱ غدد: هورمون آلدوسترون چه اثری دارد؟",
        topic: "سندروم کوشینگ",
        difficulty: "medium",
        questionType: "multiple_choice",
        choices: ["احتباس سدیم", "دفع پتاسیم"],
        correctAnswer: "احتباس سدیم",
        explanation: null,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const res = await studyService.getExamTopicSummary(actor, orgId);

    // Verify course includes the question under the document's Module
    const targetModule = res.courses[0].modules.find((m) => m.moduleId === docModuleId);
    expect(targetModule).toBeDefined();
    expect(targetModule!.moduleTitle).toBe("فصل: فارماکولوژی غدد فوق کلیوی");
    expect(targetModule!.questionCount).toBe(1);

    // Verify 'سایر سرفصل‌ها' / course-unassigned is NOT created for this question
    const unassignedCourse = res.courses.find((c) => c.courseId === "course-unassigned");
    expect(unassignedCourse).toBeUndefined();
  });

  it("should select questions with lessonId=null when starting a configured exam attempt for a Module", async () => {
    const docId = "doc-select-test" as DocumentId;
    const now = new Date().toISOString();

    const docModuleId = "mod-doc-select" as ModuleId;
    await moduleStore.create({
      id: docModuleId,
      courseId,
      documentId: docId,
      title: "فصل: فارماکولوژی کلیه",
      description: "ماژول کلیه",
      sortOrder: 3,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const quizId = "quiz-select-1" as QuizId;
    quizStore.insert({
      id: quizId,
      organizationId: orgId,
      courseId,
      documentId: docId,
      title: "آزمون کلیه",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    quizQuestionStore.createMany([
      {
        id: "qq-select-1" as any,
        quizId,
        generatedContentId: "gen-select" as any,
        lessonId: null,
        question: "سوال کلیه: دیورتیک فورزماید در کدام بخش لوله ادراری اثر می‌کند؟",
        topic: "دیورتیک‌های قوس",
        difficulty: "medium",
        questionType: "multiple_choice",
        choices: ["بخش صعودی قوس هنله", "لوله پیچیده نزدیک"],
        correctAnswer: "بخش صعودی قوس هنله",
        explanation: null,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Select the module explicitly
    const result = await studyService.startConfiguredExamAttempt(actor, orgId, {
      sections: [docModuleId],
      questionCount: 1,
      difficulty: "all",
    });

    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].id).toBe("qq-select-1");
  });
});
