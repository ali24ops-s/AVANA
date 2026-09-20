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
  type PlannerCandidate,
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


