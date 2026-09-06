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
    <div className="min-h-screen bg-[#0b1120] text-slate-100 font-sans selection:bg-teal-700/50 selection:text-teal-200" dir="rtl">
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
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-300 border border-teal-500/20 backdrop-blur-md">
            <Sparkles className="w-3.5 h-3.5 text-teal-400" />
            <span>پایگاه دانش و وبلاگ آموزشی آوانا</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
            یادگیری عمیق، علمی و ساختاریافته <span className="text-teal-400">داروسازی</span>
          </h1>

          <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl mx-auto font-normal">
            جدیدترین مقالات تخصصی فارماکولوژی، تکنیک‌های مطالعه فعال، نکات آزمون‌های جامع و متدهای نوین تثبیت حافظه دارویی.
          </p>

          {/* Search Bar */}
          <form
            onSubmit={handleSearchSubmit}
            className="relative max-w-xl mx-auto mt-6"
          >
            <input
              type="text"
              placeholder="جستجو در مقالات، داروها، مباحث فارماکولوژی..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full bg-slate-900/80 border border-white/10 rounded-2xl pl-12 pr-12 py-3.5 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 shadow-2xl backdrop-blur-md transition-all"
            />
            <Search className="w-5 h-5 text-slate-400 absolute right-4 top-4" />
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                className="absolute left-4 top-4 text-xs text-slate-400 hover:text-white"
              >
                پاک کردن
              </button>
            )}
          </form>
        </section>

        {/* Category Navigation Pills */}
        <section className="flex flex-wrap items-center justify-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => handleCategorySelect("")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              selectedCategory === ""
                ? "bg-[#008080] text-white shadow-[0_0_15px_rgba(0,128,128,0.4)]"
                : "glass-panel text-slate-300 hover:text-white hover:bg-white/10"
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
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  isSelected
                    ? "bg-[#008080] text-white shadow-[0_0_15px_rgba(0,128,128,0.4)]"
                    : "glass-panel text-slate-300 hover:text-white hover:bg-white/10"
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
            <div className="absolute -inset-1 bg-gradient-to-r from-teal-500/20 via-cyan-500/10 to-emerald-500/20 rounded-3xl blur-xl opacity-70 pointer-events-none" />
            <div className="relative glass-panel rounded-3xl border border-teal-500/30 overflow-hidden shadow-2xl p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Featured Image */}
              <div className="lg:col-span-6 relative rounded-2xl overflow-hidden aspect-video sm:aspect-16/10 border border-white/10">
                <img
                  src={
                    featuredPost.featuredImage ||
                    "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=1200&q=80"
                  }
                  alt={featuredPost.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-3 right-3">
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-[#008080] text-white shadow-md">
                    مقاله شاخص و برگزیده
                  </span>
                </div>
              </div>

              {/* Featured Text */}
              <div className="lg:col-span-6 space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  {featuredPost.category && (
                    <span className="px-3 py-0.5 rounded-full font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30">
                      {featuredPost.category.name}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{featuredPost.readingTimeMinutes} دقیقه مطالعه</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    <span>{featuredPost.viewCount.toLocaleString("fa-IR")} بازدید</span>
                  </span>
                </div>

                <h2 className="text-xl sm:text-3xl font-extrabold text-white leading-snug hover:text-teal-300 transition-colors">
                  <Link to={`/blog/${featuredPost.slug}`}>
                    {featuredPost.title}
                  </Link>
                </h2>

                <p className="text-xs sm:text-sm text-slate-300 leading-relaxed line-clamp-3">
                  {featuredPost.excerpt}
                </p>

                <div className="pt-2 flex items-center justify-between">
                  <div className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>
                      {featuredPost.publishedAt
                        ? new Date(featuredPost.publishedAt).toLocaleDateString("fa-IR")
                        : "امروز"}
                    </span>
                  </div>

                  <Link
                    to={`/blog/${featuredPost.slug}`}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-[#008080] hover:bg-[#006666] text-white transition-all shadow-md active:scale-95"
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
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-teal-400" />
              <span>
                {selectedCategory
                  ? `مقالات دسته ${categories.find((c) => c.slug === selectedCategory)?.name || ""}`
                  : search
                    ? `نتایج جستجو برای: «${search}»`
                    : "تازه‌ترین مقالات آموزشی"}
              </span>
            </h2>
            <span className="text-xs text-slate-400">
              {totalCount} مقاله منتشر شده
            </span>
          </div>

          {/* Loading Skeleton */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="glass-panel rounded-2xl border border-white/10 p-5 space-y-4 animate-pulse"
                >
                  <div className="aspect-video bg-white/5 rounded-xl" />
                  <div className="h-4 bg-white/10 rounded w-1/3" />
                  <div className="h-6 bg-white/10 rounded w-3/4" />
                  <div className="h-4 bg-white/5 rounded w-full" />
                </div>
              ))}
            </div>
          ) : isError ? (
            /* Error State */
            <div className="text-center py-16 glass-panel rounded-2xl border border-red-500/20 p-8 max-w-lg mx-auto space-y-4">
              <AlertTriangle className="w-12 h-12 text-red-400 mx-auto" />
              <h3 className="text-lg font-bold text-white">خطا در دریافت مقالات</h3>
              <p className="text-xs text-slate-400">
                ارتباط با سرور برقرار نشد. لطفاً اتصال اینترنت خود را بررسی و دوباره تلاش کنید.
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>تلاش مجدد</span>
              </button>
            </div>
          ) : listPosts.length === 0 ? (
            /* Empty State */
            <div className="text-center py-20 glass-panel rounded-2xl border border-white/10 p-8 max-w-lg mx-auto space-y-3">
              <BookOpen className="w-12 h-12 text-slate-500 mx-auto" />
              <h3 className="text-lg font-bold text-white">مقاله‌ای یافت نشد</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
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
                  className="mt-2 text-xs font-bold text-teal-400 hover:underline"
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
                  className="glass-panel group rounded-2xl border border-white/10 overflow-hidden hover:border-teal-500/40 hover:shadow-[0_10px_30px_rgba(0,128,128,0.15)] transition-all duration-300 flex flex-col"
                >
                  {/* Image */}
                  <Link
                    to={`/blog/${post.slug}`}
                    className="relative aspect-video overflow-hidden bg-slate-950 block"
                  >
                    <img
                      src={
                        post.featuredImage ||
                        "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=800&q=80"
                      }
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    {post.category && (
                      <span className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#0b1120]/80 backdrop-blur-md text-teal-300 border border-teal-500/30">
                        {post.category.name}
                      </span>
                    )}
                  </Link>

                  {/* Body */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
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

                      <h3 className="text-base font-bold text-white group-hover:text-teal-300 transition-colors line-clamp-2 leading-snug">
                        <Link to={`/blog/${post.slug}`}>{post.title}</Link>
                      </h3>

                      {post.excerpt && (
                        <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed font-normal">
                          {post.excerpt}
                        </p>
                      )}
                    </div>

                    <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs">
                      <span className="text-slate-400 flex items-center gap-1 text-[11px]">
                        <Eye className="w-3.5 h-3.5 text-slate-400" />
                        <span>{post.viewCount.toLocaleString("fa-IR")} بازدید</span>
                      </span>

                      <Link
                        to={`/blog/${post.slug}`}
                        className="inline-flex items-center gap-1 text-teal-400 hover:text-teal-300 font-bold text-xs"
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
                className="p-2 rounded-xl glass-panel text-slate-300 hover:text-white disabled:opacity-40 transition-colors"
                aria-label="صفحه قبل"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              <span className="text-xs font-semibold text-slate-300 px-4">
                صفحه {page} از {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="p-2 rounded-xl glass-panel text-slate-300 hover:text-white disabled:opacity-40 transition-colors"
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
