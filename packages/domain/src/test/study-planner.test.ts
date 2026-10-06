import { describe, expect, it } from "vitest";
import {
  STUDY_TASK_TYPES,
  STUDY_PLAN_STATUSES,
  STUDY_TASK_STATUSES,
  isStudyTaskType,
  isStudyPlanStatus,
  isStudyTaskStatus,
  selectCandidatesForDailyPlan,
  isResourceInExamScope,
  resolveExamUrgencyBudget,
  getExamUrgencyPriorityBoost,
  calculateExamDaysRemaining,
  detectActiveLearningStreams,
  pickBalancedLessonsFromStreams,
  type PlannerCandidate,
  type StreamModuleInput,
  type StreamLessonInput,
  type StreamProgressInput,
} from "../study-planner.js";

describe("Study Planner Domain Primitives", () => {
  it("validates study task types correctly", () => {
    expect(STUDY_TASK_TYPES).toEqual([
      "read_lesson",
      "review_flashcards",
      "take_quiz",
      "review_wrong_answers",
    ]);
    expect(isStudyTaskType("read_lesson")).toBe(true);
    expect(isStudyTaskType("review_flashcards")).toBe(true);
    expect(isStudyTaskType("take_quiz")).toBe(true);
    expect(isStudyTaskType("review_wrong_answers")).toBe(true);
    expect(isStudyTaskType("invalid_type")).toBe(false);
  });

  it("validates plan and task statuses correctly", () => {
    expect(STUDY_PLAN_STATUSES).toEqual(["pending", "in_progress", "completed"]);
    expect(isStudyPlanStatus("in_progress")).toBe(true);
    expect(isStudyPlanStatus("cancelled")).toBe(false);

    expect(STUDY_TASK_STATUSES).toEqual(["pending", "in_progress", "completed", "skipped"]);
    expect(isStudyTaskStatus("completed")).toBe(true);
    expect(isStudyTaskStatus("skipped")).toBe(true);
    expect(isStudyTaskStatus("failed")).toBe(false);
  });
});

