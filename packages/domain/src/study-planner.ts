/**
 * Daily Study Planner domain primitives and deterministic capacity engine.
 *
 * Pure, framework-independent types and algorithms for:
 * - Daily Study Plan & Study Task models
 * - Task types: read_lesson, review_flashcards, take_quiz, review_wrong_answers
 * - Pure candidate ranking and capacity packing algorithm
 * - 100% deterministic, zero AI/external dependency
 */

// ---------------------------------------------------------------------------
// Task & Plan Types and Status Enums
// ---------------------------------------------------------------------------

export type StudyTaskType =
  | "read_lesson"
  | "review_flashcards"
  | "take_quiz"
  | "review_wrong_answers";

export const STUDY_TASK_TYPES: readonly StudyTaskType[] = [
  "read_lesson",
  "review_flashcards",
  "take_quiz",
  "review_wrong_answers",
] as const;

export function isStudyTaskType(value: string): value is StudyTaskType {
  return (STUDY_TASK_TYPES as readonly string[]).includes(value);
}

export type StudyPlanStatus = "pending" | "in_progress" | "completed";

export const STUDY_PLAN_STATUSES: readonly StudyPlanStatus[] = [
  "pending",
  "in_progress",
  "completed",
] as const;

export function isStudyPlanStatus(value: string): value is StudyPlanStatus {
  return (STUDY_PLAN_STATUSES as readonly string[]).includes(value);
}

export type StudyTaskStatus = "pending" | "in_progress" | "completed" | "skipped";

export const STUDY_TASK_STATUSES: readonly StudyTaskStatus[] = [
  "pending",
  "in_progress",
  "completed",
  "skipped",
] as const;

export function isStudyTaskStatus(value: string): value is StudyTaskStatus {
  return (STUDY_TASK_STATUSES as readonly string[]).includes(value);
}

export type StudyTaskCategory = "mandatory" | "optional" | "extra_practice";

export const STUDY_TASK_CATEGORIES: readonly StudyTaskCategory[] = [
  "mandatory",
  "optional",
  "extra_practice",
] as const;

