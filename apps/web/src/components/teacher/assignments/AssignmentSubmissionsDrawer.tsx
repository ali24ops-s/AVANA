import { useState } from "react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Badge,
  Card,
  LoadingState,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableEmptyState,
} from "../../ui/index.js";
import { useTeacherAssignmentSubmissions } from "../../../hooks/useTeacherAssignments.js";
import { AssignmentStatusBadge } from "./AssignmentStatusBadge.js";
import { formatPersianExamDate, formatPersianTimeOnly } from "../../../utils/date.js";
import { toPersianDigits } from "@avana/domain";
import {
  FileText,
  Users,
  CheckCircle2,
  Clock,
  Eye,
  Calendar,
} from "lucide-react";

export interface AssignmentSubmissionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  assignmentId: string;
}

export function AssignmentSubmissionsDrawer({
  isOpen,
  onClose,
  assignmentId,
}: AssignmentSubmissionsDrawerProps) {
  const { data, isLoading, error } = useTeacherAssignmentSubmissions(
    isOpen ? assignmentId : undefined,
  );

  const [selectedStudentAnswer, setSelectedStudentAnswer] = useState<{
    studentName: string;
    studentEmail: string;
    answerText: string;
    submittedAt: string;
  } | null>(null);

  if (!isOpen) return null;

  const assignment = data?.assignment;
  const submissions = data?.submissions ?? [];
  const stats = data?.stats ?? { submittedCount: 0, totalStudentsCount: 0 };
  const notSubmittedCount = Math.max(
    0,
    stats.totalStudentsCount - stats.submittedCount,
  );

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="xl"
        ariaLabel={assignment ? assignment.title : "پاسخ‌های تکلیف کلاسی"}
      >
        <DialogHeader onClose={onClose}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)] leading-snug">
                {assignment ? assignment.title : "پاسخ‌های تکلیف کلاسی"}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                مشاهده وضعیت ارسال و بررسی متن پاسخ دانشجویان این کلاس
              </p>
            </div>
          </div>
        </DialogHeader>

        <DialogContent>
          <div className="space-y-6 font-sans text-right" dir="rtl">
            {isLoading ? (
              <div className="py-16 flex justify-center">
                <LoadingState message="در حال دریافت اطلاعات ارسال‌ها..." />
              </div>
            ) : error || !assignment ? (
              <div className="p-4 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200">
                خطا در دریافت اطلاعات تکلیف یا دسترسی غیرمجاز.
              </div>
            ) : (
              <>
                {/* Assignment Overview Card */}
                <Card className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <AssignmentStatusBadge status={assignment.status} />
                      <span className="text-xs text-[var(--color-text-muted)]">
                        ایجاد شده در {formatPersianExamDate(assignment.createdAt)}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5 text-[#008080]" />
                        شروع: {formatPersianExamDate(assignment.startsAt)} ساعت {formatPersianTimeOnly(assignment.startsAt)}
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        مهلت: {formatPersianExamDate(assignment.dueAt)} ساعت {formatPersianTimeOnly(assignment.dueAt)}
                      </span>
                    </div>
                  </div>

                  {assignment.description && (
                    <div className="pt-2 border-t border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text)] leading-relaxed whitespace-pre-wrap">
                      {assignment.description}
                    </div>
                  )}
                </Card>

                {/* Stats Summary */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Card className="p-3.5 border border-[var(--color-border)] rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        کل دانشجویان کلاس
                      </span>
                      <p className="text-lg font-bold text-[var(--color-text)] mt-0.5">
                        {toPersianDigits(stats.totalStudentsCount)} نفر
                      </p>
                    </div>
                    <Users className="w-6 h-6 text-slate-400" />
                  </Card>

                  <Card className="p-3.5 border border-emerald-200 bg-emerald-50/50 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs text-emerald-800">
                        ارسال شده
                      </span>
                      <p className="text-lg font-bold text-emerald-700 mt-0.5">
                        {toPersianDigits(stats.submittedCount)} نفر
                      </p>
                    </div>
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  </Card>

                  <Card className="p-3.5 border border-slate-200 bg-slate-50 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        ارسال نشده
                      </span>
                      <p className="text-lg font-bold text-slate-700 mt-0.5">
                        {toPersianDigits(notSubmittedCount)} نفر
                      </p>
                    </div>
                    <Clock className="w-6 h-6 text-slate-400" />
                  </Card>
                </div>

                {/* Submissions Table */}
                <div className="space-y-2">
                  <h4 className="text-sm font-bold text-[var(--color-text)]">
                    لیست دانشجویان و وضعیت ارسال
                  </h4>

                  <Table>
                    <TableHeader>
                      <TableRow hoverable={false}>
                        <TableHead>نام و ایمیل دانشجو</TableHead>
                        <TableHead>وضعیت ارسال</TableHead>
                        <TableHead>زمان ارسال پاسخ</TableHead>
                        <TableHead className="text-center">مشاهده پاسخ</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {submissions.length === 0 ? (
                        <TableEmptyState
                          colSpan={4}
                          icon={<Users className="w-6 h-6" />}
                          message="هیچ دانشجویی در این کلاس عضو نیست."
                        />
                      ) : (
                        submissions.map((item) => (
                          <TableRow key={item.studentId}>
                            <TableCell>
                              <div className="flex flex-col">
                                <span className="text-xs sm:text-sm font-semibold text-[var(--color-text)]">
                                  {item.studentName}
                                </span>
                                <span className="text-[11px] text-[var(--color-text-muted)]">
                                  {item.studentEmail}
                                </span>
                              </div>
                            </TableCell>

                            <TableCell>
                              {item.submitted ? (
                                <Badge variant="success" size="sm">
                                  ارسال شده
                                </Badge>
                              ) : (
                                <Badge variant="neutral" size="sm">
                                  ارسال نشده
                                </Badge>
                              )}
                            </TableCell>

                            <TableCell className="text-xs text-[var(--color-text-muted)]">
                              {item.submission
                                ? `${formatPersianExamDate(
                                    item.submission.submittedAt,
                                  )} ساعت ${formatPersianTimeOnly(
                                    item.submission.submittedAt,
                                  )}`
                                : "—"}
                            </TableCell>

                            <TableCell className="text-center">
                              {item.submission ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() =>
                                    setSelectedStudentAnswer({
                                      studentName: item.studentName,
                                      studentEmail: item.studentEmail,
                                      answerText: item.submission!.answerText,
                                      submittedAt: item.submission!.submittedAt,
                                    })
                                  }
                                >
                                  <Eye className="w-3.5 h-3.5 ml-1 text-[#008080]" />
                                  باز کردن پاسخ
                                </Button>
                              ) : (
                                <span className="text-xs text-[var(--color-text-muted)]">
                                  پاسخی ثبت نشده
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </DialogContent>

        <DialogFooter>
          <div className="flex justify-end w-full">
            <Button variant="outline" size="sm" onClick={onClose}>
              بستن
            </Button>
          </div>
        </DialogFooter>
      </Dialog>

      {/* Student Answer Detail Dialog */}
      {selectedStudentAnswer && (
        <Dialog
          isOpen={Boolean(selectedStudentAnswer)}
          onClose={() => setSelectedStudentAnswer(null)}
          maxWidth="lg"
          ariaLabel={`پاسخ دانشجو: ${selectedStudentAnswer.studentName}`}
        >
          <DialogHeader onClose={() => setSelectedStudentAnswer(null)}>
            <div>
              <h3 className="text-base font-bold text-[var(--color-text)]">
                پاسخ دانشجو: {selectedStudentAnswer.studentName}
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                ارسال شده در {formatPersianExamDate(selectedStudentAnswer.submittedAt)} ساعت {formatPersianTimeOnly(selectedStudentAnswer.submittedAt)}
              </p>
            </div>
          </DialogHeader>

          <DialogContent>
            <div className="space-y-4 font-sans text-right" dir="rtl">
              <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] max-h-[60vh] overflow-y-auto">
                <h5 className="text-xs font-bold text-[var(--color-text-muted)] mb-2">
                  متن پاسخ ثبت‌شده:
                </h5>
                <p className="text-sm text-[var(--color-text)] leading-relaxed whitespace-pre-wrap font-sans select-text">
                  {selectedStudentAnswer.answerText}
                </p>
              </div>
            </div>
          </DialogContent>

          <DialogFooter>
            <div className="flex justify-end w-full">
              <Button
                variant="primary"
                size="sm"
                onClick={() => setSelectedStudentAnswer(null)}
              >
                بستن
              </Button>
            </div>
          </DialogFooter>
        </Dialog>
      )}
    </>
  );
}
