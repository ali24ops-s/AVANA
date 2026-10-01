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
import { GraduationCap, ArrowLeft, Play, RotateCw } from "lucide-react";

export function StudentClassroomExamsWidget() {
  const { data, isError, isLoading } = useAllStudentExams();

  // If loading, error, or no exams exist, quietly return null to stay non-blocking
  if (isLoading || isError || !data?.exams || data.exams.length === 0) {
    return null;
  }

  // Filter for active or upcoming exams, or incomplete attempts
  const relevantExams = data.exams.filter(
    (e) =>
      e.runtimeState === "active" ||
      e.runtimeState === "upcoming" ||
      e.attemptStatus === "in_progress",
  );

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
          const hasInProgress = exam.attemptStatus === "in_progress";

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
                  {hasInProgress && (
                    <Badge variant="warning" size="sm">
                      در حال انجام
                    </Badge>
                  )}
                </div>
                <h4 className="font-bold text-[var(--color-text)] truncate">{exam.title}</h4>
                <span className="text-[11px] text-[var(--color-text-muted)] block mt-0.5">
                  زمان: {formatPersianExamTimeRange(exam.startsAt, exam.endsAt)} ({toPersianDigits(exam.durationMinutes)} دقیقه)
                </span>
              </div>

              <div>
                {hasInProgress ? (
                  <Link to={`/classrooms/${exam.classroomId}/exams/${exam.id}/take`}>
                    <Button size="sm" variant="primary" className="bg-amber-600 hover:bg-amber-700">
                      ادامه
                      <RotateCw className="w-3.5 h-3.5 mr-1" />
                    </Button>
                  </Link>
                ) : isActive ? (
                  <Link to={`/classrooms/${exam.classroomId}/exams/${exam.id}`}>
                    <Button size="sm" variant="primary">
                      شرکت
                      <Play className="w-3.5 h-3.5 mr-1" />
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
