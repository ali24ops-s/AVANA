import { useParams, Link } from "react-router-dom";
import {
  useStudentClassroomExams,
  useStudentExamReview,
} from "../../hooks/useStudentTeacherExams.js";
import { StudentExamResultsView } from "../../components/student-exams/StudentExamResultsView.js";
import { LoadingState, EmptyState, Button } from "../../components/ui/index.js";
import { ApiError } from "../../lib/api/errors.js";
import { HelpCircle, AlertCircle, UserX, Clock, RotateCw } from "lucide-react";

export function StudentExamResultsPage() {
  const { classroomId, examId } = useParams<{ classroomId: string; examId: string }>();

  const examsQuery = useStudentClassroomExams(classroomId);
  const exam = examsQuery.data?.exams?.find((e) => e.id === examId);
  const hasAttempt = exam ? exam.hasAttempt : undefined;

  const reviewQuery = useStudentExamReview(hasAttempt === false ? undefined : examId);
  const review = reviewQuery.data?.review;

  // 1. Loading State
  if (examsQuery.isLoading || (hasAttempt !== false && reviewQuery.isLoading)) {
    return (
      <div className="w-full py-20 flex justify-center font-sans" dir="rtl">
        <LoadingState message="در حال دریافت کارنامه و نتایج آزمون..." />
      </div>
    );
  }

  // 2. Exam List Loaded, but Exam Not Found
  if (!examsQuery.isLoading && !exam && !reviewQuery.error && !review) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-12 font-sans" dir="rtl">
        <EmptyState
          title="این آزمون دیگر در دسترس نیست"
          description="این آزمون دیگر در دسترس نیست."
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

  // 3. Known Exam Without Attempt (from Classroom Exam List)
  if (exam && !exam.hasAttempt) {
    if (exam.runtimeState === "closed") {
      return (
        <div className="w-full max-w-4xl mx-auto px-4 py-12 font-sans" dir="rtl">
          <EmptyState
            title="شما در این آزمون شرکت نکرده‌اید"
            description="زمان شرکت در این آزمون به پایان رسیده است و برای شما پاسخی ثبت نشده است."
            icon={<UserX className="w-12 h-12 text-[var(--color-text-muted)]" />}
            action={
              <Link to={classroomId ? `/classrooms/${classroomId}` : "/classrooms"}>
                <Button variant="primary">بازگشت به کلاس</Button>
              </Link>
            }
          />
        </div>
      );
    }

    if (exam.runtimeState === "active") {
      return (
        <div className="w-full max-w-4xl mx-auto px-4 py-12 font-sans" dir="rtl">
          <EmptyState
            title="آزمون در حال برگزاری است"
            description="شما هنوز در این آزمون شرکت نکرده‌اید. برای شروع آزمون وارد صفحه آزمون شوید."
            icon={<Clock className="w-12 h-12 text-[#008080]" />}
            action={
              <Link to={`/classrooms/${classroomId}/exams/${examId}`}>
                <Button variant="primary">ورود به آزمون</Button>
              </Link>
            }
          />
        </div>
      );
    }

    // Upcoming exam without attempt
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-12 font-sans" dir="rtl">
        <EmptyState
          title="آزمون هنوز شروع نشده است"
          description="این آزمون در زمان مشخص‌شده آغاز خواهد شد."
          icon={<Clock className="w-12 h-12 text-[var(--color-text-muted)]" />}
          action={
            <Link to={classroomId ? `/classrooms/${classroomId}` : "/classrooms"}>
              <Button variant="primary">بازگشت به کلاس</Button>
            </Link>
          }
        />
      </div>
    );
  }

  // 4. API Error Handling with Distinct Domain Reasons
  if (reviewQuery.isError || !review) {
    const error = reviewQuery.error;
    let reason: string | undefined = undefined;
    let statusCode: number | undefined = undefined;

    if (error instanceof ApiError) {
      statusCode = error.statusCode;
      reason = (error.details as Record<string, string> | undefined)?.reason;
    }

    // 4.1. Student has not participated
    if (reason === "EXAM_NOT_ATTEMPTED") {
      if (exam?.runtimeState === "active") {
        return (
          <div className="w-full max-w-4xl mx-auto px-4 py-12 font-sans" dir="rtl">
            <EmptyState
              title="آزمون در حال برگزاری است"
              description="شما هنوز در این آزمون شرکت نکرده‌اید. برای شروع آزمون وارد صفحه آزمون شوید."
              icon={<Clock className="w-12 h-12 text-[#008080]" />}
              action={
                <Link to={`/classrooms/${classroomId}/exams/${examId}`}>
                  <Button variant="primary">ورود به آزمون</Button>
                </Link>
              }
            />
          </div>
        );
      }
      return (
        <div className="w-full max-w-4xl mx-auto px-4 py-12 font-sans" dir="rtl">
          <EmptyState
            title="شما در این آزمون شرکت نکرده‌اید"
            description="زمان شرکت در این آزمون به پایان رسیده است و برای شما پاسخی ثبت نشده است."
            icon={<UserX className="w-12 h-12 text-[var(--color-text-muted)]" />}
            action={
              <Link to={classroomId ? `/classrooms/${classroomId}` : "/classrooms"}>
                <Button variant="primary">بازگشت به کلاس</Button>
              </Link>
            }
          />
        </div>
      );
    }

    // 4.2. Attempt is currently in progress
    if (reason === "ATTEMPT_IN_PROGRESS") {
      return (
        <div className="w-full max-w-4xl mx-auto px-4 py-12 font-sans" dir="rtl">
          <EmptyState
            title="آزمون شما هنوز پایان نیافته است"
            description="شما یک تلاش ناتمام در این آزمون دارید. برای تکمیل آزمون وارد صفحه پاسخ‌دهی شوید."
            icon={<Clock className="w-12 h-12 text-amber-600" />}
            action={
              <Link to={`/classrooms/${classroomId}/exams/${examId}/take`}>
                <Button variant="primary" className="bg-amber-600 hover:bg-amber-700">
                  <RotateCw className="w-4 h-4 ml-1" />
                  ادامه آزمون
                </Button>
              </Link>
            }
          />
        </div>
      );
    }

    // 4.3. Access denied / Membership invalid
    if (reason === "ACCESS_DENIED" || statusCode === 403) {
      return (
        <div className="w-full max-w-4xl mx-auto px-4 py-12 font-sans" dir="rtl">
          <EmptyState
            title="عدم دسترسی به نتیجه آزمون"
            description="دسترسی شما به نتیجه این آزمون در حال حاضر امکان‌پذیر نیست."
            icon={<UserX className="w-12 h-12 text-[var(--color-text-muted)]" />}
            action={
              <Link to={classroomId ? `/classrooms/${classroomId}` : "/classrooms"}>
                <Button variant="primary">بازگشت به کلاس</Button>
              </Link>
            }
          />
        </div>
      );
    }

    // 4.4. Exam deleted / unavailable
    if (reason === "EXAM_UNAVAILABLE") {
      return (
        <div className="w-full max-w-4xl mx-auto px-4 py-12 font-sans" dir="rtl">
          <EmptyState
            title="این آزمون دیگر در دسترس نیست"
            description="این آزمون دیگر در دسترس نیست."
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

    // 4.5. Result data missing unexpectedly
    if (reason === "RESULT_MISSING") {
      return (
        <div className="w-full max-w-4xl mx-auto px-4 py-12 font-sans" dir="rtl">
          <EmptyState
            title="اطلاعات نتیجه در دسترس نیست"
            description="اطلاعات نتیجه این آزمون در حال حاضر در دسترس نیست."
            icon={<AlertCircle className="w-12 h-12 text-amber-500" />}
            action={
              <Link to={classroomId ? `/classrooms/${classroomId}` : "/classrooms"}>
                <Button variant="primary">بازگشت به کلاس</Button>
              </Link>
            }
          />
        </div>
      );
    }

    // 4.6. Genuine Unexpected Server / Network Error
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-12 font-sans" dir="rtl">
        <EmptyState
          title="خطا در دریافت نتیجه"
          description="دریافت نتیجه آزمون با مشکل مواجه شد. لطفاً دوباره تلاش کنید."
          icon={<AlertCircle className="w-12 h-12 text-rose-500" />}
          action={
            <div className="flex items-center gap-3">
              <Button variant="primary" onClick={() => reviewQuery.refetch()}>
                تلاش مجدد
              </Button>
              <Link to={classroomId ? `/classrooms/${classroomId}` : "/classrooms"}>
                <Button variant="outline">بازگشت به کلاس</Button>
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  // 5. Successful Review View
  return (
    <StudentExamResultsView
      examTitle={exam?.title || "آزمون"}
      classroomId={classroomId!}
      review={review}
    />
  );
}
