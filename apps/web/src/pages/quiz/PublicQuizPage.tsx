import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import {
  createStudioApi,
  type PublicQuizPayload,
  type PublicAttemptResult,
  type PublicAttemptSolutionsResult,
} from "../../lib/api/studio-api.js";
import { QuizShareModal } from "../../components/quiz/QuizShareModal.js";
import { useAuth } from "../../providers/AuthProvider.js";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Award,
  Share2,
  RotateCcw,
  ExternalLink,
  AlertCircle,
  Eye,
  Check,
  Lock,
  BookOpen,
} from "lucide-react";
import {
  Card,
  Badge,
  Button,
  Progress,
  LoadingState,
} from "../../components/ui/index.js";
import { toPersianDigits } from "@avana/domain";
import { RichContent } from "../../components/markdown/MarkdownRenderer.js";

/**
 * Resolves whether a choice matches the correct answer in various snapshot formats.
 */
function isChoiceCorrect(
  choice: { id: string; text: string },
  correctAnswer: unknown,
  _choices: Array<{ id: string; text: string }> = []
): boolean {
  if (!correctAnswer) return false;
  if (typeof correctAnswer === "object" && correctAnswer !== null) {
    const ca = correctAnswer as Record<string, unknown>;
    if (ca.choiceId !== undefined && ca.choiceId !== null) {
      return String(choice.id) === String(ca.choiceId);
    }
    if (Array.isArray(ca.choiceIds)) {
      return ca.choiceIds.map(String).includes(String(choice.id));
    }
    if (typeof ca.booleanAnswer === "boolean") {
      const positiveWords = ["درست", "صحیح", "true"];
      const negativeWords = ["نادرست", "غلط", "false"];
      const targets = ca.booleanAnswer ? positiveWords : negativeWords;
      return targets.some((w) => choice.text.trim().toLowerCase().includes(w));
    }
  }
  const raw = String(correctAnswer).trim();
  if (String(choice.id) === raw) return true;
  if (choice.text.trim().toLowerCase() === raw.toLowerCase()) return true;
  return false;
}

