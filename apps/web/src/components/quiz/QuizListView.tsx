import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  AlertCircle,
} from "lucide-react";
import { Card, Badge, Button, LoadingState, EmptyState } from "@avana/ui";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createStudyApi } from "../../lib/api/study.js";
import { QuizExperience } from "./QuizExperience.js";
import { QuizFilterBar } from "./QuizFilterBar.js";
import type { QuizResource } from "@avana/contracts";
import {
  toPersianDigits,
  cleanQuizChapterTitle,
  type QuizQuestionFilterCount,
  type QuizQuestionDifficulty,
} from "@avana/domain";
import { AvaniAvatar } from "../brand/AvaniAvatar.js";

export interface QuizListViewProps {
  organizationId: string;
  courseId: string;
  isPreview?: boolean;
  onUnlock?: () => void;
  initialQuizId?: string | null;
}

export function QuizListView({
  organizationId,
  courseId,
  isPreview = false,
  onUnlock,
  initialQuizId = null,
}: QuizListViewProps) {
  const [activeQuizId, setActiveQuizId] = useState<string | null>(initialQuizId);
  const [selectedCount, setSelectedCount] = useState<QuizQuestionFilterCount | null>(null);
  const [selectedDifficulty, setSelectedDifficulty] = useState<QuizQuestionDifficulty | null>(null);

  useEffect(() => {
    setActiveQuizId(initialQuizId);
    setSelectedCount(null);
    setSelectedDifficulty(null);
  }, [organizationId, courseId]);

  useEffect(() => {
    if (initialQuizId) {
      setActiveQuizId(initialQuizId);
    }
  }, [initialQuizId]);

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const studyApi = createStudyApi(apiClient);

  const quizzesQuery = useQuery({
    queryKey: ["quizzes", organizationId, courseId],
    queryFn: () => studyApi.listQuizzes(organizationId, courseId),
  });

  const effectiveIsPreview = isPreview || (quizzesQuery.data as { is_preview?: boolean } | undefined)?.is_preview === true;

  if (activeQuizId) {
    return (
      <QuizExperience
        key={activeQuizId}
        organizationId={organizationId}
        courseId={courseId}
        quizId={activeQuizId}
        isPreview={effectiveIsPreview}
        onUnlock={onUnlock}
        onBack={() => setActiveQuizId(null)}
        initialCount={selectedCount}
        initialDifficulty={selectedDifficulty}
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

      {quizzes.length > 0 && (
        <QuizFilterBar
          selectedCount={selectedCount}
          selectedDifficulty={selectedDifficulty}
          onCountChange={(count) => setSelectedCount(count)}
          onDifficultyChange={(diff) => setSelectedDifficulty(diff)}
          onClearFilters={() => {
            setSelectedCount(null);
            setSelectedDifficulty(null);
          }}
        />
      )}

      {quizzes.length === 0 ? (
        <EmptyState
          icon={<AvaniAvatar variant="empty" size={44} alt="آوانی" asInlineSvg={true} />}
          title="هنوز آزمونی منتشر نشده است"
          description="آزمون‌های ایجادشده از محتوای آموزشی پس از انتشار توسط مدیر دوره در اینجا قرار می‌گیرند."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {quizzes.map((quiz: QuizResource) => {
            const questionCount =
              (quiz as { questions?: unknown[]; question_count?: number }).questions?.length ??
              (quiz as { question_count?: number }).question_count;

            const chapterTitle = cleanQuizChapterTitle(quiz.title);

            return (
              <button
                type="button"
                key={quiz.id}
                onClick={() => setActiveQuizId(quiz.id)}
                aria-label={`شرکت در آزمون: ${chapterTitle}`}
                className="w-full text-start group bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] rounded-[16px] border border-[var(--color-border)] hover:border-[#008080] p-5 sm:p-6 transition-all duration-150 cursor-pointer flex flex-col justify-between space-y-4 shadow-[var(--shadow-subtle)] hover:shadow-[var(--shadow-card)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#008080]"
              >
                <div className="space-y-2">
                  {effectiveIsPreview && (
                    <div className="flex items-center justify-end">
                      <Badge variant="info" size="sm">
                        پیش‌نمایش رایگان (۵ سوال)
                      </Badge>
                    </div>
                  )}
                  <h4 className="text-sm font-bold text-[var(--color-text)] group-hover:text-[#008080] transition-colors leading-relaxed">
                    {chapterTitle}
                  </h4>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border)] text-xs text-[var(--color-text-muted)]">
                  {questionCount !== undefined && questionCount > 0 ? (
                    <span className="font-medium text-[var(--color-text-secondary)]">
                      {toPersianDigits(questionCount)} سوال
                    </span>
                  ) : (
                    <span />
                  )}
                  <span className="font-bold text-[#008080] flex items-center gap-1 group-hover:-translate-x-0.5 transition-transform ms-auto">
                    <span>شروع آزمون</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
