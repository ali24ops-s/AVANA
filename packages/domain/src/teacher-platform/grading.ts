import type {
  ExamSnapshotQuestion,
  StudentSanitizedQuestion,
  StudentTrueFalseStatement,
  QuestionGradingStatus,
  AttemptGradingStatus,
} from "./types.js";

export interface QuestionGradingDetail {
  questionId: string;
  selectedOptionId: string | null;
  textAnswer?: string | null;
  teacherFeedback?: string | null;
  gradingStatus: QuestionGradingStatus;
  isCorrect: boolean | null;
  pointsEarned: number | null;
  maxPoints: number;
}

export interface GradeAttemptResult {
  perQuestion: QuestionGradingDetail[];
  totalScore: number;
  autoScore: number;
  manualScore: number;
  maxScore: number;
  percentage: number | null;
  passed: boolean | null;
  gradingStatus: AttemptGradingStatus;
  hasPendingGrading: boolean;
}

export interface GradeAttemptAnswerInput {
  questionId: string;
  selectedOptionId?: string | null;
  textAnswer?: string | null;
  teacherFeedback?: string | null;
  gradingStatus?: QuestionGradingStatus;
  pointsEarned?: number | null;
  isCorrect?: boolean | null;
}

/**
 * Pure, database-independent grading function.
 * Evaluates student answers strictly against the immutable ExamSnapshotQuestion array.
 * Supports single_choice, true_false (multi-statement), and descriptive (teacher manual grading).
 */
