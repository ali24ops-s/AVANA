/**
 * StudentExamDetailPage.
 *
 * Exam introduction and overview for student before taking the exam:
 *  - Displays title, description, schedule, duration, passing score
 *  - Displays rules and instructions
 *  - Contextual CTA button based on runtime state and existing attempt
 *  - Strictly obeys one-attempt rule and backend runtime states
 */

import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  useStudentClassroomExams,
  useCurrentStudentExamAttempt,
  useStartStudentExamAttempt,
} from "../../hooks/useStudentTeacherExams.js";
import {
  PageHeader,
  Card,
  Button,
  Badge,
  LoadingState,
  EmptyState,
  Alert,
} from "../../components/ui/index.js";
import { ExamStatusBadge } from "../../components/teacher/exams/ExamStatusBadge.js";
import {
  formatPersianExamDate,
  formatPersianExamTimeRange,
  formatStudentExamScheduleNotice,
  formatPersianTimeOnly,
  formatRemainingCountdown,
} from "../../utils/date.js";
import { toPersianDigits, calculateRuntimeExamState, type RuntimeExamState } from "@avana/domain";
import { ApiError } from "../../lib/api/errors.js";
import {
  Clock,
  Calendar,
  Award,
  AlertTriangle,
  Play,
  RotateCw,
  Eye,
  CheckCircle,
  HelpCircle,
  ShieldAlert,
} from "lucide-react";

