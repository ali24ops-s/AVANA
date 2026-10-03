import { DomainError } from "../errors.js";
import {
  type ClassroomStatus,
  type ClassroomMemberStatus,
  type ExamPersistedStatus,
  type RuntimeExamState,
  type AttemptStatus,
  type ExamOption,
  type QuestionType,
  type TrueFalseStatement,
  type ClassroomContentType,
  type ClassroomContentStatus,
  TRUE_FALSE_FIXED_PROMPT,
  detectExternalVideoProvider,
  type TeacherMessageCategory,
  type TeacherMessageStatus,
  isTeacherMessageCategory,
  isTeacherMessageStatus,
} from "./types.js";

// ---------------------------------------------------------------------------
// UUID & Format Helpers
// ---------------------------------------------------------------------------

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(val: unknown): val is string {
  return typeof val === "string" && UUID_REGEX.test(val);
}

function assertUuid(val: unknown, fieldName: string): asserts val is string {
  if (!isValidUuid(val)) {
    throw new DomainError("bad_request", `${fieldName} باید یک شناسه معتبر UUID باشد`);
  }
}

function assertNonEmptyString(
  val: unknown,
  fieldName: string,
  minLen: number = 1,
  maxLen: number = 255,
): asserts val is string {
  if (typeof val !== "string" || val.trim().length < minLen) {
    throw new DomainError(
      "bad_request",
      `${fieldName} باید حداقل ${minLen} کاراکتر باشد`,
    );
  }
  if (val.trim().length > maxLen) {
    throw new DomainError(
      "bad_request",
      `${fieldName} نمی‌تواند بیشتر از ${maxLen} کاراکتر باشد`,
    );
  }
}

// ---------------------------------------------------------------------------
// Type Guards & Schemas
// ---------------------------------------------------------------------------

export const VALID_CLASSROOM_STATUSES: readonly ClassroomStatus[] = [
  "active",
  "archived",
];

export const VALID_MEMBER_STATUSES: readonly ClassroomMemberStatus[] = [
  "active",
  "removed",
  "left",
];

export const VALID_EXAM_STATUSES: readonly ExamPersistedStatus[] = [
  "draft",
  "published",
  "archived",
];

export const VALID_RUNTIME_EXAM_STATES: readonly RuntimeExamState[] = [
  "upcoming",
  "active",
  "closed",
];

export const VALID_ATTEMPT_STATUSES: readonly AttemptStatus[] = [
  "in_progress",
  "submitted",
  "timed_out",
];

export function isClassroomStatus(val: unknown): val is ClassroomStatus {
  return typeof val === "string" && VALID_CLASSROOM_STATUSES.includes(val as ClassroomStatus);
}

export function isClassroomMemberStatus(val: unknown): val is ClassroomMemberStatus {
  return typeof val === "string" && VALID_MEMBER_STATUSES.includes(val as ClassroomMemberStatus);
}

export function isExamPersistedStatus(val: unknown): val is ExamPersistedStatus {
  return typeof val === "string" && VALID_EXAM_STATUSES.includes(val as ExamPersistedStatus);
}

export function isAttemptStatus(val: unknown): val is AttemptStatus {
  return typeof val === "string" && VALID_ATTEMPT_STATUSES.includes(val as AttemptStatus);
}

// ---------------------------------------------------------------------------
// Input DTOs & Validators
// ---------------------------------------------------------------------------

export interface CreateClassroomInput {
  organizationId: string;
  courseId?: string | null;
  title: string;
  description?: string | null;
}

export function validateCreateClassroomInput(raw: unknown): CreateClassroomInput {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "داده‌های ورودی کلاس معتبر نیست");
  }
  const input = raw as Partial<CreateClassroomInput>;

  assertUuid(input.organizationId, "شناسه سازمان");
  assertNonEmptyString(input.title, "عنوان کلاس", 3, 255);

  if (input.courseId !== undefined && input.courseId !== null) {
    assertUuid(input.courseId, "شناسه دوره");
  }

  let description: string | null = null;
  if (typeof input.description === "string") {
    description = input.description.trim() || null;
    if (description && description.length > 1000) {
      throw new DomainError("bad_request", "توضیحات کلاس نمی‌تواند بیشتر از ۱۰۰۰ کاراکتر باشد");
    }
  }

  return {
    organizationId: input.organizationId,
    courseId: input.courseId ?? null,
    title: input.title.trim(),
    description,
  };
}

export interface CreateExamInput {
  title: string;
  description?: string | null;
  durationMinutes?: number | null;
  startsAt: string;
  endsAt: string;
  passingScorePercentage?: number | null;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showResultsImmediately?: boolean;
  allowBackNavigation?: boolean;
  perQuestionTimeSeconds?: number | null;
}

export function validateCreateExamInput(raw: unknown): CreateExamInput {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "داده‌های ورودی آزمون معتبر نیست");
  }
  const input = raw as Partial<CreateExamInput>;

  assertNonEmptyString(input.title, "عنوان آزمون", 3, 255);

  let durationMinutes: number | null = null;
  if (input.durationMinutes !== undefined && input.durationMinutes !== null) {
    if (
      typeof input.durationMinutes !== "number" ||
      !Number.isInteger(input.durationMinutes) ||
      input.durationMinutes < 5 ||
      input.durationMinutes > 360
    ) {
      throw new DomainError("bad_request", "مدت زمان آزمون باید بین ۵ تا ۳۶۰ دقیقه باشد");
    }
    durationMinutes = input.durationMinutes;
  }

  if (typeof input.startsAt !== "string" || isNaN(Date.parse(input.startsAt))) {
    throw new DomainError("bad_request", "تاریخ شروع آزمون نامعتبر است");
  }

  if (typeof input.endsAt !== "string" || isNaN(Date.parse(input.endsAt))) {
    throw new DomainError("bad_request", "تاریخ پایان آزمون نامعتبر است");
  }

  const startTime = new Date(input.startsAt).getTime();
  const endTime = new Date(input.endsAt).getTime();
  if (startTime >= endTime) {
    throw new DomainError("bad_request", "زمان شروع آزمون باید قبل از زمان پایان باشد");
  }

  let passingScorePercentage: number | null = null;
  if (input.passingScorePercentage !== undefined && input.passingScorePercentage !== null) {
    if (
      typeof input.passingScorePercentage !== "number" ||
      input.passingScorePercentage < 0 ||
      input.passingScorePercentage > 100
    ) {
      throw new DomainError("bad_request", "حداقل نمره قبولی باید عددی بین ۰ تا ۱۰۰ باشد");
    }
    passingScorePercentage = input.passingScorePercentage;
  }

  let description: string | null = null;
  if (typeof input.description === "string") {
    description = input.description.trim() || null;
    if (description && description.length > 2000) {
      throw new DomainError("bad_request", "توضیحات آزمون نمی‌تواند بیشتر از ۲۰۰۰ کاراکتر باشد");
    }
  }

  let perQuestionTimeSeconds: number | null = null;
  if (input.perQuestionTimeSeconds !== undefined && input.perQuestionTimeSeconds !== null) {
    if (
      typeof input.perQuestionTimeSeconds !== "number" ||
      !Number.isInteger(input.perQuestionTimeSeconds) ||
      input.perQuestionTimeSeconds < 0
    ) {
      throw new DomainError("bad_request", "زمان هر سؤال نامعتبر است");
    }
    if (input.perQuestionTimeSeconds > 0) {
      if (input.perQuestionTimeSeconds < 5 || input.perQuestionTimeSeconds > 3600) {
        throw new DomainError("bad_request", "زمان هر سؤال باید بین ۵ تا ۳۶۰۰ ثانیه باشد");
      }
      perQuestionTimeSeconds = input.perQuestionTimeSeconds;
    }
  }

  let allowBackNavigation = input.allowBackNavigation ?? true;
  if (perQuestionTimeSeconds && perQuestionTimeSeconds > 0) {
    if (input.allowBackNavigation === true) {
      throw new DomainError(
        "bad_request",
        "در آزمون زمان‌دار، پس از پایان هر سؤال امکان بازگشت به سؤال قبلی وجود ندارد",
      );
    }
    allowBackNavigation = false;
  }

  return {
    title: input.title.trim(),
    description,
    durationMinutes,
    startsAt: new Date(startTime).toISOString(),
    endsAt: new Date(endTime).toISOString(),
    passingScorePercentage,
    shuffleQuestions: input.shuffleQuestions ?? true,
    shuffleOptions: input.shuffleOptions ?? true,
    showResultsImmediately: input.showResultsImmediately ?? false,
    allowBackNavigation,
    perQuestionTimeSeconds,
  };
}

