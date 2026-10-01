import { and, eq, desc, asc, count } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  classrooms,
  classroomMembers,
  teacherExams,
  teacherExamQuestions,
  teacherExamAttempts,
  teacherExamAttemptAnswers,
  classroomAssignments,
  classroomAssignmentSubmissions,
  type ClassroomRecord,
  type ClassroomMemberRecord,
  type TeacherExamRecord,
  type TeacherExamQuestionRecord,
  type TeacherExamAttemptRecord,
  type TeacherExamAttemptAnswerRecord,
  type ClassroomAssignmentRecord,
  type ClassroomAssignmentSubmissionRecord,
} from "@avana/database/schema";
import {
  DomainError,
  gradeAttempt,
  isUUID,
  type Classroom,
  type ClassroomMember,
  type TeacherExam,
  type TeacherExamQuestion,
  type TeacherExamAttempt,
  type TeacherExamAttemptAnswer,
  type ClassroomAssignment,
  type AssignmentSubmission,
  type ClassroomStatus,
  type ClassroomMemberStatus,
  type ExamPersistedStatus,
  type AttemptStatus,
  type QuestionType,
  type QuestionGradingStatus,
  type AttemptGradingStatus,
  type ExamSnapshotQuestion,
  type AssignmentPersistedStatus,
  type AssignmentSubmissionStatus,
} from "@avana/domain";


// ---------------------------------------------------------------------------
// Store Interfaces
// ---------------------------------------------------------------------------

export interface ClassroomStore {
  create(classroom: Omit<Classroom, "createdAt" | "updatedAt">): Promise<Classroom>;
  getById(id: string): Promise<Classroom | null>;
  getByInviteCode(code: string): Promise<Classroom | null>;
  listByTeacher(teacherId: string, status?: ClassroomStatus): Promise<Classroom[]>;
  listByOrganization(organizationId: string, status?: ClassroomStatus): Promise<Classroom[]>;
  update(
    id: string,
    patch: Partial<Pick<Classroom, "title" | "description" | "status" | "archivedAt" | "inviteCode">>,
  ): Promise<Classroom | null>;
  archive(id: string): Promise<Classroom | null>;
  delete(id: string): Promise<boolean>;
  hasExamsOrAttempts(id: string): Promise<boolean>;
}

export interface ClassroomMemberStore {
  getMembership(classroomId: string, studentId: string): Promise<ClassroomMember | null>;
  listMembers(classroomId: string, status?: ClassroomMemberStatus): Promise<ClassroomMember[]>;
  listClassroomsForStudent(studentId: string, status?: ClassroomMemberStatus): Promise<ClassroomMember[]>;
  addMember(member: Omit<ClassroomMember, "createdAt" | "updatedAt">): Promise<ClassroomMember>;
  updateStatus(
    classroomId: string,
    studentId: string,
    status: ClassroomMemberStatus,
    leftAt?: string | null,
  ): Promise<ClassroomMember | null>;
  rejoinMember(classroomId: string, studentId: string): Promise<ClassroomMember | null>;
}

export interface TeacherExamStore {
  create(exam: Omit<TeacherExam, "createdAt" | "updatedAt">): Promise<TeacherExam>;
  getById(id: string): Promise<TeacherExam | null>;
  listByClassroom(classroomId: string, status?: ExamPersistedStatus): Promise<TeacherExam[]>;
  update(id: string, patch: Partial<TeacherExam>): Promise<TeacherExam | null>;
  publish(id: string): Promise<TeacherExam | null>;
  unpublish(id: string): Promise<TeacherExam | null>;
  close(id: string, closedAt?: string): Promise<TeacherExam | null>;
  releaseResults(id: string, resultsReleasedAt?: string): Promise<TeacherExam | null>;
  archive(id: string): Promise<TeacherExam | null>;
  delete(id: string): Promise<boolean>;
  hasAttempts(id: string): Promise<boolean>;
}

export interface TeacherExamQuestionStore {
  listByExam(examId: string): Promise<TeacherExamQuestion[]>;
  getById(id: string): Promise<TeacherExamQuestion | null>;
  create(question: Omit<TeacherExamQuestion, "createdAt" | "updatedAt">): Promise<TeacherExamQuestion>;
  createMany(questions: Array<Omit<TeacherExamQuestion, "createdAt" | "updatedAt">>): Promise<TeacherExamQuestion[]>;
  update(id: string, patch: Partial<TeacherExamQuestion>): Promise<TeacherExamQuestion | null>;
  delete(id: string): Promise<boolean>;
  reorder(examId: string, questionIds: string[]): Promise<void>;
}

export interface TeacherExamAttemptStore {
  getById(id: string): Promise<TeacherExamAttempt | null>;
  getByExamAndStudent(examId: string, studentId: string): Promise<TeacherExamAttempt | null>;
  create(attempt: Omit<TeacherExamAttempt, "createdAt" | "updatedAt">): Promise<TeacherExamAttempt>;
  update(id: string, patch: Partial<TeacherExamAttempt>): Promise<TeacherExamAttempt | null>;
  listByExam(examId: string, status?: AttemptStatus): Promise<TeacherExamAttempt[]>;
  listByStudent(studentId: string): Promise<TeacherExamAttempt[]>;
  finalizeAttempt(
    attemptId: string,
    status: "submitted" | "timed_out",
    passingScorePercentage?: number | null,
  ): Promise<TeacherExamAttempt>;
}

export interface TeacherExamAttemptAnswerStore {
  get(attemptId: string, questionId: string): Promise<TeacherExamAttemptAnswer | null>;
  upsert(answer: Omit<TeacherExamAttemptAnswer, "answeredAt">): Promise<TeacherExamAttemptAnswer>;
  listByAttempt(attemptId: string): Promise<TeacherExamAttemptAnswer[]>;
  saveBatch(
    attemptId: string,
    answers: Array<{
      questionId: string;
      selectedOptionId?: string | null;
      isCorrect?: boolean | null;
      pointsEarned?: number | null;
    }>,
  ): Promise<void>;
}

