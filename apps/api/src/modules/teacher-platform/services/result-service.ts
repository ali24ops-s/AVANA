import {
  DomainError,
  asUserId,
  asOrganizationId,
  gradeAttempt,
  validateGradeDescriptiveAnswerInput,
  analyzeDescriptiveAnswerIntegrity,
  type Actor,
  type TeacherExam,
  type TeacherExamAttempt,
  type TeacherExamAttemptAnswer,
  type AttemptStatus,
  type QuestionType,
  type QuestionGradingStatus,
  type AttemptGradingStatus,
  type TrueFalseStatementReview,
  type DescriptiveAnswerIntegrityAnalysis,
  type StudentExamResultState,
  ATTEMPT_SUBMISSION_GRACE_MS,
} from "@avana/domain";
import type {
  TeacherExamStore,
  TeacherExamAttemptStore,
  TeacherExamAttemptAnswerStore,
  ClassroomStore,
  ClassroomMemberStore,
} from "../stores.js";
import type { OrganizationStore } from "../../organizations/organization-store.js";
import type { UserStore } from "../../identity/user-store.js";

export interface ScoreDistribution {
  range: string;
  count: number;
}

export interface StudentAttemptSummaryDTO {
  id?: string;
  attemptId?: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  status: AttemptStatus | "absent";
  gradingStatus?: AttemptGradingStatus;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  passed: boolean | null;
  startedAt: string | null;
  submittedAt: string | null;
  durationMinutes: number | null;
}

export interface TeacherExamResultsAggregateDTO {
  examId: string;
  examTitle: string;
  enrolledCount: number;
  submittedCount: number;
  inProgressCount: number;
  timedOutCount: number;
  absentCount: number;
  averageScore: number;
  maxScore: number;
  minScore: number;
  passingRate: number | null;
  scoreDistribution: ScoreDistribution[];
  students: StudentAttemptSummaryDTO[];
}

export interface StudentQuestionReviewDTO {
  questionId: string;
  orderIndex: number;
  questionType?: QuestionType;
  prompt: string;
  options?: Array<{ id: string; text: string }>;
  statements?: TrueFalseStatementReview[];
  selectedOptionId: string | null;
  textAnswer?: string | null;
  teacherFeedback?: string | null;
  gradingStatus?: QuestionGradingStatus;
  correctOptionId?: string;
  explanation?: string | null;
  isCorrect?: boolean | null;
  pointsEarned?: number | null;
  maxPoints?: number;
  integrityAnalysis?: DescriptiveAnswerIntegrityAnalysis | null;
}

export interface StudentReviewDTO {
  id: string;
  examId: string;
  status: AttemptStatus;
  gradingStatus?: AttemptGradingStatus;
  submittedAt: string | null;
  resultsReleased: boolean;
  state?: StudentExamResultState;
  score?: number | null;
  maxScore?: number | null;
  percentage?: number | null;
  passed?: boolean | null;
  questions?: StudentQuestionReviewDTO[];
  message?: string;
}

export class TeacherExamResultService {
  constructor(
    private readonly examStore: TeacherExamStore,
    private readonly attemptStore: TeacherExamAttemptStore,
    private readonly answerStore: TeacherExamAttemptAnswerStore,
    private readonly classroomStore: ClassroomStore,
    private readonly memberStore: ClassroomMemberStore,
    private readonly organizationStore: OrganizationStore,
    private readonly userStore: UserStore,
  ) {}

  /**
   * Helper: asserts teacher access to an exam.
   */
  private async assertTeacherExamAccess(
    actor: Actor,
    examId: string,
  ): Promise<TeacherExam> {
    const exam = await this.examStore.getById(examId);
    if (!exam) {
      throw new DomainError("not_found", "آزمون یافت نشد");
    }

    const classroom = await this.classroomStore.getById(exam.classroomId);
    if (!classroom) {
      throw new DomainError("not_found", "کلاس یافت نشد");
    }

    if (actor.globalRole === "platform_admin" || actor.role === "platform_admin") {
      return exam;
    }

    if (classroom.teacherId === actor.userId) {
      return exam;
    }

    const membership = await this.organizationStore.findMembership(
      asOrganizationId(classroom.organizationId),
      asUserId(actor.userId),
    );

    if (membership && membership.role === "organization_admin") {
      return exam;
    }

    throw new DomainError("not_found", "آزمون یافت نشد");
  }

