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
  Wallet,
  Camera,
  Image as ImageIcon,
  Trash2,
  RefreshCw,
  Gift,
  Ticket,
  Percent,
} from "lucide-react";
import {
  resolveSubscriptionPlanType,
  resolveGiftCreditAmount,
  toPersianDigits,
} from "@avana/domain";
import {
  useCommerceProducts,
  useCardToCardInfo,
  useSubmitCardToCardPayment,
  useExtractCardToCardPayment,
  useUploadPaymentReceipt,
  useValidateCoupon,
} from "../hooks/useCommerce.js";
import { useAuth } from "../providers/AuthProvider.js";

export function CardToCardPaymentPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const rawProductId = searchParams.get("productId") || searchParams.get("product_id");
  const rawType = searchParams.get("type");
  const customAmountParam = parseInt(searchParams.get("amount") || "0", 10);

  const isWalletTopupProduct =
    rawProductId === "wallet_topup" ||
    rawType === "wallet_topup";

  const { data: productsData, isLoading: isProdLoading } = useCommerceProducts();
  const { data: c2cInfo, isLoading: isC2cLoading } = useCardToCardInfo();
  const c2cMutation = useSubmitCardToCardPayment();
  const extractMutation = useExtractCardToCardPayment();
  const uploadReceiptMutation = useUploadPaymentReceipt();

  // Receipt Upload states
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [receiptUploadError, setReceiptUploadError] = useState<string | null>(null);
  const [isReceiptDragOver, setIsReceiptDragOver] = useState<boolean>(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleReceiptFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setReceiptUploadError(null);

    // Validation
    const validMimes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
    if (!validMimes.includes(file.type.toLowerCase())) {
      setReceiptUploadError("فرمت فایل نامعتبر است. لطفاً تصویری با فرمت JPG، PNG یا WebP انتخاب کنید.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setReceiptUploadError("حجم تصویر بیش از ۵ مگابایت است. لطفاً تصویر کم‌حجم‌تری انتخاب نمایید.");
      return;
    }

    if (receiptPreviewUrl) {
      URL.revokeObjectURL(receiptPreviewUrl);
    }
    const preview = URL.createObjectURL(file);
    setReceiptPreviewUrl(preview);
    setReceiptFile(file);

    try {
      const res = await uploadReceiptMutation.mutateAsync(file);
      setReceiptUrl(res.receipt_url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطا در آپلود تصویر فیش واریزی.";
      setReceiptUploadError(msg);
    }
  };

  const handleRemoveReceipt = () => {
    if (receiptPreviewUrl) {
      URL.revokeObjectURL(receiptPreviewUrl);
    }
    setReceiptFile(null);
    setReceiptPreviewUrl(null);
    setReceiptUrl("");
    setReceiptUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Find product from backend catalog (subscriptions, courses, packs, wallet topup)
  const allProducts = productsData?.items ?? [];

  // For wallet topup: NEVER fallback to subscription! Use wallet_topup product or fallback descriptor.
  const selectedProduct = isWalletTopupProduct
    ? allProducts.find((p) => p.type === "wallet_topup" || p.code === "wallet_topup") || {
        id: "wallet_topup",
        code: "wallet_topup",
        type: "wallet_topup" as const,
        title: "شارژ کیف پول",
        description: "افزایش موجودی و اعتبار کیف پول",
        price: customAmountParam > 0 ? customAmountParam : 100_000,
        currency: "toman",
        target_type: "wallet",
        target_id: null,
        duration_days: null,
        metadata: { isDynamicPrice: true },
      }
    : allProducts.find((p) => p.id === rawProductId || p.code === rawProductId) ||
      allProducts.find((p) => p.type === "subscription") ||
      allProducts[0];

  const effectivePrice = isWalletTopupProduct
    ? (customAmountParam > 0 ? customAmountParam : (selectedProduct?.price || 100_000))
    : (selectedProduct?.price ?? 0);

  // Promotion / Coupon state
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    promotionId: string;
    benefitType: string;
    benefitValue: number;
    discountAmount: number;
    cashbackAmount: number;
    finalPayableAmount: number;
    message?: string;
  } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const validateCouponMutation = useValidateCoupon();

  const handleApplyCoupon = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!couponCodeInput.trim() || !selectedProduct) return;
    setCouponError(null);

    try {
      const res = await validateCouponMutation.mutateAsync({
        code: couponCodeInput.trim(),
        product_id: selectedProduct.id,
      });

      if (res.valid && res.benefit && res.promotion) {
        setAppliedCoupon({
          code: res.code?.code || couponCodeInput.trim().toUpperCase(),
          promotionId: res.promotion.id,
          benefitType: res.promotion.benefitType,
          benefitValue: res.promotion.benefitValue,
          discountAmount: res.benefit.discountAmount || 0,
          cashbackAmount: res.benefit.cashbackAmount || 0,
          finalPayableAmount: res.benefit.payableAmount,
          message: res.reason,
        });
        setCouponError(null);
      } else {
        setCouponError(res.reason || "کد تخفیف وارد شده معتبر نیست یا منقضی شده است.");
        setAppliedCoupon(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطا در اعتبارسنجی کد تخفیف";
      setCouponError(msg);
      setAppliedCoupon(null);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCodeInput("");
    setCouponError(null);
  };

  const discountAmount = appliedCoupon ? appliedCoupon.discountAmount : 0;
  const cashbackAmount = appliedCoupon ? appliedCoupon.cashbackAmount : 0;
  const payableAmount = appliedCoupon ? appliedCoupon.finalPayableAmount : effectivePrice;

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
  const [createdAttemptId, setCreatedAttemptId] = useState<string | null>(null);
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
        amount: isWalletTopupProduct ? effectivePrice : undefined,
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
      setFormError("پلن یا خدمت مورد نظر مشخص نیست.");
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
        amount: payableAmount,
        coupon_code: appliedCoupon ? appliedCoupon.code : undefined,
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
        onSuccess: (res: { message?: string; attemptId?: string; attempt_id?: string }) => {
          setIsSuccess(true);
          setSuccessMessage(res.message || "");
          if (res.attemptId || res.attempt_id) {
            setCreatedAttemptId(res.attemptId || res.attempt_id || null);
          }
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

  const isSpecialExamProduct = selectedProduct?.type === "special_exam" || Boolean(createdAttemptId);
  const isSubscriptionProduct = selectedProduct?.type === "subscription";
  const selectedPlanType =
    isSubscriptionProduct && selectedProduct
      ? resolveSubscriptionPlanType(selectedProduct)
      : null;
  const selectedGiftAmount =
    typeof selectedProduct?.gift_credit === "number"
      ? selectedProduct.gift_credit
      : selectedPlanType
      ? resolveGiftCreditAmount(selectedPlanType)
      : 0;

  if (isProdLoading || isC2cLoading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center text-slate-400 gap-3" dir="rtl">
        <Loader2 className="w-10 h-10 animate-spin text-teal-400" />
        <span className="text-sm font-medium">در حال دریافت اطلاعات پرداخت...</span>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12 font-body text-[var(--color-text)]" dir="rtl">
      {/* 1. Page Header & Back Navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-8 border-b border-[var(--color-border)] mb-8">
        <div className="space-y-1">
          <Link
            to={isWalletTopupProduct ? "/account/wallet" : "/pricing"}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:text-primary-hover font-medium transition-colors mb-2"
          >
            <ArrowRight className="w-4 h-4" />
            <span>{isWalletTopupProduct ? "بازگشت به کیف پول" : "بازگشت به انتخاب پلن"}</span>
          </Link>

          <h1 className="text-2xl sm:text-3xl font-black text-[var(--color-text)] tracking-tight">
            {isWalletTopupProduct
              ? "شارژ حساب کاربری با کارت‌به‌کارت"
              : isSpecialExamProduct
              ? "خرید و فعال‌سازی آزمون ویژه"
              : "پرداخت کارت‌به‌کارت با استخراج خودکار و فعال‌سازی فوری"}
          </h1>
          <p className="text-xs sm:text-sm text-[var(--color-text-secondary)]">
            {isWalletTopupProduct
              ? "مبلغ مورد نظر را به شماره کارت مقصد واریز کنید و رسید یا پیامک بانک را ثبت نمایید."
              : isSpecialExamProduct
              ? "مبلغ آزمون را واریز نمایید و با ثبت پیامک یا فیش، آزمون را بلافاصله آغاز کنید."
              : "مبلغ پلن را به شماره کارت اعلام شده واریز کنید؛ سیستم با هوش مصنوعی رسید شما را بررسی کرده و اشتراک بلافاصله فعال می‌شود."}
          </p>
        </div>

        {selectedProduct && (
          <div className="px-4 py-2.5 rounded-2xl bg-[var(--color-surface)] border border-primary/30 text-left shadow-xs shrink-0 self-start md:self-auto">
            <div className="text-[11px] text-[var(--color-text-muted)]">
              {isWalletTopupProduct ? "عنوان درخواست:" : isSpecialExamProduct ? "آزمون انتخابی:" : "پلن انتخابی شما:"}
            </div>
            <div className="text-xs sm:text-sm font-bold text-primary whitespace-nowrap">
              {isWalletTopupProduct ? `شارژ کیف پول (${toPersianDigits(effectivePrice.toLocaleString("fa-IR"))} تومان)` : selectedProduct.title}
            </div>
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
            <h2
              className={`text-[var(--color-text)] ${
                isWalletTopupProduct
                  ? "text-lg sm:text-xl font-bold leading-relaxed"
                  : "text-2xl sm:text-3xl font-black"
              }`}
            >
              {isWalletTopupProduct
                ? "درخواست شارژ کیف پول با موفقیت ثبت شد و پس از بررسی و تأیید ادمین، کیف پول شما شارژ خواهد شد."
                : isSpecialExamProduct
                ? "آزمون ویژه شما با موفقیت ساخته شد! 🎯"
                : "اشتراک شما با موفقیت فعال شد! ⚡"}
            </h2>
            {!isWalletTopupProduct && (
              <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] leading-relaxed">
                {successMessage ||
                  (isSpecialExamProduct
                    ? "اطلاعات پرداخت تأیید شد و یک Attempt اختصاصی با سؤالات تصادفی و فریز شده از بانک سؤال برای شما تولید گردید. می‌توانید بلافاصله آزمون را آغاز کنید."
                    : selectedGiftAmount > 0
                    ? `اطلاعات پرداخت شما با موفقیت ثبت شد و اشتراک بلافاصله فعال گردید. همچنین مبلغ ${toPersianDigits(selectedGiftAmount.toLocaleString("fa-IR"))} تومان اعتبار هدیه به کیف پول شما اضافه شد. اکنون دسترسی کامل به تمام امکانات برای شما برقرار است.`
                    : "اطلاعات پرداخت شما با موفقیت ثبت شد و اشتراک بلافاصله فعال گردید. اکنون دسترسی کامل به تمام درسنامه‌ها، آزمون‌ها و هوش مصنوعی برای شما برقرار است.")}
              </p>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] max-w-md mx-auto text-xs text-[var(--color-text-secondary)] space-y-1.5 text-right">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">
                {isWalletTopupProduct ? "نوع درخواست:" : isSpecialExamProduct ? "آزمون ایجادشده:" : "پلن فعال‌شده:"}
              </span>
              <span className="font-bold text-[var(--color-text)]">
                {isWalletTopupProduct ? "افزایش اعتبار کیف پول" : selectedProduct?.title}
              </span>
            </div>
            {isSubscriptionProduct && selectedGiftAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">هدیه فعال‌سازی اشتراک:</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">
                  {toPersianDigits(selectedGiftAmount.toLocaleString("fa-IR"))} تومان اعتبار کیف پول
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">مبلغ پرداختی:</span>
              <span className="font-bold text-primary">{toPersianDigits(effectivePrice.toLocaleString("fa-IR"))} تومان</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">شماره پیگیری:</span>
              <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">{trackingNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">وضعیت درخواست:</span>
              <span className={isWalletTopupProduct ? "text-amber-600 dark:text-amber-400 font-bold" : "text-emerald-600 dark:text-emerald-400 font-bold"}>
                {isWalletTopupProduct ? "در انتظار بررسی و تأیید ادمین" : isSpecialExamProduct ? "آماده برگزاری آزمون" : "فعال و آماده استفاده"}
              </span>
            </div>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            {isWalletTopupProduct ? (
              <>
                <Link
                  to="/account/wallet"
                  className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold text-sm shadow-md shadow-primary/20 transition-all text-center"
                >
                  بازگشت به کیف پول من
                </Link>
                <Link
                  to="/account/purchases"
                  className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-[var(--color-surface-warm)] hover:bg-slate-200/60 dark:hover:bg-slate-800 text-[var(--color-text)] font-bold text-sm border border-[var(--color-border)] transition-colors text-center"
                >
                  مشاهده تاریخچه سفارش‌ها
                </Link>
              </>
            ) : isSpecialExamProduct ? (
              <>
                <button
                  data-testid="start-special-exam-button"
                  onClick={() =>
                    navigate(
                      createdAttemptId
                        ? `/exams/attempt/${createdAttemptId}`
                        : "/exams",
                    )
                  }
                  className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold text-sm shadow-md shadow-primary/20 transition-all cursor-pointer"
                >
                  شروع آزمون
                </button>
                <Link
                  to="/exams"
                  className="w-full sm:w-auto px-6 py-3.5 rounded-2xl bg-[var(--color-surface-warm)] hover:bg-slate-200/60 dark:hover:bg-slate-800 text-[var(--color-text)] font-bold text-sm border border-[var(--color-border)] transition-colors text-center"
                >
                  مشاهده همه آزمون‌های من
                </Link>
              </>
            ) : (
              <>
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
              </>
            )}
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
                <div className="flex items-center justify-between gap-3 overflow-x-auto">
                  <span
                    dir="ltr"
                    className="text-lg sm:text-2xl font-mono font-black tracking-wider sm:tracking-widest text-amber-300 select-all whitespace-nowrap"
                  >
                    {formatCardNumberWithSpaces(destinationNumber)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyCard(destinationNumber)}
                    className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 active:scale-95 transition-all text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm whitespace-nowrap"
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
                  <div>
                    {appliedCoupon && discountAmount > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-400/20 text-emerald-300 text-[10px] font-bold">
                        <Percent className="w-3 h-3" />
                        تخفیف اعمال شد
                      </span>
                    )}
                  </div>
                  <div className="text-left">
                    <span className="text-teal-100 block text-[11px]">
                      {isWalletTopupProduct ? "مبلغ شارژ کیف پول:" : "مبلغ قابل پرداخت:"}
                    </span>
                    {appliedCoupon && discountAmount > 0 ? (
                      <div className="flex flex-col items-end">
                        <span className="text-xs line-through text-teal-200/70">
                          {toPersianDigits(effectivePrice.toLocaleString("fa-IR"))} تومان
                        </span>
                        <span className="text-base sm:text-lg font-black text-amber-300 whitespace-nowrap">
                          {toPersianDigits(payableAmount.toLocaleString("fa-IR"))} تومان
                        </span>
                      </div>
                    ) : (
                      <span className="text-base sm:text-lg font-black text-amber-300 whitespace-nowrap">
                        {toPersianDigits(effectivePrice.toLocaleString("fa-IR"))} تومان
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Instructions Callout */}
              <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-300 leading-relaxed flex items-start gap-2.5">
                <HelpCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  {isWalletTopupProduct
                    ? "لطفاً مبلغ شارژ فوق را به شماره کارت بالا واریز کنید، سپس متن پیامک بانکی یا رسید تراکنش را در کادر زیر Paste نمایید."
                    : "لطفاً مبلغ فوق را واریز کنید، سپس متن پیامک بانکی یا رسید تراکنش را در کادر زیر Paste کنید."}
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
                      placeholder={`مثال:\nبانک ملت\nبرداشت از: ۶۰۳۷۹۹******۱۲۳۴\nمبلغ: ${effectivePrice > 0 ? toPersianDigits(effectivePrice.toLocaleString("fa-IR")) : "۱۰۰٬۰۰۰"} تومان\nشماره پیگیری: ۱۲۳۴۵۶۷۸۹\nتاریخ: ۱۴۰۴/۱۲/۱۵ - ۱۴:۳۰`}
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

                  {/* Step 3: Receipt Image Upload (Optional but Recommended) */}
                  <div className="pt-3 border-t border-[var(--color-border)] space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5">
                        <ImageIcon className="w-4 h-4 text-primary" />
                        <span>تصویر فیش واریزی (اختیاری)</span>
                      </label>
                      <span className="text-[10px] text-[var(--color-text-muted)]">
                        JPG, PNG, WebP (حداکثر ۵MB)
                      </span>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/jpg"
                      capture="environment"
                      onChange={(e) => handleReceiptFileSelect(e.target.files)}
                      className="hidden"
                      data-testid="receipt-file-input"
                    />

                    {receiptPreviewUrl ? (
                      /* Preview Box */
                      <div className="p-3.5 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center gap-3.5 shadow-xs">
                        <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-[var(--color-surface-warm)] border border-[var(--color-border)] shrink-0 flex items-center justify-center">
                          <img
                            src={receiptPreviewUrl}
                            alt="پیش‌نمایش فیش پرداخت"
                            className="w-full h-full object-cover"
                          />
                        </div>

                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="text-xs font-bold text-[var(--color-text)] truncate" title={receiptFile?.name}>
                            {receiptFile?.name || "تصویر فیش واریزی"}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-2">
                            {receiptFile && (
                              <span>{(receiptFile.size / 1024).toFixed(0)} کیلوبایت</span>
                            )}
                            {uploadReceiptMutation.isPending ? (
                              <span className="text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>در حال بارگذاری...</span>
                              </span>
                            ) : receiptUrl ? (
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                <Check className="w-3 h-3" />
                                <span>آماده ارسال</span>
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 rounded-xl text-[var(--color-text-muted)] hover:text-primary hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
                            title="تغییر تصویر"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={handleRemoveReceipt}
                            className="p-2 rounded-xl text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="حذف تصویر"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* Drag & Drop / Click to Upload Box */
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setIsReceiptDragOver(true);
                        }}
                        onDragLeave={() => setIsReceiptDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setIsReceiptDragOver(false);
                          handleReceiptFileSelect(e.dataTransfer.files);
                        }}
                        onClick={() => fileInputRef.current?.click()}
                        className={`p-4 rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center gap-2 text-center group ${
                          isReceiptDragOver
                            ? "border-primary bg-primary/5"
                            : "border-[var(--color-border)] hover:border-primary/50 hover:bg-[var(--color-surface-warm)]/40 bg-[var(--color-surface)]"
                        }`}
                      >
                        <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center group-hover:scale-105 transition-transform">
                          <Camera className="w-5 h-5" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-xs font-bold text-[var(--color-text)]">
                            برای انتخاب عکس فیش یا ثبت با دوربین کلیک کنید
                          </div>
                          <div className="text-[11px] text-[var(--color-text-muted)]">
                            یا تصویر را به این کادر بکشید و رها کنید
                          </div>
                        </div>
                      </div>
                    )}

                    {receiptUploadError && (
                      <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-300 text-xs animate-in fade-in duration-200">
                        <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        <span>{receiptUploadError}</span>
                      </div>
                    )}
                  </div>

                  {/* Info Alert */}
                  <div
                    className={`flex items-center gap-2.5 p-3.5 rounded-2xl border text-xs leading-relaxed ${
                      isWalletTopupProduct
                        ? "bg-teal-50 dark:bg-teal-950/40 border-teal-200 dark:border-teal-800 text-teal-800 dark:text-teal-300"
                        : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                    }`}
                  >
                    <Zap
                      className={`w-4 h-4 shrink-0 fill-current ${
                        isWalletTopupProduct
                          ? "text-primary"
                          : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    />
                    <span>
                      {isWalletTopupProduct
                        ? "با ثبت پرداخت، اطلاعات واریز جهت بررسی و تأیید ادمین ارسال می‌شود و اعتبار کیف پول پس از تأیید شارژ خواهد شد."
                        : isSpecialExamProduct
                        ? "با ثبت پرداخت، آزمون اختصاصی شما بلافاصله ساخته شده و آماده برگزاری خواهد بود."
                        : "با ثبت پرداخت، اشتراک شما فعال می‌شود و می‌توانید بلافاصله از امکانات آن استفاده کنید."}
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
                          <span>
                            {isWalletTopupProduct
                              ? "در حال ثبت درخواست شارژ کیف پول..."
                              : "در حال اعتبارسنجی و فعال‌سازی آنی..."}
                          </span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-5 h-5 fill-current" />
                          <span>
                            {isWalletTopupProduct
                              ? "تأیید اطلاعات و ثبت درخواست شارژ"
                              : isSpecialExamProduct
                              ? "تأیید پرداخت و ساخت آزمون"
                              : "تأیید اطلاعات و فعال‌سازی فوری"}
                          </span>
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
            {/* Coupon / Promotion Code Card */}
            {!isWalletTopupProduct && (
              <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-3 shadow-xs">
                <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                  <div className="flex items-center gap-2">
                    <Ticket className="w-4 h-4 text-primary" />
                    <span className="text-xs font-bold text-[var(--color-text)]">
                      کد تخفیف یا کارت هدیه
                    </span>
                  </div>
                  {appliedCoupon && (
                    <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                      اعمال شد
                    </span>
                  )}
                </div>

                {!appliedCoupon ? (
                  <form onSubmit={handleApplyCoupon} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={couponCodeInput}
                        onChange={(e) => setCouponCodeInput(e.target.value.toUpperCase())}
                        placeholder="کد تخفیف خود را وارد کنید..."
                        disabled={validateCouponMutation.isPending}
                        className="flex-1 px-3 py-2 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs font-mono font-bold text-[var(--color-text)] focus:outline-none focus:border-primary text-left uppercase placeholder:normal-case placeholder:font-sans placeholder:font-normal placeholder:text-right"
                        dir="ltr"
                      />
                      <button
                        type="submit"
                        disabled={validateCouponMutation.isPending || !couponCodeInput.trim()}
                        className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 flex items-center gap-1.5"
                      >
                        {validateCouponMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <span>اعمال</span>
                        )}
                      </button>
                    </div>
                    {couponError && (
                      <p className="text-[11px] text-rose-500 font-medium">{couponError}</p>
                    )}
                  </form>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs">
                      <div className="flex items-center gap-2 font-mono font-bold text-emerald-600 dark:text-emerald-400" dir="ltr">
                        <Check className="w-4 h-4" />
                        <span>{appliedCoupon.code}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleRemoveCoupon}
                        className="text-[11px] text-rose-500 hover:text-rose-600 font-medium hover:underline cursor-pointer"
                      >
                        حذف کد
                      </button>
                    </div>
                    {appliedCoupon.discountAmount > 0 && (
                      <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                        مبلغ {toPersianDigits(appliedCoupon.discountAmount.toLocaleString("fa-IR"))} تومان تخفیف روی این سفارش اعمال شد.
                      </p>
                    )}
                    {appliedCoupon.cashbackAmount > 0 && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        مبلغ {toPersianDigits(appliedCoupon.cashbackAmount.toLocaleString("fa-IR"))} تومان کش‌بک پس از تأیید پرداخت به کیف پول شما واریز خواهد شد.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Plan Summary Card */}
            <div className="rounded-3xl bg-[var(--color-surface)] border border-[var(--color-border)] p-6 space-y-4 shadow-xs">
              <div className="flex items-center gap-2 pb-3 border-b border-[var(--color-border)]">
                {isWalletTopupProduct ? (
                  <Wallet className="w-5 h-5 text-primary" />
                ) : (
                  <Crown className="w-5 h-5 text-amber-500" />
                )}
                <h4 className="text-sm font-bold text-[var(--color-text)]">
                  {isWalletTopupProduct ? "خلاصه درخواست شارژ" : "خلاصه سفارش"}
                </h4>
              </div>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center text-[var(--color-text-secondary)] gap-2">
                  <span className="shrink-0">
                    {isWalletTopupProduct ? "عنوان درخواست:" : "محصول:"}
                  </span>
                  <span className="font-bold text-[var(--color-text)] whitespace-nowrap truncate">
                    {isWalletTopupProduct
                      ? "شارژ کیف پول"
                      : selectedProduct?.title}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[var(--color-text-secondary)]">
                  <span>{isWalletTopupProduct ? "نوع اعتبار:" : "مدت اعتبار:"}</span>
                  <span className="font-bold text-[var(--color-text)] whitespace-nowrap">
                    {isWalletTopupProduct
                      ? "بدون انقضا (دائمی)"
                      : selectedProduct?.duration_days
                      ? `${toPersianDigits(selectedProduct.duration_days)} روز`
                      : "دسترسی همیشگی"}
                  </span>
                </div>
                {isSubscriptionProduct && selectedGiftAmount > 0 && (
                  <div className="flex justify-between items-center text-[var(--color-text-secondary)]">
                    <span className="flex items-center gap-1.5">
                      <Gift className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span>هدیه اشتراک:</span>
                    </span>
                    <span className="font-bold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                      {toPersianDigits(selectedGiftAmount.toLocaleString("fa-IR"))} تومان اعتبار کیف پول
                    </span>
                  </div>
                )}
                {appliedCoupon && discountAmount > 0 && (
                  <div className="flex justify-between items-center text-[var(--color-text-secondary)]">
                    <span className="text-emerald-600 dark:text-emerald-400">تخفیف پروموشن:</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      - {toPersianDigits(discountAmount.toLocaleString("fa-IR"))} تومان
                    </span>
                  </div>
                )}
                {appliedCoupon && cashbackAmount > 0 && (
                  <div className="flex justify-between items-center text-[var(--color-text-secondary)]">
                    <span className="text-amber-600 dark:text-amber-400">کش‌بک واریزی به کیف پول:</span>
                    <span className="font-bold text-amber-600 dark:text-amber-400">
                      + {toPersianDigits(cashbackAmount.toLocaleString("fa-IR"))} تومان
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center text-[var(--color-text-secondary)] pt-2 border-t border-[var(--color-border)]">
                  <span className="font-bold text-[var(--color-text)]">
                    {isWalletTopupProduct ? "مبلغ شارژ:" : "مبلغ نهایی قابل واریز:"}
                  </span>
                  <span className="text-lg font-black text-primary whitespace-nowrap">
                    {toPersianDigits(payableAmount.toLocaleString("fa-IR"))} تومان
                  </span>
                </div>
              </div>

              {/* Benefits */}
              <div className="pt-3 border-t border-[var(--color-border)] space-y-2 text-xs text-[var(--color-text-secondary)]">
                <span className="text-[var(--color-text-muted)] block mb-1">
                  {isWalletTopupProduct
                    ? "مزایای اعتبار کیف پول آوانا:"
                    : "مزایای اشتراک آوانا پلاس:"}
                </span>
                {(isWalletTopupProduct
                  ? [
                      "استفاده برای تولید هوشمند درسنامه‌ها و آزمون‌ها",
                      "مرور هوشمند فلش‌کارت‌ها و گفتگوی نامحدود با دستیار",
                      "ذخیره دائم اعتبار بدون محدودیت زمانی",
                      "تضمین شفافیت و ثبت تاریخچه تمام تراکنش‌ها",
                    ]
                  : [
                      ...(isSubscriptionProduct && selectedGiftAmount > 0
                        ? [
                            `${toPersianDigits(selectedGiftAmount.toLocaleString("fa-IR"))} تومان اعتبار هدیه کیف پول (ویژه تولید محتوا)`,
                          ]
                        : []),
                      "دسترسی نامحدود به تمامی درسنامه‌ها",
                      "مرور هوشمند فلش‌کارت‌ها با الگوریتم FSRS",
                      "آزمون‌های جامع همراه با تحلیل تسلط",
                      "گفتگوی نامحدود با دستیار هوشمند آموزشی",
                    ]
                ).map((b, i) => (
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
