import type { BlogStore } from "./blog-store.js";
import type {
  BlogPostWithDetails,
  ListBlogPostsQuery,
  ListBlogPostsResult,
  AdminBlogStats,
  BlogCategoryRecord,
  BlogTagRecord,
  CreateBlogPostInput,
  UpdateBlogPostInput,
} from "./blog-types.js";

/**
 * Calculates estimated reading time in minutes for Persian / English text.
 * Average Persian reading speed is ~180-220 words per minute.
 */
export function calculateReadingTime(content: string): number {
  if (!content || !content.trim()) return 1;
  const words = content.trim().split(/\s+/).filter(Boolean);
  const minutes = Math.ceil(words.length / 200);
  return Math.max(1, minutes);
}

/**
 * Generates an excerpt from markdown content if not explicitly provided.
 */
export function generateExcerpt(content: string, maxLength: number = 180): string {
  if (!content) return "";
  // Strip Markdown syntax for clean plain text excerpt
  const plainText = content
    .replace(/^#+\s+/gm, "") // headers
    .replace(/!\[.*?\]\(.*?\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/[*_`~>]/g, "") // formatting chars
    .replace(/\n+/g, " ") // newlines to spaces
    .trim();

  if (plainText.length <= maxLength) return plainText;
  return plainText.slice(0, maxLength).trim() + "...";
}

/**
 * Normalizes a slug to be URL-safe while preserving Persian & alphanumeric characters.
 */
export function slugify(text: string): string {
  if (!text) return "";
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u200C\u200B\u200D\uFEFF\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export class BlogService {
  constructor(private readonly store: BlogStore) {}

  // -------------------------------------------------------------------------
  // Public Blog Operations
  // -------------------------------------------------------------------------

  async listPublishedPosts(query: ListBlogPostsQuery): Promise<ListBlogPostsResult> {
    return this.store.listPublishedPosts(query);
  }

  async getPublishedPostBySlug(slug: string): Promise<BlogPostWithDetails | null> {
    const cleanSlug = slug.trim();
    const post = await this.store.getPublishedPostBySlug(cleanSlug);
    if (!post) return null;

    // Safely increment view count
    try {
      await this.store.incrementPostViewCount(post.id);
      post.viewCount += 1;
    } catch {
      // Non-blocking for post retrieval
    }

    // Fetch related posts from same category
    const related = await this.store.getRelatedPosts(post.id, post.categoryId, 3);
    post.relatedPosts = related;

    return post;
  }

  async listCategories(): Promise<BlogCategoryRecord[]> {
    return this.store.listCategoriesWithCounts();
  }

  async getCategoryBySlug(slug: string): Promise<BlogCategoryRecord | null> {
    return this.store.getCategoryBySlug(slug.trim());
  }

  async listPopularTags(limit: number = 20): Promise<BlogTagRecord[]> {
    return this.store.listPopularTags(limit);
  }

  // -------------------------------------------------------------------------
  // Admin Blog Operations
  // -------------------------------------------------------------------------

  async listAllPostsAdmin(query: ListBlogPostsQuery): Promise<ListBlogPostsResult> {
    return this.store.listAllPostsAdmin(query);
  }

  async getPostByIdAdmin(id: string): Promise<BlogPostWithDetails | null> {
    return this.store.getPostByIdAdmin(id);
  }

  async getPostBySlugAdmin(slug: string): Promise<BlogPostWithDetails | null> {
    return this.store.getPostBySlugAdmin(slug.trim());
  }

  async getAdminStats(): Promise<AdminBlogStats> {
    return this.store.getAdminStats();
  }

  async createPost(authorId: string, input: CreateBlogPostInput): Promise<BlogPostWithDetails> {
    if (!input.title || !input.title.trim()) {
      throw new Error("عنوان مقاله الزامی است.");
    }
    if (!input.content || !input.content.trim()) {
      throw new Error("محتوای مقاله الزامی است.");
    }

    let slug = input.slug ? slugify(input.slug) : slugify(input.title);
    if (!slug) {
      slug = `article-${Date.now().toString(36)}`;
    }

    // Check slug uniqueness
    const existing = await this.store.getPostBySlugAdmin(slug);
    if (existing) {
      slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
    }

    const excerpt = input.excerpt && input.excerpt.trim().length > 0
      ? input.excerpt.trim()
      : generateExcerpt(input.content);

    const readingTimeMinutes = input.readingTimeMinutes && input.readingTimeMinutes > 0
      ? input.readingTimeMinutes
      : calculateReadingTime(input.content);

    const seoTitle = input.seoTitle && input.seoTitle.trim().length > 0
      ? input.seoTitle.trim()
      : input.title.trim();

    const seoDescription = input.seoDescription && input.seoDescription.trim().length > 0
      ? input.seoDescription.trim()
      : excerpt;

    return this.store.createPost(authorId, {
      ...input,
      title: input.title.trim(),
      slug,
      excerpt,
      readingTimeMinutes,
      seoTitle,
      seoDescription,
    });
  }

  async updatePost(id: string, input: UpdateBlogPostInput): Promise<BlogPostWithDetails> {
    const existing = await this.store.getPostByIdAdmin(id);
    if (!existing) {
      throw new Error(`مقاله با شناسه ${id} یافت نشد.`);
    }

    let slug = input.slug !== undefined ? slugify(input.slug) : undefined;
    if (slug && slug !== existing.slug) {
      const duplicate = await this.store.getPostBySlugAdmin(slug);
      if (duplicate && duplicate.id !== id) {
        throw new Error(`اسلاگ ${slug} قبلاً برای مقاله دیگری استفاده شده است.`);
      }
    }

    let excerpt = input.excerpt;
    if (excerpt === undefined && input.content) {
      excerpt = generateExcerpt(input.content);
    }

    let readingTimeMinutes = input.readingTimeMinutes;
    if (readingTimeMinutes === undefined && input.content) {
      readingTimeMinutes = calculateReadingTime(input.content);
    }

    return this.store.updatePost(id, {
      ...input,
      slug,
      excerpt,
      readingTimeMinutes,
    });
  }

  async deletePost(id: string): Promise<boolean> {
    const existing = await this.store.getPostByIdAdmin(id);
    if (!existing) return false;
    return this.store.deletePost(id);
  }

  async publishPost(id: string): Promise<BlogPostWithDetails> {
    const existing = await this.store.getPostByIdAdmin(id);
    if (!existing) {
      throw new Error(`مقاله با شناسه ${id} یافت نشد.`);
    }
    return this.store.publishPost(id);
  }

  async unpublishPost(id: string): Promise<BlogPostWithDetails> {
    const existing = await this.store.getPostByIdAdmin(id);
    if (!existing) {
      throw new Error(`مقاله با شناسه ${id} یافت نشد.`);
    }
    return this.store.unpublishPost(id);
  }

  async createCategory(
    name: string,
    slug?: string,
    description?: string,
    sortOrder: number = 0,
  ): Promise<BlogCategoryRecord> {
    if (!name || !name.trim()) {
      throw new Error("نام دسته‌بندی الزامی است.");
    }
    const cleanSlug = slug ? slugify(slug) : slugify(name);
    return this.store.createCategory(name.trim(), cleanSlug, description?.trim(), sortOrder);
  }

  async updateCategory(
    id: string,
    name: string,
    slug?: string,
    description?: string,
    sortOrder?: number,
  ): Promise<BlogCategoryRecord> {
    if (!name || !name.trim()) {
      throw new Error("نام دسته‌بندی الزامی است.");
    }
    const cleanSlug = slug ? slugify(slug) : slugify(name);
    return this.store.updateCategory(id, name.trim(), cleanSlug, description?.trim(), sortOrder);
  }

  async deleteCategory(id: string): Promise<boolean> {
    return this.store.deleteCategory(id);
  }
}