export function gradeAttempt(
  snapshot: ExamSnapshotQuestion[],
  answers: GradeAttemptAnswerInput[],
  passingScorePercentage?: number | null,
): GradeAttemptResult {
  const answerMap = new Map<string, GradeAttemptAnswerInput>();
  for (const ans of answers) {
    answerMap.set(ans.questionId, ans);
  }

  const perQuestion: QuestionGradingDetail[] = [];
  let totalScore = 0;
  let autoScore = 0;
  let manualScore = 0;
  let maxScore = 0;
  let hasPendingGrading = false;

  for (const question of snapshot) {
    const qPoints = Math.round((Number(question.points) || 0) * 100) / 100;
    maxScore = Math.round((maxScore + qPoints) * 100) / 100;

    const qType = question.questionType ?? "single_choice";
    const ans = answerMap.get(question.id);

    if (qType === "descriptive") {
      const textAnswer = ans?.textAnswer ?? null;
      const teacherFeedback = ans?.teacherFeedback ?? null;

      if (ans?.gradingStatus === "graded" && typeof ans?.pointsEarned === "number") {
        // Teacher has graded this descriptive question
        const rawPts = Math.min(Math.max(0, ans.pointsEarned), qPoints);
        const pts = Math.round(rawPts * 100) / 100;
        const isCorrect = pts > 0;
        manualScore = Math.round((manualScore + pts) * 100) / 100;
        totalScore = Math.round((totalScore + pts) * 100) / 100;

        perQuestion.push({
          questionId: question.id,
          selectedOptionId: null,
          textAnswer,
          teacherFeedback,
          gradingStatus: "graded",
          isCorrect,
          pointsEarned: pts,
          maxPoints: qPoints,
        });
      } else {
        // Descriptive question is ungraded / pending teacher review
        hasPendingGrading = true;
        perQuestion.push({
          questionId: question.id,
          selectedOptionId: null,
          textAnswer,
          teacherFeedback,
          gradingStatus: "ungraded",
          isCorrect: null,
          pointsEarned: null,
          maxPoints: qPoints,
        });
      }
    } else if (qType === "true_false") {
      // true_false question: auto-graded multi-statement
      const statements = question.statements ?? [];
      let earnedScore = 0;
      let isFullyCorrect = false;

      let studentAnswers: Record<string, boolean> = {};
      if (ans?.textAnswer) {
        try {
          const parsed = JSON.parse(ans.textAnswer);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            studentAnswers = parsed;
          }
        } catch {
          // not json
        }
      }

      if (statements.length > 0) {
        let correctCount = 0;
        for (const stmt of statements) {
          if (
            typeof studentAnswers[stmt.id] === "boolean" &&
            studentAnswers[stmt.id] === stmt.correctAnswer
          ) {
            correctCount++;
          }
        }
        if (correctCount === statements.length) {
          earnedScore = qPoints;
          isFullyCorrect = true;
        } else if (correctCount === 0) {
          earnedScore = 0;
          isFullyCorrect = false;
        } else {
          earnedScore = Math.round(((qPoints * correctCount) / statements.length) * 100) / 100;
          isFullyCorrect = false;
        }
      }

      autoScore = Math.round((autoScore + earnedScore) * 100) / 100;
      totalScore = Math.round((totalScore + earnedScore) * 100) / 100;

      perQuestion.push({
        questionId: question.id,
        selectedOptionId: null,
        textAnswer: ans?.textAnswer ?? null,
        teacherFeedback: null,
        gradingStatus: "auto_graded",
        isCorrect: isFullyCorrect,
        pointsEarned: earnedScore,
        maxPoints: qPoints,
      });
    } else {
      // single_choice question: auto-graded
      const selectedOptionId = ans?.selectedOptionId ?? null;
      const isCorrect =
        Boolean(selectedOptionId) &&
        Boolean(question.correctOptionId) &&
        selectedOptionId === question.correctOptionId;

      const pointsEarned = isCorrect ? qPoints : 0;
      autoScore = Math.round((autoScore + pointsEarned) * 100) / 100;
      totalScore = Math.round((totalScore + pointsEarned) * 100) / 100;

      perQuestion.push({
        questionId: question.id,
        selectedOptionId,
        textAnswer: null,
        teacherFeedback: null,
        gradingStatus: "auto_graded",
        isCorrect,
        pointsEarned,
        maxPoints: qPoints,
      });
    }
  }

  const gradingStatus: AttemptGradingStatus = hasPendingGrading
    ? "needs_manual_review"
    : "fully_graded";

  // Final deterministic rounding on totals
  totalScore = Math.round(totalScore * 100) / 100;
  autoScore = Math.round(autoScore * 100) / 100;
  manualScore = Math.round(manualScore * 100) / 100;
  maxScore = Math.round(maxScore * 100) / 100;

  // If there are pending descriptive questions, percentage and passed are not finalized
  let percentage: number | null = null;
  let passed: boolean | null = null;

  if (!hasPendingGrading) {
    percentage =
      maxScore > 0 ? Math.round((totalScore / maxScore) * 10000) / 100 : 0;
    passed =
      passingScorePercentage !== null && passingScorePercentage !== undefined
        ? percentage >= passingScorePercentage
        : null;
  }

  return {
    perQuestion,
    totalScore,
    autoScore,
    manualScore,
    maxScore,
    percentage,
    passed,
    gradingStatus,
    hasPendingGrading,
  };
}

/**
 * Strips sensitive answer keys (correctOptionId, explanation, statement correctAnswers) from questions
 * before exposing them to the student during exam execution.
 */
export function sanitizeQuestionsForStudent(
  snapshot: ExamSnapshotQuestion[],
): StudentSanitizedQuestion[] {
  return snapshot.map(({ correctOptionId: _c, explanation: _e, statements, ...publicFields }) => {
    let sanitizedStatements: StudentTrueFalseStatement[] | undefined = undefined;
    if (statements && Array.isArray(statements)) {
      sanitizedStatements = statements.map(({ correctAnswer: _ca, ...stmtPublic }) => ({
        ...stmtPublic,
      }));
    }
    return {
      ...publicFields,
      options: publicFields.options ? [...publicFields.options] : [],
      statements: sanitizedStatements,
    };
  });
}
