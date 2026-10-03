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
import { ApiError } from "../../../lib/api/errors.js";
import { MarkdownRenderer } from "../../markdown/MarkdownRenderer.js";
import {
  FileText,
  Users,
  CheckCircle2,
  Clock,
  Eye,
  Calendar,
  Paperclip,
  Download,
  AlertCircle,
  RotateCcw,
} from "lucide-react";

export interface AssignmentSubmissionsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  assignmentId: string;
}

export function getAssignmentErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "not_found") {
      if (error.message && error.message.includes("کلاس")) {
        return "کلاس مورد نظر یافت نشد یا دسترسی به آن امکان‌پذیر نیست.";
      }
      return "تکلیف مورد نظر یافت نشد یا ممکن است حذف شده باشد.";
    }
    if (error.code === "forbidden") {
      return "شما مجوز لازم برای مشاهده پاسخ‌های این تکلیف را ندارید.";
    }
    if (error.code === "unauthorized") {
      return "نشست کاربری شما منقضی شده است. لطفاً دوباره وارد حساب کاربری خود شوید.";
    }
    if (error.code === "bad_request") {
      return "شناسه یا اطلاعات درخواست تکلیف نامعتبر است.";
    }
    if (error.statusCode >= 500) {
      return "خطا در دریافت اطلاعات تکلیف از سرور. لطفاً دوباره تلاش کنید.";
    }
    if (error.message && error.message !== "An unexpected error occurred") {
      return error.message;
    }
  } else if (error instanceof Error) {
    if (
      error.message.includes("دسترسی") ||
      error.message.includes("forbidden") ||
      error.message.includes("مجوز")
    ) {
      return "شما مجوز لازم برای مشاهده پاسخ‌های این تکلیف را ندارید.";
    }
    if (
      error.message.includes("یافت نشد") ||
      error.message.includes("not found")
    ) {
      return "تکلیف مورد نظر یافت نشد یا ممکن است حذف شده باشد.";
    }
    if (
      error.message.includes("شبکه") ||
      error.message.includes("fetch") ||
      error.message.includes("Network")
    ) {
      return "خطای ارتباط با سرور. لطفاً اتصال اینترنت خود را بررسی کرده و مجدداً تلاش کنید.";
    }
  }
  return "خطا در دریافت اطلاعات تکلیف از سرور. لطفاً دوباره تلاش کنید.";
}