export interface TeacherQuestionInput {
  prompt?: string;
  questionType?: QuestionType;
  options?: ExamOption[];
  statements?: TrueFalseStatement[];
  correctOptionId?: string | null;
  correctAnswer?: boolean | null;
  points?: number;
  explanation?: string | null;
  orderIndex?: number;
}

export function validateTeacherQuestionInput(raw: unknown): TeacherQuestionInput {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "داده‌های ورودی سوال معتبر نیست");
  }
  const input = raw as Partial<TeacherQuestionInput>;

  const questionType: QuestionType =
    input.questionType === "descriptive"
      ? "descriptive"
      : input.questionType === "true_false"
      ? "true_false"
      : "single_choice";

  if (
    input.questionType !== undefined &&
    input.questionType !== "single_choice" &&
    input.questionType !== "descriptive" &&
    input.questionType !== "true_false"
  ) {
    throw new DomainError("bad_request", `نوع سوال نامعتبر است: ${String(input.questionType)}`);
  }

  let prompt = "";
  let validOptions: ExamOption[] = [];
  let validStatements: TrueFalseStatement[] | undefined = undefined;
  let correctOptionId: string | null = null;

  if (questionType === "true_false") {
    // Fixed prompt for true_false questions
    prompt = TRUE_FALSE_FIXED_PROMPT;

    if (!Array.isArray(input.statements) || input.statements.length < 1 || input.statements.length > 8) {
      throw new DomainError(
        "bad_request",
        "سوال صحیح/غلط باید حداقل ۱ و حداکثر ۸ گزاره داشته باشد",
      );
    }

    const seenStatementIds = new Set<string>();
    validStatements = [];

    for (const stmt of input.statements) {
      if (!stmt || typeof stmt !== "object") {
        throw new DomainError("bad_request", "گزاره معتبر نیست");
      }
      if (typeof stmt.id !== "string" || stmt.id.trim().length === 0) {
        throw new DomainError("bad_request", "شناسه گزاره الزامی است");
      }
      if (typeof stmt.text !== "string" || stmt.text.trim().length === 0) {
        throw new DomainError("bad_request", "متن گزاره نمی‌تواند خالی باشد");
      }
      if (typeof stmt.correctAnswer !== "boolean") {
        throw new DomainError(
          "bad_request",
          "پاسخ صحیح هر گزاره باید مشخص باشد (صحیح یا غلط)",
        );
      }
      const trimmedId = stmt.id.trim();
      if (seenStatementIds.has(trimmedId)) {
        throw new DomainError("bad_request", `شناسه گزاره تکراری است: ${trimmedId}`);
      }
      seenStatementIds.add(trimmedId);
      validStatements.push({
        id: trimmedId,
        text: stmt.text.trim(),
        correctAnswer: stmt.correctAnswer,
      });
    }

    validOptions = [];
    correctOptionId = null;
  } else if (questionType === "single_choice") {
    assertNonEmptyString(input.prompt, "صورت سوال", 1, 10000);
    prompt = input.prompt.trim();

    if (
      !Array.isArray(input.options) ||
      input.options.length < 4 ||
      input.options.length > 6
    ) {
      throw new DomainError(
        "bad_request",
        "سوال تستی باید دارای ۴، ۵ یا ۶ گزینه باشد",
      );
    }

    const seenOptionIds = new Set<string>();

    for (const opt of input.options) {
      if (!opt || typeof opt !== "object") {
        throw new DomainError("bad_request", "گزینه معتبر نیست");
      }
      if (typeof opt.id !== "string" || opt.id.trim().length === 0) {
        throw new DomainError("bad_request", "شناسه گزینه الزامی است");
      }
      if (typeof opt.text !== "string" || opt.text.trim().length === 0) {
        throw new DomainError("bad_request", "متن گزینه نمی‌تواند خالی باشد");
      }
      if (seenOptionIds.has(opt.id)) {
        throw new DomainError("bad_request", `شناسه گزینه تکراری است: ${opt.id}`);
      }
      seenOptionIds.add(opt.id);
      validOptions.push({ id: opt.id.trim(), text: opt.text.trim() });
    }

    if (
      typeof input.correctOptionId !== "string" ||
      !seenOptionIds.has(input.correctOptionId)
    ) {
      throw new DomainError(
        "bad_request",
        "شناسه گزینه صحیح باید دقیقاً یکی از گزینه‌های همان سوال باشد",
      );
    }
    correctOptionId = input.correctOptionId.trim();
  } else {
    // Descriptive question: options and correctOptionId are not required
    assertNonEmptyString(input.prompt, "صورت سوال", 1, 10000);
    prompt = input.prompt.trim();
    validOptions = [];
    correctOptionId = null;
  }

  let points = 1;
  if (input.points !== undefined) {
    if (typeof input.points !== "number" || !Number.isFinite(input.points) || input.points <= 0) {
      throw new DomainError("bad_request", "بارم سوال باید عددی مثبت باشد");
    }
    if (Math.abs(input.points * 100 - Math.round(input.points * 100)) > 1e-6) {
      throw new DomainError("bad_request", "بارم سوال حداکثر می‌تواند ۲ رقم اعشار داشته باشد");
    }
    points = normalizeScore(input.points);
  }

  let explanation: string | null = null;
  if (typeof input.explanation === "string") {
    explanation = input.explanation.trim() || null;
  }

  return {
    prompt,
    questionType,
    options: validOptions,
    statements: validStatements,
    correctOptionId,
    points,
    explanation,
    orderIndex: typeof input.orderIndex === "number" && input.orderIndex >= 0 ? input.orderIndex : 0,
  };
}

