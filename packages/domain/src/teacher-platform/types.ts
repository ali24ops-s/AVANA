import { DomainError } from "../errors.js";

// ---------------------------------------------------------------------------
// Enums & Literal Types
// ---------------------------------------------------------------------------

export type ClassroomStatus = "active" | "archived";

export type ClassroomMemberStatus = "active" | "removed" | "left";

export type ExamPersistedStatus = "draft" | "published" | "archived";

export type RuntimeExamState = "upcoming" | "active" | "closed";

export type AttemptStatus = "in_progress" | "submitted" | "timed_out";

export type QuestionType = "single_choice" | "descriptive";

export type QuestionGradingStatus = "auto_graded" | "ungraded" | "graded";

export type AttemptGradingStatus = "fully_graded" | "needs_manual_review";

// ---------------------------------------------------------------------------
// Option & Question Models
// ---------------------------------------------------------------------------

export interface ExamOption {
  id: string; // e.g. "opt_1a2b3c" (stable nanoid/uuid, not numeric index)
  text: string;
}

export interface ExamSnapshotQuestion {
  id: string;
  orderIndex: number;
  questionType?: QuestionType;
  prompt: string;
  options?: ExamOption[];
  correctOptionId?: string | null;
  points: number;
  explanation?: string | null;
}

export type StudentSanitizedQuestion = Omit<
  ExamSnapshotQuestion,
  "correctOptionId" | "explanation"
>;

// ---------------------------------------------------------------------------
// Core Entities
// ---------------------------------------------------------------------------

