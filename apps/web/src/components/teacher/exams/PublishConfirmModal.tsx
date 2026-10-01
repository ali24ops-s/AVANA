/**
 * PublishConfirmModal component.
 *
 * Explicit confirmation dialog before publishing an exam.
 * Explains that questions and options become permanently immutable upon publication.
 */

import { useState } from "react";
import { Dialog, DialogHeader, DialogContent, DialogFooter, Button, Alert } from "../../ui/index.js";
import { formatPersianExamDateTime, formatPersianExamTimeRange } from "../../../utils/date.js";
import { Send, AlertTriangle, Lock, Calendar } from "lucide-react";

export interface PublishConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isPublishing: boolean;
  questionsCount: number;
  startsAt: string;
  endsAt: string;
}

export function PublishConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  isPublishing,
  questionsCount,
  startsAt,
  endsAt,
}: PublishConfirmModalProps) {
  const [error, setError] = useState<string | null>(null);

  const canPublish = questionsCount > 0;

  const handleConfirm = async () => {
    setError(null);
    if (!canPublish) {
      setError("آزمون باید حداقل دارای یک سوال باشد تا بتواند منتشر شود.");
      return;
    }

    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در انتشار آزمون");
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={isPublishing ? () => {} : onClose}
      maxWidth="md"
      ariaLabel="انتشار آزمون"
    >
      <DialogHeader onClose={isPublishing ? undefined : onClose}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#008080]/10 text-[#008080] flex items-center justify-center shrink-0">
            <Send className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)] leading-snug">
              انتشار رسمی آزمون
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              تأیید نهایی برای انتشار آزمون در کلاس
            </p>
          </div>
        </div>
      </DialogHeader>

      <DialogContent>
        <div className="space-y-4 text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed">
          {error && (
            <Alert variant="error" title="خطا">
              {error}
            </Alert>
          )}

          {!canPublish ? (
            <Alert variant="warning" title="عدم وجود سوال">
              این آزمون هیچ سوالی ندارد. لطفاً ابتدا حداقل یک سوال طرح کرده و سپس اقدام به انتشار کنید.
            </Alert>
          ) : (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-[#008080]/10 border border-[#008080]/20 text-xs sm:text-sm text-[#008080] leading-relaxed">
                با انتشار آزمون، این آزمون برای دانشجویان کلاس <strong>قابل مشاهده</strong> می‌شود؛ اما شروع پاسخگویی فقط در <strong>بازه زمانی تعیین‌شده</strong> امکان‌پذیر خواهد بود.
              </div>
              <Alert variant="warning" title="قفل شدن سوالات پس از انتشار">
                <div className="flex items-start gap-2 mt-1">
                  <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    به منظور حفظ یکپارچگی ارزیابی دانشجویان، پس از انتشار آزمون، سوالات، بارم و گزینه‌ها قفل شده و قابل تغییر نخواهند بود.
                  </span>
                </div>
              </Alert>
            </div>
          )}

          <div className="bg-[var(--color-surface-warm)]/60 p-3.5 rounded-xl border border-[var(--color-border)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-muted)]">تعداد سوالات آماده:</span>
              <span className="font-bold text-[var(--color-text)]">
                {questionsCount.toLocaleString("fa-IR")} سوال
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-muted)]">زمان شروع برگزاری:</span>
              <span className="font-medium text-[var(--color-text)]">
                {formatPersianExamDateTime(startsAt)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[var(--color-text-muted)]">مهلت پایان برگزاری:</span>
              <span className="font-medium text-[var(--color-text)]">
                {formatPersianExamDateTime(endsAt)}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>

      <DialogFooter>
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isPublishing}
          >
            انصراف
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            isLoading={isPublishing}
            disabled={isPublishing || !canPublish}
            leftIcon={<Send className="w-3.5 h-3.5" />}
          >
            تأیید و انتشار آزمون
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
}
