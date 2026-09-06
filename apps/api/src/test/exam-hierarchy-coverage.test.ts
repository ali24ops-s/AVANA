import { describe, expect, it, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { defaultPolicy } from "@avana/domain";
import type {
  Actor,
  CourseId,
  LessonId,
  ModuleId,
  OrganizationId,
  QuizId,
  QuizQuestionId,
  UserId,
} from "@avana/domain";
import {
  InMemoryCourseStore,
} from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
} from "../modules/study/test/in-memory-stores.js";
import { StudyService } from "../modules/study/study-service.js";

const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe("Exam Hierarchy Coverage (Course -> Module) Unit & Integration Tests", () => {
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let service: StudyService;

  const orgId = "org-test-hierarchy" as OrganizationId;
  const actor: Actor = { userId: "user-test" as UserId, role: "student" };

  // Course 1: فارماکولوژی ۲
  const course1Id = "c1-pharma-2" as CourseId;
  const mod1Id = "m1-corticosteroids" as ModuleId;
  const mod2Id = "m2-nsaids" as ModuleId;
  const les1Id = "l1-adrenal-basics" as LessonId;
  const les2Id = "l2-pharmacokinetics" as LessonId;
  const les3Id = "l3-nsaid-intro" as LessonId;

  // Course 2: فیزیولوژی
  const course2Id = "c2-physiology" as CourseId;
  const mod3Id = "m3-endocrine" as ModuleId;
  const les4Id = "l4-hormones" as LessonId;

  const quiz1Id = "quiz-1" as QuizId;
  const quiz2Id = "quiz-2" as QuizId;

  beforeEach(async () => {
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore(quizStore);
    quizAttemptStore = new InMemoryQuizAttemptStore();

    service = new StudyService(
      new InMemoryFlashcardStore(),
      new InMemoryFlashcardReviewStore(),
      quizStore,
      quizQuestionStore,
      quizAttemptStore,
      moduleStore,
      lessonStore,
      new InMemoryProgressStore(),
      defaultPolicy,
      undefined,
      undefined,
      undefined,
      courseStore,
    );

    // Setup Course 1
    await courseStore.create({
      course: {
        id: course1Id,
        organizationId: orgId,
        name: "فارماکولوژی ۲",
        description: null,
        subject: null,
        status: "published",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    // Modules for Course 1
    await moduleStore.create({
      id: mod1Id,
      courseId: course1Id,
      documentId: null,
      title: "داروهای کورتیکواستروئیدی",
      description: null,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await moduleStore.create({
      id: mod2Id,
      courseId: course1Id,
      documentId: null,
      title: "داروهای ضدالتهابی",
      description: null,
      sortOrder: 2,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Lessons for Course 1
    await lessonStore.create({
      id: les1Id,
      moduleId: mod1Id,
      title: "جلسه ۱: مبانی فیزیولوژیک محور آدرنال",
      contentType: "markdown",
      contentMarkdown: "",
      sortOrder: 1,
      estimatedMinutes: 30,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: les2Id,
      moduleId: mod1Id,
      title: "جلسه ۲: فارماکوکینتیک گلوکوکورتیکوئیدها",
      contentType: "markdown",
      contentMarkdown: "",
      sortOrder: 2,
      estimatedMinutes: 30,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: les3Id,
      moduleId: mod2Id,
      title: "جلسه ۳: مکانیسم اثر NSAIDs",
      contentType: "markdown",
      contentMarkdown: "",
      sortOrder: 1,
      estimatedMinutes: 30,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Setup Course 2
    await courseStore.create({
      course: {
        id: course2Id,
        organizationId: orgId,
        name: "فیزیولوژی پزشکی",
        description: null,
        subject: null,
        status: "published",
        examDate: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    await moduleStore.create({
      id: mod3Id,
      courseId: course2Id,
      documentId: null,
      title: "فیزیولوژی سیستم غدد",
      description: null,
      sortOrder: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await lessonStore.create({
      id: les4Id,
      moduleId: mod3Id,
      title: "جلسه ۱: هورمون‌های تیروئید و آدرنال",
      contentType: "markdown",
      contentMarkdown: "",
      sortOrder: 1,
      estimatedMinutes: 30,
      publicationStatus: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Quizzes
    await quizStore.create({
      id: quiz1Id,
      organizationId: orgId,
      courseId: course1Id,
      documentId: null,
      title: "آزمون فارماکولوژی ۲",
      topic: "فارماکولوژی",
      difficulty: "medium",
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    await quizStore.create({
      id: quiz2Id,
      organizationId: orgId,
      courseId: course2Id,
      documentId: null,
      title: "آزمون فیزیولوژی",
      topic: "فیزیولوژی",
      difficulty: "medium",
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
    });

    // Create 5 Questions under Course 1 Mod 1 Les 1
    const q1 = Array.from({ length: 5 }, (_, i) => ({
      id: randomUUID() as QuizQuestionId,
      quizId: quiz1Id,
      lessonId: les1Id,
      question: `سؤال کورتیکواستروئید درس ۱ شماره ${i + 1}`,
      questionType: "multiple_choice",
      choices: ["الف", "ب", "ج", "د"],
      correctAnswer: "الف",
      explanation: null,
      topic: "داروهای کورتیکواستروئیدی",
      difficulty: "medium",
      sortOrder: i + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    // Create 5 Questions under Course 1 Mod 1 Les 2
    const q2 = Array.from({ length: 5 }, (_, i) => ({
      id: randomUUID() as QuizQuestionId,
      quizId: quiz1Id,
      lessonId: les2Id,
      question: `سؤال کورتیکواستروئید درس ۲ شماره ${i + 1}`,
      questionType: "multiple_choice",
      choices: ["الف", "ب", "ج", "د"],
      correctAnswer: "الف",
      explanation: null,
      topic: "داروهای کورتیکواستروئیدی",
      difficulty: "medium",
      sortOrder: i + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    // Create 5 Questions under Course 1 Mod 2 Les 3
    const q3 = Array.from({ length: 5 }, (_, i) => ({
      id: randomUUID() as QuizQuestionId,
      quizId: quiz1Id,
      lessonId: les3Id,
      question: `سؤال ضدالتهابی شماره ${i + 1}`,
      questionType: "multiple_choice",
      choices: ["الف", "ب", "ج", "د"],
      correctAnswer: "الف",
      explanation: null,
      topic: "داروهای ضدالتهابی",
      difficulty: "medium",
      sortOrder: i + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    // Create 5 Questions under Course 2 Mod 3 Les 4
    const q4 = Array.from({ length: 5 }, (_, i) => ({
      id: randomUUID() as QuizQuestionId,
      quizId: quiz2Id,
      lessonId: les4Id,
      question: `سؤال غدد شماره ${i + 1}`,
      questionType: "multiple_choice",
      choices: ["الف", "ب", "ج", "د"],
      correctAnswer: "الف",
      explanation: null,
      topic: "فیزیولوژی سیستم غدد",
      difficulty: "medium",
      sortOrder: i + 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    await quizQuestionStore.createMany([...q1, ...q2, ...q3, ...q4]);
  });

  it("1. Single Lesson: resolves to 1 Course, 1 Module, and 0 Lessons", async () => {
    const res = await service.startConfiguredExamAttempt(actor, orgId, {
      chapters: [les1Id],
      questionCount: 5,
    });

    expect(res.coverage).toBeDefined();
    expect(res.coverage).toHaveLength(1);

    const course = res.coverage![0];
    expect(course.title).toBe("فارماکولوژی ۲");
    expect(course.modules).toHaveLength(1);

    const mod = course.modules[0];
    expect(mod.title).toBe("داروهای کورتیکواستروئیدی");
    expect(mod.questionCount).toBe(5);

    // Strictly ensure no Lesson or جلسه appears anywhere in coverage
    const coverageJson = JSON.stringify(res.coverage);
    expect(coverageJson).not.toContain("جلسه");
    expect(coverageJson).not.toContain("مبانی فیزیولوژیک");
  });

  it("2. Multiple Lessons same Module: resolves to 1 Course, 1 Module (deduplicated)", async () => {
    const res = await service.startConfiguredExamAttempt(actor, orgId, {
      chapters: [les1Id, les2Id],
      questionCount: 6,
    });

    expect(res.coverage).toHaveLength(1);
    const course = res.coverage![0];
    expect(course.title).toBe("فارماکولوژی ۲");
    // les1 and les2 both belong to mod1, so exactly 1 module should be returned
    expect(course.modules).toHaveLength(1);
    expect(course.modules[0].title).toBe("داروهای کورتیکواستروئیدی");
    expect(course.modules[0].questionCount).toBe(6);
  });

  it("3. Multiple Lessons different Modules same Course: resolves to 1 Course, 2 Modules", async () => {
    const res = await service.startConfiguredExamAttempt(actor, orgId, {
      chapters: [les1Id, les3Id],
      questionCount: 8,
    });

    expect(res.coverage).toHaveLength(1);
    const course = res.coverage![0];
    expect(course.title).toBe("فارماکولوژی ۲");
    expect(course.modules).toHaveLength(2);
    expect(course.modules[0].title).toBe("داروهای کورتیکواستروئیدی");
    expect(course.modules[1].title).toBe("داروهای ضدالتهابی");
  });

  it("4. Multiple Modules same Course: resolves to 1 Course, N Modules", async () => {
    const res = await service.startConfiguredExamAttempt(actor, orgId, {
      sections: [mod1Id, mod2Id],
      questionCount: 10,
    });

    expect(res.coverage).toHaveLength(1);
    const course = res.coverage![0];
    expect(course.title).toBe("فارماکولوژی ۲");
    expect(course.modules).toHaveLength(2);
    expect(course.questionCount).toBe(10);
  });

  it("5. Multiple Courses: resolves to N Courses with their respective Modules", async () => {
    const res = await service.startConfiguredExamAttempt(actor, orgId, {
      sections: [mod1Id, mod3Id],
      questionCount: 10,
    });

    expect(res.coverage).toHaveLength(2);
    const c1 = res.coverage!.find((c) => c.title === "فارماکولوژی ۲");
    const c2 = res.coverage!.find((c) => c.title === "فیزیولوژی پزشکی");

    expect(c1).toBeDefined();
    expect(c1!.modules).toHaveLength(1);
    expect(c1!.modules[0].title).toBe("داروهای کورتیکواستروئیدی");

    expect(c2).toBeDefined();
    expect(c2!.modules).toHaveLength(1);
    expect(c2!.modules[0].title).toBe("فیزیولوژی سیستم غدد");
  });

  it("6. Comprehensive: only returns Courses/Modules that actually have questions in the attempt", async () => {
    const res = await service.startConfiguredExamAttempt(actor, orgId, {
      questionCount: 5,
      difficulty: "all",
    });

    expect(res.coverage).toBeDefined();
    expect(res.coverage!.length).toBeGreaterThan(0);
    for (const c of res.coverage!) {
      expect(c.questionCount).toBeGreaterThan(0);
      expect(c.modules.length).toBeGreaterThan(0);
      for (const m of c.modules) {
        expect(m.questionCount).toBeGreaterThan(0);
      }
    }
  });

  it("7. UUID Regression: strictly no UUID in any course or module title", async () => {
    const res = await service.startConfiguredExamAttempt(actor, orgId, {
      chapters: [les1Id, les3Id],
      questionCount: 5,
    });

    for (const c of res.coverage!) {
      expect(c.title).not.toMatch(UUID_REGEX);
      for (const m of c.modules) {
        expect(m.title).not.toMatch(UUID_REGEX);
      }
    }
    expect(res.topic).not.toMatch(UUID_REGEX);
  });

  it("8. Lesson Regression: strictly no lesson title in coverage", async () => {
    const res = await service.startConfiguredExamAttempt(actor, orgId, {
      chapters: [les1Id, les2Id, les3Id],
      questionCount: 5,
    });

    const coverageJson = JSON.stringify(res.coverage);
    expect(coverageJson).not.toContain("جلسه ۱");
    expect(coverageJson).not.toContain("جلسه ۲");
    expect(coverageJson).not.toContain("جلسه ۳");
    expect(coverageJson).not.toContain("جلسه");
  });

  it("9. Question selection immutability: question selection count and IDs are unaffected by coverage", async () => {
    const res = await service.startConfiguredExamAttempt(actor, orgId, {
      chapters: [les1Id],
      questionCount: 5,
    });

    expect(res.questions).toHaveLength(5);
    // Verify question IDs match the attempt snapshot
    const attempt = await quizAttemptStore.findById(res.attemptId);
    expect(attempt).toBeDefined();
    expect(attempt!.questionIds).toEqual(res.questions.map((q) => q.id));

    // Calling getExamAttempt returns identical coverage
    const retrieved = await service.getExamAttempt(actor, orgId, res.attemptId);
    expect(retrieved.coverage).toEqual(res.coverage);
  });
});
