import { useState, useEffect } from "react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  Sparkles,
  FileText,
  Layers,
  HelpCircle,
  FileCheck2,
  Lock,
  Save,
  CheckCircle2,
  AlertCircle,
  Calculator,
} from "lucide-react";
import type { ContentGenerationPricingConfig } from "../../../lib/api/admin.js";
import { formatToman } from "./commerceUtils.js";
import { toPersianDigits } from "@avana/domain";

export function AdminContentPricingSection() {
  const adminApi = useAdmin();

  const [pricing, setPricing] = useState<ContentGenerationPricingConfig | null>(null);
  const [lessonPrice, setLessonPrice] = useState<string>("15000");
  const [flashcardPrice, setFlashcardPrice] = useState<string>("7000");
  const [quizPrice, setQuizPrice] = useState<string>("9000");
  const [summaryPrice, setSummaryPrice] = useState<string>("4000");

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchPricing = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await adminApi.getContentGenerationPricing();
      setPricing(data);
      setLessonPrice(data.lessonBaselinePriceToman.toString());
      setFlashcardPrice(data.flashcardBaselinePriceToman.toString());
      setQuizPrice(data.examBaselinePriceToman.toString());
      setSummaryPrice(data.summaryFixedPriceToman.toString());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "خطا در دریافت تنظیمات قیمت‌گذاری مرجع";
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPricing();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const parseAndValidate = (val: string, label: string): number | null => {
      const trimmed = val.trim();
      if (!trimmed) {
        setErrorMsg(`لطفاً ${label} را وارد کنید.`);
        return null;
      }
      const num = Number(trimmed);
      if (isNaN(num) || !Number.isInteger(num) || num < 0) {
        setErrorMsg(`مقدار نامعتبر برای ${label}. قیمت باید یک عدد صحیح نامنفی (تومان) باشد.`);
        return null;
      }
      return num;
    };

    const lPrice = parseAndValidate(lessonPrice, "قیمت تولید درس");
    if (lPrice === null) return;

    const fPrice = parseAndValidate(flashcardPrice, "قیمت تولید فلشکارت");
    if (fPrice === null) return;

    const qPrice = parseAndValidate(quizPrice, "قیمت تولید آزمون");
    if (qPrice === null) return;

    const sPrice = parseAndValidate(summaryPrice, "قیمت خلاصه مروری");
    if (sPrice === null) return;

    setIsSaving(true);
    try {
      const res = await adminApi.updateContentGenerationPricing({
        lessonBaselinePriceToman: lPrice,
        flashcardBaselinePriceToman: fPrice,
        examBaselinePriceToman: qPrice,
        summaryFixedPriceToman: sPrice,
      });

      if (res.pricing) {
        setPricing(res.pricing);
        setLessonPrice(res.pricing.lessonBaselinePriceToman.toString());
        setFlashcardPrice(res.pricing.flashcardBaselinePriceToman.toString());
        setQuizPrice(res.pricing.examBaselinePriceToman.toString());
        setSummaryPrice(res.pricing.summaryFixedPriceToman.toString());
      }
      setSuccessMsg("قیمت‌های مرجع تولید محتوا با موفقیت ذخیره شدند و بلافاصله در تخمین‌های جدید اعمال می‌شوند.");
      setTimeout(() => {
        setSuccessMsg(null);
      }, 4000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "خطا در ذخیره تغییرات قیمت‌گذاری مرجع.";
      setErrorMsg(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-6 shadow-sm space-y-6"
      dir="rtl"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--color-border)] pb-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-[var(--color-text)] flex items-center gap-2">
            <Calculator className="w-5 h-5 text-[var(--color-primary-default)]" />
            <span>قیمت‌گذاری تولید محتوا</span>
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            مدیریت قیمت‌های مرجع فروش تولید محتوای هوش مصنوعی (Reference-Based User Pricing Baseline)
          </p>
        </div>

        {pricing?.updatedAt && (
          <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 self-start sm:self-auto bg-[var(--color-surface-warm)] px-3 py-1 rounded-lg border border-[var(--color-border)]">
            <span>آخرین بروزرسانی:</span>
            <span className="font-mono">{new Date(pricing.updatedAt).toLocaleDateString("fa-IR")}</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-8 text-[var(--color-text-muted)]">
          <div className="w-6 h-6 rounded-full border-2 border-[var(--color-primary-default)] border-t-transparent animate-spin mb-2" />
          <span className="text-xs">در حال بارگذاری تنظیمات قیمت‌گذاری مرجع...</span>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Read-Only Calibration Baseline Metadata */}
          <div className="bg-[var(--color-surface-warm)]/70 border border-[var(--color-border)] rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--color-text)] mb-3">
              <Lock className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
              <span>مبنای کالیبراسیون حجم و فایل مرجع (غیرقابل ویرایش)</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
                <span className="text-[11px] text-[var(--color-text-muted)] block mb-1">فایل مرجع</span>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[var(--color-primary-default)]" />
                  <span className="text-xs sm:text-sm font-bold text-[var(--color-text)] font-mono" dir="ltr">
                    {pricing?.referenceFileName || "40.pdf"}
                  </span>
                  <span className="text-[10px] bg-slate-500/10 text-slate-400 px-1.5 py-0.5 rounded border border-slate-500/20">
                    Read-only
                  </span>
                </div>
              </div>

              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
                <span className="text-[11px] text-[var(--color-text-muted)] block mb-1">حجم محتوای مرجع</span>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span className="text-xs sm:text-sm font-bold text-[var(--color-text)]">
                    {toPersianDigits((pricing?.referenceUsableTokens || 35572).toLocaleString("fa-IR"))} توکن
                  </span>
                  <span className="text-[10px] bg-slate-500/10 text-slate-400 px-1.5 py-0.5 rounded border border-slate-500/20">
                    Read-only
                  </span>
                </div>
              </div>

              <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 sm:col-span-2 lg:col-span-1">
                <span className="text-[11px] text-[var(--color-text-muted)] block mb-1">فرمول محاسباتی</span>
                <span className="text-[11px] text-[var(--color-text-muted)] block">
                  نسبت حجم فایل به ۳۵,۵۷۲ توکن × قیمت مرجع (گردشده به ۱۰۰ تومان)
                </span>
              </div>
            </div>
          </div>

          {/* Editable 4 Stage Prices */}
          <div>
            <span className="text-xs font-bold text-[var(--color-text)] block mb-3">
              قیمت‌های مرجع فروش مراحل تولید (قابل ویرایش توسط ادمین):
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 1. Lesson Price */}
              <div className="bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] rounded-xl p-4 space-y-2">
                <label className="text-xs font-medium text-[var(--color-text)] flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span>قیمت تولید درس</span>
                </label>
                <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] focus-within:border-[var(--color-primary-default)] overflow-hidden shadow-xs">
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={lessonPrice}
                    onChange={(e) => setLessonPrice(e.target.value)}
                    className="w-full bg-transparent px-3 py-2 text-sm font-mono font-bold text-[var(--color-text)] focus:outline-none placeholder:text-[var(--color-text-muted)] min-w-0"
                    placeholder="15000"
                    dir="ltr"
                  />
                  <span className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)]/60 border-s border-[var(--color-border)] select-none shrink-0">
                    تومان
                  </span>
                </div>
                <span className="text-[11px] text-[var(--color-text-muted)] block">
                  معادل: {formatToman(Number(lessonPrice) || 0)}
                </span>
              </div>

              {/* 2. Flashcard Price */}
              <div className="bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] rounded-xl p-4 space-y-2">
                <label className="text-xs font-medium text-[var(--color-text)] flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-amber-500" />
                  <span>قیمت تولید فلشکارت</span>
                </label>
                <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] focus-within:border-[var(--color-primary-default)] overflow-hidden shadow-xs">
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={flashcardPrice}
                    onChange={(e) => setFlashcardPrice(e.target.value)}
                    className="w-full bg-transparent px-3 py-2 text-sm font-mono font-bold text-[var(--color-text)] focus:outline-none placeholder:text-[var(--color-text-muted)] min-w-0"
                    placeholder="7000"
                    dir="ltr"
                  />
                  <span className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)]/60 border-s border-[var(--color-border)] select-none shrink-0">
                    تومان
                  </span>
                </div>
                <span className="text-[11px] text-[var(--color-text-muted)] block">
                  معادل: {formatToman(Number(flashcardPrice) || 0)}
                </span>
              </div>

              {/* 3. Quiz Price */}
              <div className="bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] rounded-xl p-4 space-y-2">
                <label className="text-xs font-medium text-[var(--color-text)] flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-purple-500" />
                  <span>قیمت تولید آزمون</span>
                </label>
                <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] focus-within:border-[var(--color-primary-default)] overflow-hidden shadow-xs">
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={quizPrice}
                    onChange={(e) => setQuizPrice(e.target.value)}
                    className="w-full bg-transparent px-3 py-2 text-sm font-mono font-bold text-[var(--color-text)] focus:outline-none placeholder:text-[var(--color-text-muted)] min-w-0"
                    placeholder="9000"
                    dir="ltr"
                  />
                  <span className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)]/60 border-s border-[var(--color-border)] select-none shrink-0">
                    تومان
                  </span>
                </div>
                <span className="text-[11px] text-[var(--color-text-muted)] block">
                  معادل: {formatToman(Number(quizPrice) || 0)}
                </span>
              </div>

              {/* 4. Review Summary Price */}
              <div className="bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] rounded-xl p-4 space-y-2">
                <label className="text-xs font-medium text-[var(--color-text)] flex items-center gap-1.5">
                  <FileCheck2 className="w-4 h-4 text-emerald-500" />
                  <span>قیمت خلاصه مروری</span>
                </label>
                <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] focus-within:border-[var(--color-primary-default)] overflow-hidden shadow-xs">
                  <input
                    type="number"
                    min="0"
                    step="100"
                    value={summaryPrice}
                    onChange={(e) => setSummaryPrice(e.target.value)}
                    className="w-full bg-transparent px-3 py-2 text-sm font-mono font-bold text-[var(--color-text)] focus:outline-none placeholder:text-[var(--color-text-muted)] min-w-0"
                    placeholder="4000"
                    dir="ltr"
                  />
                  <span className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)]/60 border-s border-[var(--color-border)] select-none shrink-0">
                    تومان
                  </span>
                </div>
                <span className="text-[11px] text-[var(--color-text-muted)] block">
                  معادل: {formatToman(Number(summaryPrice) || 0)} (ثابت)
                </span>
              </div>
            </div>
          </div>

          {/* Feedback Alerts */}
          {errorMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end pt-2 border-t border-[var(--color-border)]">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] font-medium text-xs sm:text-sm transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                  <span>در حال ذخیره...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>ذخیره تغییرات</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
