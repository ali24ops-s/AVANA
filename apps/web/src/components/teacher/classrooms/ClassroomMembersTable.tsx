/**
 * ClassroomMembersTable component.
 *
 * Renders the list of enrolled students in a classroom with:
 *  - student name and email
 *  - first joined date (Persian formatted)
 *  - membership status badge
 *  - remove student action with confirmation modal
 */

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
  Badge,
  Button,
} from "../../ui/index.js";
import { useRemoveClassroomMember } from "../../../hooks/useTeacher.js";
import { ConfirmModal } from "../common/ConfirmModal.js";
import type { ClassroomMemberWithUser } from "../../../lib/api/teacher.js";
import { formatPersianExamDate } from "../../../utils/date.js";
import { ApiError } from "../../../lib/api/errors.js";
import { UserMinus, User, Users } from "lucide-react";

export interface ClassroomMembersTableProps {
  classroomId: string;
  members: ClassroomMemberWithUser[];
  isLoading: boolean;
}

export function ClassroomMembersTable({
  classroomId,
  members,
  isLoading,
}: ClassroomMembersTableProps) {
  const [selectedStudent, setSelectedStudent] = useState<ClassroomMemberWithUser | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const removeMutation = useRemoveClassroomMember(classroomId);

  const handleConfirmRemove = async () => {
    if (!selectedStudent) return;
    setRemoveError(null);

    try {
      await removeMutation.mutateAsync(selectedStudent.studentId);
      setSelectedStudent(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setRemoveError(err.message);
      } else {
        setRemoveError("خطا در حذف عضو از کلاس");
      }
    }
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHead>نام و مشخصات دانش‌آموز</TableHead>
            <TableHead>ایمیل</TableHead>
            <TableHead>تاریخ عضویت</TableHead>
            <TableHead>وضعیت عضویت</TableHead>
            <TableHead className="text-center">عملیات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableLoadingState colSpan={5} message="در حال دریافت لیست دانش‌آموزان..." />
          ) : members.length === 0 ? (
            <TableEmptyState
              colSpan={5}
              icon={<Users className="w-6 h-6" />}
              message="هنوز هیچ دانش‌آموزی با کد دعوت به این کلاس ملحق نشده است."
            />
          ) : (
            members.map((member) => {
              const fullName =
                member.user?.name?.trim() ||
                (member.user?.firstName || member.user?.lastName
                  ? `${member.user.firstName?.trim() ?? ""} ${member.user.lastName?.trim() ?? ""}`.trim()
                  : "") ||
                member.user?.email ||
                "دانش‌آموز";
              const email = member.user?.email || "نامشخص";
              const isActive = member.status === "active";

              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-semibold text-xs sm:text-sm text-[var(--color-text)]">
                          {fullName}
                        </span>
                        <span className="text-[11px] text-[var(--color-text-muted)] font-mono sm:hidden">
                          {email}
                        </span>
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="hidden sm:table-cell text-xs font-mono text-[var(--color-text-muted)]">
                    {email}
                  </TableCell>

                  <TableCell className="text-xs text-[var(--color-text-muted)]">
                    {formatPersianExamDate(member.firstJoinedAt)}
                  </TableCell>

                  <TableCell>
                    {member.status === "active" ? (
                      <Badge variant="success" size="sm">
                        عضو فعال
                      </Badge>
                    ) : member.status === "removed" ? (
                      <Badge variant="error" size="sm">
                        حذف شده
                      </Badge>
                    ) : (
                      <Badge variant="neutral" size="sm">
                        ترک کلاس
                      </Badge>
                    )}
                  </TableCell>

                  <TableCell className="text-center">
                    {isActive ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedStudent(member)}
                        className="text-red-500 hover:bg-red-500/10 hover:text-red-600 px-2 sm:px-3 text-xs"
                        leftIcon={<UserMinus className="w-3.5 h-3.5" />}
                        title="حذف از کلاس"
                      >
                        <span className="hidden sm:inline">حذف از کلاس</span>
                      </Button>
                    ) : (
                      <span className="text-[11px] text-[var(--color-text-muted)]">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Confirmation Modal to remove student */}
      {selectedStudent && (
        <ConfirmModal
          isOpen={Boolean(selectedStudent)}
          title="حذف دانش‌آموز از کلاس"
          description={`آیا از حذف "${
            selectedStudent.user?.name?.trim() ||
            (selectedStudent.user?.firstName || selectedStudent.user?.lastName
              ? `${selectedStudent.user.firstName?.trim() ?? ""} ${selectedStudent.user.lastName?.trim() ?? ""}`.trim()
              : "") ||
            selectedStudent.user?.email ||
            "این دانش‌آموز"
          }" از کلاس اطمینان دارید؟ با حذف دانش‌آموز، دسترسی وی به آزمون‌های آینده این کلاس قطع خواهد شد.`}
          confirmText="حذف دانش‌آموز"
          cancelText="انصراف"
          variant="danger"
          isProcessing={removeMutation.isPending}
          errorMessage={removeError}
          onConfirm={handleConfirmRemove}
          onCancel={() => {
            setSelectedStudent(null);
            setRemoveError(null);
          }}
        />
      )}
    </>
  );
}
