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

import { useState } from "react";
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
import { ConfirmModal } from "../common/ConfirmModal.js";
import { useDeleteExam } from "../../../hooks/useTeacher.js";
import { ApiError } from "../../../lib/api/errors.js";
import type { TeacherExamWithDetails } from "../../../lib/api/teacher.js";
import { formatPersianExamDate, formatPersianTimeOnly } from "../../../utils/date.js";
import { HelpCircle, Edit3, BarChart2, Eye, Trash2 } from "lucide-react";

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
  const [examToDelete, setExamToDelete] = useState<TeacherExamWithDetails | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMutation = useDeleteExam(classroomId);

  const handleConfirmDelete = async () => {
    if (!examToDelete) return;
    setDeleteError(null);
    try {
      await deleteMutation.mutateAsync(examToDelete.id);
      setExamToDelete(null);
    } catch (err) {
      if (err instanceof ApiError && (err.statusCode === 409 || err.code === "conflict")) {
        setDeleteError(
          err.message ||
            "این آزمون دارای شرکت‌کننده است و امکان حذف آن وجود ندارد. برای خارج کردن آزمون از دسترس، می‌توانید آن را بایگانی کنید.",
        );
      } else {
        setDeleteError(err instanceof Error ? err.message : "خطا در حذف آزمون");
      }
    }
  };

  return (
    <>
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

                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 text-xs px-2"
                        onClick={() => {
                          setDeleteError(null);
                          setExamToDelete(exam);
                        }}
                        title="حذف آزمون"
                        aria-label="حذف آزمون"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Delete Exam Confirm Modal */}
      {examToDelete && (
        <ConfirmModal
          isOpen={Boolean(examToDelete)}
          onCancel={() => {
            if (!deleteMutation.isPending) {
              setExamToDelete(null);
              setDeleteError(null);
            }
          }}
          onConfirm={handleConfirmDelete}
          title="حذف آزمون کلاسی"
          description={`آیا از حذف آزمون «${examToDelete.title}» اطمینان دارید؟ این آزمون و سوالات وابسته به آن حذف خواهند شد.`}
          confirmText="حذف قطعی"
          cancelText="انصراف"
          variant="danger"
          isProcessing={deleteMutation.isPending}
          errorMessage={deleteError}
        />
      )}
    </>
  );
}
