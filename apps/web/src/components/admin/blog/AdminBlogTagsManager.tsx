import { useState } from "react";
import {
  Plus,
  Tag as TagIcon,
  Edit2,
  Trash2,
  Search,
  Check,
  X,
  FileText,
  AlertTriangle,
  Calendar,
} from "lucide-react";
import {
  useAdminBlogTags,
  useCreateBlogTag,
  useUpdateBlogTag,
  useDeleteBlogTag,
} from "../../../hooks/useBlog.js";
import {
  AdminConfirmModal,
  AdminLoadingState,
  AdminErrorState,
  AdminEmptyState,
} from "../AdminUI.js";
import type { BlogTag } from "../../../lib/api/blog.js";
import { toPersianDigits } from "@avana/domain";

export function AdminBlogTagsManager() {
  const [search, setSearch] = useState("");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editingTag, setEditingTag] = useState<BlogTag | null>(null);
  const [deletingTag, setDeletingTag] = useState<BlogTag | null>(null);

  // Form states
  const [formName, setFormName] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formError, setFormError] = useState("");

  const { data, isLoading, isError } = useAdminBlogTags({ search: search.trim() || undefined });
  const createMutation = useCreateBlogTag();
  const updateMutation = useUpdateBlogTag();
  const deleteMutation = useDeleteBlogTag();

  const tags = data?.tags || [];

  const openCreateModal = () => {
    setFormName("");
    setFormSlug("");
    setFormError("");
    setEditingTag(null);
    setModalMode("create");
  };

  const openEditModal = (tag: BlogTag) => {
    setEditingTag(tag);
    setFormName(tag.name);
    setFormSlug(tag.slug);
    setFormError("");
    setModalMode("edit");
  };

  const closeModal = () => {
    setModalMode(null);
    setEditingTag(null);
    setFormError("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError("نام برچسب الزامی است.");
      return;
    }

    if (modalMode === "create") {
      createMutation.mutate(
        {
          name: formName.trim(),
          slug: formSlug.trim() || undefined,
        },
        {
          onSuccess: () => closeModal(),
          onError: (err: any) => {
            setFormError(err.message || "خطا در ایجاد برچسب");
          },
        },
      );
    } else if (modalMode === "edit" && editingTag) {
      updateMutation.mutate(
        {
          id: editingTag.id,
          data: {
            name: formName.trim(),
            slug: formSlug.trim() || undefined,
          },
        },
        {
          onSuccess: () => closeModal(),
          onError: (err: any) => {
            setFormError(err.message || "خطا در ویرایش برچسب");
          },
        },
      );
    }
  };

  const handleDeleteConfirm = () => {
    if (!deletingTag) return;
    deleteMutation.mutate(deletingTag.id, {
      onSuccess: () => setDeletingTag(null),
    });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text)] flex items-center gap-2">
            <TagIcon className="w-5 h-5 text-[var(--color-primary-default)]" />
            <span>مدیریت برچسب‌های وبلاگ (Tags)</span>
          </h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            برچسب‌گذاری کلیدواژه‌ای مقالات، لینک‌دهی داخلی و کشف موضوعی محتوا
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl font-bold text-xs bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] shadow-xs transition-all active:scale-95 shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>افزودن برچسب جدید</span>
        </button>
      </div>

      {/* Filter bar */}
      <div className="border border-[var(--color-border)] p-3.5 rounded-2xl bg-[var(--color-surface)] shadow-xs flex items-center justify-between">
        <div className="relative w-full sm:w-80 flex items-center">
          <input
            type="text"
            placeholder="جستجو در نام یا اسلاگ برچسب..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl ps-10 pe-4 py-2 text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)]"
          />
          <Search className="w-4 h-4 text-[var(--color-text-muted)] absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <div className="text-xs text-[var(--color-text-muted)] font-medium">
          مجموع: {toPersianDigits(tags.length)} برچسب
        </div>
      </div>

      {/* Table */}
      <div className="border border-[var(--color-border)] rounded-2xl overflow-hidden shadow-xs bg-[var(--color-surface)]">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
              <tr>
                <th className="px-5 py-3.5 font-semibold">نام برچسب</th>
                <th className="px-4 py-3.5 font-semibold">اسلاگ (URL Slug)</th>
                <th className="px-4 py-3.5 font-semibold text-center">تعداد مقالات مرتبط</th>
                <th className="px-4 py-3.5 font-semibold">تاریخ ایجاد</th>
                <th className="px-5 py-3.5 font-semibold text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)] text-[var(--color-text)]">
              {isLoading ? (
                <AdminLoadingState colSpan={5} />
              ) : isError ? (
                <AdminErrorState message="خطا در دریافت لیست برچسب‌ها" colSpan={5} />
              ) : tags.length === 0 ? (
                <AdminEmptyState message="هیچ برچسبی با این مشخصات یافت نشد." />
              ) : (
                tags.map((tag) => (
                  <tr key={tag.id} className="hover:bg-[var(--color-surface-warm)]/60 transition-colors">
                    <td className="px-5 py-4 font-bold text-[var(--color-text)]">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[var(--color-primary-default)]" />
                        <span>#{tag.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4 font-mono text-[11px] text-[var(--color-primary-default)]" dir="ltr">
                      /blog/tag/{tag.slug}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--color-surface-warm)] border border-[var(--color-border)]">
                        <FileText className="w-3 h-3 text-[var(--color-primary-default)]" />
                        <span>{toPersianDigits(tag.postCount ?? 0)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-4 text-[11px] text-[var(--color-text-muted)]">
                      {tag.createdAt ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{new Date(tag.createdAt).toLocaleDateString("fa-IR")}</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-5 py-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(tag)}
                          title="ویرایش برچسب"
                          className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => setDeletingTag(tag)}
                          title="حذف برچسب"
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
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl w-full max-w-md shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
              <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                <TagIcon className="w-5 h-5 text-[var(--color-primary-default)]" />
                <span>{modalMode === "create" ? "افزودن برچسب جدید" : "ویرایش برچسب"}</span>
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
                  نام برچسب <span className="text-rose-500">*</span>
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
                  placeholder="مثلاً: فارماکوکینتیک"
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
                  placeholder="pharmacokinetics"
                  dir="ltr"
                  className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl px-3.5 py-2.5 text-xs font-mono text-[var(--color-primary-default)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)]"
                />
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
                  <span>{modalMode === "create" ? "ایجاد برچسب" : "ذخیره تغییرات"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <AdminConfirmModal
        isOpen={Boolean(deletingTag)}
        title="حذف برچسب"
        description={`آیا از حذف برچسب «#${deletingTag?.name}» اطمینان دارید؟ با حذف این برچسب، ارتباط آن با مقالات پاک می‌شود اما هیچ مقاله‌ای حذف نخواهد شد.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingTag(null)}
        isProcessing={deleteMutation.isPending}
      />
    </div>
  );
}
