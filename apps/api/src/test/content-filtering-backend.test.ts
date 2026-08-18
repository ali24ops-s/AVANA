import { describe, it, expect, beforeEach } from "vitest";
import type {
  Actor,
  CourseId,
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

describe("Content Filtering for Flashcards & Exams Backend", () => {
  let orgId: OrganizationId;
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
    orgId = "org-filter-test" as OrganizationId;
    actor = {
      userId: "user-filter-1",
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
  });

  it("should filter out 0-question modules and 0-question courses in getExamTopicSummary", async () => {
    const now = new Date().toISOString();

    // Course 1: Has Module A (with 2 questions) and Module B (with 0 questions)
    const course1Id = "c1" as CourseId;
    await courseStore.create({
      course: {
        id: course1Id,
        organizationId: orgId,
        name: "فارماکولوژی ۱",
        subject: "PHARM1",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    const modA = "mod-a" as ModuleId;
    const modB = "mod-b" as ModuleId;
    await moduleStore.create({
      id: modA,
      courseId: course1Id,
      title: "Module A (2 Questions)",
      description: null,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await moduleStore.create({
      id: modB,
      courseId: course1Id,
      title: "Module B (0 Questions)",
      description: null,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const lessonA = "les-a" as LessonId;
    const lessonB = "les-b" as LessonId;
    await lessonStore.create({
      id: lessonA,
      moduleId: modA,
      title: "Lesson A",
      contentType: "markdown",
      contentMarkdown: "",
      estimatedMinutes: 10,
      publicationStatus: "published",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await lessonStore.create({
      id: lessonB,
      moduleId: modB,
      title: "Lesson B",
      contentType: "markdown",
      contentMarkdown: "",
      estimatedMinutes: 10,
      publicationStatus: "published",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Course 2: Has Module C (0 questions) -> entire Course 2 should be filtered out
    const course2Id = "c2" as CourseId;
    await courseStore.create({
      course: {
        id: course2Id,
        organizationId: orgId,
        name: "بیوشیمی",
        subject: "BIO1",
        examDate: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      },
      auditEvents: [],
    });

    const modC = "mod-c" as ModuleId;
    await moduleStore.create({
      id: modC,
      courseId: course2Id,
      title: "Module C (0 Questions)",
      description: null,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    const quiz1Id = "quiz-1" as QuizId;
    await quizStore.insert({
      id: quiz1Id,
      organizationId: orgId,
      courseId: course1Id,
      documentId: "doc-1" as any,
      title: "آزمون فارماکولوژی",
      status: "published",
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Add 2 questions for Lesson A under Module A
    quizQuestionStore.createMany([
      {
        id: "q1" as any,
        quizId: quiz1Id,
        generatedContentId: "g1" as any,
        lessonId: lessonA,
        question: "Q1",
        difficulty: "easy",
        questionType: "multiple_choice",
        choices: ["A", "B"],
        correctAnswer: "A",
        explanation: null,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "q2" as any,
        quizId: quiz1Id,
        generatedContentId: "g1" as any,
        lessonId: lessonA,
        question: "Q2",
        difficulty: "hard",
        questionType: "multiple_choice",
        choices: ["A", "B"],
        correctAnswer: "B",
        explanation: null,
        sortOrder: 2,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const res = await studyService.getExamTopicSummary(actor, orgId);

    // Course 2 should be omitted completely
    expect(res.courses).toHaveLength(1);
    expect(res.courses[0].courseId).toBe(course1Id);

    // In Course 1, Module B (0 questions) should be omitted
    expect(res.courses[0].modules).toHaveLength(1);
    expect(res.courses[0].modules[0].moduleId).toBe(modA);
    expect(res.courses[0].modules[0].questionCount).toBe(2);
  });
});
