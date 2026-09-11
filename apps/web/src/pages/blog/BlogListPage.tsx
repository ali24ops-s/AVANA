import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  BookOpen,
  Clock,
  Calendar,
  Eye,
  ArrowLeft,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import {
  usePublicBlogPosts,
  useBlogCategories,
} from "../../hooks/useBlog.js";
import { BlogSEO } from "../../components/blog/BlogSEO.js";
import { AboutNavbar } from "../../components/about/AboutNavbar.js";
import { Footer } from "../../components/landing/Footer.js";
import { formatPersianOf } from "@avana/domain";
import { Input } from "@avana/ui";
import type { BlogPostSummary } from "../../lib/api/blog.js";

export function BlogListPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const pageSize = 9;

  const {
    data: postsData,
    isLoading,
    isError,
    refetch,
  } = usePublicBlogPosts({
    page,
    pageSize,
    search: search.trim() || undefined,
    category: selectedCategory || undefined,
    sortBy: "publishedAt",
    sortOrder: "desc",
  });

  const { data: categoriesData } = useBlogCategories();
  const categories = categoriesData?.categories || [];
  const posts = postsData?.posts || [];
  const totalCount = postsData?.totalCount || 0;
  const totalPages = postsData?.totalPages || 1;

  // Select featured post: the first post on page 1 without search filter
  const featuredPost: BlogPostSummary | null =
    !search && !selectedCategory && page === 1 && posts.length > 0
      ? posts[0]
      : null;

  // Remaining posts list
  const listPosts = featuredPost ? posts.slice(1) : posts;

  const handleCategorySelect = (slug: string) => {
    setSelectedCategory(slug === selectedCategory ? "" : slug);
    setPage(1);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] font-body selection:bg-[#008080]/20 selection:text-[#008080]" dir="rtl">
      {/* SEO Metadata */}
      <BlogSEO
        title="وبلاگ آموزشی و مقالات تخصصی داروسازی"
        description="مقالات علمی، راهنمای مطالعه فارماکولوژی، تکنیک‌های یادگیری فعال، فلش‌کارت‌های لایتنر و نکات کلیدی آزمون‌های جامع داروسازی در وبلاگ آوانا."
        type="website"
      />

      {/* Navigation */}
      <AboutNavbar />

      <main className="pt-28 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-12">
        {/* Hero Section */}
        <section className="relative text-center max-w-3xl mx-auto space-y-4 pt-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-[#008080]/10 text-[#008080] border border-[#008080]/20 backdrop-blur-md shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-[#008080]" />
            <span>پایگاه دانش و وبلاگ آموزشی آوانا</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-[var(--color-text)] tracking-tight leading-tight">
            یادگیری عمیق، علمی و ساختاریافته <span className="text-[#008080]">داروسازی</span>
          </h1>

          <p className="text-sm sm:text-base text-[var(--color-text-muted)] leading-relaxed max-w-2xl mx-auto font-normal">
            جدیدترین مقالات تخصصی فارماکولوژی، تکنیک‌های مطالعه فعال، نکات آزمون‌های جامع و متدهای نوین تثبیت حافظه دارویی.
          </p>

          {/* Search Bar */}
          <form
            onSubmit={handleSearchSubmit}
            className="max-w-xl mx-auto mt-6"
          >
            <Input
              type="text"
              placeholder="جستجو در مقالات، داروها، مباحث فارماکولوژی..."
              aria-label="جستجو در مقالات، داروها، مباحث فارماکولوژی"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              startIcon={<Search className="w-5 h-5" />}
              endIcon={
                search ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setPage(1);
                    }}
                    className="p-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
                  >
                    پاک کردن
                  </button>
                ) : undefined
              }
            />
          </form>
        </section>

        {/* Category Navigation Pills */}
        <section className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => handleCategorySelect("")}
            className={`px-4 py-2 rounded-[8px] text-xs font-bold transition-all ${
              selectedCategory === ""
                ? "bg-[#008080] text-white shadow-xs"
                : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] shadow-xs"
            }`}
          >
            همه مقالات ({totalCount})
          </button>
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat.slug;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleCategorySelect(cat.slug)}
                className={`px-4 py-2 rounded-[8px] text-xs font-bold transition-all ${
                  isSelected
                    ? "bg-[#008080] text-white shadow-xs"
                    : "bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] shadow-xs"
                }`}
              >
                {cat.name}
                {cat.postCount !== undefined && cat.postCount > 0 && (
                  <span className="mr-1.5 opacity-70">({cat.postCount})</span>
                )}
              </button>
            );
          })}
        </section>

        {/* Featured Article Card */}
        {featuredPost && (
          <section className="relative">
            <div className="relative rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] overflow-hidden shadow-sm p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Featured Image */}
              <div className="lg:col-span-6 relative rounded-[12px] overflow-hidden aspect-video sm:aspect-16/10 border border-[var(--color-border)]">
                <img
                  src={
                    featuredPost.featuredImage ||
                    /* eslint-disable-next-line no-secrets/no-secrets */
                    "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=1200&q=80"
                  }
                  alt={featuredPost.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-3 right-3">
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-[#008080] text-white shadow-xs">
                    مقاله شاخص و برگزیده
                  </span>
                </div>
              </div>

              {/* Featured Text */}
              <div className="lg:col-span-6 space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--color-text-muted)]">
                  {featuredPost.category && (
                    <span className="px-3 py-0.5 rounded-full font-bold bg-[#008080]/10 text-[#008080] border border-[#008080]/20">
                      {featuredPost.category.name}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                    <span>{featuredPost.readingTimeMinutes} دقیقه مطالعه</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                    <span>{featuredPost.viewCount.toLocaleString("fa-IR")} بازدید</span>
                  </span>
                </div>

                <h2 className="text-xl sm:text-3xl font-extrabold text-[var(--color-text)] leading-snug hover:text-[#008080] transition-colors">
                  <Link to={`/blog/${featuredPost.slug}`}>
                    {featuredPost.title}
                  </Link>
                </h2>

                <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed line-clamp-3">
                  {featuredPost.excerpt}
                </p>

                <div className="pt-2 flex items-center justify-between">
                  <div className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      {featuredPost.publishedAt
                        ? new Date(featuredPost.publishedAt).toLocaleDateString("fa-IR")
                        : "امروز"}
                    </span>
                  </div>

                  <Link
                    to={`/blog/${featuredPost.slug}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] text-xs font-bold bg-[#008080] hover:bg-[#006666] active:bg-[#005050] text-white transition-all shadow-xs active:scale-95"
                  >
                    <span>مطالعه مقاله کامل</span>
                    <ArrowLeft className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Latest Articles Grid Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-4">
            <h2 className="text-xl font-bold text-[var(--color-text)] flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#008080]" />
              <span>
                {selectedCategory
                  ? `مقالات دسته ${categories.find((c) => c.slug === selectedCategory)?.name || ""}`
                  : search
                    ? `نتایج جستجو برای: «${search}»`
                    : "تازه‌ترین مقالات آموزشی"}
              </span>
            </h2>
            <span className="text-xs text-[var(--color-text-muted)]">
              {totalCount} مقاله منتشر شده
            </span>
          </div>

          {/* Loading Skeleton */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 space-y-4 animate-pulse shadow-xs"
                >
                  <div className="aspect-video bg-slate-100 rounded-xl" />
                  <div className="h-4 bg-slate-100 rounded w-1/3" />
                  <div className="h-6 bg-slate-200 rounded w-3/4" />
                  <div className="h-4 bg-slate-100 rounded w-full" />
                </div>
              ))}
            </div>
          ) : isError ? (
            /* Error State */
            <div className="text-center py-16 rounded-2xl border border-red-200 bg-[var(--color-surface)] p-8 max-w-lg mx-auto space-y-4 shadow-xs">
              <AlertTriangle className="w-12 h-12 text-red-500 mx-auto" />
              <h3 className="text-lg font-bold text-[var(--color-text)]">خطا در دریافت مقالات</h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                ارتباط با سرور برقرار نشد. لطفاً اتصال اینترنت خود را بررسی و دوباره تلاش کنید.
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-[var(--color-text)] rounded-xl text-xs font-semibold transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>تلاش مجدد</span>
              </button>
            </div>
          ) : listPosts.length === 0 ? (
            /* Empty State */
            <div className="text-center py-20 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 max-w-lg mx-auto space-y-3 shadow-xs">
              <BookOpen className="w-12 h-12 text-slate-400 mx-auto" />
              <h3 className="text-lg font-bold text-[var(--color-text)]">مقاله‌ای یافت نشد</h3>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                هنوز مقاله‌ای مطابق با فیلتر یا عبارت جستجوی شما منتشر نشده است.
              </p>
              {(search || selectedCategory) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSelectedCategory("");
                    setPage(1);
                  }}
                  className="mt-2 text-xs font-bold text-[#008080] hover:underline"
                >
                  مشاهده همه مقالات
                </button>
              )}
            </div>
          ) : (
            /* Cards Grid */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {listPosts.map((post) => (
                <article
                  key={post.id}
                  className="rounded-[16px] bg-[var(--color-surface)] group border border-[var(--color-border)] overflow-hidden hover:border-[#008080]/40 hover:shadow-md transition-all duration-300 flex flex-col"
                >
                  {/* Image */}
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
                    {post.category && (
                      <span className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/90 backdrop-blur-md text-[#008080] border border-[var(--color-border)] shadow-xs">
                        {post.category.name}
                      </span>
                    )}
                  </Link>

                  {/* Body */}
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
                className="p-2 rounded-[8px] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40 transition-colors shadow-xs"
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
                className="p-2 rounded-[8px] bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-40 transition-colors shadow-xs"
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
