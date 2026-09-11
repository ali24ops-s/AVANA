import { useState } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronLeft,
  RefreshCw,
  Layers,
  BookOpen,
  HelpCircle,
  Zap,
  FileText,
  AlertTriangle,
  Loader2,
  PauseCircle,
  Trash2,
} from "lucide-react";
import type { ActiveGenerationItem } from "../../lib/api/generation.js";

export interface GenerationDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ActiveGenerationItem[];
  selectedDocumentId?: string;
  onSelectDocument?: (documentId: string) => void;
  onNavigateToReview?: (courseId?: string | null, documentId?: string) => void;
  onRetry?: (documentId: string, courseId?: string | null, organizationId?: string) => void;
  onStop?: (documentId: string, courseId?: string | null, organizationId?: string) => Promise<void> | void;
  onDelete?: (documentId: string, courseId?: string | null, organizationId?: string) => Promise<void> | void;
}

const ORDERED_STAGES: Array<{
  stage: "analysis" | "planning" | "lesson" | "flashcard" | "quiz" | "summary" | "review" | "publishing";
  label: string;
  icon: typeof BookOpen;
}> = [
  { stage: "analysis", label: "تحلیل فایل", icon: FileText },
  { stage: "planning", label: "برنامه‌ریزی محتوا", icon: Sparkles },
  { stage: "lesson", label: "تولید درسنامه", icon: BookOpen },
  { stage: "flashcard", label: "تولید فلش‌کارت", icon: Layers },
  { stage: "quiz", label: "تولید آزمون", icon: HelpCircle },
  { stage: "summary", label: "تولید خلاصه", icon: Zap },
  { stage: "review", label: "بازبینی و اعتبارسنجی", icon: CheckCircle2 },
  { stage: "publishing", label: "انتشار", icon: Sparkles },
];

function sanitizeErrorMessage(rawError?: string | null): string {
  if (!rawError) {
    return "خطای ناشناخته در پردازش تولید محتوا.";
  }
  const lower = rawError.toLowerCase();
  if (
    lower.includes("quota") ||
    lower.includes("rate_limit") ||
    lower.includes("resource_exhausted") ||
    lower.includes("سهمیه")
  ) {
    return "سهمیه سرویس هوش مصنوعی در حال حاضر به پایان رسیده است. لطفاً کمی بعد دوباره تلاش کنید.";
  }
  if (
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("timeout") ||
    lower.includes("network")
  ) {
    return "خطا در برقراری ارتباط با سرویس هوش مصنوعی. لطفاً اتصال اینترنت را بررسی کنید.";
  }
  // Strip any stack traces or file paths
  const firstLine = rawError.split("\n")[0] || rawError;
  return firstLine.replace(/at\s+.*\(.*:[0-9]+:[0-9]+\)/gi, "").trim() || "خطا در فرآیند تولید هوشمند محتوا.";
}

