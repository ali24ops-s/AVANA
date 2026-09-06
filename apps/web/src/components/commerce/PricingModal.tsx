import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
import {
  useCommerceProducts,
  useCheckout,
} from "../../hooks/useCommerce.js";
import { useAuth } from "../../providers/AuthProvider.js";

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
  const checkoutMutation = useCheckout();

  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    initialProductId,
  );
  const [paymentMethod, setPaymentMethod] = useState<"online" | "card_to_card">(
    "online",
  );
  const [formError, setFormError] = useState<string | null>(null);

  // Sync initialProductId when modal opens or initialProductId changes
  useEffect(() => {
    if (initialProductId) {
      setSelectedProductId(initialProductId);
    }
  }, [initialProductId, isOpen]);

  // Lock background body scroll while modal is active
  useEffect(() => {
    if (isOpen) {
      if (typeof document !== "undefined") {
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
          document.body.style.overflow = prevOverflow;
        };
      }
    }
  }, [isOpen]);

  // Handle ESC key to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const products =
    productsData?.items.filter((p) => p.type === "subscription") ?? [];

  // Default select yearly or quarterly if none selected
  const activeSelectedId =
    selectedProductId ??
    products.find((p) => p.code === "sub_yearly")?.id ??
    products[0]?.id;

  const selectedProduct = products.find((p) => p.id === activeSelectedId);

  const handleOnlineCheckout = (productId: string) => {
    setFormError(null);

    if (!isAuthenticated) {
      const redirectUrl = encodeURIComponent(window.location.pathname + window.location.search);
      window.location.href = `/login?redirect=${redirectUrl}`;
      return;
    }

    checkoutMutation.mutate(
      {
        product_id: productId,
        callback_url: `${window.location.origin}/checkout/callback`,
      },
      {
        onError: (err: any) => {
          const msg =
            err.envelope?.error?.message ||
            err.message ||
            "خطا در برقراری ارتباط با درگاه پرداخت. لطفاً دوباره تلاش کنید.";
          setFormError(msg);
        },
      },
    );
  };

  const handleCardToCardProceed = (productId: string) => {
    setFormError(null);
    onClose();

    if (!isAuthenticated) {
      const targetUrl = `/checkout/card-to-card?productId=${encodeURIComponent(productId)}`;
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

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pricing-modal-title"
    >
      {/* Full-viewport Backdrop overlay with smooth blur */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-md transition-opacity animate-in fade-in duration-200"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Floating Modal Panel */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-2xl sm:rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden my-auto flex flex-col max-h-[calc(100dvh-2rem)] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="relative shrink-0 p-5 sm:p-6 md:p-8 bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900 text-white text-center">
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
            className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight"
          >
            {title}
          </h2>
          <p className="mt-1.5 sm:mt-2 text-zinc-200 text-xs sm:text-sm md:text-base max-w-xl mx-auto">
            {subtitle}
          </p>
        </div>

        {/* Scrollable Content Body */}
        <div className="p-4 sm:p-6 md:p-8 overflow-y-auto space-y-6 flex-1 min-h-0">
          {isLoadingProducts ? (
            <div className="py-12 sm:py-16 flex flex-col items-center justify-center text-zinc-500 dark:text-zinc-400 gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-600 dark:text-indigo-400" />
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
                          ? "border-indigo-600 dark:border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30 shadow-lg scale-[1.01] sm:scale-[1.02]"
                          : "border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 bg-white dark:bg-zinc-900"
                      }`}
                    >
                      {isYearly && (
                        <div className="absolute -top-3 right-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow">
                          بیشترین تخفیف (۵۰٪)
                        </div>
                      )}
                      {isQuarterly && (
                        <div className="absolute -top-3 right-4 bg-indigo-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow">
                          محبوب‌ترین
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-base sm:text-lg text-zinc-900 dark:text-white">
                            {product.title}
                          </h3>
                          <div
                            className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                              isSelected
                                ? "border-indigo-600 bg-indigo-600 text-white"
                                : "border-zinc-300 dark:border-zinc-600"
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5" />}
                          </div>
                        </div>

                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 min-h-[28px] sm:min-h-[32px]">
                          {product.description}
                        </p>

                        <div className="mt-3 sm:mt-4 pt-3 sm:pt-4 border-t border-zinc-100 dark:border-zinc-800/80">
                          <div className="flex items-baseline gap-1">
                            <span className="text-xl sm:text-2xl md:text-3xl font-black text-zinc-900 dark:text-white">
                              {product.price.toLocaleString("fa-IR")}
                            </span>
                            <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                              تومان
                            </span>
                          </div>
                          <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                            {product.duration_days === 30 && "به ازای ۱ ماه"}
                            {product.duration_days === 90 &&
                              `به ازای ۳ ماه (ماهی ${Math.round(product.price / 3).toLocaleString("fa-IR")} تومان)`}
                            {product.duration_days === 365 &&
                              `به ازای ۱ سال (ماهی ${Math.round(product.price / 12).toLocaleString("fa-IR")} تومان)`}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 2. Payment Method Switcher */}
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 p-1.5 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod("online");
                    setFormError(null);
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    paymentMethod === "online"
                      ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-zinc-200/80 dark:border-zinc-700/80"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>درگاه پرداخت آنلاین (شتاب)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod("card_to_card");
                    setFormError(null);
                  }}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    paymentMethod === "card_to_card"
                      ? "bg-white dark:bg-zinc-900 text-indigo-600 dark:text-indigo-400 shadow-sm border border-zinc-200/80 dark:border-zinc-700/80"
                      : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                  }`}
                >
                  <Zap className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span>کارت‌به‌کارت (فعال‌سازی فوری)</span>
                </button>
              </div>

              {/* Global Error Banner */}
              {formError && (
                <div className="flex items-center gap-2 p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-xs border border-rose-200 dark:border-rose-800/50 animate-in fade-in duration-200">
                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 3. Selected Plan & Payment Method Summary */}
              <div className="rounded-2xl bg-indigo-50/30 dark:bg-indigo-950/20 border border-indigo-200/60 dark:border-indigo-900/40 p-4 sm:p-6 space-y-4 animate-in fade-in duration-200">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-white dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/60">
                  <div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">پلن انتخابی:</div>
                    <div className="text-base sm:text-lg font-black text-zinc-900 dark:text-white mt-0.5">
                      {selectedProduct?.title}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      مدت اعتبار: <strong>{selectedProduct?.duration_days} روز</strong>
                    </div>
                  </div>

                  <div className="text-right sm:text-left">
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">مبلغ قابل پرداخت:</div>
                    <div className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
                      {selectedProduct?.price.toLocaleString("fa-IR")} تومان
                    </div>
                  </div>
                </div>

                {paymentMethod === "online" ? (
                  <div className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                    <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span>اتصال مستقیم و امن به درگاه شاپرک با فعال‌سازی خودکار و آنی</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
                    <Zap className="w-4 h-4 text-amber-500 shrink-0 fill-current" />
                    <span>
                      انتقال به صفحه اختصاصی پرداخت کارت‌به‌کارت جهت دریافت شماره کارت و ثبت اطلاعات واریز
                    </span>
                  </div>
                )}
              </div>

              {/* 4. Feature Highlights */}
              <div className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/50 p-4 sm:p-5 border border-zinc-100 dark:border-zinc-800">
                <h4 className="text-xs sm:text-sm font-bold text-zinc-800 dark:text-zinc-200 mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>امکانات اختصاصی مشترکین آوانا پلاس:</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-2.5">
                  {features.map((feat, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-xs sm:text-sm text-zinc-700 dark:text-zinc-300"
                    >
                      <div className="w-4 h-4 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3" />
                      </div>
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer with Dynamic Action Button */}
        <div className="shrink-0 p-4 sm:p-6 border-t border-zinc-100 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 text-center sm:text-right">
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>پرداخت امن با ضمانت بازگشت وجه و فعال‌سازی آنی</span>
            </div>

            {paymentMethod === "online" ? (
              <button
                type="button"
                disabled={!activeSelectedId || checkoutMutation.isPending}
                onClick={() => activeSelectedId && handleOnlineCheckout(activeSelectedId)}
                className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm sm:text-base shadow-lg shadow-indigo-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {checkoutMutation.isPending ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>انتقال به درگاه بانکی...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-5 h-5" />
                    <span>پرداخت آنلاین و فعال‌سازی</span>
                  </>
                )}
              </button>
            ) : (
              <button
                type="button"
                disabled={!activeSelectedId}
                onClick={() => activeSelectedId && handleCardToCardProceed(activeSelectedId)}
                className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white font-bold text-sm sm:text-base shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Zap className="w-5 h-5 fill-current text-white" />
                <span>ادامه جهت پرداخت کارت‌به‌کارت</span>
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modalContent, document.body)
    : null;
};
