/**
 * StudentClassroomExamsWidget.
 *
 * Lightweight, non-blocking dashboard card displaying student's active or upcoming
 * classroom exams.
 */

import { Link } from "react-router-dom";
import { useAllStudentExams } from "../../hooks/useStudentTeacherExams.js";
import { ExamStatusBadge } from "../teacher/exams/ExamStatusBadge.js";
import { Card, Button, Badge } from "../ui/index.js";
import { formatPersianExamTimeRange } from "../../utils/date.js";
import { toPersianDigits } from "@avana/domain";
import { GraduationCap, ArrowLeft, Play, RotateCw, Eye } from "lucide-react";

const RETENTION_AFTER_END_MS = 24 * 60 * 60 * 1000; // 24 hours

export function StudentClassroomExamsWidget() {
  const { data, isError, isLoading } = useAllStudentExams();

  // If loading, error, or no exams exist, quietly return null to stay non-blocking
  if (isLoading || isError || !data?.exams || data.exams.length === 0) {
    return null;
  }

  const nowMs = Date.now();

  // Filter: Active, Upcoming, or Closed within the last 24 hours
  const relevantExams = data.exams.filter((e) => {
    if (e.runtimeState === "active" || e.runtimeState === "upcoming") {
      return true;
    }
    if (e.runtimeState === "closed") {
      const endMs = new Date(e.endsAt).getTime();
      return nowMs - endMs <= RETENTION_AFTER_END_MS;
    }
    return false;
  });

  if (relevantExams.length === 0) {
    return null;
  }

  return (
    <Card className="bg-[var(--color-surface)] p-6 rounded-2xl border border-[var(--color-border)] shadow-xs space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-[#008080]" />
          <span>آزمون‌های کلاسی فعال</span>
        </h3>
        <Link
          to="/classrooms"
          className="text-xs text-[#008080] hover:underline flex items-center gap-1 font-semibold"
        >
          <span>همه کلاس‌ها</span>
          <ArrowLeft className="w-3.5 h-3.5" />
        </Link>
      </div>

      <div className="space-y-3">
        {relevantExams.slice(0, 3).map((exam) => {
          const isActive = exam.runtimeState === "active";
          const isClosed = exam.runtimeState === "closed";
          const hasAttempt = Boolean(exam.hasAttempt);
          const hasInProgress = hasAttempt && exam.attemptStatus === "in_progress";
          const isCompleted =
            hasAttempt && (exam.attemptStatus === "submitted" || exam.attemptStatus === "timed_out");

          return (
            <div
              key={exam.id}
              className="p-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-default)] flex items-center justify-between gap-3 text-xs"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <ExamStatusBadge
                    exam={{
                      status: "published",
                      startsAt: exam.startsAt,
                      endsAt: exam.endsAt,
                      closedAt: null,
                    }}
                    size="sm"
                  />
                  {isActive && hasInProgress && (
                    <Badge variant="warning" size="sm">
                      در حال انجام
                    </Badge>
                  )}
                  {isActive && isCompleted && (
                    <Badge variant="success" size="sm">
                      ثبت شده
                    </Badge>
                  )}
                  {isClosed && hasAttempt && (
                    <Badge variant="success" size="sm">
                      پایان یافته
                    </Badge>
                  )}
                  {isClosed && !hasAttempt && (
                    <Badge variant="neutral" size="sm">
                      شرکت نکرده
                    </Badge>
                  )}
                </div>
                <h4 className="font-bold text-[var(--color-text)] truncate">{exam.title}</h4>
                <span className="text-[11px] text-[var(--color-text-muted)] block mt-0.5">
                  زمان: {formatPersianExamTimeRange(exam.startsAt, exam.endsAt)} ({toPersianDigits(exam.durationMinutes)} دقیقه)
                </span>
              </div>

              <div>
                {isActive && hasInProgress ? (
                  <Link to={`/classrooms/${exam.classroomId}/exams/${exam.id}/take`}>
                    <Button size="sm" variant="primary" className="bg-amber-600 hover:bg-amber-700">
                      ادامه
                      <RotateCw className="w-3.5 h-3.5 mr-1" />
                    </Button>
                  </Link>
                ) : isActive && isCompleted ? (
                  <Link to={`/classrooms/${exam.classroomId}/exams/${exam.id}/results`}>
                    <Button size="sm" variant="outline">
                      <Eye className="w-3.5 h-3.5 ml-1" />
                      مشاهده نتیجه
                    </Button>
                  </Link>
                ) : isActive && !hasAttempt ? (
                  <Link to={`/classrooms/${exam.classroomId}/exams/${exam.id}`}>
                    <Button size="sm" variant="primary">
                      شرکت
                      <Play className="w-3.5 h-3.5 mr-1" />
                    </Button>
                  </Link>
                ) : isClosed && hasAttempt ? (
                  <Link to={`/classrooms/${exam.classroomId}/exams/${exam.id}/results`}>
                    <Button size="sm" variant="outline">
                      <Eye className="w-3.5 h-3.5 ml-1" />
                      مشاهده نتیجه
                    </Button>
                  </Link>
                ) : isClosed && !hasAttempt ? (
                  <Link to={`/classrooms/${exam.classroomId}/exams/${exam.id}/results`}>
                    <Button size="sm" variant="outline">
                      مشاهده
                    </Button>
                  </Link>
                ) : (
                  <Link to={`/classrooms/${exam.classroomId}/exams/${exam.id}`}>
                    <Button size="sm" variant="outline">
                      مشاهده
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