export interface AssignmentStore {
  getById(id: string): Promise<ClassroomAssignment | null>;
  create(data: Omit<ClassroomAssignment, "createdAt" | "updatedAt">): Promise<ClassroomAssignment>;
  update(
    id: string,
    patch: Partial<Omit<ClassroomAssignment, "id" | "classroomId" | "teacherId" | "createdAt" | "updatedAt">>,
  ): Promise<ClassroomAssignment | null>;
  delete(id: string): Promise<boolean>;
  listByClassroom(classroomId: string, status?: AssignmentPersistedStatus): Promise<ClassroomAssignment[]>;
  listByTeacher(teacherId: string): Promise<ClassroomAssignment[]>;
  countByClassroom(classroomId: string): Promise<number>;
}

export interface AssignmentSubmissionStore {
  get(assignmentId: string, studentId: string): Promise<AssignmentSubmission | null>;
  getById(id: string): Promise<AssignmentSubmission | null>;
  upsert(data: Omit<AssignmentSubmission, "submittedAt" | "createdAt" | "updatedAt">): Promise<AssignmentSubmission>;
  listByAssignment(assignmentId: string): Promise<AssignmentSubmission[]>;
  listByStudent(studentId: string): Promise<AssignmentSubmission[]>;
  countByAssignment(assignmentId: string): Promise<number>;
}


// ---------------------------------------------------------------------------
// Row Mappers & Helpers
// ---------------------------------------------------------------------------

function toIsoString(val: Date | string | null | undefined): string | null {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString();
  try {
    return new Date(val).toISOString();
  } catch {
    return null;
  }
}

function requireIsoString(val: Date | string | null | undefined): string {
  if (!val) return new Date().toISOString();
  if (val instanceof Date) return val.toISOString();
  try {
    return new Date(val).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function safeParseJson<T>(val: unknown, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as T;
    } catch {
      return fallback;
    }
  }
  return val as T;
}

function toClassroom(row: ClassroomRecord): Classroom {
  return {
    id: row.id,
    organizationId: row.organizationId,
    teacherId: row.teacherId,
    courseId: row.courseId,
    title: row.title,
    description: row.description,
    inviteCode: row.inviteCode,
    status: row.status as ClassroomStatus,
    createdAt: requireIsoString(row.createdAt),
    updatedAt: requireIsoString(row.updatedAt),
    archivedAt: toIsoString(row.archivedAt),
  };
}

function toClassroomMember(row: ClassroomMemberRecord): ClassroomMember {
  return {
    id: row.id,
    classroomId: row.classroomId,
    studentId: row.studentId,
    status: row.status as ClassroomMemberStatus,
    firstJoinedAt: requireIsoString(row.firstJoinedAt),
    lastJoinedAt: requireIsoString(row.lastJoinedAt),
    leftAt: toIsoString(row.leftAt),
    createdAt: requireIsoString(row.createdAt),
    updatedAt: requireIsoString(row.updatedAt),
  };
}

function toTeacherExam(row: TeacherExamRecord): TeacherExam {
  return {
    id: row.id,
    classroomId: row.classroomId,
    title: row.title,
    description: row.description,
    durationMinutes: row.durationMinutes ?? null,
    startsAt: requireIsoString(row.startsAt),
    endsAt: requireIsoString(row.endsAt),
    passingScorePercentage:
      row.passingScorePercentage !== null && row.passingScorePercentage !== undefined
        ? Number(row.passingScorePercentage)
        : null,
    shuffleQuestions: row.shuffleQuestions,
    shuffleOptions: row.shuffleOptions,
    showResultsImmediately: row.showResultsImmediately,
    allowBackNavigation: row.allowBackNavigation,
    perQuestionTimeSeconds: row.perQuestionTimeSeconds ?? null,
    status: row.status as ExamPersistedStatus,
    closedAt: toIsoString(row.closedAt),
    resultsReleasedAt: toIsoString(row.resultsReleasedAt),
    createdAt: requireIsoString(row.createdAt),
    updatedAt: requireIsoString(row.updatedAt),
    archivedAt: toIsoString(row.archivedAt),
  };
}

function toTeacherExamQuestion(row: TeacherExamQuestionRecord): TeacherExamQuestion {
  return {
    id: row.id,
    examId: row.examId,
    orderIndex: row.orderIndex,
    questionType: (row.questionType as QuestionType) || "single_choice",
    prompt: row.prompt,
    options: row.options
      ? safeParseJson<Array<{ id: string; text: string }>>(row.options, [])
      : [],
    correctOptionId: row.correctOptionId ?? null,
    points: Number(row.points),
    explanation: row.explanation,
    createdAt: requireIsoString(row.createdAt),
    updatedAt: requireIsoString(row.updatedAt),
  };
}

function toTeacherExamAttempt(row: TeacherExamAttemptRecord): TeacherExamAttempt {
  return {
    id: row.id,
    examId: row.examId,
    studentId: row.studentId,
    status: row.status as AttemptStatus,
    gradingStatus: (row.gradingStatus as AttemptGradingStatus) || "fully_graded",
    startedAt: requireIsoString(row.startedAt),
    deadlineAt: requireIsoString(row.deadlineAt),
    submittedAt: toIsoString(row.submittedAt),
    completedAt: toIsoString(row.completedAt),
    score: row.score !== null ? Number(row.score) : null,
    maxScore: row.maxScore !== null ? Number(row.maxScore) : null,
    percentage: row.percentage !== null ? Number(row.percentage) : null,
    passed: row.passed,
    allowBackNavigation: row.allowBackNavigation ?? true,
    perQuestionTimeSeconds: row.perQuestionTimeSeconds ?? null,
    questionSnapshot: safeParseJson<ExamSnapshotQuestion[]>(row.questionSnapshot, []),
    createdAt: requireIsoString(row.createdAt),
    updatedAt: requireIsoString(row.updatedAt),
  };
}

function toTeacherExamAttemptAnswer(row: TeacherExamAttemptAnswerRecord): TeacherExamAttemptAnswer {
  return {
    id: row.id,
    attemptId: row.attemptId,
    questionId: row.questionId,
    selectedOptionId: row.selectedOptionId ?? null,
    textAnswer: row.textAnswer ?? null,
    teacherFeedback: row.teacherFeedback ?? null,
    gradingStatus: (row.gradingStatus as QuestionGradingStatus) || "auto_graded",
    answeredAt: requireIsoString(row.answeredAt),
    finalizedAt: toIsoString(row.finalizedAt),
    isCorrect: row.isCorrect,
    pointsEarned: row.pointsEarned !== null ? Number(row.pointsEarned) : null,
  };
}