export const PublicQuizPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const attemptTokenFromUrl = searchParams.get("attempt");
  const isPreview = searchParams.get("preview") === "true";

  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const navigate = useNavigate();

  const api = useMemo(() => {
    const client = createApiClient({ baseUrl: getApiBaseUrl() });
    return createStudioApi(client);
  }, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<PublicQuizPayload | null>(null);

  // Taking state
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<PublicAttemptResult | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Solutions state for authenticated owner
  const [solutions, setSolutions] = useState<PublicAttemptSolutionsResult | null>(null);
  const [solutionsLoading, setSolutionsLoading] = useState(false);
  const [solutionsError, setSolutionsError] = useState<string | null>(null);

  // Designer preview answer key toggle (allowed only if canViewAnswerKey is true)
  const [showAnswerKey, setShowAnswerKey] = useState(false);

  // Idempotency key per take session
  const idempotencyKeyRef = useRef<string>(
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
  );

  const draftStorageKey = slug ? `avana_quiz_draft_${slug}` : null;

  // Helper to persist draft answers during taking
  const persistDraft = (
    updatedAnswers: Record<string, string | string[]>,
    updatedIndex: number,
  ) => {
    if (!draftStorageKey || typeof window === "undefined") return;
    try {
      window.sessionStorage.setItem(
        draftStorageKey,
        JSON.stringify({ answers: updatedAnswers, currentIndex: updatedIndex }),
      );
    } catch {
      // Storage quota or disabled
    }
  };

  // Load quiz or attempt result if attempt token in URL
  useEffect(() => {
    if (!slug) return;
    let active = true;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        // If user arrived with an attempt token, try fetching the result directly
        if (attemptTokenFromUrl && !isPreview) {
          try {
            const res = await api.getPublicAttemptResult(attemptTokenFromUrl);
            if (active && res.result) {
              setResult(res.result);
              // Also fetch quiz settings in background
              api.getPublicQuiz(slug).then((qRes) => {
                if (active && qRes.quiz) setQuiz(qRes.quiz);
              }).catch(() => {});
              setLoading(false);
              return;
            }
          } catch {
            // Fallback to loading quiz normally
          }
        }

        const res = await api.getPublicQuiz(slug, isPreview ? { preview: true } : undefined);
        if (active) {
          setQuiz(res.quiz);

          // Restore draft answers from sessionStorage if not finished
          if (draftStorageKey && typeof window !== "undefined" && !attemptTokenFromUrl) {
            try {
              const raw = window.sessionStorage.getItem(draftStorageKey);
              if (raw) {
                const parsed = JSON.parse(raw);
                if (parsed && typeof parsed.answers === "object" && parsed.answers !== null) {
                  setAnswers(parsed.answers);
                  if (typeof parsed.currentIndex === "number") {
                    setCurrentIndex(parsed.currentIndex);
                  }
                }
              }
            } catch {
              // Ignore parse error
            }
          }
        }
      } catch (err: unknown) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "آزمون مورد نظر یافت نشد یا در دسترس نیست.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [slug, attemptTokenFromUrl, isPreview, api, draftStorageKey]);

  const isPreviewMode = Boolean(quiz?.isPreview);
  const canViewAnswerKey = Boolean(quiz?.canViewAnswerKey);
  const editorUrl = quiz?.id ? `/studio/quizzes/${quiz.id}/edit` : "/studio/quizzes";

  // When result is present and user is authenticated, claim attempt and load solutions
  useEffect(() => {
    if (!result?.attemptToken || !isAuthenticated || isAuthLoading || isPreviewMode) {
      return;
    }
    let active = true;

    const loadSolutions = async () => {
      try {
        setSolutionsLoading(true);
        setSolutionsError(null);

        // Step 1: Claim attempt to authenticated user account (POST)
        try {
          await api.claimPublicAttempt(result.attemptToken);
        } catch {
          // If already claimed or claim fails, continue to try getting solutions as owner
        }

        // Step 2: Fetch full solutions via GET
        const res = await api.getPublicAttemptSolutions(result.attemptToken);
        if (active && res.solutions) {
          setSolutions(res.solutions);
        }
      } catch (err: unknown) {
        if (active) {
          setSolutionsError(
            err instanceof Error ? err.message : "خطا در بارگذاری پاسخ‌های تشریحی.",
          );
        }
      } finally {
        if (active) setSolutionsLoading(false);
      }
    };

    loadSolutions();
    return () => {
      active = false;
    };
  }, [result?.attemptToken, isAuthenticated, isAuthLoading, isPreviewMode, api]);

  const currentQuestion = quiz?.questions?.[currentIndex];
  const totalQuestions = quiz?.questions?.length ?? 0;
  const answeredCount = Object.keys(answers).length;
  const progressPercent =
    totalQuestions > 0 ? Math.round(((currentIndex + 1) / totalQuestions) * 100) : 0;

  const isCurrentMultiSelect = Boolean(
    currentQuestion?.questionType === "multi_choice" ||
    currentQuestion?.questionType === "multiple_response"
  );

  const handleSelectChoice = (questionId: string, choiceId: string) => {
    if (isCurrentMultiSelect) {
      setAnswers((prev) => {
        const currentSelected = Array.isArray(prev[questionId])
          ? (prev[questionId] as string[])
          : prev[questionId]
          ? [String(prev[questionId])]
          : [];

        const nextSelected = currentSelected.includes(choiceId)
          ? currentSelected.filter((id) => id !== choiceId)
          : [...currentSelected, choiceId];

        const updated = {
          ...prev,
          [questionId]: nextSelected,
        };
        persistDraft(updated, currentIndex);
        return updated;
      });
    } else {
      setAnswers((prev) => {
        const updated = {
          ...prev,
          [questionId]: choiceId,
        };
        persistDraft(updated, currentIndex);
        return updated;
      });
    }
  };

  const handleNext = () => {
    if (currentIndex < totalQuestions - 1) {
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      persistDraft(answers, nextIdx);
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      const prevIdx = currentIndex - 1;
      setCurrentIndex(prevIdx);
      persistDraft(answers, prevIdx);
    }
  };

  const handleSubmit = async () => {
    if (!slug) return;
    try {
      setIsSubmitting(true);
      setError(null);

      const res = await api.submitPublicAttempt(
        slug,
        {
          answers,
          idempotencyKey: idempotencyKeyRef.current,
        },
        isPreviewMode ? { preview: true } : undefined,
      );

      setResult(res.result);
      if (res.result?.attemptToken && !isPreviewMode) {
        setSearchParams({ attempt: res.result.attemptToken }, { replace: true });
      }

      // Clear draft storage ONLY upon successful submission
      if (draftStorageKey && typeof window !== "undefined") {
        try {
          window.sessionStorage.removeItem(draftStorageKey);
        } catch {
          // ignore
        }
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "خطا در ثبت نهایی آزمون. لطفاً دوباره تلاش کنید.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetake = () => {
    idempotencyKeyRef.current =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `idem-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    setAnswers({});
    setCurrentIndex(0);
    setResult(null);
    setSolutions(null);
    setSearchParams(isPreviewMode ? { preview: "true" } : {}, { replace: true });
    if (draftStorageKey && typeof window !== "undefined") {
      try {
        window.sessionStorage.removeItem(draftStorageKey);
      } catch {
        // ignore
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center p-4">
        <LoadingState message="در حال آماده‌سازی و بارگذاری سؤالات آزمون..." />
      </div>
    );
  }

  if (error && !result) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col items-center justify-center p-4">
        <Card className="max-w-md w-full p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">
            عدم دسترسی به آزمون
          </h2>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">{error}</p>
          <div className="pt-2">
            <Link to="/home">
              <Button variant="primary" size="sm">
                بازگشت به صفحه اصلی
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  // Result View
  if (result) {
    const score = Math.round(result.score);
    const passThreshold = (quiz?.settings?.passScorePercentage as number) ?? 60;
    const isPassed = score >= passThreshold;

    const ctaTitle =
      quiz?.settings?.ctaTitle ||
      (isPassed ? "تبریک! گام بعدی یادگیری تخصصی" : "تقویت و تسلط بیشتر با آوانا");
    const ctaDescription =
      quiz?.settings?.ctaDescription ||
      "برای یادگیری جامع، دسترسی به بیش از ده‌ها دوره تخصصی و تمرین‌های شبیه‌سازی، به جمع کاربران آوانا بپیوندید.";
    const ctaButtonText = quiz?.settings?.ctaButtonText || "ورود و ثبت‌نام در آوانا";
    const ctaUrl = quiz?.settings?.ctaUrl || "/courses";

    return (
      <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)] flex flex-col justify-between">
        {/* Preview Mode Top Banner */}
        {isPreviewMode && (
          <div className="w-full bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-3 sticky top-0 z-50 backdrop-blur-md">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="font-bold">حالت پیش‌نمایش آزمون (نسخه پیش‌نویس طراح)</span>
              <span className="hidden sm:inline text-[var(--color-text-muted)] text-[11px]">
                • پاسخ‌ها و کارنامه در آمار رسمی ذخیره نخواهند شد
              </span>
            </div>
            <Link
              to={editorUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-100 font-bold transition-colors"
            >
              <span>بازگشت به ویرایشگر</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        <div className="flex-1 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
          {/* Top Navbar */}
          <header className="max-w-2xl mx-auto w-full flex items-center justify-between pb-6 border-b border-[var(--color-border)]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[var(--color-secondary-light)] text-[var(--color-primary-default)] flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <span className="font-black text-sm tracking-wider text-[var(--color-primary-default)] font-mono">
                AVANA
              </span>
            </div>
            <span className="text-xs text-[var(--color-text-muted)]">کارنامه آزمون آنلاین</span>
          </header>

          {/* Main Result Card */}
          <main className="max-w-2xl mx-auto w-full my-8">
            <Card className="p-6 sm:p-8 space-y-6 text-center">
              {/* Badge */}
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--color-secondary-light)] text-[var(--color-primary-default)] text-xs font-semibold">
                <Award className="w-3.5 h-3.5" />
                <span>پایان آزمون</span>
              </div>

              {/* Title */}
              <h1 className="text-xl sm:text-2xl font-black text-[var(--color-text)]">
                {result.quizTitle}
              </h1>

              {/* Big Score Badge */}
              <div className="w-32 h-32 mx-auto rounded-full bg-[var(--color-surface-warm)] border-4 border-[var(--color-primary-default)] flex flex-col items-center justify-center shadow-md">
                <span className="text-3xl font-black text-[var(--color-primary-default)]">
                  ٪{toPersianDigits(score)}
                </span>
                <span className="text-[11px] text-[var(--color-text-muted)] mt-0.5">نمره نهایی</span>
              </div>

              {/* Stats summary row */}
              <div className="grid grid-cols-3 gap-3 pt-2">
                <div className="p-3 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)]">
                  <div className="text-xs text-[var(--color-text-muted)] mb-1">تعداد کل</div>
                  <div className="text-lg font-black text-[var(--color-text)]">
                    {toPersianDigits(result.totalQuestions)}
                  </div>
                </div>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800/40">
                  <div className="text-xs text-emerald-700 dark:text-emerald-400 mb-1 flex items-center justify-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>صحیح</span>
                  </div>
                  <div className="text-lg font-black text-emerald-800 dark:text-emerald-300">
                    {toPersianDigits(result.correctCount)}
                  </div>
                </div>
                <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-2xl border border-red-200 dark:border-red-800/40">
                  <div className="text-xs text-red-700 dark:text-red-400 mb-1 flex items-center justify-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />
                    <span>نادرست</span>
                  </div>
                  <div className="text-lg font-black text-red-800 dark:text-red-300">
                    {toPersianDigits(result.wrongCount)}
                  </div>
                </div>
              </div>

              {/* Share and Retake Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button
                  variant="primary"
                  onClick={() => setShareModalOpen(true)}
                  className="flex-1"
                  leftIcon={<Share2 className="w-4 h-4" />}
                >
                  اشتراک‌گذاری کارنامه
                </Button>

                <Button
                  variant="outline"
                  onClick={handleRetake}
                  leftIcon={<RotateCcw className="w-4 h-4" />}
                >
                  شرکت مجدد
                </Button>

                {isPreviewMode && (
                  <Link to={editorUrl}>
                    <Button variant="secondary" leftIcon={<ArrowLeft className="w-4 h-4" />}>
                      ویرایشگر آزمون
                    </Button>
                  </Link>
                )}
              </div>

              {/* Locked State Conversion Banner (Only for Guest Users) */}
              {!isAuthenticated && !isAuthLoading && !isPreviewMode && (
                <div className="mt-8 p-6 rounded-2xl bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-surface-warm)] border-2 border-[var(--color-primary-default)]/30 shadow-md text-right space-y-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                      <Lock className="w-5 h-5" />
                    </div>
                    <div>
                      <Badge variant="warning" size="sm">
                        ویژه اعضای آوانا
                      </Badge>
                      <h3 className="font-black text-base text-[var(--color-text)] mt-1">
                        پاسخ‌های تشریحی آماده‌اند!
                      </h3>
                    </div>
                  </div>

                  <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
                    با ثبت‌نام رایگان در آوانا، پاسخ صحیح هر سؤال، توضیحات آموزشی و دلیل نادرست بودن سایر گزینه‌ها را مشاهده کن.
                  </p>

                  <div className="pt-2 flex flex-col sm:flex-row gap-3">
                    <Button
                      variant="primary"
                      size="md"
                      onClick={() =>
                        navigate(
                          `/register?redirect=${encodeURIComponent(
                            `/quiz/${slug}?attempt=${result.attemptToken}`,
                          )}`,
                        )
                      }
                      className="flex-1 font-bold shadow-sm"
                      leftIcon={<Sparkles className="w-4 h-4" />}
                    >
                      ثبت‌نام و مشاهده پاسخ‌ها
                    </Button>

                    <Button
                      variant="outline"
                      size="md"
                      onClick={() =>
                        navigate(
                          `/login?redirect=${encodeURIComponent(
                            `/quiz/${slug}?attempt=${result.attemptToken}`,
                          )}`,
                        )
                      }
                    >
                      حساب کاربری دارم | ورود
                    </Button>
                  </div>
                </div>
              )}

              {/* Questions Review & Solutions Section */}
              <div className="mt-10 space-y-4 text-right">
                <div className="flex items-center justify-between pb-3 border-b border-[var(--color-border)]">
                  <div className="flex items-center gap-2 font-black text-base text-[var(--color-text)]">
                    <BookOpen className="w-5 h-5 text-[var(--color-primary-default)]" />
                    <span>بررسی سؤالات و پاسخ‌ها</span>
                  </div>
                  {isAuthenticated && (
                    <Badge variant="success" size="sm">
                      احراز هویت شده ✓
                    </Badge>
                  )}
                </div>

                {/* Authenticated user: Loading solutions */}
                {isAuthenticated && solutionsLoading && (
                  <div className="py-8">
                    <LoadingState message="در حال بارگذاری پاسخ‌های تشریحی و کلید آزمون..." />
                  </div>
                )}

                {/* Authenticated user: Error loading solutions */}
                {isAuthenticated && solutionsError && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 flex items-center justify-between gap-3">
                    <span>{solutionsError}</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!result?.attemptToken) return;
                        try {
                          setSolutionsLoading(true);
                          setSolutionsError(null);
                          const res = await api.getPublicAttemptSolutions(result.attemptToken);
                          if (res.solutions) {
                            setSolutions(res.solutions);
                          }
                        } catch (err: unknown) {
                          setSolutionsError(
                            err instanceof Error ? err.message : "خطا در بارگذاری پاسخ‌های تشریحی.",
                          );
                        } finally {
                          setSolutionsLoading(false);
                        }
                      }}
                    >
                      تلاش مجدد
                    </Button>
                  </div>
                )}

                {/* Authenticated user: Display Full Solutions */}
                {isAuthenticated && solutions && (
                  <div className="space-y-4 pt-2">
                    {solutions.questions.map((q, idx) => {
                      const choiceLabels = ["الف", "ب", "ج", "د"];
                      return (
                        <div
                          key={q.id}
                          className="p-5 sm:p-6 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] space-y-4 text-right shadow-xs"
                        >
                          {/* Question header */}
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-[var(--color-text-muted)]">
                              سؤال {toPersianDigits(idx + 1)}
                            </span>
                            <div className="flex items-center gap-2">
                              {q.topic && (
                                <span className="text-[var(--color-primary-default)] font-medium hidden sm:inline">
                                  {q.topic}
                                </span>
                              )}
                              {q.isCorrect ? (
                                <Badge variant="success" size="sm">
                                  <Check className="w-3 h-3 ml-1" />
                                  پاسخ صحیح
                                </Badge>
                              ) : q.userAnswer ? (
                                <Badge variant="error" size="sm">
                                  <XCircle className="w-3 h-3 ml-1" />
                                  پاسخ نادرست
                                </Badge>
                              ) : (
                                <Badge variant="neutral" size="sm">
                                  بدون پاسخ
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Question text */}
                          <div className="text-sm sm:text-base font-bold text-[var(--color-text)] leading-relaxed">
                            <RichContent content={q.question} />
                          </div>

                          {/* Choices */}
                          <div className="space-y-2 pt-1">
                            {(q.choices ?? []).map((choice, cIdx) => {
                              const isThisChoiceCorrect = isChoiceCorrect(
                                choice,
                                q.correctAnswer,
                                q.choices,
                              );
                              const isChosenByUser = q.userAnswer
                                ? Array.isArray(q.userAnswer)
                                  ? q.userAnswer.includes(choice.id)
                                  : String(q.userAnswer) === String(choice.id)
                                : false;

                              let choiceClasses =
                                "bg-[var(--color-surface-warm)]/40 border-[var(--color-border)] text-[var(--color-text-muted)]";
                              let badgeElement = null;

                              if (isThisChoiceCorrect) {
                                choiceClasses =
                                  "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-100 font-bold ring-2 ring-emerald-500/20";
                                badgeElement = (
                                  <Badge variant="success" size="sm">
                                    پاسخ صحیح ✓
                                  </Badge>
                                );
                              } else if (isChosenByUser && !isThisChoiceCorrect) {
                                choiceClasses =
                                  "bg-red-50 dark:bg-red-950/40 border-red-500 text-red-900 dark:text-red-100 font-semibold ring-2 ring-red-500/20";
                                badgeElement = (
                                  <Badge variant="error" size="sm">
                                    انتخاب شما ✗
                                  </Badge>
                                );
                              }

                              return (
                                <div
                                  key={choice.id}
                                  className={`p-3.5 rounded-xl border flex items-center justify-between text-xs sm:text-sm transition-all ${choiceClasses}`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span
                                      className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                                        isThisChoiceCorrect
                                          ? "bg-emerald-600 text-white"
                                          : isChosenByUser
                                          ? "bg-red-600 text-white"
                                          : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)]"
                                      }`}
                                    >
                                      {choiceLabels[cIdx] || toPersianDigits(cIdx + 1)}
                                    </span>
                                    <span className="font-medium">
                                      <RichContent content={choice.text} inline />
                                    </span>
                                  </div>
                                  {badgeElement}
                                </div>
                              );
                            })}
                          </div>

                          {/* Explanation (ONLY when real explanation exists) */}
                          {Boolean(q.explanation && typeof q.explanation === "string" && q.explanation.trim().length > 0) && (
                            <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-xs text-[var(--color-text)] space-y-1.5 mt-3">
                              <p className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                <span>تحلیل تشریحی و نکته آموزشی:</span>
                              </p>
                              <div className="leading-relaxed text-[var(--color-text)]">
                                <RichContent content={q.explanation!} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Guest user (or auth still loading solutions): Display Question Reviews with Locked State */}
                {(!isAuthenticated || !solutions) && !solutionsLoading && (
                  <div className="space-y-4 pt-2">
                    {((result.questionReviews && result.questionReviews.length > 0)
                      ? result.questionReviews
                      : (quiz?.questions ?? [])
                    ).map((q, idx) => {
                      const choiceLabels = ["الف", "ب", "ج", "د"];
                      const userChoiceId =
                        "userAnswer" in q
                          ? q.userAnswer
                          : answers[q.id];
                      const isCorrect = "isCorrect" in q ? Boolean(q.isCorrect) : false;

                      const qKey = "questionId" in q ? (q as { questionId: string }).questionId : q.id;
                      return (
                        <div
                          key={qKey || idx}
                          className="p-5 sm:p-6 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] space-y-4 text-right shadow-xs"
                        >
                          {/* Question header */}
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-[var(--color-text-muted)]">
                              سؤال {toPersianDigits(idx + 1)}
                            </span>
                            <div className="flex items-center gap-2">
                              {isCorrect ? (
                                <Badge variant="success" size="sm">
                                  <Check className="w-3 h-3 ml-1" />
                                  پاسخ شما صحیح بود
                                </Badge>
                              ) : userChoiceId ? (
                                <Badge variant="error" size="sm">
                                  <XCircle className="w-3 h-3 ml-1" />
                                  پاسخ شما نادرست بود
                                </Badge>
                              ) : (
                                <Badge variant="neutral" size="sm">
                                  بدون پاسخ
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Question text */}
                          <div className="text-sm sm:text-base font-bold text-[var(--color-text)] leading-relaxed">
                            <RichContent content={q.question} />
                          </div>

                          {/* Choices (guest: only highlight user's choice, DO NOT reveal correct key) */}
                          <div className="space-y-2 pt-1">
                            {(q.choices ?? []).map((choice, cIdx) => {
                              const isChosenByUser = userChoiceId
                                ? Array.isArray(userChoiceId)
                                  ? userChoiceId.includes(choice.id)
                                  : String(userChoiceId) === String(choice.id)
                                : false;

                              return (
                                <div
                                  key={choice.id}
                                  className={`p-3.5 rounded-xl border flex items-center justify-between text-xs sm:text-sm transition-all ${
                                    isChosenByUser
                                      ? "bg-[var(--color-secondary-light)]/40 border-[var(--color-primary-default)] text-[var(--color-text)] font-semibold"
                                      : "bg-[var(--color-surface-warm)]/40 border-[var(--color-border)] text-[var(--color-text-muted)]"
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <span
                                      className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${
                                        isChosenByUser
                                          ? "bg-[var(--color-primary-default)] text-white"
                                          : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)]"
                                      }`}
                                    >
                                      {choiceLabels[cIdx] || toPersianDigits(cIdx + 1)}
                                    </span>
                                    <span className="font-medium">
                                      <RichContent content={choice.text} inline />
                                    </span>
                                  </div>
                                  {isChosenByUser && (
                                    <Badge variant="neutral" size="sm">
                                      انتخاب شما
                                    </Badge>
                                  )}
                                </div>
                              );
                            })}
                          </div>

                          {/* Locked teaser for guest */}
                          <div className="p-3.5 rounded-xl bg-[var(--color-surface-warm)]/70 border border-dashed border-[var(--color-border)] text-xs flex items-center justify-between gap-3 mt-3">
                            <div className="flex items-center gap-2 text-[var(--color-text-muted)]">
                              <Lock className="w-4 h-4 text-amber-500 shrink-0" />
                              <span>پاسخ تشریحی و تحلیل گزینه‌ها برای اعضای آوانا قفل است</span>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-[var(--color-primary-default)] font-bold hover:underline shrink-0"
                              onClick={() =>
                                navigate(
                                  `/register?redirect=${encodeURIComponent(
                                    `/quiz/${slug}?attempt=${result.attemptToken}`,
                                  )}`,
                                )
                              }
                            >
                              مشاهده با ثبت‌نام
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Marketing Call To Action Box (Secondary Promotional) */}
              <div className="mt-8 p-5 sm:p-6 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-right space-y-2">
                <h3 className="font-bold text-base text-[var(--color-text)]">
                  {ctaTitle}
                </h3>
                <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
                  {ctaDescription}
                </p>
                <div className="pt-2">
                  <a href={ctaUrl as string} target="_blank" rel="noreferrer">
                    <Button variant="primary" size="sm" rightIcon={<ExternalLink className="w-3.5 h-3.5" />}>
                      {isAuthenticated
                        ? (quiz?.settings?.ctaButtonText as string) || "مشاهده دوره‌های آموزشی"
                        : (ctaButtonText as string)}
                    </Button>
                  </a>
                </div>
              </div>
            </Card>
          </main>

          {/* Footer */}
          <footer className="text-center text-xs text-[var(--color-text-muted)] pt-6">
            طراحی‌شده توسط استودیو سنجش و آموزش AVANA
          </footer>

          {/* Share Modal */}
          {slug && (
            <QuizShareModal
              isOpen={shareModalOpen}
              onClose={() => setShareModalOpen(false)}
              result={result}
              quizSlug={slug}
            />
          )}
        </div>
      </div>
    );
  }

  // Quiz Taking View
  return (
    <div className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)] flex flex-col justify-between selection:bg-[var(--color-primary-light)]/30">
      {/* Preview Mode Top Banner */}
      {isPreviewMode && (
        <div className="w-full bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between gap-3 sticky top-0 z-50 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-bold">حالت پیش‌نمایش آزمون (نسخه پیش‌نویس طراح)</span>
            <span className="hidden sm:inline text-[var(--color-text-muted)] text-[11px]">
              • پاسخ‌ها در آمار شرکت‌کنندگان ثبت نخواهد شد
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Answer Key Toggle for creator */}
            {canViewAnswerKey && (
              <button
                type="button"
                onClick={() => setShowAnswerKey((prev) => !prev)}
                className={`px-3 py-1 rounded-lg text-xs font-bold border transition-colors flex items-center gap-1.5 ${
                  showAnswerKey
                    ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 text-emerald-800 dark:text-emerald-200"
                    : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>{showAnswerKey ? "پاسخنامه: فعال ✓" : "نمایش پاسخنامه (طراح)"}</span>
              </button>
            )}

            <Link
              to={editorUrl}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-100 font-bold transition-colors"
            >
              <span>ویرایشگر</span>
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col justify-between p-4 sm:p-6 lg:p-8">
        {/* Quiz Header */}
        <header className="max-w-3xl mx-auto w-full pb-4 border-b border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[var(--color-secondary-light)] text-[var(--color-primary-default)] flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <span className="font-black text-xs tracking-wider text-[var(--color-primary-default)] font-mono block">
                  AVANA
                </span>
                <h1 className="text-sm sm:text-base font-bold text-[var(--color-text)] line-clamp-1">
                  {quiz?.title}
                </h1>
              </div>
            </div>

            {totalQuestions > 0 && (
              <div className="text-xs font-medium text-[var(--color-text-muted)]">
                سؤال {toPersianDigits(currentIndex + 1)} از {toPersianDigits(totalQuestions)}
              </div>
            )}
          </div>

          {/* Progress Bar */}
          {totalQuestions > 0 && (
            <Progress value={progressPercent} size="sm" />
          )}
        </header>

        {/* Main Question Area */}
        <main className="max-w-3xl mx-auto w-full my-6 flex-1 flex flex-col justify-center">
          {currentQuestion ? (
            <Card className="p-6 sm:p-8 space-y-6">
              {/* Question meta badges */}
              <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                <Badge variant="neutral" size="sm">
                  سؤال {toPersianDigits(currentIndex + 1)}
                </Badge>
                {currentQuestion.topic && (
                  <span className="text-[var(--color-primary-default)] font-medium">
                    مبحث: {currentQuestion.topic}
                  </span>
                )}
              </div>

              {/* Question Text with RichContent */}
              <div className="text-base sm:text-lg font-bold text-[var(--color-text)] leading-relaxed">
                <RichContent content={currentQuestion.question} />
              </div>

              {/* Choices list */}
              <div className="space-y-3 pt-2">
                {(currentQuestion.choices ?? []).map((choice, i) => {
                  const currentAnswerValue = answers[currentQuestion.id];
                  const isSelected = Array.isArray(currentAnswerValue)
                    ? currentAnswerValue.includes(choice.id)
                    : currentAnswerValue === choice.id;

                  const isCorrect = isChoiceCorrect(
                    choice,
                    currentQuestion.correctAnswer,
                    currentQuestion.choices
                  );
                  const shouldHighlightCorrect = Boolean(showAnswerKey && canViewAnswerKey && isCorrect);

                  const choiceLabel = ["الف", "ب", "ج", "د"][i] || toPersianDigits(i + 1);

                  return (
                    <button
                      key={choice.id}
                      type="button"
                      onClick={() => handleSelectChoice(currentQuestion.id, choice.id)}
                      className={`w-full text-right p-4 rounded-2xl border transition-all flex items-center justify-between group ${
                        shouldHighlightCorrect
                          ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500 text-emerald-900 dark:text-emerald-100 ring-2 ring-emerald-500/20 font-bold"
                          : isSelected
                          ? "bg-[var(--color-secondary-light)]/40 border-[var(--color-primary-default)] text-[var(--color-text)] ring-2 ring-[var(--color-primary-default)]/20 font-semibold"
                          : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-primary-default)]/40 hover:bg-[var(--color-surface-warm)]/40"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold transition-colors shrink-0 ${
                            shouldHighlightCorrect
                              ? "bg-emerald-600 text-white"
                              : isSelected
                              ? "bg-[var(--color-primary-default)] text-white"
                              : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] group-hover:text-[var(--color-text)]"
                          }`}
                        >
                          {choiceLabel}
                        </span>
                        <div className="text-xs sm:text-sm font-medium">
                          <RichContent content={choice.text} inline />
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {shouldHighlightCorrect && (
                          <Badge variant="success" size="sm">
                            پاسخ صحیح
                          </Badge>
                        )}
                        <div
                          className={`w-5 h-5 ${
                            isCurrentMultiSelect ? "rounded-md" : "rounded-full"
                          } border-2 flex items-center justify-center transition-colors ${
                            shouldHighlightCorrect
                              ? "border-emerald-600 bg-emerald-600 text-white"
                              : isSelected
                              ? "border-[var(--color-primary-default)] bg-[var(--color-primary-default)] text-white"
                              : "border-[var(--color-border)] group-hover:border-[var(--color-primary-default)]/50"
                          }`}
                        >
                          {(isSelected || shouldHighlightCorrect) && (
                            <Check className="w-3 h-3 stroke-[3]" />
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Explanation (when Answer Key is toggled on in Preview mode) */}
              {showAnswerKey && canViewAnswerKey && currentQuestion.explanation && (
                <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 text-xs text-[var(--color-text)] space-y-1.5 mt-4">
                  <p className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>تشریح و تحلیل پاسخنامه (ویژه طراح):</span>
                  </p>
                  <div className="leading-relaxed">
                    <RichContent content={currentQuestion.explanation} />
                  </div>
                </div>
              )}
            </Card>
          ) : (
            <Card className="p-8 text-center space-y-4 max-w-md mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-[var(--color-text)]">
                این آزمون هنوز هیچ سؤالی ندارد
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                برای مشاهده پیش‌نمایش کامل، ابتدا باید در ویرایشگر استودیو حداقل یک سؤال به آزمون اضافه کنید.
              </p>
              <div className="pt-2">
                <Link to={editorUrl}>
                  <Button variant="primary" size="sm" rightIcon={<ArrowLeft className="w-3.5 h-3.5" />}>
                    افزودن سؤال در ویرایشگر
                  </Button>
                </Link>
              </div>
            </Card>
          )}
        </main>

        {/* Navigation Footer */}
        {totalQuestions > 0 && (
          <footer className="max-w-3xl mx-auto w-full pt-4 border-t border-[var(--color-border)] flex items-center justify-between gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrev}
              disabled={currentIndex === 0}
              leftIcon={<ArrowRight className="w-4 h-4" />}
            >
              سؤال قبلی
            </Button>

            <div className="text-xs text-[var(--color-text-muted)] hidden sm:block">
              پاسخ‌داده‌شده: {toPersianDigits(answeredCount)} از {toPersianDigits(totalQuestions)}
            </div>

            {currentIndex === totalQuestions - 1 ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                disabled={isSubmitting || answeredCount === 0}
                isLoading={isSubmitting}
                rightIcon={<CheckCircle2 className="w-4 h-4" />}
              >
                {isSubmitting ? "در حال ثبت کارنامه..." : "ثبت نهایی و مشاهده نتیجه"}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="sm"
                onClick={handleNext}
                rightIcon={<ArrowLeft className="w-4 h-4" />}
              >
                سؤال بعدی
              </Button>
            )}
          </footer>
        )}
      </div>
    </div>
  );
};
