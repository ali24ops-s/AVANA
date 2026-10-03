import { DomainError, gradeAttempt } from "@avana/domain";
import type {
  Classroom,
  ClassroomMember,
  TeacherExam,
  TeacherExamQuestion,
  TeacherExamAttempt,
  TeacherExamAttemptAnswer,
  ClassroomAssignment,
  AssignmentSubmission,
  ClassroomContent,
  ClassroomContentStatus,
  ClassroomStatus,
  ClassroomMemberStatus,
  ExamPersistedStatus,
  AttemptStatus,
  QuestionGradingStatus,
  AssignmentPersistedStatus,
} from "@avana/domain";

import type {
  ClassroomStore,
  ClassroomMemberStore,
  TeacherExamStore,
  TeacherExamQuestionStore,
  TeacherExamAttemptStore,
  TeacherExamAttemptAnswerStore,
  AssignmentStore,
  AssignmentSubmissionStore,
  ClassroomContentStore,
  TeacherConversationStore,
  TeacherConversationMessageStore,
} from "./stores.js";
import type {
  TeacherConversation,
  TeacherConversationMessage,
  TeacherMessageStatus,
} from "@avana/domain";


export class InMemoryClassroomStore implements ClassroomStore {
  private readonly classrooms = new Map<string, Classroom>();

  // Optional references to verify delete constraints
  public examStore?: TeacherExamStore;
  public attemptStore?: TeacherExamAttemptStore;

  async create(data: Omit<Classroom, "createdAt" | "updatedAt">): Promise<Classroom> {
    // Check inviteCode uniqueness
    for (const c of this.classrooms.values()) {
      if (c.inviteCode === data.inviteCode) {
        throw new DomainError("conflict", `کد دعوت ${data.inviteCode} قبلاً استفاده شده است`);
      }
    }

    const now = new Date().toISOString();
    const classroom: Classroom = {
      ...data,
      status: data.status ?? "active",
      createdAt: now,
      updatedAt: now,
      archivedAt: data.archivedAt ?? null,
    };
    this.classrooms.set(classroom.id, classroom);
    return { ...classroom };
  }

  async getById(id: string): Promise<Classroom | null> {
    const c = this.classrooms.get(id);
    return c ? { ...c } : null;
  }

  async getByInviteCode(code: string): Promise<Classroom | null> {
    for (const c of this.classrooms.values()) {
      if (c.inviteCode.toUpperCase() === code.toUpperCase()) {
        return { ...c };
      }
    }
    return null;
  }

