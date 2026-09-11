import { useParams, Link, useNavigate } from "react-router-dom";
import { useAdminBlogPostPreview, usePublishBlogPost } from "../../../hooks/useBlog.js";
import { MarkdownRenderer } from "../../../components/markdown/MarkdownRenderer.js";
import {
  ArrowRight,
  Edit3,
  Send,
  Clock,
  Calendar,
  Eye,
  ShieldAlert,
  Loader2,
} from "lucide-react";

export function AdminBlogPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useAdminBlogPostPreview(id);
  const publishMutation = usePublishBlogPost();

  const post = data?.post;

  const handlePublish = () => {
    if (!id) return;
    publishMutation.mutate(id, {
      onSuccess: () => {
        navigate("/admin/blog");
      },
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-[var(--color-text-muted)] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary-default)]" />
        <p className="text-sm font-medium">در حال بارگذاری پیش‌نمایش مقاله...</p>
      </div>
    );
  }

  if (isError || !post) {
    return (
      <div className="p-8 text-center bg-[var(--color-surface)] rounded-2xl border border-red-500/30 max-w-xl mx-auto my-12 shadow-sm">
        <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h2 className="text-lg font-bold text-[var(--color-text)] mb-2">مقاله یافت نشد</h2>
        <p className="text-xs text-[var(--color-text-muted)] mb-6">
          مقاله مورد نظر وجود ندارد یا دسترسی به آن امکان‌پذیر نیست.
        </p>
        <Link
          to="/admin/blog"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text)] border border-[var(--color-border)] rounded-xl text-xs font-semibold transition-colors"
        >
          <ArrowRight className="w-4 h-4" />
          <span>بازگشت به لیست مقالات</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto py-4" dir="rtl">
      {/* Top Admin Banner */}
      <div className="bg-amber-500/10 border border-amber-500/30 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-500 dark:text-amber-400">
            <Eye className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-amber-600 dark:text-amber-300">
              حالت پیش‌نمایش اختصاصی کنسول مدیریت
            </div>
            <div className="text-[11px] text-[var(--color-text-muted)]">
              وضعیت کنونی:{" "}
              <span className="font-bold text-[var(--color-text)]">
                {post.status === "published" ? "منتشر شده" : "پیش‌نویس (مخفی از عموم)"}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/admin/blog/${post.id}/edit`}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] border border-[var(--color-border)] transition-colors"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>ویرایش</span>
          </Link>

          {post.status === "draft" && (
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-bold bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] disabled:opacity-50 transition-colors shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              <span>انتشار عمومی</span>
            </button>
          )}

          <Link
            to="/admin/blog"
            className="p-2 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            title="بازگشت"
          >
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* Article View Card */}
      <article className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden shadow-sm p-6 sm:p-10">
        {/* Category & Date Metadata */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)] mb-4">
          {post.category && (
            <span className="px-3 py-1 rounded-full font-bold bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] border border-[var(--color-primary-default)]/20">
              {post.category.name}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <span>{post.readingTimeMinutes} دقیقه مطالعه</span>
          </span>
          <span className="flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            <span>
              {post.publishedAt
                ? new Date(post.publishedAt).toLocaleDateString("fa-IR")
                : "پیش‌نویس"}
            </span>
          </span>
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-4xl font-extrabold text-[var(--color-text)] leading-tight mb-4">
          {post.title}
        </h1>

        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-sm sm:text-base text-[var(--color-text-muted)] leading-relaxed mb-8 pb-6 border-b border-[var(--color-border)] font-normal">
            {post.excerpt}
          </p>
        )}

        {/* Featured Image */}
        {post.featuredImage && (
          <div className="relative rounded-2xl overflow-hidden aspect-video sm:aspect-21/9 mb-10 border border-[var(--color-border)] shadow-sm">
            <img
              src={post.featuredImage}
              alt={post.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Markdown Content */}
        <div className="prose dark:prose-invert max-w-none text-[var(--color-text)]">
          <MarkdownRenderer content={post.content} />
        </div>

        {/* Tags */}
        {post.tags && post.tags.length > 0 && (
          <div className="mt-10 pt-6 border-t border-[var(--color-border)] flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-[var(--color-text-muted)]">برچسب‌ها:</span>
            {post.tags.map((tag) => (
              <span
                key={tag.id}
                className="px-3 py-1 rounded-lg text-xs font-medium bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
              >
                #{tag.name}
              </span>
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
