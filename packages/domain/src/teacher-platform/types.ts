import { DomainError } from "../errors.js";

// ---------------------------------------------------------------------------
// Enums & Literal Types
// ---------------------------------------------------------------------------

export type ClassroomStatus = "active" | "archived";

export type ClassroomMemberStatus = "active" | "removed" | "left";

export type ExamPersistedStatus = "draft" | "published" | "archived";

export type RuntimeExamState = "upcoming" | "active" | "closed";

export type AttemptStatus = "in_progress" | "submitted" | "timed_out";

export type QuestionType = "single_choice" | "descriptive" | "true_false";

export type QuestionGradingStatus = "auto_graded" | "ungraded" | "graded";

export type AttemptGradingStatus = "fully_graded" | "needs_manual_review";

export interface ExamOption {
  id: string;
  text: string;
}

export const TRUE_FALSE_FIXED_PROMPT = "در مورد گزاره‌های زیر، صحیح یا غلط بودن هر یک را مشخص کنید.";

export interface TrueFalseStatement {
  id: string;
  text: string;
  correctAnswer: boolean;
}

export interface StudentTrueFalseStatement {
  id: string;
  text: string;
}

export interface TrueFalseStatementReview {
  id: string;
  text: string;
  selectedAnswer: boolean | null;
  correctAnswer: boolean;
  isCorrect: boolean;
}

export interface ExamSnapshotQuestion {
  id: string;
  orderIndex: number;
  questionType?: QuestionType;
  prompt: string;
  options?: ExamOption[];
  statements?: TrueFalseStatement[];
  correctOptionId?: string | null;
  points: number;
  explanation?: string | null;
}

export type StudentExamResultState =
  | "ready"
  | "grading_in_progress"
  | "results_pending_teacher"
  | "results_unpublished_closed";

export interface StudentSanitizedQuestion {
  id: string;
  orderIndex: number;
  questionType?: QuestionType;
  prompt: string;
  options?: ExamOption[];
  statements?: StudentTrueFalseStatement[];
  points: number;
}

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
  statements?: TrueFalseStatement[];
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

import type {
  DescriptiveAnswerIntegrityData,
  DescriptiveAnswerIntegrityAnalysis,
  DescriptivePasteEvent,
  DescriptiveRapidInputEvent,
  DescriptiveTimelineEvent,
  DescriptiveTimelineEventType,
} from "./integrity.js";

export type {
  DescriptiveAnswerIntegrityData,
  DescriptiveAnswerIntegrityAnalysis,
  DescriptivePasteEvent,
  DescriptiveRapidInputEvent,
  DescriptiveTimelineEvent,
  DescriptiveTimelineEventType,
};

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
  integrityMetadata?: DescriptiveAnswerIntegrityData | null;
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
  if (currentTime >= endTime) {
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
  // eslint-disable-next-line no-secrets/no-secrets
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
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentSizeBytes?: number | null;
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

// ---------------------------------------------------------------------------
// Educational Content Enums & Types

// ---------------------------------------------------------------------------

export type ClassroomContentType =
  | "text"
  | "image"
  | "pdf"
  | "word"
  | "powerpoint"
  | "video_external";

export type ClassroomContentStatus = "draft" | "published" | "archived";

export type ExternalVideoProvider = "google_drive" | "generic";

export interface ExternalVideoInfo {
  provider: ExternalVideoProvider;
  originalUrl: string;
  embedUrl: string | null;
  canEmbed: boolean;
}

export interface ClassroomContent {
  id: string;
  classroomId: string;
  teacherId: string;
  title: string;
  description?: string | null;
  contentType: ClassroomContentType;
  textContent?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  mimeType?: string | null;
  externalUrl?: string | null;
  videoProvider?: ExternalVideoProvider | null;
  videoEmbedUrl?: string | null;
  status: ClassroomContentStatus;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string | null;
}

/**
 * Validates and detects video provider from an external URL.
 * Strictly permits safe schemes (https, http) and guards against unsafe schemes (javascript:, data:, etc.).
 * Converts embeddable Google Drive URLs into their /preview embed equivalent.
 */
export function detectExternalVideoProvider(rawUrl: string): ExternalVideoInfo {
  const trimmed = rawUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new DomainError("bad_request", "آدرس اینترنتی ویدئو معتبر نیست.");
  }

  // Enforce safe scheme
  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "https:" && protocol !== "http:") {
    throw new DomainError(
      "bad_request",
      "پروتکل آدرس اینترنتی باید HTTPS یا HTTP باشد.",
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // 1. Google Drive Detection
  if (
    hostname === "drive.google.com" ||
    hostname === "docs.google.com" ||
    hostname.endsWith(".drive.google.com") ||
    hostname.endsWith(".docs.google.com")
  ) {
    // Pattern 1: /file/d/{FILE_ID}/...
    const fileDMatch = parsed.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileDMatch && fileDMatch[1]) {
      const fileId = fileDMatch[1];
      return {
        provider: "google_drive",
        originalUrl: trimmed,
        embedUrl: `https://drive.google.com/file/d/${fileId}/preview`,
        canEmbed: true,
      };
    }

    // Pattern 2: /open?id={FILE_ID} or /uc?id={FILE_ID}
    const idParam = parsed.searchParams.get("id");
    if (idParam && /^[a-zA-Z0-9_-]+$/.test(idParam)) {
      return {
        provider: "google_drive",
        originalUrl: trimmed,
        embedUrl: `https://drive.google.com/file/d/${idParam}/preview`,
        canEmbed: true,
      };
    }

    // Google Drive URL without detectable file ID (e.g. folder or drive home) -> cannot embed directly
    return {
      provider: "google_drive",
      originalUrl: trimmed,
      embedUrl: null,
      canEmbed: false,
    };
  }

  // 2. Generic external URL
  return {
    provider: "generic",
    originalUrl: trimmed,
    embedUrl: null,
    canEmbed: false,
  };
}

