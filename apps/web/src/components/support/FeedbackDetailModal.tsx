import { useState } from "react";
import {
  Dialog,
  DialogFooter,
  Button,
  Badge,
  Alert,
  AvanaSelect,
} from "@avana/ui";
import {
  Paperclip,
  CheckCircle2,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_TYPE_LABELS,
  formatPersianDateTime,
  getFeedbackStatusBadgeVariant,
} from "./supportUiHelpers.js";
import { useAdminRespondFeedback } from "../../hooks/useSupport.js";
import type {
  FeedbackItem,
  FeedbackStatus,
  FeedbackType,
  FeedbackCategory,
} from "@avana/domain";

interface FeedbackDetailModalProps {
  feedback: FeedbackItem | null;
  isOpen: boolean;
  onClose: () => void;
  isAdminMode?: boolean;
  onSuccess?: () => void;
}

export function FeedbackDetailModal({
  feedback,
  isOpen,
  onClose,
  isAdminMode = false,
  onSuccess,
}: FeedbackDetailModalProps) {
  const [adminResponseText, setAdminResponseText] = useState(
    feedback?.adminResponse || "",
  );
  const [targetStatus, setTargetStatus] = useState<string>(
    feedback?.status || "answered",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const respondMutation = useAdminRespondFeedback();

  if (!isOpen || !feedback) return null;

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    try {
      await respondMutation.mutateAsync({
        feedbackId: feedback.id,
        adminResponse: adminResponseText.trim() || null,
        status: targetStatus,
      });
      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      setErrorMessage(
        (err as Error)?.message || "خطا در ثبت پاسخ بازخورد. لطفاً دوباره تلاش کنید.",
      );
    }
  };

  if (!feedback || !isOpen) return null;

  return (
    <Dialog isOpen={isOpen} onClose={onClose} hideHeader maxWidth="xl">
      <div className="p-5 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto" dir="rtl">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <Badge variant={getFeedbackStatusBadgeVariant(feedback.status)}>
              {FEEDBACK_STATUS_LABELS[feedback.status as FeedbackStatus] || feedback.status}
            </Badge>
            <Badge variant="neutral">
              {FEEDBACK_TYPE_LABELS[feedback.type as FeedbackType] || feedback.type}
            </Badge>
            <Badge variant="neutral">
              {FEEDBACK_CATEGORY_LABELS[feedback.category as FeedbackCategory] || feedback.category}
            </Badge>
          </div>
          <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
            {feedback.title}
          </h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            ثبت شده در: {formatPersianDateTime(feedback.createdAt)}
            {feedback.userName && ` • کاربر: ${feedback.userName}`}
          </p>
        </div>

        <div className="space-y-4 py-2 text-xs sm:text-sm">
          {errorMessage && (
            <Alert variant="error" title="خطا">
              {errorMessage}
            </Alert>
          )}

          {/* Feedback Description */}
          <div className="p-4 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
            <div className="text-xs font-semibold text-[var(--color-text-muted)] mb-1.5">
              متن بازخورد کاربر:
            </div>
            <p className="whitespace-pre-wrap leading-relaxed text-[var(--color-text)]">
              {feedback.description}
            </p>

            {feedback.attachmentUrl && (
              <div className="mt-3 pt-2.5 border-t border-[var(--color-border)]">
                <a
                  href={feedback.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-xs font-medium text-primary hover:bg-[var(--color-surface-warm)] transition-colors"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span>مشاهده پیوست بازخورد</span>
                  <ExternalLink className="w-3 h-3 opacity-70" />
                </a>
              </div>
            )}
          </div>

          {/* Existing Admin Response View */}
          {feedback.adminResponse && !isAdminMode && (
            <div className="p-4 rounded-2xl bg-[#008080]/10 border border-[#008080]/30 text-[var(--color-text)]">
              <div className="flex items-center gap-2 mb-2 text-[#008080] font-bold text-xs">
                <ShieldCheck className="w-4 h-4" />
                <span>پاسخ تیم پشتیبانی آوانا:</span>
                {feedback.respondedAt && (
                  <span className="text-[10px] font-normal opacity-80 mr-auto">
                    {formatPersianDateTime(feedback.respondedAt)}
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap leading-relaxed text-xs sm:text-sm">
                {feedback.adminResponse}
              </p>
            </div>
          )}

          {/* Admin Response Form */}
          {isAdminMode && (
            <form onSubmit={handleAdminSubmit} className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  وضعیت بازخورد
                </label>
                <AvanaSelect
                  value={targetStatus}
                  onChange={(val) => setTargetStatus(String(Array.isArray(val) ? val[0] : val))}
                  options={[
                    { value: "in_review", label: "در حال بررسی" },
                    { value: "answered", label: "پاسخ داده شده" },
                    { value: "closed", label: "بستن بازخورد" },
                  ]}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-text)] mb-1.5">
                  پاسخ رسمی ادمین به کاربر (اختیاری)
                </label>
                <textarea
                  rows={4}
                  value={adminResponseText}
                  onChange={(e) => setAdminResponseText(e.target.value)}
                  placeholder="پاسخ خود را برای این بازخورد بنویسید (در صورت ثبت، برای کاربر پیام اعلان ارسال می‌شود)..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-xs sm:text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none font-sans"
                  disabled={respondMutation.isPending}
                />
              </div>

              <DialogFooter className="gap-2 sm:gap-0 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={onClose}
                  disabled={respondMutation.isPending}
                >
                  بستن
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={respondMutation.isPending}
                  leftIcon={<CheckCircle2 className="w-4 h-4" />}
                >
                  ثبت پاسخ و تغییر وضعیت
                </Button>
              </DialogFooter>
            </form>
          )}
        </div>

        {!isAdminMode && (
          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              بستن
            </Button>
          </DialogFooter>
        )}
      </div>
    </Dialog>
  );
}
