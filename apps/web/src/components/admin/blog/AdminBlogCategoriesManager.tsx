import { useState } from "react";
import {
  Plus,
  FolderOpen,
  Edit2,
  Trash2,
  Search,
  Check,
  X,
  FileText,
  AlertTriangle,
} from "lucide-react";
import {
  useAdminBlogCategories,
  useCreateBlogCategory,
  useUpdateBlogCategory,
  useDeleteBlogCategory,
} from "../../../hooks/useBlog.js";
import {
  AdminConfirmModal,
  AdminLoadingState,
  AdminErrorState,
  AdminEmptyState,
} from "../AdminUI.js";
import type { BlogCategory } from "../../../lib/api/blog.js";
import { toPersianDigits } from "@avana/domain";

export function AdminBlogCategoriesManager() {
  const [search, setSearch] = useState("");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingCategory, setEditingCategory] = useState<BlogCategory | null>(null);
  const [deletingCategory, setDeletingCategory] = useState<BlogCategory | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSortOrder, setFormSortOrder] = useState(0);
  const [formError, setFormError] = useState("");

  const { data, isLoading, isError } = useAdminBlogCategories();
  const createMutation = useCreateBlogCategory();
  const updateMutation = useUpdateBlogCategory();
  const deleteMutation = useDeleteBlogCategory();

  const categories = data?.categories || [];
  const filteredCategories = categories.filter((cat) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase().trim();
    return (
      cat.name.toLowerCase().includes(term) ||
      cat.slug.toLowerCase().includes(term) ||
      (cat.description && cat.description.toLowerCase().includes(term))
    );
  });

  const openCreateModal = () => {
    setFormName("");
    setFormSlug("");
    setFormDescription("");
    setFormSortOrder(categories.length);
    setFormError("");
    setEditingCategory(null);
    setModalMode("create");
  };

  const openEditModal = (cat: BlogCategory) => {
    setEditingCategory(cat);
    setFormName(cat.name);
    setFormSlug(cat.slug);
    setFormDescription(cat.description || "");
    setFormSortOrder(cat.sortOrder);
    setFormError("");
    setModalMode("edit");
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingCategory(null);
    setFormError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError("نام دسته‌بندی الزامی است.");
      return;
    }

    if (modalMode === "create") {
      createMutation.mutate(
        {
          name: formName.trim(),
          slug: formSlug.trim() || undefined,
          description: formDescription.trim() || undefined,
          sortOrder: formSortOrder,
        },
        {
          onSuccess: () => closeModal(),
          onError: (err: any) => {
            setFormError(err.message || "خطا در ایجاد دسته‌بندی");
          },
        },
      );
    } else if (modalMode === "edit" && editingCategory) {
      updateMutation.mutate(
        {
          id: editingCategory.id,
          data: {
            name: formName.trim(),
            slug: formSlug.trim() || undefined,
            description: formDescription.trim() || undefined,
            sortOrder: formSortOrder,
          },
        },
        {
          onSuccess: () => closeModal(),
          onError: (err: any) => {
            setFormError(err.message || "خطا در ویرایش دسته‌بندی");
          },
        },
      );
    }
  };

  const handleDeleteConfirm = () => {
    if (!deletingCategory) return;
    deleteMutation.mutate(deletingCategory.id, {
      onSuccess: () => setDeletingCategory(null),
    });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text)] flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-[var(--color-primary-default)]" />
            <span>مدیریت دسته‌بندی‌های وبلاگ</span>
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            ایجاد، ویرایش، تعیین اولویت نمایش و ساماندهی موضوعی مقالات آموزشی
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-xs bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] shadow-xs transition-all active:scale-95 shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>افزودن دسته‌بندی جدید</span>
        </button>
      </div>

      {/* Filter bar */}
      <div className="border border-[var(--color-border)] p-3.5 rounded-2xl bg-[var(--color-surface)] shadow-xs flex items-center justify-between">
        <div className="relative w-full sm:w-80 flex items-center">
          <input
            type="text"
            placeholder="جستجو در نام یا اسلاگ دسته‌بندی..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-10 pe-4 py-2 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)]"
          />
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <div className="text-xs text-[var(--color-text-muted)] font-medium">
          مجموع: {toPersianDigits(filteredCategories.length)} دسته‌بندی
        </div>
      </div>

      {/* Table */}
      <div className="border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-xs bg-[var(--color-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
              <tr>
                <th className="px-5 py-3.5 font-semibold">نام دسته‌بندی</th>
                <th className="px-4 py-3.5 font-semibold">اسلاگ (URL Slug)</th>
                <th className="px-4 py-3.5 font-semibold">توضیحات</th>
                <th className="px-4 py-3.5 font-semibold text-center">ترتیب نمایش</th>
                <th className="px-4 py-3.5 font-semibold text-center">تعداد مقالات</th>
                <th className="px-5 py-3.5 font-semibold text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text)]">
              {isLoading ? (
                <AdminLoadingState colSpan={6} />
              ) : isError ? (
                <AdminErrorState message="خطا در دریافت لیست دسته‌بندی‌ها" colSpan={6} />
              ) : filteredCategories.length === 0 ? (
                <AdminEmptyState message="هیچ دسته‌بندی‌ای با این مشخصات یافت نشد." />
              ) : (
                filteredCategories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-[var(--color-surface-warm)]/60 transition-colors">
                    <td className="px-5 py-4 font-bold text-[var(--color-text)]">
                      <div className="flex items-center gap-2">
                        <FolderOpen className="w-4 h-4 text-[var(--color-primary-default)] shrink-0" />
                        <span>{cat.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-[11px] text-[var(--color-primary-default)]" dir="ltr">
                      /blog/category/{cat.slug}
                    </td>
                    <td className="px-4 py-4 text-[11px] text-[var(--color-text-muted)] max-w-xs truncate">
                      {cat.description || "—"}
                    </td>
                    <td className="px-4 py-4 text-center font-semibold">
                      {toPersianDigits(cat.sortOrder)}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
                        <FileText className="w-3 h-3 text-[var(--color-primary-default)]" />
                        <span>{toPersianDigits(cat.postCount ?? 0)}</span>
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(cat)}
                          title="ویرایش دسته‌بندی"
                          className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingCategory(cat)}
                          title="حذف دسته‌بندی"
                          className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
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

      {/* Create / Edit Modal */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4" dir="rtl">
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
              <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-[var(--color-primary-default)]" />
                <span>{modalMode === "create" ? "افزودن دسته‌بندی جدید" : "ویرایش دسته‌بندی"}</span>
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[var(--color-text)]">
                  نام دسته‌بندی <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => {
                    setFormName(e.target.value);
                    if (modalMode === "create" && !formSlug) {
                      setFormSlug(
                        e.target.value
                          .trim()
                          .toLowerCase()
                          .replace(/[\s_]+/g, "-")
                          .replace(/[^\w\u0600-\u06FF-]+/g, ""),
                      );
                    }
                  }}
                  placeholder="مثلاً: فارماکولوژی بالینی"
                  className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)]"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[var(--color-text)]">
                  اسلاگ یکتا (URL Slug)
                </label>
                <input
                  type="text"
                  value={formSlug}
                  onChange={(e) => setFormSlug(e.target.value)}
                  placeholder="pharmacology"
                  dir="ltr"
                  className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-xs font-mono text-[var(--color-primary-default)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[var(--color-text)]">
                  توضیحات کوتاه
                </label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="توضیحاتی درباره این دسته‌بندی جهت نمایش در هدر آرشیو و سئو..."
                  className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl p-3 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)] resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-[var(--color-text)]">
                  اولویت ترتیب نمایش (Sort Order)
                </label>
                <input
                  type="number"
                  value={formSortOrder}
                  onChange={(e) => setFormSortOrder(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--color-text)] focus:outline-none focus:border-[var(--color-primary-default)]"
                />
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  اعداد کمتر در ابتدای لیست تب‌ها نمایش داده می‌شوند.
                </p>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-[var(--color-text-muted)] hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{modalMode === "create" ? "ایجاد دسته‌بندی" : "ذخیره تغییرات"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal with Article Impact Warning */}
      <AdminConfirmModal
        isOpen={Boolean(deletingCategory)}
        title="حذف دسته‌بندی"
        description={
          deletingCategory && (deletingCategory.postCount ?? 0) > 0
            ? `این دسته‌بندی شامل ${toPersianDigits(deletingCategory.postCount!)} مقاله است. با حذف آن، مقالات مربوطه بدون دسته‌بندی خواهند شد.`
            : `آیا از حذف دسته‌بندی «${deletingCategory?.name}» اطمینان دارید؟`
        }
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingCategory(null)}
        isProcessing={deleteMutation.isPending}
      />
    </div>
  );
}