function toClassroomAssignment(row: ClassroomAssignmentRecord): ClassroomAssignment {
  return {
    id: row.id,
    classroomId: row.classroomId,
    teacherId: row.teacherId,
    title: row.title,
    description: row.description,
    startsAt: requireIsoString(row.startsAt),
    dueAt: requireIsoString(row.dueAt),
    status: row.status as AssignmentPersistedStatus,
    createdAt: requireIsoString(row.createdAt),
    updatedAt: requireIsoString(row.updatedAt),
    archivedAt: toIsoString(row.archivedAt),
  };
}

function toAssignmentSubmission(row: ClassroomAssignmentSubmissionRecord): AssignmentSubmission {
  return {
    id: row.id,
    assignmentId: row.assignmentId,
    studentId: row.studentId,
    answerText: row.answerText,
    status: row.status as AssignmentSubmissionStatus,
    submittedAt: requireIsoString(row.submittedAt),
    createdAt: requireIsoString(row.createdAt),
    updatedAt: requireIsoString(row.updatedAt),
  };
}


// ---------------------------------------------------------------------------
// Drizzle Implementations
// ---------------------------------------------------------------------------

export class DrizzleClassroomStore implements ClassroomStore {
  constructor(private readonly db: DbClient) {}

  async create(data: Omit<Classroom, "createdAt" | "updatedAt">): Promise<Classroom> {
    const [row] = await this.db
      .insert(classrooms)
      .values({
        id: data.id,
        organizationId: data.organizationId,
        teacherId: data.teacherId,
        courseId: data.courseId ?? null,
        title: data.title,
        description: data.description ?? null,
        inviteCode: data.inviteCode,
        status: data.status ?? "active",
        archivedAt: data.archivedAt ? new Date(data.archivedAt) : null,
      })
      .returning();

    return toClassroom(row);
  }

  async getById(id: string): Promise<Classroom | null> {
    if (!isUUID(id)) return null;
    const [row] = await this.db
      .select()
      .from(classrooms)
      .where(eq(classrooms.id, id))
      .limit(1);

    return row ? toClassroom(row) : null;
  }

  async getByInviteCode(code: string): Promise<Classroom | null> {
    const [row] = await this.db
      .select()
      .from(classrooms)
      .where(eq(classrooms.inviteCode, code))
      .limit(1);

    return row ? toClassroom(row) : null;
  }

  async listByTeacher(teacherId: string, status?: ClassroomStatus): Promise<Classroom[]> {
    if (!isUUID(teacherId)) return [];
    const conditions = [eq(classrooms.teacherId, teacherId)];
    if (status) {
      conditions.push(eq(classrooms.status, status));
    }
    const rows = await this.db
      .select()
      .from(classrooms)
      .where(and(...conditions))
      .orderBy(desc(classrooms.createdAt));

    return rows.map(toClassroom);
  }

  async listByOrganization(organizationId: string, status?: ClassroomStatus): Promise<Classroom[]> {
    if (!isUUID(organizationId)) return [];
    const conditions = [eq(classrooms.organizationId, organizationId)];
    if (status) {
      conditions.push(eq(classrooms.status, status));
    }
    const rows = await this.db
      .select()
      .from(classrooms)
      .where(and(...conditions))
      .orderBy(desc(classrooms.createdAt));

    return rows.map(toClassroom);
  }

  async update(
    id: string,
    patch: Partial<Pick<Classroom, "title" | "description" | "status" | "archivedAt" | "inviteCode">>,
  ): Promise<Classroom | null> {
    if (!isUUID(id)) return null;
    const values: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.archivedAt !== undefined) {
      values.archivedAt = patch.archivedAt ? new Date(patch.archivedAt) : null;
    }
    if (patch.inviteCode !== undefined) values.inviteCode = patch.inviteCode;

    const [row] = await this.db
      .update(classrooms)
      .set(values)
      .where(eq(classrooms.id, id))
      .returning();

    return row ? toClassroom(row) : null;
  }

  async archive(id: string): Promise<Classroom | null> {
    return this.update(id, {
      status: "archived",
      archivedAt: new Date().toISOString(),
    });
  }

  async delete(id: string): Promise<boolean> {
    if (!isUUID(id)) return false;
    // Atomic check in a single query/transaction
    const result = await this.db.transaction(async (tx) => {
      const examRows = await tx
        .select({ id: teacherExams.id })
        .from(teacherExams)
        .where(eq(teacherExams.classroomId, id))
        .limit(1);

      if (examRows.length > 0) {
        return false;
      }

      const attemptRows = await tx
        .select({ id: teacherExamAttempts.id })
        .from(teacherExamAttempts)
        .innerJoin(teacherExams, eq(teacherExamAttempts.examId, teacherExams.id))
        .where(eq(teacherExams.classroomId, id))
        .limit(1);

      if (attemptRows.length > 0) {
        return false;
      }

      const deleted = await tx.delete(classrooms).where(eq(classrooms.id, id)).returning();
      return deleted.length > 0;
    });

    return result;
  }

  async hasExamsOrAttempts(id: string): Promise<boolean> {
    if (!isUUID(id)) return false;
    const examRows = await this.db
      .select({ id: teacherExams.id })
      .from(teacherExams)
      .where(eq(teacherExams.classroomId, id))
      .limit(1);

    if (examRows.length > 0) return true;

    const attemptRows = await this.db
      .select({ id: teacherExamAttempts.id })
      .from(teacherExamAttempts)
      .innerJoin(teacherExams, eq(teacherExamAttempts.examId, teacherExams.id))
      .where(eq(teacherExams.classroomId, id))
      .limit(1);

    return attemptRows.length > 0;
  }
}

export class DrizzleClassroomMemberStore implements ClassroomMemberStore {
  constructor(private readonly db: DbClient) {}

  async getMembership(classroomId: string, studentId: string): Promise<ClassroomMember | null> {
    if (!isUUID(classroomId) || !isUUID(studentId)) return null;
    const [row] = await this.db
      .select()
      .from(classroomMembers)
      .where(and(eq(classroomMembers.classroomId, classroomId), eq(classroomMembers.studentId, studentId)))
      .limit(1);

    return row ? toClassroomMember(row) : null;
  }

  async listMembers(classroomId: string, status?: ClassroomMemberStatus): Promise<ClassroomMember[]> {
    if (!isUUID(classroomId)) return [];
    const conditions = [eq(classroomMembers.classroomId, classroomId)];
    if (status) {
      conditions.push(eq(classroomMembers.status, status));
    }
    const rows = await this.db
      .select()
      .from(classroomMembers)
      .where(and(...conditions))
      .orderBy(asc(classroomMembers.firstJoinedAt));

    return rows.map(toClassroomMember);
  }

