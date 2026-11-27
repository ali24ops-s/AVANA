import React, { useState, useMemo } from "react";
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Clock,
  ArrowLeft,
  X,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Card, Button, Progress, Badge, Alert } from "../../ui/index.js";
import { toPersianDigits } from "@avana/domain";
import {
  getStudioApi,
  type StudioExamOperationStatus,
  type StudioExamTaskStatus,
} from "../../../lib/api/studio-api.js";
import {
  useExamOperationProgress,
  useExamOperationDetails,
  useCancelExamOperation,
} from "../../../hooks/useStudioExamOperation.js";

export interface ExamOperationProgressCardProps {
  operationId: string;
  quizId?: string;
  courseTitle?: string;
  chapterTitles?: Record<string, string>;
  onReviewQuestions?: (operationId: string) => void;
  onDismiss?: () => void;
  studioApi?: ReturnType<typeof getStudioApi>;
  className?: string;
}

const statusConfig: Record<
  StudioExamOperationStatus,
  {
    label: string;
    variant: "warning" | "primary" | "success" | "error" | "neutral";
    icon: React.ReactNode;
  }
> = {
  pending: {
    label: "در صف پردازش",
    variant: "warning",
    icon: <Clock className="w-3.5 h-3.5 text-amber-500" />,
  },
  processing: {
    label: "در حال تولید هوشمند",
    variant: "primary",
    icon: <Loader2 className="w-3.5 h-3.5 animate-spin text-[#008080]" />,
  },
  completed: {
    label: "تکمیل شد",
    variant: "success",
    icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />,
  },
  partial: {
    label: "تکمیل جزئی",
    variant: "warning",
    icon: <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />,
  },
  failed: {
    label: "خطا در تولید",
    variant: "error",
    icon: <AlertCircle className="w-3.5 h-3.5 text-red-600" />,
  },
  cancelled: {
    label: "لغو شده",
    variant: "neutral",
    icon: <XCircle className="w-3.5 h-3.5 text-slate-500" />,
  },
};

