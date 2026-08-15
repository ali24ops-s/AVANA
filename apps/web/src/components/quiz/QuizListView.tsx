import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  HelpCircle,
  ChevronLeft,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
import { QuizExperience } from "./QuizExperience.js";
import type { QuizResource } from "@avana/contracts";

export interface QuizListViewProps {
  organizationId: string;
  courseId: string;
}

export function QuizListView({ organizationId, courseId }: QuizListViewProps) {
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const studyApi = createStudyApi(apiClient);

  const quizzesQuery = useQuery({
    queryKey: ["quizzes", organizationId, courseId],
    queryFn: () => studyApi.listQuizzes(organizationId, courseId),
  });

  if (activeQuizId) {
    return (
      <QuizExperience
        organizationId={organizationId}
        courseId={courseId}
        quizId={activeQuizId}
        onBack={() => setActiveQuizId(null)}
      />
    );
  }

  if (quizzesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#008080]" />
      </div>
    );
  }

  if (quizzesQuery.isError) {
    return (
      <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
        <h3 className="text-base font-bold text-[var(--color-text)]">
          خطا در بارگذاری آزمون‌ها
        </h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          {quizzesQuery.error?.message || "خطایی در دریافت آزمون‌ها رخ داد."}
        </p>
        <button
          type="button"
          onClick={() => void quizzesQuery.refetch()}
          className="px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-bold"
        >
          تلاش مجدد
        </button>
      </div>
    );
  }

  const quizzes = quizzesQuery.data?.quizzes ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[var(--color-text)]">
            آزمون‌های خودسنجی دوره
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            میزان تسلط و درک مفاهیم درسی خود را با آزمون‌های تعاملی بسنجید.
          </p>
        </div>
        <span className="text-xs font-semibold text-[var(--color-text-muted)] bg-[var(--color-surface)] px-3 py-1.5 rounded-xl border border-[var(--color-border)]">
          {quizzes.length} آزمون در دسترس
        </span>
      </div>

      {quizzes.length === 0 ? (
        <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center space-y-3">
          <HelpCircle className="w-10 h-10 text-[var(--color-text-muted)] mx-auto" />
          <h4 className="text-sm font-bold text-[var(--color-text)]">
            هنوز آزمونی منتشر نشده است
          </h4>
          <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto leading-relaxed">
            آزمون‌های ایجادشده از محتوای آموزشی پس از انتشار توسط مدیر دوره در اینجا قرار می‌گیرند.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {quizzes.map((quiz: QuizResource) => (
            <button
              type="button"
              key={quiz.id}
              onClick={() => setActiveQuizId(quiz.id)}
              aria-label={`شرکت در آزمون: ${quiz.title}`}
              className="w-full text-right group bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] rounded-3xl border border-[var(--color-border)] hover:border-[#008080] p-6 transition-all cursor-pointer flex flex-col justify-between space-y-4 focus:outline-none focus:ring-2 focus:ring-[#008080]"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#a7d0e6]/30 text-[#008080] flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                    <HelpCircle className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-md bg-[#008080]/10 text-[#008080]">
                    {quiz.status === "published" ? "منتشر شده" : quiz.status}
                  </span>
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