  async listClassroomsForStudent(studentId: string, status?: ClassroomMemberStatus): Promise<ClassroomMember[]> {
    if (!isUUID(studentId)) return [];
    const conditions = [eq(classroomMembers.studentId, studentId)];
    if (status) {
      conditions.push(eq(classroomMembers.status, status));
    }
    const rows = await this.db
      .select()
      .from(classroomMembers)
      .where(and(...conditions))
      .orderBy(desc(classroomMembers.lastJoinedAt));

    return rows.map(toClassroomMember);
  }

  async addMember(data: Omit<ClassroomMember, "createdAt" | "updatedAt">): Promise<ClassroomMember> {
    const [row] = await this.db
      .insert(classroomMembers)
      .values({
        id: data.id,
        classroomId: data.classroomId,
        studentId: data.studentId,
        status: data.status ?? "active",
        firstJoinedAt: new Date(data.firstJoinedAt),
        lastJoinedAt: new Date(data.lastJoinedAt),
        leftAt: data.leftAt ? new Date(data.leftAt) : null,
      })
      .returning();

    return toClassroomMember(row);
  }

  async updateStatus(
    classroomId: string,
    studentId: string,
    status: ClassroomMemberStatus,
    leftAt?: string | null,
  ): Promise<ClassroomMember | null> {
    const computedLeftAt =
      leftAt !== undefined
        ? (leftAt ? new Date(leftAt) : null)
        : (status !== "active" ? new Date() : null);

    const [row] = await this.db
      .update(classroomMembers)
      .set({
        status,
        leftAt: computedLeftAt,
        updatedAt: new Date(),
      })
      .where(and(eq(classroomMembers.classroomId, classroomId), eq(classroomMembers.studentId, studentId)))
      .returning();

    return row ? toClassroomMember(row) : null;
  }

  async rejoinMember(classroomId: string, studentId: string): Promise<ClassroomMember | null> {
    const [row] = await this.db
      .update(classroomMembers)
      .set({
        status: "active",
        lastJoinedAt: new Date(),
        leftAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(classroomMembers.classroomId, classroomId), eq(classroomMembers.studentId, studentId)))
      .returning();

    return row ? toClassroomMember(row) : null;
  }
}

export class DrizzleTeacherExamStore implements TeacherExamStore {
  constructor(private readonly db: DbClient) {}

  async create(data: Omit<TeacherExam, "createdAt" | "updatedAt">): Promise<TeacherExam> {
    const [row] = await this.db
      .insert(teacherExams)
      .values({
        id: data.id,
        classroomId: data.classroomId,
        title: data.title,
        description: data.description ?? null,
        durationMinutes: data.durationMinutes ?? null,
        startsAt: new Date(data.startsAt),
        endsAt: new Date(data.endsAt),
        passingScorePercentage:
          data.passingScorePercentage !== null && data.passingScorePercentage !== undefined
            ? data.passingScorePercentage.toFixed(2)
            : null,
        shuffleQuestions: data.shuffleQuestions,
        shuffleOptions: data.shuffleOptions,
        showResultsImmediately: data.showResultsImmediately,
        allowBackNavigation: data.allowBackNavigation ?? true,
        perQuestionTimeSeconds: data.perQuestionTimeSeconds ?? null,
        status: data.status ?? "draft",
        closedAt: data.closedAt ? new Date(data.closedAt) : null,
        resultsReleasedAt: data.resultsReleasedAt ? new Date(data.resultsReleasedAt) : null,
        archivedAt: data.archivedAt ? new Date(data.archivedAt) : null,
      })
      .returning();

    return toTeacherExam(row);
  }

  async getById(id: string): Promise<TeacherExam | null> {
    if (!isUUID(id)) return null;
    const [row] = await this.db
      .select()
      .from(teacherExams)
      .where(eq(teacherExams.id, id))
      .limit(1);

    return row ? toTeacherExam(row) : null;
  }

  async listByClassroom(classroomId: string, status?: ExamPersistedStatus): Promise<TeacherExam[]> {
    if (!isUUID(classroomId)) return [];
    const conditions = [eq(teacherExams.classroomId, classroomId)];
    if (status) {
      conditions.push(eq(teacherExams.status, status));
    }
    const rows = await this.db
      .select()
      .from(teacherExams)
      .where(and(...conditions))
      .orderBy(desc(teacherExams.createdAt));

    return rows.map(toTeacherExam);
  }

  async update(id: string, patch: Partial<TeacherExam>): Promise<TeacherExam | null> {
    if (!isUUID(id)) return null;
    const values: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.durationMinutes !== undefined) values.durationMinutes = patch.durationMinutes;
    if (patch.startsAt !== undefined) values.startsAt = new Date(patch.startsAt);
    if (patch.endsAt !== undefined) values.endsAt = new Date(patch.endsAt);
    if (patch.passingScorePercentage !== undefined) {
      values.passingScorePercentage =
        patch.passingScorePercentage !== null ? patch.passingScorePercentage.toFixed(2) : null;
    }
    if (patch.shuffleQuestions !== undefined) values.shuffleQuestions = patch.shuffleQuestions;
    if (patch.shuffleOptions !== undefined) values.shuffleOptions = patch.shuffleOptions;
    if (patch.showResultsImmediately !== undefined) {
      values.showResultsImmediately = patch.showResultsImmediately;
    }
    if (patch.allowBackNavigation !== undefined) {
      values.allowBackNavigation = patch.allowBackNavigation;
    }
    if (patch.perQuestionTimeSeconds !== undefined) {
      values.perQuestionTimeSeconds = patch.perQuestionTimeSeconds;
    }
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.closedAt !== undefined) {
      values.closedAt = patch.closedAt ? new Date(patch.closedAt) : null;
    }
    if (patch.resultsReleasedAt !== undefined) {
      values.resultsReleasedAt = patch.resultsReleasedAt ? new Date(patch.resultsReleasedAt) : null;
    }
    if (patch.archivedAt !== undefined) {
      values.archivedAt = patch.archivedAt ? new Date(patch.archivedAt) : null;
    }

    const [row] = await this.db
      .update(teacherExams)
      .set(values)
      .where(eq(teacherExams.id, id))
      .returning();

    return row ? toTeacherExam(row) : null;
  }

  async publish(id: string): Promise<TeacherExam | null> {
    return this.update(id, { status: "published" });
  }

  async unpublish(id: string): Promise<TeacherExam | null> {
    const hasAttempts = await this.hasAttempts(id);
    if (hasAttempts) {
      return null;
    }
    return this.update(id, { status: "draft" });
  }

  async close(id: string, closedAt: string = new Date().toISOString()): Promise<TeacherExam | null> {
    return this.update(id, { closedAt });
  }

  async releaseResults(id: string, resultsReleasedAt: string = new Date().toISOString()): Promise<TeacherExam | null> {
    return this.update(id, { resultsReleasedAt });
  }

  async archive(id: string): Promise<TeacherExam | null> {
    return this.update(id, {
      status: "archived",
      archivedAt: new Date().toISOString(),
    });
  }

  async delete(id: string): Promise<boolean> {
    if (!isUUID(id)) return false;
    const hasAttempts = await this.hasAttempts(id);
    if (hasAttempts) {
      return false;
    }
    const deleted = await this.db.delete(teacherExams).where(eq(teacherExams.id, id)).returning();
    return deleted.length > 0;
  }

  async hasAttempts(id: string): Promise<boolean> {
    if (!isUUID(id)) return false;
    const rows = await this.db
      .select({ id: teacherExamAttempts.id })
      .from(teacherExamAttempts)
      .where(eq(teacherExamAttempts.examId, id))
      .limit(1);
    return rows.length > 0;
  }
}

