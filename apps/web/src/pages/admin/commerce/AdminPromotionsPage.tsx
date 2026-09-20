import React, { useState, useEffect, useMemo } from "react";
import {
  Percent,
  Plus,
  Search,
  Ticket,
  Coins,
  DollarSign,
  Eye,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  TrendingUp,
  Tag,
} from "lucide-react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import type {
  AdminPromotionRecord,
  AdminPromotionDetail,
} from "../../../lib/api/admin.js";
import { formatAmountOnly } from "../../../components/admin/commerce/commerceUtils.js";
import { toPersianDigits } from "@avana/domain";
import { AdminCommerceNavigation } from "../../../components/admin/commerce/AdminCommerceNavigation.js";
import { AdminPromotionFormModal } from "../../../components/admin/commerce/AdminPromotionFormModal.js";
import { AdminPromotionDetailModal } from "../../../components/admin/commerce/AdminPromotionDetailModal.js";
import { AdminBulkGenerateModal } from "../../../components/admin/commerce/AdminBulkGenerateModal.js";
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminErrorState,
} from "../../../components/admin/AdminUI.js";
import { PageHeader } from "../../../components/ui/index.js";

export function AdminPromotionsPage() {
  const adminApi = useAdmin();

  const [promotions, setPromotions] = useState<AdminPromotionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search & Filters
  const [search, setSearch] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [promotionToEdit, setPromotionToEdit] = useState<AdminPromotionDetail | null>(null);

  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  const [selectedPromotionId, setSelectedPromotionId] = useState<string | null>(null);

  const [isBulkGenOpen, setIsBulkGenOpen] = useState<boolean>(false);
  const [selectedPromotionForBulk, setSelectedPromotionForBulk] = useState<AdminPromotionRecord | null>(null);

  // Summary stats
  const [stats, setStats] = useState<{
    totalRedemptions: number;
    totalDiscountAmount: number;
    totalCashbackAmount: number;
  }>({
    totalRedemptions: 0,
    totalDiscountAmount: 0,
    totalCashbackAmount: 0,
  });

  const fetchPromotions = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminApi.listCommercePromotions();
      setPromotions(res.items || res.promotions || []);

      // fetch redemptions stats
      try {
        const redemptionsRes = await adminApi.listCommercePromotionRedemptions({ limit: 500 });
        let totalDisc = 0;
        let totalCash = 0;
        let count = 0;
        const redemptionsList = redemptionsRes.items || redemptionsRes.redemptions || [];
        for (const r of redemptionsList) {
          if (r.status === "completed") {
            count += 1;
            totalDisc += r.discountAmount || 0;
            totalCash += r.cashbackAmount || 0;
          }
        }
        setStats({
          totalRedemptions: count,
          totalDiscountAmount: totalDisc,
          totalCashbackAmount: totalCash,
        });
      } catch {
        // non-critical
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطا در دریافت لیست پروموشن‌ها";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPromotions();
  }, []);

  const handleToggleActive = async (promo: AdminPromotionRecord) => {
    try {
      await adminApi.toggleCommercePromotionActive(promo.id, !promo.active);
      setPromotions((prev) =>
        prev.map((p) => (p.id === promo.id ? { ...p, active: !p.active } : p))
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "خطا در تغییر وضعیت پروموشن");
    }
  };

  const handleDelete = async (promo: AdminPromotionRecord) => {
    if (
      !window.confirm(
        `آیا از حذف پروموشن «${promo.name}» مطمئن هستید؟ این عمل غیرقابل بازگشت است.`
      )
    ) {
      return;
    }
    try {
      await adminApi.deleteCommercePromotion(promo.id);
      setPromotions((prev) => prev.filter((p) => p.id !== promo.id));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "خطا در حذف پروموشن");
    }
  };

  const handleOpenEdit = async (promo: AdminPromotionRecord) => {
    try {
      const res = await adminApi.getCommercePromotion(promo.id);
      setPromotionToEdit(res);
      setIsFormOpen(true);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "خطا در بارگذاری جزئیات پروموشن");
    }
  };

  const handleOpenDetail = (promoId: string) => {
    setSelectedPromotionId(promoId);
    setIsDetailOpen(true);
  };

  const handleOpenBulk = (promo: AdminPromotionRecord) => {
    setSelectedPromotionForBulk(promo);
    setIsBulkGenOpen(true);
  };

  // Filtered List
  const filteredPromotions = useMemo(() => {
    return promotions.filter((p) => {
      if (typeFilter !== "all" && p.benefitType !== typeFilter) return false;
      if (statusFilter === "active" && !p.active) return false;
      if (statusFilter === "inactive" && p.active) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesDesc = (p.description || "").toLowerCase().includes(q);
        const matchesCode = (p.primaryCode || "").toLowerCase().includes(q);
        if (!matchesName && !matchesDesc && !matchesCode) return false;
      }
      return true;
    });
  }, [promotions, search, typeFilter, statusFilter]);

  const activeCount = useMemo(() => promotions.filter((p) => p.active).length, [promotions]);

  const renderBenefitBadge = (type: string, value: number) => {
    switch (type) {
      case "percentage_discount":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
            <Percent className="w-3.5 h-3.5" />
            <span>تخفیف {toPersianDigits(value)}٪</span>
          </span>
        );
      case "fixed_discount":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
            <DollarSign className="w-3.5 h-3.5" />
            <span>تخفیف {formatAmountOnly(value)} ت</span>
          </span>
        );
      case "percentage_cashback":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <Coins className="w-3.5 h-3.5" />
            <span>کش‌بک {toPersianDigits(value)}٪</span>
          </span>
        );
      case "fixed_cashback":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <Coins className="w-3.5 h-3.5" />
            <span>کش‌بک {formatAmountOnly(value)} ت</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <PageHeader
        title="تخفیف‌ها و پروموشن‌ها"
        badge={{
          text: "سیستم تخفیف و وفاداری",
          icon: <Percent className="w-3.5 h-3.5 shrink-0" />,
        }}
        description="مدیریت کدهای تخفیف درصدی، تخفیف‌های نقدی، کش‌بک کیف پول و جشنواره‌های فروش"
      />

      {/* Navigation */}
      <AdminCommerceNavigation />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm">
          <div className="flex items-center justify-between text-[var(--color-text-muted)] text-xs mb-2">
            <span>کل پروموشن‌ها</span>
            <Tag className="w-4 h-4 text-[var(--color-primary-default)]" />
          </div>
          <div className="text-xl font-bold text-[var(--color-text)]">
            {toPersianDigits(promotions.length)}{" "}
            <span className="text-xs font-normal text-emerald-500">
              ({toPersianDigits(activeCount)} فعال)
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm">
          <div className="flex items-center justify-between text-[var(--color-text-muted)] text-xs mb-2">
            <span>تعداد دفعات استفاده</span>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-bold text-[var(--color-text)]">
            {formatAmountOnly(stats.totalRedemptions)}{" "}
            <span className="text-xs font-normal text-[var(--color-text-muted)]">
              سفارش
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm">
          <div className="flex items-center justify-between text-[var(--color-text-muted)] text-xs mb-2">
            <span>مجموع تخفیف‌های اعطا شده</span>
            <DollarSign className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-xl font-bold text-[var(--color-text)]">
            {formatAmountOnly(stats.totalDiscountAmount)}{" "}
            <span className="text-xs font-normal text-[var(--color-text-muted)]">
              تومان
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm">
          <div className="flex items-center justify-between text-[var(--color-text-muted)] text-xs mb-2">
            <span>مجموع کش‌بک‌های کیف پول</span>
            <Coins className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-[var(--color-text)]">
            {formatAmountOnly(stats.totalCashbackAmount)}{" "}
            <span className="text-xs font-normal text-[var(--color-text-muted)]">
              تومان
            </span>
          </div>
        </div>
      </div>

      {/* Action & Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="جستجو در نام پروموشن، توضیحات یا کد..."
                className="w-full ps-9 pe-3 py-2 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl text-xs font-medium text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)]"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="ps-3 pe-8 py-2 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl text-xs font-medium text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] cursor-pointer"
              >
                <option value="all">همه انواع مزیت</option>
                <option value="percentage_discount">تخفیف درصدی</option>
                <option value="fixed_discount">تخفیف مبلغ ثابت</option>
                <option value="percentage_cashback">کش‌بک درصدی کیف پول</option>
                <option value="fixed_cashback">کش‌بک مبلغ ثابت کیف پول</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="ps-3 pe-8 py-2 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl text-xs font-medium text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] cursor-pointer"
              >
                <option value="all">همه وضعیت‌ها</option>
                <option value="active">فقط فعال‌ها</option>
                <option value="inactive">فقط غیرفعال‌ها</option>
              </select>
            </div>
          </div>

          <button
            onClick={() => {
              setPromotionToEdit(null);
              setIsFormOpen(true);
            }}
            className="px-4 py-2 bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] rounded-xl text-xs font-bold hover:bg-[var(--color-primary-hover)] transition-all flex items-center justify-center gap-2 shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>تعریف پروموشن جدید</span>
          </button>
        </div>
      </div>

      {/* Main Promotions Table */}
      <div className="border border-[var(--color-border)] rounded-2xl bg-[var(--color-surface)] shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead className="bg-[var(--color-surface-warm)] border-b border-[var(--color-border)] text-[var(--color-text-muted)] font-bold">
              <tr>
                <th className="p-4">نام و کد شاخص</th>
                <th className="p-4">نوع و مقدار مزیت</th>
                <th className="p-4 text-center">کدها / استفاده‌ها</th>
                <th className="p-4 text-center">محدودیت‌ها</th>
                <th className="p-4 text-center">اعتبار زمانی</th>
                <th className="p-4 text-center">وضعیت</th>
                <th className="p-4 text-left">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {loading ? (
                <AdminLoadingState colSpan={7} />
              ) : errorMsg ? (
                <AdminErrorState message={errorMsg} colSpan={7} />
              ) : filteredPromotions.length === 0 ? (
                <AdminEmptyState message="هیچ پروموشن یا کد تخفیفی یافت نشد." />
              ) : (
                filteredPromotions.map((p) => (
                  <tr
                    key={p.id}
                    className="hover:bg-[var(--color-surface-warm)]/60 transition-colors"
                  >
                    <td className="p-4">
                      <div className="font-bold text-[var(--color-text)] text-sm mb-1">
                        {p.name}
                      </div>
                      <div className="flex items-center gap-2">
                        {p.primaryCode ? (
                          <span
                            className="font-mono text-xs px-2 py-0.5 rounded bg-[var(--color-surface-warm)] border border-[var(--color-border)] font-bold text-[var(--color-text)] select-all"
                            dir="ltr"
                          >
                            {p.primaryCode}
                          </span>
                        ) : (
                          <span className="text-[11px] text-[var(--color-text-muted)]">
                            (چندکدی / پویا)
                          </span>
                        )}
                        {p.codesCount && p.codesCount > 1 ? (
                          <span className="text-[11px] text-[var(--color-text-muted)]">
                            +{toPersianDigits(p.codesCount - 1)} کد دیگر
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td className="p-4">
                      {renderBenefitBadge(p.benefitType, p.benefitValue)}
                    </td>

                    <td className="p-4 text-center">
                      <div className="font-bold text-[var(--color-text)]">
                        {toPersianDigits(p.totalRedemptions ?? 0)} بار استفاده
                      </div>
                      <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        {p.totalUsageLimit
                          ? `از سقف ${toPersianDigits(p.totalUsageLimit)}`
                          : "بدون سقف کل"}
                      </div>
                    </td>

                    <td className="p-4 text-center">
                      <div className="text-[11px] text-[var(--color-text-muted)] space-y-0.5">
                        <div>
                          حداقل خرید:{" "}
                          <span className="font-medium text-[var(--color-text)]">
                            {p.minOrderAmount
                              ? `${formatAmountOnly(p.minOrderAmount)} ت`
                              : "ندارد"}
                          </span>
                        </div>
                        {p.maxDiscountAmount ? (
                          <div>
                            سقف تخفیف:{" "}
                            <span className="font-medium text-[var(--color-text)]">
                              {formatAmountOnly(p.maxDiscountAmount)} ت
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </td>

                    <td className="p-4 text-center">
                      <div className="text-[11px] text-[var(--color-text-muted)] space-y-0.5">
                        {p.endsAt ? (
                          <div>
                            تا{" "}
                            <span className="font-medium text-[var(--color-text)]">
                              {new Date(p.endsAt).toLocaleDateString("fa-IR")}
                            </span>
                          </div>
                        ) : (
                          <span className="text-emerald-500 font-medium">نامحدود</span>
                        )}
                      </div>
                    </td>

                    <td className="p-4 text-center">
                      <button
                        onClick={() => handleToggleActive(p)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                          p.active
                            ? "bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500/25"
                            : "bg-gray-500/15 text-gray-500 hover:bg-gray-500/25"
                        }`}
                      >
                        {p.active ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>فعال</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3.5 h-3.5" />
                            <span>غیرفعال</span>
                          </>
                        )}
                      </button>
                    </td>

                    <td className="p-4 text-left">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => handleOpenDetail(p.id)}
                          title="مشاهده جزئیات و تاریخچه"
                          className="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-primary-default)] hover:bg-[var(--color-surface-warm)] rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenBulk(p)}
                          title="تولید کدهای دسته‌ای"
                          className="p-1.5 text-[var(--color-text-muted)] hover:text-purple-500 hover:bg-[var(--color-surface-warm)] rounded-lg transition-colors"
                        >
                          <Ticket className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(p)}
                          title="ویرایش"
                          className="p-1.5 text-[var(--color-text-muted)] hover:text-blue-500 hover:bg-[var(--color-surface-warm)] rounded-lg transition-colors"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(p)}
                          title="حذف پروموشن"
                          className="p-1.5 text-[var(--color-text-muted)] hover:text-red-500 hover:bg-[var(--color-surface-warm)] rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      <AdminPromotionFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setPromotionToEdit(null);
        }}
        promotionToEdit={promotionToEdit}
        onSaved={fetchPromotions}
      />

      <AdminPromotionDetailModal
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedPromotionId(null);
        }}
        promotionId={selectedPromotionId}
        onEditRequested={(detail) => {
          setPromotionToEdit(detail);
          setIsFormOpen(true);
        }}
        onBulkGenerateRequested={(detail) => {
          const promoRecord = promotions.find((p) => p.id === detail.id) || null;
          setSelectedPromotionForBulk(promoRecord);
          setIsBulkGenOpen(true);
        }}
      />

      <AdminBulkGenerateModal
        isOpen={isBulkGenOpen}
        onClose={() => {
          setIsBulkGenOpen(false);
          setSelectedPromotionForBulk(null);
        }}
        promotion={selectedPromotionForBulk}
        onGenerated={fetchPromotions}
      />
    </div>
  );
}