  /**
   * Generates comprehensive results, metrics, and distribution for teacher view.
   */
  async getExamResultsAggregate(
    actor: Actor,
    examId: string,
  ): Promise<TeacherExamResultsAggregateDTO> {
    const exam = await this.assertTeacherExamAccess(actor, examId);
    const activeMembers = await this.memberStore.listMembers(exam.classroomId, "active");
    const attempts = await this.attemptStore.listByExam(examId);

    const attemptByStudent = new Map(attempts.map((a) => [a.studentId, a]));

    let submittedCount = 0;
    let inProgressCount = 0;
    let timedOutCount = 0;
    const completedScores: number[] = [];
    const completedPercentages: number[] = [];
    let passedCount = 0;

    const distributionMap: Record<string, number> = {
      "کمتر از ۵۰٪": 0,
      "۵۰ تا ۶۹٪": 0,
      "۷۰ تا ۸۴٪": 0,
      "۸۵ تا ۱۰۰٪": 0,
    };

    const students: StudentAttemptSummaryDTO[] = [];

    // 1. Process all attempts first (including students who left or were removed)
    for (const att of attempts) {
      if (att.status === "in_progress") inProgressCount++;
      else if (att.status === "submitted") submittedCount++;
      else if (att.status === "timed_out") timedOutCount++;

      const isCompleted = att.status === "submitted" || att.status === "timed_out";
      if (
        isCompleted &&
        att.score !== null &&
        att.score !== undefined &&
        att.percentage !== null &&
        att.percentage !== undefined
      ) {
        completedScores.push(att.score);
        completedPercentages.push(att.percentage);
        if (att.passed) passedCount++;

        if (att.percentage < 50) distributionMap["کمتر از ۵۰٪"]++;
        else if (att.percentage < 70) distributionMap["۵۰ تا ۶۹٪"]++;
        else if (att.percentage < 85) distributionMap["۷۰ تا ۸۴٪"]++;
        else distributionMap["۸۵ تا ۱۰۰٪"]++;
      }

      let durationMinutes: number | null = null;
      if (att.startedAt && att.submittedAt) {
        const diffMs = new Date(att.submittedAt).getTime() - new Date(att.startedAt).getTime();
        durationMinutes = Math.max(1, Math.round(diffMs / 60000));
      }

      const user = await this.userStore.findById(asUserId(att.studentId));
      const studentName = user
        ? (user.name || `${(user as { firstName?: string }).firstName ?? ""} ${(user as { lastName?: string }).lastName ?? ""}`.trim() || user.email)
        : "دانش‌آموز";
      const studentEmail = user ? user.email : "";

      students.push({
        id: att.id,
        attemptId: att.id,
        studentId: att.studentId,
        studentName,
        studentEmail,
        status: att.status,
        gradingStatus: att.gradingStatus ?? "fully_graded",
        score: att.score ?? null,
        maxScore: att.maxScore ?? null,
        percentage: att.percentage ?? null,
        passed: att.passed ?? null,
        startedAt: att.startedAt,
        submittedAt: att.submittedAt ?? null,
        durationMinutes,
      });
    }

    // 2. Process active members who did not take the exam (absent)
    let absentCount = 0;
    for (const m of activeMembers) {
      if (!attemptByStudent.has(m.studentId)) {
        absentCount++;
        const user = await this.userStore.findById(asUserId(m.studentId));
        const studentName = user
          ? (user.name || `${(user as { firstName?: string }).firstName ?? ""} ${(user as { lastName?: string }).lastName ?? ""}`.trim() || user.email)
          : "دانش‌آموز";
        const studentEmail = user ? user.email : "";

        students.push({
          studentId: m.studentId,
          studentName,
          studentEmail,
          status: "absent",
          gradingStatus: "fully_graded",
          score: null,
          maxScore: null,
          percentage: null,
          passed: null,
          startedAt: null,
          submittedAt: null,
          durationMinutes: null,
        });
      }
    }

    const completedTotal = completedPercentages.length;
    const avgScore =
      completedScores.length > 0
        ? Math.round((completedScores.reduce((a, b) => a + b, 0) / completedScores.length) * 100) / 100
        : 0;
    const maxScore = completedScores.length > 0 ? Math.max(...completedScores) : 0;
    const minScore = completedScores.length > 0 ? Math.min(...completedScores) : 0;
    const passingRate =
      exam.passingScorePercentage !== null && exam.passingScorePercentage !== undefined
        ? completedTotal > 0
          ? Math.round((passedCount / completedTotal) * 10000) / 100
          : 0
        : null;

    const scoreDistribution: ScoreDistribution[] = Object.entries(distributionMap).map(
      ([range, count]) => ({ range, count }),
    );

    return {
      examId: exam.id,
      examTitle: exam.title,
      enrolledCount: activeMembers.length,
      submittedCount,
      inProgressCount,
      timedOutCount,
      absentCount,
      averageScore: avgScore,
      maxScore,
      minScore,
      passingRate,
      scoreDistribution,
      students,
    };
  }