import {
  type DescriptiveAnswerIntegrityData,
  type DescriptivePasteEvent,
  type DescriptiveRapidInputEvent,
  type DescriptiveTimelineEvent,
  type DescriptiveTimelineEventType,
  INTEGRITY_LIMITS,
} from "./integrity.js";

export interface SaveAnswerInput {
  questionId: string;
  selectedOptionId?: string | null;
  booleanAnswer?: boolean | null;
  booleanAnswers?: Record<string, boolean> | null;
  textAnswer?: string | null;
  finalized?: boolean;
  activeDurationMs?: number | null;
  tabSwitchesCount?: number | null;
  integrityData?: DescriptiveAnswerIntegrityData | null;
}

export function validateDescriptiveAnswerIntegrityInput(
  raw: unknown,
): DescriptiveAnswerIntegrityData | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const input = raw as Partial<DescriptiveAnswerIntegrityData>;

  const sanitizeNumber = (val: unknown, maxVal: number): number => {
    if (typeof val !== "number" || !Number.isFinite(val) || isNaN(val) || val < 0) {
      return 0;
    }
    return Math.min(Math.round(val), maxVal);
  };

  const sanitizeIso = (val: unknown): string | null => {
    if (typeof val !== "string") return null;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  const startedAt = sanitizeIso(input.startedAt);
  const lastEditedAt = sanitizeIso(input.lastEditedAt);
  const durationMs =
    input.durationMs !== undefined && input.durationMs !== null
      ? sanitizeNumber(input.durationMs, INTEGRITY_LIMITS.maxDurationMs)
      : null;

  const editCount = sanitizeNumber(input.editCount, INTEGRITY_LIMITS.maxEditCount);
  const pasteCount = sanitizeNumber(input.pasteCount, INTEGRITY_LIMITS.maxPasteEvents);
  const pastedCharactersTotal = sanitizeNumber(
    input.pastedCharactersTotal,
    INTEGRITY_LIMITS.maxCharacters,
  );
  const pastedWordsTotal = sanitizeNumber(input.pastedWordsTotal, INTEGRITY_LIMITS.maxWords);
  const rapidInputCount = sanitizeNumber(
    input.rapidInputCount,
    INTEGRITY_LIMITS.maxRapidInputEvents,
  );
  const rapidInputCharactersTotal = sanitizeNumber(
    input.rapidInputCharactersTotal,
    INTEGRITY_LIMITS.maxCharacters,
  );
  const rapidInputWordsTotal = sanitizeNumber(
    input.rapidInputWordsTotal,
    INTEGRITY_LIMITS.maxWords,
  );

  const pasteEvents: DescriptivePasteEvent[] = [];
  if (Array.isArray(input.pasteEvents)) {
    const rawEvents = input.pasteEvents.slice(0, INTEGRITY_LIMITS.maxPasteEvents);
    for (const ev of rawEvents) {
      if (ev && typeof ev === "object") {
        const ts = sanitizeIso(ev.timestamp) ?? new Date().toISOString();
        const chars = sanitizeNumber(ev.characterCount, INTEGRITY_LIMITS.maxCharacters);
        const words = sanitizeNumber(ev.wordCount, INTEGRITY_LIMITS.maxWords);
        const cursor =
          ev.cursorPosition !== undefined && ev.cursorPosition !== null
            ? sanitizeNumber(ev.cursorPosition, INTEGRITY_LIMITS.maxCharacters)
            : null;
        pasteEvents.push({
          timestamp: ts,
          characterCount: chars,
          wordCount: words,
          cursorPosition: cursor,
        });
      }
    }
  }

  const rapidInputEvents: DescriptiveRapidInputEvent[] = [];
  if (Array.isArray(input.rapidInputEvents)) {
    const rawEvents = input.rapidInputEvents.slice(0, INTEGRITY_LIMITS.maxRapidInputEvents);
    for (const ev of rawEvents) {
      if (ev && typeof ev === "object") {
        const ts = sanitizeIso(ev.timestamp) ?? new Date().toISOString();
        const chars = sanitizeNumber(ev.characterCount, INTEGRITY_LIMITS.maxCharacters);
        const words = sanitizeNumber(ev.wordCount, INTEGRITY_LIMITS.maxWords);
        const dur = sanitizeNumber(ev.durationMs, INTEGRITY_LIMITS.maxDurationMs);
        const cps = typeof ev.charactersPerSecond === "number" && Number.isFinite(ev.charactersPerSecond) && ev.charactersPerSecond >= 0
          ? Math.min(Math.round(ev.charactersPerSecond * 100) / 100, 10000)
          : 0;
        const wps = typeof ev.wordsPerSecond === "number" && Number.isFinite(ev.wordsPerSecond) && ev.wordsPerSecond >= 0
          ? Math.min(Math.round(ev.wordsPerSecond * 100) / 100, 1000)
          : 0;
        rapidInputEvents.push({
          timestamp: ts,
          characterCount: chars,
          wordCount: words,
          durationMs: dur,
          charactersPerSecond: cps,
          wordsPerSecond: wps,
        });
      }
    }
  }

  const VALID_EVENT_TYPES: readonly DescriptiveTimelineEventType[] = [
    "start",
    "typing",
    "paste",
    "rapid_input",
    "edit",
    "submit",
  ];

  const timeline: DescriptiveTimelineEvent[] = [];
  if (Array.isArray(input.timeline)) {
    const rawTimeline = input.timeline.slice(0, INTEGRITY_LIMITS.maxTimelineEvents);
    for (const ev of rawTimeline) {
      if (ev && typeof ev === "object" && VALID_EVENT_TYPES.includes(ev.type)) {
        const ts = sanitizeIso(ev.timestamp) ?? new Date().toISOString();
        const charDelta =
          ev.characterDelta !== undefined && ev.characterDelta !== null
            ? sanitizeNumber(ev.characterDelta, INTEGRITY_LIMITS.maxCharacters)
            : null;
        const wordDelta =
          ev.wordDelta !== undefined && ev.wordDelta !== null
            ? sanitizeNumber(ev.wordDelta, INTEGRITY_LIMITS.maxWords)
            : null;

        let safeMetadata: Record<string, string | number | boolean | null> | undefined;
        if (ev.metadata && typeof ev.metadata === "object") {
          safeMetadata = {};
          for (const [k, v] of Object.entries(ev.metadata)) {
            if (typeof v === "string" && v.length <= 100) {
              safeMetadata[k] = v;
            } else if (typeof v === "number" && Number.isFinite(v)) {
              safeMetadata[k] = v;
            } else if (typeof v === "boolean" || v === null) {
              safeMetadata[k] = v;
            }
          }
        }

        timeline.push({
          type: ev.type,
          timestamp: ts,
          characterDelta: charDelta,
          wordDelta: wordDelta,
          metadata: safeMetadata,
        });
      }
    }
  }

  return {
    startedAt,
    lastEditedAt,
    durationMs,
    editCount,
    pasteCount,
    pastedCharactersTotal,
    pastedWordsTotal,
    rapidInputCount,
    rapidInputCharactersTotal,
    rapidInputWordsTotal,
    pasteEvents: pasteEvents.length > 0 ? pasteEvents : undefined,
    rapidInputEvents: rapidInputEvents.length > 0 ? rapidInputEvents : undefined,
    timeline: timeline.length > 0 ? timeline : undefined,
  };
}

