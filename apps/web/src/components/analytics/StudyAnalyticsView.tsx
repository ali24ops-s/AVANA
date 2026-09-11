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
import { Card, Button, Progress, Badge } from "@avana/ui";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
import type { StudyRecommendationResource } from "@avana/contracts";
import { formatPersianOf, toPersianDigits } from "@avana/domain";

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
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (analyticsQuery.isError) {
    return (
      <Card className="p-12 text-center space-y-4" dir="rtl">
        <AlertCircle className="w-10 h-10 text-[var(--color-error)] mx-auto" />
        <h3 className="text-base font-bold text-[var(--color-text)]">
          خطا در بارگذاری تحلیل عملکرد
        </h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          {analyticsQuery.error?.message || "خطایی در دریافت تحلیل‌ها رخ داد."}
        </p>
        <div className="pt-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              void analyticsQuery.refetch();
              void recommendationsQuery.refetch();
            }}
          >
            تلاش مجدد
          </Button>
        </div>
      </Card>
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
    <div className="space-y-8 font-sans" dir="rtl">
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
        <div className="flex items-start gap-4 p-6 bg-[var(--color-primary-soft)] rounded-card border border-[var(--color-primary-muted)]/40">
          <div className="w-10 h-10 rounded-button bg-[var(--color-primary)] text-white flex items-center justify-center flex-shrink-0 shadow-xs">
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
          <Card className="space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-text-muted)]">
                پیشرفت مطالعه درس‌ها
              </span>
              <div className="w-8 h-8 rounded-button bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center">
                <Trophy className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black text-[var(--color-text)]" dir="ltr">
                {`${analytics.lesson_progress_percent}%`}
              </span>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {formatPersianOf(analytics.completed_lessons, analytics.total_lessons, { suffix: " درس تکمیل شده" })}
              </p>
            </div>
            <Progress
              value={analytics.lesson_progress_percent}
              aria-label="پیشرفت درس‌ها"
              variant="primary"
              size="sm"
            />
          </Card>

          {/* Flashcards Card */}
          <Card className="space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-text-muted)]">
                تسلط بر فلش‌کارت‌ها
              </span>
              <div className="w-8 h-8 rounded-button bg-[var(--color-secondary-soft)] dark:bg-[var(--color-secondary-dark)]/30 text-[var(--color-secondary-dark)] dark:text-[var(--color-secondary-blue)] flex items-center justify-center">
                <Layers className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black text-[var(--color-text)]" dir="ltr">
                {`${analytics.flashcard_mastery_percent}%`}
              </span>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {formatPersianOf(analytics.reviewed_flashcards, analytics.total_flashcards, { suffix: " کارت مرور شده" })}
              </p>
            </div>
            <Progress
              value={analytics.flashcard_mastery_percent}
              aria-label="تسلط فلش‌کارت"
              variant="warning"
              size="sm"
            />
          </Card>

          {/* Quiz Performance Card */}
          <Card className="space-y-3 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-text-muted)]">
                میانگین نمرات آزمون
              </span>
              <div className="w-8 h-8 rounded-button bg-[var(--color-primary-soft)] text-[var(--color-primary)] flex items-center justify-center">
                <HelpCircle className="w-4 h-4" />
              </div>
            </div>
            <div>
              <span className="text-2xl font-black text-[var(--color-text)]" dir="ltr">
                {`${analytics.average_quiz_score}%`}
              </span>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {`در ${toPersianDigits(analytics.attempts_taken)} نوبت آزمون در ${toPersianDigits(analytics.total_quizzes)} آزمون`}
              </p>
            </div>
            <Progress
              value={analytics.average_quiz_score}
              aria-label="میانگین آزمون"
              variant="primary"
              size="sm"
            />
          </Card>
        </div>
      )}

      {/* Weak Areas & Next Steps */}
      {analytics && (
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Weak Areas */}
          <Card className="space-y-3 shadow-xs">
            <h4 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
              <Brain className="w-4 h-4 text-[var(--color-warning)]" />
              <span>مباحث اولویت‌دار و نیازمند تمرین</span>
            </h4>
            {analytics.weak_areas.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)] py-4">
                نقطه ضعفی شناسایی نشد. عملکرد و تسلط شما روی مطالب عالی است!
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 pt-1">
                {analytics.weak_areas.map((topic: string, i: number) => (
                  <Badge
                    key={i}
                    variant="warning"
                    size="md"
                    className="px-3.5 py-1.5"
                  >
                    {topic}
                  </Badge>
                ))}
              </div>
            )}
          </Card>

          {/* Recommended Next Steps */}
          <Card className="space-y-3 shadow-xs">
            <h4 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[var(--color-success)]" />
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
                    className="flex items-center gap-2 text-xs font-medium text-[var(--color-text)] p-2.5 rounded-button bg-[var(--color-surface-warm)] border border-[var(--color-border)]"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)] flex-shrink-0" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {/* Recommendations Feed */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-bold text-[var(--color-text)] flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-[var(--color-primary)]" />
            <span>پیشنهادهای هوشمند مطالعه</span>
          </h4>
          <Badge variant="neutral" size="sm">
            {recommendations.length} پیشنهاد فعال
          </Badge>
        </div>

        {recommendations.length === 0 ? (
          <Card className="p-8 text-center text-xs text-[var(--color-text-muted)]">
            در حال حاضر پیشنهاد جدیدی برای این دوره ثبت نشده است.
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {recommendations.map((rec: StudyRecommendationResource) => (
              <Card
                key={rec.id}
                className="p-6 space-y-4 flex flex-col justify-between shadow-xs"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge
                      variant={
                        rec.source === "flashcard_review"
                          ? "secondary"
                          : rec.source === "quiz_attempt"
                          ? "primary"
                          : "neutral"
                      }
                      size="sm"
                    >
                      {rec.source === "flashcard_review"
                        ? "مرور فلش‌کارت"
                        : rec.source === "quiz_attempt"
                        ? "آزمون"
                        : "مطالعه درس"}
                    </Badge>
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-[var(--color-text)] leading-relaxed">
                    {rec.summary}
                  </p>
                  {rec.topics.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {rec.topics.map((t, tIdx) => (
                        <span
                          key={tIdx}
                          className="text-[10px] px-2 py-0.5 rounded-sm bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)] font-medium"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {onNavigateToTab && (
                  <div className="pt-3 border-t border-[var(--color-border)]">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (rec.source === "flashcard_review") {
                          onNavigateToTab("flashcards");
                        } else if (rec.source === "quiz_attempt") {
                          onNavigateToTab("quizzes");
                        } else {
                          onNavigateToTab("lessons");
                        }
                      }}
                      className="text-xs font-bold text-[var(--color-primary)] hover:text-[var(--color-primary-dark)] dark:hover:text-[var(--color-primary-light)] p-0 h-auto"
                      rightIcon={<ChevronLeft className="w-3.5 h-3.5" />}
                    >
                      <span>شروع تمرین پیشنهادی</span>
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
