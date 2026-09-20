import {
  HelpCircle,
  Calculator,
  Lock,
  FileCheck,
  Award,
  Layers,
  Sparkles,
} from "lucide-react";
import { formatToman } from "./commerceUtils.js";
import { toPersianDigits } from "@avana/domain";

export function AdminSpecialExamPricingSection() {
  const BASE_PRICE_PER_QUESTION = 500;

  const standardTiers = [
    {
      title: "آزمون مبحثی و فصلی (Chapter)",
      questions: 25,
      price: 25 * BASE_PRICE_PER_QUESTION,
      icon: <Layers className="w-4 h-4 text-blue-500" />,
      tag: "فصلی",
    },
    {
      title: "آزمون میان‌ترم (Midterm)",
      questions: 50,
      price: 50 * BASE_PRICE_PER_QUESTION,
      icon: <FileCheck className="w-4 h-4 text-purple-500" />,
      tag: "میان‌ترم",
    },
    {
      title: "آزمون جامع کل دوره (Course)",
      questions: 80,
      price: 80 * BASE_PRICE_PER_QUESTION,
      icon: <Award className="w-4 h-4 text-amber-500" />,
      tag: "جامع دوره",
    },
    {
      title: "آزمون شبیه‌ساز کشوری (National)",
      questions: 100,
      price: 100 * BASE_PRICE_PER_QUESTION,
      icon: <Sparkles className="w-4 h-4 text-emerald-500" />,
      tag: "شبیه‌ساز",
    },
  ];

  return (
    <div
      className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-sm space-y-6"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-[var(--color-text)] flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-[var(--color-primary-default)]" />
            <span>قیمت‌گذاری آزمون‌های ویژه</span>
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            مبنا و فرمول محاسبه قیمت فروش آزمون‌های هوشمند و استاندارد (Special Exam Pricing Baseline)
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* Read-Only Calibration Baseline Metadata */}
        <div className="bg-[var(--color-surface-warm)]/70 border border-[var(--color-border)] rounded-xl p-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text)] mb-3">
            <Lock className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <span>مبنا و فرمول محاسباتی قیمت آزمون (سیستمی و خودکار)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
              <span className="text-[11px] text-[var(--color-text-muted)] block mb-1">نرخ پایه هر سؤال</span>
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-[var(--color-primary-default)]" />
                <span className="text-xs sm:text-sm font-bold text-[var(--color-text)] font-mono">
                  {BASE_PRICE_PER_QUESTION.toLocaleString("fa-IR")} تومان
                </span>
                <span className="text-[10px] bg-slate-500/10 text-slate-400 px-1.5 py-0.5 rounded border border-slate-500/20">
                  Fixed Baseline
                </span>
              </div>
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
              <span className="text-[11px] text-[var(--color-text-muted)] block mb-1">فرمول قیمت‌گذاری</span>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="text-xs sm:text-sm font-bold text-[var(--color-text)]">
                  تعداد سؤالات × ۵۰۰ تومان
                </span>
                <span className="text-[10px] bg-slate-500/10 text-slate-400 px-1.5 py-0.5 rounded border border-slate-500/20">
                  Formula
                </span>
              </div>
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 sm:col-span-2 lg:col-span-1">
              <span className="text-[11px] text-[var(--color-text-muted)] block mb-1">تضمین یکپارچگی قیمت</span>
              <span className="text-[11px] text-[var(--color-text-muted)] block">
                قیمت همه آزمون‌ها در زمان ساخت و خرید به‌صورت قطعی از فرمول فوق محاسبه و اعتبارسنجی می‌شود.
              </span>
            </div>
          </div>
        </div>

        {/* Standard Tier Benchmarks */}
        <div>
          <span className="text-xs font-bold text-[var(--color-text)] block mb-3">
            پلن‌ها و سطوح استاندارد آزمون‌های ویژه:
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {standardTiers.map((tier, idx) => (
              <div
                key={idx}
                className="bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-text)]">
                    {tier.icon}
                    <span>{tier.tag}</span>
                  </div>
                  <span className="text-[11px] text-[var(--color-text-muted)] bg-[var(--color-surface)] px-2 py-0.5 rounded border border-[var(--color-border)]">
                    {toPersianDigits(tier.questions)} سؤال
                  </span>
                </div>

                <div>
                  <span className="text-xs text-[var(--color-text-muted)] block">
                    {tier.title}
                  </span>
                  <div className="text-sm font-bold text-[var(--color-text)] font-mono mt-1">
                    {formatToman(tier.price)}
                  </div>
                </div>

                <div className="text-[10px] text-[var(--color-text-muted)] pt-1 border-t border-[var(--color-border)]/60">
                  محاسبه: {toPersianDigits(tier.questions)} × ۵۰۰ تومان
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