export function validateSaveAnswerInput(raw: unknown): SaveAnswerInput {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "داده‌های ورودی پاسخ معتبر نیست");
  }
  const input = raw as Partial<SaveAnswerInput>;

  assertUuid(input.questionId, "شناسه سوال");

  let selectedOptionId: string | null = null;
  if (typeof input.selectedOptionId === "string" && input.selectedOptionId.trim().length > 0) {
    selectedOptionId = input.selectedOptionId.trim();
    if (selectedOptionId.length > 64) {
      throw new DomainError("bad_request", "شناسه گزینه نمی‌تواند بیشتر از ۶۴ کاراکتر باشد");
    }
  } else if (typeof input.booleanAnswer === "boolean") {
    selectedOptionId = input.booleanAnswer ? "true" : "false";
  }

  let booleanAnswers: Record<string, boolean> | null = null;
  if (input.booleanAnswers && typeof input.booleanAnswers === "object" && !Array.isArray(input.booleanAnswers)) {
    booleanAnswers = {};
    for (const [k, v] of Object.entries(input.booleanAnswers)) {
      if (typeof k === "string" && k.trim().length > 0 && typeof v === "boolean") {
        booleanAnswers[k.trim()] = v;
      }
    }
  }

  let textAnswer: string | null = null;
  if (booleanAnswers && Object.keys(booleanAnswers).length > 0) {
    textAnswer = JSON.stringify(booleanAnswers);
  } else if (typeof input.textAnswer === "string") {
    if (input.textAnswer.length > 10000) {
      throw new DomainError("bad_request", "پاسخ تشریحی نمی‌تواند بیشتر از ۱۰,۰۰۰ کاراکتر باشد");
    }
    textAnswer = input.textAnswer;
  }

  let activeDurationMs: number | null = null;
  if (input.activeDurationMs !== undefined && input.activeDurationMs !== null) {
    if (
      typeof input.activeDurationMs !== "number" ||
      !Number.isFinite(input.activeDurationMs) ||
      input.activeDurationMs < 0 ||
      input.activeDurationMs > 86400000
    ) {
      throw new DomainError("bad_request", "مدت زمان فعال سؤال نامعتبر است");
    }
    activeDurationMs = Math.round(input.activeDurationMs);
  }

  let tabSwitchesCount: number | null = null;
  if (input.tabSwitchesCount !== undefined && input.tabSwitchesCount !== null) {
    if (
      typeof input.tabSwitchesCount !== "number" ||
      !Number.isInteger(input.tabSwitchesCount) ||
      input.tabSwitchesCount < 0
    ) {
      throw new DomainError("bad_request", "تعداد خروج از تب نامعتبر است");
    }
    tabSwitchesCount = input.tabSwitchesCount;
  }

  const integrityData = validateDescriptiveAnswerIntegrityInput(input.integrityData);

  return {
    questionId: input.questionId,
    selectedOptionId,
    textAnswer,
    finalized: Boolean(input.finalized),
    activeDurationMs,
    tabSwitchesCount,
    integrityData,
  };
}

/**
 * Normalizes a numeric score to two decimal places deterministically (scale = 2).
 */
export function normalizeScore(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface GradeDescriptiveAnswerInput {
  pointsEarned: number;
  teacherFeedback?: string | null;
}

export function validateGradeDescriptiveAnswerInput(
  raw: unknown,
  maxPoints?: number,
): GradeDescriptiveAnswerInput {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "داده‌های نمره‌دهی معتبر نیست");
  }
  const input = raw as Partial<GradeDescriptiveAnswerInput>;

  if (
    typeof input.pointsEarned !== "number" ||
    !Number.isFinite(input.pointsEarned) ||
    input.pointsEarned < 0
  ) {
    throw new DomainError("bad_request", "نمره داده‌شده باید عددی مثبت یا صفر باشد");
  }

  // Reject raw values that have more than 2 decimal places (scale > 2)
  if (Math.abs(input.pointsEarned * 100 - Math.round(input.pointsEarned * 100)) > 1e-6) {
    throw new DomainError(
      "bad_request",
      "نمره داده‌شده حداکثر می‌تواند ۲ رقم اعشار داشته باشد",
    );
  }

  // Reject raw values that exceed maxPoints before rounding (accounting for floating point epsilon)
  if (maxPoints !== undefined && input.pointsEarned > maxPoints + 1e-9) {
    throw new DomainError(
      "bad_request",
      `نمره داده‌شده نمی‌تواند بیشتر از بارم سؤال (${maxPoints}) باشد`,
    );
  }

  const normalizedPoints = normalizeScore(input.pointsEarned);

  // If normalized points exceed maxPoints
  if (maxPoints !== undefined && normalizedPoints > maxPoints) {
    throw new DomainError(
      "bad_request",
      `نمره داده‌شده نمی‌تواند بیشتر از بارم سؤال (${maxPoints}) باشد`,
    );
  }

  let teacherFeedback: string | null = null;
  if (typeof input.teacherFeedback === "string") {
    teacherFeedback = input.teacherFeedback.trim() || null;
    if (teacherFeedback && teacherFeedback.length > 5000) {
      throw new DomainError("bad_request", "بازخورد استاد نمی‌تواند بیشتر از ۵۰۰۰ کاراکتر باشد");
    }
  }

  return {
    pointsEarned: normalizedPoints,
    teacherFeedback,
  };
}