describe("Deterministic Daily Capacity & Candidate Selection Engine", () => {
  it("handles empty candidate lists and invalid targets gracefully", () => {
    const emptyResult = selectCandidatesForDailyPlan([], 45);
    expect(emptyResult.selectedCandidates).toEqual([]);
    expect(emptyResult.totalEstimatedMinutes).toBe(0);
    expect(emptyResult.remainingMinutes).toBe(45);
    expect(emptyResult.skippedCandidates).toEqual([]);

    const zeroTargetResult = selectCandidatesForDailyPlan(
      [
        {
          id: "task-1",
          type: "read_lesson",
          title: "درس اول",
          priority: 100,
          estimatedMinutes: 20,
        },
      ],
      0,
    );
    expect(zeroTargetResult.selectedCandidates).toEqual([]);
    expect(zeroTargetResult.totalEstimatedMinutes).toBe(0);
  });

  it("selects candidates within capacity (target = 45, items = 12 + 20 + 10)", () => {
    const candidates: PlannerCandidate[] = [
      {
        id: "c-1",
        type: "review_flashcards",
        title: "مرور فلش‌کارت‌ها",
        priority: 300,
        estimatedMinutes: 12,
      },
      {
        id: "c-2",
        type: "read_lesson",
        title: "مطالعه درس قلب",
        priority: 200,
        estimatedMinutes: 20,
      },
      {
        id: "c-3",
        type: "take_quiz",
        title: "کوییز فیزیولوژی",
        priority: 100,
        estimatedMinutes: 10,
      },
    ];

    const result = selectCandidatesForDailyPlan(candidates, 45);

    expect(result.selectedCandidates.map((c) => c.id)).toEqual(["c-1", "c-2", "c-3"]);
    expect(result.totalEstimatedMinutes).toBe(42);
    expect(result.remainingMinutes).toBe(3);
    expect(result.skippedCandidates).toEqual([]);
  });

  it("prioritizes higher priority candidates over lower ones", () => {
    const candidates: PlannerCandidate[] = [
      {
        id: "low-prio-fit",
        type: "take_quiz",
        title: "کوییز کم‌اهمیت",
        priority: 50,
        estimatedMinutes: 25,
      },
      {
        id: "high-prio-fit",
        type: "review_flashcards",
        title: "فلش‌کارت‌های ضروری",
        priority: 500,
        estimatedMinutes: 25,
      },
      {
        id: "medium-prio-fit",
        type: "read_lesson",
        title: "درس جدید",
        priority: 250,
        estimatedMinutes: 25,
      },
    ];

    // Target = 50 min (can only fit 2 out of 3 tasks of 25 min each)
    const result = selectCandidatesForDailyPlan(candidates, 50);

    expect(result.selectedCandidates.map((c) => c.id)).toEqual([
      "high-prio-fit",
      "medium-prio-fit",
    ]);
    expect(result.skippedCandidates.map((c) => c.id)).toEqual(["low-prio-fit"]);
    expect(result.totalEstimatedMinutes).toBe(50);
    expect(result.remainingMinutes).toBe(0);
  });

  it("handles exact fit capacity (target = 30, tasks = 20 + 10)", () => {
    const candidates: PlannerCandidate[] = [
      {
        id: "task-20",
        type: "read_lesson",
        title: "درس ۲۰ دقیقه‌ای",
        priority: 200,
        estimatedMinutes: 20,
      },
      {
        id: "task-10",
        type: "take_quiz",
        title: "کوییز ۱۰ دقیقه‌ای",
        priority: 100,
        estimatedMinutes: 10,
      },
    ];

    const result = selectCandidatesForDailyPlan(candidates, 30);

    expect(result.selectedCandidates.map((c) => c.id)).toEqual(["task-20", "task-10"]);
    expect(result.totalEstimatedMinutes).toBe(30);
    expect(result.remainingMinutes).toBe(0);
    expect(result.skippedCandidates).toEqual([]);
  });

  it("handles oversized task (45 min with target = 30) deterministically", () => {
    const oversizedCandidate: PlannerCandidate = {
      id: "big-lesson",
      type: "read_lesson",
      title: "درس طولانی آناتومی",
      priority: 1000,
      estimatedMinutes: 45,
    };

    // Default: allowOversizedFirst = true -> selects it as sole initial task
    const resultAllowed = selectCandidatesForDailyPlan([oversizedCandidate], 30, {
      allowOversizedFirst: true,
    });
    expect(resultAllowed.selectedCandidates.map((c) => c.id)).toEqual(["big-lesson"]);
    expect(resultAllowed.totalEstimatedMinutes).toBe(45);
    expect(resultAllowed.remainingMinutes).toBe(0);

    // Strict: allowOversizedFirst = false -> skips oversized task
    const resultDisallowed = selectCandidatesForDailyPlan([oversizedCandidate], 30, {
      allowOversizedFirst: false,
    });
    expect(resultDisallowed.selectedCandidates).toEqual([]);
    expect(resultDisallowed.totalEstimatedMinutes).toBe(0);
    expect(resultDisallowed.skippedCandidates.map((c) => c.id)).toEqual(["big-lesson"]);
  });

  it("skips oversized task when smaller fitting tasks are available in priority order", () => {
    const candidates: PlannerCandidate[] = [
      {
        id: "huge-task",
        type: "read_lesson",
        title: "تسک خیلی بزرگ",
        priority: 500,
        estimatedMinutes: 60,
      },
      {
        id: "small-task-1",
        type: "review_flashcards",
        title: "تسک کوچک ۱",
        priority: 400,
        estimatedMinutes: 15,
      },
      {
        id: "small-task-2",
        type: "take_quiz",
        title: "تسک کوچک ۲",
        priority: 300,
        estimatedMinutes: 15,
      },
    ];

    // If target = 30 and allowOversizedFirst = false
    const result = selectCandidatesForDailyPlan(candidates, 30, {
      allowOversizedFirst: false,
    });

    expect(result.selectedCandidates.map((c) => c.id)).toEqual([
      "small-task-1",
      "small-task-2",
    ]);
    expect(result.totalEstimatedMinutes).toBe(30);
    expect(result.skippedCandidates.map((c) => c.id)).toEqual(["huge-task"]);
  });

  it("deduplicates candidates by ID keeping highest priority", () => {
    const candidates: PlannerCandidate[] = [
      {
        id: "dup-card-1",
        type: "review_flashcards",
        title: "مرور اولیه",
        priority: 100,
        estimatedMinutes: 15,
      },
      {
        id: "dup-card-1",
        type: "review_flashcards",
        title: "مرور به‌روزشده با اولویت بالاتر",
        priority: 500,
        estimatedMinutes: 15,
      },
    ];

    const result = selectCandidatesForDailyPlan(candidates, 45);

    expect(result.selectedCandidates).toHaveLength(1);
    expect(result.selectedCandidates[0].title).toBe("مرور به‌روزشده با اولویت بالاتر");
    expect(result.selectedCandidates[0].priority).toBe(500);
    expect(result.totalEstimatedMinutes).toBe(15);
  });
});

