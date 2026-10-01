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
import { StudentAssignmentStatusBadge } from "./StudentAssignmentStatusBadge.js";
import { StudentAssignmentSubmissionModal } from "./StudentAssignmentSubmissionModal.js";
import type { StudentAssignmentListItemDTO } from "../../../lib/api/student-platform.js";
import { formatPersianExamDate, formatPersianTimeOnly } from "../../../utils/date.js";
import { FileText, Send, Eye, Clock } from "lucide-react";

export interface StudentAssignmentsTableProps {
  assignments: StudentAssignmentListItemDTO[];
  isLoading: boolean;
  classroomId: string;
}

export function StudentAssignmentsTable({
  assignments,
  isLoading,
  classroomId,
}: StudentAssignmentsTableProps) {
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHead>عنوان تکلیف</TableHead>
            <TableHead>وضعیت ارسال شما</TableHead>
            <TableHead>زمان شروع</TableHead>
            <TableHead>مهلت ارسال</TableHead>
            <TableHead className="text-center">عملیات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableLoadingState
              colSpan={5}
              message="در حال دریافت لیست تکالیف..."
            />
          ) : assignments.length === 0 ? (
            <TableEmptyState
              colSpan={5}
              icon={<FileText className="w-6 h-6" />}
              message="هنوز تکلیفی برای این کلاس تعریف یا منتشر نشده است."
            />
          ) : (
            assignments.map((assignment) => {
              const hasSubmitted = assignment.hasSubmitted;
              const canSubmit = assignment.runtimeState === "active";

              return (
                <TableRow key={assignment.id}>
                  {/* Title & Description */}
                  <TableCell>
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => setSelectedAssignmentId(assignment.id)}
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
                    <StudentAssignmentStatusBadge status={assignment.studentStatus} />
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

                  {/* Action */}
                  <TableCell className="text-center">
                    {hasSubmitted ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedAssignmentId(assignment.id)}
                      >
                        <Eye className="w-3.5 h-3.5 ml-1" />
                        مشاهده پاسخ
                      </Button>
                    ) : canSubmit ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => setSelectedAssignmentId(assignment.id)}
                      >
                        <Send className="w-3.5 h-3.5 ml-1" />
                        ارسال پاسخ
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedAssignmentId(assignment.id)}
                      >
                        <Eye className="w-3.5 h-3.5 ml-1" />
                        مشاهده تکلیف
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      {/* Submission / View Modal */}
      {selectedAssignmentId && (
        <StudentAssignmentSubmissionModal
          isOpen={Boolean(selectedAssignmentId)}
          onClose={() => setSelectedAssignmentId(null)}
          assignmentId={selectedAssignmentId}
          classroomId={classroomId}
        />
      )}
    </>
  );
}