export interface JoinClassroomInput {
  inviteCode: string;
}

export function validateJoinClassroomInput(raw: unknown): JoinClassroomInput {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "داده‌های ورودی کد دعوت معتبر نیست");
  }
  const input = raw as Partial<JoinClassroomInput>;

  assertNonEmptyString(input.inviteCode, "کد دعوت", 4, 16);

  return {
    inviteCode: input.inviteCode.trim().toUpperCase(),
  };
}

export interface UpdateClassroomInput {
  title?: string;
  description?: string | null;
}

export function validateUpdateClassroomInput(raw: unknown): UpdateClassroomInput {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "داده‌های ویرایش کلاس معتبر نیست");
  }
  const input = raw as Partial<UpdateClassroomInput>;
  const result: UpdateClassroomInput = {};

  if (input.title !== undefined) {
    assertNonEmptyString(input.title, "عنوان کلاس", 3, 255);
    result.title = input.title.trim();
  }

  if (input.description !== undefined) {
    if (input.description === null) {
      result.description = null;
    } else if (typeof input.description === "string") {
      const trimmed = input.description.trim();
      if (trimmed.length > 1000) {
        throw new DomainError("bad_request", "توضیحات کلاس نمی‌تواند بیشتر از ۱۰۰۰ کاراکتر باشد");
      }
      result.description = trimmed || null;
    } else {
      throw new DomainError("bad_request", "توضیحات کلاس نامعتبر است");
    }
  }

  return result;
}

export interface UpdateExamInput {
  title?: string;
  description?: string | null;
  durationMinutes?: number | null;
  startsAt?: string;
  endsAt?: string;
  passingScorePercentage?: number | null;
  shuffleQuestions?: boolean;
  shuffleOptions?: boolean;
  showResultsImmediately?: boolean;
  allowBackNavigation?: boolean;
  perQuestionTimeSeconds?: number | null;
}

export function validateUpdateExamInput(raw: unknown): UpdateExamInput {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "داده‌های ویرایش آزمون معتبر نیست");
  }
  const input = raw as Partial<UpdateExamInput>;
  const result: UpdateExamInput = {};

  if (input.title !== undefined) {
    assertNonEmptyString(input.title, "عنوان آزمون", 3, 255);
    result.title = input.title.trim();
  }

  if (input.description !== undefined) {
    if (input.description === null) {
      result.description = null;
    } else if (typeof input.description === "string") {
      const trimmed = input.description.trim();
      if (trimmed.length > 2000) {
        throw new DomainError("bad_request", "توضیحات آزمون نمی‌تواند بیشتر از ۲۰۰۰ کاراکتر باشد");
      }
      result.description = trimmed || null;
    } else {
      throw new DomainError("bad_request", "توضیحات آزمون نامعتبر است");
    }
  }

  if (input.durationMinutes !== undefined) {
    if (input.durationMinutes === null) {
      result.durationMinutes = null;
    } else if (
      typeof input.durationMinutes !== "number" ||
      !Number.isInteger(input.durationMinutes) ||
      input.durationMinutes < 5 ||
      input.durationMinutes > 360
    ) {
      throw new DomainError("bad_request", "مدت زمان آزمون باید بین ۵ تا ۳۶۰ دقیقه باشد");
    } else {
      result.durationMinutes = input.durationMinutes;
    }
  }

  if (input.startsAt !== undefined) {
    if (typeof input.startsAt !== "string" || isNaN(Date.parse(input.startsAt))) {
      throw new DomainError("bad_request", "تاریخ شروع آزمون نامعتبر است");
    }
    result.startsAt = new Date(input.startsAt).toISOString();
  }

  if (input.endsAt !== undefined) {
    if (typeof input.endsAt !== "string" || isNaN(Date.parse(input.endsAt))) {
      throw new DomainError("bad_request", "تاریخ پایان آزمون نامعتبر است");
    }
    result.endsAt = new Date(input.endsAt).toISOString();
  }

  if (result.startsAt && result.endsAt) {
    if (new Date(result.startsAt).getTime() >= new Date(result.endsAt).getTime()) {
      throw new DomainError("bad_request", "زمان شروع آزمون باید قبل از زمان پایان باشد");
    }
  }

  if (input.passingScorePercentage !== undefined) {
    if (input.passingScorePercentage === null) {
      result.passingScorePercentage = null;
    } else if (
      typeof input.passingScorePercentage !== "number" ||
      input.passingScorePercentage < 0 ||
      input.passingScorePercentage > 100
    ) {
      throw new DomainError("bad_request", "حداقل نمره قبولی باید عددی بین ۰ تا ۱۰۰ باشد");
    } else {
      result.passingScorePercentage = input.passingScorePercentage;
    }
  }

  if (input.shuffleQuestions !== undefined) {
    result.shuffleQuestions = Boolean(input.shuffleQuestions);
  }

  if (input.shuffleOptions !== undefined) {
    result.shuffleOptions = Boolean(input.shuffleOptions);
  }

  if (input.showResultsImmediately !== undefined) {
    result.showResultsImmediately = Boolean(input.showResultsImmediately);
  }

  if (input.perQuestionTimeSeconds !== undefined) {
    if (input.perQuestionTimeSeconds === null || input.perQuestionTimeSeconds === 0) {
      result.perQuestionTimeSeconds = null;
    } else if (
      typeof input.perQuestionTimeSeconds !== "number" ||
      !Number.isInteger(input.perQuestionTimeSeconds) ||
      input.perQuestionTimeSeconds < 5 ||
      input.perQuestionTimeSeconds > 3600
    ) {
      throw new DomainError(
        "bad_request",
        "زمان هر سؤال باید بین ۵ تا ۳۶۰۰ ثانیه باشد",
      );
    } else {
      result.perQuestionTimeSeconds = input.perQuestionTimeSeconds;
      if (input.allowBackNavigation === true) {
        throw new DomainError(
          "bad_request",
          "در آزمون زمان‌دار، پس از پایان هر سؤال امکان بازگشت به سؤال قبلی وجود ندارد",
        );
      }
      result.allowBackNavigation = false;
    }
  }

  if (input.allowBackNavigation !== undefined) {
    if (result.perQuestionTimeSeconds && result.perQuestionTimeSeconds > 0 && input.allowBackNavigation === true) {
      throw new DomainError(
        "bad_request",
        "در آزمون زمان‌دار، پس از پایان هر سؤال امکان بازگشت به سؤال قبلی وجود ندارد",
      );
    }
    result.allowBackNavigation = Boolean(input.allowBackNavigation);
  }

  return result;
}