export class DrizzleTeacherExamQuestionStore implements TeacherExamQuestionStore {
  constructor(private readonly db: DbClient) {}

  async listByExam(examId: string): Promise<TeacherExamQuestion[]> {
    if (!isUUID(examId)) return [];
    const rows = await this.db
      .select()
      .from(teacherExamQuestions)
      .where(eq(teacherExamQuestions.examId, examId))
      .orderBy(asc(teacherExamQuestions.orderIndex));

    return rows.map(toTeacherExamQuestion);
  }

  async getById(id: string): Promise<TeacherExamQuestion | null> {
    if (!isUUID(id)) return null;
    const [row] = await this.db
      .select()
      .from(teacherExamQuestions)
      .where(eq(teacherExamQuestions.id, id))
      .limit(1);

    return row ? toTeacherExamQuestion(row) : null;
  }

  async create(data: Omit<TeacherExamQuestion, "createdAt" | "updatedAt">): Promise<TeacherExamQuestion> {
    const [row] = await this.db
      .insert(teacherExamQuestions)
      .values({
        id: data.id,
        examId: data.examId,
        orderIndex: data.orderIndex,
        questionType: data.questionType ?? "single_choice",
        prompt: data.prompt,
        options: data.options ?? null,
        correctOptionId: data.correctOptionId ?? null,
        points: data.points.toFixed(2),
        explanation: data.explanation ?? null,
      })
      .returning();

    return toTeacherExamQuestion(row);
  }

  async createMany(
    questionsList: Array<Omit<TeacherExamQuestion, "createdAt" | "updatedAt">>,
  ): Promise<TeacherExamQuestion[]> {
    if (questionsList.length === 0) return [];
    const rows = await this.db
      .insert(teacherExamQuestions)
      .values(
        questionsList.map((q) => ({
          id: q.id,
          examId: q.examId,
          orderIndex: q.orderIndex,
          questionType: q.questionType ?? "single_choice",
          prompt: q.prompt,
          options: q.options ?? null,
          correctOptionId: q.correctOptionId ?? null,
          points: q.points.toFixed(2),
          explanation: q.explanation ?? null,
        })),
      )
      .returning();

    return rows.map(toTeacherExamQuestion);
  }

  async update(id: string, patch: Partial<TeacherExamQuestion>): Promise<TeacherExamQuestion | null> {
    const values: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (patch.orderIndex !== undefined) values.orderIndex = patch.orderIndex;
    if (patch.questionType !== undefined) values.questionType = patch.questionType;
    if (patch.prompt !== undefined) values.prompt = patch.prompt;
    if (patch.options !== undefined) values.options = patch.options;
    if (patch.correctOptionId !== undefined) values.correctOptionId = patch.correctOptionId;
    if (patch.points !== undefined) values.points = patch.points.toFixed(2);
    if (patch.explanation !== undefined) values.explanation = patch.explanation;

    const [row] = await this.db
      .update(teacherExamQuestions)
      .set(values)
      .where(eq(teacherExamQuestions.id, id))
      .returning();

    return row ? toTeacherExamQuestion(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.db
      .delete(teacherExamQuestions)
      .where(eq(teacherExamQuestions.id, id))
      .returning();
    return deleted.length > 0;
  }

  async reorder(examId: string, questionIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (let i = 0; i < questionIds.length; i++) {
        await tx
          .update(teacherExamQuestions)
          .set({ orderIndex: i, updatedAt: new Date() })
          .where(and(eq(teacherExamQuestions.id, questionIds[i]), eq(teacherExamQuestions.examId, examId)));
      }
    });
  }
}

export class DrizzleTeacherExamAttemptStore implements TeacherExamAttemptStore {
  constructor(private readonly db: DbClient) {}

  async getById(id: string): Promise<TeacherExamAttempt | null> {
    if (!isUUID(id)) return null;
    const [row] = await this.db
      .select()
      .from(teacherExamAttempts)
      .where(eq(teacherExamAttempts.id, id))
      .limit(1);

    return row ? toTeacherExamAttempt(row) : null;
  }

  async getByExamAndStudent(examId: string, studentId: string): Promise<TeacherExamAttempt | null> {
    if (!isUUID(examId) || !isUUID(studentId)) return null;
    const [row] = await this.db
      .select()
      .from(teacherExamAttempts)
      .where(and(eq(teacherExamAttempts.examId, examId), eq(teacherExamAttempts.studentId, studentId)))
      .limit(1);

    return row ? toTeacherExamAttempt(row) : null;
  }

