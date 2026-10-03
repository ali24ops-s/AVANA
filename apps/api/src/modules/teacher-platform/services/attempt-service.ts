import {
  DomainError,
  type Actor,
  type TeacherExam,
  type TeacherExamAttempt,
  type ExamSnapshotQuestion,
  type StudentSanitizedQuestion,
  type ExamOption,
  type TrueFalseStatement,
  type AttemptStatus,
  type RuntimeExamState,
  ATTEMPT_SUBMISSION_GRACE_MS,
  calculateRuntimeExamState,
  sanitizeQuestionsForStudent,
  validateSaveAnswerInput,
  computePerQuestionTiming,
} from "@avana/domain";
import type {
  TeacherExamAttemptStore,
  TeacherExamAttemptAnswerStore,
  TeacherExamStore,
  TeacherExamQuestionStore,
  ClassroomStore,
  ClassroomMemberStore,
} from "../stores.js";

export interface StudentExamListDTO {
  id: string;
  classroomId: string;
  title: string;
  description: string | null;
  durationMinutes: number | null;
  startsAt: string;
  endsAt: string;
  passingScorePercentage: number | null;
  showResultsImmediately: boolean;
  allowBackNavigation: boolean;
  perQuestionTimeSeconds?: number | null;
  runtimeState: RuntimeExamState;
  hasAttempt: boolean;
  attemptStatus: AttemptStatus | null;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passed: boolean | null;
}

export interface StudentAttemptDTO {
  id: string;
  examId: string;
  status: AttemptStatus;
  startedAt: string;
  deadlineAt: string;
  submittedAt: string | null;
  allowBackNavigation: boolean;
  perQuestionTimeSeconds?: number | null;
  questions: StudentSanitizedQuestion[];
  savedAnswers: Array<{
    questionId: string;
    selectedOptionId: string | null;
    textAnswer?: string | null;
    answeredAt?: string;
    finalizedAt?: string | null;
  }>;
}

export interface StudentAttemptResultDTO {
  id: string;
  examId: string;
  status: AttemptStatus;
  submittedAt: string | null;
  showResultsImmediately: boolean;
  score?: number | null;
  maxScore?: number | null;
  percentage?: number | null;
  passed?: boolean | null;
}

export class TeacherExamAttemptService {
  constructor(
    private readonly attemptStore: TeacherExamAttemptStore,
    private readonly answerStore: TeacherExamAttemptAnswerStore,
    private readonly examStore: TeacherExamStore,
    private readonly questionStore: TeacherExamQuestionStore,
    private readonly classroomStore: ClassroomStore,
    private readonly memberStore: ClassroomMemberStore,
  ) {
    if (
      "answerStore" in this.attemptStore &&
      !(this.attemptStore as { answerStore?: TeacherExamAttemptAnswerStore }).answerStore
    ) {
      (this.attemptStore as { answerStore?: TeacherExamAttemptAnswerStore }).answerStore = this.answerStore;
    }
  }

  /**
   * Helper: asserts student is an authenticated active member of the exam's classroom.
   */
  async assertStudentExamAccess(
    actor: Actor,
    examId: string,
  ): Promise<{ exam: TeacherExam; classroomId: string }> {
    const exam = await this.examStore.getById(examId);
    if (!exam) {
      throw new DomainError("not_found", "آزمون یافت نشد");
    }

    const classroom = await this.classroomStore.getById(exam.classroomId);
    if (!classroom || classroom.status === "archived") {
      throw new DomainError("not_found", "کلاس آزمون یافت نشد یا بایگانی شده است");
    }

    const membership = await this.memberStore.getMembership(
      classroom.id,
      actor.userId,
    );
    if (!membership || membership.status !== "active") {
      throw new DomainError("forbidden", "شما عضو فعال این کلاس نیستید");
    }

    return { exam, classroomId: classroom.id };
  }

