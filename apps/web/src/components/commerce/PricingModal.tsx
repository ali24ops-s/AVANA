import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  X,
  Check,
  Sparkles,
  Zap,
  ShieldCheck,
  Crown,
  Loader2,
  CreditCard,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { useCommerceProducts } from "../../hooks/useCommerce.js";
import { useAuth } from "../../providers/AuthProvider.js";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Button,
} from "@avana/ui";

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  initialProductId?: string | null;
}

export const PricingModal: React.FC<PricingModalProps> = ({
  isOpen,
  onClose,
  title = "ارتقا به آوانا پلاس (اشتراک ویژه)",
  subtitle = "با فعال‌سازی اشتراک، قفل تمام امکانات پیشرفته و محتوای دوره‌ها را باز کنید.",
  initialProductId = null,
}) => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { data: productsData, isLoading: isLoadingProducts } =
    useCommerceProducts();

  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    initialProductId,
  );
  const [formError, setFormError] = useState<string | null>(null);

  // Sync initialProductId when modal opens or initialProductId changes
  useEffect(() => {
    if (initialProductId) {
      setSelectedProductId(initialProductId);
    }
  }, [initialProductId, isOpen]);

  if (!isOpen) return null;

  const products =
    productsData?.items.filter((p) => p.type === "subscription") ?? [];

  // Default select yearly or quarterly if none selected
  const activeSelectedId =
    selectedProductId ??
    products.find((p) => p.code === "sub_yearly")?.id ??
    products[0]?.id;

  const selectedProduct = products.find((p) => p.id === activeSelectedId);

  const handleCardToCardProceed = (productId: string) => {
    setFormError(null);
    onClose();

    if (!isAuthenticated) {
      const targetUrl = `/checkout/card-to-card?productId=${encodeURIComponent(
        productId,
      )}`;
      navigate(`/login?redirect=${encodeURIComponent(targetUrl)}`);
      return;
    }

    navigate(`/checkout/card-to-card?productId=${encodeURIComponent(productId)}`);
  };

  const features = [
    "دسترسی کامل و نامحدود به متن تمام درسنامه‌ها",
    "مرور هوشمند فلش‌کارت‌ها با الگوریتم فاصله‌گذاری FSRS",
    "آزمون‌های جامع همراه با تحلیل عملکرد و پاسخ تشریحی",
    "گفتگوی نامحدود با دستیار هوشمند آموزشی آوانا (AI Tutor)",
    "نصب و استفاده از تمام بسته‌های آموزشی کتابخانه عمومی",
  ];

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="4xl"
      containerClassName="z-[9999]"
      hideHeader
    >
      {/* Header Banner */}
      <DialogHeader
        hideCloseButton
        className="relative shrink-0 p-5 sm:p-6 md:p-8 bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 text-white text-center border-b-0 block"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 left-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-white focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer"
          aria-label="بستن"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-semibold mb-2 sm:mb-3 border border-amber-400/30">
          <Crown className="w-4 h-4 text-amber-400" />
          <span>تجربه یادگیری بدون محدودیت</span>
        </div>

        <h2
          id="pricing-modal-title"
          className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight text-white"
        >
          {title}
        </h2>

        <p className="mt-1.5 sm:mt-2 text-zinc-200 text-xs sm:text-sm md:text-base max-w-xl mx-auto">
          {subtitle}
        </p>
      </DialogHeader>

      {/* Scrollable Content Body */}
      <DialogContent className="p-4 sm:p-6 md:p-8 space-y-6 flex-1 min-h-0">
        {isLoadingProducts ? (
          <div className="py-12 sm:py-16 flex flex-col items-center justify-center text-[var(--color-text-muted)] gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-[#008080]" />
            <span className="text-sm">در حال بارگذاری پلن‌های اشتراک...</span>
          </div>
        ) : (
          <>
            {/* 1. Plan Selection Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
              {products.map((product) => {
                const isSelected = product.id === activeSelectedId;
                const isYearly = product.code === "sub_yearly";
                const isQuarterly = product.code === "sub_quarterly";

                return (
                  <div
                    key={product.id}
                    onClick={() => {
                      setSelectedProductId(product.id);
                      setFormError(null);
                    }}
                    className={`relative rounded-2xl p-4 sm:p-5 cursor-pointer border-2 transition-all flex flex-col justify-between ${
                      isSelected
                        ? "border-[#008080] bg-[#008080]/10 shadow-lg scale-[1.01] sm:scale-[1.02]"
                        : "border-[var(--color-border)] hover:border-[#008080]/40 bg-[var(--color-surface)]"
                    }`}
                  >
                    {isYearly && (
                      <div className="absolute -top-3 right-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow">
                        بیشترین تخفیف (۵۰٪)
                      </div>
                    )}
                    {isQuarterly && (
                      <div className="absolute -top-3 right-4 bg-[#008080] text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow">
                        محبوب‌ترین
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-base sm:text-lg text-[var(--color-text)]">
                          {product.title}
                        </h3>
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? "border-[#008080] bg-[#008080] text-white"
                              : "border-[var(--color-border)]"
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>
                      </div>

                      <p className="text-xs text-[var(--color-text-muted)] mt-1 min-h-[28px] sm:min-h-[32px]">
                        {product.description}
                      </p>

                      <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-[var(--color-border)]">
                        <div className="flex items-baseline gap-1">
                          <span className="text-xl sm:text-2xl md:text-3xl font-black text-[var(--color-text)]">
                            {product.price.toLocaleString("fa-IR")}
                          </span>
                          <span className="text-xs text-[var(--color-text-muted)] font-medium">
                            تومان
                          </span>
                        </div>
                        <div className="text-xs text-[var(--color-text-muted)] mt-0.5 opacity-80">
                          {product.duration_days === 30 && "به ازای ۱ ماه"}
                          {product.duration_days === 90 &&
                            `به ازای ۳ ماه (ماهی ${Math.round(
                              product.price / 3,
                            ).toLocaleString("fa-IR")} تومان)`}
                          {product.duration_days === 365 &&
                            `به ازای ۱ سال (ماهی ${Math.round(
                              product.price / 12,
                            ).toLocaleString("fa-IR")} تومان)`}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 2. Payment Method Switcher */}
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] p-1.5 flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod("card_to_card");
                  setFormError(null);
                }}
                className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer bg-[var(--color-surface)] text-[#008080] shadow-sm border border-[var(--color-border)]"
              >
                <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span>کارت‌به‌کارت (فعال‌سازی فوری)</span>
              </button>

              <button
                type="button"
                disabled
                aria-disabled="true"
                className="flex-1 py-2.5 px-3 rounded-xl font-medium text-xs sm:text-sm flex items-center justify-center gap-2 text-[var(--color-text-muted)] opacity-60 cursor-not-allowed border border-transparent"
              >
                <CreditCard className="w-4 h-4 opacity-50" />
                <span>پرداخت آنلاین</span>
                <span className="text-[10px] bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full font-bold border border-amber-500/30">
                  به‌زودی
                </span>
              </button>
            </div>

            {/* Global Error Banner */}
            {formError && (
              <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs border border-rose-500/20 animate-in fade-in duration-200">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* 3. Selected Plan & Payment Method Summary */}
            <div className="rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] p-4 sm:p-6 space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)]">
                <div>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    پلن انتخابی:
                  </div>
                  <div className="text-base sm:text-lg font-black text-[var(--color-text)] mt-0.5">
                    {selectedProduct?.title}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-1">
                    مدت اعتبار:{" "}
                    <strong>{selectedProduct?.duration_days} روز</strong>
                  </div>
                </div>

                <div className="text-right sm:text-left">
                  <div className="text-xs text-[var(--color-text-muted)]">
                    مبلغ قابل پرداخت:
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-[#008080] mt-0.5">
                    {selectedProduct?.price.toLocaleString("fa-IR")} تومان
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                <Zap className="w-4 h-4 text-amber-500 shrink-0 fill-current" />
                <span>
                  انتقال به صفحه اختصاصی پرداخت کارت‌به‌کارت جهت دریافت شماره
                  کارت و ثبت اطلاعات واریز
                </span>
              </div>
            </div>

            {/* 4. Feature Highlights */}
            <div className="rounded-2xl bg-[var(--color-surface-warm)] p-4 sm:p-5 border border-[var(--color-border)]">
              <h4 className="text-xs sm:text-sm font-bold text-[var(--color-text)] mb-3 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>امکانات اختصاصی مشترکین آوانا پلاس:</span>
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
                {features.map((feat, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-xs sm:text-sm text-[var(--color-text)]"
                  >
                    <div className="w-4 h-4 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" />
                    </div>
                    <span>{feat}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>

      {/* Modal Footer with Dynamic Action Button */}
      <DialogFooter className="shrink-0 p-4 sm:p-6 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)] flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] text-center sm:text-right">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>پرداخت امن با ضمانت بازگشت وجه و فعال‌سازی آنی</span>
        </div>

        <Button
          size="lg"
          variant="primary"
          disabled={!activeSelectedId}
          onClick={() =>
            activeSelectedId && handleCardToCardProceed(activeSelectedId)
          }
          className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold text-sm sm:text-base shadow-lg shadow-amber-500/25 border-none gap-2 justify-center cursor-pointer"
          leftIcon={<Zap className="w-5 h-5 fill-current text-white" />}
          rightIcon={<ArrowLeft className="w-4 h-4" />}
        >
          <span>ادامه جهت پرداخت کارت‌به‌کارت</span>
        </Button>
      </DialogFooter>
    </Dialog>
  );
};
