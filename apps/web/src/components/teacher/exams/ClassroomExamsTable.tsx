/**
 * ClassroomExamsTable component.
 *
 * Renders the table of exams belonging to a classroom:
 *  - Title and question count
 *  - Schedule (Persian formatted start/end dates)
 *  - Duration
 *  - Persisted status & dynamic runtime state badge
 *  - Contextual action buttons (Edit, View Detail, View Results)
 */

import { Link } from "react-router-dom";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmptyState,
  TableLoadingState,
  Button,
} from "../../ui/index.js";
import { ExamStatusBadge } from "./ExamStatusBadge.js";
import type { TeacherExamWithDetails } from "../../../lib/api/teacher.js";
import { formatPersianExamDate, formatPersianTimeOnly } from "../../../utils/date.js";
import { HelpCircle, Edit3, BarChart2, Eye } from "lucide-react";

export interface ClassroomExamsTableProps {
  exams: TeacherExamWithDetails[];
  isLoading: boolean;
  classroomId: string;
}

export function ClassroomExamsTable({
  exams,
  isLoading,
  classroomId,
}: ClassroomExamsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow hoverable={false}>
          <TableHead>عنوان آزمون</TableHead>
          <TableHead>وضعیت آزمون</TableHead>
          <TableHead>تعداد سوالات</TableHead>
          <TableHead>مدت زمان</TableHead>
          <TableHead>بازه زمانی برگزاری</TableHead>
          <TableHead className="text-center">عملیات</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableLoadingState colSpan={6} message="در حال دریافت لیست آزمون‌ها..." />
        ) : exams.length === 0 ? (
          <TableEmptyState
            colSpan={6}
            icon={<HelpCircle className="w-6 h-6" />}
            message="هنوز آزمونی برای این کلاس تعریف نشده است."
            action={
              <Link to={`/teacher/classrooms/${classroomId}/exams/new`}>
                <Button size="sm" variant="primary">
                  تعریف اولین آزمون
                </Button>
              </Link>
            }
          />
        ) : (
          exams.map((exam) => {
            const isDraft = exam.status === "draft";

            return (
              <TableRow key={exam.id}>
                <TableCell>
                  <div className="flex flex-col">
                    <Link
                      to={`/teacher/exams/${exam.id}`}
                      className="font-bold text-xs sm:text-sm text-[var(--color-text)] hover:text-[#008080] transition-colors"
                    >
                      {exam.title}
                    </Link>
                    {exam.description && (
                      <span className="text-[11px] text-[var(--color-text-muted)] line-clamp-1 mt-0.5">
                        {exam.description}
                      </span>
                    )}
                  </div>
                </TableCell>

                <TableCell>
                  <ExamStatusBadge exam={exam} size="sm" />
                </TableCell>

                <TableCell className="text-xs font-semibold text-[var(--color-text)]">
                  {exam.questionsCount.toLocaleString("fa-IR")} سوال
                </TableCell>

                <TableCell className="text-xs text-[var(--color-text-muted)]">
                  {exam.durationMinutes ? `${exam.durationMinutes.toLocaleString("fa-IR")} دقیقه` : "نامحدود"}
                </TableCell>

                <TableCell className="text-xs text-[var(--color-text-muted)]">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-[var(--color-text)]">{formatPersianExamDate(exam.startsAt)}</span>
                    <span className="text-[11px]">ساعت {formatPersianTimeOnly(exam.startsAt)} تا {formatPersianTimeOnly(exam.endsAt)}</span>
                  </div>
                </TableCell>

                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1 sm:gap-1.5 flex-wrap">
                    {isDraft ? (
                      <Link to={`/teacher/exams/${exam.id}/edit`}>
                        <Button
                          variant="secondary"
                          size="sm"
                          leftIcon={<Edit3 className="w-3.5 h-3.5" />}
                          className="text-xs px-2.5"
                        >
                          ویرایش
                        </Button>
                      </Link>
                    ) : (
                      <Link to={`/teacher/exams/${exam.id}/results`}>
                        <Button
                          variant="outline"
                          size="sm"
                          leftIcon={<BarChart2 className="w-3.5 h-3.5 text-[#008080]" />}
                          className="text-xs px-2.5"
                        >
                          نتایج
                        </Button>
                      </Link>
                    )}

                    <Link to={`/teacher/exams/${exam.id}`}>
                      <Button
                        variant="ghost"
                        size="sm"
                        leftIcon={<Eye className="w-3.5 h-3.5" />}
                        className="text-xs px-2"
                        title="مشاهده جزئیات آزمون"
                      >
                        <span className="hidden sm:inline">جزئیات</span>
                      </Button>
                    </Link>
                  </div>
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}