export function validateReorderQuestionsInput(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "داده‌های مرتب‌سازی سوالات معتبر نیست");
  }
  const input = raw as { questionIds?: unknown };
  if (!Array.isArray(input.questionIds) || input.questionIds.length === 0) {
    throw new DomainError("bad_request", "آرایه شناسه‌های سوالات الزامی است");
  }
  for (const qId of input.questionIds) {
    if (!isValidUuid(qId)) {
      throw new DomainError("bad_request", `شناسه سوال نامعتبر است: ${String(qId)}`);
    }
  }
  return input.questionIds as string[];
}

// ---------------------------------------------------------------------------
// Assignment Validation Schemas
// ---------------------------------------------------------------------------

export interface CreateAssignmentDTO {
  classroomId: string;
  title: string;
  description?: string | null;
  startsAt: string;
  dueAt: string;
  status?: "draft" | "published";
}

export interface UpdateAssignmentDTO {
  title?: string;
  description?: string | null;
  startsAt?: string;
  dueAt?: string;
  status?: "draft" | "published" | "archived";
}

export interface SubmitAssignmentDTO {
  answerText?: string;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  attachmentSizeBytes?: number | null;
}

export function validateCreateAssignmentInput(raw: unknown): CreateAssignmentDTO {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "داده‌های ورودی تعریف تکلیف معتبر نیست");
  }
  const input = raw as Record<string, unknown>;

  assertUuid(input.classroomId, "شناسه کلاس");
  assertNonEmptyString(input.title, "عنوان تکلیف", 2, 255);

  if (typeof input.startsAt !== "string" || isNaN(Date.parse(input.startsAt))) {
    throw new DomainError("bad_request", "زمان شروع تکلیف نامعتبر است");
  }
  if (typeof input.dueAt !== "string" || isNaN(Date.parse(input.dueAt))) {
    throw new DomainError("bad_request", "مهلت ارسال تکلیف نامعتبر است");
  }

  const startTime = new Date(input.startsAt).getTime();
  const dueTime = new Date(input.dueAt).getTime();

  if (dueTime <= startTime) {
    throw new DomainError("bad_request", "مهلت ارسال تکلیف باید بعد از زمان شروع باشد");
  }

  let status: "draft" | "published" = "draft";
  if (input.status !== undefined) {
    if (input.status !== "draft" && input.status !== "published") {
      throw new DomainError("bad_request", "وضعیت اولیه تکلیف باید draft یا published باشد");
    }
    status = input.status;
  }

  let description: string | null = null;
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== "string") {
      throw new DomainError("bad_request", "توضیحات تکلیف باید رشته متنی باشد");
    }
    description = input.description.trim() || null;
  }

  return {
    classroomId: input.classroomId,
    title: (input.title as string).trim(),
    description,
    startsAt: new Date(startTime).toISOString(),
    dueAt: new Date(dueTime).toISOString(),
    status,
  };
}

export function validateUpdateAssignmentInput(raw: unknown): UpdateAssignmentDTO {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "داده‌های ویرایش تکلیف معتبر نیست");
  }
  const input = raw as Record<string, unknown>;
  const result: UpdateAssignmentDTO = {};

  if (input.title !== undefined) {
    assertNonEmptyString(input.title, "عنوان تکلیف", 2, 255);
    result.title = (input.title as string).trim();
  }

  if (input.description !== undefined) {
    if (input.description === null) {
      result.description = null;
    } else if (typeof input.description === "string") {
      result.description = input.description.trim() || null;
    } else {
      throw new DomainError("bad_request", "توضیحات تکلیف باید رشته متنی باشد");
    }
  }

  if (input.status !== undefined) {
    if (
      input.status !== "draft" &&
      input.status !== "published" &&
      input.status !== "archived"
    ) {
      throw new DomainError("bad_request", "وضعیت نامعتبر است");
    }
    result.status = input.status;
  }

  if (input.startsAt !== undefined) {
    if (typeof input.startsAt !== "string" || isNaN(Date.parse(input.startsAt))) {
      throw new DomainError("bad_request", "زمان شروع تکلیف نامعتبر است");
    }
    result.startsAt = new Date(input.startsAt).toISOString();
  }

  if (input.dueAt !== undefined) {
    if (typeof input.dueAt !== "string" || isNaN(Date.parse(input.dueAt))) {
      throw new DomainError("bad_request", "مهلت ارسال تکلیف نامعتبر است");
    }
    result.dueAt = new Date(input.dueAt).toISOString();
  }

  if (result.startsAt && result.dueAt) {
    if (new Date(result.startsAt).getTime() >= new Date(result.dueAt).getTime()) {
      throw new DomainError("bad_request", "مهلت ارسال تکلیف باید بعد از زمان شروع باشد");
    }
  }

  return result;
}

export const MAX_ASSIGNMENT_ANSWER_LENGTH = 15000;

export function validateSubmitAssignmentInput(raw: unknown): SubmitAssignmentDTO {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "داده‌های ارسال پاسخ معتبر نیست");
  }
  const input = raw as Record<string, unknown>;

  const answerText =
    typeof input.answerText === "string" ? input.answerText.trim() : "";
  const attachmentUrl =
    typeof input.attachmentUrl === "string" && input.attachmentUrl.trim().length > 0
      ? input.attachmentUrl.trim()
      : null;
  const attachmentName =
    typeof input.attachmentName === "string" && input.attachmentName.trim().length > 0
      ? input.attachmentName.trim()
      : null;
  const attachmentSizeBytes =
    typeof input.attachmentSizeBytes === "number" &&
    Number.isFinite(input.attachmentSizeBytes) &&
    input.attachmentSizeBytes >= 0
      ? Math.round(input.attachmentSizeBytes)
      : null;

  if (answerText.length === 0 && !attachmentUrl) {
    throw new DomainError(
      "bad_request",
      "لطفاً متن پاسخ یا فایل پیوست را وارد کنید",
    );
  }

  if (answerText.length > MAX_ASSIGNMENT_ANSWER_LENGTH) {
    throw new DomainError(
      "bad_request",
      "متن پاسخ نمی‌تواند بیشتر از ۱۵٬۰۰۰ کاراکتر باشد",
    );
  }

  return {
    answerText,
    attachmentUrl,
    attachmentName,
    attachmentSizeBytes,
  };
}

// ---------------------------------------------------------------------------
// Educational Content Validation Schemas
// ---------------------------------------------------------------------------

export const VALID_CLASSROOM_CONTENT_TYPES: readonly ClassroomContentType[] = [
  "text",
  "image",
  "pdf",
  "word",
  "powerpoint",
  "video_external",
];

