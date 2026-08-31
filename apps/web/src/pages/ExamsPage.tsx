import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExamConfigView } from "../components/quiz/ExamConfigView.js";
import { ExamTakingView } from "../components/quiz/ExamTakingView.js";
import { ExamResultView, type ExamResultViewProps } from "../components/quiz/ExamResultView.js";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createStudyApi } from "../lib/api/study.js";
import { useAuth } from "../providers/AuthProvider.js";
import type { OrganizationResource } from "@avana/contracts";

export function ExamsPage() {
  const { attemptId } = useParams<{ attemptId?: string }>();
  const navigate = useNavigate();
  const { memberships, isLoading: isAuthLoading } = useAuth();

  const [resultData, setResultData] = useState<ExamResultViewProps["result"] | null>(null);

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
      <div className="min-h-screen bg-[#0b1219] text-slate-200 flex items-center justify-center py-20 font-sans" dir="rtl">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm font-medium">در حال دریافت اطلاعات کاربر و سازمان...</p>
        </div>
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="min-h-screen bg-[#0b1219] text-slate-200 flex items-center justify-center p-4 font-sans" dir="rtl">
        <div className="max-w-md w-full bg-[#0f1722] border border-[#1e293b] rounded-2xl p-8 text-center shadow-2xl">
          <span className="material-symbols-outlined text-amber-400 text-5xl mb-4">domain_disabled</span>
          <h3 className="text-xl font-bold text-white mb-2">سازمانی یافت نشد</h3>
          <p className="text-slate-400 text-sm mb-6">
            هیچ سازمان فعالی برای حساب کاربری شما یافت نشد. لطفاً وارد حساب کاربری خود شوید یا با پشتیبانی تماس بگیرید.
          </p>
        </div>
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

  const handleRetry = () => {
    setResultData(null);
    navigate("/exams");
  };

  const handleReturnToConfig = () => {
    setResultData(null);
    navigate("/exams");
  };

  // If URL has attemptId, handle attempt loading/taking/result states
  if (attemptId) {
    if (attemptQuery.isLoading) {
      return (
        <div className="min-h-screen bg-[#0b1219] text-slate-200 flex items-center justify-center py-20 font-sans" dir="rtl">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm font-medium">در حال بازیابی اطلاعات و سؤالات آزمون...</p>
          </div>
        </div>
      );
    }

    if (attemptQuery.isError || !attemptQuery.data) {
      return (
        <div className="min-h-screen bg-[#0b1219] text-slate-200 flex items-center justify-center p-4 font-sans" dir="rtl">
          <div className="max-w-md w-full bg-[#0f1722] border border-[#1e293b] rounded-2xl p-8 text-center shadow-2xl">
            <span className="material-symbols-outlined text-red-400 text-5xl mb-4">error</span>
            <h3 className="text-xl font-bold text-white mb-2">آزمون مورد نظر یافت نشد</h3>
            <p className="text-slate-400 text-sm mb-6">
              ممکن است این آزمون حذف شده باشد یا دسترسی به آن امکان‌پذیر نباشد.
            </p>
            <button
              type="button"
              onClick={handleReturnToConfig}
              className="w-full py-3 bg-primary-container hover:bg-opacity-90 text-white rounded-xl font-title-md text-sm transition-all"
            >
              بازگشت به تنظیمات آزمون
            </button>
          </div>
        </div>
      );
    }

    const { attempt, questions, isCompleted } = attemptQuery.data;

    // If completed or submitted, show Result View
    if (isCompleted || resultData) {
      const activeResult = resultData || {
        attemptId: attempt.id,
        score: attempt.score,
        correct: Math.round((attempt.score / 100) * (questions?.length || 10)),
        total: questions?.length || 10,
        passed: attempt.score >= 60,
        completedAt: attempt.completedAt,
        questions,
      };

      return (
        <div className="min-h-screen bg-[#0b1219] text-[#f8f9ff] selection:bg-teal-700/50 selection:text-white font-sans" dir="rtl">
          <ExamResultView
            result={activeResult}
            onRetry={handleRetry}
            onReturnToConfig={handleReturnToConfig}
          />
        </div>
      );
    }

    // Render ExamTakingView for active attempt
    return (
      <div className="min-h-screen bg-[#0b1219] text-[#f8f9ff] selection:bg-teal-700/50 selection:text-white font-sans" dir="rtl">
        <ExamTakingView
          organizationId={organizationId}
          attemptId={attempt.id}
          questions={questions}
          initialAnswers={attempt.answers as Record<string, unknown>}
          startedAt={attempt.startedAt}
          topicName={attempt.topic || undefined}
          onExit={handleReturnToConfig}
          onSubmitSuccess={handleSubmitSuccess}
        />
      </div>
    );
  }

  // Default: Exam Configuration View
  return (
    <div className="min-h-screen bg-[#0b1219] text-[#f8f9ff] selection:bg-teal-700/50 selection:text-white font-sans" dir="rtl">
      <ExamConfigView
        organizationId={organizationId}
        onStartExam={handleStartExam}
      />
    </div>
  );
}