  /**
   * Lists published exams accessible to the student in their enrolled classrooms.
   */
  async listStudentExams(
    actor: Actor,
    classroomId?: string,
  ): Promise<StudentExamListDTO[]> {
    let targetClassroomIds: string[] = [];

    if (classroomId) {
      const membership = await this.memberStore.getMembership(classroomId, actor.userId);
      if (!membership || membership.status !== "active") {
        throw new DomainError("forbidden", "شما عضو فعال این کلاس نیستید");
      }
      targetClassroomIds = [classroomId];
    } else {
      const memberships = await this.memberStore.listClassroomsForStudent(
        actor.userId,
        "active",
      );
      targetClassroomIds = memberships.map((m) => m.classroomId);
    }

    const results: StudentExamListDTO[] = [];
    for (const cId of targetClassroomIds) {
      const exams = await this.examStore.listByClassroom(cId);
      for (const exam of exams) {
        if (exam.status !== "published") continue;

        const runtimeState = calculateRuntimeExamState(exam);
        let attempt = await this.attemptStore.getByExamAndStudent(exam.id, actor.userId);

        if (attempt && attempt.status === "in_progress") {
          const nowMs = Date.now();
          const deadlineMs = new Date(attempt.deadlineAt).getTime();
          if (nowMs > deadlineMs + ATTEMPT_SUBMISSION_GRACE_MS) {
            try {
              attempt = await this.finalizeAttempt(attempt, exam, "timed_out");
            } catch {
              // ignore conflict if finalized concurrently
            }
          }
        }

        const canSeeScore =
          attempt?.status === "submitted" || attempt?.status === "timed_out"
            ? exam.showResultsImmediately ||
              Boolean(exam.resultsReleasedAt) ||
              new Date().getTime() >= new Date(exam.endsAt).getTime()
            : false;

        results.push({
          id: exam.id,
          classroomId: exam.classroomId,
          title: exam.title,
          description: exam.description ?? null,
          durationMinutes: exam.durationMinutes ?? null,
          startsAt: exam.startsAt,
          endsAt: exam.endsAt,
          passingScorePercentage: exam.passingScorePercentage ?? null,
          showResultsImmediately: exam.showResultsImmediately,
          allowBackNavigation: exam.allowBackNavigation,
          perQuestionTimeSeconds: exam.perQuestionTimeSeconds ?? null,
          runtimeState,
          hasAttempt: Boolean(attempt),
          attemptStatus: attempt?.status ?? null,
          score: canSeeScore ? attempt?.score ?? null : null,
          maxScore: canSeeScore ? attempt?.maxScore ?? null : null,
          percentage: canSeeScore ? attempt?.percentage ?? null : null,
          passed: canSeeScore ? attempt?.passed ?? null : null,
        });
      }
    }

    return results;
  }

