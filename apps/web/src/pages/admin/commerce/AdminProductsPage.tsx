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
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <ShoppingBag className="w-7 h-7 text-teal-400" />
            کاتالوگ و قیمت‌گذاری محصولات (Products Catalog)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            مدیریت محصولات قابل خرید شامل اشتراک‌ها، دوره‌های آموزشی و بسته‌های محتوایی
          </p>
        </div>
      </div>

      {/* Commerce Workspace Navigation Tabs */}
      <AdminCommerceNavigation />

      {/* Filter and Search Bar */}
      <div className="glass-panel border border-white/5 rounded-2xl p-4 bg-slate-800/40 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="جستجوی نام یا کد محصول..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-900/60 border border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3.5" />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-slate-900/60 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500"
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
              <tr key={p.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-6 py-4 font-mono text-xs text-slate-300 font-semibold">
                  {p.code}
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-200">
                      {p.title}
                    </span>
                    {p.targetTitle && (
                      <span className="text-xs text-slate-400 mt-0.5">
                        منبع متصل: {p.targetTitle}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-slate-300">
                    {p.type === "subscription" ? (
                      <Sparkles className="w-4 h-4 text-teal-400" />
                    ) : p.type === "course" ? (
                      <BookOpen className="w-4 h-4 text-blue-400" />
                    ) : p.type === "content" ? (
                      <FileText className="w-4 h-4 text-cyan-400" />
                    ) : (
                      <FolderTree className="w-4 h-4 text-purple-400" />
                    )}
                    <span>{getResourceTypeLabel(p.type)}</span>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className="font-bold text-teal-400 text-sm">
                    {formatToman(p.price)}
                  </span>
                </td>
                <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">
                  {p.durationDays ? (
                    <span className="flex items-center gap-1 text-slate-300">
                      <Clock className="w-3.5 h-3.5 text-teal-400" />
                      {p.durationDays} روز
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-purple-300">
                      <InfinityIcon className="w-3.5 h-3.5 text-purple-400" />
                      مادام‌العمر (دائمی)
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {p.active ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <CheckCircle2 className="w-3 h-3" />
                      فعال برای خرید
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
                      <XCircle className="w-3 h-3" />
                      غیرفعال
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <button
                    onClick={() => setSelectedProductForEdit(p)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1 text-xs"
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
