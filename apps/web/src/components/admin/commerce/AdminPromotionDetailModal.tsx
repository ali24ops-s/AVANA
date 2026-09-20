import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Percent,
  DollarSign,
  Coins,
  Calendar,
  AlertCircle,
  Loader2,
  Ticket,
  Users,
  Package,
  History,
  Copy,
  Check,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import type {
  AdminPromotionDetail,
  AdminPromotionRedemptionRecord,
} from "../../../lib/api/admin.js";
import { formatAmountOnly } from "./commerceUtils.js";
import { toPersianDigits } from "@avana/domain";

interface AdminPromotionDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  promotionId: string | null;
  onEditRequested?: (promo: AdminPromotionDetail) => void;
  onBulkGenerateRequested?: (promo: AdminPromotionDetail) => void;
}

export function AdminPromotionDetailModal({
  isOpen,
  onClose,
  promotionId,
  onEditRequested,
  onBulkGenerateRequested,
}: AdminPromotionDetailModalProps) {
  const adminApi = useAdmin();

  const [activeTab, setActiveTab] = useState<"overview" | "codes" | "redemptions">("overview");
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<AdminPromotionDetail | null>(null);

  // Redemptions state
  const [redemptions, setRedemptions] = useState<AdminPromotionRedemptionRecord[]>([]);
  const [loadingRedemptions, setLoadingRedemptions] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const fetchPromotion = async (id: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminApi.getCommercePromotion(id);
      setPromotion(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطا در دریافت جزئیات پروموشن";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  const fetchRedemptions = async (id: string) => {
    setLoadingRedemptions(true);
    try {
      const res = await adminApi.listCommercePromotionRedemptions({
        promotionId: id,
        limit: 100,
      });
      setRedemptions(res.items || res.redemptions || []);
    } catch {
      // ignore
    } finally {
      setLoadingRedemptions(false);
    }
  };

  useEffect(() => {
    if (isOpen && promotionId) {
      fetchPromotion(promotionId);
      fetchRedemptions(promotionId);
    } else {
      setPromotion(null);
      setRedemptions([]);
    }
  }, [isOpen, promotionId]);

  if (!isOpen) return null;

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const getBenefitBadge = (type: string, value: number) => {
    switch (type) {
      case "percentage_discount":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Percent className="w-3.5 h-3.5" />
            <span>تخفیف درصدی ({toPersianDigits(value)}٪)</span>
          </span>
        );
      case "fixed_discount":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
            <DollarSign className="w-3.5 h-3.5" />
            <span>تخفیف نقدی ({formatAmountOnly(value)} تومان)</span>
          </span>
        );
      case "percentage_cashback":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <Coins className="w-3.5 h-3.5" />
            <span>کش‌بک درصدی کیف پول ({toPersianDigits(value)}٪)</span>
          </span>
        );
      case "fixed_cashback":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Coins className="w-3.5 h-3.5" />
            <span>کش‌بک نقدی کیف پول ({formatAmountOnly(value)} تومان)</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      dir="rtl"
    >
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[var(--color-text)]">
                {promotion ? promotion.name : "جزئیات پروموشن"}
              </h2>
              {promotion && (
                <div className="flex items-center gap-2 mt-1">
                  {getBenefitBadge(promotion.benefitType, promotion.benefitValue)}
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                      promotion.active
                        ? "bg-emerald-500/15 text-emerald-500"
                        : "bg-gray-500/15 text-gray-500"
                    }`}
                  >
                    {promotion.active ? "فعال" : "غیرفعال"}
                  </span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] p-1.5 rounded-lg hover:bg-[var(--color-surface)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-bold shrink-0">
          <button
            onClick={() => setActiveTab("overview")}
            className={`pb-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === "overview"
                ? "border-[var(--color-primary-default)] text-[var(--color-primary-default)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>مشخصات و قوانین</span>
          </button>
          <button
            onClick={() => setActiveTab("codes")}
            className={`pb-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === "codes"
                ? "border-[var(--color-primary-default)] text-[var(--color-primary-default)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <Ticket className="w-4 h-4" />
            <span>کدهای کوپن ({toPersianDigits(promotion?.codes?.length ?? 0)})</span>
          </button>
          <button
            onClick={() => setActiveTab("redemptions")}
            className={`pb-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === "redemptions"
                ? "border-[var(--color-primary-default)] text-[var(--color-primary-default)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            <History className="w-4 h-4" />
            <span>تاریخچه استفاده‌ها ({toPersianDigits(redemptions.length)})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-[var(--color-text-muted)]">
              <Loader2 className="w-8 h-8 animate-spin mb-3 text-[var(--color-primary-default)]" />
              <p className="text-xs font-medium">در حال بارگذاری مشخصات پروموشن...</p>
            </div>
          ) : errorMsg || !promotion ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg || "اطلاعات پروموشن یافت نشد."}</span>
            </div>
          ) : (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === "overview" && (
                <div className="space-y-6">
                  {promotion.description && (
                    <div className="p-3.5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] leading-relaxed">
                      {promotion.description}
                    </div>
                  )}

                  {/* Limits & Rules Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] space-y-3">
                      <h4 className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-emerald-500" />
                        <span>محدودیت‌های مالی</span>
                      </h4>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between text-[var(--color-text-muted)]">
                          <span>حداقل سبد خرید:</span>
                          <span className="font-bold text-[var(--color-text)]">
                            {promotion.minOrderAmount
                              ? `${formatAmountOnly(promotion.minOrderAmount)} تومان`
                              : "بدون حداقل"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[var(--color-text-muted)]">
                          <span>سقف حداکثر تخفیف:</span>
                          <span className="font-bold text-[var(--color-text)]">
                            {promotion.maxDiscountAmount
                              ? `${formatAmountOnly(promotion.maxDiscountAmount)} تومان`
                              : "نامحدود"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] space-y-3">
                      <h4 className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-blue-500" />
                        <span>سقف و دفعات استفاده</span>
                      </h4>
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between text-[var(--color-text-muted)]">
                          <span>سقف کل استفاده‌ها:</span>
                          <span className="font-bold text-[var(--color-text)]">
                            {promotion.totalUsageLimit
                              ? `${formatAmountOnly(promotion.totalUsageLimit)} بار`
                              : "نامحدود"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[var(--color-text-muted)]">
                          <span>سقف استفاده هر کاربر:</span>
                          <span className="font-bold text-[var(--color-text)]">
                            {promotion.perUserUsageLimit
                              ? `${toPersianDigits(promotion.perUserUsageLimit)} بار`
                              : "نامحدود"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Validity Dates */}
                  <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] space-y-3">
                    <h4 className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-amber-500" />
                      <span>بازه زمانی اعتبار</span>
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="flex items-center justify-between text-[var(--color-text-muted)]">
                        <span>تاریخ شروع:</span>
                        <span className="font-medium text-[var(--color-text)]" dir="ltr">
                          {promotion.startsAt
                            ? toPersianDigits(new Date(promotion.startsAt).toLocaleString("fa-IR"))
                            : "از زمان ایجاد (فوری)"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[var(--color-text-muted)]">
                        <span>تاریخ پایان:</span>
                        <span className="font-medium text-[var(--color-text)]" dir="ltr">
                          {promotion.endsAt
                            ? toPersianDigits(new Date(promotion.endsAt).toLocaleString("fa-IR"))
                            : "بدون انقضا"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Target Restrictions */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] space-y-2">
                      <h4 className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5">
                        <Package className="w-4 h-4 text-purple-500" />
                        <span>محدودیت محصولات ({toPersianDigits(promotion.productRestrictions?.length ?? 0)})</span>
                      </h4>
                      {promotion.productRestrictions && promotion.productRestrictions.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {promotion.productRestrictions.map((item, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md text-[11px] font-mono text-[var(--color-text)]"
                            >
                              {item.productType || item.productId}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--color-text-muted)]">
                          قابل اعمال روی تمام محصولات (به‌جز شارژ کیف پول)
                        </p>
                      )}
                    </div>

                    <div className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-warm)] space-y-2">
                      <h4 className="text-xs font-bold text-[var(--color-text)] flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-teal-500" />
                        <span>محدودیت کاربران ({toPersianDigits(promotion.userRestrictions?.length ?? 0)})</span>
                      </h4>
                      {promotion.userRestrictions && promotion.userRestrictions.length > 0 ? (
                        <div className="max-h-24 overflow-y-auto space-y-1 mt-2">
                          {promotion.userRestrictions.map((item, idx) => (
                            <div
                              key={idx}
                              className="text-[11px] font-mono text-[var(--color-text-muted)]"
                            >
                              {item.userEmail || item.userId}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[var(--color-text-muted)]">
                          عمومی (قابل استفاده توسط تمام کاربران)
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: CODES */}
              {activeTab === "codes" && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--color-text-muted)]">
                      لیست کدهای فعال و استفاده‌شده برای این پروموشن
                    </span>
                    {onBulkGenerateRequested && (
                      <button
                        onClick={() => onBulkGenerateRequested(promotion)}
                        className="px-3 py-1.5 bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] rounded-xl text-xs font-bold hover:bg-[var(--color-primary-hover)] transition-colors flex items-center gap-1.5 shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>تولید کدهای بیشتر</span>
                      </button>
                    )}
                  </div>

                  {promotion.codes && promotion.codes.length > 0 ? (
                    <div className="border border-[var(--color-border)] rounded-xl overflow-hidden">
                      <table className="w-full text-xs text-right">
                        <thead className="bg-[var(--color-surface-warm)] border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                          <tr>
                            <th className="p-3">کد تخفیف</th>
                            <th className="p-3 text-center">سقف استفاده</th>
                            <th className="p-3 text-center">دفعات استفاده</th>
                            <th className="p-3 text-center">وضعیت</th>
                            <th className="p-3 text-left">عملیات</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border)]">
                          {promotion.codes.map((c) => (
                            <tr
                              key={c.id}
                              className="hover:bg-[var(--color-surface-warm)] transition-colors"
                            >
                              <td className="p-3 font-mono font-bold text-[var(--color-text)] select-all" dir="ltr">
                                {c.code}
                              </td>
                              <td className="p-3 text-center text-[var(--color-text-muted)]">
                                {c.maxUses ? `${toPersianDigits(c.maxUses)} بار` : "نامحدود"}
                              </td>
                              <td className="p-3 text-center font-bold text-[var(--color-text)]">
                                {(c as unknown as { timesUsed?: number }).timesUsed !== undefined
                                  ? toPersianDigits((c as unknown as { timesUsed?: number }).timesUsed!)
                                  : "—"}
                              </td>
                              <td className="p-3 text-center">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                    c.active
                                      ? "bg-emerald-500/15 text-emerald-500"
                                      : "bg-gray-500/15 text-gray-500"
                                  }`}
                                >
                                  {c.active ? "فعال" : "غیرفعال"}
                                </span>
                              </td>
                              <td className="p-3 text-left">
                                <button
                                  onClick={() => handleCopy(c.code)}
                                  className="px-2.5 py-1 bg-[var(--color-surface-warm)] border border-[var(--color-border)] hover:bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1"
                                >
                                  {copiedCode === c.code ? (
                                    <>
                                      <Check className="w-3 h-3 text-emerald-500" />
                                      <span>کپی شد</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3 h-3" />
                                      <span>کپی</span>
                                    </>
                                  )}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-8 text-center border border-dashed border-[var(--color-border)] rounded-2xl text-[var(--color-text-muted)] text-xs">
                      هنوز کدی برای این پروموشن ایجاد نشده است.
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: REDEMPTIONS */}
              {activeTab === "redemptions" && (
                <div className="space-y-4">
                  {loadingRedemptions ? (
                    <div className="flex flex-col items-center justify-center py-8 text-[var(--color-text-muted)]">
                      <Loader2 className="w-6 h-6 animate-spin mb-2 text-[var(--color-primary-default)]" />
                      <p className="text-xs">در حال دریافت تاریخچه استفاده‌ها...</p>
                    </div>
                  ) : redemptions.length > 0 ? (
                    <div className="border border-[var(--color-border)] rounded-xl overflow-hidden">
                      <table className="w-full text-xs text-right">
                        <thead className="bg-[var(--color-surface-warm)] border-b border-[var(--color-border)] text-[var(--color-text-muted)]">
                          <tr>
                            <th className="p-3">شماره سفارش</th>
                            <th className="p-3">کاربر</th>
                            <th className="p-3">کد</th>
                            <th className="p-3 text-center">تخفیف اعمال شده</th>
                            <th className="p-3 text-center">کش‌بک واریز شده</th>
                            <th className="p-3 text-center">وضعیت</th>
                            <th className="p-3 text-left">تاریخ ثبت</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border)]">
                          {redemptions.map((r) => (
                            <tr
                              key={r.id}
                              className="hover:bg-[var(--color-surface-warm)] transition-colors"
                            >
                              <td className="p-3 font-mono font-bold text-[var(--color-text)]">
                                {r.orderNumber || r.orderId.slice(0, 8)}
                              </td>
                              <td className="p-3 text-[var(--color-text-muted)]" dir="ltr">
                                {r.userEmail || r.userId.slice(0, 8)}
                              </td>
                              <td className="p-3 font-mono font-medium text-[var(--color-text)]" dir="ltr">
                                {r.code || "—"}
                              </td>
                              <td className="p-3 text-center font-bold text-blue-500">
                                {r.discountAmount > 0
                                  ? `${formatAmountOnly(r.discountAmount)} ت`
                                  : "—"}
                              </td>
                              <td className="p-3 text-center font-bold text-emerald-500">
                                {r.cashbackAmount > 0
                                  ? `${formatAmountOnly(r.cashbackAmount)} ت`
                                  : "—"}
                              </td>
                              <td className="p-3 text-center">
                                {r.status === "completed" ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-500">
                                    <CheckCircle2 className="w-3 h-3" />
                                    <span>نهایی شده</span>
                                  </span>
                                ) : r.status === "pending" ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-500">
                                    <Clock className="w-3 h-3" />
                                    <span>رزرو / در انتظار پرداخت</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/15 text-red-500">
                                    <XCircle className="w-3 h-3" />
                                    <span>لغو / منقضی</span>
                                  </span>
                                )}
                              </td>
                              <td className="p-3 text-left text-[var(--color-text-muted)]" dir="ltr">
                                {toPersianDigits(new Date(r.redeemedAt || r.completedAt || "").toLocaleString("fa-IR"))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-8 text-center border border-dashed border-[var(--color-border)] rounded-2xl text-[var(--color-text-muted)] text-xs">
                      هنوز هیچ استفاده موفقی از این پروموشن ثبت نشده است.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {promotion && onEditRequested && (
              <button
                onClick={() => {
                  onClose();
                  onEditRequested(promotion);
                }}
                className="px-4 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] rounded-xl text-xs font-bold transition-colors"
              >
                ویرایش پروموشن
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] rounded-xl text-xs font-bold hover:bg-[var(--color-primary-hover)] transition-colors"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