  /**
   * Starts an exam attempt for the student.
   * Freezes snapshot questions and enforces one-attempt invariant.
   */
  async startAttempt(actor: Actor, examId: string): Promise<StudentAttemptDTO> {
    const { exam } = await this.assertStudentExamAccess(actor, examId);

    const runtimeState = calculateRuntimeExamState(exam);
    if (runtimeState === "upcoming") {
      throw new DomainError("bad_request", "آزمون هنوز شروع نشده است");
    }
    if (runtimeState === "closed") {
      throw new DomainError("bad_request", "مهلت شرکت در آزمون به پایان رسیده است");
    }
    if (runtimeState !== "active") {
      throw new DomainError("bad_request", "آزمون در وضعیت فعال برای شروع نیست");
    }

    // Check one-attempt rule
    const existing = await this.attemptStore.getByExamAndStudent(exam.id, actor.userId);
    if (existing) {
      throw new DomainError("conflict", "شما قبلاً در این آزمون شرکت کرده‌اید");
    }

    // Load live questions
    const rawQuestions = await this.questionStore.listByExam(exam.id);
    if (rawQuestions.length === 0) {
      throw new DomainError("bad_request", "آزمون فاقد سوال است");
    }

    // Freeze snapshot questions
    let snapshot: ExamSnapshotQuestion[] = rawQuestions.map((q, idx) => {
      const qType = q.questionType ?? "single_choice";
      let options: ExamOption[] = [];
      let statements: TrueFalseStatement[] | undefined = undefined;
      if (qType === "true_false") {
        statements = q.statements ? [...q.statements] : [];
      } else if (qType === "single_choice" && q.options && q.options.length > 0) {
        options = exam.shuffleOptions ? [...q.options].sort(() => Math.random() - 0.5) : [...q.options];
      }

      return {
        id: q.id,
        orderIndex: idx,
        questionType: qType,
        prompt: q.prompt,
        options,
        statements,
        correctOptionId: q.correctOptionId ?? null,
        points: q.points,
        explanation: q.explanation ?? null,
      };
    });

    if (exam.shuffleQuestions) {
      snapshot = snapshot.sort(() => Math.random() - 0.5);
      snapshot.forEach((q, idx) => {
        q.orderIndex = idx;
      });
    }

    // Calculate deadline = min(now + duration, exam.endsAt)
    const now = new Date();
    const examEndsMs = new Date(exam.endsAt).getTime();
    const durationMs = exam.durationMinutes ? exam.durationMinutes * 60 * 1000 : null;
    const deadlineMs = durationMs !== null
      ? Math.min(now.getTime() + durationMs, examEndsMs)
      : examEndsMs;
    const deadlineAt = new Date(deadlineMs).toISOString();

    const attempt = await this.attemptStore.create({
      id: crypto.randomUUID(),
      examId: exam.id,
      studentId: actor.userId,
      status: "in_progress",
      gradingStatus: "fully_graded",
      startedAt: now.toISOString(),
      deadlineAt,
      allowBackNavigation: exam.allowBackNavigation,
      perQuestionTimeSeconds: exam.perQuestionTimeSeconds ?? null,
      questionSnapshot: snapshot,
    });

    return {
      id: attempt.id,
      examId: attempt.examId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      submittedAt: attempt.submittedAt ?? null,
      allowBackNavigation: attempt.allowBackNavigation ?? exam.allowBackNavigation,
      perQuestionTimeSeconds: attempt.perQuestionTimeSeconds ?? exam.perQuestionTimeSeconds ?? null,
      questions: sanitizeQuestionsForStudent(attempt.questionSnapshot),
      savedAnswers: [],
    };
  }

  /**
   * Retrieves the student's in-progress or completed attempt.
   * Auto-finalizes timed-out attempts if grace has passed.
   */
  async getCurrentAttempt(
    actor: Actor,
    examId: string,
  ): Promise<StudentAttemptDTO | null> {
    const { exam } = await this.assertStudentExamAccess(actor, examId);
    let attempt = await this.attemptStore.getByExamAndStudent(exam.id, actor.userId);
    if (!attempt) return null;

    // Check if attempt timed out
    if (attempt.status === "in_progress") {
      const nowMs = Date.now();
      const deadlineMs = new Date(attempt.deadlineAt).getTime();
      if (nowMs > deadlineMs + ATTEMPT_SUBMISSION_GRACE_MS) {
        try {
          attempt = await this.finalizeAttempt(attempt, exam, "timed_out");
        } catch (err) {
          if (err instanceof DomainError && err.code === "conflict") {
            const reloaded = await this.attemptStore.getById(attempt.id);
            if (reloaded) {
              attempt = reloaded;
            } else {
              throw err;
            }
          } else {
            throw err;
          }
        }
      }
    }

    const answers = await this.answerStore.listByAttempt(attempt.id);

    return {
      id: attempt.id,
      examId: attempt.examId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      submittedAt: attempt.submittedAt ?? null,
      allowBackNavigation: attempt.allowBackNavigation ?? exam.allowBackNavigation,
      perQuestionTimeSeconds: attempt.perQuestionTimeSeconds ?? exam.perQuestionTimeSeconds ?? null,
      questions: sanitizeQuestionsForStudent(attempt.questionSnapshot),
      savedAnswers: answers.map((a) => ({
        questionId: a.questionId,
        selectedOptionId: a.selectedOptionId ?? null,
        textAnswer: a.textAnswer ?? null,
        answeredAt: a.answeredAt,
        finalizedAt: a.finalizedAt ?? null,
      })),
    };
  }

