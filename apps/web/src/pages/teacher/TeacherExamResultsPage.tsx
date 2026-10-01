/**
 * TeacherExamResultsPage.
 *
 * Aggregate view of exam results for teachers:
 *  - High-level KPIs (enrolled, submitted, absent, average, passing rate)
 *  - Score distribution visual bar
 *  - Student-by-student roster with scores, duration, pass/fail status, and link to answers
 *  - Action to release results to students (if not already released)
 */

import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  useTeacherExam,
  useExamResults,
  useReleaseExamResults,
} from "../../hooks/useTeacher.js";
import {
  PageHeader,
  Button,
  Badge,
  Alert,
  LoadingState,
  EmptyState,
} from "../../components/ui/index.js";
import { ExamStatusBadge } from "../../components/teacher/exams/ExamStatusBadge.js";
import { ResultsMetricsCards } from "../../components/teacher/results/ResultsMetricsCards.js";
import { ScoreDistributionBar } from "../../components/teacher/results/ScoreDistributionBar.js";
import { StudentResultsTable } from "../../components/teacher/results/StudentResultsTable.js";
import { ConfirmModal } from "../../components/teacher/common/ConfirmModal.js";
import { Award, ArrowRight, Eye, CheckCircle2 } from "lucide-react";

export function TeacherExamResultsPage() {
  const { examId } = useParams<{ examId: string }>();

  const examQuery = useTeacherExam(examId);
  const resultsQuery = useExamResults(examId);
  const releaseResultsMutation = useReleaseExamResults(examId ?? "");

  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const exam = examQuery.data?.exam;
  const results = resultsQuery.data?.results;

  const isLoading = examQuery.isLoading || resultsQuery.isLoading;

  if (isLoading) {
    return <LoadingState message="در حال دریافت نتایج و کارنامه‌های آزمون..." />;
  }

  if (examQuery.isError || !exam) {
    return (
      <EmptyState
        title="آزمون یافت نشد"
        description="اطلاعات آزمون مورد نظر یافت نشد یا ممکن است حذف شده باشد."
        action={
          <Link to="/teacher/classrooms">
            <Button variant="primary">بازگشت به کلاس‌ها</Button>
          </Link>
        }
      />
    );
  }

  if (resultsQuery.isError || !results) {
    return (
      <EmptyState
        title="خطا در دریافت نتایج"
        description="دریافت کارنامه و نتایج آزمون با خطا مواجه شد. لطفاً دوباره تلاش کنید."
        action={
          <Button variant="primary" onClick={() => void resultsQuery.refetch()}>
            تلاش مجدد
          </Button>
        }
      />
    );
  }

  const isReleased = Boolean(exam.resultsReleasedAt);
  const totalCompleted = results.submittedCount + results.timedOutCount;

  const handleReleaseConfirm = async () => {
    setFeedback(null);
    try {
      await releaseResultsMutation.mutateAsync();
      setReleaseModalOpen(false);
      setFeedback({
        type: "success",
        message: "کارنامه‌ها با موفقیت برای تمامی دانش‌آموزان منتشر شد.",
      });
    } catch (err) {
      setFeedback({
        type: "error",
        message: err instanceof Error ? err.message : "خطا در انتشار کارنامه‌ها",
      });
      throw err;
    }
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs sm:text-sm text-[var(--color-text-muted)]">
        <Link to="/teacher/classrooms" className="hover:text-[#008080] transition-colors">
          کلاس‌های درس
        </Link>
        <span>/</span>
        <Link
          to={`/teacher/classrooms/${exam.classroomId}`}
          className="hover:text-[#008080] transition-colors"
        >
          کلاس
        </Link>
        <span>/</span>
        <Link
          to={`/teacher/exams/${exam.id}`}
          className="hover:text-[#008080] transition-colors truncate max-w-[150px] sm:max-w-xs"
        >
          {exam.title}
        </Link>
        <span>/</span>
        <span className="text-[var(--color-text)] font-semibold">نتایج و کارنامه‌ها</span>
      </div>

      {/* Page Header */}
      <PageHeader
        title={
          <div className="flex items-center gap-3 flex-wrap">
            <span>کارنامه و آمار: {exam.title}</span>
            <ExamStatusBadge exam={exam} />
            {isReleased ? (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                کارنامه‌ها منتشر شده
              </Badge>
            ) : (
              <Badge variant="warning" outlined className="text-amber-700 bg-amber-50 border-amber-200">
                کارنامه‌ها هنوز منتشر نشده
              </Badge>
            )}
          </div>
        }
        description="تحلیل عملکرد شرکت‌کنندگان، نرخ قبولی، توزیع نمرات و جزئیات آزمون دانش‌آموزان"
        actions={
          <div className="flex items-center gap-2">
            <Link to={`/teacher/exams/${exam.id}`}>
              <Button variant="outline" className="gap-2">
                <Eye className="w-4 h-4" />
                مشاهده آزمون
              </Button>
            </Link>

            {!isReleased && (
              <Button
                variant="primary"
                onClick={() => setReleaseModalOpen(true)}
                className="gap-2"
              >
                <Award className="w-4 h-4" />
                انتشار کارنامه‌ها برای دانش‌آموزان
              </Button>
            )}
          </div>
        }
      />

      {/* Notifications */}
      {feedback && (
        <Alert
          variant={feedback.type}
          title={feedback.type === "success" ? "موفقیت‌آمیز" : "خطا"}
        >
          {feedback.message}
        </Alert>
      )}

      {/* KPI Cards */}
      <ResultsMetricsCards results={results} />

      {/* Score Distribution Chart */}
      {results.scoreDistribution && results.scoreDistribution.length > 0 && (
        <ScoreDistributionBar
          distribution={results.scoreDistribution}
          totalCompleted={totalCompleted}
        />
      )}

      {/* Students Results Table */}
      <div className="space-y-3">
        <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
          فهرست عملکرد شرکت‌کنندگان ({results.students.length} دانش‌آموز)
        </h3>
        <StudentResultsTable students={results.students} examId={exam.id} />
      </div>

      {/* Release Results Confirmation Modal */}
      <ConfirmModal
        isOpen={releaseModalOpen}
        onCancel={() => setReleaseModalOpen(false)}
        onConfirm={handleReleaseConfirm}
        title="انتشار کارنامه برای دانش‌آموزان"
        description="با انتشار کارنامه، تمامی دانش‌آموزان کلاس قادر خواهند بود نمره نهایی، وضعیت قبولی و در صورت فعال بودن نمایش پاسخ‌ها، پاسخ‌نامه تفصیلی خود را مشاهده کنند. آیا ادامه می‌دهید؟"
        confirmText="تأیید و انتشار کارنامه‌ها"
        cancelText="انصراف"
        variant="primary"
        isProcessing={releaseResultsMutation.isPending}
      />
    </div>
  );
}