  /**
   * Retrieves individual student exam answers and review for teacher view.
   */
  async getStudentExamResultForTeacher(
    actor: Actor,
    examId: string,
    studentId: string,
  ): Promise<{
    attempt: StudentAttemptSummaryDTO;
    questions: StudentQuestionReviewDTO[];
  }> {
    const exam = await this.assertTeacherExamAccess(actor, examId);
    const attempt = await this.attemptStore.getByExamAndStudent(exam.id, studentId);
    if (!attempt) {
      throw new DomainError("not_found", "تلاش ثبت‌شده‌ای برای این دانش‌آموز یافت نشد");
    }

    const user = await this.userStore.findById(asUserId(studentId));
    const studentName = user
      ? (user.name || `${(user as { firstName?: string }).firstName ?? ""} ${(user as { lastName?: string }).lastName ?? ""}`.trim() || user.email)
      : "دانش‌آموز";

    const answers = await this.answerStore.listByAttempt(attempt.id);
    const answerMap = new Map(answers.map((a) => [a.questionId, a]));

    const questions: StudentQuestionReviewDTO[] = attempt.questionSnapshot.map((q) => {
      const ans = answerMap.get(q.id);
      const isDescriptive = q.questionType === "descriptive";
      let statementsReview: TrueFalseStatementReview[] | undefined = undefined;
      if (q.questionType === "true_false" && q.statements) {
        let studentAnswers: Record<string, boolean> = {};
        if (ans?.textAnswer) {
          try {
            const parsed = JSON.parse(ans.textAnswer);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              studentAnswers = parsed;
            }
          } catch {
            // ignore
          }
        }
        statementsReview = q.statements.map((stmt) => {
          const selectedAnswer =
            typeof studentAnswers[stmt.id] === "boolean" ? studentAnswers[stmt.id] : null;
          const isCorrect = selectedAnswer === stmt.correctAnswer;
          return {
            id: stmt.id,
            text: stmt.text,
            selectedAnswer,
            correctAnswer: stmt.correctAnswer,
            isCorrect,
          };
        });
      }

      return {
        questionId: q.id,
        orderIndex: q.orderIndex,
        questionType: q.questionType ?? "single_choice",
        prompt: q.prompt,
        options: q.options ?? [],
        statements: statementsReview,
        selectedOptionId: ans?.selectedOptionId ?? null,
        textAnswer: ans?.textAnswer ?? null,
        teacherFeedback: ans?.teacherFeedback ?? null,
        gradingStatus: ans?.gradingStatus ?? (isDescriptive ? "ungraded" : "auto_graded"),
        correctOptionId: q.correctOptionId ?? undefined,
        explanation: q.explanation,
        isCorrect: ans?.isCorrect ?? (isDescriptive ? null : false),
        pointsEarned: ans?.pointsEarned ?? (isDescriptive ? null : 0),
        maxPoints: q.points,
        integrityAnalysis: isDescriptive
          ? analyzeDescriptiveAnswerIntegrity(ans?.textAnswer, ans?.integrityMetadata)
          : null,
      };
    });