export function isStudyTaskCategory(value: string): value is StudyTaskCategory {
  return (STUDY_TASK_CATEGORIES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Exam Scope & Time Budget Configurations
// ---------------------------------------------------------------------------

export interface ExamScope {
  moduleIds?: string[];
  lessonIds?: string[];
}

export interface ExamPlannerBudget {
  mandatoryMinutes: number;
  optionalMinutes: number;
  extraPracticeMinutes: number;
  totalTargetMinutes: number;
}

export const EXAM_PLANNER_CONFIG = {
  NORMAL_BUDGET: {
    mandatoryMinutes: 60,
    optionalMinutes: 30,
    extraPracticeMinutes: 30,
    totalTargetMinutes: 120,
  },
  NEAR_BUDGET: {
    // 3 <= daysUntilExam < 7
    mandatoryMinutes: 180,
    optionalMinutes: 30,
    extraPracticeMinutes: 30,
    totalTargetMinutes: 240,
  },
  CRITICAL_BUDGET: {
    // daysUntilExam < 3
    mandatoryMinutes: 300,
    optionalMinutes: 30,
    extraPracticeMinutes: 30,
    totalTargetMinutes: 360,
  },
  PRIORITY_BOOST: {
    CRITICAL: 800, // < 3 days
    NEAR: 400, // 3 <= days < 7
    FAR: 150, // >= 7 days
  },
} as const;

/**
 * Deterministically calculates calendar days remaining until an exam date (safe across all timezones).
 *
 * Rules:
 * - Returns null for null/empty/invalid input.
 * - Negative numbers indicate past/expired exams.
 * - 0 indicates today.
 * - 1 indicates tomorrow, etc.
 */
export function calculateExamDaysRemaining(
  examDateStr: string | null | undefined,
  referenceDate: Date = new Date(),
): number | null {
  if (!examDateStr) return null;

  const match = examDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    const parsed = new Date(examDateStr);
    if (isNaN(parsed.getTime())) return null;
    const refMidnight = Date.UTC(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate(),
    );
    const examMidnight = Date.UTC(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate(),
    );
    return Math.round((examMidnight - refMidnight) / 86400000);
  }

  const examYear = parseInt(match[1], 10);
  const examMonth = parseInt(match[2], 10) - 1;
  const examDay = parseInt(match[3], 10);

  const refMidnight = Date.UTC(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  const examMidnight = Date.UTC(examYear, examMonth, examDay);

  return Math.round((examMidnight - refMidnight) / 86400000);
}

/**
 * Resolves the deterministic daily study time budget based on the nearest upcoming exam.
 *
 * Rules:
 * - daysUntilExam >= 7 or null/undefined -> 60 min mandatory, 30 min optional, 30 min extra (total 120 min)
 * - 3 <= daysUntilExam < 7 -> 180 min mandatory, 30 min optional, 30 min extra (total 240 min)
 * - daysUntilExam < 3 -> 300 min mandatory, 30 min optional, 30 min extra (total 360 min)
 */
export function resolveExamUrgencyBudget(
  daysUntilExam: number | null | undefined,
): ExamPlannerBudget {
  if (daysUntilExam === null || daysUntilExam === undefined || daysUntilExam < 0) {
    return { ...EXAM_PLANNER_CONFIG.NORMAL_BUDGET };
  }
  if (daysUntilExam < 3) {
    return { ...EXAM_PLANNER_CONFIG.CRITICAL_BUDGET };
  }
  if (daysUntilExam < 7) {
    return { ...EXAM_PLANNER_CONFIG.NEAR_BUDGET };
  }
  return { ...EXAM_PLANNER_CONFIG.NORMAL_BUDGET };
}

/**
 * Returns the deterministic priority boost for candidates in an active upcoming exam scope.
 */
export function getExamUrgencyPriorityBoost(
  daysUntilExam: number | null | undefined,
): number {
  if (daysUntilExam === null || daysUntilExam === undefined || daysUntilExam < 0) {
    return 0;
  }
  if (daysUntilExam < 3) {
    return EXAM_PLANNER_CONFIG.PRIORITY_BOOST.CRITICAL;
  }
  if (daysUntilExam < 7) {
    return EXAM_PLANNER_CONFIG.PRIORITY_BOOST.NEAR;
  }
  return EXAM_PLANNER_CONFIG.PRIORITY_BOOST.FAR;
}

/**
 * Determines whether a given resource (module or lesson) falls within an exam's scope.
 *
 * Rules:
 * - If scope is empty/null/undefined -> false
 * - If module matches scope.moduleIds -> true (covers module and implicitly all lessons under it)
 * - If lesson matches scope.lessonIds -> true
 * - If both moduleIds and lessonIds exist -> UNION (either matching returns true)
 */
export function isResourceInExamScope(
  scope: ExamScope | null | undefined,
  resource: { moduleId?: string | null; lessonId?: string | null },
): boolean {
  if (!scope) return false;
  const hasModules = Array.isArray(scope.moduleIds) && scope.moduleIds.length > 0;
  const hasLessons = Array.isArray(scope.lessonIds) && scope.lessonIds.length > 0;
  if (!hasModules && !hasLessons) return false;

  if (resource.moduleId && hasModules && scope.moduleIds!.includes(resource.moduleId)) {
    return true;
  }

  if (resource.lessonId && hasLessons && scope.lessonIds!.includes(resource.lessonId)) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Default Configurations
// ---------------------------------------------------------------------------

export const STUDY_PLANNER_CONFIG = {
  DEFAULT_TARGET_MINUTES: 120,
  MIN_TARGET_MINUTES: 10,
  MAX_TARGET_MINUTES: 360,
  DEFAULT_LESSON_MINUTES: 20,
  DEFAULT_FLASHCARD_MINUTES: 15,
  DEFAULT_QUIZ_MINUTES: 15,
  DEFAULT_WRONG_ANSWERS_MINUTES: 15,
} as const;

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

export interface DailyStudyPlan {
  id: string;
  userId: string;
  planDate: string; // Calendar date in format YYYY-MM-DD
  status: StudyPlanStatus;
  targetDurationMinutes: number;
  completedDurationMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface StudyTaskMetadata {
  category?: StudyTaskCategory;
  isExamRelated?: boolean;
  examDaysRemaining?: number;
  examCourseName?: string;
  dueCount?: number;
  isPartiallyStudied?: boolean;
  isTargetedReview?: boolean;
  isNewLearning?: boolean;
  learningStage?: string;
  courseName?: string;
  quizTitle?: string;
  lastScore?: number;
  chapterNumbers?: number[];
  [key: string]: unknown;
}

export interface StudyTask {
  id: string;
  planId: string;
  userId: string;
  taskType: StudyTaskType;
  status: StudyTaskStatus;
  title: string;
  description?: string | null;
  courseId?: string | null;
  moduleId?: string | null;
  lessonId?: string | null;
  quizId?: string | null;
  priority: number;
  estimatedMinutes: number;
  completedAt?: string | null;
  metadata?: StudyTaskMetadata;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Planner Candidate Model
// ---------------------------------------------------------------------------

export interface PlannerCandidate {
  id: string;
  type: StudyTaskType;
  title: string;
  description?: string;
  priority: number; // Higher number = higher priority
  estimatedMinutes: number;
  courseId?: string | null;
  moduleId?: string | null;
  lessonId?: string | null;
  quizId?: string | null;
  metadata?: StudyTaskMetadata;
}

export interface DailyCapacityResult {
  selectedCandidates: PlannerCandidate[];
  totalEstimatedMinutes: number;
  targetMinutes: number;
  remainingMinutes: number;
  skippedCandidates: PlannerCandidate[];
}

export interface CapacitySelectionOptions {
  /**
   * If true (default), allows selecting a single oversized candidate
   * if the candidate pool has no other items that fit when selectedCandidates is empty.
   */
  allowOversizedFirst?: boolean;
  /**
   * Optional budget for splitting packed tasks into mandatory / optional / extra_practice categories.
   */
  budget?: ExamPlannerBudget;
}

// ---------------------------------------------------------------------------
// Pure Deterministic Capacity & Packing Engine
// ---------------------------------------------------------------------------

/**
 * Selects and packs planner candidates into a daily study plan based on target duration.
 *
 * Algorithm Rules (100% Deterministic):
 * 1. Sanitization: Filters out invalid candidates (estimatedMinutes <= 0).
 * 2. Deduplication: Keeps first occurrence of unique candidate ID or resource key with highest priority.
 * 3. Sorting & Ranking:
 *    - Priority (descending: higher priority first)
 *    - Estimated minutes (ascending: ties broken by smaller tasks)
 *    - ID (lexicographical ascending for stable deterministic tie-breaking)
 * 4. Capacity Packing (Knapsack-inspired greedy pack):
 *    - Greedily packs candidates that fit within `targetMinutes`.
 *    - If an initial task is oversized (estimatedMinutes > targetMinutes) and allowOversizedFirst is true:
 *      it is selected if no other task has been selected yet.
 *    - If a candidate doesn't fit, it is skipped and subsequent smaller fitting candidates can still be selected.
 */
export function selectCandidatesForDailyPlan(
  candidates: readonly PlannerCandidate[],
  targetMinutes: number = STUDY_PLANNER_CONFIG.DEFAULT_TARGET_MINUTES,
  options: CapacitySelectionOptions = { allowOversizedFirst: true },
): DailyCapacityResult {
  if (!candidates || candidates.length === 0 || targetMinutes <= 0) {
    return {
      selectedCandidates: [],
      totalEstimatedMinutes: 0,
      targetMinutes: Math.max(0, targetMinutes),
      remainingMinutes: Math.max(0, targetMinutes),
      skippedCandidates: [],
    };
  }

  const allowOversizedFirst = options.allowOversizedFirst !== false;

  // 1. Deduplication by ID (or stable resource signature)
  const uniqueMap = new Map<string, PlannerCandidate>();
  for (const c of candidates) {
    if (!c || c.estimatedMinutes <= 0) continue;
    const existing = uniqueMap.get(c.id);
    if (!existing || c.priority > existing.priority) {
      uniqueMap.set(c.id, c);
    }
  }

  const uniqueCandidates = Array.from(uniqueMap.values());

  // 2. Deterministic Sorting
  uniqueCandidates.sort((a, b) => {
    // Primary: Priority descending
    if (b.priority !== a.priority) {
      return b.priority - a.priority;
    }
    // Secondary: Estimated minutes ascending
    if (a.estimatedMinutes !== b.estimatedMinutes) {
      return a.estimatedMinutes - b.estimatedMinutes;
    }
    // Tertiary: ID string comparison
    return a.id.localeCompare(b.id);
  });

  // 3. Greedy Packing with deterministic category quotas
  const selected: PlannerCandidate[] = [];
  const skipped: PlannerCandidate[] = [];

  const budget = options.budget;
  let allocatedMandatory = 0;
  let allocatedOptional = 0;
  let allocatedExtra = 0;

  if (budget) {
    const mandatoryLimit = budget.mandatoryMinutes;
    const optionalLimit = budget.optionalMinutes;
    const extraLimit = budget.extraPracticeMinutes;

    for (const candidate of uniqueCandidates) {
      if (candidate.estimatedMinutes <= 0) continue;

      const currentTotal = allocatedMandatory + allocatedOptional + allocatedExtra;

      if (currentTotal + candidate.estimatedMinutes > targetMinutes) {
        if (selected.length === 0 && allowOversizedFirst) {
          selected.push({
            ...candidate,
            metadata: {
              ...candidate.metadata,
              category: candidate.metadata?.category ?? "mandatory",
            },
          });
          allocatedMandatory += candidate.estimatedMinutes;
        } else {
          skipped.push(candidate);
        }
        continue;
      }

      if (allocatedMandatory + candidate.estimatedMinutes <= mandatoryLimit) {
        selected.push({
          ...candidate,
          metadata: {
            ...candidate.metadata,
            category: candidate.metadata?.category ?? "mandatory",
          },
        });
        allocatedMandatory += candidate.estimatedMinutes;
      } else if (
        allocatedOptional + candidate.estimatedMinutes <= optionalLimit
      ) {
        selected.push({
          ...candidate,
          metadata: {
            ...candidate.metadata,
            category: candidate.metadata?.category ?? "optional",
          },
        });
        allocatedOptional += candidate.estimatedMinutes;
      } else if (
        allocatedExtra + candidate.estimatedMinutes <= extraLimit
      ) {
        selected.push({
          ...candidate,
          metadata: {
            ...candidate.metadata,
            category: candidate.metadata?.category ?? "extra_practice",
          },
        });
        allocatedExtra += candidate.estimatedMinutes;
      } else if (currentTotal + candidate.estimatedMinutes <= targetMinutes) {
        // Fits within total daily targetMinutes despite category budget fragmentation
        selected.push({
          ...candidate,
          metadata: {
            ...candidate.metadata,
            category: candidate.metadata?.category ?? "extra_practice",
          },
        });
        allocatedExtra += candidate.estimatedMinutes;
      } else if (selected.length === 0 && allowOversizedFirst) {
        selected.push({
          ...candidate,
          metadata: {
            ...candidate.metadata,
            category: candidate.metadata?.category ?? "mandatory",
          },
        });
        allocatedMandatory += candidate.estimatedMinutes;
      } else {
        skipped.push(candidate);
      }
    }
  } else {
    let totalMinutes = 0;
    for (const candidate of uniqueCandidates) {
      if (candidate.estimatedMinutes <= 0) continue;

      if (totalMinutes + candidate.estimatedMinutes <= targetMinutes) {
        selected.push({
          ...candidate,
          metadata: {
            ...candidate.metadata,
            category: candidate.metadata?.category ?? "mandatory",
          },
        });
        totalMinutes += candidate.estimatedMinutes;
      } else if (selected.length === 0 && allowOversizedFirst) {
        selected.push({
          ...candidate,
          metadata: {
            ...candidate.metadata,
            category: candidate.metadata?.category ?? "mandatory",
          },
        });
        totalMinutes += candidate.estimatedMinutes;
      } else {
        skipped.push(candidate);
      }
    }
    allocatedMandatory = totalMinutes;
  }

  const totalAllocated = allocatedMandatory + allocatedOptional + allocatedExtra;

  return {
    selectedCandidates: selected,
    totalEstimatedMinutes: totalAllocated,
    targetMinutes,
    remainingMinutes: Math.max(0, targetMinutes - totalAllocated),
    skippedCandidates: skipped,
  };
}