const taskStatusLabels: Record<StudioExamTaskStatus, { label: string; color: string }> = {
  pending: { label: "در انتظار", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40" },
  processing: { label: "در حال پردازش", color: "text-[#008080] bg-teal-50 dark:bg-teal-950/40" },
  completed: { label: "تکمیل", color: "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40" },
  partial: { label: "تکمیل جزئی", color: "text-amber-700 bg-amber-50 dark:bg-amber-950/40" },
  failed: { label: "خطا", color: "text-red-700 bg-red-50 dark:bg-red-950/40" },
  insufficient_content: { label: "محتوای ناکافی", color: "text-red-700 bg-red-50 dark:bg-red-950/40" },
  cancelled: { label: "لغو", color: "text-slate-600 bg-slate-100 dark:bg-slate-800" },
};

export const ExamOperationProgressCard: React.FC<ExamOperationProgressCardProps> = ({
  operationId,
  quizId,
  courseTitle,
  chapterTitles = {},
  onReviewQuestions,
  onDismiss,
  studioApi,
  className = "",
}) => {
  const api = useMemo(() => studioApi ?? getStudioApi(), [studioApi]);

  const [showCancelConfirm, setShowCancelConfirm] = useState<boolean>(false);
  const [cancelFeedback, setCancelFeedback] = useState<string | null>(null);

  // Hook 1: Real-time progress polling (stops automatically at terminal states)
  const {
    data: progress,
    isLoading: isLoadingProgress,
    error: progressError,
  } = useExamOperationProgress(operationId, { api });

  const status: StudioExamOperationStatus = progress?.status ?? "pending";
  const isTerminal =
    status === "completed" ||
    status === "partial" ||
    status === "failed" ||
    status === "cancelled";
  const isActive = status === "pending" || status === "processing";

  // Hook 2: Fetch detailed operation info when failed or partial (for sanitized backend error messages)
  const { data: details } = useExamOperationDetails(operationId, {
    api,
    enabled: status === "failed" || status === "partial",
  });

  // Hook 3: Cancel mutation
  const cancelMutation = useCancelExamOperation(quizId, { api });

  const handleCancelClick = async () => {
    try {
      setCancelFeedback(null);
      await cancelMutation.mutateAsync({
        operationId,
        reason: "لغو توسط کاربر از پنل کاربری",
      });
      setShowCancelConfirm(false);
    } catch (err) {
      setCancelFeedback(
        err instanceof Error ? err.message : "خطا در لغو عملیات. لطفاً مجدداً تلاش کنید.",
      );
    }
  };

  // Extract friendly sanitized error message
  const sanitizedErrorMessage = useMemo(() => {
    if (status !== "failed" && status !== "partial") return null;
    const taskWithError = details?.tasks?.find((t) => t.errorMessage);
    if (taskWithError?.errorMessage) {
      return taskWithError.errorMessage;
    }
    if (status === "partial") {
      return "برخی از فصل‌ها با خطا یا کمبود محتوا مواجه شدند، اما سؤالات موفق ذخیره شده‌اند.";
    }
    return "متأسفانه فرآیند تولید سؤالات با خطا مواجه شد. لطفاً سهمیه‌بندی یا تنظیمات پرامپت را تغییر داده و مجدداً تلاش کنید.";
  }, [status, details]);

  const currentStatusConfig = statusConfig[status] ?? statusConfig.pending;

  if (isLoadingProgress && !progress) {
    return (
      <Card className={`p-5 rounded-2xl border border-[var(--color-border)] shadow-xs ${className}`} dir="rtl">
        <div className="flex items-center justify-center gap-3 py-6 text-xs text-[var(--color-text-muted)]">
          <Loader2 className="w-5 h-5 animate-spin text-[#008080]" />
          <span>در حال دریافت اطلاعات پیشرفت عملیات...</span>
        </div>
      </Card>
    );
  }

  if (progressError && !progress) {
    return (
      <Card className={`p-5 rounded-2xl border border-red-200 bg-red-50/50 shadow-xs ${className}`} dir="rtl">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs text-red-900">
            <p className="font-bold">خطا در برقراری ارتباط با سرور</p>
            <p>{progressError.message || "اطلاعات پیشرفت عملیات در دسترس نیست."}</p>
          </div>
        </div>
      </Card>
    );
  }

  const requestedCount = progress?.totalRequestedQuestions ?? 0;
  const generatedCount = progress?.totalGeneratedQuestions ?? 0;
  const percentage = progress?.progressPercentage ?? 0;

  return (
    <Card
      className={`p-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xs transition-all space-y-4 ${className}`}
      dir="rtl"
    >
      {/* Top Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-[#008080] shrink-0">
            <Sparkles className="w-4 h-4 text-[#008080]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-[var(--color-text)]">
                عملیات تولید خودکار آزمون
              </h3>
              <Badge variant={currentStatusConfig.variant} size="sm" icon={currentStatusConfig.icon}>
                {currentStatusConfig.label}
              </Badge>
            </div>
            {courseTitle && (
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{courseTitle}</p>
            )}
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {isActive && !showCancelConfirm && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowCancelConfirm(true)}
              className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
            >
              لغو عملیات
            </Button>
          )}
          {isTerminal && onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="بستن اعلان"
              className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Cancel Confirmation Prompt */}
      {showCancelConfirm && (
        <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>آیا از لغو این عملیات مطمئن هستید؟ فرآیند تولید متوقف خواهد شد.</span>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowCancelConfirm(false)}
              disabled={cancelMutation.isPending}
            >
              انصراف
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={() => void handleCancelClick()}
              isLoading={cancelMutation.isPending}
            >
              بله، لغو شود
            </Button>
          </div>
        </div>
      )}

      {cancelFeedback && (
        <Alert variant="error" icon={<AlertCircle className="w-4 h-4" />}>
          {cancelFeedback}
        </Alert>
      )}

      {/* Main Progress Indicator */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[var(--color-text-muted)]">
            میزان پیشرفت کلی:
          </span>
          <span className="font-bold text-[#008080]">
            {toPersianDigits(generatedCount)} از {toPersianDigits(requestedCount)} سؤال (
            {toPersianDigits(percentage)}٪)
          </span>
        </div>
        <Progress
          value={percentage}
          max={100}
          size="md"
          variant={
            status === "completed"
              ? "success"
              : status === "partial"
                ? "warning"
                : status === "failed"
                  ? "error"
                  : "primary"
          }
        />
      </div>

      {/* Tasks / Chapters Breakdown */}
      {progress?.tasks && progress.tasks.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
          <span className="text-[11px] font-bold text-[var(--color-text-muted)]">
            وضعیت فصول در حال پردازش:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-0.5">
            {progress.tasks.map((task) => {
              const chapterTitle =
                chapterTitles[task.moduleId] ||
                chapterTitles[task.taskId] ||
                `فصل ${task.moduleId.slice(0, 8)}`;
              const taskStyle = taskStatusLabels[task.status] || taskStatusLabels.pending;
              return (
                <div
                  key={task.taskId}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)]/40 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${taskStyle.color}`}
                    >
                      {taskStyle.label}
                    </span>
                    <span className="truncate font-medium text-[var(--color-text)]">
                      {chapterTitle}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-[var(--color-text-muted)] shrink-0 mr-1.5">
                    {toPersianDigits(task.generatedCount)} / {toPersianDigits(task.targetCount)} سؤال
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Status-specific actions and callouts */}
      {status === "completed" && (
        <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs text-emerald-900 dark:text-emerald-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold">تولید هوشمند سؤالات با موفقیت به پایان رسید!</p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5">
                تعداد {toPersianDigits(generatedCount)} سؤال استاندارد آماده بررسی و انتقال به آزمون
                می‌باشند.
              </p>
            </div>
          </div>
          {onReviewQuestions && generatedCount > 0 && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => onReviewQuestions(operationId)}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
              className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 w-full sm:w-auto"
            >
              بررسی و افزودن سؤالات
            </Button>
          )}
        </div>
      )}

      {status === "partial" && (
        <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 text-xs text-amber-950 dark:text-amber-200">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold">تولید هوشمند به‌صورت جزئی تکمیل شد</p>
              <p className="text-[11px] text-amber-800 dark:text-amber-300">
                تعداد {toPersianDigits(generatedCount)} از {toPersianDigits(requestedCount)} سؤال
                درخواستی با موفقیت تولید شده‌اند.
              </p>
              {sanitizedErrorMessage && (
                <p className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  {sanitizedErrorMessage}
                </p>
              )}
            </div>
          </div>
          {onReviewQuestions && generatedCount > 0 && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => onReviewQuestions(operationId)}
              leftIcon={<ArrowLeft className="w-4 h-4" />}
              className="bg-amber-600 hover:bg-amber-700 text-white shrink-0 w-full sm:w-auto"
            >
              بررسی و افزودن سؤالات
            </Button>
          )}
        </div>
      )}

      {status === "failed" && (
        <Alert variant="error" icon={<AlertCircle className="w-4 h-4" />}>
          <div className="space-y-1">
            <p className="font-bold">عملیات متوقف شد</p>
            <p className="text-xs leading-relaxed">{sanitizedErrorMessage}</p>
          </div>
        </Alert>
      )}

      {status === "cancelled" && (
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2">
          <XCircle className="w-4 h-4 text-slate-400 shrink-0" />
          <span>عملیات تولید سؤالات متوقف گردید.</span>
        </div>
      )}

      {isActive && (
        <p className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#008080]" />
          <span>
            هوش مصنوعی در حال تحلیل متون درسی، تدوین سؤالات، گزینه‌ها و تحلیل پاسخ‌های تشریحی است...
          </span>
        </p>
      )}
    </Card>
  );
};