    return {
      attempt: {
        id: attempt.id,
        attemptId: attempt.id,
        studentId: attempt.studentId,
        studentName,
        studentEmail: user?.email ?? "",
        status: attempt.status,
        gradingStatus: attempt.gradingStatus ?? "fully_graded",
        score: attempt.score ?? null,
        maxScore: attempt.maxScore ?? null,
        percentage: attempt.percentage ?? null,
        passed: attempt.passed ?? null,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt ?? null,
        durationMinutes:
          attempt.startedAt && attempt.submittedAt
            ? Math.round((new Date(attempt.submittedAt).getTime() - new Date(attempt.startedAt).getTime()) / 60000)
            : null,
      },
      questions,
    };
  }

  /**
   * Grades or updates the grade of a single descriptive answer by the teacher.
   */
  async gradeDescriptiveAnswer(
    actor: Actor,
    examId: string,
    attemptId: string,
    questionId: string,
    rawInput: unknown,
  ): Promise<{
    attempt: TeacherExamAttempt;
    answer: TeacherExamAttemptAnswer;
  }> {
    const exam = await this.assertTeacherExamAccess(actor, examId);
    const attempt = await this.attemptStore.getById(attemptId);
    if (!attempt || attempt.examId !== examId) {
      throw new DomainError("not_found", "تلاش یافت نشد");
    }

    if (attempt.status === "in_progress") {
      throw new DomainError("bad_request", "امکان ثبت نمره برای آزمون در حال انجام وجود ندارد");
    }

    const question = attempt.questionSnapshot.find((q) => q.id === questionId);
    if (!question) {
      throw new DomainError("not_found", "سوال در این آزمون یافت نشد");
    }

    if (question.questionType !== "descriptive") {
      throw new DomainError("bad_request", "فقط سوالات تشریحی امکان تصحیح دستی دارند");
    }

    const input = validateGradeDescriptiveAnswerInput(rawInput, question.points);

    const existingAns = await this.answerStore.get(attemptId, questionId);
    const updatedAns = await this.answerStore.upsert({
      id: existingAns ? existingAns.id : crypto.randomUUID(),
      attemptId,
      questionId,
      selectedOptionId: null,
      textAnswer: existingAns?.textAnswer ?? null,
      teacherFeedback: input.teacherFeedback !== undefined ? input.teacherFeedback : existingAns?.teacherFeedback ?? null,
      gradingStatus: "graded",
      isCorrect: input.pointsEarned > 0,
      pointsEarned: input.pointsEarned,
    });

    const allAnswers = await this.answerStore.listByAttempt(attemptId);
    const gradeResult = gradeAttempt(
      attempt.questionSnapshot,
      allAnswers.map((a) => ({
        questionId: a.questionId,
        selectedOptionId: a.selectedOptionId,
        textAnswer: a.textAnswer,
        teacherFeedback: a.teacherFeedback,
        gradingStatus: a.gradingStatus,
        pointsEarned: a.pointsEarned,
      })),
      exam.passingScorePercentage,
    );

    const updatedAttempt = await this.attemptStore.update(attemptId, {
      gradingStatus: gradeResult.gradingStatus,
      score: gradeResult.totalScore,
      maxScore: gradeResult.maxScore,
      percentage: gradeResult.percentage,
      passed: gradeResult.passed,
    });

    return {
      attempt: updatedAttempt!,
      answer: updatedAns,
    };
  }

  // -------------------------------------------------------------------------
  // Student Review & Results Release Visibility
  // -------------------------------------------------------------------------

  /**
   * Student review endpoint. Strictly hides answers and keys until results are released.
   * Differentiates grading in progress, results pending teacher, closed unpublished, and ready states.
   */
  async getStudentReview(actor: Actor, examId: string): Promise<StudentReviewDTO> {
    const exam = await this.examStore.getById(examId);
    if (!exam || exam.status !== "published") {
      throw new DomainError("not_found", "این آزمون دیگر در دسترس نیست.", {
        reason: "EXAM_UNAVAILABLE",
      });
    }

    const classroom = await this.classroomStore.getById(exam.classroomId);
    if (!classroom || classroom.status === "archived") {
      throw new DomainError("forbidden", "دسترسی شما به نتیجه این آزمون در حال حاضر امکان‌پذیر نیست.", {
        reason: "ACCESS_DENIED",
      });
    }

    const membership = await this.memberStore.getMembership(classroom.id, actor.userId);
    if (!membership || membership.status !== "active") {
      throw new DomainError("forbidden", "دسترسی شما به نتیجه این آزمون در حال حاضر امکان‌پذیر نیست.", {
        reason: "ACCESS_DENIED",
      });
    }

    let attempt = await this.attemptStore.getByExamAndStudent(exam.id, actor.userId);
    if (!attempt) {
      throw new DomainError("not_found", "شما هنوز در این آزمون شرکت نکرده‌اید.", {
        reason: "EXAM_NOT_ATTEMPTED",
      });
    }

    if (attempt.status === "in_progress") {
      const nowMs = Date.now();
      const deadlineMs = new Date(attempt.deadlineAt).getTime();
      if (nowMs > deadlineMs + ATTEMPT_SUBMISSION_GRACE_MS) {
        try {
          attempt = await this.attemptStore.finalizeAttempt(
            attempt.id,
            "timed_out",
            exam.passingScorePercentage,
          );
        } catch {
          const fresh = await this.attemptStore.getByExamAndStudent(exam.id, actor.userId);
          if (fresh) attempt = fresh;
        }
      } else {
        throw new DomainError("bad_request", "آزمون شما هنوز پایان نیافته است.", {
          reason: "ATTEMPT_IN_PROGRESS",
        });
      }
    }

    // Check if attempt data is valid / data-integrity issue
    if (!attempt.questionSnapshot || !Array.isArray(attempt.questionSnapshot) || attempt.questionSnapshot.length === 0) {
      throw new DomainError("not_found", "اطلاعات نتیجه این آزمون در حال حاضر در دسترس نیست.", {
        reason: "RESULT_MISSING",
      });
    }

    // Check if grading is in progress (e.g. descriptive answers ungraded)
    if (
      attempt.gradingStatus === "needs_manual_review" ||
      (attempt.gradingStatus as string) === "ungraded" ||
      (attempt.gradingStatus as string) === "partially_graded"
    ) {
      return {
        id: attempt.id,
        examId: attempt.examId,
        status: attempt.status,
        gradingStatus: attempt.gradingStatus,
        submittedAt: attempt.submittedAt ?? null,
        resultsReleased: false,
        state: "grading_in_progress",
        message: "نتیجه آزمون در حال آماده‌سازی است. لطفاً بعداً دوباره تلاش کنید.",
      };
    }

    // Check release status
    const isReleased =
      exam.showResultsImmediately ||
      Boolean(exam.resultsReleasedAt);

    if (!isReleased) {
      const nowMs = Date.now();
      const endsAtMs = new Date(exam.endsAt).getTime();
      const isEnded = nowMs >= endsAtMs;

      if (isEnded) {
        return {
          id: attempt.id,
          examId: attempt.examId,
          status: attempt.status,
          gradingStatus: attempt.gradingStatus ?? "fully_graded",
          submittedAt: attempt.submittedAt ?? null,
          resultsReleased: false,
          state: "results_unpublished_closed",
          message: "آزمون به پایان رسیده است، اما نتیجه آن هنوز منتشر نشده است.",
        };
      }

      return {
        id: attempt.id,
        examId: attempt.examId,
        status: attempt.status,
        gradingStatus: attempt.gradingStatus ?? "fully_graded",
        submittedAt: attempt.submittedAt ?? null,
        resultsReleased: false,
        state: "results_pending_teacher",
        message: "نتیجه آزمون هنوز توسط استاد اعلام نشده است.",
      };
    }

    // Results are released: return full detailed review
    const answers = await this.answerStore.listByAttempt(attempt.id);
    const answerMap = new Map(answers.map((a) => [a.questionId, a]));

    const questions: StudentQuestionReviewDTO[] = attempt.questionSnapshot.map((q) => {
      const ans = answerMap.get(q.id);
      const isDescriptive = q.questionType === "descriptive";
      let statementsReview: TrueFalseStatementReview[] | undefined = undefined;
      if (q.questionType === "true_false" && q.statements) {
        let studentAnswers: Record<string, boolean> = {};
        if (ans?.textAnswer) {
          try {
            const parsed = JSON.parse(ans.textAnswer);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
              studentAnswers = parsed;
            }
          } catch {
            // ignore
          }
        }
        statementsReview = q.statements.map((stmt) => {
          const selectedAnswer =
            typeof studentAnswers[stmt.id] === "boolean" ? studentAnswers[stmt.id] : null;
          const isCorrect = selectedAnswer === stmt.correctAnswer;
          return {
            id: stmt.id,
            text: stmt.text,
            selectedAnswer,
            correctAnswer: stmt.correctAnswer,
            isCorrect,
          };
        });
      }

      return {
        questionId: q.id,
        orderIndex: q.orderIndex,
        questionType: q.questionType ?? "single_choice",
        prompt: q.prompt,
        options: q.options ?? [],
        statements: statementsReview,
        selectedOptionId: ans?.selectedOptionId ?? null,
        textAnswer: ans?.textAnswer ?? null,
        teacherFeedback: ans?.teacherFeedback ?? null,
        gradingStatus: ans?.gradingStatus ?? (isDescriptive ? "ungraded" : "auto_graded"),
        correctOptionId: q.correctOptionId ?? undefined,
        explanation: q.explanation,
        isCorrect: ans?.isCorrect ?? (isDescriptive ? null : false),
        pointsEarned: ans?.pointsEarned ?? (isDescriptive ? null : 0),
        maxPoints: q.points,
      };
    });

    return {
      id: attempt.id,
      examId: attempt.examId,
      status: attempt.status,
      gradingStatus: attempt.gradingStatus ?? "fully_graded",
      submittedAt: attempt.submittedAt ?? null,
      resultsReleased: true,
      state: "ready",
      score: attempt.score,
      maxScore: attempt.maxScore,
      percentage: attempt.percentage,
      passed: attempt.passed,
      questions,
    };
  }
}
