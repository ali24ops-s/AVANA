import { useState, useEffect } from "react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  ShoppingBag,
  Search,
  Filter,
  Edit2,
  CheckCircle2,
  XCircle,
  BookOpen,
  Infinity as InfinityIcon,
  Clock,
} from "lucide-react";
import type { AdminProductRecord } from "../../../lib/api/admin.js";
import {
  formatAmountOnly,
  getResourceTypeLabel,
} from "../../../components/admin/commerce/commerceUtils.js";
import { toPersianDigits } from "@avana/domain";
import {
  AdminTable,
  AdminEmptyState,
  AdminLoadingState,
  AdminErrorState,
} from "../../../components/admin/AdminUI.js";
import { AdminProductEditModal } from "../../../components/admin/commerce/AdminProductEditModal.js";
import { AdminCommerceNavigation } from "../../../components/admin/commerce/AdminCommerceNavigation.js";
import { AdminSubscriptionPricingSection } from "../../../components/admin/commerce/AdminSubscriptionPricingSection.js";
import { AdminSubscriptionBonusesSection } from "../../../components/admin/commerce/AdminSubscriptionBonusesSection.js";
import { AdminContentPricingSection } from "../../../components/admin/commerce/AdminContentPricingSection.js";
import { AdminSpecialExamPricingSection } from "../../../components/admin/commerce/AdminSpecialExamPricingSection.js";
import { PageHeader } from "../../../components/ui/index.js";

export function AdminProductsPage() {
  const adminApi = useAdmin();

  const [products, setProducts] = useState<AdminProductRecord[]>([]);
  const [search, setSearch] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("course");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedProductForEdit, setSelectedProductForEdit] = useState<AdminProductRecord | null>(null);

  const fetchProducts = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminApi.listCommerceProducts();
      setProducts(res.products);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "خطا در دریافت کاتالوگ محصولات";
      setErrorMsg(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  // Filter strictly for educational courses only
  const filteredProducts = products.filter((p) => {
    if (p.type !== "course") return false;
    if (typeFilter !== "course" && typeFilter !== "all") return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        p.title.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.targetTitle && p.targetTitle.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <PageHeader
        title="کاتالوگ و قیمت‌گذاری محصولات"
        badge={{
          text: "مدیریت محصولات",
          icon: <ShoppingBag className="w-3.5 h-3.5 shrink-0" />,
        }}
        description="مدیریت قیمت‌گذاری و عرضه دوره‌های آموزشی و سرویس‌های آوانا"
      />

      {/* Commerce Workspace Navigation Tabs */}
      <AdminCommerceNavigation />

      {/* 1. Subscription Pricing Section */}
      <AdminSubscriptionPricingSection onUpdated={fetchProducts} />

      {/* 2. Subscription Credit Bonuses Configuration Section */}
      <AdminSubscriptionBonusesSection />

      {/* 3. Content Generation Pricing Configuration Section */}
      <AdminContentPricingSection />

      {/* 4. Special Exam Pricing Configuration Section */}
      <AdminSpecialExamPricingSection />

      {/* 5. Educational Courses Section Header & Controls */}
      <div className="border border-[var(--color-border)] rounded-2xl p-4 bg-[var(--color-surface)] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80 flex items-center">
          <input
            type="text"
            placeholder="جستجوی نام یا کد دوره آموزشی..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-10 pe-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)]"
          />
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-[var(--color-text-muted)] shrink-0" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-3 pe-8 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)] cursor-pointer"
          >
            <option value="course">دوره‌های آموزشی (Courses)</option>
          </select>
        </div>
      </div>

      {/* Educational Courses Table */}
      <AdminTable
        headers={[
          "کد محصول",
          "عنوان دوره آموزشی",
          "نوع محصول",
          "قیمت فروش (تومان)",
          "مدت دسترسی",
          "وضعیت عرضه",
          "عملیات",
        ]}
      >
        {isLoading ? (
          <AdminLoadingState colSpan={7} />
        ) : errorMsg ? (
          <AdminErrorState colSpan={7} message={errorMsg} />
        ) : filteredProducts.length === 0 ? (
          <AdminEmptyState message="هیچ دوره‌ای مطابق با فیلتر یافت نشد." />
        ) : (
          filteredProducts.map((p) => {
            return (
              <tr key={p.id} className="hover:bg-[var(--color-surface-warm)]/60 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-[var(--color-text)] font-semibold whitespace-nowrap">
                  {p.code}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-[var(--color-text)] truncate max-w-[240px]" title={p.targetTitle ? `${p.title} (منبع متصل: ${p.targetTitle})` : p.title}>
                      {p.title}
                    </span>
                    {p.targetTitle && (
                      <span className="text-[10px] text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-1.5 py-0.5 rounded border border-[var(--color-border)] truncate max-w-[130px]" title={p.targetTitle}>
                        {p.targetTitle}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text)]">
                    <BookOpen className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>{getResourceTypeLabel(p.type)}</span>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap font-bold text-xs text-[var(--color-text)]">
                  {formatAmountOnly(p.price)}
                </td>
                <td className="px-4 py-3 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                  {p.durationDays ? (
                    <span className="flex items-center gap-1 text-[var(--color-text)]">
                      <Clock className="w-3 h-3 text-[var(--color-primary-default)]" />
                      {toPersianDigits(p.durationDays)} روز
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[var(--color-primary-default)]">
                      <InfinityIcon className="w-3 h-3 text-[var(--color-primary-default)]" />
                      مادام‌العمر
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {p.active ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" />
                      فعال
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                      <XCircle className="w-3 h-3" />
                      غیرفعال
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <button
                    onClick={() => setSelectedProductForEdit(p)}
                    className="p-1.5 rounded-lg bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] transition-colors flex items-center gap-1 text-xs cursor-pointer"
                    title="ویرایش قیمت و وضعیت عرضه"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>ویرایش</span>
                  </button>
                </td>
              </tr>
            );
          })
        )}
      </AdminTable>

      {/* Edit Modal */}
      <AdminProductEditModal
        isOpen={Boolean(selectedProductForEdit)}
        product={selectedProductForEdit}
        onClose={() => setSelectedProductForEdit(null)}
        onSuccess={() => {
          fetchProducts();
        }}
      />
    </div>
  );
}
