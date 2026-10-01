/**
 * StudentExamResultsPage.
 *
 * Page wrapper for viewing student exam results & review:
 *  - Loads student review from GET /v1/student/exams/:examId/review
 *  - Displays StudentExamResultsView
 */

import { useParams, Link } from "react-router-dom";
import {
  useStudentClassroomExams,
  useStudentExamReview,
} from "../../hooks/useStudentTeacherExams.js";
import { StudentExamResultsView } from "../../components/student-exams/StudentExamResultsView.js";
import { LoadingState, EmptyState, Button, Alert } from "../../components/ui/index.js";
import { HelpCircle } from "lucide-react";

export function StudentExamResultsPage() {
  const { classroomId, examId } = useParams<{ classroomId: string; examId: string }>();

  const examsQuery = useStudentClassroomExams(classroomId);
  const reviewQuery = useStudentExamReview(examId);

  const exam = examsQuery.data?.exams?.find((e) => e.id === examId);
  const review = reviewQuery.data?.review;

  if (reviewQuery.isLoading || examsQuery.isLoading) {
    return (
      <div className="w-full py-20 flex justify-center font-sans" dir="rtl">
        <LoadingState message="در حال دریافت کارنامه و نتایج آزمون..." />
      </div>
    );
  }

  if (reviewQuery.isError || !review) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-12 font-sans" dir="rtl">
        <EmptyState
          title="کارنامه آزمون یافت نشد"
          description="اطلاعات کارنامه این آزمون در دسترس نیست یا ممکن است شما هنوز در این آزمون شرکت نکرده باشید."
          icon={<HelpCircle className="w-12 h-12 text-[var(--color-text-muted)]" />}
          action={
            <Link to={classroomId ? `/classrooms/${classroomId}` : "/classrooms"}>
              <Button variant="primary">بازگشت به کلاس</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <StudentExamResultsView
      examTitle={exam?.title || "آزمون"}
      classroomId={classroomId!}
      review={review}
    />
  );
}