describe("Exam Scope Matching Logic (isResourceInExamScope)", () => {
  it("returns false for empty, null, or undefined exam scopes", () => {
    expect(isResourceInExamScope(null, { moduleId: "m1", lessonId: "l1" })).toBe(false);
    expect(isResourceInExamScope(undefined, { moduleId: "m1", lessonId: "l1" })).toBe(false);
    expect(isResourceInExamScope({}, { moduleId: "m1", lessonId: "l1" })).toBe(false);
    expect(isResourceInExamScope({ moduleIds: [], lessonIds: [] }, { moduleId: "m1", lessonId: "l1" })).toBe(false);
  });

  it("matches module-level scope correctly (covers module and child lessons)", () => {
    const scope = { moduleIds: ["mod-cardio", "mod-neuro"], lessonIds: [] };

    expect(isResourceInExamScope(scope, { moduleId: "mod-cardio" })).toBe(true);
    expect(isResourceInExamScope(scope, { moduleId: "mod-cardio", lessonId: "les-ecg" })).toBe(true);
    expect(isResourceInExamScope(scope, { moduleId: "mod-other", lessonId: "les-ecg" })).toBe(false);
  });

  it("matches lesson-level scope correctly", () => {
    const scope = { moduleIds: [], lessonIds: ["les-heart-1", "les-heart-2"] };

    expect(isResourceInExamScope(scope, { lessonId: "les-heart-1" })).toBe(true);
    expect(isResourceInExamScope(scope, { moduleId: "mod-other", lessonId: "les-heart-2" })).toBe(true);
    expect(isResourceInExamScope(scope, { lessonId: "les-heart-3" })).toBe(false);
    expect(isResourceInExamScope(scope, { moduleId: "mod-other" })).toBe(false);
  });

  it("evaluates union scope correctly when both moduleIds and lessonIds are present", () => {
    const scope = { moduleIds: ["mod-cardio"], lessonIds: ["les-neuro-special"] };

    // Matches via module
    expect(isResourceInExamScope(scope, { moduleId: "mod-cardio", lessonId: "les-cardio-1" })).toBe(true);
    // Matches via lesson
    expect(isResourceInExamScope(scope, { moduleId: "mod-neuro", lessonId: "les-neuro-special" })).toBe(true);
    // Unmatched
    expect(isResourceInExamScope(scope, { moduleId: "mod-neuro", lessonId: "les-neuro-other" })).toBe(false);
  });
});