function formatLastActivity(isoString?: string | null): string {
  if (!isoString) return "در حال مقداردهی اولیه...";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "—";
    const diffSeconds = Math.round((Date.now() - date.getTime()) / 1000);
    if (diffSeconds < 5) return "هم‌اکنون";
    if (diffSeconds < 60) return `${diffSeconds} ثانیه پیش`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes} دقیقه پیش`;
    return date.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function GenerationDetailsModal({
  isOpen,
  onClose,
  items,
  selectedDocumentId,
  onSelectDocument,
  onNavigateToReview,
  onRetry,
  onStop,
  onDelete,
}: GenerationDetailsModalProps) {
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const [confirmingAction, setConfirmingAction] = useState<"stop" | "delete" | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  if (!isOpen || items.length === 0) return null;

  const activeDocId =
    selectedDocumentId ||
    internalSelectedId ||
    items[0]?.documentId;

  const currentItem = items.find((i) => i.documentId === activeDocId) || items[0];

  const stageIndexMap: Record<string, number> = {
    analysis: 0,
    planning: 1,
    lesson: 2,
    flashcard: 3,
    quiz: 4,
    summary: 5,
    review: 6,
    publishing: 7,
  };

  const currentStageIndex = currentItem?.stage ? (stageIndexMap[currentItem.stage] ?? 0) : 0;
  const isCompleted = currentItem?.status === "completed";
  const isFailed = currentItem?.status === "failed";
  const isStopped = currentItem?.status === "stopped";
  const isStopping = currentItem?.status === "stopping";
  const isDeleting = currentItem?.status === "deleting";
  const isGenerating =
    currentItem?.status === "generating" ||
    currentItem?.status === "planning" ||
    currentItem?.status === "queued";

  // Check if stale (> 3 minutes without activity while generating)
  const isStale = Boolean(
    isGenerating &&
      currentItem?.lastActivityAt &&
      Date.now() - new Date(currentItem.lastActivityAt).getTime() > 3 * 60 * 1000,
  );

  const percentage = isCompleted
    ? 100
    : currentItem?.progress
    ? currentItem.progress.percentage
    : isGenerating
    ? Math.round(((currentStageIndex + 0.5) / ORDERED_STAGES.length) * 100)
    : 0;

  const handleExecuteStop = async () => {
    if (!onStop || !currentItem) return;
    setIsProcessingAction(true);
    try {
      await onStop(currentItem.documentId, currentItem.courseId, currentItem.organizationId);
      setConfirmingAction(null);
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleExecuteDelete = async () => {
    if (!onDelete || !currentItem) return;
    setIsProcessingAction(true);
    try {
      await onDelete(currentItem.documentId, currentItem.courseId, currentItem.organizationId);
      setConfirmingAction(null);
      if (items.length <= 1) {
        onClose();
      }
    } finally {
      setIsProcessingAction(false);
    }
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="generation-details-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl overflow-hidden font-sans text-[var(--color-text)] space-y-0 relative z-[100000] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-6 border-b border-[var(--color-border)] flex items-start justify-between gap-4 bg-[var(--color-surface-warm)]/40">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                isCompleted
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                  : isFailed
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400"
                  : isStopped
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400"
                  : isStopping || isDeleting
                  ? "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400"
                  : "bg-[var(--color-primary-default)]/10 border-[var(--color-primary-default)]/30 text-[var(--color-primary-default)]"
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-5 h-5" />
              ) : isFailed ? (
                <AlertCircle className="w-5 h-5" />
              ) : isStopped ? (
                <PauseCircle className="w-5 h-5" />
              ) : isStopping || isDeleting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Sparkles className="w-5 h-5 animate-pulse" />
              )}
            </div>
            <div className="min-w-0">
              <h2
                id="generation-details-title"
                className="text-base sm:text-lg font-bold text-[var(--color-text)] truncate"
              >
                {isCompleted
                  ? `تولید محتوای «${currentItem.documentName}» تکمیل شد`
                  : isFailed
                  ? `تولید محتوای «${currentItem.documentName}» با خطا مواجه شد`
                  : isStopped
                  ? `تولید محتوای «${currentItem.documentName}» متوقف شد`
                  : isStopping
                  ? `در حال توقف «${currentItem.documentName}»...`
                  : isDeleting
                  ? `در حال حذف فرآیند «${currentItem.documentName}»...`
                  : `تولید محتوای «${currentItem.documentName}»`}
              </h2>
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] mt-1">
                <span className="font-mono text-[var(--color-text)]" dir="ltr">
                  {currentItem.documentName}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-[var(--color-text-muted)]" />
                  <span>آخرین فعالیت: {formatLastActivity(currentItem.lastActivityAt)}</span>
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] rounded-xl transition-colors"
            aria-label="بستن"
            title="بستن پنجره"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Multi-generation selector tabs (if > 1 item) */}
        {items.length > 1 && (
          <div className="px-6 pt-4 pb-0 flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]/50">
            {items.map((it) => {
              const isSelected = it.documentId === currentItem.documentId;
              const itCompleted = it.status === "completed";
              const itFailed = it.status === "failed";
              const itStopped = it.status === "stopped";
              return (
                <button
                  key={it.documentId}
                  type="button"
                  onClick={() => {
                    setInternalSelectedId(it.documentId);
                    setConfirmingAction(null);
                    if (onSelectDocument) onSelectDocument(it.documentId);
                  }}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-t-xl text-xs font-bold transition-all border-b-2 shrink-0 ${
                    isSelected
                      ? "border-[var(--color-primary-default)] text-[var(--color-primary-default)] bg-[var(--color-surface)]"
                      : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]/60"
                  }`}
                >
                  {itCompleted ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  ) : itFailed ? (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
                  ) : itStopped ? (
                    <PauseCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--color-primary-default)]" />
                  )}
                  <span className="truncate max-w-[150px]">{it.documentName}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Main Progress Overview Banner */}
          <div className="p-4 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-bold">
                {isCompleted ? (
                  <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>تولید محتوا با موفقیت به پایان رسید</span>
                  </span>
                ) : isFailed ? (
                  <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4" />
                    <span>تولید محتوا با خطا متوقف شد</span>
                  </span>
                ) : isStopped ? (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <PauseCircle className="w-4 h-4" />
                    <span>فرآیند تولید متوقف شد (محتواهای تولید شده تا این مرحله حفظ شده‌اند)</span>
                  </span>
                ) : isStopping ? (
                  <span className="text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>در حال توقف در اولین نقطه امن پایپ‌لاین...</span>
                  </span>
                ) : isDeleting ? (
                  <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>در حال پاکسازی پیش‌نویس‌ها و فرآیند تولید...</span>
                  </span>
                ) : (
                  <span className="text-[var(--color-primary-default)] flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary-default)]" />
                    <span>
                      {currentItem.stageLabel || "در حال پردازش پایپ‌لاین تولید محتوا"}
                      {currentItem.progress ? ` (${currentItem.progress.current}/${currentItem.progress.total})` : ""}
                    </span>
                  </span>
                )}
              </div>
              <span className="font-mono font-bold text-[var(--color-primary-default)] text-sm">
                {percentage}٪
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2.5 bg-[var(--color-surface)] rounded-full overflow-hidden p-0.5 border border-[var(--color-border)]">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isCompleted
                    ? "bg-emerald-500"
                    : isFailed
                    ? "bg-rose-500"
                    : isStopped
                    ? "bg-amber-500"
                    : isStopping || isDeleting
                    ? "bg-orange-500"
                    : "bg-[var(--color-primary-default)]"
                }`}
                style={{ width: `${Math.min(100, Math.max(isCompleted ? 100 : 5, percentage))}%` }}
              />
            </div>
          </div>

          {/* Action Confirmation Banner (Inline) */}
          {confirmingAction === "stop" && (
            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs space-y-3 animate-in fade-in duration-150">
              <div className="flex items-start gap-2.5 text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <h4 className="font-bold text-amber-800 dark:text-amber-200 text-sm">توقف فرآیند تولید محتوا</h4>
                  <p className="text-amber-700/90 dark:text-amber-300/90 mt-1 leading-relaxed">
                    آیا از توقف فرآیند تولید اطمینان دارید؟ محتواهای تولیدشده تا این مرحله در پایگاه داده حفظ می‌شوند و پایپ‌لاین در اولین نقطه امن متوقف خواهد شد.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isProcessingAction}
                  onClick={() => setConfirmingAction(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-bold hover:bg-[var(--color-surface-warm)] transition-colors"
                >
                  انصراف و ادامه تولید
                </button>
                <button
                  type="button"
                  disabled={isProcessingAction}
                  onClick={handleExecuteStop}
                  className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  {isProcessingAction ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <PauseCircle className="w-3.5 h-3.5" />
                  )}
                  <span>بله، تولید متوقف شود</span>
                </button>
              </div>
            </div>
          )}

          {confirmingAction === "delete" && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs space-y-3 animate-in fade-in duration-150">
              <div className="flex items-start gap-2.5 text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-5 h-5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                <div>
                  <h4 className="font-bold text-rose-800 dark:text-rose-200 text-sm">حذف فرآیند تولید محتوا</h4>
                  <p className="text-rose-700/90 dark:text-rose-300/90 mt-1 leading-relaxed">
                    آیا از حذف کامل فرآیند تولید اطمینان دارید؟ پیش‌نویس‌های تأییدنشده این دوره پاکسازی خواهند شد، اما <strong>فایل اصلی شما در کتابخانه کاملاً دست‌نخورده باقی می‌ماند</strong>.
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={isProcessingAction}
                  onClick={() => setConfirmingAction(null)}
                  className="px-3.5 py-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-bold hover:bg-[var(--color-surface-warm)] transition-colors"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  disabled={isProcessingAction}
                  onClick={handleExecuteDelete}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  {isProcessingAction ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  <span>بله، فرآیند حذف شود</span>
                </button>
              </div>
            </div>
          )}

          {/* Stale Warning Banner */}
          {isStale && (
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="font-bold">هشدار عدم دریافت پاسخ جدید</p>
                <p className="text-amber-700/80 dark:text-amber-300/80 mt-0.5">
                  بیش از ۳ دقیقه است که تغییری در این فرآیند ثبت نشده است. سرویس بازیابی به صورت خودکار وضعیت را بررسی خواهد کرد.
                </p>
              </div>
            </div>
          )}

          {/* Error Message Details (if failed) */}
          {isFailed && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-800 dark:text-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span>علت توقف تولید:</span>
              </div>
              <p className="text-[var(--color-text)] leading-relaxed">
                {sanitizeErrorMessage(currentItem.error)}
              </p>
              {onRetry && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onRetry(currentItem.documentId, currentItem.courseId, currentItem.organizationId)}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>تلاش مجدد تولید</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Canonical Stage Timeline */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-[var(--color-text)] flex items-center gap-2">
              <span>مراحل پایپ‌لاین تولید هوشمند (Timeline)</span>
            </h3>

            <div className="space-y-2">
              {ORDERED_STAGES.map((s, idx) => {
                const isStepCompleted = isCompleted || (idx < currentStageIndex && !isFailed);
                const isStepActive = !isCompleted && !isFailed && idx === currentStageIndex;
                const isStepFailed = isFailed && idx === currentStageIndex;
                const isStepStopped = isStopped && idx === currentStageIndex;
                const IconComponent = s.icon;

                return (
                  <div
                    key={s.stage}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      isStepActive
                        ? "bg-[var(--color-primary-default)]/10 border-[var(--color-primary-default)]/30 text-[var(--color-text)] shadow-sm"
                        : isStepCompleted
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                        : isStepFailed
                        ? "bg-rose-500/10 border-rose-500/20 text-rose-700 dark:text-rose-300"
                        : isStepStopped
                        ? "bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300"
                        : "bg-[var(--color-surface-warm)]/60 border-[var(--color-border)] text-[var(--color-text-muted)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Step Status Indicator Icon */}
                      <div className="w-6 h-6 flex items-center justify-center shrink-0">
                        {isStepCompleted ? (
                          <div className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center justify-center text-xs font-bold">
                            ✓
                          </div>
                        ) : isStepActive ? (
                          <div className="w-5 h-5 rounded-full bg-[var(--color-primary-default)]/20 text-[var(--color-primary-default)] border border-[var(--color-primary-default)]/40 flex items-center justify-center">
                            <Loader2 className="w-3 h-3 animate-spin" />
                          </div>
                        ) : isStepFailed ? (
                          <div className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center justify-center text-xs font-bold">
                            !
                          </div>
                        ) : isStepStopped ? (
                          <div className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 flex items-center justify-center text-xs font-bold">
                            ⏸
                          </div>
                        ) : (
                          <div className="w-4 h-4 rounded-full border border-[var(--color-border)] flex items-center justify-center text-[10px] text-[var(--color-text-muted)]">
                            ○
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <IconComponent className="w-4 h-4 shrink-0 opacity-80" />
                        <span className={`text-xs font-semibold ${isStepActive ? "text-[var(--color-text)]" : ""}`}>
                          {s.label}
                        </span>
                      </div>
                    </div>

                    {/* Step Extra Detail (e.g. 3/12 counter if active) */}
                    <div className="text-xs font-mono">
                      {isStepActive && currentItem.progress ? (
                        <span className="px-2 py-0.5 rounded-full bg-[var(--color-primary-default)]/20 text-[var(--color-primary-default)] border border-[var(--color-primary-default)]/30 font-bold">
                          {currentItem.progress.current} / {currentItem.progress.total}
                        </span>
                      ) : isStepCompleted ? (
                        <span className="text-emerald-600 dark:text-emerald-400 text-[11px]">تکمیل‌شده</span>
                      ) : isStepFailed ? (
                        <span className="text-rose-600 dark:text-rose-400 text-[11px]">خطا</span>
                      ) : isStepStopped ? (
                        <span className="text-amber-600 dark:text-amber-400 text-[11px]">متوقف‌شده</span>
                      ) : (
                        <span className="text-[var(--color-text-muted)] text-[11px]">در انتظار</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[var(--color-border)] flex items-center justify-between gap-3 bg-[var(--color-surface-warm)]/40">
          {/* Action buttons on left (Stop / Delete) */}
          <div className="flex items-center gap-2">
            {isGenerating && onStop && !confirmingAction && (
              <button
                type="button"
                onClick={() => setConfirmingAction("stop")}
                className="px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="توقف فرآیند تولید محتوا"
              >
                <PauseCircle className="w-3.5 h-3.5" />
                <span>توقف تولید</span>
              </button>
            )}

            {(isGenerating || isStopped || isFailed) && onDelete && !confirmingAction && (
              <button
                type="button"
                onClick={() => setConfirmingAction("delete")}
                className="px-3 py-2 rounded-xl border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1.5 transition-colors"
                title="حذف فرآیند تولید و پیش‌نویس‌ها"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>حذف تولید</span>
              </button>
            )}
          </div>

          {/* Primary & Dismiss actions on right */}
          <div className="flex items-center gap-2">
            {(isCompleted || isStopped) && onNavigateToReview && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToReview(currentItem.courseId, currentItem.documentId);
                }}
                className="px-4 py-2 rounded-xl bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
              >
                <span>مشاهده محتوا / صف بازبینی</span>
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}

            {isStopped && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(currentItem.documentId, currentItem.courseId, currentItem.organizationId)}
                className="px-4 py-2 rounded-xl bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-hover)] text-white text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>شروع مجدد تولید</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] text-xs font-bold transition-colors"
            >
              بستن
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : modalContent;
}

