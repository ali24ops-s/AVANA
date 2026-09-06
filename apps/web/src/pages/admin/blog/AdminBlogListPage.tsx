import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  BookOpen,
  Eye,
  Edit2,
  Trash2,
  Send,
  RotateCcw,
  FileText,
  Clock,
  Search,
  CheckCircle2,
  TrendingUp,
} from "lucide-react";
import {
  useAdminBlogStats,
  useAdminBlogPosts,
  useAdminBlogCategories,
  usePublishBlogPost,
  useUnpublishBlogPost,
  useDeleteBlogPost,
} from "../../../hooks/useBlog.js";
import {
  AdminConfirmModal,
  AdminPagination,
  AdminStatusBadge,
  AdminLoadingState,
  AdminErrorState,
  AdminEmptyState,
} from "../../../components/admin/AdminUI.js";
import type { BlogPostSummary } from "../../../lib/api/blog.js";

export function AdminBlogListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "published" | "draft">("all");
  const [categoryFilter, setCategoryFilter] = useState("");
  const pageSize = 15;

  // Selected article for delete confirmation modal
  const [deletingPost, setDeletingPost] = useState<BlogPostSummary | null>(null);

  // Queries & Mutations
  const { data: statsData } = useAdminBlogStats();
  const { data: categoriesData } = useAdminBlogCategories();
  const {
    data: postsData,
    isLoading,
    isError,
  } = useAdminBlogPosts({
    page,
    pageSize,
    search: search.trim() || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    categoryId: categoryFilter || undefined,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const publishMutation = usePublishBlogPost();
  const unpublishMutation = useUnpublishBlogPost();
  const deleteMutation = useDeleteBlogPost();

  const stats = statsData?.stats;
  const categories = categoriesData?.categories || [];
  const posts = postsData?.posts || [];
  const totalCount = postsData?.totalCount || 0;
  const totalPages = postsData?.totalPages || 1;

  const handleDeleteConfirm = () => {
    if (!deletingPost) return;
    deleteMutation.mutate(deletingPost.id, {
      onSuccess: () => setDeletingPost(null),
    });
  };

  const handleTogglePublish = (post: BlogPostSummary) => {
    if (post.status === "published") {
      unpublishMutation.mutate(post.id);
    } else {
      publishMutation.mutate(post.id);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100 flex items-center gap-2.5">
            <BookOpen className="w-6 h-6 text-teal-400" />
            <span>مدیریت مقالات و وبلاگ آموزشی</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            ایجاد، ویرایش، انتشار و مانیتورینگ مقالات تخصصی داروسازی در پلتفرم آوانا
          </p>
        </div>

        <Link
          to="/admin/blog/new"
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm bg-[#008080] hover:bg-[#006666] text-white shadow-lg transition-all active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>افزودن مقاله جدید</span>
        </Link>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-2xl border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400">کل مقالات</p>
            <p className="text-2xl font-black text-white mt-1">
              {stats ? stats.totalPosts : "..."}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
            <FileText className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400">مقالات منتشر شده</p>
            <p className="text-2xl font-black text-green-400 mt-1">
              {stats ? stats.publishedPosts : "..."}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400">پیش‌نویس‌ها (Draft)</p>
            <p className="text-2xl font-black text-amber-400 mt-1">
              {stats ? stats.draftPosts : "..."}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-white/10 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-400">مجموع بازدیدها</p>
            <p className="text-2xl font-black text-cyan-400 mt-1">
              {stats ? stats.totalViews.toLocaleString("fa-IR") : "..."}
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="glass-panel p-4 rounded-2xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="جستجو در عنوان یا اسلاگ..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full bg-slate-900/80 border border-slate-700 rounded-xl pl-4 pr-10 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "all" | "published" | "draft");
              setPage(1);
            }}
            aria-label="فیلتر وضعیت انتشار"
            className="bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
          >
            <option value="all">همه وضعیت‌ها</option>
            <option value="published">منتشر شده</option>
            <option value="draft">پیش‌نویس</option>
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value);
              setPage(1);
            }}
            aria-label="فیلتر دسته‌بندی موضوعی"
            className="bg-slate-900/80 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-teal-500"
          >
            <option value="">همه دسته‌بندی‌ها</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table */}
      <div className="glass-panel border border-white/10 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-800/60 text-slate-400 border-b border-white/5">
              <tr>
                <th className="px-5 py-3.5 font-semibold">عنوان و مشخصات مقاله</th>
                <th className="px-4 py-3.5 font-semibold">دسته‌بندی</th>
                <th className="px-4 py-3.5 font-semibold">وضعیت</th>
                <th className="px-4 py-3.5 font-semibold">بازدید / زمان مطالعه</th>
                <th className="px-4 py-3.5 font-semibold">تاریخ انتشار</th>
                <th className="px-5 py-3.5 font-semibold text-center">عملیات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              {isLoading ? (
                <AdminLoadingState colSpan={6} />
              ) : isError ? (
                <AdminErrorState message="خطا در دریافت لیست مقالات" colSpan={6} />
              ) : posts.length === 0 ? (
                <AdminEmptyState message="هیچ مقاله‌ای با این مشخصات یافت نشد." />
              ) : (
                posts.map((post) => {
                  const isMutating =
                    publishMutation.isPending ||
                    unpublishMutation.isPending ||
                    deleteMutation.isPending;

                  return (
                    <tr key={post.id} className="hover:bg-white/5 transition-colors">
                      {/* Title & Slug */}
                      <td className="px-5 py-4 max-w-sm">
                        <div className="font-bold text-slate-100 line-clamp-1">
                          {post.title}
                        </div>
                        <div className="text-[11px] text-teal-400 font-mono mt-0.5 line-clamp-1">
                          /blog/{post.slug}
                        </div>
                        {post.excerpt && (
                          <div className="text-[11px] text-slate-400 line-clamp-1 mt-1">
                            {post.excerpt}
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        {post.category ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-medium bg-teal-500/10 text-teal-300 border border-teal-500/20">
                            {post.category.name}
                          </span>
                        ) : (
                          <span className="text-slate-500">بدون دسته</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <AdminStatusBadge
                          status={post.status}
                          colorMap={{
                            published: "bg-green-500/15 text-green-300 border border-green-500/30",
                            draft: "bg-slate-500/15 text-slate-300 border border-slate-500/30",
                          }}
                        />
                      </td>

                      {/* Views & Reading time */}
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Eye className="w-3.5 h-3.5 text-cyan-400" />
                          <span>{post.viewCount.toLocaleString("fa-IR")} بازدید</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{post.readingTimeMinutes} دقیقه مطالعه</span>
                        </div>
                      </td>

                      {/* Dates */}
                      <td className="px-4 py-4 whitespace-nowrap text-[11px] text-slate-400">
                        {post.publishedAt ? (
                          <div>{new Date(post.publishedAt).toLocaleDateString("fa-IR")}</div>
                        ) : (
                          <span className="text-slate-500">هنوز منتشر نشده</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4 whitespace-nowrap text-center">
                        <div className="flex items-center justify-center gap-2">
                          {/* Preview Action */}
                          <Link
                            to={`/admin/blog/${post.id}/preview`}
                            title="پیش‌نمایش مقاله"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-300 hover:bg-teal-500/10 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </Link>

                          {/* Edit Action */}
                          <Link
                            to={`/admin/blog/${post.id}/edit`}
                            title="ویرایش مقاله"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </Link>

                          {/* Publish/Unpublish toggle */}
                          <button
                            type="button"
                            onClick={() => handleTogglePublish(post)}
                            disabled={isMutating}
                            title={
                              post.status === "published"
                                ? "تغییر وضعیت به پیش‌نویس"
                                : "انتشار در وبلاگ"
                            }
                            className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                              post.status === "published"
                                ? "text-amber-400 hover:bg-amber-500/10"
                                : "text-green-400 hover:bg-green-500/10"
                            }`}
                          >
                            {post.status === "published" ? (
                              <RotateCcw className="w-4 h-4" />
                            ) : (
                              <Send className="w-4 h-4" />
                            )}
                          </button>

                          {/* Delete Action */}
                          <button
                            type="button"
                            onClick={() => setDeletingPost(post)}
                            disabled={isMutating}
                            title="حذف مقاله"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <AdminPagination
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            onPageChange={setPage}
          />
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AdminConfirmModal
        isOpen={Boolean(deletingPost)}
        title="حذف مقاله"
        description={`آیا از حذف دائمی مقاله «${deletingPost?.title}» اطمینان دارید؟ این عملیات قابل بازگشت نخواهد بود.`}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingPost(null)}
        isProcessing={deleteMutation.isPending}
      />
    </div>
  );
}