describe("Exam Urgency & Budget Resolution", () => {
  it("resolves correct budget for critical urgency (< 3 days)", () => {
    const budget0 = resolveExamUrgencyBudget(0);
    expect(budget0.mandatoryMinutes).toBe(300);
    expect(budget0.optionalMinutes).toBe(30);
    expect(budget0.extraPracticeMinutes).toBe(30);
    expect(budget0.totalTargetMinutes).toBe(360);

    const budget2 = resolveExamUrgencyBudget(2);
    expect(budget2.totalTargetMinutes).toBe(360);
    expect(getExamUrgencyPriorityBoost(2)).toBe(800);
    expect(getExamUrgencyPriorityBoost(0)).toBe(800);
  });

  it("resolves correct budget for near urgency (3 <= days < 7)", () => {
    const budget3 = resolveExamUrgencyBudget(3);
    expect(budget3.mandatoryMinutes).toBe(180);
    expect(budget3.optionalMinutes).toBe(30);
    expect(budget3.extraPracticeMinutes).toBe(30);
    expect(budget3.totalTargetMinutes).toBe(240);

    const budget6 = resolveExamUrgencyBudget(6);
    expect(budget6.totalTargetMinutes).toBe(240);
    expect(getExamUrgencyPriorityBoost(3)).toBe(400);
    expect(getExamUrgencyPriorityBoost(6)).toBe(400);
  });

  it("resolves correct budget for normal/distant urgency (>= 7 days)", () => {
    const budget7 = resolveExamUrgencyBudget(7);
    expect(budget7.mandatoryMinutes).toBe(60);
    expect(budget7.optionalMinutes).toBe(30);
    expect(budget7.extraPracticeMinutes).toBe(30);
    expect(budget7.totalTargetMinutes).toBe(120);

    const budget30 = resolveExamUrgencyBudget(30);
    expect(budget30.totalTargetMinutes).toBe(120);
    expect(getExamUrgencyPriorityBoost(7)).toBe(150);
    expect(getExamUrgencyPriorityBoost(30)).toBe(150);
  });

  it("handles null, undefined, and negative days (expired exams) safely", () => {
    expect(resolveExamUrgencyBudget(null)).toEqual(resolveExamUrgencyBudget(10));
    expect(resolveExamUrgencyBudget(undefined)).toEqual(resolveExamUrgencyBudget(10));
    expect(resolveExamUrgencyBudget(-1)).toEqual(resolveExamUrgencyBudget(10));

    expect(getExamUrgencyPriorityBoost(null)).toBe(0);
    expect(getExamUrgencyPriorityBoost(undefined)).toBe(0);
    expect(getExamUrgencyPriorityBoost(-5)).toBe(0);
  });
});

describe("Exam Days Remaining (Timezone-Safe Date Arithmetic)", () => {
  it("calculates exact days remaining deterministically without UTC/local time shift bugs", () => {
    // Reference date: 2026-09-18
    const ref = new Date(2026, 8, 18, 14, 30, 0); // Sep 18, 2026 local

    // Same day (0 days)
    expect(calculateExamDaysRemaining("2026-09-18", ref)).toBe(0);
    expect(calculateExamDaysRemaining("2026-09-18T23:59:59Z", ref)).toBe(0);

    // Tomorrow (1 day)
    expect(calculateExamDaysRemaining("2026-09-19", ref)).toBe(1);

    // 2 days
    expect(calculateExamDaysRemaining("2026-09-20", ref)).toBe(2);

    // 3 days (Near threshold)
    expect(calculateExamDaysRemaining("2026-09-21", ref)).toBe(3);

    // 6 days
    expect(calculateExamDaysRemaining("2026-09-24", ref)).toBe(6);

    // 7 days (Normal threshold)
    expect(calculateExamDaysRemaining("2026-09-25", ref)).toBe(7);

    // Past date (yesterday -> -1)
    expect(calculateExamDaysRemaining("2026-09-17", ref)).toBe(-1);

    // Invalid / Null
    expect(calculateExamDaysRemaining(null, ref)).toBeNull();
    expect(calculateExamDaysRemaining(undefined, ref)).toBeNull();
    expect(calculateExamDaysRemaining("invalid-date", ref)).toBeNull();
  });
});

