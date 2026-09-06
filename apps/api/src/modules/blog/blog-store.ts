import { randomUUID } from "node:crypto";
import type {
  BlogCategoryRecord,
  BlogTagRecord,
  BlogPostRecord,
  BlogPostWithDetails,
  BlogPostSummary,
  ListBlogPostsQuery,
  ListBlogPostsResult,
  AdminBlogStats,
  CreateBlogPostInput,
  UpdateBlogPostInput,
} from "./blog-types.js";

export interface BlogStore {
  // Public Blog queries
  listPublishedPosts(query: ListBlogPostsQuery): Promise<ListBlogPostsResult>;
  getPublishedPostBySlug(slug: string): Promise<BlogPostWithDetails | null>;
  incrementPostViewCount(id: string): Promise<void>;
  listCategoriesWithCounts(): Promise<BlogCategoryRecord[]>;
  getCategoryBySlug(slug: string): Promise<BlogCategoryRecord | null>;
  listPopularTags(limit?: number): Promise<BlogTagRecord[]>;
  getRelatedPosts(postId: string, categoryId: string | null, limit?: number): Promise<BlogPostSummary[]>;

  // Admin Blog queries & mutations
  listAllPostsAdmin(query: ListBlogPostsQuery): Promise<ListBlogPostsResult>;
  getPostByIdAdmin(id: string): Promise<BlogPostWithDetails | null>;
  getPostBySlugAdmin(slug: string): Promise<BlogPostWithDetails | null>;
  getAdminStats(): Promise<AdminBlogStats>;
  createPost(authorId: string, input: CreateBlogPostInput): Promise<BlogPostWithDetails>;
  updatePost(id: string, input: UpdateBlogPostInput): Promise<BlogPostWithDetails>;
  deletePost(id: string): Promise<boolean>;
  publishPost(id: string): Promise<BlogPostWithDetails>;
  unpublishPost(id: string): Promise<BlogPostWithDetails>;

  // Category management
  createCategory(name: string, slug: string, description?: string, sortOrder?: number): Promise<BlogCategoryRecord>;
  updateCategory(id: string, name: string, slug: string, description?: string, sortOrder?: number): Promise<BlogCategoryRecord>;
  deleteCategory(id: string): Promise<boolean>;

  // Tag management
  getOrCreateTags(tagNames: string[]): Promise<BlogTagRecord[]>;
}

export class InMemoryBlogStore implements BlogStore {
  public categories: Map<string, BlogCategoryRecord> = new Map();
  public tags: Map<string, BlogTagRecord> = new Map();
  public posts: Map<string, BlogPostRecord> = new Map();
  public postTags: Array<{ postId: string; tagId: string }> = [];

  async listPublishedPosts(query: ListBlogPostsQuery): Promise<ListBlogPostsResult> {
    const now = new Date();
    let items = Array.from(this.posts.values()).filter(
      (p) => p.status === "published" && p.publishedAt && p.publishedAt <= now,
    );

    if (query.categorySlug) {
      const cat = Array.from(this.categories.values()).find(
        (c) => c.slug === query.categorySlug,
      );
      if (cat) {
        items = items.filter((p) => p.categoryId === cat.id);
      } else {
        items = [];
      }
    }

    if (query.categoryId) {
      items = items.filter((p) => p.categoryId === query.categoryId);
    }

    if (query.tagSlug) {
      const tag = Array.from(this.tags.values()).find(
        (t) => t.slug === query.tagSlug,
      );
      if (tag) {
        const postIdsWithTag = new Set(
          this.postTags.filter((pt) => pt.tagId === tag.id).map((pt) => pt.postId),
        );
        items = items.filter((p) => postIdsWithTag.has(p.id));
      } else {
        items = [];
      }
    }

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.toLowerCase().trim();
      items = items.filter(
        (p) =>
          p.title.toLowerCase().includes(term) ||
          (p.excerpt && p.excerpt.toLowerCase().includes(term)) ||
          p.content.toLowerCase().includes(term),
      );
    }

    // Sort
    const sortBy = query.sortBy || "publishedAt";
    const sortOrder = query.sortOrder || "desc";

    items.sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;

