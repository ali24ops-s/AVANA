/**
 * Dedicated Public / Authenticated Pricing Page.
 *
 * Route: `/pricing`
 *
 * Fetches dynamic subscription products from `GET /v1/commerce/products`
 * and provides seamless checkout with Online Gateway (ZarinPal/Mock) and Card-to-Card Instant Activation.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Crown,
  Check,
  Zap,
  ShieldCheck,
  CreditCard,
  HelpCircle,
  Loader2,
  ArrowLeft,
  ChevronDown,
} from "lucide-react";
import { useCommerceProducts, useMySubscription } from "../hooks/useCommerce.js";
import { PricingModal } from "../components/commerce/PricingModal.js";

export function PricingPage() {
  const { data: productsData, isLoading: isProdLoading } = useCommerceProducts();
  const { data: subData } = useMySubscription();

  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const products = (productsData?.items ?? []).filter((p) => p.type === "subscription");
  const activeSubscription = subData?.subscription;

  const handleSelectPlan = (productId: string) => {
    setSelectedPlanId(productId);
    setIsPricingModalOpen(true);
  };

  const features = [
    "دسترسی کامل و نامحدود به متن تمام درسنامه‌ها",
    "مرور هوشمند فلش‌کارت‌ها با الگوریتم فاصله‌گذاری FSRS",
    "آزمون‌های جامع همراه با تحلیل عملکرد و پاسخ تشریحی",
    "گفتگوی نامحدود با دستیار هوشمند آموزشی آوانا (AI Tutor)",
    "نصب و استفاده از تمام بسته‌های آموزشی کتابخانه عمومی",
    "ثبت خودکار و ذخیره سوابق یادگیری و پیشرفت مباحث",
  ];

  const faqs = [
    {
      q: "آیا پس از پرداخت، دسترسی بلافاصله فعال می‌شود؟",
      a: "بله، در هر دو روش «درگاه آنلاین شتاب» و «کارت‌به‌کارت با فعال‌سازی فوری»، دسترسی شما به صورت آنی فعال شده و تمام قفل‌های آموزشی باز می‌شوند.",
    },
    {
      q: "اگر در حال حاضر اشتراک فعال داشته باشم و تمدید کنم چه می‌شود؟",
      a: "مدت زمان پلن جدید دقیقاً از تاریخ انقضای اشتراک فعلی شما محاسبه شده و به آن اضافه می‌شود؛ بنابراین هیچ روزی از اشتراک شما از دست نخواهد رفت.",
    },
    {
      q: "روش پرداخت کارت‌به‌کارت چگونه کار می‌کند؟",
      a: "شما می‌توانید مبلغ را به شماره کارت اعلام‌شده واریز کنید و پس از ثبت شماره پیگیری و ۴ رقم کارت مبدأ، اشتراک شما فوراً فعال می‌شود تا نیازی به معطلی نداشته باشید.",
    },
    {
      q: "آیا امکان لغو اشتراک و بازگشت وجه وجود دارد؟",
      a: "بله، در صورت عدم رضایت تا ۴۸ ساعت پس از خرید، می‌توانید با پشتیبانی آوانا ارتباط برقرار کرده و درخواست بازگشت وجه دهید.",
    },
    {
      q: "آیا خرید اشتراک با خرید دائمی دوره‌ها تفاوت دارد؟",
      a: "بله. با فعال بودن اشتراک به تمام دوره‌ها و امکانات دسترسی دارید. در صورت تمایل می‌توانید دوره‌ها یا بسته‌های خاصی را نیز به صورت مادام‌العمر (Permanent) خریداری کنید تا همیشه بدون نیاز به اشتراک در دسترستان باشند.",
    },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-16" dir="rtl">
      {/* 1. Hero Section */}
      <div className="text-center space-y-4 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/30 text-xs font-bold shadow-sm">
          <Crown className="w-4 h-4 text-amber-400" />
          <span>پلن‌های اشتراک آوانا پلاس</span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
          سرمایه‌گذاری روی یادگیری عمیق و بدون محدودیت
        </h1>

        <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
          با انتخاب یکی از پلن‌های اشتراک، به کامل‌ترین بانک درسنامه‌های ساختاریافته، فلش‌کارت‌های هوشمند، آزمون‌های شبیه‌ساز و دستیار هوش مصنوعی آوانا دسترسی پیدا کنید.
        </p>

        {activeSubscription &&
          (activeSubscription.status === "active" ||
            activeSubscription.status === "active_pending_payment_review") && (
            <div className="pt-2">
              <Link
                to="/account/subscription"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-teal-500/10 text-teal-300 border border-teal-500/20 text-xs font-bold hover:bg-teal-500/20 transition-all"
              >
                <span>شما در حال حاضر دارای اشتراک فعال هستید. مشاهده جزئیات</span>
                <ArrowLeft className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
      </div>

      {/* 2. Pricing Grid */}
      {isProdLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
          <Loader2 className="w-10 h-10 animate-spin text-teal-400" />
          <span className="text-xs">در حال بارگذاری پلن‌های اشتراک...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {products.map((product) => {
            const isYearly = product.code === "sub_yearly";
            const isQuarterly = product.code === "sub_quarterly";
            const isMonthly = product.code === "sub_monthly";

            // Monthly equivalent
            let monthlyEquivalent = product.price;
            if (isQuarterly) monthlyEquivalent = Math.round(product.price / 3);
            if (isYearly) monthlyEquivalent = Math.round(product.price / 12);

            return (
              <div
                key={product.id}
                className={`relative rounded-3xl glass-panel p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 ${
                  isYearly
                    ? "border-2 border-teal-500 bg-gradient-to-b from-slate-900 via-slate-900/90 to-teal-950/40 shadow-xl shadow-teal-950/50 md:-translate-y-2"
                    : isQuarterly
                    ? "border border-teal-500/40 bg-slate-900/80 hover:border-teal-500/70 shadow-ambient"
                    : "border border-white/10 bg-slate-900/60 hover:border-white/20 shadow-ambient"
                }`}
              >
                {/* Badges */}
                {isYearly && (
                  <div className="absolute -top-3.5 right-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-black px-3 py-1 rounded-full shadow-md">
                    پیشنهاد ویژه (۵۰٪ صرفه‌جویی)
                  </div>
                )}
                {isQuarterly && (
                  <div className="absolute -top-3.5 right-6 bg-teal-600 text-white text-xs font-black px-3 py-1 rounded-full shadow-md">
                    محبوب‌ترین پلن
                  </div>
                )}

                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">
                      {product.title}
                    </h3>
                    <p className="text-xs text-slate-400 min-h-[32px] leading-relaxed">
                      {product.description}
                    </p>
                  </div>

                  {/* Price Block */}
                  <div className="pt-4 border-t border-white/10 space-y-1">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                        {product.price.toLocaleString("fa-IR")}
                      </span>
                      <span className="text-xs text-slate-400 font-bold">تومان</span>
                    </div>

                    {!isMonthly && (
                      <div className="text-[11px] text-teal-400 font-medium">
                        معادل ماهانه {monthlyEquivalent.toLocaleString("fa-IR")} تومان
                      </div>
                    )}
                  </div>

                  {/* Features List */}
                  <div className="space-y-2.5 pt-4 border-t border-white/10">
                    <span className="text-xs font-bold text-slate-300 block mb-2">
                      امکانات این پلن:
                    </span>
                    {features.map((feat, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-slate-300">
                        <div className="w-4 h-4 rounded-full bg-teal-500/10 text-teal-400 flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3" />
                        </div>
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Checkout CTA */}
                <div className="pt-8">
                  <button
                    type="button"
                    onClick={() => handleSelectPlan(product.id)}
                    className={`w-full py-3.5 px-6 rounded-2xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer ${
                      isYearly
                        ? "bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 shadow-teal-900/40"
                        : "bg-teal-600 hover:bg-teal-500 text-white shadow-teal-900/30"
                    }`}
                  >
                    <Zap className="w-4 h-4 text-amber-300 fill-current" />
                    <span>خرید و فعال‌سازی آنی</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 3. Security & Trust Badges */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
        <div className="p-5 rounded-2xl glass-panel border border-white/5 bg-slate-900/40 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">پرداخت امن شاپرک و کارت‌به‌کارت</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">اتصال مستقیم به درگاه و ثبت آنی تراکنش‌های بانکی</p>
          </div>
        </div>

        <div className="p-5 rounded-2xl glass-panel border border-white/5 bg-slate-900/40 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">فعال‌سازی آنی و خودکار</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">باز شدن فوری قفل‌ها بلافاصله پس از ثبت پرداخت</p>
          </div>
        </div>

        <div className="p-5 rounded-2xl glass-panel border border-white/5 bg-slate-900/40 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-white">بدون تمدید ناخواسته</h4>
            <p className="text-[11px] text-slate-400 mt-0.5">هیچ برداشتی بدون تایید مجدد شما انجام نخواهد شد</p>
          </div>
        </div>
      </div>

      {/* 4. FAQ Accordion */}
      <div className="rounded-3xl glass-panel border border-white/10 bg-slate-900/60 p-6 sm:p-10 space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            سوالات متداول کاربران
          </h2>
          <p className="text-xs text-slate-400">
            پاسخ به پرتکرارترین پرسش‌ها درباره نحوه عملکرد اشتراک و پرداخت‌ها
          </p>
        </div>

        <div className="divide-y divide-white/5 pt-2 max-w-3xl mx-auto">
          {faqs.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div key={idx} className="py-4">
                <button
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between text-right gap-4 text-xs sm:text-sm font-bold text-slate-200 hover:text-white transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-teal-400 shrink-0" />
                    <span>{faq.q}</span>
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-slate-400 transition-transform ${
                      isOpen ? "rotate-180 text-teal-400" : ""
                    }`}
                  />
                </button>

                {isOpen && (
                  <p className="text-xs text-slate-400 leading-relaxed mt-3 pr-6">
                    {faq.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Flow for Pricing and Payment Methods */}
      <PricingModal
        isOpen={isPricingModalOpen}
        onClose={() => setIsPricingModalOpen(false)}
        initialProductId={selectedPlanId}
      />
    </div>
  );
}
