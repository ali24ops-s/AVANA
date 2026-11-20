import React, { useState, useMemo, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import {
  CheckCircle2,
  Calendar,
  Clock,
  AlertCircle,
  ExternalLink,
  Lock,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import { usePublicPoll, useSubmitVoteMutation } from "../../hooks/usePublicPoll.js";
import { PollQuestionCard } from "../../components/poll/PollQuestionCard.js";
import { PollResultsSummary } from "../../components/poll/PollResultsSummary.js";
import { PollSEO } from "../../components/poll/PollSEO.js";
import type {
  SubmitPollVoteAnswerInput,
  PollResults,
} from "../../lib/api/polls-api.js";
import {
  Button,
  LoadingState,
  Alert,
  Progress,
} from "../../components/ui/index.js";
import { toPersianDigits } from "@avana/domain";

export function PublicPollPage() {
  const { slug } = useParams<{ slug: string }>();

  // Fetch public poll data
  const { data: poll, isLoading, isError, error, refetch } = usePublicPoll(slug);

  // Submit vote mutation
  const submitVoteMutation = useSubmitVoteMutation(slug || "");

  // Form answer state: questionId -> optionId (string) | optionIds (string[]) | text (string)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [submissionResults, setSubmissionResults] = useState<PollResults | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, boolean>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const questions = useMemo(() => {
    const list = [...(poll?.questions || [])];
    return list.sort((a, b) => a.sortOrder - b.sortOrder);
  }, [poll?.questions]);

  // Answer progress
  const answeredCount = useMemo(() => {
    return questions.filter((q) => {
      const val = answers[q.id];
      if (val === undefined || val === null || val === "") return false;
      if (Array.isArray(val) && val.length === 0) return false;
      return true;
    }).length;
  }, [questions, answers]);

  const progressPercentage = questions.length > 0
    ? Math.round((answeredCount / questions.length) * 100)
    : 0;

  // Handle Answer Change
  const handleAnswerChange = (questionId: string, val: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [questionId]: val }));
    if (validationErrors[questionId]) {
      setValidationErrors((prev) => ({ ...prev, [questionId]: false }));
    }
  };

  // Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validate answers
    const errors: Record<string, boolean> = {};
    let hasError = false;

    for (const q of questions) {
      const val = answers[q.id];
      const isAnswered =
        val !== undefined &&
        val !== null &&
        val !== "" &&
        (!Array.isArray(val) || val.length > 0);

      // Check required
      if (q.isRequired && !isAnswered) {
        errors[q.id] = true;
        hasError = true;
      }

      // Check multiple choice min/max if answered
      if (isAnswered && q.questionType === "multiple_choice" && Array.isArray(val)) {
        if (q.minChoices && val.length < q.minChoices) {
          errors[q.id] = true;
          hasError = true;
        }
        if (q.maxChoices && val.length > q.maxChoices) {
          errors[q.id] = true;
          hasError = true;
        }
      }
    }

    if (hasError) {
      setValidationErrors(errors);
      setFormError("لطفاً به سؤالات اجباری مشخص‌شده پاسخ دهید.");
      // Scroll to first error safely
      const firstErrorElement = document.querySelector(".border-red-400");
      if (firstErrorElement && typeof firstErrorElement.scrollIntoView === "function") {
        try {
          firstErrorElement.scrollIntoView({ behavior: "smooth", block: "center" });
        } catch {
          // ignore in jsdom / test environments
        }
      }
      return;
    }

    // Format answers payload
    const formattedAnswers: Record<string, SubmitPollVoteAnswerInput> = {};
    for (const [qId, val] of Object.entries(answers)) {
      const q = questions.find((item) => item.id === qId);
      if (!q) continue;

      if (q.questionType === "single_choice") {
        if (typeof val === "string" && val.trim()) {
          formattedAnswers[qId] = { questionId: qId, selectedOptionId: val.trim() };
        }
      } else if (q.questionType === "multiple_choice") {
        if (Array.isArray(val) && val.length > 0) {
          formattedAnswers[qId] = { questionId: qId, selectedOptionIds: val };
        }
      } else if (q.questionType === "short_text") {
        if (typeof val === "string" && val.trim()) {
          formattedAnswers[qId] = { questionId: qId, textAnswer: val.trim() };
        }
      }
    }

    try {
      const res = await submitVoteMutation.mutateAsync({ answers: formattedAnswers });
      setSubmittedSuccess(true);
      if (res.results) {
        setSubmissionResults(res.results);
      }
      // Scroll to top safely
      if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
        try {
          window.scrollTo({ top: 0, behavior: "smooth" });
        } catch {
          // ignore in environments without scrollTo
        }
      }
    } catch (err: unknown) {
      setFormError(
        err instanceof Error
          ? err.message
          : "خطا در ثبت رأی. لطفاً اتصال اینترنت خود را بررسی کرده و مجدداً تلاش کنید.",
      );
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F7F9FA] flex items-center justify-center p-4 font-sans" dir="rtl">
        <LoadingState message="در حال بارگذاری نظرسنجی..." />
      </div>
    );
  }

  if (isError || !poll) {
    return (
      <div className="min-h-screen bg-[#F7F9FA] flex items-center justify-center p-4 font-sans" dir="rtl">
        <div className="max-w-md w-full p-8 rounded-2xl bg-white border border-[#E2E7EA] shadow-xs text-center space-y-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[#1a2226]">
            نظرسنجی در دسترس نیست
          </h2>
          <p className="text-xs text-[#5B6268] leading-relaxed">
            این نظرسنجی ممکن است حذف شده باشد یا آدرس وارد شده نادرست باشد.
          </p>
          <a href="https://aavana.ir" className="inline-block pt-2">
            <Button variant="outline" size="sm">
              بازگشت به صفحه اصلی آوانا
            </Button>
          </a>
        </div>
      </div>
    );
  }

  // Check Schedule / Status
  const now = new Date();
  const isDraft = poll.status === "draft";
  const isClosed = poll.status === "closed";
  const isNotStarted = poll.startsAt ? new Date(poll.startsAt) > now : false;
  const isExpired = poll.endsAt ? new Date(poll.endsAt) < now : false;
  const isUnavailable = isDraft || isClosed || isNotStarted || isExpired;
  const alreadyVoted = poll.userVoted === true || submittedSuccess;

  return (
    <div className="min-h-screen bg-[#F7F9FA] text-[#1a2226] flex flex-col font-sans" dir="rtl">
      {/* Dynamic SEO Meta */}
      <PollSEO
        title={poll.title}
        description={poll.description}
        coverImageUrl={poll.coverImageUrl}
      />

      {/* Minimal Top Brand Bar */}
      <header className="h-14 bg-white/90 backdrop-blur-xs border-b border-[#E2E7EA] sticky top-0 z-30 flex items-center justify-between px-4 sm:px-8">
        <a href="https://aavana.ir" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#008080] text-white flex items-center justify-center font-bold text-sm shadow-xs">
            A
          </div>
          <span className="font-bold text-sm text-[#1a2226]">آوانا</span>
        </a>

        <div className="flex items-center gap-1.5 text-xs text-[#5B6268]">
          <Lock className="w-3.5 h-3.5 text-[#008080]" />
          <span className="hidden sm:inline">نظرسنجی امن و محرمانه</span>
        </div>
      </header>

      {/* Main Form Container */}
      <main className="flex-1 max-w-2xl w-full mx-auto px-4 py-6 sm:py-10 space-y-6">
        {/* Header Hero Card */}
        <div className="bg-white rounded-2xl border border-[#E2E7EA] shadow-xs overflow-hidden">
          {poll.coverImageUrl && (
            <div className="w-full h-44 sm:h-56 bg-slate-100 border-b border-[#E2E7EA] overflow-hidden">
              <img
                src={poll.coverImageUrl}
                alt={poll.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="p-6 sm:p-8 space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#008080]" />
              <span className="text-xs font-bold text-[#008080]">نظرسنجی آنلاین</span>
            </div>

            <h1 className="text-lg sm:text-2xl font-bold text-[#1a2226] leading-snug">
              {poll.title}
            </h1>

            {poll.description && (
              <p className="text-xs sm:text-sm text-[#5B6268] leading-relaxed whitespace-pre-line pt-1">
                {poll.description}
              </p>
            )}

            {/* Anonymous Guarantee Pill */}
            <div className="pt-2 flex items-center gap-2 text-[11px] text-[#5B6268]">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F7F9FA] border border-[#E2E7EA]">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#3d8f6e]" />
                پاسخ‌ها به‌صورت ناشناس و بدون نیاز به ثبت‌نام دریافت می‌شوند
              </span>
            </div>
          </div>
        </div>

        {/* Unavailable Status Message */}
        {isUnavailable && !alreadyVoted && (
          <div className="p-8 rounded-2xl bg-white border border-[#E2E7EA] text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
              <Clock className="w-6 h-6" />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-[#1a2226]">
              {isDraft
                ? "این نظرسنجی هنوز منتشر نشده است"
                : isNotStarted
                  ? "این نظرسنجی هنوز آغاز نشده است"
                  : "مهلت شرکت در این نظرسنجی به پایان رسیده است"}
            </h3>
            <p className="text-xs text-[#5B6268] max-w-sm mx-auto leading-relaxed">
              {isNotStarted && poll.startsAt
                ? `زمان آغاز نظرسنجی: ${new Date(poll.startsAt).toLocaleDateString("fa-IR")}`
                : "امکان ثبت رأی در حال حاضر برای این پرسشنامه فعال نیست."}
            </p>
          </div>
        )}

        {/* Already Voted / Submission Success State */}
        {alreadyVoted && (
          <div className="p-6 sm:p-8 rounded-2xl bg-white border border-[#E2E7EA] text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 rounded-full bg-[#e4f4ec] text-[#2a624b] flex items-center justify-center mx-auto shadow-2xs">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <div className="space-y-1.5">
              <h2 className="text-base sm:text-lg font-bold text-[#1a2226]">
                {submittedSuccess
                  ? "پاسخ‌های شما با موفقیت ثبت شد!"
                  : "شما قبلاً در این نظرسنجی شرکت کرده‌اید."}
              </h2>
              <p className="text-xs text-[#5B6268] max-w-md mx-auto leading-relaxed">
                از زمان و همکاری ارزشمند شما برای تکمیل این پرسشنامه صمیمانه متشکریم.
              </p>
            </div>

            {/* CTA Banner if configured */}
            {poll.settings?.ctaTitle && (
              <div className="p-5 rounded-2xl bg-[#e0f2f2]/50 border border-[#b3d9d9] text-center space-y-3 mt-4">
                <div className="flex items-center justify-center gap-1.5 text-[#006666]">
                  <Sparkles className="w-4 h-4" />
                  <h4 className="text-xs sm:text-sm font-bold">
                    {poll.settings.ctaTitle}
                  </h4>
                </div>

                {poll.settings.ctaUrl && (
                  <a
                    href={poll.settings.ctaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block"
                  >
                    <Button
                      variant="primary"
                      size="sm"
                      className="cursor-pointer"
                      rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
                    >
                      {poll.settings.ctaButtonText || "مشاهده و ادامه"}
                    </Button>
                  </a>
                )}
              </div>
            )}

            {/* Show Results if enabled */}
            {poll.settings?.showResultsAfterVote && submissionResults && (
              <PollResultsSummary results={submissionResults} />
            )}
          </div>
        )}

        {/* Taking Form */}
        {!isUnavailable && !alreadyVoted && (
          <form onSubmit={handleSubmit} className="space-y-6">
            {formError && (
              <Alert variant="error" onClose={() => setFormError(null)}>
                {formError}
              </Alert>
            )}

            {/* Progress Bar Sticky / Inline */}
            <div className="bg-white p-3.5 rounded-xl border border-[#E2E7EA] shadow-2xs space-y-1.5">
              <div className="flex items-center justify-between text-xs text-[#5B6268]">
                <span className="font-medium">
                  {toPersianDigits(answeredCount)} از {toPersianDigits(questions.length)} سؤال پاسخ داده شده
                </span>
                <span className="font-bold text-[#008080]">
                  {toPersianDigits(progressPercentage)}٪
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-[#e0f2f2] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#008080] transition-all duration-300"
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-4">
              {questions.map((question, qIdx) => (
                <PollQuestionCard
                  key={question.id}
                  question={question}
                  index={qIdx}
                  value={answers[question.id]}
                  onChange={(val) => handleAnswerChange(question.id, val)}
                  showError={Boolean(validationErrors[question.id])}
                />
              ))}
            </div>

            {/* Submit Bar */}
            <div className="pt-4">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                disabled={submitVoteMutation.isPending}
                className="w-full py-3.5 text-sm sm:text-base font-bold shadow-sm cursor-pointer"
              >
                {submitVoteMutation.isPending
                  ? "در حال ثبت پاسخ‌ها..."
                  : "ثبت نهایی و ارسال پاسخ‌ها"}
              </Button>
              <p className="text-center text-[11px] text-[#5B6268] mt-2">
                با فشردن دکمه فوق، پاسخ‌های شما در سرور ثبت خواهند شد.
              </p>
            </div>
          </form>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-xs text-[#5B6268] border-t border-[#E2E7EA] bg-white">
        <span>قدرت گرفته از سامانه نظرسنجی و هوشمند </span>
        <a href="https://aavana.ir" className="font-bold text-[#008080] hover:underline">
          آوانا (AVANA)
        </a>
      </footer>
    </div>
  );
}