      if (sortBy === "publishedAt") {
        valA = a.publishedAt ? a.publishedAt.getTime() : 0;
        valB = b.publishedAt ? b.publishedAt.getTime() : 0;
      } else if (sortBy === "viewCount") {
        valA = a.viewCount;
        valB = b.viewCount;
      } else if (sortBy === "createdAt") {
        valA = a.createdAt.getTime();
        valB = b.createdAt.getTime();
      } else if (sortBy === "title") {
        valA = a.title;
        valB = b.title;
      }

      if (sortOrder === "asc") {
        return valA > valB ? 1 : valA < valB ? -1 : 0;
      }
      return valA < valB ? 1 : valA > valB ? -1 : 0;
    });

    const page = Math.max(1, query.page || 1);
    const pageSize = Math.max(1, query.pageSize || 10);
    const totalCount = items.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const paginated = items.slice((page - 1) * pageSize, page * pageSize);

    const summaries: BlogPostSummary[] = paginated.map((p) =>
      this.formatSummary(p),
    );

    return {
      posts: summaries,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }

  async getPublishedPostBySlug(slug: string): Promise<BlogPostWithDetails | null> {
    const now = new Date();
    const post = Array.from(this.posts.values()).find(
      (p) =>
        p.slug === slug &&
        p.status === "published" &&
        p.publishedAt &&
        p.publishedAt <= now,
    );
    if (!post) return null;
    return this.formatDetails(post);
  }

  async incrementPostViewCount(id: string): Promise<void> {
    const post = this.posts.get(id);
    if (post) {
      post.viewCount += 1;
      this.posts.set(id, post);
    }
  }

  async listCategoriesWithCounts(): Promise<BlogCategoryRecord[]> {
    const now = new Date();
    const categories = Array.from(this.categories.values());
    return categories.map((cat) => {
      const count = Array.from(this.posts.values()).filter(
        (p) =>
          p.categoryId === cat.id &&
          p.status === "published" &&
          p.publishedAt &&
          p.publishedAt <= now,
      ).length;
      return {
        ...cat,
        postCount: count,
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  async getCategoryBySlug(slug: string): Promise<BlogCategoryRecord | null> {
    const cat = Array.from(this.categories.values()).find((c) => c.slug === slug);
    if (!cat) return null;
    const count = (await this.listCategoriesWithCounts()).find((c) => c.id === cat.id)?.postCount ?? 0;
    return { ...cat, postCount: count };
  }

  async listPopularTags(limit: number = 20): Promise<BlogTagRecord[]> {
    return Array.from(this.tags.values()).slice(0, limit);
  }

  async getRelatedPosts(
    postId: string,
    categoryId: string | null,
    limit: number = 3,
  ): Promise<BlogPostSummary[]> {
    const now = new Date();
    const posts = Array.from(this.posts.values()).filter(
      (p) =>
        p.id !== postId &&
        p.status === "published" &&
        p.publishedAt &&
        p.publishedAt <= now &&
        (categoryId ? p.categoryId === categoryId : true),
    );
    posts.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
    return posts.slice(0, limit).map((p) => this.formatSummary(p));
  }

  async listAllPostsAdmin(query: ListBlogPostsQuery): Promise<ListBlogPostsResult> {
    let items = Array.from(this.posts.values());

    if (query.status) {
      items = items.filter((p) => p.status === query.status);
    }

    if (query.categoryId) {
      items = items.filter((p) => p.categoryId === query.categoryId);
    }

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.toLowerCase().trim();
      items = items.filter(
        (p) =>
          p.title.toLowerCase().includes(term) ||
          p.slug.toLowerCase().includes(term) ||
          (p.excerpt && p.excerpt.toLowerCase().includes(term)) ||
          p.content.toLowerCase().includes(term),
      );
    }

    const sortBy = query.sortBy || "createdAt";
    const sortOrder = query.sortOrder || "desc";

    items.sort((a, b) => {
      let valA: number | string = 0;
      let valB: number | string = 0;

      if (sortBy === "publishedAt") {
        valA = a.publishedAt ? a.publishedAt.getTime() : 0;
        valB = b.publishedAt ? b.publishedAt.getTime() : 0;
      } else if (sortBy === "viewCount") {
        valA = a.viewCount;
        valB = b.viewCount;
      } else if (sortBy === "createdAt") {
        valA = a.createdAt.getTime();
        valB = b.createdAt.getTime();
      } else if (sortBy === "title") {
        valA = a.title;
        valB = b.title;
      }

      if (sortOrder === "asc") {
        return valA > valB ? 1 : valA < valB ? -1 : 0;
      }
      return valA < valB ? 1 : valA > valB ? -1 : 0;
    });

    const page = Math.max(1, query.page || 1);
    const pageSize = Math.max(1, query.pageSize || 10);
    const totalCount = items.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const paginated = items.slice((page - 1) * pageSize, page * pageSize);

    const summaries: BlogPostSummary[] = paginated.map((p) =>
      this.formatSummary(p),
    );

    return {
      posts: summaries,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }

  async getPostByIdAdmin(id: string): Promise<BlogPostWithDetails | null> {
    const post = this.posts.get(id);
    if (!post) return null;
    return this.formatDetails(post);
  }

  async getPostBySlugAdmin(slug: string): Promise<BlogPostWithDetails | null> {
    const post = Array.from(this.posts.values()).find((p) => p.slug === slug);
    if (!post) return null;
    return this.formatDetails(post);
  }

  async getAdminStats(): Promise<AdminBlogStats> {
    const posts = Array.from(this.posts.values());
    const totalPosts = posts.length;
    const publishedPosts = posts.filter((p) => p.status === "published").length;
    const draftPosts = posts.filter((p) => p.status === "draft").length;
    const totalViews = posts.reduce((acc, p) => acc + p.viewCount, 0);

    return {
      totalPosts,
      publishedPosts,
      draftPosts,
      totalViews,
    };
  }

  async createPost(authorId: string, input: CreateBlogPostInput): Promise<BlogPostWithDetails> {
    const now = new Date();
    const id = randomUUID();
    const slug = input.slug || `post-${id.slice(0, 8)}`;

    let publishedAtDate: Date | null = null;
    if (input.status === "published") {
      publishedAtDate = input.publishedAt ? new Date(input.publishedAt) : now;
    } else if (input.publishedAt) {
      publishedAtDate = new Date(input.publishedAt);
    }

    const post: BlogPostRecord = {
      id,
      title: input.title,
      slug,
      excerpt: input.excerpt || null,
      content: input.content,
      featuredImage: input.featuredImage || null,
      status: input.status || "draft",
      authorId: authorId || null,
      categoryId: input.categoryId || null,
      viewCount: 0,
      readingTimeMinutes: input.readingTimeMinutes || 5,
      seoTitle: input.seoTitle || null,
      seoDescription: input.seoDescription || null,
      canonicalUrl: input.canonicalUrl || null,
      publishedAt: publishedAtDate,
      createdAt: now,
      updatedAt: now,
    };

    this.posts.set(id, post);

    if (input.tagNames && input.tagNames.length > 0) {
      const tags = await this.getOrCreateTags(input.tagNames);
      for (const tag of tags) {
        this.postTags.push({ postId: id, tagId: tag.id });
      }
    }

    return this.formatDetails(post);
  }

  async updatePost(id: string, input: UpdateBlogPostInput): Promise<BlogPostWithDetails> {
    const post = this.posts.get(id);
    if (!post) throw new Error(`Post with id ${id} not found`);

    const now = new Date();
    if (input.title !== undefined) post.title = input.title;
    if (input.slug !== undefined) post.slug = input.slug;
    if (input.excerpt !== undefined) post.excerpt = input.excerpt;
    if (input.content !== undefined) post.content = input.content;
    if (input.featuredImage !== undefined) post.featuredImage = input.featuredImage;
    if (input.status !== undefined) {
      post.status = input.status;
      if (input.status === "published" && !post.publishedAt) {
        post.publishedAt = now;
      }
    }
    if (input.categoryId !== undefined) post.categoryId = input.categoryId;
    if (input.readingTimeMinutes !== undefined) post.readingTimeMinutes = input.readingTimeMinutes;
    if (input.seoTitle !== undefined) post.seoTitle = input.seoTitle;
    if (input.seoDescription !== undefined) post.seoDescription = input.seoDescription;
    if (input.canonicalUrl !== undefined) post.canonicalUrl = input.canonicalUrl;
    if (input.publishedAt !== undefined) {
      post.publishedAt = input.publishedAt ? new Date(input.publishedAt) : null;
    }
    post.updatedAt = now;

    if (input.tagNames !== undefined) {
      this.postTags = this.postTags.filter((pt) => pt.postId !== id);
      if (input.tagNames.length > 0) {
        const tags = await this.getOrCreateTags(input.tagNames);
        for (const tag of tags) {
          this.postTags.push({ postId: id, tagId: tag.id });
        }
      }
    }

    this.posts.set(id, post);
    return this.formatDetails(post);
  }

  async deletePost(id: string): Promise<boolean> {
    const exists = this.posts.has(id);
    if (!exists) return false;
    this.posts.delete(id);
    this.postTags = this.postTags.filter((pt) => pt.postId !== id);
    return true;
  }

  async publishPost(id: string): Promise<BlogPostWithDetails> {
    const post = this.posts.get(id);
    if (!post) throw new Error(`Post with id ${id} not found`);
    const now = new Date();
    post.status = "published";
    if (!post.publishedAt) {
      post.publishedAt = now;
    }
    post.updatedAt = now;
    this.posts.set(id, post);
    return this.formatDetails(post);
  }

  async unpublishPost(id: string): Promise<BlogPostWithDetails> {
    const post = this.posts.get(id);
    if (!post) throw new Error(`Post with id ${id} not found`);
    const now = new Date();
    post.status = "draft";
    post.updatedAt = now;
    this.posts.set(id, post);
    return this.formatDetails(post);
  }

  async createCategory(
    name: string,
    slug: string,
    description?: string,
    sortOrder: number = 0,
  ): Promise<BlogCategoryRecord> {
    const now = new Date();
    const id = randomUUID();
    const cat: BlogCategoryRecord = {
      id,
      name,
      slug,
      description: description || null,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    };
    this.categories.set(id, cat);
    return cat;
  }

  async updateCategory(
    id: string,
    name: string,
    slug: string,
    description?: string,
    sortOrder?: number,
  ): Promise<BlogCategoryRecord> {
    const cat = this.categories.get(id);
    if (!cat) throw new Error(`Category with id ${id} not found`);
    const now = new Date();
    cat.name = name;
    cat.slug = slug;
    if (description !== undefined) cat.description = description || null;
    if (sortOrder !== undefined) cat.sortOrder = sortOrder;
    cat.updatedAt = now;
    this.categories.set(id, cat);
    return cat;
  }

  async deleteCategory(id: string): Promise<boolean> {
    const exists = this.categories.has(id);
    if (!exists) return false;
    this.categories.delete(id);
    for (const post of this.posts.values()) {
      if (post.categoryId === id) {
        post.categoryId = null;
      }
    }
    return true;
  }

  async getOrCreateTags(tagNames: string[]): Promise<BlogTagRecord[]> {
    const result: BlogTagRecord[] = [];
    const now = new Date();

    for (const name of tagNames) {
      const cleanName = name.trim();
      if (!cleanName) continue;
      const cleanSlug = cleanName.toLowerCase().replace(/[\s_]+/g, "-");

      let existing = Array.from(this.tags.values()).find(
        (t) => t.name.toLowerCase() === cleanName.toLowerCase() || t.slug === cleanSlug,
      );

      if (!existing) {
        existing = {
          id: randomUUID(),
          name: cleanName,
          slug: cleanSlug,
          createdAt: now,
          updatedAt: now,
        };
        this.tags.set(existing.id, existing);
      }

      result.push(existing);
    }

    return result;
  }

  private formatSummary(p: BlogPostRecord): BlogPostSummary {
    const category = p.categoryId ? this.categories.get(p.categoryId) : null;
    const tagIds = this.postTags.filter((pt) => pt.postId === p.id).map((pt) => pt.tagId);
    const tags = tagIds.map((tid) => this.tags.get(tid)).filter(Boolean) as BlogTagRecord[];

    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      excerpt: p.excerpt,
      featuredImage: p.featuredImage,
      status: p.status,
      viewCount: p.viewCount,
      readingTimeMinutes: p.readingTimeMinutes,
      publishedAt: p.publishedAt,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
      author: p.authorId ? { id: p.authorId, name: "نویسنده آوانا" } : null,
      tags: tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
    };
  }

  private formatDetails(p: BlogPostRecord): BlogPostWithDetails {
    const category = p.categoryId ? this.categories.get(p.categoryId) ?? null : null;
    const tagIds = this.postTags.filter((pt) => pt.postId === p.id).map((pt) => pt.tagId);
    const tags = tagIds.map((tid) => this.tags.get(tid)).filter(Boolean) as BlogTagRecord[];

    return {
      ...p,
      author: p.authorId ? { id: p.authorId, name: "نویسنده آوانا" } : null,
      category,
      tags,
    };
  }
}
