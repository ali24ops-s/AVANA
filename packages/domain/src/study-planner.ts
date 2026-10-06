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

// ---------------------------------------------------------------------------
// Active Learning Streams (Pure Domain Models & Algorithms)
// ---------------------------------------------------------------------------

export interface StreamModuleInput {
  id: string;
  courseId: string;
  title?: string;
  sortOrder: number;
  deletedAt?: string | null;
}

export interface StreamLessonInput {
  id: string;
  moduleId: string;
  title: string;
  sortOrder: number;
  estimatedMinutes?: number | null;
  publicationStatus?: string;
  deletedAt?: string | null;
}

export interface StreamProgressInput {
  lessonId: string;
  completed: boolean;
  completedAt?: string | null;
}

export interface StreamModuleState {
  moduleId: string;
  title: string;
  sortOrder: number;
  isStarted: boolean;
  learningStartAt: string | null;
  lastLearningActivityAt: string | null;
  isCompleted: boolean;
  totalPublishedLessons: number;
  completedPublishedLessons: number;
}

export interface ActiveLearningStream {
  id: string;
  courseId: string;
  moduleIds: string[]; // List of started module IDs belonging to this stream (ordered by course module order)
  headModuleId: string; // The most advanced started module in this stream
  frontierModuleId: string; // The module where next uncompleted lesson should come from
  learningStartAt: string; // Earliest valid completedAt among started modules in this stream
  lastActivityAt: string; // Latest valid completedAt among started modules in this stream
  isCompleted: boolean; // True if all lessons in all modules up to the end of the course for this stream are completed
  nextLessons: StreamLessonInput[]; // Uncompleted published lessons ready to study in this stream (from frontierModule)
}

export interface DetectActiveStreamsParams {
  courseId: string;
  modules: readonly StreamModuleInput[];
  lessons: readonly StreamLessonInput[];
  progressRecords: readonly StreamProgressInput[];
}

export interface BalancedLessonsOptions {
  maxLessons?: number;
}

/**
 * Validates whether a timestamp string is parseable and valid.
 */
function isValidTimestamp(isoStr: string | null | undefined): boolean {
  if (!isoStr || typeof isoStr !== "string") return false;
  const time = Date.parse(isoStr);
  return !isNaN(time);
}

/**
 * Pure function: Detects all Active Learning Streams for a user within a course.
 *
 * Domain Rules:
 * 1. Explicit Completion is the ONLY start signal.
 * 2. learningStartAt = minimum valid completedAt among completed lessons in that module.
 * 3. Module Started is NOT the same as Frontier. Frontier advancement never makes next module started.
 * 4. Contiguous clustering of started modules based on official course module order.
 * 5. Returns ALL detected streams sorted by lastActivityAt DESC (NO cap in domain).
 */
