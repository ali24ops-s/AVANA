import { useState, useEffect } from "react";
import { useAdmin } from "../../../hooks/useAdmin.js";
import {
  ShoppingBag,
  Search,
  Filter,
  Edit2,
  CheckCircle2,
  XCircle,
  Sparkles,
  BookOpen,
  FolderTree,
  FileText,
  Infinity as InfinityIcon,
  Clock,
} from "lucide-react";
import type { AdminProductRecord } from "../../../lib/api/admin.js";
import {
  formatToman,
  getResourceTypeLabel,
} from "../../../components/admin/commerce/commerceUtils.js";
import {
  AdminTable,
  AdminEmptyState,
  AdminLoadingState,
  AdminErrorState,
} from "../../../components/admin/AdminUI.js";
import { AdminProductEditModal } from "../../../components/admin/commerce/AdminProductEditModal.js";
import { AdminCommerceNavigation } from "../../../components/admin/commerce/AdminCommerceNavigation.js";

export function AdminProductsPage() {
  const adminApi = useAdmin();

  const [products, setProducts] = useState<AdminProductRecord[]>([]);
  const [search, setSearch] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectedProductForEdit, setSelectedProductForEdit] = useState<AdminProductRecord | null>(null);

  const fetchProducts = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const res = await adminApi.listCommerceProducts();
      setProducts(res.products);
    } catch (err: any) {
      setErrorMsg(err.message || "خطا در دریافت کاتالوگ محصولات");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const filteredProducts = products.filter((p) => {
    if (typeFilter !== "all" && p.type !== typeFilter) return false;
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)] flex items-center gap-2.5">
            <ShoppingBag className="w-7 h-7 text-[var(--color-primary-default)]" />
            کاتالوگ و قیمت‌گذاری محصولات (Products Catalog)
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            مدیریت محصولات قابل خرید شامل اشتراک‌ها، دوره‌های آموزشی و بسته‌های محتوایی
          </p>
        </div>
      </div>

      {/* Commerce Workspace Navigation Tabs */}
      <AdminCommerceNavigation />

      {/* Filter and Search Bar */}
      <div className="border border-[var(--color-border)] rounded-2xl p-4 bg-[var(--color-surface)] shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="جستجوی نام یا کد محصول..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-10 pe-4 py-2.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)]"
          />
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3 top-3.5" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-[var(--color-text-muted)]" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-sm text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)]"
          >
            <option value="all">همه انواع محصولات</option>
            <option value="subscription">اشتراک‌ها (Subscriptions)</option>
            <option value="course">دوره‌های آموزشی (Courses)</option>
            <option value="content_pack">بسته‌های محتوایی (Packs)</option>
            <option value="content">درسنامه‌ها / محتوا (Content)</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <AdminTable
        headers={[
          "کد و شناسه محصول",
          "عنوان محصول",
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
          <AdminEmptyState message="هیچ محصولی مطابق با فیلتر یافت نشد." />
        ) : (
          filteredProducts.map((p) => {
            return (
              <tr key={p.id} className="hover:bg-[var(--color-surface-warm)]/60 transition-colors">
                <td className="px-6 py-4 font-mono text-xs text-[var(--color-text)] font-semibold">
                  {p.code}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-[var(--color-text)]">
                      {p.title}
                    </span>
                    {p.targetTitle && (
                      <span className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        منبع متصل: {p.targetTitle}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text)]">
                    {p.type === "subscription" ? (
                      <Sparkles className="w-4 h-4 text-[var(--color-primary-default)]" />
                    ) : p.type === "course" ? (
                      <BookOpen className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    ) : p.type === "content" ? (
                      <FileText className="w-4 h-4 text-[var(--color-primary-default)]" />
                    ) : (
                      <FolderTree className="w-4 h-4 text-[var(--color-primary-default)]" />
                    )}
                    <span>{getResourceTypeLabel(p.type)}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="font-bold text-[var(--color-primary-default)] text-sm">
                    {formatToman(p.price)}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
                  {p.durationDays ? (
                    <span className="flex items-center gap-1 text-[var(--color-text)]">
                      <Clock className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
                      {p.durationDays} روز
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[var(--color-primary-default)]">
                      <InfinityIcon className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
                      مادام‌العمر (دائمی)
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {p.active ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" />
                      فعال برای خرید
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                      <XCircle className="w-3 h-3" />
                      غیرفعال
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => setSelectedProductForEdit(p)}
                    className="p-1.5 rounded-lg bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-muted)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] transition-colors flex items-center gap-1 text-xs"
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