// ---------------------------------------------------------------------------
// Teacher Student Messaging System
// ---------------------------------------------------------------------------

export const TeacherMessageCategories = {
  STUDY_QUESTION: "study_question",
  ASSIGNMENT: "assignment",
  EXAM: "exam",
  EDUCATIONAL_CONTENT: "educational_content",
  CLASS_ISSUE: "class_issue",
  GUIDANCE: "guidance",
  OTHER: "other",
} as const;

export type TeacherMessageCategory =
  (typeof TeacherMessageCategories)[keyof typeof TeacherMessageCategories];

export function isTeacherMessageCategory(val: string): val is TeacherMessageCategory {
  return Object.values(TeacherMessageCategories).includes(
    val as TeacherMessageCategory,
  );
}

export const TEACHER_MESSAGE_CATEGORY_LABELS: Record<TeacherMessageCategory, string> = {
  [TeacherMessageCategories.STUDY_QUESTION]: "سؤال درسی",
  [TeacherMessageCategories.ASSIGNMENT]: "تکلیف / تمرین",
  [TeacherMessageCategories.EXAM]: "آزمون",
  [TeacherMessageCategories.EDUCATIONAL_CONTENT]: "محتوای آموزشی",
  [TeacherMessageCategories.CLASS_ISSUE]: "مشکل کلاس",
  [TeacherMessageCategories.GUIDANCE]: "درخواست راهنمایی",
  [TeacherMessageCategories.OTHER]: "سایر",
};

export const TeacherMessageStatuses = {
  NEW: "new",
  IN_PROGRESS: "in_progress",
  ANSWERED: "answered",
  CLOSED: "closed",
} as const;

export type TeacherMessageStatus =
  (typeof TeacherMessageStatuses)[keyof typeof TeacherMessageStatuses];

export function isTeacherMessageStatus(val: string): val is TeacherMessageStatus {
  return Object.values(TeacherMessageStatuses).includes(
    val as TeacherMessageStatus,
  );
}

export const TEACHER_MESSAGE_STATUS_LABELS: Record<TeacherMessageStatus, string> = {
  [TeacherMessageStatuses.NEW]: "جدید",
  [TeacherMessageStatuses.IN_PROGRESS]: "در حال پیگیری",
  [TeacherMessageStatuses.ANSWERED]: "پاسخ داده‌شده",
  [TeacherMessageStatuses.CLOSED]: "بسته‌شده",
};

export interface TeacherConversation {
  id: string;
  studentId: string;
  teacherId: string;
  classroomId: string;
  category: TeacherMessageCategory;
  subject: string;
  status: TeacherMessageStatus;
  lastActivityAt: string;
  lastSenderRole: "student" | "teacher";
  teacherReadAt: string | null;
  studentReadAt: string | null;
  answeredAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherConversationMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderRole: "student" | "teacher";
  body: string;
  createdAt: string;
}

export interface TeacherConversationWithDetails extends TeacherConversation {
  studentName?: string | null;
  studentEmail?: string | null;
  teacherName?: string | null;
  classroomTitle?: string | null;
  messageCount?: number;
  messages?: TeacherConversationMessage[];
}

export const ALLOWED_TEACHER_MESSAGE_STATUS_TRANSITIONS: Record<
  TeacherMessageStatus,
  readonly TeacherMessageStatus[]
> = {
  [TeacherMessageStatuses.NEW]: [
    TeacherMessageStatuses.IN_PROGRESS,
    TeacherMessageStatuses.ANSWERED,
    TeacherMessageStatuses.CLOSED,
  ],
  [TeacherMessageStatuses.IN_PROGRESS]: [
    TeacherMessageStatuses.ANSWERED,
    TeacherMessageStatuses.CLOSED,
    TeacherMessageStatuses.NEW,
  ],
  [TeacherMessageStatuses.ANSWERED]: [
    TeacherMessageStatuses.IN_PROGRESS,
    TeacherMessageStatuses.CLOSED,
    TeacherMessageStatuses.NEW,
  ],
  [TeacherMessageStatuses.CLOSED]: [
    TeacherMessageStatuses.NEW,
    TeacherMessageStatuses.IN_PROGRESS,
    TeacherMessageStatuses.ANSWERED,
  ],
};

export function canTransitionTeacherMessageStatus(
  current: TeacherMessageStatus,
  target: TeacherMessageStatus,
): boolean {
  if (current === target) return true;
  const allowed = ALLOWED_TEACHER_MESSAGE_STATUS_TRANSITIONS[current];
  return allowed ? allowed.includes(target) : false;
}
