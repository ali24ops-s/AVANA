import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import {
  Clock,
  Calendar,
  Eye,
  BookOpen,
  Share2,
  Check,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ChevronLeft,
  List,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { usePublicBlogPost } from "../../hooks/useBlog.js";
import { MarkdownRenderer } from "../../components/markdown/MarkdownRenderer.js";
import { BlogSEO } from "../../components/blog/BlogSEO.js";
import { AboutNavbar } from "../../components/about/AboutNavbar.js";
import { Footer } from "../../components/landing/Footer.js";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

export function BlogDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, isError } = usePublicBlogPost(slug);
  const post = data?.post;

  // Extract Table of Contents from Markdown headings
  const toc: TocItem[] = useMemo(() => {
    if (!post?.content) return [];
    const lines = post.content.split("\n");
    const items: TocItem[] = [];

    for (const line of lines) {
      const h2Match = line.match(/^##\s+(.+)$/);
      const h3Match = line.match(/^###\s+(.+)$/);

      if (h2Match) {
        const text = h2Match[1].replace(/[*_`]/g, "").trim();
        const id = text
          .toLowerCase()
          .replace(/[\s_]+/g, "-")
          .replace(/[^\w\u0600-\u06FF-]+/g, "");
        items.push({ id, text, level: 2 });
      } else if (h3Match) {
        const text = h3Match[1].replace(/[*_`]/g, "").trim();
        const id = text
          .toLowerCase()
          .replace(/[\s_]+/g, "-")
          .replace(/[^\w\u0600-\u06FF-]+/g, "");
        items.push({ id, text, level: 3 });
      }
    }

    return items;
  }, [post?.content]);

  const handleCopyLink = () => {
    if (typeof window !== "undefined") {
      void navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleScrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const currentUrl = typeof window !== "undefined" ? window.location.href : "";

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] flex flex-col font-body" dir="rtl">
        <AboutNavbar />
        <div className="flex-1 flex flex-col items-center justify-center pt-24 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-[#008080]" />
          <p className="text-sm font-medium text-[var(--color-text-muted)]">در حال بارگذاری مقاله...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (isError || !post) {
    return (
      <div className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] flex flex-col font-body" dir="rtl">
        <AboutNavbar />
        <main className="flex-1 max-w-xl mx-auto pt-36 pb-20 px-4 text-center space-y-4">
          <div className="p-8 rounded-[16px] bg-[var(--color-surface)] border border-red-200 shadow-xs space-y-4">
            <AlertTriangle className="w-14 h-14 text-red-500 mx-auto" />
            <h1 className="text-xl font-bold text-[var(--color-text)]">مقاله مورد نظر یافت نشد</h1>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              این مقاله وجود ندارد یا ممکن است هنوز در وضعیت پیش‌نویس باشد و منتشر نشده باشد.
            </p>
            <div className="pt-2">
              <Link
                to="/blog"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#008080] hover:bg-[#006666] active:bg-[#005050] text-white rounded-[10px] text-xs font-bold transition-all shadow-xs"
              >
                <ArrowRight className="w-4 h-4" />
                <span>بازگشت به وبلاگ آوانا</span>
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const publishedDateFormatted = post.publishedAt
    ? new Date(post.publishedAt).toLocaleDateString("fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "امروز";

  return (
    <div className="min-h-screen bg-[var(--color-bg-default)] text-[var(--color-text)] font-body selection:bg-[#008080]/20 selection:text-[#008080]" dir="rtl">
      {/* Dynamic SEO metadata & JSON-LD Structured Data */}
      <BlogSEO
        title={post.seoTitle || post.title}
        description={post.seoDescription || post.excerpt}
        canonicalUrl={post.canonicalUrl}
        image={post.featuredImage}
        publishedAt={post.publishedAt}
        updatedAt={post.updatedAt}
        authorName={post.author?.name || "تیم علمی داروسازی آوانا"}
        categoryName={post.category?.name}
        keywords={post.tags?.map((t) => t.name)}
        type="article"
      />

      {/* Navigation */}
      <AboutNavbar />

      <main className="pt-28 pb-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto space-y-10">
        {/* Breadcrumb Navigation */}
        <nav aria-label="مسیر راهنما" className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] flex-wrap">
          <Link to="/" className="hover:text-[#008080] transition-colors">
            صفحه اصلی
          </Link>
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
          <Link to="/blog" className="hover:text-[#008080] transition-colors">
            وبلاگ آموزشی
          </Link>
          {post.category && (
            <>
              <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
              <Link
                to={`/blog/category/${post.category.slug}`}
                className="hover:text-[#008080] transition-colors"
              >
                {post.category.name}
              </Link>
            </>
          )}
          <ChevronLeft className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-[var(--color-text)] font-semibold truncate max-w-xs sm:max-w-md">
            {post.title}
          </span>
        </nav>

        {/* Article Header Container */}
        <header className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            {post.category && (
              <Link
                to={`/blog/category/${post.category.slug}`}
                className="px-3.5 py-1 rounded-full text-xs font-bold bg-[#008080]/10 text-[#008080] border border-[#008080]/20 hover:bg-[#008080]/15 transition-colors"
              >
                {post.category.name}
              </Link>
            )}
            <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <time dateTime={post.publishedAt || undefined}>{publishedDateFormatted}</time>
            </span>
            <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{post.readingTimeMinutes} دقیقه زمان مطالعه</span>
            </span>
            <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              <span>{post.viewCount.toLocaleString("fa-IR")} بازدید</span>
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-[var(--color-text)] leading-tight tracking-tight">
            {post.title}
          </h1>

          {post.excerpt && (
            <p className="text-base sm:text-lg text-[var(--color-text-muted)] leading-relaxed font-normal border-r-2 border-[#008080] pr-4">
              {post.excerpt}
            </p>
          )}
        </header>

        {/* Featured Image */}
        {post.featuredImage && (
          <div className="relative rounded-[16px] overflow-hidden aspect-video sm:aspect-21/9 border border-[var(--color-border)] shadow-xs bg-slate-100">
            <img
              src={post.featuredImage}
              alt={post.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Grid Layout: Main Article Content + Table of Contents Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          {/* Main Article Body */}
          <article className="lg:col-span-8 space-y-8">
            {/* Inline Table of Contents for Mobile / Short screens */}
            {toc.length > 2 && (
              <div className="lg:hidden p-5 rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] space-y-3 shadow-xs">
                <div className="flex items-center gap-2 text-xs font-bold text-[#008080]">
                  <List className="w-4 h-4" />
                  <span>فهرست عناوین این مقاله</span>
                </div>
                <ul className="space-y-1.5 text-xs text-[var(--color-text)]">
                  {toc.map((item, idx) => (
                    <li key={idx} className={item.level === 3 ? "pr-4 text-[var(--color-text-muted)]" : ""}>
                      <a
                        href={`#${item.id}`}
                        className="hover:text-[#008080] transition-colors"
                      >
                        • {item.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Markdown Body */}
            <div className="p-6 sm:p-10 rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs">
              <div className="prose max-w-none text-[var(--color-text)]">
                <MarkdownRenderer content={post.content} />
              </div>
            </div>

            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-4">
                <span className="text-xs font-semibold text-[var(--color-text-muted)]">برچسب‌ها:</span>
                {post.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="px-3 py-1 rounded-[8px] text-xs font-medium bg-[var(--color-surface-warm)] text-[var(--color-text)] border border-[var(--color-border)] hover:border-[#008080]/40 transition-colors"
                  >
                    #{tag.name}
                  </span>
                ))}
              </div>
            )}

            {/* Share Actions Bar */}
            <div className="p-5 rounded-[12px] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text)]">
                <Share2 className="w-4 h-4 text-[#008080]" />
                <span>اشتراک‌گذاری این مقاله با همکاران و دانشجویان:</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-[8px] text-xs font-semibold bg-[var(--color-surface-warm)] hover:bg-slate-200 text-[var(--color-text)] border border-[var(--color-border)] transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : null}
                  <span>{copied ? "کپی شد!" : "کپی لینک مقاله"}</span>
                </button>

                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(post.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-[8px] text-xs font-bold bg-[#229ED9]/10 text-[#229ED9] hover:bg-[#229ED9]/20 transition-colors"
                >
                  تلگرام
                </a>

                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${post.title}\n${currentUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-[8px] text-xs font-bold bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20 transition-colors"
                >
                  واتس‌اپ
                </a>
              </div>
            </div>

            {/* Call to Action Box */}
            <div className="relative rounded-[16px] overflow-hidden p-8 border border-[var(--color-border)] shadow-xs bg-gradient-to-br from-teal-50/80 via-[var(--color-surface)] to-[var(--color-surface)] space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-[#008080]/10 text-[#008080] border border-[#008080]/20">
                <Sparkles className="w-3.5 h-3.5 text-[#008080]" />
                <span>شروع یادگیری با آوانا</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-[var(--color-text)]">
                آماده تسلط کامل بر دروس و امتحانات داروسازی هستید؟
              </h3>
              <p className="text-xs sm:text-sm text-[var(--color-text-muted)] leading-relaxed max-w-xl">
                با عضویت در آوانا، به هزاران فلش‌کارت هوشمند مبتنی بر سیستم لایتنر، آزمون‌های آزمایشی استاندارد و دستیار هوشمند مطالعه دسترسی خواهید داشت.
              </p>
              <div className="pt-2">
                <Link
                  to="/courses"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-[10px] font-bold text-xs sm:text-sm bg-[#008080] hover:bg-[#006666] active:bg-[#005050] text-white shadow-xs transition-all active:scale-95"
                >
                  <span>مشاهده دوره‌ها و شروع رایگان</span>
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </article>

          {/* Sidebar (Table of Contents & Meta) */}
          <aside className="lg:col-span-4 space-y-6">
            {/* Sticky Table of Contents */}
            {toc.length > 0 && (
              <div className="hidden lg:block sticky top-28 p-6 rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] space-y-4 shadow-xs">
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-text)] pb-3 border-b border-[var(--color-border)]">
                  <List className="w-4 h-4 text-[#008080]" />
                  <span>فهرست عناوین مقاله</span>
                </div>
                <nav className="max-h-[calc(100vh-250px)] overflow-y-auto space-y-2 text-xs">
                  {toc.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleScrollToSection(item.id)}
                      className={`w-full text-right py-1 transition-colors block text-[var(--color-text)] hover:text-[#008080] leading-relaxed ${
                        item.level === 3 ? "pr-4 text-[11px] text-[var(--color-text-muted)]" : "font-medium"
                      }`}
                    >
                      {item.text}
                    </button>
                  ))}
                </nav>
              </div>
            )}
          </aside>
        </div>

        {/* Related Posts Section */}
        {post.relatedPosts && post.relatedPosts.length > 0 && (
          <section className="pt-12 border-t border-[var(--color-border)] space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-[var(--color-text)] flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#008080]" />
                <span>مقالات مرتبط پیشنهادی</span>
              </h3>
              <Link to="/blog" className="text-xs font-semibold text-[#008080] hover:underline">
                مشاهده همه مقالات
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {post.relatedPosts.map((related) => (
                <Link
                  key={related.id}
                  to={`/blog/${related.slug}`}
                  className="group rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden hover:border-[#008080]/40 shadow-xs transition-all p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="aspect-video rounded-xl overflow-hidden bg-slate-100">
                    <img
                      src={
                        related.featuredImage ||
                        /* eslint-disable-next-line no-secrets/no-secrets */
                        "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80"
                      }
                      alt={related.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>

                  <div className="space-y-1.5 flex-1">
                    <div className="text-[10px] text-[#008080] font-semibold">
                      {related.category?.name || "وبلاگ"}
                    </div>
                    <h4 className="text-xs font-bold text-[var(--color-text)] group-hover:text-[#008080] transition-colors line-clamp-2 leading-snug">
                      {related.title}
                    </h4>
                  </div>

                  <div className="text-[10px] text-[var(--color-text-muted)] flex items-center justify-between pt-2 border-t border-[var(--color-border)]">
                    <span>{related.readingTimeMinutes} دقیقه مطالعه</span>
                    <span className="text-[#008080] font-semibold flex items-center gap-1">
                      <span>مطالعه</span>
                      <ArrowLeft className="w-3 h-3" />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