describe("Category-Aware Capacity Packing", () => {
  it("tags tasks into mandatory, optional, and extra_practice categories based on budget without leakage", () => {
    const budget = {
      mandatoryMinutes: 40,
      optionalMinutes: 20,
      extraPracticeMinutes: 20,
      totalTargetMinutes: 80,
    };

    const candidates: PlannerCandidate[] = [
      { id: "c1", type: "read_lesson", title: "درس اول", priority: 500, estimatedMinutes: 20 },
      { id: "c2", type: "read_lesson", title: "درس دوم", priority: 400, estimatedMinutes: 20 },
      { id: "c3", type: "take_quiz", title: "کوییز اول", priority: 300, estimatedMinutes: 20 },
      { id: "c4", type: "review_flashcards", title: "فلش‌کارت", priority: 200, estimatedMinutes: 20 },
    ];

    const result = selectCandidatesForDailyPlan(candidates, 80, { budget });

    expect(result.selectedCandidates).toHaveLength(4);
    expect(result.selectedCandidates[0].id).toBe("c1");
    expect(result.selectedCandidates[0].metadata?.category).toBe("mandatory"); // 0..20 <= 40

    expect(result.selectedCandidates[1].id).toBe("c2");
    expect(result.selectedCandidates[1].metadata?.category).toBe("mandatory"); // 20..40 <= 40

    expect(result.selectedCandidates[2].id).toBe("c3");
    expect(result.selectedCandidates[2].metadata?.category).toBe("optional"); // 40..60 <= 60

    expect(result.selectedCandidates[3].id).toBe("c4");
    expect(result.selectedCandidates[3].metadata?.category).toBe("extra_practice"); // 60..80 > 60
  });

  it("does not create dummy tasks when available candidate pool is smaller than budget", () => {
    const budget = {
      mandatoryMinutes: 300,
      optionalMinutes: 30,
      extraPracticeMinutes: 30,
      totalTargetMinutes: 360,
    };

    const candidates: PlannerCandidate[] = [
      { id: "c1", type: "read_lesson", title: "درس اول", priority: 500, estimatedMinutes: 20 },
    ];

    const result = selectCandidatesForDailyPlan(candidates, 360, { budget });
    expect(result.selectedCandidates).toHaveLength(1);
    expect(result.totalEstimatedMinutes).toBe(20);
  });
});

