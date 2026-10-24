import { describe, expect, it, beforeEach } from "vitest";
import { orderModulesByCurriculum } from "../modules/learning/curriculum-ordering.js";
import type { ModuleRecord, SubCourseGroupRecord } from "../modules/learning/learning-store.js";
import { StudyService } from "../modules/study/study-service.js";
import {
  InMemoryCourseStore,
} from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
  InMemorySubCourseGroupStore,
} from "../modules/learning/test/in-memory-stores.js";
import {
  InMemoryQuizStore,
  InMemoryQuizQuestionStore,
  InMemoryQuizAttemptStore,
  InMemoryFlashcardStore,
  InMemoryFlashcardReviewStore,
  InMemoryUserFlashcardScheduleStore,
} from "../modules/study/test/in-memory-stores.js";
import type { CourseId, OrganizationId, UserId, QuizQuestionId } from "@avana/domain";

describe("orderModulesByCurriculum", () => {
  const groups: SubCourseGroupRecord[] = [
    {
      id: "grp-1",
      courseId: "course-1",
      title: "Group 1 (First)",
      sortOrder: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "grp-2",
      courseId: "course-1",
      title: "Group 2 (Second)",
      sortOrder: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it("sorts modules by group sortOrder first, then module sortOrder within each group", () => {
    const modules: ModuleRecord[] = [
      {
        id: "mod-g2-m1",
        courseId: "course-1",
        subCourseGroupId: "grp-2",
        title: "Group 2 Module 1",
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "mod-g1-m2",
        courseId: "course-1",
        subCourseGroupId: "grp-1",
        title: "Group 1 Module 2",
        sortOrder: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "mod-g1-m1",
        courseId: "course-1",
        subCourseGroupId: "grp-1",
        title: "Group 1 Module 1",
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const sorted = orderModulesByCurriculum(modules, groups);
    expect(sorted.map((m) => m.id)).toEqual([
      "mod-g1-m1",
      "mod-g1-m2",
      "mod-g2-m1",
    ]);
  });

  it("places ungrouped modules after grouped modules, sorted by module sortOrder", () => {
    const modules: ModuleRecord[] = [
      {
        id: "mod-ungrouped-2",
        courseId: "course-1",
        subCourseGroupId: undefined,
        title: "Ungrouped 2",
        sortOrder: 10,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "mod-g1-m1",
        courseId: "course-1",
        subCourseGroupId: "grp-1",
        title: "Group 1 Module 1",
        sortOrder: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "mod-ungrouped-1",
        courseId: "course-1",
        subCourseGroupId: undefined,
        title: "Ungrouped 1",
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const sorted = orderModulesByCurriculum(modules, groups);
    expect(sorted.map((m) => m.id)).toEqual([
      "mod-g1-m1",
      "mod-ungrouped-1",
      "mod-ungrouped-2",
    ]);
  });

  it("places synthetic and unassigned modules at the very end", () => {
    const modules: ModuleRecord[] = [
      {
        id: "mod-unassigned",
        courseId: "course-1",
        title: "سایر سرفصل‌ها",
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "mod-normal",
        courseId: "course-1",
        subCourseGroupId: "grp-1",
        title: "Normal Module",
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const sorted = orderModulesByCurriculum(modules, groups);
    expect(sorted.map((m) => m.id)).toEqual(["mod-normal", "mod-unassigned"]);
  });

  it("breaks ties by title and id deterministically", () => {
    const modules: ModuleRecord[] = [
      {
        id: "mod-b",
        courseId: "course-1",
        title: "Beta",
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "mod-a",
        courseId: "course-1",
        title: "Alpha",
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const sorted = orderModulesByCurriculum(modules, []);
    expect(sorted.map((m) => m.id)).toEqual(["mod-a", "mod-b"]);
  });
});

describe("StudyService.getExamTopicSummary curriculum ordering", () => {
  let courseStore: InMemoryCourseStore;
  let moduleStore: InMemoryModuleStore;
  let lessonStore: InMemoryLessonStore;
  let progressStore: InMemoryProgressStore;
  let quizStore: InMemoryQuizStore;
  let quizQuestionStore: InMemoryQuizQuestionStore;
  let quizAttemptStore: InMemoryQuizAttemptStore;
  let flashcardStore: InMemoryFlashcardStore;
  let flashcardReviewStore: InMemoryFlashcardReviewStore;
  let userFlashcardScheduleStore: InMemoryUserFlashcardScheduleStore;
  let subCourseGroupStore: InMemorySubCourseGroupStore;
  let studyService: StudyService;

  const orgId = "org-test" as OrganizationId;
  const userId = "usr-test" as UserId;
  const courseId = "course-math" as CourseId;

  beforeEach(async () => {
    courseStore = new InMemoryCourseStore();
    moduleStore = new InMemoryModuleStore();
    lessonStore = new InMemoryLessonStore();
    progressStore = new InMemoryProgressStore();
    quizStore = new InMemoryQuizStore();
    quizQuestionStore = new InMemoryQuizQuestionStore();
    quizAttemptStore = new InMemoryQuizAttemptStore();
    flashcardStore = new InMemoryFlashcardStore();
    flashcardReviewStore = new InMemoryFlashcardReviewStore();
    userFlashcardScheduleStore = new InMemoryUserFlashcardScheduleStore();
    subCourseGroupStore = new InMemorySubCourseGroupStore();

    studyService = new StudyService(
      flashcardStore, // 1
      flashcardReviewStore, // 2
      quizStore, // 3
      quizQuestionStore, // 4
      quizAttemptStore, // 5
      moduleStore, // 6
      lessonStore, // 7
      progressStore, // 8
      { can: () => true } as any, // 9 policy
      undefined, // 10 auditService
      undefined, // 11 organizationStore
      userFlashcardScheduleStore, // 12
      courseStore, // 13
      undefined, // 14 systemOrg
      undefined, // 15 studySessionStore
      undefined, // 16 flashcardStudySessionStore
      undefined, // 17 entitlementService
      subCourseGroupStore, // 18 subCourseGroupStore
    );

    // Setup Course
    await courseStore.create({
      course: {
        id: courseId,
        organizationId: orgId,
        title: "ریاضی آزمون",
        description: "تست",
        status: "published",
        isPublished: true,
        sortOrder: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      },
      auditEvents: [],
    });

    const now = new Date();
    // Setup Groups (Group 1 sortOrder 10, Group 2 sortOrder 20)
    await subCourseGroupStore.create({
      id: "grp-1",
      courseId,
      title: "فصل اول: حسابان",
      sortOrder: 10,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await subCourseGroupStore.create({
      id: "grp-2",
      courseId,
      title: "فصل دوم: هندسه",
      sortOrder: 20,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Modules: Notice mod-geo sortOrder is 1, but its group (grp-2) has sortOrder 20.
    // mod-calc-2 sortOrder is 2, group 1.
    // mod-calc-1 sortOrder is 1, group 1.
    await moduleStore.create({
      id: "mod-geo",
      courseId,
      subCourseGroupId: "grp-2",
      title: "هندسه تحلیلی",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await moduleStore.create({
      id: "mod-calc-2",
      courseId,
      subCourseGroupId: "grp-1",
      title: "مشتق",
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    await moduleStore.create({
      id: "mod-calc-1",
      courseId,
      subCourseGroupId: "grp-1",
      title: "حد و پیوستگی",
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Create a quiz record
    await quizStore.create({
      id: "quiz-temp" as any,
      organizationId: orgId,
      courseId,
      title: "آزمون آزمایشی",
      status: "published",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      deletedAt: null,
    });

    // Create a lesson and a quiz question for each module so questionCount > 0
    for (const modId of ["mod-geo", "mod-calc-2", "mod-calc-1"]) {
      const lessonId = `les-${modId}`;
      await lessonStore.create({
        id: lessonId,
        moduleId: modId,
        title: `درس ${modId}`,
        sortOrder: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

      // Add a quiz question linked to this lesson
      quizQuestionStore.insert({
        id: `q-${modId}` as QuizQuestionId,
        quizId: "quiz-temp" as any,
        generatedContentId: null,
        lessonId,
        question: `سوال برای ${modId}`,
        questionType: "multiple_choice",
        choices: ["الف", "ب"],
        correctAnswer: "الف",
        explanation: null,
        sortOrder: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    }
  });

  it("returns modules in exact curriculum order (group sortOrder first, then module sortOrder) with sortOrder exposed", async () => {
    const summary = await studyService.getExamTopicSummary({ userId } as any, orgId);
    expect(summary.courses).toHaveLength(1);

    const mathCourse = summary.courses[0];
    expect(mathCourse.courseId).toBe(courseId);
    expect(mathCourse.modules).toBeDefined();

    // Group 1 comes before Group 2, regardless of internal module sort_order!
    // mod-calc-1 (grp 1, sort 1), mod-calc-2 (grp 1, sort 2), mod-geo (grp 2, sort 1)
    const moduleIds = mathCourse.modules?.map((m) => m.moduleId);
    expect(moduleIds).toEqual(["mod-calc-1", "mod-calc-2", "mod-geo"]);

    // Verify sortOrder is included in response
    const calc1 = mathCourse.modules?.find((m) => m.moduleId === "mod-calc-1");
    expect(calc1?.sortOrder).toBe(1);
  });
});
