import { useState } from "react";
import {
  ArrowRight,
  ArrowLeft,
  Clock,
  CheckCircle2,
  HelpCircle,
  RotateCcw,
  Award,
  AlertCircle,
  Lightbulb,
  Sparkles,
  Zap,
} from "lucide-react";
import { Card, Badge, Button, Progress, LoadingState } from "@avana/ui";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
import { useStudySessionTracker } from "../../hooks/useStudySessionTracker.js";
import type {
  QuizQuestionResource,
  QuizAttemptResult,
} from "@avana/contracts";
import { toPersianDigits, formatPersianOf } from "@avana/domain";
import { RichContent } from "../markdown/MarkdownRenderer.js";

export interface QuizExperienceProps {
  organizationId: string;
  courseId: string;
  quizId: string;
  isPreview?: boolean;
  onUnlock?: () => void;
  onBack?: () => void;
}

export function QuizExperience({
  organizationId,
  courseId,
  quizId,
  isPreview = false,
  onUnlock,
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

  // Track active educational study time for quiz taking
  useStudySessionTracker({
    activityType: "exam",
    courseId,
    enabled: Boolean(quizQuery.data?.quiz) && !attemptResult,
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

  const effectiveIsPreview = isPreview || (quizQuery.data?.quiz as any)?.is_preview === true;

  if (quizQuery.isLoading) {
    return (
      <div className="py-16">
        <LoadingState message="در حال بارگذاری سوالات آزمون..." />
      </div>
    );
  }

  if (quizQuery.isError || !quizQuery.data) {
    return (
      <Card className="p-8 sm:p-12 text-center space-y-4 max-w-md mx-auto">
        <AlertCircle className="w-10 h-10 text-[#b84c4c] mx-auto" />
        <h3 className="text-base font-bold text-[var(--color-text)]">
          خطا در بارگذاری آزمون
        </h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          {quizQuery.error?.message || "آزمون مورد نظر یافت نشد."}
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            type="button"
            onClick={() => void quizQuery.refetch()}
            variant="primary"
            size="sm"
          >
            تلاش مجدد
          </Button>
          {onBack && (
            <Button
              type="button"
              onClick={onBack}
              variant="outline"
              size="sm"
            >
              بازگشت به آزمون‌ها
            </Button>
          )}
        </div>
      </Card>
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
        <Card className="p-6 sm:p-8 text-center space-y-6">
          <div
            className={`w-16 h-16 rounded-[16px] flex items-center justify-center mx-auto text-white shadow-sm ${
              isPassing
                ? "bg-[#3d8f6e]"
                : "bg-[#c2853f]"
            }`}
          >
            <Award className="w-8 h-8" />
          </div>

          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-[var(--color-text)]">
              {isPassing ? "آزمون با موفقیت گذرانده شد!" : "آزمون به پایان رسید"}
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-1.5">
              شما به {toPersianDigits(attemptResult.correct)} سوال از مجموع {toPersianDigits(attemptResult.total)} سوال پاسخ صحیح دادید.
            </p>
          </div>

          <div className="inline-flex items-center gap-2 px-6 py-3 rounded-[16px] bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
            <span className="text-3xl font-black text-[#008080]" dir="ltr">
              {scorePct}%
            </span>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              type="button"
              onClick={() => {
                setAttemptResult(null);
                setAnswers({});
                setCurrentQuestionIndex(0);
              }}
              variant="outline"
              size="md"
              leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            >
              <span>شرکت مجدد در آزمون</span>
            </Button>
            {onBack && (
              <Button
                type="button"
                onClick={onBack}
                variant="primary"
                size="md"
              >
                بازگشت به آزمون‌ها
              </Button>
            )}
          </div>
        </Card>

        {effectiveIsPreview && (
          <div className="p-6 rounded-2xl bg-gradient-to-br from-teal-500/15 via-indigo-500/10 to-purple-500/15 border border-teal-500/30 text-center space-y-3.5 shadow-sm">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-400/20 text-teal-600 dark:text-teal-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>پایان پیش‌نمایش آزمون</span>
            </div>
            <h4 className="font-bold text-base text-[var(--color-text)]">
              عملکرد شما در پیش‌نمایش ثبت شد!
            </h4>
            <p className="text-xs text-[var(--color-text-secondary)] max-w-md mx-auto leading-relaxed">
              برای دسترسی به بانک کامل سوالات آزمون این دوره، آزمون‌های شبیه‌ساز پایان ترم، تحلیل تشریحی و ثبت رسمی کارنامه تحصیلی، دوره را تهیه فرمایید.
            </p>
            {onUnlock && (
              <div className="pt-1 flex items-center justify-center gap-3">
                <Button
                  variant="primary"
                  size="md"
                  onClick={onUnlock}
                  leftIcon={<Zap className="w-4 h-4 fill-current text-amber-300" />}
                >
                  مشاهده گزینه‌های خرید و ثبت‌نام
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Per-question breakdown */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-[var(--color-text)]">
            مرور سوالات و پاسخ‌ها
          </h3>
          {(((attemptResult as { questions?: QuizQuestionResource[] })?.questions &&
            (attemptResult as { questions?: QuizQuestionResource[] }).questions!.length > 0)
            ? (attemptResult as { questions?: QuizQuestionResource[] }).questions!
            : questions
          ).map((q, idx) => {
            const userAns = attemptResult.answers?.[q.id];
            const evalResult = (attemptResult as { questionResults?: Record<string, { status: string; correctValues?: string[] }> })
              .questionResults?.[q.id];
            const qStatus = evalResult?.status || (userAns === undefined || userAns === null ? "unanswered" : undefined);

            const submittedQ = (attemptResult as { questions?: Array<{ id: string; correctAnswer?: unknown; correct_answer?: unknown; explanation?: string | null }> })
              .questions?.find((sq) => sq.id === q.id);
            const rawCorrect = q.correct_answer ?? submittedQ?.correctAnswer ?? submittedQ?.correct_answer;
            const explanation = q.explanation || submittedQ?.explanation;

            return (
              <Card
                key={q.id}
                className="p-5 sm:p-6 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="primary" size="sm">
                    سوال {toPersianDigits(idx + 1)}
                  </Badge>
                  {qStatus === "correct" && (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>صحیح</span>
                    </span>
                  )}
                  {qStatus === "incorrect" && (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>نادرست</span>
                    </span>
                  )}
                  {qStatus === "unanswered" && (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20">
                      بدون پاسخ
                    </span>
                  )}
                  {qStatus === "partial" && (
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      پاسخ ناقص
                    </span>
                  )}
                </div>

                <div className="text-sm font-bold text-[var(--color-text)] leading-relaxed">
                  <RichContent content={q.question} />
                </div>

                {q.choices && (
                  <div className="space-y-2 pt-1">
                    {q.choices.map((choice, cIdx) => {
                      const isSelected =
                        userAns === choice ||
                        userAns === cIdx ||
                        String(userAns) === String(choice) ||
                        (Array.isArray(userAns) && (userAns.includes(choice) || userAns.includes(cIdx)));

                      const isCorrectChoice =
                        evalResult?.correctValues?.includes(String(choice)) ||
                        evalResult?.correctValues?.includes(String(cIdx)) ||
                        rawCorrect === choice ||
                        rawCorrect === cIdx ||
                        String(rawCorrect) === String(choice);

                      let containerClass =
                        "border-[var(--color-border)] bg-[var(--color-surface-warm)] text-[var(--color-text-muted)]";
                      let badge = null;

                      if (isSelected && isCorrectChoice) {
                        containerClass =
                          "border-emerald-500 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 font-medium";
                        badge = (
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 ms-auto shrink-0 bg-emerald-500/20 px-2 py-0.5 rounded">
                            پاسخ صحیح شما
                          </span>
                        );
                      } else if (isSelected && !isCorrectChoice) {
                        containerClass =
                          "border-red-500 bg-red-500/10 text-red-800 dark:text-red-200 font-medium";
                        badge = (
                          <span className="text-[11px] font-bold text-red-600 dark:text-red-400 ms-auto shrink-0 bg-red-500/20 px-2 py-0.5 rounded">
                            پاسخ شما (نادرست)
                          </span>
                        );
                      } else if (!isSelected && isCorrectChoice) {
                        containerClass =
                          "border-emerald-500/60 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300 font-medium";
                        badge = (
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 ms-auto shrink-0 bg-emerald-500/10 px-2 py-0.5 rounded">
                            پاسخ صحیح
                          </span>
                        );
                      }

                      return (
                        <div
                          key={cIdx}
                          className={`p-3.5 rounded-[10px] text-xs border transition-colors flex items-center justify-between gap-3 ${containerClass}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold shrink-0">
                              {cIdx + 1}.
                            </span>
                            <RichContent content={choice} inline />
                          </div>
                          {badge}
                        </div>
                      );
                    })}
                  </div>
                )}

                {explanation && (
                  <div className="p-3.5 bg-[#fdf2e4] dark:bg-amber-950/30 rounded-[10px] border border-[#e8c18a] dark:border-amber-800/40 text-xs text-[var(--color-text-muted)] mt-2 space-y-1">
                    <p className="font-bold text-[#8f5e27] dark:text-amber-300 flex items-center gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5" />
                      <span>توضیح پاسخ:</span>
                    </p>
                    <div className="text-[var(--color-text)] leading-relaxed">
                      <RichContent content={explanation} />
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    );
  }

  // Quiz Taking Mode
  if (questions.length === 0) {
    return (
      <Card className="p-8 sm:p-12 text-center space-y-4 max-w-md mx-auto">
        <HelpCircle className="w-10 h-10 text-[var(--color-text-muted)] mx-auto" />
        <h3 className="text-base font-bold text-[var(--color-text)]">
          سوالی برای این آزمون یافت نشد
        </h3>
        {onBack && (
          <div className="pt-2">
            <Button
              type="button"
              onClick={onBack}
              variant="primary"
              size="sm"
            >
              بازگشت به آزمون‌ها
            </Button>
          </div>
        )}
      </Card>
    );
  }

  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const progressPercent = Math.round(((currentQuestionIndex + 1) / questions.length) * 100);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {effectiveIsPreview && (
        <div className="p-3.5 bg-teal-500/10 border border-teal-500/30 rounded-xl flex items-center justify-between gap-3 text-xs flex-wrap">
          <div className="flex items-center gap-2 text-teal-600 dark:text-teal-300 font-medium">
            <Sparkles className="w-4 h-4 text-teal-400 shrink-0" />
            <span>آزمون آزمایشی پیش‌نمایش (۵ سوال منتخب)</span>
          </div>
          {onUnlock && (
            <Button variant="primary" size="sm" onClick={onUnlock}>
              خرید و شرکت در آزمون‌های اصلی
            </Button>
          )}
        </div>
      )}

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
            {formatPersianOf(currentQuestionIndex + 1, questions.length, { prefix: "سوال" })}
          </span>
        </div>
      </div>

      {/* Progress bar */}
      <Progress
        value={progressPercent}
        max={100}
        aria-label="پیشرفت آزمون"
        className="w-full"
      />

      {/* Current Question Card */}
      {currentQuestion && (
        <Card className="p-6 sm:p-8 space-y-6">
          <div>
            <Badge variant="primary" size="sm">
              {currentQuestion.question_type === "multiple_choice" ? "چهارگزینه‌ای" : "پرسش آزمون"}
            </Badge>
            <div className="text-base sm:text-lg font-bold text-[var(--color-text)] mt-3 leading-relaxed">
              <RichContent content={currentQuestion.question} />
            </div>
          </div>

          {submitMutation.isError && (
            <div className="p-3 bg-[#fde8e8] rounded-[10px] border border-[#e8a0a0] text-xs text-[#b84c4c] flex items-center gap-1.5 justify-center font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
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
                    className={`w-full text-start p-3.5 sm:p-4 rounded-[10px] min-h-[48px] border transition-all flex items-center gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008080] cursor-pointer disabled:cursor-not-allowed ${
                      isSelected
                        ? "border-[#008080] bg-[#e0f2f2] text-[#006666] font-bold shadow-[var(--shadow-subtle)] ring-2 ring-[#008080]/20"
                        : "border-[var(--color-border)] hover:border-[#008080]/60 hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] bg-[var(--color-surface)]"
                    }`}
                  >
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                        isSelected
                          ? "bg-[#008080] text-white"
                          : "bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)]"
                      }`}
                    >
                      {toPersianDigits(idx + 1)}
                    </span>
                    <span className="text-xs sm:text-sm font-medium leading-relaxed">
                      <RichContent content={choice} inline />
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-[var(--color-border)]">
            <Button
              type="button"
              onClick={() => setCurrentQuestionIndex((prev) => Math.max(0, prev - 1))}
              disabled={currentQuestionIndex === 0 || submitMutation.isPending}
              variant="outline"
              size="sm"
            >
              سوال قبلی
            </Button>

            {isLastQuestion ? (
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={submitMutation.isPending}
                isLoading={submitMutation.isPending}
                variant="primary"
                size="md"
                leftIcon={!submitMutation.isPending ? <CheckCircle2 className="w-3.5 h-3.5" /> : undefined}
              >
                {submitMutation.isPending ? "در حال ثبت..." : "ثبت و پایان آزمون"}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={() => setCurrentQuestionIndex((prev) => Math.min(questions.length - 1, prev + 1))}
                disabled={submitMutation.isPending}
                variant="primary"
                size="md"
                rightIcon={<ArrowLeft className="w-3.5 h-3.5" />}
              >
                سوال بعدی
              </Button>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