export function detectActiveLearningStreams(
  params: DetectActiveStreamsParams,
): ActiveLearningStream[] {
  const { courseId, modules, lessons, progressRecords } = params;

  // 1. Filter active (non-deleted) modules ordered strictly by sortOrder
  const activeModules = modules
    .filter((m) => !m.deletedAt)
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (activeModules.length === 0) {
    return [];
  }

  // 2. Filter active published lessons (non-deleted, published)
  const publishedLessons = lessons.filter(
    (l) => !l.deletedAt && l.publicationStatus === "published",
  );

  // Group published lessons by module
  const publishedLessonsByModule = new Map<string, StreamLessonInput[]>();
  for (const m of activeModules) {
    publishedLessonsByModule.set(m.id, []);
  }
  for (const l of publishedLessons) {
    const list = publishedLessonsByModule.get(l.moduleId);
    if (list) {
      list.push(l);
    }
  }
  // Sort lessons within each module by sortOrder
  for (const list of publishedLessonsByModule.values()) {
    list.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // 3. Map user's completed published lessons
  // Keep earliest completedAt per lesson in case of duplicates
  const publishedLessonIdSet = new Set(publishedLessons.map((l) => l.id));
  const completedLessonProgressMap = new Map<string, string>(); // lessonId -> valid completedAt

  for (const p of progressRecords) {
    if (!p.completed || !publishedLessonIdSet.has(p.lessonId)) continue;
    const completedAtStr = isValidTimestamp(p.completedAt)
      ? p.completedAt!
      : new Date(0).toISOString(); // deterministic fallback for valid completion without date
    const existing = completedLessonProgressMap.get(p.lessonId);
    if (!existing) {
      completedLessonProgressMap.set(p.lessonId, completedAtStr);
    } else {
      // Pick earliest completedAt to preserve learning start
      if (Date.parse(completedAtStr) < Date.parse(existing)) {
        completedLessonProgressMap.set(p.lessonId, completedAtStr);
      }
    }
  }

  const completedLessonIds = new Set(completedLessonProgressMap.keys());

  // 4. Compute Module State for each active module
  const moduleStateMap = new Map<string, StreamModuleState>();
  const startedModuleStates: StreamModuleState[] = [];

  for (const m of activeModules) {
    const modLessons = publishedLessonsByModule.get(m.id) ?? [];
    const totalPublished = modLessons.length;
    const completedLessons = modLessons.filter((l) => completedLessonIds.has(l.id));
    const completedCount = completedLessons.length;

    const isStarted = completedCount > 0;
    let learningStartAt: string | null = null;
    let lastLearningActivityAt: string | null = null;

    if (isStarted) {
      let minTime = Infinity;
      let minStr = "";
      let maxTime = -Infinity;
      let maxStr = "";

      for (const cl of completedLessons) {
        const timeStr = completedLessonProgressMap.get(cl.id)!;
        const t = Date.parse(timeStr);
        if (t < minTime) {
          minTime = t;
          minStr = timeStr;
        }
        if (t > maxTime) {
          maxTime = t;
          maxStr = timeStr;
        }
      }

      learningStartAt = minStr;
      lastLearningActivityAt = maxStr;
    }

    const isCompleted = totalPublished > 0 && completedCount === totalPublished;

    const state: StreamModuleState = {
      moduleId: m.id,
      title: m.title ?? "",
      sortOrder: m.sortOrder,
      isStarted,
      learningStartAt,
      lastLearningActivityAt,
      isCompleted,
      totalPublishedLessons: totalPublished,
      completedPublishedLessons: completedCount,
    };

    moduleStateMap.set(m.id, state);
    if (isStarted) {
      startedModuleStates.push(state);
    }
  }

  // If no module has any completed lessons, no active stream exists
  if (startedModuleStates.length === 0) {
    return [];
  }

  // Index map of active modules in course order
  const moduleIndexMap = new Map<string, number>();
  activeModules.forEach((m, idx) => {
    moduleIndexMap.set(m.id, idx);
  });

  // 5. Contiguous Clustering of Started Modules
  // Note: startedModuleStates is already in course module order because activeModules was sorted
  const clusters: StreamModuleState[][] = [];
  let currentCluster: StreamModuleState[] = [startedModuleStates[0]];

  for (let i = 1; i < startedModuleStates.length; i++) {
    const prev = startedModuleStates[i - 1];
    const curr = startedModuleStates[i];
    const prevIdx = moduleIndexMap.get(prev.moduleId)!;
    const currIdx = moduleIndexMap.get(curr.moduleId)!;

    if (currIdx === prevIdx + 1) {
      // Contiguous in course structure -> belongs to same stream
      currentCluster.push(curr);
    } else {
      // Gap in course structure -> new stream
      clusters.push(currentCluster);
      currentCluster = [curr];
    }
  }
  clusters.push(currentCluster);

  // 6. Build ActiveLearningStream for each cluster
  const streams: ActiveLearningStream[] = [];

  for (const cluster of clusters) {
    const moduleIds = cluster.map((c) => c.moduleId);
    const headModule = cluster[cluster.length - 1];
    const headModuleId = headModule.moduleId;

    // Earliest start and latest activity across this stream's started modules
    let streamMinTime = Infinity;
    let streamMinStr = cluster[0].learningStartAt!;
    let streamMaxTime = -Infinity;
    let streamMaxStr = cluster[0].lastLearningActivityAt!;

    for (const mod of cluster) {
      if (mod.learningStartAt) {
        const tStart = Date.parse(mod.learningStartAt);
        if (tStart < streamMinTime) {
          streamMinTime = tStart;
          streamMinStr = mod.learningStartAt;
        }
      }
      if (mod.lastLearningActivityAt) {
        const tAct = Date.parse(mod.lastLearningActivityAt);
        if (tAct > streamMaxTime) {
          streamMaxTime = tAct;
          streamMaxStr = mod.lastLearningActivityAt;
        }
      }
    }

    let frontierModuleId: string;
    let isStreamCompleted = false;
    let nextLessons: StreamLessonInput[] = [];

    if (!headModule.isCompleted) {
      // Head module is still incomplete -> frontier is the head module itself
      frontierModuleId = headModuleId;
      const modLessons = publishedLessonsByModule.get(headModuleId) ?? [];
      nextLessons = modLessons.filter((l) => !completedLessonIds.has(l.id));
    } else {
      // Head module is fully completed -> frontier advances to next module in course structure
      const headIdx = moduleIndexMap.get(headModuleId)!;
      const nextActiveModule = activeModules[headIdx + 1];

      if (nextActiveModule) {
        frontierModuleId = nextActiveModule.id;
        const modLessons = publishedLessonsByModule.get(frontierModuleId) ?? [];
        nextLessons = modLessons.filter((l) => !completedLessonIds.has(l.id));
      } else {
        // Entire course finished from this stream onward
        frontierModuleId = headModuleId;
        isStreamCompleted = true;
        nextLessons = [];
      }
    }

    const firstModuleId = cluster[0].moduleId;
    const streamId = `stream:${courseId}:${firstModuleId}`;

    streams.push({
      id: streamId,
      courseId,
      moduleIds,
      headModuleId,
      frontierModuleId,
      learningStartAt: streamMinStr,
      lastActivityAt: streamMaxStr,
      isCompleted: isStreamCompleted,
      nextLessons,
    });
  }

  // 7. Sort streams by lastActivityAt DESC (freshest activity first), then learningStartAt DESC, then id
  streams.sort((a, b) => {
    const timeB = Date.parse(b.lastActivityAt);
    const timeA = Date.parse(a.lastActivityAt);
    if (timeB !== timeA) {
      return timeB - timeA;
    }
    const startB = Date.parse(b.learningStartAt);
    const startA = Date.parse(a.learningStartAt);
    if (startB !== startA) {
      return startB - startA;
    }
    return a.id.localeCompare(b.id);
  });

  return streams;
}

/**
 * Pure function: Selects balanced lessons across active streams using round-robin.
 *
 * Stream ranking is preserved: freshest stream provides its first lesson first,
 * then subsequent streams provide their first lesson, then round 2, until maxLessons.
 */
export function pickBalancedLessonsFromStreams(
  streams: readonly ActiveLearningStream[],
  options?: BalancedLessonsOptions,
): StreamLessonInput[] {
  const maxLessons = options?.maxLessons && options.maxLessons > 0 ? options.maxLessons : 6;
  if (!streams || streams.length === 0 || maxLessons <= 0) {
    return [];
  }

  const activeStreamsWithLessons = streams.filter(
    (s) => s.nextLessons && s.nextLessons.length > 0,
  );
  if (activeStreamsWithLessons.length === 0) {
    return [];
  }

  const selected: StreamLessonInput[] = [];
  const selectedLessonIds = new Set<string>();
  const lessonPointers = new Array<number>(activeStreamsWithLessons.length).fill(0);

  let hasMore = true;
  while (selected.length < maxLessons && hasMore) {
    hasMore = false;
    for (let sIdx = 0; sIdx < activeStreamsWithLessons.length; sIdx++) {
      if (selected.length >= maxLessons) break;

      const stream = activeStreamsWithLessons[sIdx];
      let ptr = lessonPointers[sIdx];

      // Find next unselected lesson in this stream
      while (ptr < stream.nextLessons.length) {
        const candidateLesson = stream.nextLessons[ptr];
        ptr++;
        if (!selectedLessonIds.has(candidateLesson.id)) {
          selectedLessonIds.add(candidateLesson.id);
          selected.push(candidateLesson);
          hasMore = true;
          break;
        }
      }

      lessonPointers[sIdx] = ptr;
      if (ptr < stream.nextLessons.length) {
        hasMore = true;
      }
    }
  }

  return selected;
}