  async create(data: Omit<TeacherExamAttempt, "createdAt" | "updatedAt">): Promise<TeacherExamAttempt> {
    try {
      const [row] = await this.db
        .insert(teacherExamAttempts)
        .values({
          id: data.id,
          examId: data.examId,
          studentId: data.studentId,
          status: data.status ?? "in_progress",
          gradingStatus: data.gradingStatus ?? "fully_graded",
          startedAt: new Date(data.startedAt),
          deadlineAt: new Date(data.deadlineAt),
          submittedAt: data.submittedAt ? new Date(data.submittedAt) : null,
          completedAt: data.completedAt ? new Date(data.completedAt) : null,
          score: data.score !== undefined && data.score !== null ? data.score.toFixed(2) : null,
          maxScore: data.maxScore !== undefined && data.maxScore !== null ? data.maxScore.toFixed(2) : null,
          percentage: data.percentage !== undefined && data.percentage !== null ? data.percentage.toFixed(2) : null,
          passed: data.passed ?? null,
          allowBackNavigation: data.allowBackNavigation ?? true,
          perQuestionTimeSeconds: data.perQuestionTimeSeconds ?? null,
          questionSnapshot: data.questionSnapshot,
        })
        .returning();

      return toTeacherExamAttempt(row);
    } catch (err: unknown) {
      type PgDatabaseError = {
        code?: string;
        constraint?: string;
        detail?: string;
        message?: string;
        cause?: PgDatabaseError;
      };

      const e = err as PgDatabaseError;
      const is23505 = e?.code === "23505" || e?.cause?.code === "23505";
      const constraint = e?.constraint ?? e?.cause?.constraint;
      const isSingleAttemptViolation =
        constraint === "idx_exam_attempts_single_student" ||
        Boolean(e?.message?.includes("idx_exam_attempts_single_student")) ||
        Boolean(e?.cause?.message?.includes("idx_exam_attempts_single_student")) ||
        Boolean(e?.detail?.includes("idx_exam_attempts_single_student")) ||
        Boolean(e?.cause?.detail?.includes("idx_exam_attempts_single_student"));

      if (is23505 && isSingleAttemptViolation) {
        throw new DomainError(
          "conflict",
          "دانش‌آموز قبلاً در این آزمون شرکت کرده است",
        );
      }
      throw err;
    }
  }

  async finalizeAttempt(
    attemptId: string,
    status: "submitted" | "timed_out",
    passingScorePercentage?: number | null,
  ): Promise<TeacherExamAttempt> {
    return await this.db.transaction(async (tx) => {
      // 1. SELECT attempt FOR UPDATE
      const [row] = await tx
        .select()
        .from(teacherExamAttempts)
        .where(eq(teacherExamAttempts.id, attemptId))
        .for("update");

      if (!row) {
        throw new DomainError("not_found", "تلاش یافت نشد");
      }

      // 2. Re-check status inside transaction
      if (row.status !== "in_progress") {
        throw new DomainError("conflict", "این آزمون قبلاً پایان یافته و ثبت شده است");
      }

      const attempt = toTeacherExamAttempt(row);

      // 3. Load answers within transaction
      const answerRows = await tx
        .select()
        .from(teacherExamAttemptAnswers)
        .where(eq(teacherExamAttemptAnswers.attemptId, attemptId))
        .orderBy(asc(teacherExamAttemptAnswers.answeredAt));

      // 4. Grade snapshot
      const gradeResult = gradeAttempt(
        attempt.questionSnapshot,
        answerRows.map((a) => ({
          questionId: a.questionId,
          selectedOptionId: a.selectedOptionId,
          textAnswer: a.textAnswer,
          teacherFeedback: a.teacherFeedback,
          gradingStatus: (a.gradingStatus as QuestionGradingStatus) || "auto_graded",
          pointsEarned: a.pointsEarned !== null ? Number(a.pointsEarned) : null,
          isCorrect: a.isCorrect,
        })),
        passingScorePercentage,
      );

      // 5. Persist answers grading within transaction
      for (const detail of gradeResult.perQuestion) {
        await tx
          .insert(teacherExamAttemptAnswers)
          .values({
            id: crypto.randomUUID(),
            attemptId,
            questionId: detail.questionId,
            selectedOptionId: detail.selectedOptionId ?? null,
            textAnswer: detail.textAnswer ?? null,
            teacherFeedback: detail.teacherFeedback ?? null,
            gradingStatus: detail.gradingStatus,
            isCorrect: detail.isCorrect ?? null,
            pointsEarned:
              detail.pointsEarned !== undefined && detail.pointsEarned !== null
                ? detail.pointsEarned.toFixed(2)
                : null,
            answeredAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [teacherExamAttemptAnswers.attemptId, teacherExamAttemptAnswers.questionId],
            set: {
              selectedOptionId: detail.selectedOptionId ?? null,
              textAnswer: detail.textAnswer ?? null,
              teacherFeedback: detail.teacherFeedback ?? null,
              gradingStatus: detail.gradingStatus,
              isCorrect: detail.isCorrect ?? null,
              pointsEarned:
                detail.pointsEarned !== undefined && detail.pointsEarned !== null
                  ? detail.pointsEarned.toFixed(2)
                  : null,
              answeredAt: new Date(),
            },
          });
      }

      // 6. Update attempt row with status condition
      const now = new Date();
      const [updatedRow] = await tx
        .update(teacherExamAttempts)
        .set({
          status,
          gradingStatus: gradeResult.gradingStatus,
          submittedAt: now,
          completedAt: now,
          score: gradeResult.totalScore.toFixed(2),
          maxScore: gradeResult.maxScore.toFixed(2),
          percentage: gradeResult.percentage !== null ? gradeResult.percentage.toFixed(2) : null,
          passed: gradeResult.passed,
          updatedAt: now,
        })
        .where(
          and(
            eq(teacherExamAttempts.id, attemptId),
            eq(teacherExamAttempts.status, "in_progress"),
          ),
        )
        .returning();

      if (!updatedRow) {
        throw new DomainError("conflict", "این آزمون قبلاً پایان یافته و ثبت شده است");
      }

      return toTeacherExamAttempt(updatedRow);
    });
  }

