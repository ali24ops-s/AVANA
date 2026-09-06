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
      <div className="min-h-screen bg-[#0b1120] text-slate-100 flex flex-col font-sans" dir="rtl">
        <AboutNavbar />
        <div className="flex-1 flex flex-col items-center justify-center pt-24 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-teal-400" />
          <p className="text-sm font-medium text-slate-400">در حال بارگذاری مقاله...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (isError || !post) {
    return (
      <div className="min-h-screen bg-[#0b1120] text-slate-100 flex flex-col font-sans" dir="rtl">
        <AboutNavbar />
        <main className="flex-1 max-w-xl mx-auto pt-36 pb-20 px-4 text-center space-y-4">
          <div className="glass-panel p-8 rounded-3xl border border-red-500/20 shadow-2xl space-y-4">
            <AlertTriangle className="w-14 h-14 text-red-400 mx-auto" />
            <h1 className="text-xl font-bold text-white">مقاله مورد نظر یافت نشد</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              این مقاله وجود ندارد یا ممکن است هنوز در وضعیت پیش‌نویس باشد و منتشر نشده باشد.
            </p>
            <div className="pt-2">
              <Link
                to="/blog"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-bold transition-all shadow-md"
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
    <div className="min-h-screen bg-[#0b1120] text-slate-100 font-sans selection:bg-teal-700/50 selection:text-teal-200" dir="rtl">
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
        <nav aria-label="مسیر راهنما" className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
          <Link to="/" className="hover:text-teal-300 transition-colors">
            صفحه اصلی
          </Link>
          <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
          <Link to="/blog" className="hover:text-teal-300 transition-colors">
            وبلاگ آموزشی
          </Link>
          {post.category && (
            <>
              <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
              <Link
                to={`/blog/category/${post.category.slug}`}
                className="hover:text-teal-300 transition-colors"
              >
                {post.category.name}
              </Link>
            </>
          )}
          <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-slate-200 font-semibold truncate max-w-xs sm:max-w-md">
            {post.title}
          </span>
        </nav>

        {/* Article Header Container */}
        <header className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            {post.category && (
              <Link
                to={`/blog/category/${post.category.slug}`}
                className="px-3.5 py-1 rounded-full text-xs font-bold bg-teal-500/15 text-teal-300 border border-teal-500/30 hover:bg-teal-500/25 transition-colors"
              >
                {post.category.name}
              </Link>
            )}
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <time dateTime={post.publishedAt || undefined}>{publishedDateFormatted}</time>
            </span>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              <span>{post.readingTimeMinutes} دقیقه زمان مطالعه</span>
            </span>
            <span className="text-xs text-slate-400 flex items-center gap-1">
              <Eye className="w-3.5 h-3.5" />
              <span>{post.viewCount.toLocaleString("fa-IR")} بازدید</span>
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white leading-tight tracking-tight">
            {post.title}
          </h1>

          {post.excerpt && (
            <p className="text-base sm:text-lg text-slate-300 leading-relaxed font-normal border-r-2 border-teal-500 pr-4">
              {post.excerpt}
            </p>
          )}
        </header>

        {/* Featured Image */}
        {post.featuredImage && (
          <div className="relative rounded-3xl overflow-hidden aspect-video sm:aspect-21/9 border border-white/10 shadow-2xl bg-slate-950">
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
              <div className="lg:hidden glass-panel p-5 rounded-2xl border border-white/10 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-teal-400">
                  <List className="w-4 h-4" />
                  <span>فهرست عناوین این مقاله</span>
                </div>
                <ul className="space-y-1.5 text-xs text-slate-300">
                  {toc.map((item, idx) => (
                    <li key={idx} className={item.level === 3 ? "pr-4 text-slate-400" : ""}>
                      <a
                        href={`#${item.id}`}
                        className="hover:text-teal-300 transition-colors"
                      >
                        • {item.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Markdown Body */}
            <div className="glass-panel p-6 sm:p-10 rounded-3xl border border-white/10 shadow-xl">
              <div className="prose prose-invert max-w-none text-slate-200">
                <MarkdownRenderer content={post.content} />
              </div>
            </div>

            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-4">
                <span className="text-xs font-semibold text-slate-400">برچسب‌ها:</span>
                {post.tags.map((tag) => (
                  <span
                    key={tag.id}
                    className="px-3 py-1 rounded-xl text-xs font-medium bg-white/5 text-slate-300 border border-white/10 hover:border-teal-500/30 transition-colors"
                  >
                    #{tag.name}
                  </span>
                ))}
              </div>
            )}

            {/* Share Actions Bar */}
            <div className="glass-panel p-5 rounded-2xl border border-white/10 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
                <Share2 className="w-4 h-4 text-teal-400" />
                <span>اشتراک‌گذاری این مقاله با همکاران و دانشجویان:</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyLink}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : null}
                  <span>{copied ? "کپی شد!" : "کپی لینک مقاله"}</span>
                </button>

                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent(currentUrl)}&text=${encodeURIComponent(post.title)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#229ED9]/20 text-[#229ED9] hover:bg-[#229ED9]/30 transition-colors"
                >
                  تلگرام
                </a>

                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`${post.title}\n${currentUrl}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#25D366]/20 text-[#25D366] hover:bg-[#25D366]/30 transition-colors"
                >
                  واتس‌اپ
                </a>
              </div>
            </div>

            {/* Call to Action Box */}
            <div className="relative rounded-3xl overflow-hidden p-8 border border-teal-500/30 shadow-2xl bg-gradient-to-br from-teal-950/40 via-slate-900/80 to-slate-950 space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-teal-500/10 text-teal-300 border border-teal-500/20">
                <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                <span>شروع یادگیری با آوانا</span>
              </div>
              <h3 className="text-xl sm:text-2xl font-black text-white">
                آماده تسلط کامل بر دروس و امتحانات داروسازی هستید؟
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-xl">
                با عضویت در آوانا، به هزاران فلش‌کارت هوشمند مبتنی بر سیستم لایتنر، آزمون‌های آزمایشی استاندارد و دستیار هوشمند مطالعه دسترسی خواهید داشت.
              </p>
              <div className="pt-2">
                <Link
                  to="/courses"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs sm:text-sm bg-[#008080] hover:bg-[#006666] text-white shadow-[0_0_25px_rgba(0,128,128,0.4)] transition-all active:scale-95"
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
              <div className="hidden lg:block sticky top-28 glass-panel p-6 rounded-3xl border border-white/10 space-y-4 shadow-xl">
                <div className="flex items-center gap-2 text-sm font-bold text-white pb-3 border-b border-white/10">
                  <List className="w-4 h-4 text-teal-400" />
                  <span>فهرست عناوین مقاله</span>
                </div>
                <nav className="max-h-[calc(100vh-250px)] overflow-y-auto space-y-2 text-xs">
                  {toc.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleScrollToSection(item.id)}
                      className={`w-full text-right py-1 transition-colors block text-slate-300 hover:text-teal-300 leading-relaxed ${
                        item.level === 3 ? "pr-4 text-[11px] text-slate-400" : "font-medium"
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
          <section className="pt-12 border-t border-white/10 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-teal-400" />
                <span>مقالات مرتبط پیشنهادی</span>
              </h3>
              <Link to="/blog" className="text-xs font-semibold text-teal-400 hover:underline">
                مشاهده همه مقالات
              </Link>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {post.relatedPosts.map((related) => (
                <Link
                  key={related.id}
                  to={`/blog/${related.slug}`}
                  className="glass-panel group rounded-2xl border border-white/10 overflow-hidden hover:border-teal-500/40 transition-all p-4 flex flex-col justify-between space-y-3"
                >
                  <div className="aspect-video rounded-xl overflow-hidden bg-slate-950">
                    <img
                      src={
                        related.featuredImage ||
                        "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?auto=format&fit=crop&w=600&q=80"
                      }
                      alt={related.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>

                  <div className="space-y-1.5 flex-1">
                    <div className="text-[10px] text-teal-400 font-semibold">
                      {related.category?.name || "وبلاگ"}
                    </div>
                    <h4 className="text-xs font-bold text-white group-hover:text-teal-300 transition-colors line-clamp-2 leading-snug">
                      {related.title}
                    </h4>
                  </div>

                  <div className="text-[10px] text-slate-400 flex items-center justify-between pt-2 border-t border-white/5">
                    <span>{related.readingTimeMinutes} دقیقه مطالعه</span>
                    <span className="text-teal-400 font-semibold flex items-center gap-1">
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
