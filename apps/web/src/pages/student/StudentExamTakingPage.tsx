/**
 * StudentExamTakingPage.
 *
 * Dedicated full-screen route for taking a teacher exam:
 *  - Distraction-free, bypasses normal shell headers
 *  - Enforces authentication via ProtectedRoute
 *  - Recovers active attempt from server state (refresh-safe)
 *  - Automatically redirects if already completed/submitted
 */

import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  useCurrentStudentExamAttempt,
  useStudentClassroomExams,
  useStartStudentExamAttempt,
} from "../../hooks/useStudentTeacherExams.js";
import { StudentExamTakingView } from "../../components/student-exams/StudentExamTakingView.js";
import { LoadingState, EmptyState, Button, Card } from "../../components/ui/index.js";
import { HelpCircle, AlertCircle } from "lucide-react";

export function StudentExamTakingPage() {
  const { classroomId, examId } = useParams<{ classroomId: string; examId: string }>();
  const navigate = useNavigate();

  const examsQuery = useStudentClassroomExams(classroomId);
  const currentAttemptQuery = useCurrentStudentExamAttempt(examId);
  const startMutation = useStartStudentExamAttempt(examId ?? "", classroomId);

  const exam = examsQuery.data?.exams?.find((e) => e.id === examId);
  const attempt = currentAttemptQuery.data?.attempt;

  // Auto-redirect if attempt is already finalized or exam is closed
  useEffect(() => {
    if (!exam && !attempt) return;
    const isClosed =
      exam?.runtimeState === "closed" ||
      (exam?.endsAt ? Date.now() >= new Date(exam.endsAt).getTime() : false);

    if (attempt && (attempt.status === "submitted" || attempt.status === "timed_out" || isClosed)) {
      navigate(`/classrooms/${classroomId}/exams/${examId}/results`, { replace: true });
    } else if (isClosed && !attempt) {
      navigate(`/classrooms/${classroomId}/exams/${examId}`, { replace: true });
    }
  }, [attempt, exam, classroomId, examId, navigate]);

  const hasAttempt = Boolean(attempt);

  // Loading state: only when initial data is not yet available in cache or in-flight
  if (!hasAttempt && !exam && (currentAttemptQuery.isLoading || examsQuery.isLoading)) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-default)] flex items-center justify-center font-sans" dir="rtl">
        <LoadingState message="در حال بازیابی اطلاعات تلاش و سؤالات آزمون از سرور..." />
      </div>
    );
  }

  // Error state: only show full-page error if we have NO valid attempt in data/cache AND a query failed or no exam is available
  if (!hasAttempt && (currentAttemptQuery.isError || (examsQuery.isError && !exam) || (!exam && !currentAttemptQuery.isLoading && !examsQuery.isLoading))) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-default)] flex items-center justify-center p-4 font-sans" dir="rtl">
        <Card className="max-w-md w-full p-8 text-center border border-[var(--color-border)] rounded-3xl shadow-sm">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">
            خطا در بارگذاری آزمون
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mb-6 leading-relaxed">
            اطلاعات این آزمون در دسترس نیست یا ممکن است دسترسی شما به کلاس منقضی شده باشد.
          </p>
          <Button
            variant="primary"
            fullWidth
            onClick={() => navigate(classroomId ? `/classrooms/${classroomId}` : "/classrooms")}
          >
            بازگشت به کلاس
          </Button>
        </Card>
      </div>
    );
  }

  // If student hasn't started the attempt yet, start it now
  if (!attempt) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-default)] flex items-center justify-center p-4 font-sans" dir="rtl">
        <Card className="max-w-md w-full p-8 text-center border border-[var(--color-border)] rounded-3xl shadow-sm">
          <HelpCircle className="w-12 h-12 text-[#008080] mx-auto mb-4" />
          <h3 className="text-lg font-bold text-[var(--color-text)] mb-2">
            شروع آزمون «{exam?.title || "آزمون کلاسی"}»
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mb-6 leading-relaxed">
            شما هنوز در این آزمون شرکت نکرده‌اید. با کلیک بر روی دکمه زیر تلاش شما آغاز خواهد شد.
          </p>
          <Button
            variant="primary"
            fullWidth
            isLoading={startMutation.isPending}
            disabled={startMutation.isPending}
            onClick={async () => {
              try {
                await startMutation.mutateAsync();
                await currentAttemptQuery.refetch();
              } catch (err) {
                console.error("Failed to start exam", err);
              }
            }}
          >
            شروع آزمون
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <StudentExamTakingView
      examId={examId!}
      classroomId={classroomId!}
      examTitle={exam?.title || "آزمون کلاسی"}
      attempt={attempt}
      onExit={() => navigate(`/classrooms/${classroomId}/exams/${examId}`)}
      onSubmitSuccess={() => {
        navigate(`/classrooms/${classroomId}/exams/${examId}/results`);
      }}
    />
  );
}
