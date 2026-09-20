import { useState, useEffect } from "react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  Gift,
  Calendar,
  Save,
  CheckCircle2,
  AlertCircle,
  Coins,
  Sparkles,
} from "lucide-react";
import type { SubscriptionCreditBonusesConfig } from "../../../lib/api/admin.js";
import { formatToman } from "./commerceUtils.js";

export function AdminSubscriptionBonusesSection() {
  const adminApi = useAdmin();

  const [bonuses, setBonuses] = useState<SubscriptionCreditBonusesConfig | null>(null);
  const [monthlyBonus, setMonthlyBonus] = useState<string>("40000");
  const [quarterlyBonus, setQuarterlyBonus] = useState<string>("100000");
  const [annualBonus, setAnnualBonus] = useState<string>("200000");

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchBonuses = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const data = await adminApi.getSubscriptionCreditBonuses();
      setBonuses(data);
      setMonthlyBonus(data.monthly.toString());
      setQuarterlyBonus(data.quarterly.toString());
      setAnnualBonus(data.annual.toString());
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "خطا در دریافت مبالغ هدیه اشتراک";
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBonuses();
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
        setErrorMsg(
          `مقدار نامعتبر برای ${label}. مبلغ هدیه باید یک عدد صحیح نامنفی (تومان) باشد.`
        );
        return null;
      }
      return num;
    };

    const mBonus = parseAndValidate(monthlyBonus, "مبلغ هدیه اشتراک ۱ ماهه");
    if (mBonus === null) return;

    const qBonus = parseAndValidate(quarterlyBonus, "مبلغ هدیه اشتراک ۳ ماهه");
    if (qBonus === null) return;

    const aBonus = parseAndValidate(annualBonus, "مبلغ هدیه اشتراک ۱ ساله");
    if (aBonus === null) return;

    setIsSaving(true);
    try {
      const res = await adminApi.updateSubscriptionCreditBonuses({
        monthly: mBonus,
        quarterly: qBonus,
        annual: aBonus,
      });

      if (res.bonuses) {
        setBonuses(res.bonuses);
        setMonthlyBonus(res.bonuses.monthly.toString());
        setQuarterlyBonus(res.bonuses.quarterly.toString());
        setAnnualBonus(res.bonuses.annual.toString());
      }
      setSuccessMsg(
        "مبالغ اعتبار هدیه اشتراک‌ها با موفقیت ذخیره شدند و بلافاصله در فعالسازی‌ها و صفحه قیمت‌گذاری اعمال می‌شوند."
      );
      setTimeout(() => {
        setSuccessMsg(null);
      }, 4000);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "خطا در ذخیره مبالغ اعتبار هدیه اشتراک.";
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
            <Gift className="w-5 h-5 text-[var(--color-primary-default)]" />
            <span>اعتبار هدیه کیف پول پس از فعالسازی اشتراک</span>
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            تعیین مبلغ بونوس شارژ کیف پول (Avana Credit) که بلافاصله پس از خرید یا تمدید موفق هر پلن به حساب کاربر واریز می‌شود.
          </p>
        </div>

        {bonuses?.updatedAt && (
          <div className="text-[11px] text-[var(--color-text-muted)] flex items-center gap-1.5 self-start sm:self-auto bg-[var(--color-surface-warm)] px-3 py-1 rounded-lg border border-[var(--color-border)]">
            <span>آخرین بروزرسانی:</span>
            <span className="font-mono">
              {new Date(bonuses.updatedAt).toLocaleDateString("fa-IR")}
            </span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-8 text-[var(--color-text-muted)]">
          <div className="w-6 h-6 rounded-full border-2 border-[var(--color-primary-default)] border-t-transparent animate-spin mb-2" />
          <span className="text-xs">در حال بارگذاری مبالغ اعتبار هدیه اشتراک...</span>
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Information Card */}
          <div className="bg-[var(--color-surface-warm)]/70 border border-[var(--color-border)] rounded-xl p-4 flex items-start gap-3">
            <Coins className="w-5 h-5 text-[var(--color-primary-default)] shrink-0 mt-0.5" />
            <div className="text-xs text-[var(--color-text-muted)] space-y-1 leading-relaxed">
              <p className="font-medium text-[var(--color-text)]">
                مکانیزم واریز خودکار اعتبار هدیه (Wallet Gift Bonus)
              </p>
              <p>
                با فعالسازی هر اشتراک، مبلغ تعریف‌شده به عنوان اعتبار به کیف پول کاربر اضافه می‌شود و در صفحه قیمت‌گذاری و معرفی پلن‌ها نیز به عنوان ارزش افزوده نمایش می‌یابد.
              </p>
            </div>
          </div>

          {/* 3 Subscription Bonus Tiers */}
          <div>
            <span className="text-xs font-bold text-[var(--color-text)] block mb-3">
              مبالغ اعتبار هدیه پلن‌های اشتراک (قابل ویرایش توسط ادمین):
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* 1. Monthly (1 Month) */}
              <div className="bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] rounded-xl p-4 space-y-2">
                <label className="text-xs font-medium text-[var(--color-text)] flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span>اشتراک ۱ ماهه (ماهانه)</span>
                </label>
                <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] focus-within:border-[var(--color-primary-default)] overflow-hidden shadow-xs">
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={monthlyBonus}
                    onChange={(e) => setMonthlyBonus(e.target.value)}
                    className="w-full bg-transparent px-3 py-2 text-sm font-mono font-bold text-[var(--color-text)] focus:outline-none placeholder:text-[var(--color-text-muted)] min-w-0"
                    placeholder="40000"
                    dir="ltr"
                    aria-label="مبلغ هدیه اشتراک ۱ ماهه"
                  />
                  <span className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)]/60 border-s border-[var(--color-border)] select-none shrink-0">
                    تومان
                  </span>
                </div>
                <span className="text-[11px] text-[var(--color-text-muted)] block">
                  معادل: {formatToman(Number(monthlyBonus) || 0)}
                </span>
              </div>

              {/* 2. Quarterly (3 Months) */}
              <div className="bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] rounded-xl p-4 space-y-2">
                <label className="text-xs font-medium text-[var(--color-text)] flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>اشتراک ۳ ماهه (فصلی)</span>
                </label>
                <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] focus-within:border-[var(--color-primary-default)] overflow-hidden shadow-xs">
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={quarterlyBonus}
                    onChange={(e) => setQuarterlyBonus(e.target.value)}
                    className="w-full bg-transparent px-3 py-2 text-sm font-mono font-bold text-[var(--color-text)] focus:outline-none placeholder:text-[var(--color-text-muted)] min-w-0"
                    placeholder="100000"
                    dir="ltr"
                    aria-label="مبلغ هدیه اشتراک ۳ ماهه"
                  />
                  <span className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)]/60 border-s border-[var(--color-border)] select-none shrink-0">
                    تومان
                  </span>
                </div>
                <span className="text-[11px] text-[var(--color-text-muted)] block">
                  معادل: {formatToman(Number(quarterlyBonus) || 0)}
                </span>
              </div>

              {/* 3. Annual (1 Year) */}
              <div className="bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] rounded-xl p-4 space-y-2">
                <label className="text-xs font-medium text-[var(--color-text)] flex items-center gap-1.5">
                  <Gift className="w-4 h-4 text-emerald-500" />
                  <span>اشتراک ۱ ساله (سالانه)</span>
                </label>
                <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] focus-within:border-[var(--color-primary-default)] overflow-hidden shadow-xs">
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={annualBonus}
                    onChange={(e) => setAnnualBonus(e.target.value)}
                    className="w-full bg-transparent px-3 py-2 text-sm font-mono font-bold text-[var(--color-text)] focus:outline-none placeholder:text-[var(--color-text-muted)] min-w-0"
                    placeholder="200000"
                    dir="ltr"
                    aria-label="مبلغ هدیه اشتراک ۱ ساله"
                  />
                  <span className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)]/60 border-s border-[var(--color-border)] select-none shrink-0">
                    تومان
                  </span>
                </div>
                <span className="text-[11px] text-[var(--color-text-muted)] block">
                  معادل: {formatToman(Number(annualBonus) || 0)}
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