export interface Classroom {
  id: string;
  organizationId: string;
  teacherId: string;
  courseId?: string | null;
  title: string;
  description?: string | null;
  inviteCode: string;
  status: ClassroomStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface ClassroomMember {
  id: string;
  classroomId: string;
  studentId: string;
  status: ClassroomMemberStatus;
  firstJoinedAt: string;
  lastJoinedAt: string;
  leftAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherExam {
  id: string;
  classroomId: string;
  title: string;
  description?: string | null;
  durationMinutes?: number | null;
  startsAt: string;
  endsAt: string;
  passingScorePercentage?: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  showResultsImmediately: boolean;
  allowBackNavigation: boolean;
  perQuestionTimeSeconds?: number | null;
  status: ExamPersistedStatus;
  closedAt?: string | null;
  resultsReleasedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface TeacherExamQuestion {
  id: string;
  examId: string;
  orderIndex: number;
  questionType: QuestionType;
  prompt: string;
  options?: ExamOption[];
  correctOptionId?: string | null;
  points: number;
  explanation?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherExamAttempt {
  id: string;
  examId: string;
  studentId: string;
  status: AttemptStatus;
  gradingStatus?: AttemptGradingStatus;
  startedAt: string;
  deadlineAt: string;
  submittedAt?: string | null;
  completedAt?: string | null;
  score?: number | null;
  maxScore?: number | null;
  percentage?: number | null;
  passed?: boolean | null;
  allowBackNavigation?: boolean;
  perQuestionTimeSeconds?: number | null;
  questionSnapshot: ExamSnapshotQuestion[];
  createdAt: string;
  updatedAt: string;
}

export interface TeacherExamAttemptAnswer {
  id: string;
  attemptId: string;
  questionId: string;
  selectedOptionId?: string | null;
  textAnswer?: string | null;
  teacherFeedback?: string | null;
  gradingStatus?: QuestionGradingStatus;
  answeredAt: string;
  finalizedAt?: string | null;
  isCorrect?: boolean | null;
  pointsEarned?: number | null;
  activeDurationMs?: number | null;
  tabSwitchesCount?: number | null;
}

// ---------------------------------------------------------------------------
// Pure Domain Helper Functions & Invariants
// ---------------------------------------------------------------------------

export interface QuestionTimingInfo {
  currentIndex: number;
  questionStartTimes: number[];
  questionDeadlines: number[];
  questionFinishTimes: Array<number | null>;
  currentQuestionRemainingSeconds: number;
  currentQuestionRemainingMs: number;
  isCurrentQuestionExpired: boolean;
  isAllQuestionsExpired: boolean;
}

export interface ComputePerQuestionTimingParams {
  startedAt: string | Date;
  deadlineAt: string | Date;
  perQuestionTimeSeconds: number | null | undefined;
  questions: Array<{ id: string }>;
  savedAnswers: Array<{
    questionId: string;
    answeredAt?: string | Date | null;
    finalizedAt?: string | Date | null;
    selectedOptionId?: string | null;
  }>;
  now: number | Date;
}

/**
 * Pure, deterministic helper calculating per-question timing state for timed exams.
 * Returns null if perQuestionTimeSeconds is null/0/undefined (timing disabled).
 */
export function computePerQuestionTiming(
  params: ComputePerQuestionTimingParams,
): QuestionTimingInfo | null {
  const { perQuestionTimeSeconds, questions } = params;
  if (!perQuestionTimeSeconds || perQuestionTimeSeconds <= 0 || questions.length === 0) {
    return null;
  }

  const perQuestionMs = perQuestionTimeSeconds * 1000;
  const examStartMs = new Date(params.startedAt).getTime();
  const examDeadlineMs = new Date(params.deadlineAt).getTime();
  const nowMs = typeof params.now === "number" ? params.now : new Date(params.now).getTime();

  const answerMap = new Map<
    string,
    {
      answeredAt?: string | Date | null;
      finalizedAt?: string | Date | null;
      selectedOptionId?: string | null;
    }
  >();
  for (const ans of params.savedAnswers) {
    answerMap.set(ans.questionId, ans);
  }

  const questionStartTimes: number[] = [];
  const questionDeadlines: number[] = [];
  const questionFinishTimes: Array<number | null> = [];

  let currentStartMs = examStartMs;
  let activeIndex = -1;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    questionStartTimes.push(currentStartMs);

    const nominalDeadline = currentStartMs + perQuestionMs;
    const deadline = Math.min(nominalDeadline, examDeadlineMs);
    questionDeadlines.push(deadline);

    const ans = answerMap.get(q.id);
    const finalizedAtMs = ans?.finalizedAt ? new Date(ans.finalizedAt).getTime() : null;

    if (finalizedAtMs !== null && finalizedAtMs < deadline && finalizedAtMs <= nowMs) {
      // Question was explicitly finalized before deadline
      questionFinishTimes.push(finalizedAtMs);
      currentStartMs = finalizedAtMs;
    } else if (nowMs >= deadline) {
      // Question timed out
      questionFinishTimes.push(deadline);
      currentStartMs = deadline;
    } else {
      // Question is currently active
      questionFinishTimes.push(null);
      activeIndex = i;
      break;
    }
  }

  const isAllQuestionsExpired = activeIndex === -1;
  const currentIndex = isAllQuestionsExpired ? Math.max(0, questions.length - 1) : activeIndex;
  const activeDeadline = questionDeadlines[currentIndex] ?? examDeadlineMs;
  const remainingMs = Math.max(0, activeDeadline - nowMs);
  const remainingSeconds = Math.ceil(remainingMs / 1000);

  return {
    currentIndex,
    questionStartTimes,
    questionDeadlines,
    questionFinishTimes,
    currentQuestionRemainingSeconds: remainingSeconds,
    currentQuestionRemainingMs: remainingMs,
    isCurrentQuestionExpired: remainingMs <= 0,
    isAllQuestionsExpired,
  };
}

/**
 * Calculates the dynamic runtime state of a published exam based on server time.
 * If the exam is not published, it is either 'draft' or 'archived' (not runnable).
 */
export function calculateRuntimeExamState(
  exam: Pick<TeacherExam, "status" | "startsAt" | "endsAt" | "closedAt">,
  now: Date = new Date(),
): RuntimeExamState {
  if (exam.status !== "published") {
    return "closed";
  }

  const currentTime = now.getTime();
  const startTime = new Date(exam.startsAt).getTime();
  const endTime = new Date(exam.endsAt).getTime();

  // If manually closed or after endsAt, it is closed
  if (exam.closedAt !== null && exam.closedAt !== undefined) {
    return "closed";
  }
  if (currentTime > endTime) {
    return "closed";
  }

  // If before startsAt, it is upcoming
  if (currentTime < startTime) {
    return "upcoming";
  }

  // Currently within running window
  return "active";
}

/**
 * Invariant: Question mutation is strictly prohibited unless exam status is 'draft'.
 * Once published, questions are 100% immutable.
 */
export function assertQuestionMutationAllowed(status: ExamPersistedStatus): void {
  if (status !== "draft") {
    throw new DomainError(
      "bad_request",
      `Questions cannot be modified on an exam with status '${status}'. Questions are immutable once published.`,
    );
  }
}

/**
 * Grace period (in milliseconds) after exam deadline during which submission is still accepted.
 * Answers cannot be saved once deadline passes, but in-flight submission is permitted during grace.
 */
export const ATTEMPT_SUBMISSION_GRACE_MS = 60_000;

/**
 * Generates an 8-character cryptographically random, human-friendly invite code.
 * Excludes ambiguous characters (0, O, 1, I).
 */
export function generateInviteCode(length: number = 8): string {
  const charset = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (let i = 0; i < length; i++) {
      code += charset[bytes[i] % charset.length];
    }
    return code;
  }
  for (let i = 0; i < length; i++) {
    code += charset[Math.floor(Math.random() * charset.length)];
  }
  return code;
}

// ---------------------------------------------------------------------------
// Assignment Enums & Types
// ---------------------------------------------------------------------------

export type AssignmentPersistedStatus = "draft" | "published" | "archived";

export type RuntimeAssignmentState = "upcoming" | "active" | "closed";

export type AssignmentSubmissionStatus = "submitted";

export interface ClassroomAssignment {
  id: string;
  classroomId: string;
  teacherId: string;
  title: string;
  description?: string | null;
  startsAt: string;
  dueAt: string;
  status: AssignmentPersistedStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

export interface AssignmentSubmission {
  id: string;
  assignmentId: string;
  studentId: string;
  answerText: string;
  status: AssignmentSubmissionStatus;
  submittedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Calculates the dynamic runtime state of a published assignment based on server time.
 */
export function calculateRuntimeAssignmentState(
  assignment: Pick<ClassroomAssignment, "status" | "startsAt" | "dueAt">,
  now: Date = new Date(),
): RuntimeAssignmentState {
  if (assignment.status !== "published") {
    return "closed";
  }

  const currentTime = now.getTime();
  const startTime = new Date(assignment.startsAt).getTime();
  const dueTime = new Date(assignment.dueAt).getTime();

  if (currentTime < startTime) {
    return "upcoming";
  }
  if (currentTime > dueTime) {
    return "closed";
  }
  return "active";
}