  async listByTeacher(teacherId: string, status?: ClassroomStatus): Promise<Classroom[]> {
    return Array.from(this.classrooms.values())
      .filter((c) => c.teacherId === teacherId && (!status || c.status === status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((c) => ({ ...c }));
  }

  async listByOrganization(organizationId: string, status?: ClassroomStatus): Promise<Classroom[]> {
    return Array.from(this.classrooms.values())
      .filter((c) => c.organizationId === organizationId && (!status || c.status === status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((c) => ({ ...c }));
  }

  async update(
    id: string,
    patch: Partial<Pick<Classroom, "title" | "description" | "status" | "archivedAt" | "inviteCode">>,
  ): Promise<Classroom | null> {
    const existing = this.classrooms.get(id);
    if (!existing) return null;

    if (patch.inviteCode && patch.inviteCode !== existing.inviteCode) {
      for (const c of this.classrooms.values()) {
        if (c.id !== id && c.inviteCode === patch.inviteCode) {
          throw new DomainError("conflict", `کد دعوت ${patch.inviteCode} قبلاً استفاده شده است`);
        }
      }
    }

    const updated: Classroom = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.classrooms.set(id, updated);
    return { ...updated };
  }

  async archive(id: string): Promise<Classroom | null> {
    return this.update(id, {
      status: "archived",
      archivedAt: new Date().toISOString(),
    });
  }

  async delete(id: string): Promise<boolean> {
    const hasExistingRecords = await this.hasExamsOrAttempts(id);
    if (hasExistingRecords) {
      return false;
    }
    return this.classrooms.delete(id);
  }

  async hasExamsOrAttempts(id: string): Promise<boolean> {
    if (this.examStore) {
      const exams = await this.examStore.listByClassroom(id);
      if (exams.length > 0) return true;
    }
    return false;
  }
}

export class InMemoryClassroomMemberStore implements ClassroomMemberStore {
  private readonly members = new Map<string, ClassroomMember>();

  private makeKey(classroomId: string, studentId: string): string {
    return `${classroomId}:${studentId}`;
  }

  async getMembership(classroomId: string, studentId: string): Promise<ClassroomMember | null> {
    const m = this.members.get(this.makeKey(classroomId, studentId));
    return m ? { ...m } : null;
  }

  async listMembers(classroomId: string, status?: ClassroomMemberStatus): Promise<ClassroomMember[]> {
    return Array.from(this.members.values())
      .filter((m) => m.classroomId === classroomId && (!status || m.status === status))
      .sort((a, b) => new Date(a.firstJoinedAt).getTime() - new Date(b.firstJoinedAt).getTime())
      .map((m) => ({ ...m }));
  }

  async listClassroomsForStudent(studentId: string, status?: ClassroomMemberStatus): Promise<ClassroomMember[]> {
    return Array.from(this.members.values())
      .filter((m) => m.studentId === studentId && (!status || m.status === status))
      .sort((a, b) => new Date(b.lastJoinedAt).getTime() - new Date(a.lastJoinedAt).getTime())
      .map((m) => ({ ...m }));
  }

  async addMember(data: Omit<ClassroomMember, "createdAt" | "updatedAt">): Promise<ClassroomMember> {
    const key = this.makeKey(data.classroomId, data.studentId);
    const existing = this.members.get(key);

    if (existing && existing.status === "active") {
      throw new DomainError("conflict", "دانش‌آموز هم‌اکنون عضو فعال این کلاس است");
    }

    const now = new Date().toISOString();
    // If resurrecting an existing removed/left record
    if (existing) {
      const resurrected: ClassroomMember = {
        ...existing,
        status: "active",
        lastJoinedAt: now,
        leftAt: null,
        updatedAt: now,
      };
      this.members.set(key, resurrected);
      return { ...resurrected };
    }

    const member: ClassroomMember = {
      ...data,
      status: data.status ?? "active",
      firstJoinedAt: data.firstJoinedAt || now,
      lastJoinedAt: data.lastJoinedAt || now,
      leftAt: data.leftAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.members.set(key, member);
    return { ...member };
  }

  async updateStatus(
    classroomId: string,
    studentId: string,
    status: ClassroomMemberStatus,
    leftAt?: string | null,
  ): Promise<ClassroomMember | null> {
    const key = this.makeKey(classroomId, studentId);
    const existing = this.members.get(key);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: ClassroomMember = {
      ...existing,
      status,
      leftAt: leftAt !== undefined ? leftAt : status !== "active" ? now : null,
      updatedAt: now,
    };
    this.members.set(key, updated);
    return { ...updated };
  }

  async rejoinMember(classroomId: string, studentId: string): Promise<ClassroomMember | null> {
    const key = this.makeKey(classroomId, studentId);
    const existing = this.members.get(key);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated: ClassroomMember = {
      ...existing,
      status: "active",
      lastJoinedAt: now,
      leftAt: null,
      updatedAt: now,
    };
    this.members.set(key, updated);
    return { ...updated };
  }
}

export class InMemoryTeacherExamStore implements TeacherExamStore {
  private readonly exams = new Map<string, TeacherExam>();
  public attemptStore?: TeacherExamAttemptStore;

  async create(data: Omit<TeacherExam, "createdAt" | "updatedAt">): Promise<TeacherExam> {
    const now = new Date().toISOString();
    const exam: TeacherExam = {
      ...data,
      allowBackNavigation: data.allowBackNavigation ?? true,
      perQuestionTimeSeconds: data.perQuestionTimeSeconds ?? null,
      status: data.status ?? "draft",
      closedAt: data.closedAt ?? null,
      resultsReleasedAt: data.resultsReleasedAt ?? null,
      archivedAt: data.archivedAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.exams.set(exam.id, exam);
    return { ...exam };
  }

  async getById(id: string): Promise<TeacherExam | null> {
    const e = this.exams.get(id);
    return e ? { ...e } : null;
  }

  async listByClassroom(classroomId: string, status?: ExamPersistedStatus): Promise<TeacherExam[]> {
    return Array.from(this.exams.values())
      .filter((e) => e.classroomId === classroomId && (!status || e.status === status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((e) => ({ ...e }));
  }

  async update(id: string, patch: Partial<TeacherExam>): Promise<TeacherExam | null> {
    const existing = this.exams.get(id);
    if (!existing) return null;

    const updated: TeacherExam = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.exams.set(id, updated);
    return { ...updated };
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
    const hasAttempts = await this.hasAttempts(id);
    if (hasAttempts) {
      return false;
    }
    return this.exams.delete(id);
  }

  async hasAttempts(id: string): Promise<boolean> {
    if (this.attemptStore) {
      const attempts = await this.attemptStore.listByExam(id);
      return attempts.length > 0;
    }
    return false;
  }
}

export class InMemoryTeacherExamQuestionStore implements TeacherExamQuestionStore {
  private readonly questions = new Map<string, TeacherExamQuestion>();
  public examStore?: TeacherExamStore;

  async listByExam(examId: string): Promise<TeacherExamQuestion[]> {
    return Array.from(this.questions.values())
      .filter((q) => q.examId === examId)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((q) => ({ ...q }));
  }

  async getById(id: string): Promise<TeacherExamQuestion | null> {
    const q = this.questions.get(id);
    return q ? { ...q } : null;
  }

  private async assertDraft(examId: string): Promise<void> {
    if (this.examStore) {
      const exam = await this.examStore.getById(examId);
      if (exam && exam.status !== "draft") {
        throw new DomainError(
          "bad_request",
          `Questions cannot be modified on an exam with status '${exam.status}'. Questions are immutable once published.`,
        );
      }
    }
  }

  async create(data: Omit<TeacherExamQuestion, "createdAt" | "updatedAt">): Promise<TeacherExamQuestion> {
    await this.assertDraft(data.examId);
    const now = new Date().toISOString();
    const question: TeacherExamQuestion = {
      ...data,
      questionType: data.questionType ?? "single_choice",
      options: data.options ?? [],
      statements: data.statements ?? undefined,
      correctOptionId: data.correctOptionId ?? null,
      explanation: data.explanation ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.questions.set(question.id, question);
    return { ...question };
  }

  async createMany(
    questionsList: Array<Omit<TeacherExamQuestion, "createdAt" | "updatedAt">>,
  ): Promise<TeacherExamQuestion[]> {
    const results: TeacherExamQuestion[] = [];
    for (const q of questionsList) {
      results.push(await this.create(q));
    }
    return results;
  }

  async update(id: string, patch: Partial<TeacherExamQuestion>): Promise<TeacherExamQuestion | null> {
    const existing = this.questions.get(id);
    if (!existing) return null;

    await this.assertDraft(existing.examId);
    const updated: TeacherExamQuestion = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.questions.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<boolean> {
    const existing = this.questions.get(id);
    if (!existing) return false;

    await this.assertDraft(existing.examId);
    return this.questions.delete(id);
  }

  async reorder(examId: string, questionIds: string[]): Promise<void> {
    await this.assertDraft(examId);
    for (let i = 0; i < questionIds.length; i++) {
      const q = this.questions.get(questionIds[i]);
      if (q && q.examId === examId) {
        q.orderIndex = i;
        q.updatedAt = new Date().toISOString();
      }
    }
  }
}

export class InMemoryTeacherExamAttemptStore implements TeacherExamAttemptStore {
  private readonly attempts = new Map<string, TeacherExamAttempt>();
  private readonly locks = new Map<string, Promise<void>>();
  public answerStore?: TeacherExamAttemptAnswerStore;

  constructor(answerStore?: TeacherExamAttemptAnswerStore) {
    this.answerStore = answerStore;
  }

  private async withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    while (this.locks.has(key)) {
      try {
        await this.locks.get(key);
      } catch {
        // ignore errors from previous task
      }
    }
    let release: () => void = () => {};
    const lockPromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(key, lockPromise);

    try {
      return await fn();
    } finally {
      release();
      this.locks.delete(key);
    }
  }

  async getById(id: string): Promise<TeacherExamAttempt | null> {
    const a = this.attempts.get(id);
    return a ? { ...a } : null;
  }

  async getByExamAndStudent(examId: string, studentId: string): Promise<TeacherExamAttempt | null> {
    for (const a of this.attempts.values()) {
      if (a.examId === examId && a.studentId === studentId) {
        return { ...a };
      }
    }
    return null;
  }

  async create(data: Omit<TeacherExamAttempt, "createdAt" | "updatedAt">): Promise<TeacherExamAttempt> {
    const lockKey = `start:${data.examId}:${data.studentId}`;
    return await this.withLock(lockKey, async () => {
      const existing = await this.getByExamAndStudent(data.examId, data.studentId);
      if (existing) {
        throw new DomainError("conflict", "دانش‌آموز قبلاً در این آزمون شرکت کرده است");
      }

      const now = new Date().toISOString();
      const attempt: TeacherExamAttempt = {
        ...data,
        allowBackNavigation: data.allowBackNavigation ?? true,
        perQuestionTimeSeconds: data.perQuestionTimeSeconds ?? null,
        status: data.status ?? "in_progress",
        gradingStatus: data.gradingStatus ?? "fully_graded",
        submittedAt: data.submittedAt ?? null,
        completedAt: data.completedAt ?? null,
        score: data.score ?? null,
        maxScore: data.maxScore ?? null,
        percentage: data.percentage ?? null,
        passed: data.passed ?? null,
        createdAt: now,
        updatedAt: now,
      };
      this.attempts.set(attempt.id, attempt);
      return { ...attempt };
    });
  }

  async finalizeAttempt(
    attemptId: string,
    status: "submitted" | "timed_out",
    passingScorePercentage?: number | null,
  ): Promise<TeacherExamAttempt> {
    return await this.withLock(`attempt:${attemptId}`, async () => {
      const attempt = this.attempts.get(attemptId);
      if (!attempt) {
        throw new DomainError("not_found", "تلاش یافت نشد");
      }

      if (attempt.status !== "in_progress") {
        throw new DomainError("conflict", "این آزمون قبلاً پایان یافته و ثبت شده است");
      }

      const answers = this.answerStore ? await this.answerStore.listByAttempt(attemptId) : [];
      const gradeResult = gradeAttempt(
        attempt.questionSnapshot,
        answers.map((a) => ({
          questionId: a.questionId,
          selectedOptionId: a.selectedOptionId,
          textAnswer: a.textAnswer,
          teacherFeedback: a.teacherFeedback,
          gradingStatus: a.gradingStatus,
          pointsEarned: a.pointsEarned,
        })),
        passingScorePercentage,
      );

      if (this.answerStore) {
        for (const detail of gradeResult.perQuestion) {
          await this.answerStore.upsert({
            id: crypto.randomUUID(),
            attemptId,
            questionId: detail.questionId,
            selectedOptionId: detail.selectedOptionId ?? null,
            textAnswer: detail.textAnswer ?? null,
            teacherFeedback: detail.teacherFeedback ?? null,
            gradingStatus: detail.gradingStatus,
            isCorrect: detail.isCorrect ?? null,
            pointsEarned: detail.pointsEarned ?? null,
          });
        }
      }

      const now = new Date().toISOString();
      const updated: TeacherExamAttempt = {
        ...attempt,
        status,
        gradingStatus: gradeResult.gradingStatus,
        submittedAt: now,
        completedAt: now,
        score: gradeResult.totalScore,
        maxScore: gradeResult.maxScore,
        percentage: gradeResult.percentage,
        passed: gradeResult.passed,
        updatedAt: now,
      };
      this.attempts.set(attemptId, updated);
      return { ...updated };
    });
  }

  async update(id: string, patch: Partial<TeacherExamAttempt>): Promise<TeacherExamAttempt | null> {
    const existing = this.attempts.get(id);
    if (!existing) return null;

    const updated: TeacherExamAttempt = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.attempts.set(id, updated);
    return { ...updated };
  }

  async listByExam(examId: string, status?: AttemptStatus): Promise<TeacherExamAttempt[]> {
    return Array.from(this.attempts.values())
      .filter((a) => a.examId === examId && (!status || a.status === status))
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .map((a) => ({ ...a }));
  }

  async listByStudent(studentId: string): Promise<TeacherExamAttempt[]> {
    return Array.from(this.attempts.values())
      .filter((a) => a.studentId === studentId)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .map((a) => ({ ...a }));
  }
}

export class InMemoryTeacherExamAttemptAnswerStore implements TeacherExamAttemptAnswerStore {
  private readonly answers = new Map<string, TeacherExamAttemptAnswer>();

  private makeKey(attemptId: string, questionId: string): string {
    return `${attemptId}:${questionId}`;
  }

  async get(attemptId: string, questionId: string): Promise<TeacherExamAttemptAnswer | null> {
    const a = this.answers.get(this.makeKey(attemptId, questionId));
    return a ? { ...a } : null;
  }

  async upsert(data: Omit<TeacherExamAttemptAnswer, "answeredAt">): Promise<TeacherExamAttemptAnswer> {
    const key = this.makeKey(data.attemptId, data.questionId);
    const existing = this.answers.get(key);

    const now = new Date().toISOString();
    const answer: TeacherExamAttemptAnswer = {
      id: existing ? existing.id : data.id,
      attemptId: data.attemptId,
      questionId: data.questionId,
      selectedOptionId: data.selectedOptionId !== undefined ? data.selectedOptionId : existing?.selectedOptionId ?? null,
      textAnswer: data.textAnswer !== undefined ? data.textAnswer : existing?.textAnswer ?? null,
      teacherFeedback: data.teacherFeedback !== undefined ? data.teacherFeedback : existing?.teacherFeedback ?? null,
      gradingStatus: data.gradingStatus !== undefined ? data.gradingStatus : existing?.gradingStatus ?? "auto_graded",
      isCorrect: data.isCorrect !== undefined ? data.isCorrect : existing?.isCorrect ?? null,
      pointsEarned: data.pointsEarned !== undefined ? data.pointsEarned : existing?.pointsEarned ?? null,
      answeredAt: now,
      finalizedAt: data.finalizedAt !== undefined ? data.finalizedAt : existing?.finalizedAt ?? null,
      activeDurationMs: data.activeDurationMs !== undefined ? data.activeDurationMs : existing?.activeDurationMs ?? null,
      tabSwitchesCount: data.tabSwitchesCount !== undefined ? data.tabSwitchesCount : existing?.tabSwitchesCount ?? null,
      integrityMetadata: data.integrityMetadata !== undefined ? data.integrityMetadata : existing?.integrityMetadata ?? null,
    };
    this.answers.set(key, answer);
    return { ...answer };
  }

  async listByAttempt(attemptId: string): Promise<TeacherExamAttemptAnswer[]> {
    return Array.from(this.answers.values())
      .filter((a) => a.attemptId === attemptId)
      .sort((a, b) => new Date(a.answeredAt).getTime() - new Date(b.answeredAt).getTime())
      .map((a) => ({ ...a }));
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
    for (const ans of answers) {
      await this.upsert({
        id: crypto.randomUUID(),
        attemptId,
        questionId: ans.questionId,
        selectedOptionId: ans.selectedOptionId ?? null,
        textAnswer: ans.textAnswer ?? null,
        teacherFeedback: ans.teacherFeedback ?? null,
        gradingStatus: ans.gradingStatus ?? "auto_graded",
        isCorrect: ans.isCorrect ?? null,
        pointsEarned: ans.pointsEarned ?? null,
      });
    }
  }
}

export class InMemoryAssignmentStore implements AssignmentStore {
  private readonly assignments = new Map<string, ClassroomAssignment>();

  async create(
    data: Omit<ClassroomAssignment, "createdAt" | "updatedAt">,
  ): Promise<ClassroomAssignment> {
    const now = new Date().toISOString();
    const assignment: ClassroomAssignment = {
      ...data,
      status: data.status ?? "draft",
      createdAt: now,
      updatedAt: now,
      archivedAt: data.archivedAt ?? null,
    };
    this.assignments.set(assignment.id, assignment);
    return { ...assignment };
  }

  async getById(id: string): Promise<ClassroomAssignment | null> {
    const a = this.assignments.get(id);
    return a ? { ...a } : null;
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
    const existing = this.assignments.get(id);
    if (!existing) return null;

    const cleanPatch: Partial<
      Omit<
        ClassroomAssignment,
        "id" | "classroomId" | "teacherId" | "createdAt" | "updatedAt"
      >
    > = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) {
        (cleanPatch as Record<string, unknown>)[k] = v;
      }
    }

    const updated: ClassroomAssignment = {
      ...existing,
      ...cleanPatch,
      updatedAt: new Date().toISOString(),
    };
    this.assignments.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<boolean> {
    return this.assignments.delete(id);
  }

  async listByClassroom(
    classroomId: string,
    status?: AssignmentPersistedStatus,
  ): Promise<ClassroomAssignment[]> {
    return Array.from(this.assignments.values())
      .filter((a) => a.classroomId === classroomId && (!status || a.status === status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((a) => ({ ...a }));
  }

  async listByTeacher(teacherId: string): Promise<ClassroomAssignment[]> {
    return Array.from(this.assignments.values())
      .filter((a) => a.teacherId === teacherId)
      .sort((a) => new Date(a.createdAt).getTime())
      .map((a) => ({ ...a }));
  }

  async countByClassroom(classroomId: string): Promise<number> {
    return Array.from(this.assignments.values()).filter(
      (a) => a.classroomId === classroomId,
    ).length;
  }
}

export class InMemoryAssignmentSubmissionStore
  implements AssignmentSubmissionStore
{
  private readonly submissions = new Map<string, AssignmentSubmission>();

  private makeKey(assignmentId: string, studentId: string): string {
    return `${assignmentId}:${studentId}`;
  }

  async get(
    assignmentId: string,
    studentId: string,
  ): Promise<AssignmentSubmission | null> {
    const sub = this.submissions.get(this.makeKey(assignmentId, studentId));
    return sub ? { ...sub } : null;
  }

  async getById(id: string): Promise<AssignmentSubmission | null> {
    for (const sub of this.submissions.values()) {
      if (sub.id === id) {
        return { ...sub };
      }
    }
    return null;
  }

  async upsert(
    data: Omit<AssignmentSubmission, "submittedAt" | "createdAt" | "updatedAt">,
  ): Promise<AssignmentSubmission> {
    const key = this.makeKey(data.assignmentId, data.studentId);
    const existing = this.submissions.get(key);
    const now = new Date().toISOString();

    const submission: AssignmentSubmission = {
      id: existing ? existing.id : data.id,
      assignmentId: data.assignmentId,
      studentId: data.studentId,
      answerText: data.answerText,
      attachmentUrl: data.attachmentUrl ?? null,
      attachmentName: data.attachmentName ?? null,
      attachmentSizeBytes: data.attachmentSizeBytes ?? null,
      status: data.status,
      submittedAt: now,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    };
    this.submissions.set(key, submission);
    return { ...submission };
  }

  async listByAssignment(
    assignmentId: string,
  ): Promise<AssignmentSubmission[]> {
    return Array.from(this.submissions.values())
      .filter((s) => s.assignmentId === assignmentId)
      .sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      )
      .map((s) => ({ ...s }));
  }

  async listByStudent(studentId: string): Promise<AssignmentSubmission[]> {
    return Array.from(this.submissions.values())
      .filter((s) => s.studentId === studentId)
      .sort(
        (a, b) =>
          new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      )
      .map((s) => ({ ...s }));
  }

  async countByAssignment(assignmentId: string): Promise<number> {
    return Array.from(this.submissions.values()).filter(
      (s) => s.assignmentId === assignmentId,
    ).length;
  }

  async findByAttachmentUrl(
    attachmentUrlOrKey: string,
  ): Promise<AssignmentSubmission | null> {
    if (!attachmentUrlOrKey) return null;
    for (const sub of this.submissions.values()) {
      if (
        sub.attachmentUrl &&
        (sub.attachmentUrl === attachmentUrlOrKey ||
          sub.attachmentUrl.includes(attachmentUrlOrKey) ||
          decodeURIComponent(sub.attachmentUrl).includes(attachmentUrlOrKey))
      ) {
        return { ...sub };
      }
    }
    return null;
  }
}

export class InMemoryClassroomContentStore implements ClassroomContentStore {
  private readonly contents = new Map<string, ClassroomContent>();

  async getById(id: string): Promise<ClassroomContent | null> {
    const c = this.contents.get(id);
    return c ? { ...c } : null;
  }

  async create(
    data: Omit<ClassroomContent, "createdAt" | "updatedAt">,
  ): Promise<ClassroomContent> {
    const now = new Date().toISOString();
    const content: ClassroomContent = {
      ...data,
      createdAt: now,
      updatedAt: now,
      publishedAt: data.publishedAt ?? (data.status === "published" ? now : null),
      archivedAt: data.archivedAt ?? null,
    };
    this.contents.set(content.id, content);
    return { ...content };
  }

  async update(
    id: string,
    patch: Partial<
      Omit<
        ClassroomContent,
        "id" | "classroomId" | "teacherId" | "createdAt" | "updatedAt"
      >
    >,
  ): Promise<ClassroomContent | null> {
    const existing = this.contents.get(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const updated: ClassroomContent = {
      ...existing,
      ...patch,
      updatedAt: now,
    };
    this.contents.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<boolean> {
    return this.contents.delete(id);
  }

  async archive(id: string): Promise<ClassroomContent | null> {
    const existing = this.contents.get(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const updated: ClassroomContent = {
      ...existing,
      status: "archived",
      archivedAt: now,
      updatedAt: now,
    };
    this.contents.set(id, updated);
    return { ...updated };
  }

  async listByClassroom(
    classroomId: string,
    status?: ClassroomContentStatus,
  ): Promise<ClassroomContent[]> {
    return Array.from(this.contents.values())
      .filter((c) => c.classroomId === classroomId && (!status || c.status === status))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((c) => ({ ...c }));
  }

  async listByTeacher(teacherId: string): Promise<ClassroomContent[]> {
    return Array.from(this.contents.values())
      .filter((c) => c.teacherId === teacherId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map((c) => ({ ...c }));
  }

  async countByClassroom(classroomId: string): Promise<number> {
    return Array.from(this.contents.values()).filter((c) => c.classroomId === classroomId).length;
  }

  async findByFileUrl(fileUrlOrKey: string): Promise<ClassroomContent | null> {
    if (!fileUrlOrKey) return null;
    for (const c of this.contents.values()) {
      if (
        c.fileUrl &&
        (c.fileUrl === fileUrlOrKey ||
          c.fileUrl.includes(fileUrlOrKey) ||
          decodeURIComponent(c.fileUrl).includes(fileUrlOrKey))
      ) {
        return { ...c };
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// In-Memory Teacher Student Messaging Stores
// ---------------------------------------------------------------------------

export class InMemoryTeacherConversationStore
  implements TeacherConversationStore
{
  private readonly conversations = new Map<string, TeacherConversation>();

  async create(
    data: Omit<TeacherConversation, "createdAt" | "updatedAt">,
  ): Promise<TeacherConversation> {
    const now = new Date().toISOString();
    const conv: TeacherConversation = {
      ...data,
      lastActivityAt: data.lastActivityAt || now,
      lastSenderRole: data.lastSenderRole || "student",
      teacherReadAt: data.teacherReadAt || null,
      studentReadAt: data.studentReadAt || null,
      answeredAt: data.answeredAt || null,
      closedAt: data.closedAt || null,
      createdAt: now,
      updatedAt: now,
    };
    this.conversations.set(conv.id, conv);
    return { ...conv };
  }

  async getById(id: string): Promise<TeacherConversation | null> {
    const conv = this.conversations.get(id);
    return conv ? { ...conv } : null;
  }

  async listByTeacher(
    teacherId: string,
    options: {
      status?: string;
      category?: string;
      classroomId?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ conversations: TeacherConversation[]; total: number }> {
    const filtered = Array.from(this.conversations.values())
      .filter((c) => c.teacherId === teacherId)
      .filter((c) => !options.status || options.status === "all" || c.status === options.status)
      .filter(
        (c) =>
          !options.category ||
          options.category === "all" ||
          c.category === options.category,
      )
      .filter(
        (c) => !options.classroomId || c.classroomId === options.classroomId,
      )
      .sort(
        (a, b) =>
          new Date(b.lastActivityAt).getTime() -
          new Date(a.lastActivityAt).getTime(),
      );

    const total = filtered.length;
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit =
      options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 20;
    const offset = (page - 1) * limit;

    return {
      conversations: filtered.slice(offset, offset + limit).map((c) => ({ ...c })),
      total,
    };
  }

  async listByStudent(
    studentId: string,
    options: {
      classroomId?: string;
      page?: number;
      limit?: number;
    } = {},
  ): Promise<{ conversations: TeacherConversation[]; total: number }> {
    const filtered = Array.from(this.conversations.values())
      .filter((c) => c.studentId === studentId)
      .filter(
        (c) => !options.classroomId || c.classroomId === options.classroomId,
      )
      .sort(
        (a, b) =>
          new Date(b.lastActivityAt).getTime() -
          new Date(a.lastActivityAt).getTime(),
      );

    const total = filtered.length;
    const page = options.page && options.page > 0 ? options.page : 1;
    const limit =
      options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 20;
    const offset = (page - 1) * limit;

    return {
      conversations: filtered.slice(offset, offset + limit).map((c) => ({ ...c })),
      total,
    };
  }

  async update(
    id: string,
    patch: Partial<TeacherConversation>,
  ): Promise<TeacherConversation | null> {
    const existing = this.conversations.get(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const updated: TeacherConversation = {
      ...existing,
      ...patch,
      updatedAt: now,
    };
    this.conversations.set(id, updated);
    return { ...updated };
  }

  async updateStatus(
    id: string,
    status: TeacherMessageStatus,
    extra: { closedAt?: string | null; answeredAt?: string | null } = {},
  ): Promise<TeacherConversation | null> {
    const existing = this.conversations.get(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const updated: TeacherConversation = {
      ...existing,
      status,
      closedAt:
        status === "closed"
          ? extra.closedAt || now
          : extra.closedAt !== undefined
            ? extra.closedAt
            : existing.closedAt,
      answeredAt:
        status === "answered"
          ? extra.answeredAt || now
          : extra.answeredAt !== undefined
            ? extra.answeredAt
            : existing.answeredAt,
      updatedAt: now,
    };
    this.conversations.set(id, updated);
    return { ...updated };
  }

  async markTeacherRead(
    id: string,
    readAt?: string,
  ): Promise<TeacherConversation | null> {
    const existing = this.conversations.get(id);
    if (!existing) return null;
    const now = readAt || new Date().toISOString();
    const updated: TeacherConversation = {
      ...existing,
      teacherReadAt: now,
      updatedAt: now,
    };
    this.conversations.set(id, updated);
    return { ...updated };
  }

  async markStudentRead(
    id: string,
    readAt?: string,
  ): Promise<TeacherConversation | null> {
    const existing = this.conversations.get(id);
    if (!existing) return null;
    const now = readAt || new Date().toISOString();
    const updated: TeacherConversation = {
      ...existing,
      studentReadAt: now,
      updatedAt: now,
    };
    this.conversations.set(id, updated);
    return { ...updated };
  }

  async countUnreadForTeacher(teacherId: string): Promise<number> {
    return Array.from(this.conversations.values()).filter(
      (c) => c.teacherId === teacherId && c.lastSenderRole === "student",
    ).length;
  }

  async countUnreadForStudent(studentId: string): Promise<number> {
    return Array.from(this.conversations.values()).filter(
      (c) => c.studentId === studentId && c.lastSenderRole === "teacher",
    ).length;
  }
}

export class InMemoryTeacherConversationMessageStore
  implements TeacherConversationMessageStore
{
  private readonly messages = new Map<string, TeacherConversationMessage>();

  async create(
    data: Omit<TeacherConversationMessage, "createdAt">,
  ): Promise<TeacherConversationMessage> {
    const now = new Date().toISOString();
    const msg: TeacherConversationMessage = {
      ...data,
      createdAt: now,
    };
    this.messages.set(msg.id, msg);
    return { ...msg };
  }

  async listByConversation(
    conversationId: string,
  ): Promise<TeacherConversationMessage[]> {
    return Array.from(this.messages.values())
      .filter((m) => m.conversationId === conversationId)
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      .map((m) => ({ ...m }));
  }

  async countByConversation(conversationId: string): Promise<number> {
    return Array.from(this.messages.values()).filter(
      (m) => m.conversationId === conversationId,
    ).length;
  }
}
