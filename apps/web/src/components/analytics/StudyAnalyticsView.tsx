import { useQuery } from "@tanstack/react-query";
import {
  Trophy,
  Layers,
  HelpCircle,
  Brain,
  Sparkles,
  ChevronLeft,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
import type { StudyRecommendationResource } from "@avana/contracts";

export interface StudyAnalyticsViewProps {
  organizationId: string;
  courseId: string;
  onNavigateToTab?: (tab: "lessons" | "flashcards" | "quizzes") => void;
}

export function StudyAnalyticsView({
  organizationId,
  courseId,
  onNavigateToTab,
}: StudyAnalyticsViewProps) {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const studyApi = createStudyApi(apiClient);

  const analyticsQuery = useQuery({
    queryKey: ["study-analytics", organizationId, courseId],
    queryFn: () => studyApi.getStudyAnalytics(organizationId, courseId),
  });

  const recommendationsQuery = useQuery({
    queryKey: ["study-recommendations", organizationId, courseId],
    queryFn: () => studyApi.getStudyRecommendations(organizationId, courseId),
  });

  if (analyticsQuery.isLoading || recommendationsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#008080]" />
      </div>
    );
  }

  if (analyticsQuery.isError) {
    return (
      <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
        <h3 className="text-base font-bold text-[var(--color-text)]">
          خطا در بارگذاری تحلیل عملکرد
        </h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          {analyticsQuery.error?.message || "خطایی در دریافت تحلیل‌ها رخ داد."}
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={() => {
              void analyticsQuery.refetch();
              void recommendationsQuery.refetch();
            }}
            className="px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-bold transition-colors"
          >
            تلاش مجدد
          </button>
        </div>
      </div>
    );
  }

  const analytics = analyticsQuery.data?.analytics;
  const recommendations = recommendationsQuery.data?.recommendations ?? [];

  const isNewLearner =
    analytics &&
    analytics.completed_lessons === 0 &&
    analytics.reviewed_flashcards === 0 &&
    analytics.attempts_taken === 0;

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div>
        <h3 className="text-lg font-bold text-[var(--color-text)]">
          عملکرد و میزان تسلط بر مباحث
        </h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          تحلیل هوشمند حاصل از مطالعه درس‌ها، مرور فلش‌کارت‌ها و نتایج آزمون‌های این دوره.
        </p>
      </div>

      {/* New Learner Prompt */}
      {isNewLearner && (
        <div className="flex items-start gap-4 p-6 bg-[#008080]/10 rounded-3xl border border-[#008080]/20">
          <div className="w-10 h-10 rounded-2xl bg-[#008080] text-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-[var(--color-text)]">
              به بخش تحلیل یادگیری خوش آمدید!
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              با مطالعه درس‌ها، مرور روزانه فلش‌کارت‌ها و شرکت در آزمون‌ها، شاخص‌های تسلط و نقاط نیازمند تمرین شما در اینجا محاسبه و نمایش داده می‌شوند.
            </p>
          </div>
        </div>
      )}

      {/* Primary KPI Grid */}
      {analytics && (
        <div className="grid gap-4 sm:grid-cols-3">
          {/* Lessons Card */}
          <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-6 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-text-muted)]">
                پیشرفت مطالعه درس‌ها
              </span>
              <div className="w-8 h-8 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center">
                <Trophy className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black text-[var(--color-text)]" dir="ltr">
                {`${analytics.lesson_progress_percent}%`}
              </span>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {`${analytics.completed_lessons} از ${analytics.total_lessons} درس تکمیل شده`}
              </p>
            </div>
            <div
              role="progressbar"
              aria-label="پیشرفت درس‌ها"
              aria-valuenow={analytics.lesson_progress_percent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="w-full h-2 bg-[var(--color-surface-warm)] rounded-full overflow-hidden border border-[var(--color-border)]"
            >
              <div
                className="h-full bg-[#008080] rounded-full"
                style={{ width: `${analytics.lesson_progress_percent}%` }}
              />
            </div>
          </div>

          {/* Flashcards Card */}
          <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-6 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-text-muted)]">
                تسلط بر فلش‌کارت‌ها
              </span>
              <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black text-[var(--color-text)]" dir="ltr">
                {`${analytics.flashcard_mastery_percent}%`}
              </span>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {`${analytics.reviewed_flashcards} از ${analytics.total_flashcards} کارت مرور شده`}
              </p>
            </div>
            <div
              role="progressbar"
              aria-label="تسلط فلش‌کارت"
              aria-valuenow={analytics.flashcard_mastery_percent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="w-full h-2 bg-[var(--color-surface-warm)] rounded-full overflow-hidden border border-[var(--color-border)]"
            >
              <div
                className="h-full bg-amber-500 rounded-full"
                style={{ width: `${analytics.flashcard_mastery_percent}%` }}
              />
            </div>
          </div>

          {/* Quiz Performance Card */}
          <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-6 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-text-muted)]">
                میانگین نمرات آزمون
              </span>
              <div className="w-8 h-8 rounded-xl bg-[#a7d0e6]/40 text-[#008080] flex items-center justify-center">
                <HelpCircle className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black text-[var(--color-text)]" dir="ltr">
                {`${analytics.average_quiz_score}%`}
              </span>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {`در ${analytics.attempts_taken} نوبت آزمون در ${analytics.total_quizzes} آزمون`}
              </p>
            </div>
            <div
              role="progressbar"
              aria-label="میانگین آزمون"
              aria-valuenow={analytics.average_quiz_score}
              aria-valuemin={0}
              aria-valuemax={100}
              className="w-full h-2 bg-[var(--color-surface-warm)] rounded-full overflow-hidden border border-[var(--color-border)]"
            >
              <div
                className="h-full bg-[#008080] rounded-full"
                style={{ width: `${analytics.average_quiz_score}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Weak Areas & Next Steps */}
      {analytics && (
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Weak Areas */}
          <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-6 space-y-3 shadow-sm">
            <h4 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
              <Brain className="w-4 h-4 text-amber-500" />
              <span>مباحث اولویت‌دار و نیازمند تمرین</span>
            </h4>
            {analytics.weak_areas.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] py-4">
                نقطه ضعفی شناسایی نشد. عملکرد و تسلط شما روی مطالب عالی است!
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {analytics.weak_areas.map((topic: string, i: number) => (
                  <span
                    key={i}
                    className="px-3.5 py-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-300 rounded-xl text-xs font-semibold"
                  >
                    {topic}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Recommended Next Steps */}
          <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-6 space-y-3 shadow-sm">
            <h4 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span>گام‌های پیشنهادی برای ادامه مطالعه</span>
            </h4>
            {analytics.recommended_next_steps.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] py-4">
                با تکمیل بخش‌های بیشتر، گام‌های پیشنهادی اختصاصی فعال خواهند شد.
              </p>
            ) : (
              <ul className="space-y-2">
                {analytics.recommended_next_steps.map((step: string, i: number) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 text-xs font-medium text-[var(--color-text)] p-2.5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[#008080] flex-shrink-0" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Recommendations Feed */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-[#008080]" />
            <span>پیشنهادهای هوشمند مطالعه</span>
          </h4>
          <span className="text-xs text-[var(--color-text-muted)]">
            {recommendations.length} پیشنهاد فعال
          </span>
        </div>

        {recommendations.length === 0 ? (
          <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-8 text-center text-xs text-[var(--color-text-muted)]">
            در حال حاضر پیشنهاد جدیدی برای این دوره ثبت نشده است.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {recommendations.map((rec: StudyRecommendationResource) => (
              <div
                key={rec.id}
                className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-6 space-y-4 flex flex-col justify-between shadow-sm"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-md bg-[#008080]/10 text-[#008080]">
                      {rec.source === "flashcard_review"
                        ? "مرور فلش‌کارت"
                        : rec.source === "quiz_attempt"
                        ? "آزمون"
                        : "مطالعه درس"}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-[var(--color-text)] leading-relaxed">
                    {rec.summary}
                  </p>
                  {rec.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {rec.topics.map((t, tIdx) => (
                        <span
                          key={tIdx}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)] font-medium"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {onNavigateToTab && (
                  <div className="pt-3 border-t border-[var(--color-border)]">
                    <button
                      type="button"
                      onClick={() => {
                        if (rec.source === "flashcard_review") {
                          onNavigateToTab("flashcards");
                        } else if (rec.source === "quiz_attempt") {
                          onNavigateToTab("quizzes");
                        } else {
                          onNavigateToTab("lessons");
                        }
                      }}
                      className="text-xs font-bold text-[#008080] hover:text-[#006666] flex items-center gap-1"
                    >
                      <span>شروع تمرین پیشنهادی</span>
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