export const VALID_CLASSROOM_CONTENT_STATUSES: readonly ClassroomContentStatus[] = [
  "draft",
  "published",
  "archived",
];

export function isClassroomContentType(val: unknown): val is ClassroomContentType {
  return typeof val === "string" && VALID_CLASSROOM_CONTENT_TYPES.includes(val as ClassroomContentType);
}

export function isClassroomContentStatus(val: unknown): val is ClassroomContentStatus {
  return typeof val === "string" && VALID_CLASSROOM_CONTENT_STATUSES.includes(val as ClassroomContentStatus);
}

export const MAX_CONTENT_TEXT_LENGTH = 25_000;
export const MAX_CONTENT_TITLE_LENGTH = 255;
export const MAX_CONTENT_DESCRIPTION_LENGTH = 2_000;

export interface CreateClassroomContentDTO {
  classroomId: string;
  title: string;
  description?: string | null;
  contentType: ClassroomContentType;
  textContent?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  mimeType?: string | null;
  externalUrl?: string | null;
  status?: "draft" | "published";
}

export type CreateClassroomContentInput = Omit<CreateClassroomContentDTO, "classroomId">;

export interface UpdateClassroomContentDTO {
  title?: string;
  description?: string | null;
  contentType?: ClassroomContentType;
  textContent?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  mimeType?: string | null;
  externalUrl?: string | null;
  status?: "draft" | "published" | "archived";
}

export type UpdateClassroomContentInput = UpdateClassroomContentDTO;

export function validateCreateClassroomContentInput(raw: unknown): CreateClassroomContentDTO {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "داده‌های ورودی محتوای آموزشی معتبر نیست");
  }
  const input = raw as Record<string, unknown>;

  assertUuid(input.classroomId, "شناسه کلاس");
  assertNonEmptyString(input.title, "عنوان محتوا", 2, MAX_CONTENT_TITLE_LENGTH);

  const rawContentType = input.contentType;
  if (!isClassroomContentType(rawContentType)) {
    throw new DomainError(
      "bad_request",
      "نوع محتوای آموزشی نامعتبر است. انواع مجاز: text، image، pdf، word، powerpoint و video_external",
    );
  }

  let description: string | null = null;
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== "string") {
      throw new DomainError("bad_request", "توضیحات محتوا باید رشته متنی باشد");
    }
    description = input.description.trim() || null;
    if (description && description.length > MAX_CONTENT_DESCRIPTION_LENGTH) {
      throw new DomainError(
        "bad_request",
        `توضیحات محتوا نمی‌تواند بیشتر از ${MAX_CONTENT_DESCRIPTION_LENGTH} کاراکتر باشد`,
      );
    }
  }

  let status: "draft" | "published" = "draft";
  if (input.status !== undefined) {
    if (input.status !== "draft" && input.status !== "published") {
      throw new DomainError("bad_request", "وضعیت اولیه محتوا باید draft یا published باشد");
    }
    status = input.status;
  }

  let textContent: string | null = null;
  let fileUrl: string | null = null;
  let fileName: string | null = null;
  let fileSizeBytes: number | null = null;
  let mimeType: string | null = null;
  let externalUrl: string | null = null;

  if (rawContentType === "text") {
    if (typeof input.textContent !== "string" || input.textContent.trim().length === 0) {
      throw new DomainError("bad_request", "متن محتوای آموزشی نمی‌تواند خالی باشد");
    }
    if (input.textContent.trim().length > MAX_CONTENT_TEXT_LENGTH) {
      throw new DomainError(
        "bad_request",
        "متن محتوا نمی‌تواند بیشتر از ۲۵٬۰۰۰ کاراکتر باشد",
      );
    }
    textContent = input.textContent.trim();
  } else if (rawContentType === "video_external") {
    if (typeof input.externalUrl !== "string" || input.externalUrl.trim().length === 0) {
      throw new DomainError("bad_request", "آدرس اینترنتی ویدئو الزامی است");
    }
    // Validation + provider detection will throw DomainError if invalid / unsafe scheme
    detectExternalVideoProvider(input.externalUrl);
    externalUrl = input.externalUrl.trim();
  } else {
    // image, pdf, word, powerpoint
    if (typeof input.fileUrl !== "string" || input.fileUrl.trim().length === 0) {
      throw new DomainError("bad_request", "فایل محتوای آموزشی الزامی است");
    }
    fileUrl = input.fileUrl.trim();
    fileName =
      typeof input.fileName === "string" && input.fileName.trim().length > 0
        ? input.fileName.trim()
        : null;
    fileSizeBytes =
      typeof input.fileSizeBytes === "number" &&
      Number.isFinite(input.fileSizeBytes) &&
      input.fileSizeBytes >= 0
        ? Math.round(input.fileSizeBytes)
        : null;
    mimeType =
      typeof input.mimeType === "string" && input.mimeType.trim().length > 0
        ? input.mimeType.trim().toLowerCase()
        : null;
  }

  return {
    classroomId: input.classroomId,
    title: (input.title as string).trim(),
    description,
    contentType: rawContentType,
    textContent,
    fileUrl,
    fileName,
    fileSizeBytes,
    mimeType,
    externalUrl,
    status,
  };
}

