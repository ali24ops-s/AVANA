import { useState, useEffect } from "react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
  Card,
  Alert,
  LoadingState,
} from "../../ui/index.js";
import {
  useStudentAssignment,
  useSubmitAssignment,
} from "../../../hooks/useStudentAssignments.js";
import { StudentAssignmentStatusBadge } from "./StudentAssignmentStatusBadge.js";
import { formatPersianExamDate, formatPersianTimeOnly } from "../../../utils/date.js";
import { ApiError } from "../../../lib/api/errors.js";
import {
  FileText,
  Calendar,
  Send,
  CheckCircle2,
  Edit3,
} from "lucide-react";

export interface StudentAssignmentSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignmentId: string;
  classroomId: string;
}

export function StudentAssignmentSubmissionModal({
  isOpen,
  onClose,
  assignmentId,
  classroomId,
}: StudentAssignmentSubmissionModalProps) {
  const { data, isLoading, error } = useStudentAssignment(
    isOpen ? assignmentId : undefined,
  );
  const submitMutation = useSubmitAssignment(assignmentId, classroomId);

  const [answerText, setAnswerText] = useState("");
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (data?.submission) {
      setAnswerText(data.submission.answerText);
      setIsEditingExisting(false);
    } else {
      setAnswerText("");
      setIsEditingExisting(true);
    }
    setActionError(null);
    setActionSuccess(null);
  }, [data, isOpen]);

  if (!isOpen) return null;

  const assignment = data?.assignment;
  const submission = data?.submission;
  const runtimeState = data?.runtimeState ?? "closed";
  const canSubmit = data?.canSubmit ?? false;
  const hasSubmitted = Boolean(submission);

  const handleSubmit = async () => {
    setActionError(null);
    setActionSuccess(null);

    const trimmed = answerText.trim();
    if (trimmed.length === 0) {
      setActionError("لطفاً متن پاسخ خود را وارد کنید.");
      return;
    }

    try {
      await submitMutation.mutateAsync({ answerText: trimmed });
      setActionSuccess("پاسخ شما با موفقیت ثبت شد.");
      setIsEditingExisting(false);
    } catch (err) {
      setActionError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "خطا در ارسال پاسخ. لطفاً دوباره تلاش کنید.",
      );
    }
  };

  const isPending = submitMutation.isPending;

  return (
    <Dialog
      isOpen={isOpen}
      onClose={isPending ? () => {} : onClose}
      maxWidth="lg"
      ariaLabel={assignment ? assignment.title : "تکلیف کلاسی"}
    >
      <DialogHeader onClose={isPending ? () => {} : onClose}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)] leading-snug">
              {assignment ? assignment.title : "تکلیف کلاسی"}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              مشاهده جزئیات تکلیف و ارسال پاسخ متنی
            </p>
          </div>
        </div>
      </DialogHeader>

      <DialogContent>
        <div className="space-y-5 font-sans text-right" dir="rtl">
          {isLoading ? (
            <div className="py-16 flex justify-center">
              <LoadingState message="در حال بارگذاری اطلاعات تکلیف..." />
            </div>
          ) : error || !assignment ? (
            <Alert variant="error" title="خطا">
              {error instanceof Error
                ? error.message
                : "تکلیف مورد نظر یافت نشد یا شما دسترسی به آن ندارید."}
            </Alert>
          ) : (
            <>
              {/* Assignment Details */}
              <Card className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <StudentAssignmentStatusBadge
                      status={
                        hasSubmitted
                          ? "submitted"
                          : runtimeState === "active"
                          ? "can_submit"
                          : runtimeState === "upcoming"
                          ? "not_started"
                          : "expired"
                      }
                    />
                    <span className="text-xs text-[var(--color-text-muted)]">
                      مهلت تا {formatPersianExamDate(assignment.dueAt)} ساعت {formatPersianTimeOnly(assignment.dueAt)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                    <Calendar className="w-3.5 h-3.5 text-[#008080]" />
                    <span>
                      شروع: {formatPersianExamDate(assignment.startsAt)} ساعت {formatPersianTimeOnly(assignment.startsAt)}
                    </span>
                  </div>
                </div>

                {assignment.description && (
                  <div className="pt-2 border-t border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text)] leading-relaxed whitespace-pre-wrap">
                    {assignment.description}
                  </div>
                )}
              </Card>

              {/* Submission Status Alerts */}
              {actionError && (
                <Alert variant="error" title="خطا در ارسال">
                  {actionError}
                </Alert>
              )}

              {actionSuccess && (
                <Alert variant="success" title="ارسال موفق">
                  {actionSuccess}
                </Alert>
              )}

              {runtimeState === "upcoming" && (
                <Alert variant="info" title="هنوز شروع نشده است">
                  زمان دریافت پاسخ برای این تکلیف هنوز آغاز نشده است. شما می‌توانید از ساعت{" "}
                  {formatPersianTimeOnly(assignment.startsAt)} مورخ{" "}
                  {formatPersianExamDate(assignment.startsAt)} پاسخ خود را ثبت کنید.
                </Alert>
              )}

              {runtimeState === "closed" && !hasSubmitted && (
                <Alert variant="error" title="مهلت ارسال به پایان رسیده است">
                  مهلت ارسال پاسخ این تکلیف در تاریخ{" "}
                  {formatPersianExamDate(assignment.dueAt)} ساعت{" "}
                  {formatPersianTimeOnly(assignment.dueAt)} به پایان رسیده است و امکان ثبت پاسخ جدید وجود ندارد.
                </Alert>
              )}

              {/* View Submitted Answer vs Edit Form */}
              {hasSubmitted && !isEditingExisting ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs sm:text-sm font-bold text-emerald-700">
                        پاسخ شما در {formatPersianExamDate(submission!.submittedAt)} ساعت{" "}
                        {formatPersianTimeOnly(submission!.submittedAt)} با موفقیت ثبت شده است.
                      </span>
                    </div>

                    {canSubmit && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setIsEditingExisting(true)}
                      >
                        <Edit3 className="w-3.5 h-3.5 ml-1" />
                        ویرایش و ارسال مجدد
                      </Button>
                    )}
                  </div>

                  <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-emerald-200">
                    <h5 className="text-xs font-semibold text-[var(--color-text-muted)] mb-1.5">
                      پاسخ شما:
                    </h5>
                    <p className="text-sm text-[var(--color-text)] leading-relaxed whitespace-pre-wrap select-text">
                      {submission!.answerText}
                    </p>
                  </div>
                </div>
              ) : (
                canSubmit && (
                  <div className="space-y-3">
                    <label className="block text-xs sm:text-sm font-semibold text-[var(--color-text)]">
                      پاسخ شما به تکلیف <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      rows={6}
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      placeholder="متن پاسخ خود را به طور کامل و شفاف اینجا بنویسید..."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#008080] resize-y"
                      disabled={isPending}
                    />

                    <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                      <span>
                        {answerText.trim().length > 0
                          ? `${answerText.trim().length} کاراکتر`
                          : "حداقل ۱ کاراکتر"}
                      </span>

                      {hasSubmitted && (
                        <button
                          type="button"
                          onClick={() => {
                            setAnswerText(submission!.answerText);
                            setIsEditingExisting(false);
                          }}
                          className="text-slate-500 hover:text-slate-700 underline"
                        >
                          انصراف از ویرایش
                        </button>
                      )}
                    </div>
                  </div>
                )
              )}
            </>
          )}
        </div>
      </DialogContent>

      <DialogFooter>
        <div className="flex items-center justify-end gap-2.5 w-full flex-wrap">
          <Button variant="outline" size="sm" onClick={onClose} disabled={isPending}>
            بستن
          </Button>

          {canSubmit && (isEditingExisting || !hasSubmitted) && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              isLoading={isPending}
              disabled={isPending}
              leftIcon={<Send className="w-4 h-4 ml-1" />}
            >
              {hasSubmitted ? "بروزرسانی و ارسال مجدد" : "ارسال پاسخ"}
            </Button>
          )}
        </div>
      </DialogFooter>
    </Dialog>
  );
}
