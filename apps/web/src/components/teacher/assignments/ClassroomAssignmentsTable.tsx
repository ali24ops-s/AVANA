import { useState } from "react";
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
import { AssignmentStatusBadge } from "./AssignmentStatusBadge.js";
import { CreateEditAssignmentModal } from "./CreateEditAssignmentModal.js";
import { AssignmentSubmissionsDrawer } from "./AssignmentSubmissionsDrawer.js";
import { ConfirmModal } from "../common/ConfirmModal.js";
import {
  usePublishAssignment,
  useUnpublishAssignment,
  useArchiveAssignment,
  useDeleteAssignment,
} from "../../../hooks/useTeacherAssignments.js";
import type { TeacherAssignmentListItemDTO } from "../../../lib/api/teacher.js";
import { formatPersianExamDate, formatPersianTimeOnly } from "../../../utils/date.js";
import { toPersianDigits } from "@avana/domain";
import {
  FileText,
  Edit3,
  Eye,
  Send,
  RotateCcw,
  Archive,
  Trash2,
  Users,
} from "lucide-react";

export interface ClassroomAssignmentsTableProps {
  assignments: TeacherAssignmentListItemDTO[];
  isLoading: boolean;
  classroomId: string;
  onOpenCreateModal: () => void;
}

export function ClassroomAssignmentsTable({
  assignments,
  isLoading,
  classroomId,
  onOpenCreateModal,
}: ClassroomAssignmentsTableProps) {
  const [selectedSubmissionsAssignmentId, setSelectedSubmissionsAssignmentId] =
    useState<string | null>(null);
  const [assignmentToEdit, setAssignmentToEdit] =
    useState<TeacherAssignmentListItemDTO | null>(null);
  const [assignmentToDelete, setAssignmentToDelete] =
    useState<TeacherAssignmentListItemDTO | null>(null);
  const [assignmentToArchive, setAssignmentToArchive] =
    useState<TeacherAssignmentListItemDTO | null>(null);

  const publishMutation = usePublishAssignment(
    assignments[0]?.id ?? "",
    classroomId,
  );
  const unpublishMutation = useUnpublishAssignment(
    assignments[0]?.id ?? "",
    classroomId,
  );
  const archiveMutation = useArchiveAssignment(
    assignmentToArchive?.id ?? "",
    classroomId,
  );
  const deleteMutation = useDeleteAssignment(
    assignmentToDelete?.id ?? "",
    classroomId,
  );

  const handlePublish = async (_assignment: TeacherAssignmentListItemDTO) => {
    try {
      await publishMutation.mutateAsync(undefined);
    } catch {
      // Handled by query client
    }
  };

  const handleConfirmArchive = async () => {
    if (!assignmentToArchive) return;
    try {
      await archiveMutation.mutateAsync(undefined);
      setAssignmentToArchive(null);
    } catch {
      // Handled
    }
  };

  const handleConfirmDelete = async () => {
    if (!assignmentToDelete) return;
    try {
      await deleteMutation.mutateAsync(undefined);
      setAssignmentToDelete(null);
    } catch {
      // Handled
    }
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHead>عنوان تکلیف</TableHead>
            <TableHead>وضعیت</TableHead>
            <TableHead>زمان شروع</TableHead>
            <TableHead>مهلت ارسال</TableHead>
            <TableHead>وضعیت ارسال‌ها</TableHead>
            <TableHead className="text-center">عملیات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableLoadingState
              colSpan={6}
              message="در حال دریافت لیست تکالیف..."
            />
          ) : assignments.length === 0 ? (
            <TableEmptyState
              colSpan={6}
              icon={<FileText className="w-6 h-6" />}
              message="هنوز تکلیفی برای این کلاس تعریف نشده است."
              action={
                <Button size="sm" variant="primary" onClick={onOpenCreateModal}>
                  ایجاد اولین تکلیف
                </Button>
              }
            />
          ) : (
            assignments.map((assignment) => {
              const isDraft = assignment.status === "draft";
              const isPublished = assignment.status === "published";
              const isArchived = assignment.status === "archived";

              return (
                <TableRow key={assignment.id}>
                  {/* Title & Description */}
                  <TableCell>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedSubmissionsAssignmentId(assignment.id)
                        }
                        className="text-right font-bold text-xs sm:text-sm text-[var(--color-text)] hover:text-[#008080] transition-colors"
                      >
                        {assignment.title}
                      </button>
                      {assignment.description && (
                        <span className="text-[11px] text-[var(--color-text-muted)] line-clamp-1 mt-0.5">
                          {assignment.description}
                        </span>
                      )}
                    </div>
                  </TableCell>

                  {/* Status Badge */}
                  <TableCell>
                    <AssignmentStatusBadge status={assignment.status} />
                  </TableCell>

                  {/* Starts At */}
                  <TableCell className="text-xs text-[var(--color-text-muted)]">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-[var(--color-text)]">
                        {formatPersianExamDate(assignment.startsAt)}
                      </span>
                      <span className="text-[11px]">
                        ساعت {formatPersianTimeOnly(assignment.startsAt)}
                      </span>
                    </div>
                  </TableCell>

                  {/* Due At */}
                  <TableCell className="text-xs text-[var(--color-text-muted)]">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-[var(--color-text)]">
                        {formatPersianExamDate(assignment.dueAt)}
                      </span>
                      <span className="text-[11px]">
                        ساعت {formatPersianTimeOnly(assignment.dueAt)}
                      </span>
                    </div>
                  </TableCell>

                  {/* Submissions ratio */}
                  <TableCell className="text-xs font-semibold text-[var(--color-text)]">
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[#008080]" />
                      <span>
                        {toPersianDigits(assignment.submissionsCount)} از{" "}
                        {toPersianDigits(assignment.totalMembersCount)} ارسال شده
                      </span>
                    </div>
                  </TableCell>

                  {/* Actions */}
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      {/* View Submissions */}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setSelectedSubmissionsAssignmentId(assignment.id)
                        }
                        title="مشاهده پاسخ‌های دانشجویان"
                      >
                        <Eye className="w-3.5 h-3.5 ml-1 text-[#008080]" />
                        <span>پاسخ‌ها</span>
                      </Button>

                      {/* Edit */}
                      {!isArchived && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setAssignmentToEdit(assignment)}
                          title="ویرایش تکلیف"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </Button>
                      )}

                      {/* Delete */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => setAssignmentToDelete(assignment)}
                        title="حذف تکلیف"
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

      {/* Edit Modal */}
      {assignmentToEdit && (
        <CreateEditAssignmentModal
          isOpen={Boolean(assignmentToEdit)}
          onClose={() => setAssignmentToEdit(null)}
          classroomId={classroomId}
          assignmentToEdit={assignmentToEdit}
        />
      )}

      {/* Submissions Drawer */}
      {selectedSubmissionsAssignmentId && (
        <AssignmentSubmissionsDrawer
          isOpen={Boolean(selectedSubmissionsAssignmentId)}
          onClose={() => setSelectedSubmissionsAssignmentId(null)}
          assignmentId={selectedSubmissionsAssignmentId}
        />
      )}

      {/* Delete Confirm Modal */}
      {assignmentToDelete && (
        <ConfirmModal
          isOpen={Boolean(assignmentToDelete)}
          onCancel={() => setAssignmentToDelete(null)}
          onConfirm={handleConfirmDelete}
          title="حذف تکلیف کلاسی"
          description={`آیا از حذف تکلیف «${assignmentToDelete.title}» اطمینان دارید؟ تمام پاسخ‌های ثبت‌شده برای این تکلیف نیز حذف خواهند شد.`}
          confirmText="حذف قطعی"
          variant="danger"
          isProcessing={deleteMutation.isPending}
        />
      )}
    </>
  );
}
