import { useState } from "react";
import { AlertCircle } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExamConfigView } from "../components/quiz/ExamConfigView.js";
import { ExamTakingView } from "../components/quiz/ExamTakingView.js";
import { ExamResultView, type ExamResultViewProps } from "../components/quiz/ExamResultView.js";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createStudyApi } from "../lib/api/study.js";
import { useAuth } from "../providers/AuthProvider.js";
import { Button, LoadingState, Card } from "../components/ui/index.js";
import type { OrganizationResource } from "@avana/contracts";

export function ExamsPage() {
  const { attemptId } = useParams<{ attemptId?: string }>();
  const navigate = useNavigate();
  const { memberships, isLoading: isAuthLoading } = useAuth();

  const [resultData, setResultData] = useState<ExamResultViewProps["result"] | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const orgApi = createOrganizationApi(apiClient);
  const studyApi = createStudyApi(apiClient);

  // Fetch student organizations from API
  const orgsQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: () => orgApi.listOrganizations(),
  });

  // Resolve current active organization ID from items or auth memberships
  const organizationId =
    (orgsQuery.data?.items?.[0] as OrganizationResource | undefined)?.id ||
    memberships?.[0]?.organization_id;

  // Fetch attempt details if attemptId is present in URL
  const attemptQuery = useQuery({
    queryKey: ["exam-attempt", organizationId, attemptId],
    queryFn: () => studyApi.getExamAttemptDetail(organizationId!, attemptId!),
    enabled: Boolean(attemptId && organizationId),
    staleTime: 0,
  });

  if (isAuthLoading || orgsQuery.isLoading) {
    return (
      <div className="w-full py-20 flex items-center justify-center font-sans" dir="rtl">
        <LoadingState message="در حال دریافت اطلاعات کاربر و سازمان..." />
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="w-full py-16 px-4 flex items-center justify-center font-sans" dir="rtl">
        <Card className="max-w-md w-full text-center p-8 shadow-xs border border-[var(--color-border)]">
          <span className="material-symbols-outlined text-[var(--avana-warning)] text-5xl mb-4">domain_disabled</span>
          <h3 className="text-xl font-bold text-[var(--color-text)] mb-2">سازمانی یافت نشد</h3>
          <p className="text-[var(--color-text-muted)] text-sm mb-6">
            هیچ سازمان فعالی برای حساب کاربری شما یافت نشد. لطفاً وارد حساب کاربری خود شوید یا با پشتیبانی تماس بگیرید.
          </p>
        </Card>
      </div>
    );
  }

  // Handle Start Exam from Config
  const handleStartExam = (data: {
    attemptId: string;
    questions: Array<Record<string, unknown>>;
    topics: string[];
    difficulty: string;
    requestedCount: number;
  }) => {
    navigate(`/exams/attempt/${data.attemptId}`);
  };

  const handleSubmitSuccess = (result: unknown) => {
    setResultData(result as ExamResultViewProps["result"]);
    attemptQuery.refetch();
  };

  const handleRetry = async () => {
    if (!organizationId || !attemptId) {
      setResultData(null);
      navigate("/exams");
      return;
    }
    try {
      setIsRetrying(true);
      const res = await studyApi.retakeExamAttempt(organizationId, attemptId);
      setResultData(null);
      navigate(`/exams/attempt/${res.attemptId}`);
    } catch (err: unknown) {
      console.error("Failed to retake exam attempt", err);
      setResultData(null);
      navigate("/exams");
    } finally {
      setIsRetrying(false);
    }
  };

  const handleReturnToConfig = () => {
    setResultData(null);
    navigate("/exams");
  };

  // If URL has attemptId, handle attempt loading/taking/result states
  if (attemptId) {
    if (attemptQuery.isLoading) {
      return (
        <div className="w-full py-20 flex items-center justify-center font-sans" dir="rtl">
          <LoadingState message="در حال بازیابی اطلاعات و سؤالات آزمون..." />
        </div>
      );
    }

    if (attemptQuery.isError || !attemptQuery.data) {
      return (
        <div className="w-full py-16 px-4 flex items-center justify-center font-sans" dir="rtl">
          <Card className="max-w-md w-full text-center p-8 shadow-xs border border-[var(--color-border)]">
            <AlertCircle className="w-12 h-12 text-[var(--avana-error)] mb-4 mx-auto" aria-hidden="true" />
            <h3 className="text-xl font-bold text-[var(--color-text)] mb-2">آزمون مورد نظر یافت نشد</h3>
            <p className="text-[var(--color-text-muted)] text-sm mb-6">
              ممکن است این آزمون حذف شده باشد یا دسترسی به آن امکان‌پذیر نباشد.
            </p>
            <Button
              variant="primary"
              fullWidth
              onClick={handleReturnToConfig}
            >
              بازگشت به تنظیمات آزمون
            </Button>
          </Card>
        </div>
      );
    }

    const { attempt, questions, coverage, isCompleted } = attemptQuery.data;

    // If completed or submitted, show Result View
    if (isCompleted || resultData) {
      const activeResult: ExamResultViewProps["result"] = resultData || {
        attemptId: attempt.id,
        score: attempt.score,
        correct: attemptQuery.data.correct ?? Math.round((attempt.score / 100) * (questions?.length || 10)),
        incorrect: attemptQuery.data.incorrect,
        unanswered: attemptQuery.data.unanswered,
        partial: attemptQuery.data.partial,
        total: questions?.length || 10,
        passed: attempt.score >= 60,
        completedAt: attempt.completedAt,
        answers: attemptQuery.data.answers || (attempt.answers as Record<string, unknown>) || {},
        questionResults: attemptQuery.data.questionResults,
        questions,
      };

      return (
        <div className="w-full min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] font-sans overflow-x-hidden" dir="rtl">
          <ExamResultView
            result={activeResult}
            onRetry={handleRetry}
            onReturnToConfig={handleReturnToConfig}
            isRetrying={isRetrying}
          />
        </div>
      );
    }

    const metrics = (attempt.metrics ?? {}) as Record<string, unknown>;
    const timeLimitMinutes =
      (attempt as { timeLimitMinutes?: number }).timeLimitMinutes ??
      (typeof metrics.timeLimitMinutes === "number" ? metrics.timeLimitMinutes : null) ??
      (typeof metrics.durationMinutes === "number" ? metrics.durationMinutes : null);

    const initialElapsedSeconds =
      typeof metrics.elapsedSeconds === "number"
        ? metrics.elapsedSeconds
        : undefined;

    // Render ExamTakingView for active attempt
    return (
      <ExamTakingView
        organizationId={organizationId}
        attemptId={attempt.id}
        questions={questions}
        initialAnswers={attempt.answers as Record<string, unknown>}
        startedAt={attempt.startedAt}
        initialElapsedSeconds={initialElapsedSeconds}
        timeLimitMinutes={timeLimitMinutes}
        topicName={attempt.topic || undefined}
        coverage={coverage}
        onExit={handleReturnToConfig}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );
  }

  // Default: Exam Configuration View
  return (
    <div className="w-full bg-[var(--color-bg-default)] text-[var(--color-text)] font-sans" dir="rtl">
      <ExamConfigView
        organizationId={organizationId}
        onStartExam={handleStartExam}
        onSelectAttempt={(attId) => navigate(`/exams/attempt/${attId}`)}
      />
    </div>
  );
}
