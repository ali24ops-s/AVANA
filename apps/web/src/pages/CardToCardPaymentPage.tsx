/**
 * Dedicated Card-to-Card Payment Page.
 *
 * Route: `/checkout/card-to-card` (or `/payment/card-to-card`)
 *
 * Implements:
 * - Authoritative product & pricing summary from Commerce catalog
 * - Destination card details (1-click copy, cardholder name, exact amount)
 * - Single-step SMS/Receipt text paste & automated extraction (Rule-based & AI Fallback)
 * - Structured Preview with in-place editable correction
 * - Highlighting of missing/low-confidence fields
 * - Optional receipt URL/image section
 * - User confirmation & instant subscription activation
 */

import React, { useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import {
  CreditCard,
  Copy,
  CheckCheck,
  Zap,
  ShieldCheck,
  AlertCircle,
  PartyPopper,
  Loader2,
  ArrowRight,
  Calendar,
  Clock,
  Crown,
  Check,
  HelpCircle,
  Sparkles,
  Edit3,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  UploadCloud,
} from "lucide-react";
import {
  useCommerceProducts,
  useCardToCardInfo,
  useSubmitCardToCardPayment,
  useExtractCardToCardPayment,
} from "../hooks/useCommerce.js";
import { useAuth } from "../providers/AuthProvider.js";

export function CardToCardPaymentPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const rawProductId = searchParams.get("productId") || searchParams.get("product_id");

  const { data: productsData, isLoading: isProdLoading } = useCommerceProducts();
  const { data: c2cInfo, isLoading: isC2cLoading } = useCardToCardInfo();
  const c2cMutation = useSubmitCardToCardPayment();
  const extractMutation = useExtractCardToCardPayment();

  // Find product from backend catalog (subscriptions, courses, packs)
  const allProducts = productsData?.items ?? [];
  const selectedProduct =
    allProducts.find((p) => p.id === rawProductId || p.code === rawProductId) ||
    allProducts.find((p) => p.type === "subscription") ||
    allProducts[0];

  // Extraction & Form states
  const [paymentText, setPaymentText] = useState("");
  const [hasExtracted, setHasExtracted] = useState(false);
  const [isManualMode, setIsManualMode] = useState(false);
  const [extractionMethod, setExtractionMethod] = useState<"rule" | "ai" | "hybrid" | "manual">("manual");
  const [fieldConfidence, setFieldConfidence] = useState<Record<string, "high" | "medium" | "low">>({});
  const [missingFields, setMissingFields] = useState<string[]>([]);

  // Structured fields
  const [trackingNumber, setTrackingNumber] = useState("");
  const [sourceCardLast4, setSourceCardLast4] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => {
    try {
      return new Date().toLocaleDateString("fa-IR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch {
      return new Date().toISOString().split("T")[0];
    }
  });
  const [paymentTime, setPaymentTime] = useState(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [payerName, setPayerName] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");

  const [copiedCard, setCopiedCard] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);

  const destinationNumber =
    c2cInfo?.destinationCardNumber || "5894631131738239";

  const handleCopyCard = (cardNum: string) => {
    const cleanNum = cardNum.replace(/-/g, "").replace(/\s/g, "");
    navigator.clipboard.writeText(cleanNum);
    setCopiedCard(true);
    setTimeout(() => setCopiedCard(false), 2500);
  };

  const formatCardNumberWithSpaces = (cardNum: string) => {
    const clean = cardNum.replace(/\D/g, "");
    if (clean.length === 16) {
      return `${clean.slice(0, 4)} ${clean.slice(4, 8)} ${clean.slice(8, 12)} ${clean.slice(12, 16)}`;
    }
    return cardNum;
  };

  const handleExtract = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setExtractError(null);
    setFormError(null);

    const trimmedText = paymentText.trim();
    if (!trimmedText) {
      setExtractError("لطفاً ابتدا متن پیامک یا اطلاعات تراکنش را در کادر Paste کنید.");
      return;
    }

    extractMutation.mutate(
      {
        text: trimmedText,
        product_id: selectedProduct?.id,
        use_ai_fallback: true,
      },
      {
        onSuccess: (res) => {
          setHasExtracted(true);
          setExtractionMethod(res.extractionMethod);
          setFieldConfidence(res.confidence);
          setMissingFields(res.missingFields || []);

          if (res.data.trackingNumber) {
            setTrackingNumber(res.data.trackingNumber);
          }
          if (res.data.sourceCardLast4) {
            setSourceCardLast4(res.data.sourceCardLast4);
          }
          if (res.data.paymentDate) {
            setPaymentDate(res.data.paymentDate);
          }
          if (res.data.paymentTime) {
            setPaymentTime(res.data.paymentTime);
          }
          if (res.data.payerName) {
            setPayerName(res.data.payerName);
          }
        },
        onError: (err: { envelope?: { error?: { message?: string } }; response?: { data?: { message?: string } }; message?: string }) => {
          const msg =
            err.envelope?.error?.message ||
            err.response?.data?.message ||
            err.message ||
            "خطا در استخراج خودکار اطلاعات. لطفاً فرم را بررسی یا دستی تکمیل کنید.";
          setExtractError(msg);
          // Fallback to manual entry view
          setHasExtracted(true);
          setIsManualMode(true);
        },
      },
    );
  };

  const handleResetExtraction = () => {
    setHasExtracted(false);
    setIsManualMode(false);
    setPaymentText("");
    setExtractError(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!isAuthenticated) {
      const currentPath = encodeURIComponent(window.location.pathname + window.location.search);
      navigate(`/login?redirect=${currentPath}`);
      return;
    }

    if (!selectedProduct) {
      setFormError("پلن اشتراک مشخص نیست. لطفاً به صفحه تعرفه‌ها بازگردید.");
      return;
    }

    const trimmedTrack = trackingNumber.trim();
    if (!trimmedTrack || trimmedTrack.length < 3) {
      setFormError("لطفاً شماره پیگیری یا شماره ارجاع بانکی را به درستی وارد کنید.");
      return;
    }

    const trimmedLast4 = sourceCardLast4.trim();
    if (!/^\d{4}$/.test(trimmedLast4)) {
      setFormError("۴ رقم آخر کارت مبدأ باید دقیقاً ۴ رقم عددی باشد.");
      return;
    }

    const trimmedDate = paymentDate.trim();
    if (!trimmedDate) {
      setFormError("لطفاً تاریخ واریز را وارد کنید.");
      return;
    }

    const trimmedTime = paymentTime.trim();
    if (!trimmedTime) {
      setFormError("لطفاً زمان تقریبی واریز را وارد کنید.");
      return;
    }

    c2cMutation.mutate(
      {
        product_id: selectedProduct.id,
        amount: selectedProduct.price,
        tracking_number: trimmedTrack,
        source_card_last4: trimmedLast4,
        payment_date: trimmedDate,
        payment_time: trimmedTime,
        payer_name: payerName.trim() || undefined,
        receipt_url: receiptUrl.trim() || undefined,
        raw_payment_text: paymentText.trim() || undefined,
        extraction_method: hasExtracted ? extractionMethod : "manual",
      },
      {
        onSuccess: (res) => {
          setIsSuccess(true);
          setSuccessMessage(res.message);
        },
        onError: (err: { envelope?: { error?: { message?: string } }; response?: { data?: { message?: string } }; message?: string }) => {
          const msg =
            err.envelope?.error?.message ||
            err.response?.data?.message ||
            err.message ||
            "خطا در ثبت پرداخت کارت‌به‌کارت. لطفاً اطلاعات واریز را مجدداً بررسی کنید.";
          setFormError(msg);
        },
      },
    );
  };

  if (isProdLoading || isC2cLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-slate-400 gap-3" dir="rtl">
        <Loader2 className="w-10 h-10 animate-spin text-teal-400" />
        <span className="text-sm font-medium">در حال دریافت اطلاعات پرداخت...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8" dir="rtl">
      {/* 1. Header & Navigation */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-[var(--color-border)]">
        <div>
          <Link
            to="/pricing"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-text-muted)] hover:text-primary transition-colors mb-2"
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>بازگشت به انتخاب پلن‌ها</span>
          </Link>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--color-text)] flex items-center gap-2.5">
            <Zap className="w-7 h-7 text-amber-500 fill-amber-500" />
            پرداخت کارت‌به‌کارت با استخراج خودکار و فعال‌سازی فوری
          </h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-1">
            مبلغ اشتراک را واریز کرده، متن پیامک بانکی را Paste کنید تا دسترسی شما بلافاصله فعال شود.
          </p>
        </div>

        {selectedProduct && (
          <div className="px-4 py-2.5 rounded-2xl bg-[var(--color-surface)] border border-primary/30 text-left shadow-xs">
            <div className="text-[11px] text-[var(--color-text-muted)]">پلن انتخابی شما:</div>
            <div className="text-sm font-bold text-primary">{selectedProduct.title}</div>
          </div>
        )}
      </div>

      {isSuccess ? (
        /* 2. Success View with Celebratory Message */
        <div className="py-12 px-6 sm:px-10 rounded-3xl bg-[var(--color-surface)] border border-emerald-200 dark:border-emerald-800 text-center space-y-6 animate-in fade-in zoom-in-95 duration-300 shadow-xs">
          <div className="w-20 h-20 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center mx-auto shadow-sm">
            <PartyPopper className="w-10 h-10" />
          </div>

          <div className="space-y-2 max-w-lg mx-auto">
            <h2 className="text-2xl sm:text-3xl font-black text-[var(--color-text)]">
              اشتراک شما با موفقیت فعال شد! ⚡
            </h2>
            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
              {successMessage ||
                "اطلاعات پرداخت شما با موفقیت ثبت شد و اشتراک بلافاصله فعال گردید. اکنون دسترسی کامل به تمام درسنامه‌ها، آزمون‌ها و هوش مصنوعی برای شما برقرار است."}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] max-w-md mx-auto text-xs text-[var(--color-text-secondary)] space-y-1.5 text-right">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">پلن فعال‌شده:</span>
              <span className="font-bold text-[var(--color-text)]">{selectedProduct?.title}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">شماره پیگیری:</span>
              <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">{trackingNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">وضعیت دسترسی:</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold">فعال و آماده استفاده</span>
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              onClick={() => navigate("/courses")}
              className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold text-sm shadow-md shadow-primary/20 transition-all cursor-pointer"
            >
              ورود به دوره‌ها و شروع یادگیری
            </button>
            <Link
              to="/account/subscription"
              className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-[var(--color-surface-warm)] hover:bg-slate-200/60 dark:hover:bg-slate-800 text-[var(--color-text)] font-bold text-sm border border-[var(--color-border)] transition-colors text-center"
            >
              مشاهده وضعیت اشتراک من
            </Link>
          </div>
        </div>
      ) : (
        /* 3. Main Payment Flow: Instructions + Destination Card + New Paste & Preview Form */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column (Details, Paste Box & Preview Form) */}
          <div className="lg:col-span-7 space-y-6">
            {/* Step 1: Destination Card Info Card */}
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 sm:p-8 space-y-6 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-sm">
                    ۱
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
                    اطلاعات کارت مقصد جهت واریز
                  </h3>
                </div>
                <span className="text-[11px] text-amber-700 dark:text-amber-300 font-medium px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800">
                  کارت بانکی شتاب
                </span>
              </div>

              {/* Bank Card Graphic */}
              <div className="relative rounded-2xl bg-gradient-to-br from-teal-700 via-teal-800 to-emerald-900 text-white p-5 sm:p-6 shadow-md space-y-5 border border-white/15">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-teal-100 font-medium tracking-wide">
                    شماره کارت مقصد:
                  </span>
                  <CreditCard className="w-5 h-5 text-amber-300" />
                </div>

                {/* 16-Digit Card Number with Spaces */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xl sm:text-2xl font-mono font-black tracking-widest text-amber-300 select-all">
                    {formatCardNumberWithSpaces(destinationNumber)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyCard(destinationNumber)}
                    className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 transition-all text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
                    title="کپی شماره کارت"
                  >
                    {copiedCard ? (
                      <>
                        <CheckCheck className="w-4 h-4 text-emerald-300" />
                        <span className="text-emerald-300">کپی شد</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>کپی</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="flex items-end justify-between pt-2 border-t border-white/10 text-xs">
                  <div />
                  <div className="text-left">
                    <span className="text-teal-100 block text-[11px]">مبلغ قابل پرداخت:</span>
                    <span className="text-base sm:text-lg font-black text-amber-300">
                      {selectedProduct?.price.toLocaleString("fa-IR")} تومان
                    </span>
                  </div>
                </div>
              </div>

              {/* Instructions Callout */}
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 leading-relaxed flex items-start gap-2.5">
                <HelpCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  لطفاً مبلغ فوق را واریز کنید، سپس متن پیامک بانکی یا رسید تراکنش را در کادر زیر Paste کنید.
                </span>
              </div>
            </div>

            {/* Step 2: Main Payment Info Section (Paste Box or Extracted Preview) */}
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 sm:p-8 space-y-6 shadow-xs">
              <div className="flex items-center justify-between pb-4 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-primary flex items-center justify-center font-bold text-sm">
                    ۲
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
                    اطلاعات پرداخت
                  </h3>
                </div>

                {hasExtracted && (
                  <button
                    type="button"
                    onClick={handleResetExtraction}
                    className="inline-flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-primary transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Paste مجدد متن</span>
                  </button>
                )}
              </div>

              {/* Error Alerts */}
              {extractError && (
                <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs animate-in fade-in duration-200">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                  <span>{extractError}</span>
                </div>
              )}

              {formError && (
                <div className="flex items-center gap-2.5 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs animate-in fade-in duration-200">
                  <AlertCircle className="w-5 h-5 text-rose-500 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {!hasExtracted && !isManualMode ? (
                /* Primary Paste Input View */
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div>
                    <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                      متن پیامک بانک، رسید یا اطلاعات تراکنش خود را در کادر زیر Paste کنید:
                    </label>
                    <p className="text-[11px] text-[var(--color-text-muted)] mb-2 leading-relaxed">
                      سیستم به صورت خودکار شماره پیگیری، ۴ رقم آخر کارت، تاریخ و زمان پرداخت را از متن استخراج می‌کند.
                    </p>
                    <textarea
                      rows={5}
                      value={paymentText}
                      onChange={(e) => setPaymentText(e.target.value)}
                      placeholder={`مثال:\nبانک ملت\nبرداشت از: ۶۰۳۷۹۹******۱۲۳۴\nمبلغ: ۲۹۹٬۰۰۰ تومان\nشماره پیگیری: ۱۲۳۴۵۶۷۸۹\nتاریخ: ۱۴۰۴/۱۲/۱۵ - ۱۴:۳۰`}
                      className="w-full px-4 py-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] text-[var(--color-text)] text-xs sm:text-sm focus:outline-none focus:border-primary focus:bg-[var(--color-surface)] font-mono transition-colors resize-none placeholder-[var(--color-text-muted)]"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                    <button
                      type="button"
                      disabled={extractMutation.isPending || !paymentText.trim()}
                      onClick={() => handleExtract()}
                      className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold text-sm shadow-md shadow-primary/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {extractMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>در حال استخراج خودکار اطلاعات...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 fill-current" />
                          <span>استخراج اطلاعات پرداخت</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsManualMode(true);
                        setHasExtracted(true);
                      }}
                      className="w-full sm:w-auto px-4 py-3.5 rounded-2xl bg-[var(--color-surface-warm)] hover:bg-slate-200/60 dark:hover:bg-slate-800 text-[var(--color-text)] text-xs font-bold transition-colors cursor-pointer border border-[var(--color-border)]"
                    >
                      ورود دستی اطلاعات
                    </button>
                  </div>
                </div>
              ) : (
                /* Extracted Preview & In-Place Editable Form */
                <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in duration-200">
                  {/* Extraction Method Banner */}
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--color-surface-warm)] border border-primary/20 text-xs">
                    <div className="flex items-center gap-2 text-primary font-medium">
                      {extractionMethod === "ai" || extractionMethod === "hybrid" ? (
                        <>
                          <Sparkles className="w-4 h-4 text-amber-500" />
                          <span>اطلاعات با هوش مصنوعی و الگوهای بانکی استخراج شد ✨</span>
                        </>
                      ) : extractionMethod === "rule" ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>اطلاعات با موفقیت از متن پیامک استخراج شد ⚡</span>
                        </>
                      ) : (
                        <>
                          <Edit3 className="w-4 h-4 text-[var(--color-text-muted)]" />
                          <span>حالت ورود دستی اطلاعات پرداخت</span>
                        </>
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--color-text-muted)]">
                      لطفاً اطلاعات زیر را بررسی یا اصلاح کنید
                    </span>
                  </div>

                  {/* Highlight for Missing Required Fields */}
                  {missingFields.includes("trackingNumber") && (
                    <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                      <span>شماره پیگیری در متن پیدا نشد؛ لطفاً آن را به صورت دستی وارد کنید.</span>
                    </div>
                  )}

                  {missingFields.includes("sourceCardLast4") && (
                    <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
                      <span>۴ رقم آخر کارت مبدأ پیدا نشد؛ لطفاً آن را وارد کنید.</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Tracking Number */}
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5 flex items-center justify-between">
                        <span>
                          شماره پیگیری / ارجاع بانکی <span className="text-rose-500">*</span>
                        </span>
                        {fieldConfidence.trackingNumber === "high" && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> خودکار
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        required
                        value={trackingNumber}
                        onChange={(e) => setTrackingNumber(e.target.value)}
                        placeholder="مثال: ۱۲۳۴۵۶۷۸۹"
                        className={`w-full px-4 py-3 rounded-2xl border bg-[var(--color-surface)] text-[var(--color-text)] text-xs sm:text-sm focus:outline-none focus:border-primary font-mono transition-colors ${
                          !trackingNumber ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20" : "border-[var(--color-border)]"
                        }`}
                      />
                    </div>

                    {/* Source Card Last 4 */}
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5 flex items-center justify-between">
                        <span>
                          ۴ رقم آخر کارت مبدأ <span className="text-rose-500">*</span>
                        </span>
                        {fieldConfidence.sourceCardLast4 === "high" && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal flex items-center gap-0.5">
                            <Check className="w-3 h-3" /> خودکار
                          </span>
                        )}
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={4}
                        value={sourceCardLast4}
                        onChange={(e) =>
                          setSourceCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))
                        }
                        placeholder="مثال: ۵۶۷۸"
                        className={`w-full px-4 py-3 rounded-2xl border bg-[var(--color-surface)] text-[var(--color-text)] text-xs sm:text-sm focus:outline-none focus:border-primary font-mono tracking-widest text-center transition-colors ${
                          !sourceCardLast4 ? "border-amber-500 bg-amber-50/50 dark:bg-amber-950/20" : "border-[var(--color-border)]"
                        }`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Payment Date */}
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5 flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-primary" />
                        <span>تاریخ پرداخت <span className="text-rose-500">*</span></span>
                      </label>
                      <input
                        type="text"
                        required
                        value={paymentDate}
                        onChange={(e) => setPaymentDate(e.target.value)}
                        placeholder="مثال: ۱۴۰۴/۱۲/۱۵"
                        className="w-full px-4 py-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-xs sm:text-sm focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>

                    {/* Payment Time */}
                    <div>
                      <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-primary" />
                        <span>زمان تقریبی پرداخت <span className="text-rose-500">*</span></span>
                      </label>
                      <input
                        type="text"
                        required
                        value={paymentTime}
                        onChange={(e) => setPaymentTime(e.target.value)}
                        placeholder="مثال: ۱۴:۳۰"
                        className="w-full px-4 py-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-xs sm:text-sm focus:outline-none focus:border-primary font-mono text-center transition-colors"
                      />
                    </div>
                  </div>

                  {/* Payer Name (Optional) */}
                  <div>
                    <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                      نام صاحب حساب واریزکننده (اختیاری)
                    </label>
                    <input
                      type="text"
                      value={payerName}
                      onChange={(e) => setPayerName(e.target.value)}
                      placeholder="مثال: علی رضایی"
                      className="w-full px-4 py-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-xs sm:text-sm focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>

                  {/* Step 3: Receipt Image / URL (Optional) */}
                  <div className="pt-2 border-t border-[var(--color-border)] space-y-2">
                    <label className="block text-xs font-bold text-[var(--color-text-secondary)] flex items-center gap-1.5">
                      <UploadCloud className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                      <span>تصویر یا لینک فیش واریزی (اختیاری)</span>
                    </label>
                    <input
                      type="text"
                      value={receiptUrl}
                      onChange={(e) => setReceiptUrl(e.target.value)}
                      placeholder="در صورت تمایل لینک یا آدرس تصویر فیش را وارد کنید"
                      className="w-full px-4 py-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-xs focus:outline-none focus:border-primary transition-colors"
                    />
                  </div>

                  {/* Instant Activation Alert */}
                  <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs">
                    <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 fill-current" />
                    <span>
                      <strong>فعال‌سازی فوری:</strong> با کلیک بر روی تأیید، اشتراک شما همان لحظه فعال شده و نیازی به انتظار نیست.
                    </span>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={c2cMutation.isPending}
                      className="w-full py-4 px-6 rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold text-sm sm:text-base shadow-md shadow-primary/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {c2cMutation.isPending ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>در حال اعتبارسنجی و فعال‌سازی آنی...</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5 fill-current" />
                          <span>تأیید اطلاعات و فعال‌سازی فوری</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Right Column (Plan Summary & Security Highlights) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Plan Summary Card */}
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 space-y-4 shadow-xs">
              <div className="flex items-center gap-2 pb-3 border-b border-[var(--color-border)]">
                <Crown className="w-5 h-5 text-amber-500" />
                <h4 className="text-sm font-bold text-[var(--color-text)]">خلاصه سفارش</h4>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center text-[var(--color-text-secondary)]">
                  <span>محصول:</span>
                  <span className="font-bold text-[var(--color-text)]">{selectedProduct?.title}</span>
                </div>
                <div className="flex justify-between items-center text-[var(--color-text-secondary)]">
                  <span>مدت اعتبار:</span>
                  <span className="font-bold text-[var(--color-text)]">
                    {selectedProduct?.duration_days
                      ? `${selectedProduct.duration_days} روز`
                      : "دسترسی همیشگی"}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[var(--color-text-secondary)] pt-2 border-t border-[var(--color-border)]">
                  <span className="font-bold text-[var(--color-text)]">مبلغ نهایی:</span>
                  <span className="text-lg font-black text-primary">
                    {selectedProduct?.price.toLocaleString("fa-IR")} تومان
                  </span>
                </div>
              </div>

              {/* Benefits */}
              <div className="pt-3 border-t border-[var(--color-border)] space-y-2 text-xs text-[var(--color-text-secondary)]">
                <span className="text-[var(--color-text-muted)] block mb-1">مزایای اشتراک آوانا پلاس:</span>
                {[
                  "دسترسی نامحدود به تمامی درسنامه‌ها",
                  "مرور هوشمند فلش‌کارت‌ها با الگوریتم FSRS",
                  "آزمون‌های جامع همراه با تحلیل تسلط",
                  "گفتگوی نامحدود با دستیار هوشمند آموزشی",
                ].map((b, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded-full bg-teal-500/10 text-primary flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3" />
                    </div>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Security Guarantee */}
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-3 shadow-xs">
              <div className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-5 h-5" />
                <span className="text-xs font-bold text-[var(--color-text)]">ضمانت امنیت و شفافیت</span>
              </div>
              <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                کلیه تراکنش‌ها به صورت اتمیک ثبت شده و سوابق مالی کاربر در پرونده کاربری با شفافیت کامل حفظ می‌شود.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
