import React, { useState, useEffect, useMemo } from "react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import {
  createStudioApi,
  type MarketingQuiz,
  type QuizAnalyticsSummary,
} from "../../lib/api/studio-api.js";
import {
  BarChart3,
  TrendingUp,
  Users,
  Award,
  ChevronDown,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { LoadingState } from "../../components/ui/index.js";

export const StudioReportsPage: React.FC = () => {
  const api = useMemo(() => {
    const client = createApiClient({ baseUrl: getApiBaseUrl() });
    return createStudioApi(client);
  }, []);

  const [quizzes, setQuizzes] = useState<MarketingQuiz[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState<string>("");
  const [analytics, setAnalytics] = useState<QuizAnalyticsSummary | null>(null);
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch quizzes list for dropdown selector
  useEffect(() => {
    let active = true;
    const fetchQuizzes = async () => {
      try {
        setLoadingQuizzes(true);
        setError(null);
        const res = await api.listQuizzes();
        if (active) {
          setQuizzes(res.quizzes || []);
          if (res.quizzes && res.quizzes.length > 0 && !selectedQuizId) {
            setSelectedQuizId(res.quizzes[0].id);
          }
        }
      } catch (err: unknown) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "خطا در دریافت فهرست آزمون‌ها",
          );
        }
      } finally {
        if (active) setLoadingQuizzes(false);
      }
    };
    fetchQuizzes();
    return () => {
      active = false;
    };
  }, [api]);

  // Fetch analytics for selected quiz
  useEffect(() => {
    if (!selectedQuizId) {
      setAnalytics(null);
      return;
    }
    let active = true;
    const fetchAnalytics = async () => {
      try {
        setLoadingAnalytics(true);
        setError(null);
        const res = await api.getQuizAnalytics(selectedQuizId);
        if (active) {
          setAnalytics(res.analytics);
        }
      } catch (err: unknown) {
        if (active) {
          setError(
            err instanceof Error ? err.message : "خطا در دریافت آمار آزمون",
          );
        }
      } finally {
        if (active) setLoadingAnalytics(false);
      }
    };
    fetchAnalytics();
    return () => {
      active = false;
    };
  }, [selectedQuizId, api]);

  const selectedQuiz = quizzes.find((q) => q.id === selectedQuizId);

  // Score distribution maximum for bar normalization
  const maxScoreBucket = useMemo(() => {
    if (!analytics?.scoreDistribution) return 1;
    const dist = analytics.scoreDistribution;
    return Math.max(
      dist.range0To20,
      dist.range21To40,
      dist.range41To60,
      dist.range61To80,
      dist.range81To100,
      1,
    );
  }, [analytics]);

  // Max timeline attempts for bar normalization
  const maxTimelineAttempts = useMemo(() => {
    if (!analytics?.participationTimeline || analytics.participationTimeline.length === 0) return 1;
    return Math.max(
      ...analytics.participationTimeline.map((item) => item.attempts),
      1,
    );
  }, [analytics]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">
            گزارش‌ها و تحلیل عملکرد
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            بررسی نرخ مشارکت، توزیع نمرات و آمار پاسخ‌دهندگان به آزمون‌های بازاریابی
          </p>
        </div>

        {/* Quiz Selector */}
        {quizzes.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-[var(--color-text-muted)] whitespace-nowrap">
              انتخاب آزمون:
            </label>
            <div className="relative min-w-[240px]">
              <select
                value={selectedQuizId}
                onChange={(e) => setSelectedQuizId(e.target.value)}
                className="w-full appearance-none px-4 py-2 text-xs sm:text-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[10px] focus:outline-none focus:border-[#008080] focus:ring-2 focus:ring-[#008080]/15 text-[var(--color-text)] cursor-pointer pr-4 pl-10"
              >
                {quizzes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title} ({q.status === "published" ? "منتشر شده" : q.status === "draft" ? "پیش‌نویس" : "غیرفعال"})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3 text-red-600 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loadingQuizzes ? (
        <div className="py-16 flex justify-center">
          <LoadingState message="در حال بارگذاری فهرست آزمون‌ها..." />
        </div>
      ) : quizzes.length === 0 ? (
        <div className="p-12 text-center bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)]">
          <BarChart3 className="w-12 h-12 mx-auto text-[var(--color-text-muted)] mb-3 opacity-50" />
          <p className="text-[var(--color-text)] font-bold mb-1">
            هنوز آزمونی ساخته نشده است
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            برای مشاهده آمار و گزارش‌ها، ابتدا از بخش «آزمون‌ها» یک آزمون ایجاد کنید.
          </p>
        </div>
      ) : loadingAnalytics ? (
        <div className="py-16 flex justify-center">
          <LoadingState message="در حال بارگذاری گزارش و آمار آزمون..." />
        </div>
      ) : analytics ? (
        <>
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                  تعداد کل شرکت‌کنندگان
                </span>
                <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary-default)] flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-[var(--color-text)]">
                {analytics.totalAttempts.toLocaleString("fa-IR")}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">تلاش‌های ثبت‌شده برای این آزمون</p>
            </div>

            <div className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                  میانگین نمره
                </span>
                <div className="w-9 h-9 rounded-xl bg-[var(--color-secondary-light)] text-[var(--color-secondary-dark)] flex items-center justify-center">
                  <Award className="w-5 h-5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-[var(--color-text)]">
                %{Math.round(analytics.averageScore).toLocaleString("fa-IR")}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">میانگین وزنی پاسخ‌های صحیح</p>
            </div>

            <div className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                  وضعیت آزمون
                </span>
                <div className="w-9 h-9 rounded-xl bg-[var(--color-warm)]/50 text-[#8c6b2d] flex items-center justify-center">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
              <div className="text-base font-bold text-[var(--color-text)]">
                {selectedQuiz?.status === "published"
                  ? "در حال اجرا (منتشر شده)"
                  : selectedQuiz?.status === "draft"
                  ? "پیش‌نویس"
                  : "غیرفعال"}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
                اسلاگ: <code className="text-[11px] font-mono text-[var(--color-primary-default)]">{selectedQuiz?.slug}</code>
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-[var(--color-text-muted)]">
                  تعداد سؤالات
                </span>
                <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-light)] text-[var(--color-primary-default)] flex items-center justify-center">
                  <BarChart3 className="w-5 h-5" />
                </div>
              </div>
              <div className="text-2xl font-bold text-[var(--color-text)]">
                {(selectedQuiz?.questionsCount ?? 0).toLocaleString("fa-IR")}
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">سؤالات ذخیره‌شده به‌صورت مستقل</p>
            </div>
          </div>

          {/* Score Distribution Chart */}
          <div className="p-6 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm">
            <h2 className="text-base font-bold text-[var(--color-text)] mb-2 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-[var(--color-primary-default)]" />
              توزیع نمرات شرکت‌کنندگان
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mb-6">
              دسته‌بندی درصدی نمرات پاسخ‌دهندگان به آزمون
            </p>

            <div className="space-y-4">
              {[
                { label: "۰ تا ۲۰ درصد (خیلی ضعیف)", count: analytics.scoreDistribution.range0To20, color: "bg-red-500" },
                { label: "۲۱ تا ۴۰ درصد (ضعیف)", count: analytics.scoreDistribution.range21To40, color: "bg-amber-500" },
                { label: "۴۱ تا ۶۰ درصد (متوسط)", count: analytics.scoreDistribution.range41To60, color: "bg-yellow-500" },
                { label: "۶۱ تا ۸۰ درصد (خوب)", count: analytics.scoreDistribution.range61To80, color: "bg-[var(--color-secondary)]" },
                { label: "۸۱ تا ۱۰۰ درصد (عالی)", count: analytics.scoreDistribution.range81To100, color: "bg-emerald-500" },
              ].map((bucket, index) => {
                const percentage =
                  analytics.totalAttempts > 0
                    ? Math.round((bucket.count / analytics.totalAttempts) * 100)
                    : 0;
                const barWidth = Math.max((bucket.count / maxScoreBucket) * 100, 2);

                return (
                  <div key={index} className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold text-[var(--color-text)]">
                      <span>{bucket.label}</span>
                      <span className="text-[var(--color-text-muted)] font-mono">
                        {bucket.count.toLocaleString("fa-IR")} نفر (%{percentage.toLocaleString("fa-IR")})
                      </span>
                    </div>
                    <div className="h-3 w-full bg-[var(--color-background)] rounded-full overflow-hidden border border-[var(--color-border)]/40">
                      <div
                        className={`h-full ${bucket.color} rounded-full transition-all duration-500`}
                        style={{ width: `${barWidth}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Participation Timeline */}
          <div className="p-6 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm">
            <h2 className="text-base font-bold text-[var(--color-text)] mb-2 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[var(--color-primary-default)]" />
              روند روزانه شرکت در آزمون
            </h2>
            <p className="text-xs text-[var(--color-text-muted)] mb-6">
              تعداد پاسخ‌دهندگان در روزهای اخیر
            </p>

            {analytics.participationTimeline.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] py-8 text-center">
                هنوز داده‌ای برای رسم نمودار روزانه ثبت نشده است.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="h-48 flex items-end gap-3 pt-6 pb-2 border-b border-[var(--color-border)] overflow-x-auto">
                  {analytics.participationTimeline.map((item, i) => {
                    const heightPercent = Math.max(
                      (item.attempts / maxTimelineAttempts) * 100,
                      8,
                    );
                    return (
                      <div
                        key={i}
                        className="flex-1 min-w-[36px] flex flex-col items-center gap-2 group h-full justify-end"
                      >
                        <span className="text-[10px] font-mono text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.attempts}
                        </span>
                        <div
                          className="w-full bg-gradient-to-t from-[#008080] to-[#5ba0c4] rounded-t-lg transition-all group-hover:opacity-90"
                          style={{ height: `${heightPercent}%` }}
                          title={`${item.date}: ${item.attempts} شرکت‌کننده`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between text-[11px] font-mono text-[var(--color-text-muted)]">
                  <span>{analytics.participationTimeline[0]?.date}</span>
                  <span>
                    {analytics.participationTimeline[analytics.participationTimeline.length - 1]?.date}
                  </span>
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
