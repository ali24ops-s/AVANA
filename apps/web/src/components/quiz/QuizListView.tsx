import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  HelpCircle,
  ChevronLeft,
  AlertCircle,
} from "lucide-react";
import { Card, Badge, Button, LoadingState, EmptyState } from "@avana/ui";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
import { QuizExperience } from "./QuizExperience.js";
import type { QuizResource } from "@avana/contracts";
import { toPersianDigits } from "@avana/domain";

export interface QuizListViewProps {
  organizationId: string;
  courseId: string;
  isPreview?: boolean;
  onUnlock?: () => void;
}

export function QuizListView({ organizationId, courseId, isPreview = false, onUnlock }: QuizListViewProps) {
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const studyApi = createStudyApi(apiClient);

  const quizzesQuery = useQuery({
    queryKey: ["quizzes", organizationId, courseId],
    queryFn: () => studyApi.listQuizzes(organizationId, courseId),
  });

  const effectiveIsPreview = isPreview || (quizzesQuery.data as any)?.is_preview === true;

  if (activeQuizId) {
    return (
      <QuizExperience
        organizationId={organizationId}
        courseId={courseId}
        quizId={activeQuizId}
        isPreview={effectiveIsPreview}
        onUnlock={onUnlock}
        onBack={() => setActiveQuizId(null)}
      />
    );
  }

  if (quizzesQuery.isLoading) {
    return (
      <div className="py-16">
        <LoadingState message="در حال بارگذاری آزمون‌ها..." />
      </div>
    );
  }

  if (quizzesQuery.isError) {
    return (
      <Card className="p-8 sm:p-12 text-center space-y-4 max-w-md mx-auto">
        <AlertCircle className="w-10 h-10 text-[#b84c4c] mx-auto" />
        <h3 className="text-base font-bold text-[var(--color-text)]">
          خطا در بارگذاری آزمون‌ها
        </h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          {quizzesQuery.error?.message || "خطایی در دریافت آزمون‌ها رخ داد."}
        </p>
        <div className="pt-2">
          <Button
            type="button"
            onClick={() => void quizzesQuery.refetch()}
            variant="primary"
            size="sm"
          >
            تلاش مجدد
          </Button>
        </div>
      </Card>
    );
  }

  const quizzes = quizzesQuery.data?.quizzes ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-[var(--color-text)]">
            آزمون‌های خودسنجی دوره
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            میزان تسلط و درک مفاهیم درسی خود را با آزمون‌های تعاملی بسنجید.
          </p>
        </div>
        <Badge variant="neutral" size="md">
          {toPersianDigits(quizzes.length)} آزمون در دسترس
        </Badge>
      </div>

      {quizzes.length === 0 ? (
        <EmptyState
          icon={<HelpCircle className="w-8 h-8 text-[var(--color-text-muted)]" />}
          title="هنوز آزمونی منتشر نشده است"
          description="آزمون‌های ایجادشده از محتوای آموزشی پس از انتشار توسط مدیر دوره در اینجا قرار می‌گیرند."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {quizzes.map((quiz: QuizResource) => (
            <button
              type="button"
              key={quiz.id}
              onClick={() => setActiveQuizId(quiz.id)}
              aria-label={`شرکت در آزمون: ${quiz.title}`}
              className="w-full text-start group bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] rounded-[16px] border border-[var(--color-border)] hover:border-[#008080] p-5 sm:p-6 transition-all duration-150 cursor-pointer flex flex-col justify-between space-y-4 shadow-[var(--shadow-subtle)] hover:shadow-[var(--shadow-card)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008080]"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="w-10 h-10 rounded-[10px] bg-[#e0f2f2] text-[#008080] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    <HelpCircle className="w-5 h-5" />
                  </div>
                  <Badge variant={effectiveIsPreview ? "info" : "primary"} size="sm">
                    {effectiveIsPreview ? "پیش‌نمایش رایگان (۵ سوال)" : (quiz.status === "published" ? "منتشر شده" : quiz.status)}
                  </Badge>
                </div>
                <h4 className="text-sm font-bold text-[var(--color-text)] group-hover:text-[#008080] transition-colors">
                  {quiz.title}
                </h4>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                <span>تاریخ: {new Date(quiz.created_at).toLocaleDateString("fa-IR")}</span>
                <span className="font-bold text-[#008080] flex items-center gap-1 group-hover:-translate-x-0.5 transition-transform">
                  <span>شروع آزمون</span>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