export function validateUpdateClassroomContentInput(raw: unknown): UpdateClassroomContentDTO {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "داده‌های ویرایش محتوای آموزشی معتبر نیست");
  }
  const input = raw as Record<string, unknown>;
  const result: UpdateClassroomContentDTO = {};

  if (input.title !== undefined) {
    assertNonEmptyString(input.title, "عنوان محتوا", 2, MAX_CONTENT_TITLE_LENGTH);
    result.title = (input.title as string).trim();
  }

  if (input.description !== undefined) {
    if (input.description === null) {
      result.description = null;
    } else if (typeof input.description === "string") {
      const trimmed = input.description.trim();
      if (trimmed.length > MAX_CONTENT_DESCRIPTION_LENGTH) {
        throw new DomainError(
          "bad_request",
          `توضیحات محتوا نمی‌تواند بیشتر از ${MAX_CONTENT_DESCRIPTION_LENGTH} کاراکتر باشد`,
        );
      }
      result.description = trimmed || null;
    } else {
      throw new DomainError("bad_request", "توضیحات محتوا باید رشته متنی باشد");
    }
  }

  if (input.status !== undefined) {
    if (
      input.status !== "draft" &&
      input.status !== "published" &&
      input.status !== "archived"
    ) {
      throw new DomainError("bad_request", "وضعیت محتوا نامعتبر است");
    }
    result.status = input.status;
  }

  if (input.contentType !== undefined) {
    if (!isClassroomContentType(input.contentType)) {
      throw new DomainError(
        "bad_request",
        "نوع محتوای آموزشی نامعتبر است. انواع مجاز: text، image، pdf، word، powerpoint و video_external",
      );
    }
    result.contentType = input.contentType;
  }

  if (input.textContent !== undefined) {
    if (input.textContent === null) {
      result.textContent = null;
    } else if (typeof input.textContent === "string") {
      if (input.textContent.trim().length > MAX_CONTENT_TEXT_LENGTH) {
        throw new DomainError(
          "bad_request",
          "متن محتوا نمی‌تواند بیشتر از ۲۵٬۰۰۰ کاراکتر باشد",
        );
      }
      result.textContent = input.textContent.trim();
    } else {
      throw new DomainError("bad_request", "متن محتوا باید رشته متنی باشد");
    }
  }

  if (input.fileUrl !== undefined) {
    result.fileUrl =
      typeof input.fileUrl === "string" && input.fileUrl.trim().length > 0
        ? input.fileUrl.trim()
        : null;
  }

  if (input.fileName !== undefined) {
    result.fileName =
      typeof input.fileName === "string" && input.fileName.trim().length > 0
        ? input.fileName.trim()
        : null;
  }

  if (input.fileSizeBytes !== undefined) {
    result.fileSizeBytes =
      typeof input.fileSizeBytes === "number" &&
      Number.isFinite(input.fileSizeBytes) &&
      input.fileSizeBytes >= 0
        ? Math.round(input.fileSizeBytes)
        : null;
  }

  if (input.mimeType !== undefined) {
    result.mimeType =
      typeof input.mimeType === "string" && input.mimeType.trim().length > 0
        ? input.mimeType.trim().toLowerCase()
        : null;
  }

  if (input.externalUrl !== undefined) {
    if (input.externalUrl === null) {
      result.externalUrl = null;
    } else if (typeof input.externalUrl === "string") {
      const trimmed = input.externalUrl.trim();
      if (trimmed.length > 0) {
        detectExternalVideoProvider(trimmed);
        result.externalUrl = trimmed;
      } else {
        result.externalUrl = null;
      }
    } else {
      throw new DomainError("bad_request", "آدرس اینترنتی ویدئو نامعتبر است");
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Teacher Student Messaging Schemas & Validation
// ---------------------------------------------------------------------------

export const MAX_MESSAGE_SUBJECT_LENGTH = 255;
export const MAX_MESSAGE_BODY_LENGTH = 10000;

export interface CreateTeacherConversationInput {
  classroomId: string;
  category: TeacherMessageCategory;
  subject: string;
  body: string;
}

export function validateCreateTeacherConversationInput(
  raw: unknown,
): CreateTeacherConversationInput {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "اطلاعات ارسالی نامعتبر است");
  }

  const input = raw as Partial<CreateTeacherConversationInput>;

  assertUuid(input.classroomId, "شناسه کلاس");

  if (!input.category || !isTeacherMessageCategory(input.category)) {
    throw new DomainError(
      "bad_request",
      "موضوع/دسته‌بندی پیام نامعتبر است. لطفاً یکی از دسته‌بندی‌های مجاز را انتخاب کنید.",
    );
  }

  assertNonEmptyString(input.subject, "عنوان پیام", 2, MAX_MESSAGE_SUBJECT_LENGTH);
  assertNonEmptyString(input.body, "متن پیام", 2, MAX_MESSAGE_BODY_LENGTH);

  return {
    classroomId: input.classroomId,
    category: input.category,
    subject: input.subject.trim(),
    body: input.body.trim(),
  };
}

export interface ReplyTeacherConversationInput {
  body: string;
}

export function validateReplyTeacherConversationInput(
  raw: unknown,
): ReplyTeacherConversationInput {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "اطلاعات ارسالی نامعتبر است");
  }

  const input = raw as Partial<ReplyTeacherConversationInput>;
  assertNonEmptyString(input.body, "متن پاسخ", 1, MAX_MESSAGE_BODY_LENGTH);

  return {
    body: input.body.trim(),
  };
}

export interface UpdateTeacherConversationStatusInput {
  status: TeacherMessageStatus;
}

export function validateUpdateTeacherConversationStatusInput(
  raw: unknown,
): UpdateTeacherConversationStatusInput {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "اطلاعات ارسالی نامعتبر است");
  }

  const input = raw as Partial<UpdateTeacherConversationStatusInput>;

  if (!input.status || !isTeacherMessageStatus(input.status)) {
    throw new DomainError(
      "bad_request",
      "وضعیت پیام نامعتبر است. وضعیت‌های مجاز: new، in_progress، answered و closed",
    );
  }

  return {
    status: input.status,
  };
}

export interface ListTeacherConversationsQuery {
  classroomId?: string;
  category?: TeacherMessageCategory | "all";
  status?: TeacherMessageStatus | "all";
  page: number;
  limit: number;
}

export function validateListTeacherConversationsQuery(
  raw: unknown,
): ListTeacherConversationsQuery {
  const query = (raw as Record<string, unknown>) ?? {};

  let classroomId: string | undefined;
  if (query.classroomId && typeof query.classroomId === "string" && query.classroomId.trim().length > 0) {
    if (!isValidUuid(query.classroomId.trim())) {
      throw new DomainError("bad_request", "شناسه کلاس نامعتبر است");
    }
    classroomId = query.classroomId.trim();
  }

  let category: TeacherMessageCategory | "all" | undefined;
  if (query.category && typeof query.category === "string" && query.category.trim().length > 0) {
    const trimmed = query.category.trim();
    if (trimmed !== "all" && !isTeacherMessageCategory(trimmed)) {
      throw new DomainError("bad_request", "دسته‌بندی فیلتر نامعتبر است");
    }
    category = trimmed as TeacherMessageCategory | "all";
  }

  let status: TeacherMessageStatus | "all" | undefined;
  if (query.status && typeof query.status === "string" && query.status.trim().length > 0) {
    const trimmed = query.status.trim();
    if (trimmed !== "all" && !isTeacherMessageStatus(trimmed)) {
      throw new DomainError("bad_request", "وضعیت فیلتر نامعتبر است");
    }
    status = trimmed as TeacherMessageStatus | "all";
  }

  let page = 1;
  if (query.page !== undefined) {
    const parsed = Number(query.page);
    if (!Number.isInteger(parsed) || parsed < 1) {
      throw new DomainError("bad_request", "شماره صفحه باید یک عدد صحیح مثبت باشد");
    }
    page = parsed;
  }

  let limit = 20;
  if (query.limit !== undefined) {
    const parsed = Number(query.limit);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
      throw new DomainError("bad_request", "تعداد در هر صفحه باید بین ۱ تا ۱۰۰ باشد");
    }
    limit = parsed;
  }

  return {
    classroomId,
    category,
    status,
    page,
    limit,
  };
}