export function AssignmentSubmissionsDrawer({
  isOpen,
  onClose,
  assignmentId,
}: AssignmentSubmissionsDrawerProps) {
  const { data, isLoading, error, refetch } = useTeacherAssignmentSubmissions(
    isOpen ? assignmentId : undefined,
  );

  const [selectedStudentAnswer, setSelectedStudentAnswer] = useState<{
    studentName: string;
    studentEmail: string;
    answerText: string;
    attachmentUrl?: string | null;
    attachmentName?: string | null;
    attachmentSizeBytes?: number | null;
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

  const startsAtTime = assignment?.startsAt ? new Date(assignment.startsAt).getTime() : NaN;
  const dueAtTime = assignment?.dueAt ? new Date(assignment.dueAt).getTime() : NaN;
  const nowTime = Date.now();

  const isBeforeStart = Boolean(
    assignment && !isNaN(startsAtTime) && nowTime < startsAtTime,
  );
  const isAfterDue = Boolean(
    assignment && !isNaN(dueAtTime) && nowTime > dueAtTime,
  );
  const hasSubmissions = stats.submittedCount > 0;

  return (
    <>
      <Dialog
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="2xl"
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
              <div
                className="p-6 rounded-2xl bg-red-50/70 border border-red-200 text-right space-y-3"
                role="alert"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-red-800">
                      خطا در بارگذاری اطلاعات تکلیف
                    </h4>
                    <p className="text-xs sm:text-sm text-red-700 leading-relaxed">
                      {getAssignmentErrorMessage(error)}
                    </p>
                  </div>
                </div>
                <div className="pt-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void refetch()}
                    className="text-xs border-red-300 hover:bg-red-100/60 text-red-800"
                  >
                    <RotateCcw className="w-3.5 h-3.5 ml-1" />
                    تلاش مجدد
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* Timing & Empty/Submission Status Banners */}
                {isBeforeStart && (
                  <div
                    className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-900"
                    role="status"
                  >
                    <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 text-xs sm:text-sm leading-relaxed">
                      <p className="font-bold text-amber-800">
                        مهلت ارسال این تکلیف هنوز شروع نشده است.
                      </p>
                      <p className="text-amber-700">
                        {assignment.startsAt
                          ? `زمان شروع دریافت پاسخ: ${formatPersianExamDate(assignment.startsAt)} ساعت ${formatPersianTimeOnly(assignment.startsAt)} — فعلاً پاسخی برای بررسی وجود ندارد.`
                          : "فعلاً پاسخی برای بررسی وجود ندارد."}
                      </p>
                    </div>
                  </div>
                )}

                {!isBeforeStart && !isAfterDue && !hasSubmissions && (
                  <div
                    className="p-4 rounded-xl bg-blue-50/80 border border-blue-200 flex items-start gap-3 text-blue-900"
                    role="status"
                  >
                    <FileText className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 text-xs sm:text-sm leading-relaxed">
                      <p className="font-bold text-blue-800">
                        هنوز پاسخی برای این تکلیف ثبت نشده است.
                      </p>
                      <p className="text-blue-700">
                        {assignment.dueAt
                          ? `دانشجویان تا تاریخ ${formatPersianExamDate(assignment.dueAt)} ساعت ${formatPersianTimeOnly(assignment.dueAt)} برای ثبت پاسخ خود مهلت دارند.`
                          : "دانشجویان هنوز پاسخی ثبت نکرده‌اند."}
                      </p>
                    </div>
                  </div>
                )}

                {isAfterDue && !hasSubmissions && (
                  <div
                    className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-900"
                    role="status"
                  >
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5 text-xs sm:text-sm leading-relaxed">
                      <p className="font-bold text-amber-800">
                        مهلت ارسال این تکلیف به پایان رسیده و هنوز پاسخی ثبت نشده است.
                      </p>
                      <p className="text-amber-700">
                        {assignment.dueAt
                          ? `مهلت نهایی ارسال در تاریخ ${formatPersianExamDate(assignment.dueAt)} ساعت ${formatPersianTimeOnly(assignment.dueAt)} به اتمام رسیده است.`
                          : "مهلت ارسال به پایان رسیده است."}
                      </p>
                    </div>
                  </div>
                )}

                {isAfterDue && hasSubmissions && (
                  <div
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-slate-700 text-xs sm:text-sm"
                    role="status"
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="font-medium">
                        مهلت ارسال این تکلیف به پایان رسیده است.
                      </span>
                    </div>
                    <span className="text-slate-500 text-xs">
                      پاسخ‌های ثبت‌شده دانشجویان در ادامه قابل مشاهده و بررسی هستند.
                    </span>
                  </div>
                )}

                {/* Assignment Overview Card */}
                <Card className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <AssignmentStatusBadge status={assignment.status} />
                      {assignment.createdAt && (
                        <span className="text-xs text-[var(--color-text-muted)]">
                          ایجاد شده در {formatPersianExamDate(assignment.createdAt)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
                      {assignment.startsAt && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-[#008080]" />
                          شروع: {formatPersianExamDate(assignment.startsAt)} ساعت {formatPersianTimeOnly(assignment.startsAt)}
                        </span>
                      )}
                      {assignment.startsAt && assignment.dueAt && <span>•</span>}
                      {assignment.dueAt && (
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5 text-amber-600" />
                          مهلت: {formatPersianExamDate(assignment.dueAt)} ساعت {formatPersianTimeOnly(assignment.dueAt)}
                        </span>
                      )}
                    </div>
                  </div>

                  {assignment.description && (
                    <div className="pt-2 border-t border-[var(--color-border)] select-text">
                      <MarkdownRenderer content={assignment.description} className="text-xs sm:text-sm" />
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
                                      attachmentUrl: item.submission!.attachmentUrl,
                                      attachmentName: item.submission!.attachmentName,
                                      attachmentSizeBytes: item.submission!.attachmentSizeBytes,
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
              {selectedStudentAnswer.answerText && selectedStudentAnswer.answerText.trim().length > 0 && (
                <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] max-h-[50vh] overflow-y-auto space-y-1.5">
                  <h5 className="text-xs font-bold text-[var(--color-text-muted)]">
                    متن پاسخ ثبت‌شده:
                  </h5>
                  <p className="text-sm text-[var(--color-text)] leading-relaxed whitespace-pre-wrap font-sans select-text">
                    {selectedStudentAnswer.answerText}
                  </p>
                </div>
              )}

              {selectedStudentAnswer.attachmentUrl && (
                <div className="p-3.5 sm:p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
                      <Paperclip className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p
                        className="text-xs sm:text-sm font-semibold text-[var(--color-text)] truncate"
                        title={selectedStudentAnswer.attachmentName || "فایل پیوست"}
                      >
                        {selectedStudentAnswer.attachmentName || "فایل پیوست تکلیف"}
                      </p>
                      {selectedStudentAnswer.attachmentSizeBytes && (
                        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                          {toPersianDigits(
                            selectedStudentAnswer.attachmentSizeBytes > 1024 * 1024
                              ? (selectedStudentAnswer.attachmentSizeBytes / (1024 * 1024)).toFixed(1) + " مگابایت"
                              : (selectedStudentAnswer.attachmentSizeBytes / 1024).toFixed(1) + " کیلوبایت"
                          )}
                        </p>
                      )}
                    </div>
                  </div>

                  <a
                    href={selectedStudentAnswer.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[#008080] bg-[#008080]/10 hover:bg-[#008080]/20 transition-colors shrink-0"
                  >
                    <Download className="w-3.5 h-3.5" />
                    دانلود / مشاهده
                  </a>
                </div>
              )}
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