describe("Active Learning Streams Domain Engine", () => {
  const courseId = "course-math-101";

  // Helper to generate 15 mock modules for course
  const createCourseModules = (count = 15): StreamModuleInput[] =>
    Array.from({ length: count }, (_, idx) => ({
      id: `mod-${idx + 1}`,
      courseId,
      title: `فصل ${idx + 1}`,
      sortOrder: (idx + 1) * 10,
    }));

  // Helper to generate 2 lessons per module
  const createLessonsForModules = (
    modules: StreamModuleInput[],
    lessonsPerModule = 2,
  ): StreamLessonInput[] =>
    modules.flatMap((m) =>
      Array.from({ length: lessonsPerModule }, (_, lIdx) => ({
        id: `lesson-${m.id}-${lIdx + 1}`,
        moduleId: m.id,
        title: `درس ${lIdx + 1} از ${m.title}`,
        sortOrder: lIdx + 1,
        publicationStatus: "published",
        estimatedMinutes: 20,
      })),
    );

  it("Scenario 1: No learning starts -> returns empty streams array", () => {
    const modules = createCourseModules(10);
    const lessons = createLessonsForModules(modules);
    const progress: StreamProgressInput[] = [];

    const streams = detectActiveLearningStreams({
      courseId,
      modules,
      lessons,
      progressRecords: progress,
    });

    expect(streams).toEqual([]);
  });

  it("Scenario 2: Chapter 6 Started -> single stream [mod-6], frontier = mod-6, next lesson = lesson 2", () => {
    const modules = createCourseModules(12);
    const lessons = createLessonsForModules(modules);

    // Only lesson 1 of module 6 is completed
    const progress: StreamProgressInput[] = [
      {
        lessonId: "lesson-mod-6-1",
        completed: true,
        completedAt: "2026-10-01T10:00:00.000Z",
      },
    ];

    const streams = detectActiveLearningStreams({
      courseId,
      modules,
      lessons,
      progressRecords: progress,
    });

    expect(streams).toHaveLength(1);
    const stream = streams[0];
    expect(stream.moduleIds).toEqual(["mod-6"]);
    expect(stream.headModuleId).toBe("mod-6");
    expect(stream.frontierModuleId).toBe("mod-6");
    expect(stream.learningStartAt).toBe("2026-10-01T10:00:00.000Z");
    expect(stream.lastActivityAt).toBe("2026-10-01T10:00:00.000Z");
    expect(stream.isCompleted).toBe(false);

    // Next lesson should be lesson 2 of module 6
    expect(stream.nextLessons).toHaveLength(1);
    expect(stream.nextLessons[0].id).toBe("lesson-mod-6-2");
  });

  it("Scenario 3: Contiguous chapters 6, 7, 8 started -> single stream [mod-6, mod-7, mod-8]", () => {
    const modules = createCourseModules(12);
    const lessons = createLessonsForModules(modules);

    const progress: StreamProgressInput[] = [
      { lessonId: "lesson-mod-6-1", completed: true, completedAt: "2026-10-01T10:00:00.000Z" },
      { lessonId: "lesson-mod-6-2", completed: true, completedAt: "2026-10-02T10:00:00.000Z" },
      { lessonId: "lesson-mod-7-1", completed: true, completedAt: "2026-10-03T10:00:00.000Z" },
      { lessonId: "lesson-mod-8-1", completed: true, completedAt: "2026-10-04T10:00:00.000Z" },
    ];

    const streams = detectActiveLearningStreams({
      courseId,
      modules,
      lessons,
      progressRecords: progress,
    });

    expect(streams).toHaveLength(1);
    const stream = streams[0];
    expect(stream.moduleIds).toEqual(["mod-6", "mod-7", "mod-8"]);
    expect(stream.headModuleId).toBe("mod-8");
    expect(stream.frontierModuleId).toBe("mod-8");
    expect(stream.learningStartAt).toBe("2026-10-01T10:00:00.000Z");
    expect(stream.lastActivityAt).toBe("2026-10-04T10:00:00.000Z");
    expect(stream.nextLessons.map((l) => l.id)).toEqual(["lesson-mod-8-2"]);
  });

  it("Scenario 4: Disjoint chapters 6 and 12 started -> two separate streams [mod-6] and [mod-12]", () => {
    const modules = createCourseModules(15);
    const lessons = createLessonsForModules(modules);

    const progress: StreamProgressInput[] = [
      { lessonId: "lesson-mod-6-1", completed: true, completedAt: "2026-10-01T10:00:00.000Z" },
      { lessonId: "lesson-mod-12-1", completed: true, completedAt: "2026-10-05T12:00:00.000Z" },
    ];

    const streams = detectActiveLearningStreams({
      courseId,
      modules,
      lessons,
      progressRecords: progress,
    });

    expect(streams).toHaveLength(2);

    // Stream 12 has fresher activity (Oct 5 > Oct 1) -> ranked first
    expect(streams[0].moduleIds).toEqual(["mod-12"]);
    expect(streams[0].frontierModuleId).toBe("mod-12");
    expect(streams[0].lastActivityAt).toBe("2026-10-05T12:00:00.000Z");

    // Stream 6 ranked second
    expect(streams[1].moduleIds).toEqual(["mod-6"]);
    expect(streams[1].frontierModuleId).toBe("mod-6");
    expect(streams[1].lastActivityAt).toBe("2026-10-01T10:00:00.000Z");
  });

  it("Scenario 5: Temporal order 6 -> 12 -> 7 -> clusters deterministically to [mod-6, mod-7] and [mod-12]", () => {
    const modules = createCourseModules(15);
    const lessons = createLessonsForModules(modules);

    // User started mod-6 on Oct 1, mod-12 on Oct 2, mod-7 on Oct 3
    const progress: StreamProgressInput[] = [
      { lessonId: "lesson-mod-6-1", completed: true, completedAt: "2026-10-01T10:00:00.000Z" },
      { lessonId: "lesson-mod-12-1", completed: true, completedAt: "2026-10-02T10:00:00.000Z" },
      { lessonId: "lesson-mod-7-1", completed: true, completedAt: "2026-10-03T10:00:00.000Z" },
    ];

    const streams = detectActiveLearningStreams({
      courseId,
      modules,
      lessons,
      progressRecords: progress,
    });

    expect(streams).toHaveLength(2);

    // Stream [6, 7] has latest activity Oct 3 -> ranked first
    expect(streams[0].moduleIds).toEqual(["mod-6", "mod-7"]);
    expect(streams[0].headModuleId).toBe("mod-7");
    expect(streams[0].lastActivityAt).toBe("2026-10-03T10:00:00.000Z");

    // Stream [12] has latest activity Oct 2 -> ranked second
    expect(streams[1].moduleIds).toEqual(["mod-12"]);
    expect(streams[1].headModuleId).toBe("mod-12");
    expect(streams[1].lastActivityAt).toBe("2026-10-02T10:00:00.000Z");
  });

  it("Scenario 6: Complete chapter 6 while 7 is unstarted -> frontier advances to 7, but 7 is NOT in startedModules", () => {
    const modules = createCourseModules(10);
    const lessons = createLessonsForModules(modules);

    // All lessons of module 6 completed; module 7 has NO completion
    const progress: StreamProgressInput[] = [
      { lessonId: "lesson-mod-6-1", completed: true, completedAt: "2026-10-01T10:00:00.000Z" },
      { lessonId: "lesson-mod-6-2", completed: true, completedAt: "2026-10-02T10:00:00.000Z" },
    ];

    const streams = detectActiveLearningStreams({
      courseId,
      modules,
      lessons,
      progressRecords: progress,
    });

    expect(streams).toHaveLength(1);
    const stream = streams[0];

    // Explicit Rule 3 check: Started modules contains ONLY 6
    expect(stream.moduleIds).toEqual(["mod-6"]);
    expect(stream.headModuleId).toBe("mod-6");
    expect(stream.moduleIds).not.toContain("mod-7");

    // Frontier has advanced to mod-7
    expect(stream.frontierModuleId).toBe("mod-7");

    // Candidates come from mod-7's uncompleted lessons
    expect(stream.nextLessons.map((l) => l.id)).toEqual([
      "lesson-mod-7-1",
      "lesson-mod-7-2",
    ]);

    // Frontier module 7 does NOT contaminate learningStartAt
    expect(stream.learningStartAt).toBe("2026-10-01T10:00:00.000Z");
    expect(stream.lastActivityAt).toBe("2026-10-02T10:00:00.000Z");
  });

  it("Scenario 7: Complete 6 and then actually complete lesson 1 of 7 -> 7 officially becomes started", () => {
    const modules = createCourseModules(10);
    const lessons = createLessonsForModules(modules);

    // All lessons of 6 + lesson 1 of 7
    const progress: StreamProgressInput[] = [
      { lessonId: "lesson-mod-6-1", completed: true, completedAt: "2026-10-01T10:00:00.000Z" },
      { lessonId: "lesson-mod-6-2", completed: true, completedAt: "2026-10-02T10:00:00.000Z" },
      { lessonId: "lesson-mod-7-1", completed: true, completedAt: "2026-10-03T10:00:00.000Z" },
    ];

    const streams = detectActiveLearningStreams({
      courseId,
      modules,
      lessons,
      progressRecords: progress,
    });

    expect(streams).toHaveLength(1);
    const stream = streams[0];

    // Now moduleIds officially contains both 6 and 7
    expect(stream.moduleIds).toEqual(["mod-6", "mod-7"]);
    expect(stream.headModuleId).toBe("mod-7");
    expect(stream.frontierModuleId).toBe("mod-7");
    expect(stream.nextLessons.map((l) => l.id)).toEqual(["lesson-mod-7-2"]);
    expect(stream.lastActivityAt).toBe("2026-10-03T10:00:00.000Z");
  });

  it("Scenario 8: Round-Robin balanced selection between two active streams", () => {
    const modules = createCourseModules(15);
    const lessons = createLessonsForModules(modules, 3); // 3 lessons per module

    // Stream A starts on mod-6 (fresher: Oct 5), Stream B starts on mod-12 (Oct 1)
    const progress: StreamProgressInput[] = [
      { lessonId: "lesson-mod-6-1", completed: true, completedAt: "2026-10-05T10:00:00.000Z" },
      { lessonId: "lesson-mod-12-1", completed: true, completedAt: "2026-10-01T10:00:00.000Z" },
    ];

    const streams = detectActiveLearningStreams({
      courseId,
      modules,
      lessons,
      progressRecords: progress,
    });

    expect(streams).toHaveLength(2);
    expect(streams[0].headModuleId).toBe("mod-6"); // Fresher
    expect(streams[1].headModuleId).toBe("mod-12");

    // Balanced pick with capacity = 4
    const picked = pickBalancedLessonsFromStreams(streams, { maxLessons: 4 });

    // Stream A has [lesson-mod-6-2, lesson-mod-6-3]
    // Stream B has [lesson-mod-12-2, lesson-mod-12-3]
    // Round-robin result: A1 -> B1 -> A2 -> B2
    expect(picked.map((l) => l.id)).toEqual([
      "lesson-mod-6-2",
      "lesson-mod-12-2",
      "lesson-mod-6-3",
      "lesson-mod-12-3",
    ]);
  });

  it("Scenario 9 & 10: Idempotency & Repeated completion does not corrupt learningStartAt", () => {
    const modules = createCourseModules(5);
    const lessons = createLessonsForModules(modules);

    // Repeated/duplicate completion entries for the same lesson
    const progress: StreamProgressInput[] = [
      { lessonId: "lesson-mod-2-1", completed: true, completedAt: "2026-10-01T10:00:00.000Z" },
      { lessonId: "lesson-mod-2-1", completed: true, completedAt: "2026-10-03T15:00:00.000Z" }, // repeated later
    ];

    const streams = detectActiveLearningStreams({
      courseId,
      modules,
      lessons,
      progressRecords: progress,
    });

    expect(streams).toHaveLength(1);
    // Preserves earliest timestamp
    expect(streams[0].learningStartAt).toBe("2026-10-01T10:00:00.000Z");
  });

  it("Scenario 11 & 12: Drawer open / study session without completion has zero effect", () => {
    const modules = createCourseModules(5);
    const lessons = createLessonsForModules(modules);

    // Uncompleted record (e.g. passive view or uncompleted progress)
    const progress: StreamProgressInput[] = [
      { lessonId: "lesson-mod-2-1", completed: false, completedAt: null },
    ];

    const streams = detectActiveLearningStreams({
      courseId,
      modules,
      lessons,
      progressRecords: progress,
    });

    expect(streams).toEqual([]);
  });

  it("Scenario 15: Course completion -> stream marked completed and produces no next lessons", () => {
    const modules = createCourseModules(2); // Only 2 modules in entire course
    const lessons = createLessonsForModules(modules, 1); // 1 lesson each

    const progress: StreamProgressInput[] = [
      { lessonId: "lesson-mod-1-1", completed: true, completedAt: "2026-10-01T10:00:00.000Z" },
      { lessonId: "lesson-mod-2-1", completed: true, completedAt: "2026-10-02T10:00:00.000Z" },
    ];

    const streams = detectActiveLearningStreams({
      courseId,
      modules,
      lessons,
      progressRecords: progress,
    });

    expect(streams).toHaveLength(1);
    expect(streams[0].isCompleted).toBe(true);
    expect(streams[0].nextLessons).toEqual([]);
  });

  it("Scenario 16: Module Edge Cases (unpublished lesson, deleted module, invalid completedAt)", () => {
    const modules: StreamModuleInput[] = [
      { id: "mod-empty", courseId, sortOrder: 10 },
      { id: "mod-deleted", courseId, sortOrder: 20, deletedAt: "2026-09-01T00:00:00.000Z" },
      { id: "mod-valid", courseId, sortOrder: 30 },
    ];

    const lessons: StreamLessonInput[] = [
      // Draft/unpublished lesson in mod-empty with completion
      {
        id: "lesson-draft",
        moduleId: "mod-empty",
        title: "درس پیش‌نویس",
        sortOrder: 1,
        publicationStatus: "draft",
      },
      // Valid published lesson in mod-valid
      {
        id: "lesson-valid-1",
        moduleId: "mod-valid",
        title: "درس معتبر ۱",
        sortOrder: 1,
        publicationStatus: "published",
      },
      {
        id: "lesson-valid-2",
        moduleId: "mod-valid",
        title: "درس معتبر ۲",
        sortOrder: 2,
        publicationStatus: "published",
      },
    ];

    const progress: StreamProgressInput[] = [
      // Completion for draft lesson must be ignored
      { lessonId: "lesson-draft", completed: true, completedAt: "2026-10-01T10:00:00.000Z" },
      // Completion with invalid timestamp string
      { lessonId: "lesson-valid-1", completed: true, completedAt: "invalid-date-string" },
    ];

    const streams = detectActiveLearningStreams({
      courseId,
      modules,
      lessons,
      progressRecords: progress,
    });

    // mod-empty is NOT started because it has no completed published lessons
    expect(streams).toHaveLength(1);
    expect(streams[0].moduleIds).toEqual(["mod-valid"]);
    expect(streams[0].frontierModuleId).toBe("mod-valid");
    expect(streams[0].nextLessons.map((l) => l.id)).toEqual(["lesson-valid-2"]);
  });
});