  /**
   * Saves or updates an answer to a question during the attempt.
   * Prohibited once deadline has passed (even during grace).
   */
  async saveAnswer(
    actor: Actor,
    examId: string,
    questionId: string,
    raw: unknown,
  ): Promise<void> {
    const { exam } = await this.assertStudentExamAccess(actor, examId);
    const attempt = await this.attemptStore.getByExamAndStudent(exam.id, actor.userId);
    if (!attempt) {
      throw new DomainError("not_found", "تلاش فعالی برای این آزمون یافت نشد");
    }

    if (attempt.status !== "in_progress") {
      throw new DomainError("bad_request", "آزمون پایان یافته و امکان ثبت پاسخ نیست");
    }

    // Check timing: saveAnswer strictly prohibited after deadlineAt
    const nowMs = Date.now();
    const deadlineMs = new Date(attempt.deadlineAt).getTime();
    if (nowMs > deadlineMs) {
      if (nowMs > deadlineMs + ATTEMPT_SUBMISSION_GRACE_MS) {
        try {
          await this.finalizeAttempt(attempt, exam, "timed_out");
        } catch (err) {
          if (!(err instanceof DomainError && err.code === "conflict")) {
            throw err;
          }
        }
        throw new DomainError("timeout", "مهلت پاسخگویی به آزمون به پایان رسیده است");
      }
      throw new DomainError(
        "bad_request",
        "زمان پاسخگویی به پایان رسیده است. شما در مهلت تایید و ارسال نهایی هستید و امکان تغییر گزینه‌ها وجود ندارد.",
      );
    }

    const input = validateSaveAnswerInput({
      ...(typeof raw === "object" && raw !== null ? raw : {}),
      questionId,
    });

    // Validate question belongs to this student's frozen snapshot
    const targetQuestionIndex = attempt.questionSnapshot.findIndex(
      (q) => q.id === input.questionId,
    );
    if (targetQuestionIndex === -1) {
      throw new DomainError("not_found", "سوال در آزمون شما یافت نشد");
    }
    const snapshotQuestion = attempt.questionSnapshot[targetQuestionIndex];

    const existingAnswers = await this.answerStore.listByAttempt(attempt.id);
    const effectiveAllowBack = attempt.allowBackNavigation ?? exam.allowBackNavigation;
    const effectivePerQuestionTiming =
      attempt.perQuestionTimeSeconds ?? exam.perQuestionTimeSeconds ?? null;

    if (effectivePerQuestionTiming && effectivePerQuestionTiming > 0) {
      const timing = computePerQuestionTiming({
        startedAt: attempt.startedAt,
        deadlineAt: attempt.deadlineAt,
        perQuestionTimeSeconds: effectivePerQuestionTiming,
        questions: attempt.questionSnapshot,
        savedAnswers: existingAnswers,
        now: nowMs,
      });

      if (timing) {
        if (targetQuestionIndex < timing.currentIndex) {
          throw new DomainError(
            "bad_request",
            "امکان بازگشت و تغییر پاسخ سوالات قبلی در این آزمون وجود ندارد",
          );
        }
        if (targetQuestionIndex > timing.currentIndex) {
          throw new DomainError(
            "bad_request",
            "ابتدا باید به سؤال جاری پاسخ دهید",
          );
        }

        // Active question: check deadline + 3000ms network in-flight grace period
        const questionDeadline = timing.questionDeadlines[targetQuestionIndex];
        if (nowMs > questionDeadline + 3000) {
          throw new DomainError(
            "bad_request",
            "مهلت پاسخگویی به این سؤال به پایان رسیده است",
          );
        }
      }
    } else if (!effectiveAllowBack) {
      let maxAnsweredIndex = -1;
      for (const ans of existingAnswers) {
        if (ans.selectedOptionId || ans.textAnswer) {
          const idx = attempt.questionSnapshot.findIndex((q) => q.id === ans.questionId);
          if (idx > maxAnsweredIndex) {
            maxAnsweredIndex = idx;
          }
        }
      }

      if (targetQuestionIndex < maxAnsweredIndex) {
        throw new DomainError(
          "bad_request",
          "امکان بازگشت و تغییر پاسخ سوالات قبلی در این آزمون وجود ندارد",
        );
      }
    }

    // Validate selected option exists in question options (if an option was selected for single_choice)
    if (snapshotQuestion.questionType === "single_choice" && input.selectedOptionId !== null) {
      const options = snapshotQuestion.options ?? [];
      const optionExists = options.some(
        (o) => o.id === input.selectedOptionId,
      );
      if (!optionExists) {
        throw new DomainError("bad_request", "گزینه انتخابی نامعتبر است");
      }
    }

    // Upsert answer without grading fields
    await this.answerStore.upsert({
      id: crypto.randomUUID(),
      attemptId: attempt.id,
      questionId: input.questionId,
      selectedOptionId: input.selectedOptionId ?? null,
      textAnswer: input.textAnswer ?? null,
      finalizedAt: input.finalized ? new Date().toISOString() : undefined,
      isCorrect: null,
      pointsEarned: null,
      activeDurationMs: input.activeDurationMs ?? undefined,
      tabSwitchesCount: input.tabSwitchesCount ?? undefined,
      integrityMetadata: input.integrityData ?? undefined,
    });
  }