  async update(id: string, patch: Partial<TeacherExamAttempt>): Promise<TeacherExamAttempt | null> {
    if (!isUUID(id)) return null;
    const values: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.gradingStatus !== undefined) values.gradingStatus = patch.gradingStatus;
    if (patch.submittedAt !== undefined) {
      values.submittedAt = patch.submittedAt ? new Date(patch.submittedAt) : null;
    }
    if (patch.completedAt !== undefined) {
      values.completedAt = patch.completedAt ? new Date(patch.completedAt) : null;
    }
    if (patch.score !== undefined) {
      values.score = patch.score !== null ? patch.score.toFixed(2) : null;
    }
    if (patch.maxScore !== undefined) {
      values.maxScore = patch.maxScore !== null ? patch.maxScore.toFixed(2) : null;
    }
    if (patch.percentage !== undefined) {
      values.percentage = patch.percentage !== null ? patch.percentage.toFixed(2) : null;
    }
    if (patch.passed !== undefined) values.passed = patch.passed;

    const [row] = await this.db
      .update(teacherExamAttempts)
      .set(values)
      .where(eq(teacherExamAttempts.id, id))
      .returning();

    return row ? toTeacherExamAttempt(row) : null;
  }

  async listByExam(examId: string, status?: AttemptStatus): Promise<TeacherExamAttempt[]> {
    if (!isUUID(examId)) return [];
    const conditions = [eq(teacherExamAttempts.examId, examId)];
    if (status) {
      conditions.push(eq(teacherExamAttempts.status, status));
    }
    const rows = await this.db
      .select()
      .from(teacherExamAttempts)
      .where(and(...conditions))
      .orderBy(desc(teacherExamAttempts.startedAt));

    return rows.map(toTeacherExamAttempt);
  }

  async listByStudent(studentId: string): Promise<TeacherExamAttempt[]> {
    if (!isUUID(studentId)) return [];
    const rows = await this.db
      .select()
      .from(teacherExamAttempts)
      .where(eq(teacherExamAttempts.studentId, studentId))
      .orderBy(desc(teacherExamAttempts.startedAt));

    return rows.map(toTeacherExamAttempt);
  }
}

export class DrizzleTeacherExamAttemptAnswerStore implements TeacherExamAttemptAnswerStore {
  constructor(private readonly db: DbClient) {}

  async get(attemptId: string, questionId: string): Promise<TeacherExamAttemptAnswer | null> {
    if (!isUUID(attemptId) || !isUUID(questionId)) return null;
    const [row] = await this.db
      .select()
      .from(teacherExamAttemptAnswers)
      .where(
        and(
          eq(teacherExamAttemptAnswers.attemptId, attemptId),
          eq(teacherExamAttemptAnswers.questionId, questionId),
        ),
      )
      .limit(1);

    return row ? toTeacherExamAttemptAnswer(row) : null;
  }

  async upsert(data: Omit<TeacherExamAttemptAnswer, "answeredAt">): Promise<TeacherExamAttemptAnswer> {
    const now = new Date();
    const setValues: Record<string, unknown> = {
      selectedOptionId: data.selectedOptionId ?? null,
      textAnswer: data.textAnswer ?? null,
      teacherFeedback: data.teacherFeedback ?? null,
      gradingStatus: data.gradingStatus ?? "auto_graded",
      isCorrect: data.isCorrect ?? null,
      pointsEarned:
        data.pointsEarned !== undefined && data.pointsEarned !== null ? data.pointsEarned.toFixed(2) : null,
      answeredAt: now,
    };
    if (data.finalizedAt !== undefined) {
      setValues.finalizedAt = data.finalizedAt ? new Date(data.finalizedAt) : null;
    }

    const [row] = await this.db
      .insert(teacherExamAttemptAnswers)
      .values({
        id: data.id,
        attemptId: data.attemptId,
        questionId: data.questionId,
        selectedOptionId: data.selectedOptionId ?? null,
        textAnswer: data.textAnswer ?? null,
        teacherFeedback: data.teacherFeedback ?? null,
        gradingStatus: data.gradingStatus ?? "auto_graded",
        isCorrect: data.isCorrect ?? null,
        pointsEarned: data.pointsEarned !== undefined && data.pointsEarned !== null ? data.pointsEarned.toFixed(2) : null,
        answeredAt: now,
        finalizedAt: data.finalizedAt ? new Date(data.finalizedAt) : null,
      })
      .onConflictDoUpdate({
        target: [teacherExamAttemptAnswers.attemptId, teacherExamAttemptAnswers.questionId],
        set: setValues,
      })
      .returning();

    return toTeacherExamAttemptAnswer(row);
  }

  async listByAttempt(attemptId: string): Promise<TeacherExamAttemptAnswer[]> {
    if (!isUUID(attemptId)) return [];
    const rows = await this.db
      .select()
      .from(teacherExamAttemptAnswers)
      .where(eq(teacherExamAttemptAnswers.attemptId, attemptId))
      .orderBy(asc(teacherExamAttemptAnswers.answeredAt));

    return rows.map(toTeacherExamAttemptAnswer);
  }

  async saveBatch(
    attemptId: string,
    answers: Array<{
      questionId: string;
      selectedOptionId?: string | null;
      textAnswer?: string | null;
      teacherFeedback?: string | null;
      gradingStatus?: QuestionGradingStatus;
      isCorrect?: boolean | null;
      pointsEarned?: number | null;
    }>,
  ): Promise<void> {
    if (answers.length === 0) return;

    await this.db.transaction(async (tx) => {
      for (const ans of answers) {
        await tx
          .insert(teacherExamAttemptAnswers)
          .values({
            id: crypto.randomUUID(),
            attemptId,
            questionId: ans.questionId,
            selectedOptionId: ans.selectedOptionId ?? null,
            textAnswer: ans.textAnswer ?? null,
            teacherFeedback: ans.teacherFeedback ?? null,
            gradingStatus: ans.gradingStatus ?? "auto_graded",
            isCorrect: ans.isCorrect ?? null,
            pointsEarned: ans.pointsEarned !== undefined && ans.pointsEarned !== null ? ans.pointsEarned.toFixed(2) : null,
            answeredAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [teacherExamAttemptAnswers.attemptId, teacherExamAttemptAnswers.questionId],
            set: {
              selectedOptionId: ans.selectedOptionId ?? null,
              textAnswer: ans.textAnswer ?? null,
              teacherFeedback: ans.teacherFeedback ?? null,
              gradingStatus: ans.gradingStatus ?? "auto_graded",
              isCorrect: ans.isCorrect ?? null,
              pointsEarned:
                ans.pointsEarned !== undefined && ans.pointsEarned !== null ? ans.pointsEarned.toFixed(2) : null,
              answeredAt: new Date(),
            },
          });
      }
    });
  }
}

