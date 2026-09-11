import { useState, useEffect, useRef } from "react";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Table,
  Link as LinkIcon,
  Image as ImageIcon,
  Code,
  Eye,
  Edit3,
  Columns,
  Save,
  Send,
  ArrowRight,
  AlertCircle,
  Clock,
  Sparkles,
  Globe,
} from "lucide-react";
import { Link } from "react-router-dom";
import { AvanaSelect, SegmentedControl } from "@avana/ui";
import { MarkdownRenderer } from "../../markdown/MarkdownRenderer.js";
import type {
  BlogPostDetail,
  CreateBlogPostRequest,
  UpdateBlogPostRequest,
  BlogCategory,
} from "../../../lib/api/blog.js";

interface AdminBlogEditorProps {
  initialPost?: BlogPostDetail;
  categories: BlogCategory[];
  isSaving: boolean;
  onSave: (data: CreateBlogPostRequest | UpdateBlogPostRequest) => void;
  onPublish?: (data: CreateBlogPostRequest | UpdateBlogPostRequest) => void;
}

export function AdminBlogEditor({
  initialPost,
  categories,
  isSaving,
  onSave,
  onPublish,
}: AdminBlogEditorProps) {
  const [title, setTitle] = useState(initialPost?.title || "");
  const [slug, setSlug] = useState(initialPost?.slug || "");
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(Boolean(initialPost?.slug));
  const [excerpt, setExcerpt] = useState(initialPost?.excerpt || "");
  const [content, setContent] = useState(initialPost?.content || "");
  const [featuredImage, setFeaturedImage] = useState(initialPost?.featuredImage || "");
  const [categoryId, setCategoryId] = useState(initialPost?.category?.id || "");
  const [tagsInput, setTagsInput] = useState(
    initialPost?.tags ? initialPost.tags.map((t) => t.name).join(", ") : "",
  );
  const status = initialPost?.status || "draft";
  const [readingTime, setReadingTime] = useState(
    initialPost?.readingTimeMinutes ? String(initialPost.readingTimeMinutes) : "",
  );

  // SEO fields
  const [seoTitle, setSeoTitle] = useState(initialPost?.seoTitle || "");
  const [seoDescription, setSeoDescription] = useState(initialPost?.seoDescription || "");
  const [canonicalUrl, setCanonicalUrl] = useState(initialPost?.canonicalUrl || "");
  const [showSeoSection, setShowSeoSection] = useState(false);

  // View modes: 'split' | 'edit' | 'preview'
  const [viewMode, setViewMode] = useState<"split" | "edit" | "preview">("split");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-generate slug from title if not manually edited
  useEffect(() => {
    if (!isSlugManuallyEdited && title.trim()) {
      const generated = title
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, "-")
        .replace(/[^\w\u0600-\u06FF-]+/g, "")
        .replace(/^-+|-+$/g, "");
      setSlug(generated);
    }
  }, [title, isSlugManuallyEdited]);

  // Insert markdown helper
  const insertFormatting = (prefix: string, suffix: string = "", defaultPlaceholder: string = "") => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end) || defaultPlaceholder;
    const replacement = `${prefix}${selectedText}${suffix}`;

    const newContent =
      content.substring(0, start) + replacement + content.substring(end);
    setContent(newContent);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(
        start + prefix.length,
        start + prefix.length + selectedText.length,
      );
    }, 0);
  };

  const validateForm = (): boolean => {
    const errs: Record<string, string> = {};
    if (!title.trim()) {
      errs.title = "عنوان مقاله الزامی است.";
    }
    if (!content.trim()) {
      errs.content = "محتوای مقاله نمی‌تواند خالی باشد.";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const buildPayload = (overrideStatus?: "draft" | "published"): CreateBlogPostRequest => {
    const tagNames = tagsInput
      .split(/[,،]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    const parsedReadingTime = readingTime.trim() ? parseInt(readingTime, 10) : undefined;

    return {
      title: title.trim(),
      slug: slug.trim() || undefined,
      excerpt: excerpt.trim() || undefined,
      content,
      featuredImage: featuredImage.trim() || undefined,
      status: overrideStatus || status,
      categoryId: categoryId || undefined,
      tagNames,
      readingTimeMinutes: parsedReadingTime && !isNaN(parsedReadingTime) ? parsedReadingTime : undefined,
      seoTitle: seoTitle.trim() || undefined,
      seoDescription: seoDescription.trim() || undefined,
      canonicalUrl: canonicalUrl.trim() || undefined,
    };
  };

  const handleSaveDraft = () => {
    if (!validateForm()) return;
    onSave(buildPayload("draft"));
  };

  const handlePublishClick = () => {
    if (!validateForm()) return;
    if (onPublish) {
      onPublish(buildPayload("published"));
    } else {
      onSave(buildPayload("published"));
    }
  };

  // Keyboard shortcut Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleSaveDraft();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Header & Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-[var(--color-surface)] p-4 rounded-2xl border border-[var(--color-border)] backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/blog"
            className="p-2 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors"
            title="بازگشت به لیست مقالات"
          >
            <ArrowRight className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-[var(--color-text)]">
              {initialPost ? `ویرایش مقاله: ${initialPost.title}` : "ایجاد مقاله جدید"}
            </h1>
            <p className="text-xs text-[var(--color-text-muted)]">
              مدیریت محتوای بلاگ آموزشی آوانا
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Status Badge */}
          <span
            className={`text-xs px-3 py-1 rounded-full font-semibold border ${
              status === "published"
                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
            }`}
          >
            {status === "published" ? "منتشر شده" : "پیش‌نویس (Draft)"}
          </span>

          {/* Save Draft Button */}
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text)] border border-[var(--color-border)] transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4 text-[var(--color-primary-default)]" />
            <span>ذخیره پیش‌نویس (Ctrl+S)</span>
          </button>

          {/* Publish / Update Button */}
          <button
            type="button"
            onClick={handlePublishClick}
            disabled={isSaving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-dark)] text-[var(--color-primary-contrast)] transition-all shadow-md active:scale-95 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{status === "published" ? "بروزرسانی و انتشار" : "انتشار رسمی مقاله"}</span>
          </button>
        </div>
      </div>

      {/* Main Metadata Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Main Info */}
        <div className="lg:col-span-2 space-y-4">
          {/* Title */}
          <div className="bg-[var(--color-surface)] p-5 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-2">
            <label className="block text-xs font-bold text-[var(--color-text)]">
              عنوان مقاله <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="مثلاً: چگونه برای امتحان فارماکولوژی بهتر درس بخوانیم؟"
              className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)] focus:ring-1 focus:ring-[var(--color-primary-default)] transition-colors"
            />
            {errors.title && (
              <p className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                <span>{errors.title}</span>
              </p>
            )}
          </div>

          {/* Slug & Category Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Slug */}
            <div className="bg-[var(--color-surface)] p-5 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold text-[var(--color-text)]">
                  اسلاگ یکتا (URL Slug)
                </label>
                <span className="text-[10px] text-[var(--color-text-muted)]">فارسی یا انگلیسی</span>
              </div>
              <input
                type="text"
                value={slug}
                onChange={(e) => {
                  setIsSlugManuallyEdited(true);
                  setSlug(e.target.value);
                }}
                placeholder="slug-name-here"
                dir="ltr"
                className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl px-4 py-2.5 text-xs font-mono text-[var(--color-primary-default)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)] transition-colors"
              />
              <p className="text-[11px] text-[var(--color-text-muted)] truncate">
                آدرس: /blog/{slug || "..."}
              </p>
            </div>

            {/* Category */}
            <div className="bg-[var(--color-surface)] p-5 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-2">
              <AvanaSelect
                label="دسته‌بندی موضوعی"
                value={categoryId}
                onChange={(val) => setCategoryId(typeof val === "string" ? val : val[0] || "")}
                options={[
                  { value: "", label: "-- بدون دسته‌بندی --" },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
          </div>

          {/* Excerpt */}
          <div className="bg-[var(--color-surface)] p-5 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-2">
            <label className="block text-xs font-bold text-[var(--color-text)]">
              چکیده و خلاصه کوتاه (Excerpt)
            </label>
            <textarea
              rows={2}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              placeholder="خلاصه‌ای کوتاه و جذاب از مقاله برای نمایش در کارت‌ها و پیش‌نمایش شبکه‌های اجتماعی..."
              className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl p-3 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)] leading-relaxed resize-y"
            />
          </div>
        </div>

        {/* Right 1 Col: Media & Settings */}
        <div className="space-y-4">
          {/* Featured Image */}
          <div className="bg-[var(--color-surface)] p-5 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-3">
            <label className="block text-xs font-bold text-[var(--color-text)]">
              تصویر شاخص (Featured Image URL)
            </label>
            <input
              type="text"
              value={featuredImage}
              onChange={(e) => setFeaturedImage(e.target.value)}
              placeholder="https://images.unsplash.com/..."
              dir="ltr"
              className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)]"
            />
            {featuredImage ? (
              <div className="relative rounded-xl overflow-hidden aspect-video border border-[var(--color-border)] bg-[var(--color-surface-warm)]">
                <img
                  src={featuredImage}
                  alt="پیش‌نمایش تصویر شاخص"
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-[var(--color-border)] p-4 text-center text-[var(--color-text-muted)] text-xs">
                آدرس مستقیم تصویر را وارد کنید
              </div>
            )}
          </div>

          {/* Tags & Estimated Reading Time */}
          <div className="bg-[var(--color-surface)] p-5 rounded-2xl border border-[var(--color-border)] shadow-sm space-y-4">
            <div>
              <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                برچسب‌ها (تگ‌ها)
              </label>
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="فارماکولوژی، داروسازی، امتحان، فلشکارت"
                className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl px-3 py-2 text-xs text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)]"
              />
              <p className="text-[10px] text-[var(--color-text-muted)] mt-1">با کاما یا ویرگول جدا کنید</p>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                زمان تخمینی مطالعه (دقیقه)
              </label>
              <div className="flex items-center gap-2 bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-xl px-3 py-2">
                <Clock className="w-4 h-4 text-[var(--color-primary-default)]" />
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={readingTime}
                  onChange={(e) => setReadingTime(e.target.value)}
                  placeholder="محاسبه خودکار (۵)"
                  className="w-full bg-transparent text-xs text-[var(--color-text)] focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* SEO Accordion Trigger */}
          <div className="bg-[var(--color-surface)] p-4 rounded-2xl border border-[var(--color-border)] shadow-sm">
            <button
              type="button"
              onClick={() => setShowSeoSection(!showSeoSection)}
              className="w-full flex items-center justify-between text-xs font-bold text-[var(--color-primary-default)] hover:opacity-80"
            >
              <span className="flex items-center gap-2">
                <Globe className="w-4 h-4" />
                <span>تنظیمات پیشرفته سئو (SEO)</span>
              </span>
              <span>{showSeoSection ? "▲" : "▼"}</span>
            </button>

            {showSeoSection && (
              <div className="mt-4 space-y-3 pt-3 border-t border-[var(--color-border)] text-xs">
                <div>
                  <label className="block font-semibold text-[var(--color-text)] mb-1">SEO Title</label>
                  <input
                    type="text"
                    value={seoTitle}
                    onChange={(e) => setSeoTitle(e.target.value)}
                    placeholder="پیش‌فرض: همان عنوان مقاله"
                    className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-lg p-2 text-[var(--color-text)]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[var(--color-text)] mb-1">SEO Description</label>
                  <textarea
                    rows={2}
                    value={seoDescription}
                    onChange={(e) => setSeoDescription(e.target.value)}
                    placeholder="پیش‌فرض: همان چکیده مقاله"
                    className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-lg p-2 text-[var(--color-text)]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[var(--color-text)] mb-1">Canonical URL</label>
                  <input
                    type="text"
                    value={canonicalUrl}
                    onChange={(e) => setCanonicalUrl(e.target.value)}
                    placeholder="https://..."
                    dir="ltr"
                    className="w-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] rounded-lg p-2 text-[var(--color-text)] font-mono"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content Editor Panel with Rich Markdown Toolbar */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden shadow-sm">
        {/* Editor Toolbar */}
        <div className="bg-[var(--color-surface-warm)]/80 p-3 border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-2">
          {/* Formatting buttons */}
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => insertFormatting("# ", "", "عنوان اصلی")}
              title="تیتر اصلی (Heading 1)"
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
            >
              <Heading1 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting("## ", "", "زیرعنوان")}
              title="زیرعنوان (Heading 2)"
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
            >
              <Heading2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting("### ", "", "عنوان بخش")}
              title="تیتر سطح ۳ (Heading 3)"
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
            >
              <Heading3 className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
            <button
              type="button"
              onClick={() => insertFormatting("**", "**", "متن پررنگ")}
              title="بولد (Bold)"
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
            >
              <Bold className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting("*", "*", "متن مورب")}
              title="ایتالیک (Italic)"
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
            >
              <Italic className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
            <button
              type="button"
              onClick={() => insertFormatting("- ", "", "آیتم لیست")}
              title="لیست نشانه‌دار (Bulleted list)"
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting("1. ", "", "مرحله اول")}
              title="لیست شماره‌دار (Numbered list)"
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
            >
              <ListOrdered className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting("> ", "", "نقل قول یا نکته مهم")}
              title="نقل قول / کادر توجه (Blockquote)"
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
            >
              <Quote className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                insertFormatting(
                  "| سرستون ۱ | سرستون ۲ |\n| :--- | :--- |\n| داده ۱ | داده ۲ |",
                  "",
                )
              }
              title="جدول (GFM Table)"
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
            >
              <Table className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-[var(--color-border)] mx-1" />
            <button
              type="button"
              onClick={() => insertFormatting("[", "](https://example.com)", "عنوان پیوند")}
              title="پیوند (Link)"
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
            >
              <LinkIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                insertFormatting("![", "](https://example.com/image.jpg)", "توضیح تصویر")
              }
              title="تصویر (Image)"
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => insertFormatting("```\n", "\n```", "کد یا فرمول")}
              title="بلوک کد (Code block)"
              className="p-2 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)] transition-colors"
            >
              <Code className="w-4 h-4" />
            </button>
          </div>

          {/* View mode toggle */}
          <SegmentedControl
            options={[
              {
                value: "edit",
                label: (
                  <span className="flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">فقط ویرایش</span>
                  </span>
                ),
              },
              {
                value: "split",
                label: (
                  <span className="flex items-center gap-1.5">
                    <Columns className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">نمای دوطرفه</span>
                  </span>
                ),
              },
              {
                value: "preview",
                label: (
                  <span className="flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">فقط پیش‌نمایش</span>
                  </span>
                ),
              },
            ]}
            value={viewMode}
            onChange={(val) => setViewMode(val as "split" | "edit" | "preview")}
          />
        </div>

        {/* Editor Body */}
        <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-[var(--color-border)] min-h-[500px]">
          {/* Markdown Textarea */}
          {(viewMode === "edit" || viewMode === "split") && (
            <div className={`p-6 ${viewMode === "edit" ? "lg:col-span-2" : ""}`}>
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="محتوای مقاله را با فرمت Markdown بنویسید..."
                dir="auto"
                className="w-full h-full min-h-[480px] bg-transparent text-sm text-[var(--color-text)] font-mono leading-relaxed resize-none focus:outline-none placeholder-[var(--color-text-muted)]"
              />
            </div>
          )}

          {/* Live Preview Pane */}
          {(viewMode === "preview" || viewMode === "split") && (
            <div
              className={`p-6 bg-[var(--color-surface-warm)]/40 overflow-y-auto max-h-[700px] ${
                viewMode === "preview" ? "lg:col-span-2" : ""
              }`}
            >
              <div className="mb-4 pb-3 border-b border-[var(--color-border)] flex items-center justify-between">
                <span className="text-xs font-bold text-[var(--color-primary-default)] flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>پیش‌نمایش زنده خروجی (MarkdownRenderer)</span>
                </span>
                <span className="text-[11px] text-[var(--color-text-muted)]">
                  {content.trim() ? `${content.trim().split(/\s+/).length} کلمه` : "خالی"}
                </span>
              </div>

              {content.trim() ? (
                <div className="prose dark:prose-invert max-w-none text-[var(--color-text)]">
                  <MarkdownRenderer content={content} />
                </div>
              ) : (
                <div className="text-center py-20 text-[var(--color-text-muted)] text-xs italic">
                  هنگام تایپ در بخش ویرایشگر، پیش‌نمایش رندرشده با استایل رسمی آوانا در اینجا نمایش داده می‌شود...
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
