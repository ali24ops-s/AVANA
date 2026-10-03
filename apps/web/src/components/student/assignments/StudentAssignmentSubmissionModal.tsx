import { useState, useEffect, useRef } from "react";
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
import { MarkdownRenderer } from "../../markdown/MarkdownRenderer.js";
import { createApiClient, getApiBaseUrl } from "../../../lib/api/client.js";
import { createStudentPlatformApi } from "../../../lib/api/student-platform.js";
import { toPersianDigits, MAX_ASSIGNMENT_ANSWER_LENGTH } from "@avana/domain";
import {
  FileText,
  Calendar,
  Send,
  CheckCircle2,
  Edit3,
  UploadCloud,
  File,
  FileSpreadsheet,
  FileArchive,
  Image as ImageIcon,
  Trash2,
  Download,
  ExternalLink,
  Paperclip,
  Loader2,
} from "lucide-react";

export interface StudentAssignmentSubmissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignmentId: string;
  classroomId: string;
}

interface AttachmentState {
  url: string;
  name: string;
  sizeBytes?: number | null;
}

function formatFileSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${toPersianDigits(bytes)} بایت`;
  if (bytes < 1024 * 1024) {
    const kb = (bytes / 1024).toFixed(1);
    return `${toPersianDigits(kb)} کیلوبایت`;
  }
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  return `${toPersianDigits(mb)} مگابایت`;
}

function getFileIcon(filename?: string | null) {
  const ext = filename?.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return FileText;
  if (["png", "jpg", "jpeg", "webp"].includes(ext || "")) return ImageIcon;
  if (["zip", "rar", "7z"].includes(ext || "")) return FileArchive;
  if (["xls", "xlsx", "csv"].includes(ext || "")) return FileSpreadsheet;
  return File;
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
  const [attachment, setAttachment] = useState<AttachmentState | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (data?.submission) {
      setAnswerText(data.submission.answerText || "");
      if (data.submission.attachmentUrl) {
        setAttachment({
          url: data.submission.attachmentUrl,
          name: data.submission.attachmentName || "فایل پیوست",
          sizeBytes: data.submission.attachmentSizeBytes ?? null,
        });
      } else {
        setAttachment(null);
      }
      setIsEditingExisting(false);
    } else {
      setAnswerText("");
      setAttachment(null);
      setIsEditingExisting(true);
    }
    setUploadError(null);
    setActionError(null);
    setActionSuccess(null);
  }, [data, isOpen]);

  if (!isOpen) return null;

  const assignment = data?.assignment;
  const submission = data?.submission;
  const runtimeState = data?.runtimeState ?? "closed";
  const canSubmit = data?.canSubmit ?? false;
  const hasSubmitted = Boolean(submission);

  const handleFileSelect = async (file: File) => {
    setUploadError(null);
    setActionError(null);

    // 20MB limit
    if (file.size > 20 * 1024 * 1024) {
      setUploadError("حجم فایل انتخابی بیش از حد مجاز است (حداکثر ۲۰ مگابایت).");
      return;
    }
    if (file.size === 0) {
      setUploadError("فایل انتخابی خالی است.");
      return;
    }

    setIsUploadingFile(true);
    try {
      const client = createApiClient({ baseUrl: getApiBaseUrl() });
      const api = createStudentPlatformApi(client);
      const res = await api.uploadAssignmentAttachment(file);
      setAttachment({
        url: res.attachmentUrl,
        name: res.attachmentName || file.name,
        sizeBytes: res.attachmentSizeBytes || file.size,
      });
    } catch (err) {
      setUploadError(
        err instanceof ApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : "خطا در بارگذاری فایل. لطفاً دوباره تلاش کنید.",
      );
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveAttachment = () => {
    setAttachment(null);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    setActionError(null);
    setActionSuccess(null);
    setUploadError(null);

    const trimmed = answerText.trim();
    if (trimmed.length === 0 && !attachment) {
      setActionError("لطفاً متن پاسخ یا فایل پیوست را وارد کنید.");
      return;
    }

    if (trimmed.length > MAX_ASSIGNMENT_ANSWER_LENGTH) {
      setActionError("متن پاسخ نمی‌تواند بیشتر از ۱۵٬۰۰۰ کاراکتر باشد.");
      return;
    }

    try {
      await submitMutation.mutateAsync({
        answerText: trimmed,
        attachmentUrl: attachment?.url ?? null,
        attachmentName: attachment?.name ?? null,
        attachmentSizeBytes: attachment?.sizeBytes ?? null,
      });
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

  const isPending = submitMutation.isPending || isUploadingFile;
  const charCount = answerText.length;
  const isFormActive = canSubmit && (isEditingExisting || !hasSubmitted);

  const AttachedIcon = getFileIcon(attachment?.name);

  return (
    <Dialog
      isOpen={isOpen}
      onClose={isPending ? () => {} : onClose}
      maxWidth="3xl"
      className="w-full sm:max-w-3xl md:max-w-4xl max-h-[94vh] sm:max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
      ariaLabel={assignment ? assignment.title : "پاسخ به تکلیف"}
    >
      <DialogHeader
        onClose={isPending ? () => {} : onClose}
        className="px-5 py-4 sm:px-6 sm:py-5 shrink-0 bg-[var(--color-surface-warm)] border-b border-[var(--color-border)]"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)] truncate leading-snug">
              {assignment ? assignment.title : "پاسخ به تکلیف"}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">
              مشاهده توضیحات و ارسال پاسخ متنی یا فایل پیوست تکلیف
            </p>
          </div>
        </div>
      </DialogHeader>

      <DialogContent className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
        <div className="space-y-5 font-sans text-right" dir="rtl">
          {isLoading ? (
            <div className="py-20 flex justify-center">
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
              {/* Assignment Information Card */}
              <Card className="p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2.5">
                  <div className="flex items-center gap-2 flex-wrap">
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
                      مهلت ارسال: {formatPersianExamDate(assignment.dueAt)} ساعت {formatPersianTimeOnly(assignment.dueAt)}
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
                  <div className="pt-2.5 border-t border-[var(--color-border)] select-text">
                    <MarkdownRenderer content={assignment.description} className="text-xs sm:text-sm" />
                  </div>
                )}
              </Card>

              {/* Status Alerts */}
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
                <Alert variant="info" title="هنوز آغاز نشده است">
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

              {/* Submitted View Mode */}
              {hasSubmitted && !isEditingExisting ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
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

                  {/* Submitted Answer Text */}
                  {submission!.answerText && submission!.answerText.trim().length > 0 && (
                    <div className="p-4 rounded-xl bg-[var(--color-surface)] border border-emerald-200 space-y-2">
                      <h5 className="text-xs font-semibold text-[var(--color-text-muted)]">
                        متن پاسخ شما:
                      </h5>
                      <p className="text-sm text-[var(--color-text)] leading-relaxed whitespace-pre-wrap select-text max-h-[40vh] overflow-y-auto">
                        {submission!.answerText}
                      </p>
                    </div>
                  )}

                  {/* Submitted Attachment File */}
                  {submission!.attachmentUrl && (
                    <div className="p-3.5 sm:p-4 rounded-xl bg-[var(--color-surface)] border border-emerald-200 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 border border-emerald-200">
                          <Paperclip className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p
                            className="text-xs sm:text-sm font-semibold text-[var(--color-text)] truncate"
                            title={submission!.attachmentName || "فایل پیوست"}
                          >
                            {submission!.attachmentName || "فایل پیوست تکلیف"}
                          </p>
                          {submission!.attachmentSizeBytes && (
                            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                              {formatFileSize(submission!.attachmentSizeBytes)}
                            </p>
                          )}
                        </div>
                      </div>

                      <a
                        href={submission!.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                        دانلود / مشاهده
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                /* Editable Form Workspace */
                isFormActive && (
                  <div className="space-y-5">
                    {/* Text Answer Section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="assignment-answer-text"
                          className="block text-xs sm:text-sm font-semibold text-[var(--color-text)]"
                        >
                          متن پاسخ شما
                          {!attachment && <span className="text-red-500 mr-1">*</span>}
                        </label>
                        <span
                          className={`text-[11px] ${
                            charCount > MAX_ASSIGNMENT_ANSWER_LENGTH
                              ? "text-red-500 font-bold"
                              : "text-[var(--color-text-muted)]"
                          }`}
                        >
                          {toPersianDigits(charCount.toLocaleString("fa-IR"))} / {toPersianDigits(MAX_ASSIGNMENT_ANSWER_LENGTH.toLocaleString("fa-IR"))} کاراکتر
                        </span>
                      </div>

                      <textarea
                        id="assignment-answer-text"
                        rows={8}
                        value={answerText}
                        onChange={(e) => setAnswerText(e.target.value)}
                        placeholder="متن پاسخ خود را به صورت کامل و پاراگراف‌بندی شده بنویسید..."
                        className={`w-full p-3.5 sm:p-4 rounded-xl bg-[var(--color-surface)] border text-sm text-[var(--color-text)] leading-relaxed focus:outline-none focus:ring-2 resize-y min-h-[160px] sm:min-h-[200px] max-h-[45vh] transition-colors ${
                          charCount > MAX_ASSIGNMENT_ANSWER_LENGTH
                            ? "border-red-500 focus:ring-red-500"
                            : "border-[var(--color-border)] focus:ring-[#008080]"
                        }`}
                        disabled={isPending}
                        dir="rtl"
                      />

                      {charCount > MAX_ASSIGNMENT_ANSWER_LENGTH && (
                        <p className="text-xs text-red-500 font-medium">
                          متن پاسخ نمی‌تواند بیشتر از {toPersianDigits(MAX_ASSIGNMENT_ANSWER_LENGTH.toLocaleString("fa-IR"))} کاراکتر باشد (
                          {toPersianDigits((charCount - MAX_ASSIGNMENT_ANSWER_LENGTH).toLocaleString("fa-IR"))} کاراکتر اضافه).
                        </p>
                      )}

                      <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
                        <span className="text-[11px]">
                          {attachment
                            ? "پاسخ متنی اختیاری است (فایل پیوست انتخاب شده است)."
                            : "برای ارسال بدون پیوست، حداقل یک کاراکتر متن وارد کنید."}
                        </span>

                        {hasSubmitted && (
                          <button
                            type="button"
                            onClick={() => {
                              setAnswerText(submission!.answerText || "");
                              setAttachment(
                                submission!.attachmentUrl
                                  ? {
                                      url: submission!.attachmentUrl,
                                      name: submission!.attachmentName || "فایل پیوست",
                                      sizeBytes: submission!.attachmentSizeBytes ?? null,
                                    }
                                  : null,
                              );
                              setIsEditingExisting(false);
                            }}
                            className="text-slate-500 hover:text-slate-700 underline text-xs cursor-pointer"
                          >
                            انصراف از ویرایش
                          </button>
                        )}
                      </div>
                    </div>

                    {/* File Attachment Section */}
                    <div className="space-y-2.5 pt-2 border-t border-[var(--color-border)]">
                      <div>
                        <h4 className="text-xs sm:text-sm font-semibold text-[var(--color-text)] flex items-center gap-1.5">
                          <Paperclip className="w-4 h-4 text-[#008080]" />
                          پیوست پاسخ (اختیاری)
                        </h4>
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                          اگر پاسخ خود را در قالب فایل آماده کرده‌اید، می‌توانید آن را اینجا ارسال کنید.
                        </p>
                      </div>

                      {uploadError && (
                        <Alert variant="error" title="خطا در آپلود فایل">
                          {uploadError}
                        </Alert>
                      )}

                      {/* Hidden File Input */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            void handleFileSelect(e.target.files[0]);
                          }
                        }}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.md,.png,.jpg,.jpeg,.webp,.zip,.rar,.7z"
                        disabled={isPending}
                      />

                      {/* Display Uploaded File Card */}
                      {attachment ? (
                        <div className="p-3.5 sm:p-4 rounded-xl bg-[var(--color-surface)] border border-[#008080]/30 bg-[#008080]/5 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-lg bg-[#008080]/15 text-[#008080] flex items-center justify-center shrink-0">
                              <AttachedIcon className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p
                                  className="text-xs sm:text-sm font-semibold text-[var(--color-text)] truncate"
                                  title={attachment.name}
                                >
                                  {attachment.name}
                                </p>
                                <span className="inline-flex items-center text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md font-medium shrink-0">
                                  آماده ارسال
                                </span>
                              </div>
                              {attachment.sizeBytes ? (
                                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                                  {formatFileSize(attachment.sizeBytes)}
                                </p>
                              ) : null}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {attachment.url && (
                              <a
                                href={attachment.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="مشاهده فایل"
                                className="p-1.5 text-slate-500 hover:text-[#008080] hover:bg-white rounded-lg transition-colors"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={handleRemoveAttachment}
                              disabled={isPending}
                              title="حذف فایل پیوست"
                              className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ) : isUploadingFile ? (
                        /* Uploading State */
                        <div className="p-6 rounded-xl border-2 border-dashed border-[#008080]/40 bg-[#008080]/5 flex flex-col items-center justify-center text-center space-y-2">
                          <Loader2 className="w-7 h-7 text-[#008080] animate-spin" />
                          <p className="text-xs sm:text-sm font-semibold text-[var(--color-text)]">
                            در حال بارگذاری فایل پیوست...
                          </p>
                          <p className="text-[11px] text-[var(--color-text-muted)]">
                            لطفاً چند لحظه شکیبا باشید
                          </p>
                        </div>
                      ) : (
                        /* Dropzone Area */
                        <div
                          onDragOver={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsDragging(true);
                          }}
                          onDragLeave={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsDragging(false);
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsDragging(false);
                            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                              void handleFileSelect(e.dataTransfer.files[0]);
                            }
                          }}
                          onClick={() => {
                            if (!isPending) fileInputRef.current?.click();
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              fileInputRef.current?.click();
                            }
                          }}
                          className={`p-5 sm:p-6 rounded-xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center text-center space-y-2 select-none ${
                            isDragging
                              ? "border-[#008080] bg-[#008080]/10 scale-[0.99]"
                              : "border-[var(--color-border)] hover:border-[#008080]/60 bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)]"
                          }`}
                        >
                          <div className="w-11 h-11 rounded-full bg-[#008080]/10 text-[#008080] flex items-center justify-center">
                            <UploadCloud className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs sm:text-sm font-semibold text-[var(--color-text)]">
                              برای انتخاب فایل کلیک کنید یا فایل را اینجا رها کنید
                            </p>
                            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                              فرمت‌های مجاز: PDF، اسناد Word، اکسل، پاورپوینت، تصاویر و ZIP (حداکثر ۲۰ مگابایت)
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              )}
            </>
          )}
        </div>
      </DialogContent>

      <DialogFooter className="px-5 py-3.5 sm:px-6 sm:py-4 shrink-0 bg-[var(--color-surface-warm)] border-t border-[var(--color-border)]">
        <div className="flex items-center justify-between gap-3 w-full flex-wrap">
          <div className="text-xs text-[var(--color-text-muted)] hidden sm:block">
            {isFormActive && (
              <span>
                {attachment ? "آماده ارسال با پیوست" : answerText.trim() ? "آماده ارسال پاسخ متنی" : "پاسخ یا فایل را وارد کنید"}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 mr-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isPending}
            >
              بستن
            </Button>

            {isFormActive && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                isLoading={isPending}
                disabled={
                  isPending ||
                  (answerText.trim().length === 0 && !attachment) ||
                  answerText.trim().length > MAX_ASSIGNMENT_ANSWER_LENGTH
                }
                leftIcon={<Send className="w-4 h-4 ml-1" />}
              >
                {hasSubmitted ? "بروزرسانی و ارسال مجدد" : "ارسال پاسخ"}
              </Button>
            )}
          </div>
        </div>
      </DialogFooter>
    </Dialog>
  );
}
