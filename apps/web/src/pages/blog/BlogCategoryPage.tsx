import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  BookOpen,
  Calendar,
  Clock,
  Eye,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  FolderOpen,
} from "lucide-react";
import { useCategoryWithPosts } from "../../hooks/useBlog.js";
import { BlogSEO } from "../../components/blog/BlogSEO.js";
import { AboutNavbar } from "../../components/about/AboutNavbar.js";
import { Footer } from "../../components/landing/Footer.js";
import { formatPersianOf } from "@avana/domain";

export function BlogCategoryPage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const { data, isLoading, isError } = useCategoryWithPosts(slug, {
    page,
    pageSize,
  });

  const category = data?.category;
  const posts = data?.posts || [];
  const totalCount = data?.totalCount || 0;
  const totalPages = data?.totalPages || 1;

  return (
    <div className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] font-sans selection:bg-[#008080]/20 selection:text-[#008080]" dir="rtl">
      {/* SEO Metadata */}
      {category && (
        <BlogSEO
          title={`مقالات دسته ${category.name}`}
          description={category.description || `مجموعه مقالات تخصصی و آموزشی ${category.name} در پلتفرم آوانا.`}
          type="website"
        />
      )}

      {/* Navigation */}
      <AboutNavbar />

      <main className="pt-28 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-10">
        {/* Breadcrumb Navigation */}
        <nav aria-label="مسیر راهنما" className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] flex-wrap">
          <Link to="/" className="hover:text-[#008080] transition-colors">
            صفحه اصلی
          </Link>
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
          <Link to="/blog" className="hover:text-[#008080] transition-colors">
            وبلاگ آموزشی
          </Link>
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[var(--color-text)] font-semibold">
            {category?.name || "دسته‌بندی"}
          </span>
        </nav>

        {/* Category Header Hero */}
        <header className="rounded-[20px] bg-[var(--color-surface)] border border-[var(--color-border)] p-8 sm:p-12 shadow-xs relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#008080]/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-[8px] text-xs font-bold bg-[#008080]/10 text-[#008080] border border-[#008080]/20">
              <FolderOpen className="w-3.5 h-3.5" />
              <span>دسته‌بندی مقالات</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-black text-[var(--color-text)]">
              {category?.name || "در حال بارگذاری..."}
            </h1>

            {category?.description && (
              <p className="text-sm sm:text-base text-[var(--color-text-muted)] leading-relaxed font-normal">
                {category.description}
              </p>
            )}

            <div className="pt-2 text-xs text-[#008080] font-semibold">
              {totalCount} مقاله منتشر شده در این دسته‌بندی
            </div>
          </div>
        </header>

        {/* Articles List */}
        <section className="space-y-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] p-5 space-y-4 animate-pulse shadow-xs"
                >
                  <div className="aspect-video bg-slate-100 rounded-[10px]" />
                  <div className="h-4 bg-slate-100 rounded-[6px] w-1/3" />
                  <div className="h-6 bg-slate-200 rounded-[6px] w-3/4" />
                </div>
              ))}
            </div>
          ) : isError || !category ? (
            <div className="text-center py-16 rounded-[16px] bg-[var(--color-surface)] border border-red-200 p-8 max-w-lg mx-auto space-y-4 shadow-xs">
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
              <h3 className="text-lg font-bold text-[var(--color-text)]">دسته‌بندی یافت نشد</h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                این دسته‌بندی وجود ندارد یا هنوز مقاله‌ای در آن ثبت نشده است.
              </p>
              <Link
                to="/blog"
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[var(--color-text)] border border-[var(--color-border)] rounded-[10px] text-xs font-semibold transition-colors"
              >
                <ArrowRight className="w-4 h-4" />
                <span>بازگشت به همه مقالات</span>
              </Link>
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-20 rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] p-8 max-w-lg mx-auto space-y-3 shadow-xs">
              <BookOpen className="w-12 h-12 text-slate-400 mx-auto" />
              <h3 className="text-lg font-bold text-[var(--color-text)]">هنوز مقاله‌ای در این دسته منتشر نشده است</h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                به‌زودی مقالات جدیدی در موضوع {category.name} اضافه خواهد شد.
              </p>
              <Link to="/blog" className="text-xs font-bold text-[#008080] hover:underline block pt-2">
                مشاهده سایر مقالات وبلاگ
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {posts.map((post) => (
                <article
                  key={post.id}
                  className="group rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden hover:border-[#008080]/40 hover:shadow-md transition-all duration-300 flex flex-col"
                >
                  <Link
                    to={`/blog/${post.slug}`}
                    className="relative aspect-video overflow-hidden bg-slate-100 block"
                  >
                    <img
                      src={
                        post.featuredImage ||
                        /* eslint-disable-next-line no-secrets/no-secrets */
                        "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=80"
                      }
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </Link>

                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-[var(--color-text-muted)]">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {post.publishedAt
                              ? new Date(post.publishedAt).toLocaleDateString("fa-IR")
                              : "امروز"}
                          </span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{post.readingTimeMinutes} دقیقه مطالعه</span>
                        </span>
                      </div>

                      <h3 className="text-base font-bold text-[var(--color-text)] group-hover:text-[#008080] transition-colors line-clamp-2 leading-snug">
                        <Link to={`/blog/${post.slug}`}>{post.title}</Link>
                      </h3>

                      {post.excerpt && (
                        <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 leading-relaxed font-normal">
                          {post.excerpt}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-xs">
                      <span className="text-[var(--color-text-muted)] flex items-center gap-1 text-[11px]">
                        <Eye className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                        <span>{post.viewCount.toLocaleString("fa-IR")} بازدید</span>
                      </span>

                      <Link
                        to={`/blog/${post.slug}`}
                        className="inline-flex items-center gap-1 text-[#008080] hover:text-[#006666] font-bold text-xs"
                      >
                        <span>ادامه مطلب</span>
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-8">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-[8px] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30 transition-colors shadow-xs"
                aria-label="صفحه قبل"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              <span className="text-xs font-semibold text-[var(--color-text-muted)] px-4">
                {formatPersianOf(page, totalPages, { prefix: "صفحه" })}
              </span>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-[8px] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-30 transition-colors shadow-xs"
                aria-label="صفحه بعد"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            </div>
          )}
        </section>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
