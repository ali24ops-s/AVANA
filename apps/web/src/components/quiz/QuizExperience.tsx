import { useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Clock,
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  Award,
  Loader2,
  AlertCircle,
  Lightbulb,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
import type {
  QuizQuestionResource,
  QuizAttemptResult,
} from "@avana/contracts";

export interface QuizExperienceProps {
  organizationId: string;
  courseId: string;
  quizId: string;
  onBack?: () => void;
}

export function QuizExperience({
  organizationId,
  courseId,
  quizId,
  onBack,
}: QuizExperienceProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [attemptResult, setAttemptResult] = useState<QuizAttemptResult | null>(null);

  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const studyApi = createStudyApi(apiClient);

  const quizQuery = useQuery({
    queryKey: ["quiz-detail", organizationId, courseId, quizId],
    queryFn: () => studyApi.getQuiz(organizationId, courseId, quizId),
  });

  const submitMutation = useMutation({
    mutationFn: async (formattedAnswers: Array<{ questionId: string; answer: unknown }>) => {
      const res = await studyApi.submitQuizAttempt(organizationId, courseId, quizId, {
        answers: formattedAnswers,
      });
      return res.attempt;
    },
    onSuccess: (result) => {
      setAttemptResult(result);
      void queryClient.invalidateQueries({
        queryKey: ["quizzes", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["study-analytics", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["study-recommendations", organizationId, courseId],
      });
    },
  });

  if (quizQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#008080]" />
      </div>
    );
  }

  if (quizQuery.isError || !quizQuery.data) {
    return (
      <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
        <h3 className="text-base font-bold text-[var(--color-text)]">
          خطا در بارگذاری آزمون
        </h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          {quizQuery.error?.message || "آزمون مورد نظر یافت نشد."}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => void quizQuery.refetch()}
            className="px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-bold transition-colors"
          >
            تلاش مجدد
          </button>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-4 py-2 bg-[var(--color-surface-warm)] hover:bg-[var(--color-border)] text-[var(--color-text)] border border-[var(--color-border)] rounded-xl text-xs font-bold transition-colors"
            >
              بازگشت به آزمون‌ها
            </button>
          )}
        </div>
      </div>
    );
  }

  const questions: QuizQuestionResource[] = quizQuery.data?.quiz?.questions || [];
  const currentQuestion = questions[currentQuestionIndex];

  const handleSelectAnswer = (questionId: string, answerVal: unknown) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answerVal }));
  };

  const handleSubmit = () => {
    const formatted = questions.map((q) => ({
      questionId: q.id,
      answer: answers[q.id] ?? null,
    }));
    submitMutation.mutate(formatted);
  };

  // Scored results view
  if (attemptResult) {
    const scorePct = Math.round(attemptResult.score);
    const isPassing = scorePct >= 70;

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-8 text-center space-y-6 shadow-sm">
          <div
            className={`w-16 h-16 rounded-3xl flex items-center justify-center mx-auto text-white shadow-md ${
              isPassing
                ? "bg-green-600"
                : "bg-amber-600"
            }`}
          >
            <Award className="w-8 h-8" />
          </div>

          <div>
            <h2 className="text-2xl font-extrabold text-[var(--color-text)]">
              {isPassing ? "آزمون با موفقیت گذرانده شد!" : "آزمون به پایان رسید"}
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
              شما به {attemptResult.correct} سوال از مجموع {attemptResult.total} سوال پاسخ صحیح دادید.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
            <span className="text-3xl font-black text-[#008080]" dir="ltr">
              {scorePct}%
            </span>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setAttemptResult(null);
                setAnswers({});
                setCurrentQuestionIndex(0);
              }}
              className="px-4 py-2.5 bg-[var(--color-surface-warm)] hover:bg-[var(--color-border)] text-[var(--color-text)] rounded-xl text-xs font-bold border border-[var(--color-border)] flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>شرکت مجدد در آزمون</span>
            </button>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="px-4 py-2.5 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-bold"
              >
                بازگشت به آزمون‌ها
              </button>
            )}
          </div>
        </div>

        {/* Per-question breakdown */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text)]">
            مرور سوالات و پاسخ‌ها
          </h3>
          {questions.map((q, idx) => {
            const userAns = attemptResult.answers?.[q.id];
            return (
              <div
                key={q.id}
                className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-6 space-y-3 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-bold text-[#008080]">
                    سوال {idx + 1}
                  </span>
                </div>
                <p className="text-sm font-bold text-[var(--color-text)] leading-relaxed">
                  {q.question}
                </p>

                {q.choices && (
                  <div className="space-y-2 pt-1">
                    {q.choices.map((choice, cIdx) => {
                      const isSelected =
                        userAns === choice || userAns === cIdx || String(userAns) === String(choice);
                      return (
                        <div
                          key={cIdx}
                          className={`p-3.5 rounded-xl text-xs border ${
                            isSelected
                              ? "bg-[#a7d0e6]/25 border-[#008080] text-[#008080] font-bold"
                              : "border-[var(--color-border)] bg-[var(--color-surface-warm)] text-[var(--color-text-muted)]"
                          }`}
                        >
                          <span className="font-bold ml-2">
                            {cIdx + 1}.
                          </span>
                          {choice}
                        </div>
                      );
                    })}
                  </div>
                )}

                {q.explanation && (
                  <div className="p-3.5 bg-amber-50/60 dark:bg-amber-950/20 rounded-xl border border-amber-200/70 dark:border-amber-900/40 text-xs text-[var(--color-text-muted)] mt-2">
                    <p className="font-bold text-amber-800 dark:text-amber-400 mb-1 flex items-center gap-1">
                      <Lightbulb className="w-3.5 h-3.5" />
                      <span>توضیح پاسخ:</span>
                    </p>
                    <p className="text-[var(--color-text)] leading-relaxed">{q.explanation}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Quiz Taking Mode
  if (questions.length === 0) {
    return (
      <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center space-y-4 max-w-md mx-auto">
        <HelpCircle className="w-10 h-10 text-[var(--color-text-muted)] mx-auto" />
        <h3 className="text-base font-bold text-[var(--color-text)]">
          سوالی برای این آزمون یافت نشد
        </h3>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2 bg-[#008080] text-white rounded-xl text-xs font-bold"
          >
            بازگشت به آزمون‌ها
          </button>
        )}
      </div>
    );
  }

  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const progressPercent = Math.round(((currentQuestionIndex + 1) / questions.length) * 100);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>خروج از آزمون</span>
          </button>
        )}
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] font-semibold">
          <Clock className="w-4 h-4 text-[#008080]" />
          <span>
            سوال {currentQuestionIndex + 1} از {questions.length}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <div
        role="progressbar"
        aria-label="پیشرفت آزمون"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="w-full h-2 bg-[var(--color-surface-warm)] rounded-full overflow-hidden border border-[var(--color-border)]"
      >
        <div
          className="h-full bg-[#008080] transition-all duration-300 rounded-full"
          style={{
            width: `${progressPercent}%`,
          }}
        />
      </div>

      {/* Current Question Card */}
      {currentQuestion && (
        <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-6 sm:p-8 shadow-sm space-y-6">
          <div>
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-md bg-[#008080]/10 text-[#008080]">
              {currentQuestion.question_type === "multiple_choice" ? "چهارگزینه‌ای" : "پرسش آزمون"}
            </span>
            <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)] mt-3 leading-relaxed">
              {currentQuestion.question}
            </h3>
          </div>

          {submitMutation.isError && (
            <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900/40 text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 justify-center">
              <AlertCircle className="w-4 h-4" />
              <span>خطا در ثبت نتیجه آزمون. لطفاً دوباره تلاش کنید.</span>
            </div>
          )}

          {/* Choices list */}
          {currentQuestion.choices && (
            <div className="space-y-2.5">
              {currentQuestion.choices.map((choice, idx) => {
                const isSelected = currentAnswer === choice || currentAnswer === idx;
                return (
                  <button
                    key={idx}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => handleSelectAnswer(currentQuestion.id, choice)}
                    disabled={submitMutation.isPending}
                    className={`w-full text-right p-4 rounded-2xl border transition-all flex items-center gap-3 focus:outline-none focus:ring-2 focus:ring-[#008080] ${
                      isSelected
                        ? "border-[#008080] bg-[#008080]/10 text-[#008080] font-bold shadow-sm"
                        : "border-[var(--color-border)] hover:border-[#008080] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)]"
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        isSelected
                          ? "bg-[#008080] text-white"
                          : "bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <span className="text-xs sm:text-sm font-medium">{choice}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentQuestionIndex === 0 || submitMutation.isPending}
              className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] disabled:opacity-40 disabled:pointer-events-none"
            >
              سوال قبلی
            </button>

            {isLastQuestion ? (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
                className="px-5 py-2.5 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                {submitMutation.isPending ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>در حال ثبت...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>ثبت و پایان آزمون</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                disabled={submitMutation.isPending}
                className="px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-bold flex items-center gap-1.5"
              >
                <span>سوال بعدی</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
