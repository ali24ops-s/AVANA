import { useState, useEffect } from "react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  Sparkles,
  Calendar,
  Clock,
  Save,
  CheckCircle2,
  AlertCircle,
  Crown,
} from "lucide-react";
import type { AdminProductRecord } from "../../../lib/api/admin.js";
import { formatToman } from "./commerceUtils.js";
import { toPersianDigits } from "@avana/domain";

interface AdminSubscriptionPricingSectionProps {
  onUpdated?: () => void;
}

export function AdminSubscriptionPricingSection({ onUpdated }: AdminSubscriptionPricingSectionProps) {
  const adminApi = useAdmin();

  const [subscriptions, setSubscriptions] = useState<AdminProductRecord[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [activeMap, setActiveMap] = useState<Record<string, boolean>>({});

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchSubscriptions = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminApi.listCommerceProducts();
      const subProducts = (res.products || []).filter((p) => p.type === "subscription");
      
      // Sort in standard order: monthly, quarterly, yearly, others
      subProducts.sort((a, b) => (a.durationDays || 0) - (b.durationDays || 0));

      setSubscriptions(subProducts);

      const initPrices: Record<string, string> = {};
      const initActive: Record<string, boolean> = {};
      for (const sp of subProducts) {
        initPrices[sp.id] = sp.price.toString();
        initActive[sp.id] = sp.active;
      }
      setPrices(initPrices);
      setActiveMap(initActive);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "خطا در دریافت لیست پلن‌های اشتراک";
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptions();
  }, []);

  const handlePriceChange = (id: string, val: string) => {
    setPrices((prev) => ({ ...prev, [id]: val }));
  };

  const handleActiveToggle = (id: string) => {
    setActiveMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validate all prices
    for (const sub of subscriptions) {
      const val = prices[sub.id]?.trim() ?? "";
      if (!val) {
        setErrorMsg(`لطفاً قیمت «${sub.title}» را وارد کنید.`);
        return;
      }
      const num = Number(val);
      if (isNaN(num) || !Number.isInteger(num) || num < 0) {
        setErrorMsg(`قیمت نامعتبر برای «${sub.title}». قیمت باید عدد صحیح نامنفی (تومان) باشد.`);
        return;
      }
    }

    setIsSaving(true);
    try {
      const updatePromises = subscriptions.map((sub) => {
        const newPrice = Number(prices[sub.id]);
        const newActive = activeMap[sub.id] ?? sub.active;
        return adminApi.updateCommerceProduct(sub.id, {
          price: newPrice,
          active: newActive,
        });
      });

      await Promise.all(updatePromises);

      setSuccessMsg("قیمت‌های پلن‌های اشتراک با موفقیت ذخیره شدند و بلافاصله برای خریدهای جدید اعمال می‌شوند.");
      if (onUpdated) onUpdated();
      setTimeout(() => {
        setSuccessMsg(null);
      }, 4000);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "خطا در ذخیره تغییرات قیمت اشتراک‌ها.";
      setErrorMsg(message);
    } finally {
      setIsSaving(false);
    }
  };

  const getTierIcon = (code: string, days?: number | null) => {
    if (code.includes("month") || days === 30) {
      return <Calendar className="w-4 h-4 text-blue-500" />;
    }
    if (code.includes("quarter") || days === 90) {
      return <Sparkles className="w-4 h-4 text-amber-500" />;
    }
    return <Crown className="w-4 h-4 text-emerald-500" />;
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
            <Sparkles className="w-5 h-5 text-[var(--color-primary-default)]" />
            <span>قیمت‌گذاری پلن‌های اشتراک</span>
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            مدیریت قیمت فروش و وضعیت عرضه پلن‌های اشتراک دوره‌ای آوانا (ماهانه، فصلی و سالانه)
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-8 text-[var(--color-text-muted)]">
          <div className="w-6 h-6 rounded-full border-2 border-[var(--color-primary-default)] border-t-transparent animate-spin mb-2" />
          <span className="text-xs">در حال بارگذاری پلن‌های اشتراک...</span>
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="text-center py-6 text-xs text-[var(--color-text-muted)]">
          هیچ محصول اشتراکی در کاتالوگ تعریف نشده است.
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {/* Subscription Tier Cards */}
          <div>
            <span className="text-xs font-bold text-[var(--color-text)] block mb-3">
              پلن‌های فعال اشتراک (قابل ویرایش توسط ادمین):
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {subscriptions.map((sub) => {
                const curPrice = prices[sub.id] || "";
                const isActive = activeMap[sub.id] ?? sub.active;

                return (
                  <div
                    key={sub.id}
                    className="bg-[var(--color-surface-warm)]/40 border border-[var(--color-border)] rounded-xl p-4 space-y-3 flex flex-col justify-between"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5">
                          {getTierIcon(sub.code, sub.durationDays)}
                          <span>{sub.title}</span>
                        </label>
                        <span className="text-[11px] font-mono text-[var(--color-text-muted)] bg-[var(--color-surface)] px-1.5 py-0.5 rounded border border-[var(--color-border)]">
                          {sub.code}
                        </span>
                      </div>

                      {sub.durationDays && (
                        <div className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                          <Clock className="w-3 h-3 text-[var(--color-primary-default)]" />
                          <span>مدت اعتبار: {toPersianDigits(sub.durationDays)} روز</span>
                        </div>
                      )}

                      {/* Price Input */}
                      <div className="space-y-1 pt-1">
                        <label className="text-[11px] font-medium text-[var(--color-text-muted)] block">
                          قیمت فروش:
                        </label>
                        <div className="flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] focus-within:border-[var(--color-primary-default)] overflow-hidden shadow-xs">
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={curPrice}
                            onChange={(e) => handlePriceChange(sub.id, e.target.value)}
                            className="w-full bg-transparent px-3 py-2 text-sm font-mono font-bold text-[var(--color-text)] focus:outline-none placeholder:text-[var(--color-text-muted)] min-w-0"
                            placeholder="مثال: ۹۹۰۰۰"
                            dir="ltr"
                            aria-label={`قیمت ${sub.title}`}
                          />
                          <span className="px-3 py-2 text-xs font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)]/60 border-s border-[var(--color-border)] select-none shrink-0">
                            تومان
                          </span>
                        </div>
                        <span className="text-[11px] text-[var(--color-text-muted)] block">
                          معادل: {formatToman(Number(curPrice) || 0)}
                        </span>
                      </div>
                    </div>

                    {/* Status Toggle */}
                    <div className="flex items-center justify-between pt-2 border-t border-[var(--color-border)]/60">
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        وضعیت عرضه:
                      </span>
                      <button
                        type="button"
                        onClick={() => handleActiveToggle(sub.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors cursor-pointer border ${
                          isActive
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                            : "bg-[var(--color-surface)] text-[var(--color-text-muted)] border-[var(--color-border)]"
                        }`}
                        aria-label={`وضعیت ${sub.title}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isActive ? "bg-emerald-500" : "bg-slate-400"
                          }`}
                        />
                        <span>{isActive ? "فعال برای خرید" : "غیرفعال"}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
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