  /**
   * Submits an attempt for final grading.
   * Accepts submission during the 60-second grace period.
   * Auto-marks timed_out if grace has expired.
   */
  async submitAttempt(
    actor: Actor,
    examId: string,
  ): Promise<StudentAttemptResultDTO> {
    const { exam } = await this.assertStudentExamAccess(actor, examId);
    const attempt = await this.attemptStore.getByExamAndStudent(exam.id, actor.userId);
    if (!attempt) {
      throw new DomainError("not_found", "تلاش فعالی برای این آزمون یافت نشد");
    }

    if (attempt.status === "submitted" || attempt.status === "timed_out") {
      throw new DomainError("conflict", "این آزمون قبلاً پایان یافته و ثبت شده است");
    }

    const nowMs = Date.now();
    const deadlineMs = new Date(attempt.deadlineAt).getTime();
    const isGraceExpired = nowMs > deadlineMs + ATTEMPT_SUBMISSION_GRACE_MS;

    const finalStatus: AttemptStatus = isGraceExpired ? "timed_out" : "submitted";
    const finalized = await this.finalizeAttempt(attempt, exam, finalStatus);

    const showImmediate = exam.showResultsImmediately;

    return {
      id: finalized.id,
      examId: finalized.examId,
      status: finalized.status,
      submittedAt: finalized.submittedAt ?? null,
      showResultsImmediately: showImmediate,
      score: showImmediate ? finalized.score : null,
      maxScore: showImmediate ? finalized.maxScore : null,
      percentage: showImmediate ? finalized.percentage : null,
      passed: showImmediate ? finalized.passed : null,
    };
  }

  /**
   * Internal helper: evaluates answers strictly against frozen snapshot and updates attempt atomically.
   */
  private async finalizeAttempt(
    attempt: TeacherExamAttempt,
    exam: TeacherExam,
    status: "submitted" | "timed_out",
  ): Promise<TeacherExamAttempt> {
    return await this.attemptStore.finalizeAttempt(
      attempt.id,
      status,
      exam.passingScorePercentage,
    );
  }
}
