import React from "react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
} from "@avana/ui";
import {
  Sparkles,
  CheckCircle2,
  FileText,
  Scissors,
  Library,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";

export interface ContentGenerationGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartLearning?: () => void;
}

export const ContentGenerationGuideModal: React.FC<ContentGenerationGuideModalProps> = ({
  isOpen,
  onClose,
  onStartLearning,
}) => {
  const handleConfirm = () => {
    onClose();
    if (onStartLearning) {
      onStartLearning();
    }
  };

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="2xl"
      ariaLabel="راهنمای تولید محتوای هوشمند"
    >
      <DialogHeader onClose={onClose} className="p-5 sm:p-6 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
        <div className="flex items-center gap-3" dir="rtl">
          <div className="w-10 h-10 rounded-2xl bg-[#008080]/10 border border-[#008080]/20 flex items-center justify-center text-[#008080] shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              راهنمای تولید محتوای هوشمند در آوانا
            </h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              ۵ نکته کلیدی برای تولید دقیق‌ترین درسنامه‌ها، فلش‌کارت‌ها و آزمون‌های استاندارد
            </p>
          </div>
        </div>
      </DialogHeader>

      <DialogContent className="p-4 sm:p-6 space-y-4 max-h-[75vh] overflow-y-auto">
        <div className="space-y-4" dir="rtl">
        {/* Card 1: Readability score (> 90%) */}
        <div
          data-testid="guide-tip-readability"
          className="p-3.5 sm:p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[#008080]/40 transition-colors shadow-2xs flex items-start gap-3.5"
        >
          <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <h4 className="text-sm font-bold text-[var(--color-text)]">
              ۱. کیفیت خوانش فایل (توصیه به بالای ۹۰٪)
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              توصیه می‌کنیم فایلی با کیفیت خوانش بالاتر از ۹۰٪ انتخاب کنید. درصد پایین‌تر نشان‌دهنده ناخوانایی، حروف به‌هم‌ریخته یا احتمال مشکل در استخراج دقیق متن توسط هوش مصنوعی است.
            </p>
          </div>
        </div>

        {/* Card 2: Low-quality files -> copy to Word */}
        <div
          data-testid="guide-tip-low-quality"
          className="p-3.5 sm:p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[#008080]/40 transition-colors shadow-2xs flex items-start gap-3.5"
        >
          <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <FileText className="w-4 h-4" />
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <h4 className="text-sm font-bold text-[var(--color-text)]">
              ۲. فایل‌های کم‌کیفیت یا اسکن‌شده
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              اگر فایل پی‌دی‌اف شما کیفیت خوانش پایینی دارد، پیشنهاد می‌شود متن قابل‌دسترس آن را به یک فایل Word مرتب کپی کرده و مجدداً بارگذاری کنید تا محتوایی بدون نقص و دقیق ایجاد شود.
            </p>
          </div>
        </div>

        {/* Card 3: Large files -> split into chapters */}
        <div
          data-testid="guide-tip-large-files"
          className="p-3.5 sm:p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[#008080]/40 transition-colors shadow-2xs flex items-start gap-3.5"
        >
          <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <Scissors className="w-4 h-4" />
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <h4 className="text-sm font-bold text-[var(--color-text)]">
              ۳. فایل‌های حجیم و منابع بزرگ
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              توصیه می‌شود محتوای بزرگ یا کتاب‌های چندصد صفحه‌ای را به فصل‌ها یا بخش‌های کوچک‌تر تقسیم کنید؛ حجم زیاد در یک مرحله ممکن است کیفیت و تمرکز پردازش هوش مصنوعی را کاهش دهد.
            </p>
          </div>
        </div>

        {/* Card 4: Check Library first */}
        <div
          data-testid="guide-tip-library"
          className="p-3.5 sm:p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[#008080]/40 transition-colors shadow-2xs flex items-start gap-3.5"
        >
          <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <Library className="w-4 h-4" />
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <h4 className="text-sm font-bold text-[var(--color-text)]">
              ۴. بررسی کتابخونه آوانا پیش از تولید
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              پیش از بارگذاری فایل و پرداخت هزینه برای تولید محتوا، حتماً کتابخونه آوانا را بررسی کنید. در صورتی که محتوای موردنظر شما از قبل موجود باشد، نیازی به پرداخت هزینه غیرضروری نخواهید داشت.
            </p>
          </div>
        </div>

        {/* Card 5: Poor output & reproduction check */}
        <div
          data-testid="guide-tip-reproduction"
          className="p-3.5 sm:p-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[#008080]/40 transition-colors shadow-2xs flex items-start gap-3.5"
        >
          <div className="w-9 h-9 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div className="space-y-1 min-w-0 flex-1">
            <h4 className="text-sm font-bold text-[var(--color-text)]">
              ۵. خروجی غیرعادی ضعیف و بازتولید
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              در صورت دریافت خروجی با کیفیت غیرعادی ضعیف، پیش از بازتولید مجدد حتماً فایل ورودی و کیفیت خوانش آن را بررسی کنید؛ زیرا تولید مجدد بدون رفع مشکل ورودی ممکن است هزینه اضافی بدون تغییر نتیجه ایجاد کند.
            </p>
          </div>
        </div>

        {/* Encouraging closing note */}
        <div
          data-testid="guide-closing-encouragement"
          className="p-4 rounded-2xl bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 flex items-center gap-3.5 text-start"
        >
          <div className="w-9 h-9 rounded-xl bg-[#008080] text-white flex items-center justify-center shrink-0 shadow-xs">
            <Sparkles className="w-4 h-4" />
          </div>
          <p className="text-xs sm:text-sm font-bold text-teal-950 dark:text-teal-100 leading-relaxed">
            آماده‌اید؟ برای شروع، پیشنهاد می‌کنیم کار را با بارگذاری یک فصل باکیفیت و با حجم مناسب آغاز کنید تا کیفیت عالی تولید محتوای آوانا را مشاهده نمایید.
          </p>
        </div>
        </div>
      </DialogContent>

      <DialogFooter className="p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--color-surface-warm)] border-t border-[var(--color-border)]">
        <span className="text-xs text-[var(--color-text-muted)] text-start" dir="rtl">
          همواره می‌توانید از دکمه «راهنمای تولید محتوا» در بالای صفحه به این نکات دسترسی داشته باشید.
        </span>
        <div className="flex items-center gap-2 justify-end" dir="rtl">
          <Button
            variant="primary"
            size="md"
            onClick={handleConfirm}
            className="w-full sm:w-auto flex items-center justify-center gap-2 cursor-pointer font-bold"
          >
            <span>متوجه شدم و شروع</span>
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </div>
      </DialogFooter>
    </Dialog>
  );
};