export function StudentExamDetailPage() {
  const { classroomId, examId } = useParams<{ classroomId: string; examId: string }>();
  const navigate = useNavigate();

  const [startError, setStartError] = useState<string | null>(null);
  const [now, setNow] = useState<Date>(() => new Date());

  const examsQuery = useStudentClassroomExams(classroomId);
  const currentAttemptQuery = useCurrentStudentExamAttempt(examId);
  const startMutation = useStartStudentExamAttempt(examId ?? "", classroomId);

  const exam = examsQuery.data?.exams?.find((e) => e.id === examId);
  const attempt = currentAttemptQuery.data?.attempt;

  useEffect(() => {
    if (!exam) return;
    const isCompleted =
      attempt?.status === "submitted" ||
      attempt?.status === "timed_out" ||
      exam.attemptStatus === "submitted" ||
      exam.attemptStatus === "timed_out";
    if (isCompleted) return;

    const intervalId = setInterval(() => {
      setNow(new Date());
    }, 1000);

    const handleVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        setNow(new Date());
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", handleVisibilityOrFocus);
    }

    return () => {
      clearInterval(intervalId);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", handleVisibilityOrFocus);
      }
    };
  }, [exam?.id, exam?.startsAt, exam?.endsAt, attempt?.status, exam?.attemptStatus]);

  const handleStartExam = async () => {
    if (!examId || !classroomId) return;
    setStartError(null);
    try {
      await startMutation.mutateAsync();
      navigate(`/classrooms/${classroomId}/exams/${examId}/take`);
    } catch (err) {
      if (err instanceof ApiError && (err.statusCode === 409 || err.code === "conflict")) {
        // Attempt already exists, redirect to resume or results
        navigate(`/classrooms/${classroomId}/exams/${examId}/take`);
      } else {
        setStartError(
          err instanceof Error ? err.message : "خطا در شروع آزمون. لطفاً مجدداً تلاش کنید.",
        );
      }
    }
  };

  if (examsQuery.isLoading || currentAttemptQuery.isLoading) {
    return (
      <div className="w-full py-20 flex justify-center font-sans" dir="rtl">
        <LoadingState message="در حال دریافت جزئیات آزمون..." />
      </div>
    );
  }

  if (examsQuery.isError || !exam) {
    return (
      <div className="w-full max-w-4xl mx-auto px-4 py-12 font-sans" dir="rtl">
        <EmptyState
          title="آزمون یافت نشد"
          description="اطلاعات آزمون مورد نظر در دسترس نیست یا شما مجاز به مشاهده آن نیستید."
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

  const dynamicRuntimeState: RuntimeExamState = !exam
    ? "closed"
    : exam.runtimeState === "closed"
      ? "closed"
      : calculateRuntimeExamState(
          {
            status: "published",
            startsAt: exam.startsAt,
            endsAt: exam.endsAt,
            closedAt: null,
          },
          now,
        );

  const isUpcoming = dynamicRuntimeState === "upcoming";
  const isActive = dynamicRuntimeState === "active";
  const isClosed = dynamicRuntimeState === "closed";
  const hasInProgressAttempt = attempt?.status === "in_progress";
  const isCompletedAttempt =
    attempt?.status === "submitted" ||
    attempt?.status === "timed_out" ||
    exam.attemptStatus === "submitted" ||
    exam.attemptStatus === "timed_out";

  const startsAtMs = exam ? new Date(exam.startsAt).getTime() : 0;
  const msUntilStart = Math.max(0, startsAtMs - now.getTime());
  const secondsUntilStart = Math.ceil(msUntilStart / 1000);

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 font-sans" dir="rtl">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] mb-4">
        <Link to="/classrooms" className="hover:text-[#008080] transition-colors">
          کلاس‌های من
        </Link>
        <span>/</span>
        <Link
          to={`/classrooms/${classroomId}`}
          className="hover:text-[#008080] transition-colors line-clamp-1"
        >
          کلاس
        </Link>
        <span>/</span>
        <span className="text-[var(--color-text)] font-semibold line-clamp-1">{exam.title}</span>
      </div>

      {/* Header */}
      <PageHeader
        title={exam.title}
        description={exam.description ?? "آزمون کلاسی"}
        actions={
          <ExamStatusBadge
            exam={{
              status: "published",
              startsAt: exam.startsAt,
              endsAt: exam.endsAt,
              closedAt: dynamicRuntimeState === "closed" ? "closed" : null,
            }}
          />
        }
      />

      {startError && (
        <div className="mt-4">
          <Alert variant="error" title="خطا در شروع آزمون">
            {startError}
          </Alert>
        </div>
      )}

      {/* Schedule Notice / Upcoming Countdown Banner */}
      {isUpcoming && !hasInProgressAttempt && !isCompletedAttempt ? (
        <div className="mt-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm text-amber-900">
          <div className="flex items-center gap-3 font-semibold">
            <Clock className="w-5 h-5 shrink-0 text-amber-600 animate-pulse" />
            <span>
              شروع آزمون از ساعت {formatPersianTimeOnly(exam.startsAt)} امکان‌پذیر است.
            </span>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto bg-amber-500/15 px-3 py-1.5 rounded-xl border border-amber-500/30 text-amber-950 font-bold font-mono text-xs sm:text-sm">
            <span>زمان باقیمانده تا شروع:</span>
            <span dir="ltr">{formatRemainingCountdown(secondsUntilStart)}</span>
          </div>
        </div>
      ) : (
        <div className="mt-4 p-4 rounded-2xl bg-[#008080]/10 border border-[#008080]/20 flex items-center gap-3 text-xs sm:text-sm font-semibold text-[#008080]">
          <Calendar className="w-5 h-5 shrink-0 text-[#008080]" />
          <span>{formatStudentExamScheduleNotice(exam.startsAt, exam.endsAt)}</span>
        </div>
      )}

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
        <Card className="p-4 border border-[var(--color-border)] rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-[var(--color-text-muted)] block">مدت زمان آزمون</span>
            <span className="text-sm font-bold text-[var(--color-text)]">
              {exam.durationMinutes ? `${toPersianDigits(exam.durationMinutes)} دقیقه` : "نامحدود (کل بازه)"}
            </span>
          </div>
        </Card>

        <Card className="p-4 border border-[var(--color-border)] rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-[var(--color-text-muted)] block">زمان برگزاری</span>
            <span className="text-xs sm:text-sm font-bold text-[var(--color-text)] leading-snug">
              {formatPersianExamTimeRange(exam.startsAt, exam.endsAt)}
            </span>
          </div>
        </Card>

        <Card className="p-4 border border-[var(--color-border)] rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <span className="text-xs text-[var(--color-text-muted)] block">نمره قبولی</span>
            <span className="text-sm font-bold text-[var(--color-text)]">
              {exam.passingScorePercentage !== null && exam.passingScorePercentage !== undefined
                ? `${toPersianDigits(exam.passingScorePercentage)} درصد`
                : "بدون حد نصاب"}
            </span>
          </div>
        </Card>
      </div>

      {/* Instructions & Guidelines */}
      <Card className="mt-6 p-6 border border-[var(--color-border)] rounded-2xl bg-[var(--color-surface)] space-y-4">
        <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-[#008080]" />
          قوانین و نکات مهم پیش از شروع آزمون
        </h3>

        <ul className="text-xs sm:text-sm text-[var(--color-text-muted)] space-y-2.5 list-disc list-inside leading-relaxed">
          <li>
            <strong>تک‌فرصت بودن آزمون:</strong> هر دانشجو فقط یک بار مجاز به شرکت در این آزمون است و امکان شروع مجدد پس از ثبت یا انقضا وجود ندارد.
          </li>
          <li>
            <strong>زمان‌سنجی آزمون:</strong> به محض کلیک بر روی دکمه «شروع آزمون»، زمان‌سنج آغاز می‌شود و بستن مرورگر یا قطع اینترنت زمان آزمون را متوقف نمی‌کند.
          </li>
          <li>
            <strong>ذخیره خودکار پاسخ‌ها:</strong> هر گزینه‌ای که انتخاب می‌کنید بلافاصله در سرور ذخیره می‌شود و در صورت رفرش یا خروج موقت، پاسخ‌های قبلی حفظ خواهند شد.
          </li>
          <li>
            <strong>ارسال در مهلت مقرر:</strong> پیش از اتمام مهلت آزمون، حتماً با زدن دکمه «ثبت نهایی» آزمون خود را تکمیل فرمایید.
          </li>
        </ul>

        {/* Existing Attempt Notice if applicable */}
        {isActive && hasInProgressAttempt && (
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-800 text-xs sm:text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>
              شما یک تلاش ناتمام در این آزمون دارید. می‌توانید بدون از دست رفتن پاسخ‌های قبلی، آزمون را ادامه دهید.
            </span>
          </div>
        )}

        {(isCompletedAttempt || (isClosed && (hasInProgressAttempt || Boolean(attempt) || Boolean(exam.hasAttempt)))) && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 text-xs sm:text-sm flex items-center gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>
              شما قبلاً در این آزمون شرکت کرده‌اید و پاسخ‌های شما ثبت شده است.
            </span>
          </div>
        )}
      </Card>

      {/* CTA Footer */}
      <div className="mt-8 flex items-center justify-between gap-4 p-4 border border-[var(--color-border)] rounded-2xl bg-[var(--color-surface)]">
        <Link to={`/classrooms/${classroomId}`}>
          <Button variant="outline" size="md">
            بازگشت به کلاس
          </Button>
        </Link>

        <div>
          {isUpcoming && !hasInProgressAttempt && !isCompletedAttempt ? (
            <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
              <span className="text-xs text-[var(--color-text-muted)] font-medium">
                شروع آزمون از ساعت {formatPersianTimeOnly(exam.startsAt)} امکان‌پذیر است.
              </span>
              <Button
                variant="primary"
                size="md"
                disabled
                title={`شروع آزمون از ساعت ${formatPersianTimeOnly(exam.startsAt)} امکان‌پذیر است.`}
                aria-label="شروع آزمون"
              >
                <Play className="w-4 h-4 ml-1" />
                شروع آزمون
              </Button>
            </div>
          ) : isClosed ? (
            isCompletedAttempt || hasInProgressAttempt || Boolean(attempt) || Boolean(exam.hasAttempt) ? (
              <Link to={`/classrooms/${classroomId}/exams/${exam.id}/results`}>
                <Button variant="primary" size="md">
                  <Eye className="w-4 h-4 ml-1" />
                  مشاهده کارنامه / نتیجه
                </Button>
              </Link>
            ) : (
              <Button variant="outline" size="md" disabled>
                مهلت آزمون به پایان رسیده است
              </Button>
            )
          ) : isCompletedAttempt ? (
            <Link to={`/classrooms/${classroomId}/exams/${exam.id}/results`}>
              <Button variant="primary" size="md">
                <Eye className="w-4 h-4 ml-1" />
                مشاهده کارنامه / نتیجه
              </Button>
            </Link>
          ) : hasInProgressAttempt ? (
            <Link to={`/classrooms/${classroomId}/exams/${exam.id}/take`}>
              <Button
                variant="primary"
                size="md"
                className="bg-amber-600 hover:bg-amber-700"
              >
                <RotateCw className="w-4 h-4 ml-1" />
                ادامه آزمون
              </Button>
            </Link>
          ) : isActive ? (
            <Button
              variant="primary"
              size="md"
              onClick={handleStartExam}
              isLoading={startMutation.isPending}
              disabled={startMutation.isPending}
            >
              <Play className="w-4 h-4 ml-1" />
              شروع آزمون
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