export class DrizzleAssignmentStore implements AssignmentStore {
  constructor(private readonly db: DbClient) {}

  async getById(id: string): Promise<ClassroomAssignment | null> {
    if (!isUUID(id)) return null;
    const [row] = await this.db
      .select()
      .from(classroomAssignments)
      .where(eq(classroomAssignments.id, id))
      .limit(1);
    return row ? toClassroomAssignment(row) : null;
  }

  async create(
    data: Omit<ClassroomAssignment, "createdAt" | "updatedAt">,
  ): Promise<ClassroomAssignment> {
    const now = new Date();
    const [row] = await this.db
      .insert(classroomAssignments)
      .values({
        id: data.id,
        classroomId: data.classroomId,
        teacherId: data.teacherId,
        title: data.title,
        description: data.description ?? null,
        startsAt: new Date(data.startsAt),
        dueAt: new Date(data.dueAt),
        status: data.status,
        archivedAt: data.archivedAt ? new Date(data.archivedAt) : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return toClassroomAssignment(row);
  }

  async update(
    id: string,
    patch: Partial<
      Omit<
        ClassroomAssignment,
        "id" | "classroomId" | "teacherId" | "createdAt" | "updatedAt"
      >
    >,
  ): Promise<ClassroomAssignment | null> {
    if (!isUUID(id)) return null;
    const values: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (patch.title !== undefined) values.title = patch.title;
    if (patch.description !== undefined) values.description = patch.description;
    if (patch.startsAt !== undefined) values.startsAt = new Date(patch.startsAt);
    if (patch.dueAt !== undefined) values.dueAt = new Date(patch.dueAt);
    if (patch.status !== undefined) values.status = patch.status;
    if (patch.archivedAt !== undefined)
      values.archivedAt = patch.archivedAt ? new Date(patch.archivedAt) : null;

    const [row] = await this.db
      .update(classroomAssignments)
      .set(values)
      .where(eq(classroomAssignments.id, id))
      .returning();
    return row ? toClassroomAssignment(row) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!isUUID(id)) return false;
    const result = await this.db
      .delete(classroomAssignments)
      .where(eq(classroomAssignments.id, id))
      .returning();
    return result.length > 0;
  }

  async listByClassroom(
    classroomId: string,
    status?: AssignmentPersistedStatus,
  ): Promise<ClassroomAssignment[]> {
    if (!isUUID(classroomId)) return [];
    const conditions = [eq(classroomAssignments.classroomId, classroomId)];
    if (status) {
      conditions.push(eq(classroomAssignments.status, status));
    }
    const rows = await this.db
      .select()
      .from(classroomAssignments)
      .where(and(...conditions))
      .orderBy(desc(classroomAssignments.createdAt));
    return rows.map(toClassroomAssignment);
  }

  async listByTeacher(teacherId: string): Promise<ClassroomAssignment[]> {
    if (!isUUID(teacherId)) return [];
    const rows = await this.db
      .select()
      .from(classroomAssignments)
      .where(eq(classroomAssignments.teacherId, teacherId))
      .orderBy(desc(classroomAssignments.createdAt));
    return rows.map(toClassroomAssignment);
  }

  async countByClassroom(classroomId: string): Promise<number> {
    if (!isUUID(classroomId)) return 0;
    const [result] = await this.db
      .select({ val: count() })
      .from(classroomAssignments)
      .where(eq(classroomAssignments.classroomId, classroomId));
    return Number(result?.val ?? 0);
  }
}

export class DrizzleAssignmentSubmissionStore
  implements AssignmentSubmissionStore
{
  constructor(private readonly db: DbClient) {}

  async get(
    assignmentId: string,
    studentId: string,
  ): Promise<AssignmentSubmission | null> {
    if (!isUUID(assignmentId) || !isUUID(studentId)) return null;
    const [row] = await this.db
      .select()
      .from(classroomAssignmentSubmissions)
      .where(
        and(
          eq(classroomAssignmentSubmissions.assignmentId, assignmentId),
          eq(classroomAssignmentSubmissions.studentId, studentId),
        ),
      )
      .limit(1);
    return row ? toAssignmentSubmission(row) : null;
  }

  async getById(id: string): Promise<AssignmentSubmission | null> {
    if (!isUUID(id)) return null;
    const [row] = await this.db
      .select()
      .from(classroomAssignmentSubmissions)
      .where(eq(classroomAssignmentSubmissions.id, id))
      .limit(1);
    return row ? toAssignmentSubmission(row) : null;
  }

  async upsert(
    data: Omit<AssignmentSubmission, "submittedAt" | "createdAt" | "updatedAt">,
  ): Promise<AssignmentSubmission> {
    const now = new Date();
    const [row] = await this.db
      .insert(classroomAssignmentSubmissions)
      .values({
        id: data.id,
        assignmentId: data.assignmentId,
        studentId: data.studentId,
        answerText: data.answerText,
        status: data.status,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          classroomAssignmentSubmissions.assignmentId,
          classroomAssignmentSubmissions.studentId,
        ],
        set: {
          answerText: data.answerText,
          status: data.status,
          submittedAt: now,
          updatedAt: now,
        },
      })
      .returning();
    return toAssignmentSubmission(row);
  }

  async listByAssignment(
    assignmentId: string,
  ): Promise<AssignmentSubmission[]> {
    if (!isUUID(assignmentId)) return [];
    const rows = await this.db
      .select()
      .from(classroomAssignmentSubmissions)
      .where(eq(classroomAssignmentSubmissions.assignmentId, assignmentId))
      .orderBy(desc(classroomAssignmentSubmissions.submittedAt));
    return rows.map(toAssignmentSubmission);
  }

  async listByStudent(studentId: string): Promise<AssignmentSubmission[]> {
    if (!isUUID(studentId)) return [];
    const rows = await this.db
      .select()
      .from(classroomAssignmentSubmissions)
      .where(eq(classroomAssignmentSubmissions.studentId, studentId))
      .orderBy(desc(classroomAssignmentSubmissions.submittedAt));
    return rows.map(toAssignmentSubmission);
  }

  async countByAssignment(assignmentId: string): Promise<number> {
    if (!isUUID(assignmentId)) return 0;
    const [result] = await this.db
      .select({ val: count() })
      .from(classroomAssignmentSubmissions)
      .where(eq(classroomAssignmentSubmissions.assignmentId, assignmentId));
    return Number(result?.val ?? 0);
  }
}
