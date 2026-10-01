import { DomainError } from "../errors.js";
import type {
  ClassroomStatus,
  ClassroomMemberStatus,
  ExamPersistedStatus,
  RuntimeExamState,
  AttemptStatus,
  ExamOption,
  QuestionType,
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
  prompt: string;
  questionType?: QuestionType;
  options?: ExamOption[];
  correctOptionId?: string | null;
  points?: number;
  explanation?: string | null;
  orderIndex?: number;
}

export function validateTeacherQuestionInput(raw: unknown): TeacherQuestionInput {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "داده‌های ورودی سوال معتبر نیست");
  }
  const input = raw as Partial<TeacherQuestionInput>;

  assertNonEmptyString(input.prompt, "صورت سوال", 1, 10000);

  const questionType: QuestionType =
    input.questionType === "descriptive" ? "descriptive" : "single_choice";

  if (input.questionType !== undefined && input.questionType !== "single_choice" && input.questionType !== "descriptive") {
    throw new DomainError("bad_request", `نوع سوال نامعتبر است: ${String(input.questionType)}`);
  }

  let validOptions: ExamOption[] = [];
  let correctOptionId: string | null = null;

  if (questionType === "single_choice") {
    if (!Array.isArray(input.options) || input.options.length < 2) {
      throw new DomainError("bad_request", "سوال باید حداقل دارای ۲ گزینه باشد");
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
    validOptions = [];
    correctOptionId = null;
  }

  let points = 1;
  if (input.points !== undefined) {
    if (typeof input.points !== "number" || input.points <= 0) {
      throw new DomainError("bad_request", "بارم سوال باید عددی مثبت باشد");
    }
    points = input.points;
  }

  let explanation: string | null = null;
  if (typeof input.explanation === "string") {
    explanation = input.explanation.trim() || null;
  }

  return {
    prompt: input.prompt.trim(),
    questionType,
    options: validOptions,
    correctOptionId,
    points,
    explanation,
    orderIndex: typeof input.orderIndex === "number" && input.orderIndex >= 0 ? input.orderIndex : 0,
  };
}

export interface SaveAnswerInput {
  questionId: string;
  selectedOptionId?: string | null;
  textAnswer?: string | null;
  finalized?: boolean;
  activeDurationMs?: number | null;
  tabSwitchesCount?: number | null;
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
  }

  let textAnswer: string | null = null;
  if (typeof input.textAnswer === "string") {
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

  return {
    questionId: input.questionId,
    selectedOptionId,
    textAnswer,
    finalized: Boolean(input.finalized),
    activeDurationMs,
    tabSwitchesCount,
  };
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

  if (maxPoints !== undefined && input.pointsEarned > maxPoints) {
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
    pointsEarned: input.pointsEarned,
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
  answerText: string;
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

export function validateSubmitAssignmentInput(raw: unknown): SubmitAssignmentDTO {
  if (!raw || typeof raw !== "object") {
    throw new DomainError("bad_request", "داده‌های ارسال پاسخ معتبر نیست");
  }
  const input = raw as Record<string, unknown>;

  if (typeof input.answerText !== "string" || input.answerText.trim().length === 0) {
    throw new DomainError("bad_request", "متن پاسخ نمی‌تواند خالی باشد");
  }

  if (input.answerText.length > 50000) {
    throw new DomainError("bad_request", "طول متن پاسخ بیش از حد مجاز است");
  }

  return {
    answerText: input.answerText.trim(),
  };
}
