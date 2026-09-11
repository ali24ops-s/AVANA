import { useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Sparkles,
  BookOpen,
  Layers,
  HelpCircle,
  Clock,
} from "lucide-react";
import { Button } from "@avana/ui";

export interface ComingSoonGenerationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ComingSoonGenerationModal({
  isOpen,
  onClose,
}: ComingSoonGenerationModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="coming-soon-title"
    >
      <div
        className="w-full max-w-lg bg-[var(--color-surface)] border border-[var(--color-border)] rounded-3xl shadow-2xl overflow-hidden flex flex-col transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3
                  id="coming-soon-title"
                  className="text-base font-bold text-[var(--color-text)]"
                >
                  تولید هوشمند محتوا
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  به‌زودی
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                پایپ‌لاین هوش مصنوعی یادگیری شخصی‌سازی‌شده
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنجره"
            className="p-2 text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Notice Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-500/10 via-teal-500/5 to-transparent border border-amber-500/20 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-500 mx-auto flex items-center justify-center shadow-inner">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <h4 className="text-sm font-bold text-[var(--color-text)]">
              قابلیت تولید محتوای هوشمند به‌زودی در آوانا فعال خواهد شد.
            </h4>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed max-w-md mx-auto">
              این قابلیت در حال حاضر در فاز آزمایشی قرار دارد و به زودی پس از ارتقای کیفیت و اعتبارسنجی بالینی در دسترس کلیه کاربران قرار خواهد گرفت.
            </p>
          </div>

          {/* Planned Features Preview */}
          <div className="space-y-3">
            <h5 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
              امکاناتی که در این بخش در دسترس شما قرار می‌گیرد:
            </h5>
            <div className="grid gap-2.5">
              <div className="flex items-start gap-3 p-3 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
                <div className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 mt-0.5">
                  <BookOpen className="w-4 h-4" />
                </div>
                <div>
                  <h6 className="text-xs font-bold text-[var(--color-text)]">
                    تولید خودکار درسنامه‌های آموزشی
                  </h6>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                    تبدیل جزوات سنگین به فصول ساختاریافته همراه با خلاصه‌های مفهومی و نکات کنکوری
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
                <div className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 mt-0.5">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h6 className="text-xs font-bold text-[var(--color-text)]">
                    ساخت فلش‌کارت‌های فعال (SRS)
                  </h6>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                    استخراج کارت‌های مرور هوشمند بر پایه تکرار فاصله‌دار ویژه شب امتحان
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-3 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
                <div className="p-2 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 mt-0.5">
                  <HelpCircle className="w-4 h-4" />
                </div>
                <div>
                  <h6 className="text-xs font-bold text-[var(--color-text)]">
                    آزمون‌های استاندارد چهارگزینه‌ای
                  </h6>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                    طراحی تست‌های تالیفی و تفکیکی به همراه پاسخنامه تشریحی و ارجاع به متن
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[var(--color-surface-warm)] border-t border-[var(--color-border)] flex items-center justify-end">
          <Button
            variant="primary"
            size="md"
            onClick={onClose}
            className="w-full sm:w-auto px-6 font-bold"
          >
            متوجه شدم
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
