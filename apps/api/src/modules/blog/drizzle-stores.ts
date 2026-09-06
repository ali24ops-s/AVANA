import { randomUUID } from "node:crypto";
import {
  eq,
  and,
  desc,
  asc,
  sql,
  inArray,
  like,
  or,
  lte,
  count,
} from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  blogCategories,
  blogTags,
  blogPosts,
  blogPostTags,
  users,
} from "@avana/database/schema";
import type {
  BlogStore,
} from "./blog-store.js";
import type {
  BlogCategoryRecord,
  BlogTagRecord,
  BlogPostWithDetails,
  BlogPostSummary,
  ListBlogPostsQuery,
  ListBlogPostsResult,
  AdminBlogStats,
  CreateBlogPostInput,
  UpdateBlogPostInput,
} from "./blog-types.js";

export class DrizzleBlogStore implements BlogStore {
  constructor(private readonly db: DbClient) {}

  async listPublishedPosts(query: ListBlogPostsQuery): Promise<ListBlogPostsResult> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.max(1, query.pageSize || 10);
    const offset = (page - 1) * pageSize;

    const conditions = [
      eq(blogPosts.status, "published"),
      lte(blogPosts.publishedAt, new Date()),
    ];

    if (query.categoryId) {
      conditions.push(eq(blogPosts.categoryId, query.categoryId));
    } else if (query.categorySlug) {
      const cat = await this.db
        .select({ id: blogCategories.id })
        .from(blogCategories)
        .where(eq(blogCategories.slug, query.categorySlug))
        .limit(1)
        .then((r) => r[0]);

      if (cat) {
        conditions.push(eq(blogPosts.categoryId, cat.id));
      } else {
        return { posts: [], totalCount: 0, page, pageSize, totalPages: 0 };
      }
    }

    if (query.tagSlug) {
      const tag = await this.db
        .select({ id: blogTags.id })
        .from(blogTags)
        .where(eq(blogTags.slug, query.tagSlug))
        .limit(1)
        .then((r) => r[0]);

      if (tag) {
        const postIds = await this.db
          .select({ postId: blogPostTags.postId })
          .from(blogPostTags)
          .where(eq(blogPostTags.tagId, tag.id));

        if (postIds.length > 0) {
          conditions.push(inArray(blogPosts.id, postIds.map((p) => p.postId)));
        } else {
          return { posts: [], totalCount: 0, page, pageSize, totalPages: 0 };
        }
      } else {
        return { posts: [], totalCount: 0, page, pageSize, totalPages: 0 };
      }
    }

    if (query.search && query.search.trim().length > 0) {
      const term = `%${query.search.trim()}%`;
      conditions.push(
        or(
          like(blogPosts.title, term),
          like(blogPosts.excerpt, term),
          like(blogPosts.content, term),
        )!,
      );
    }

    const whereClause = and(...conditions);

    // Count query
    const totalCountRes = await this.db
      .select({ count: count() })
      .from(blogPosts)
      .where(whereClause);
    const totalCount = Number(totalCountRes[0]?.count ?? 0);
    const totalPages = Math.ceil(totalCount / pageSize);

    // Sort order
    let orderBy = desc(blogPosts.publishedAt);
    if (query.sortBy === "viewCount") {
      orderBy = query.sortOrder === "asc" ? asc(blogPosts.viewCount) : desc(blogPosts.viewCount);
    } else if (query.sortBy === "createdAt") {
      orderBy = query.sortOrder === "asc" ? asc(blogPosts.createdAt) : desc(blogPosts.createdAt);
    } else if (query.sortBy === "title") {
      orderBy = query.sortOrder === "asc" ? asc(blogPosts.title) : desc(blogPosts.title);
    } else {
      orderBy = query.sortOrder === "asc" ? asc(blogPosts.publishedAt) : desc(blogPosts.publishedAt);
    }

    // Main records query
    const rows = await this.db
      .select({
        id: blogPosts.id,
        title: blogPosts.title,
        slug: blogPosts.slug,
        excerpt: blogPosts.excerpt,
        featuredImage: blogPosts.featuredImage,
        status: blogPosts.status,
        viewCount: blogPosts.viewCount,
        readingTimeMinutes: blogPosts.readingTimeMinutes,
        publishedAt: blogPosts.publishedAt,
        createdAt: blogPosts.createdAt,
        updatedAt: blogPosts.updatedAt,
        categoryId: blogPosts.categoryId,
        categoryName: blogCategories.name,
        categorySlug: blogCategories.slug,
        authorId: blogPosts.authorId,
        authorName: users.name,
      })
      .from(blogPosts)
      .leftJoin(blogCategories, eq(blogPosts.categoryId, blogCategories.id))
      .leftJoin(users, eq(blogPosts.authorId, users.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset(offset);

    // Fetch tags for returned posts
    const postIds = rows.map((r) => r.id);
    const tagsByPostId = await this.fetchTagsForPostIds(postIds);

    const summaries: BlogPostSummary[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt,
      featuredImage: r.featuredImage,
      status: r.status as "draft" | "published",
      viewCount: r.viewCount,
      readingTimeMinutes: r.readingTimeMinutes,
      publishedAt: r.publishedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      category: r.categoryId && r.categoryName && r.categorySlug ? {
        id: r.categoryId,
        name: r.categoryName,
        slug: r.categorySlug,
      } : null,
      author: r.authorId && r.authorName ? {
        id: r.authorId,
        name: r.authorName,
      } : null,
      tags: tagsByPostId.get(r.id) || [],
    }));

    return {
      posts: summaries,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }

  async getPublishedPostBySlug(slug: string): Promise<BlogPostWithDetails | null> {
    const post = await this.db
      .select({
        post: blogPosts,
        category: blogCategories,
        author: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(blogPosts)
      .leftJoin(blogCategories, eq(blogPosts.categoryId, blogCategories.id))
      .leftJoin(users, eq(blogPosts.authorId, users.id))
      .where(
        and(
          eq(blogPosts.slug, slug),
          eq(blogPosts.status, "published"),
          lte(blogPosts.publishedAt, new Date()),
        ),
      )
      .limit(1)
      .then((r) => r[0]);

    if (!post) return null;

    const tagsMap = await this.fetchTagsForPostIds([post.post.id]);
    const tags = tagsMap.get(post.post.id) || [];

    return {
      id: post.post.id,
      title: post.post.title,
      slug: post.post.slug,
      excerpt: post.post.excerpt,
      content: post.post.content,
      featuredImage: post.post.featuredImage,
      status: post.post.status as "draft" | "published",
      authorId: post.post.authorId,
      categoryId: post.post.categoryId,
      viewCount: post.post.viewCount,
      readingTimeMinutes: post.post.readingTimeMinutes,
      seoTitle: post.post.seoTitle,
      seoDescription: post.post.seoDescription,
      canonicalUrl: post.post.canonicalUrl,
      publishedAt: post.post.publishedAt,
      createdAt: post.post.createdAt,
      updatedAt: post.post.updatedAt,
      author: post.author && post.author.id ? {
        id: post.author.id,
        name: post.author.name,
        email: post.author.email,
      } : null,
      category: post.category ? {
        id: post.category.id,
        name: post.category.name,
        slug: post.category.slug,
        description: post.category.description,
        sortOrder: post.category.sortOrder,
        createdAt: post.category.createdAt,
        updatedAt: post.category.updatedAt,
      } : null,
      tags: tags.map((t) => ({ ...t, createdAt: new Date(), updatedAt: new Date() })),
    };
  }

  async incrementPostViewCount(id: string): Promise<void> {
    await this.db
      .update(blogPosts)
      .set({
        viewCount: sql`${blogPosts.viewCount} + 1`,
      })
      .where(eq(blogPosts.id, id));
  }

  async listCategoriesWithCounts(): Promise<BlogCategoryRecord[]> {
    const cats = await this.db
      .select({
        id: blogCategories.id,
        name: blogCategories.name,
        slug: blogCategories.slug,
        description: blogCategories.description,
        sortOrder: blogCategories.sortOrder,
        createdAt: blogCategories.createdAt,
        updatedAt: blogCategories.updatedAt,
      })
      .from(blogCategories)
      .orderBy(asc(blogCategories.sortOrder), asc(blogCategories.name));

    const counts = await this.db
      .select({
        categoryId: blogPosts.categoryId,
        count: count(),
      })
      .from(blogPosts)
      .where(
        and(
          eq(blogPosts.status, "published"),
          lte(blogPosts.publishedAt, new Date()),
        ),
      )
      .groupBy(blogPosts.categoryId);

    const countMap = new Map(counts.map((c) => [c.categoryId, Number(c.count)]));

    return cats.map((cat) => ({
      ...cat,
      postCount: countMap.get(cat.id) || 0,
    }));
  }

  async getCategoryBySlug(slug: string): Promise<BlogCategoryRecord | null> {
    const cat = await this.db
      .select()
      .from(blogCategories)
      .where(eq(blogCategories.slug, slug))
      .limit(1)
      .then((r) => r[0]);

    if (!cat) return null;

    const countRes = await this.db
      .select({ count: count() })
      .from(blogPosts)
      .where(
        and(
          eq(blogPosts.categoryId, cat.id),
          eq(blogPosts.status, "published"),
          lte(blogPosts.publishedAt, new Date()),
        ),
      );

    return {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description,
      sortOrder: cat.sortOrder,
      postCount: Number(countRes[0]?.count ?? 0),
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
    };
  }

  async listPopularTags(limit: number = 20): Promise<BlogTagRecord[]> {
    const tags = await this.db
      .select()
      .from(blogTags)
      .limit(limit);

    return tags.map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  async getRelatedPosts(
    postId: string,
    categoryId: string | null,
    limit: number = 3,
  ): Promise<BlogPostSummary[]> {
    const conditions = [
      eq(blogPosts.status, "published"),
      lte(blogPosts.publishedAt, new Date()),
      sql`${blogPosts.id} != ${postId}`,
    ];

    if (categoryId) {
      conditions.push(eq(blogPosts.categoryId, categoryId));
    }

    const rows = await this.db
      .select({
        id: blogPosts.id,
        title: blogPosts.title,
        slug: blogPosts.slug,
        excerpt: blogPosts.excerpt,
        featuredImage: blogPosts.featuredImage,
        status: blogPosts.status,
        viewCount: blogPosts.viewCount,
        readingTimeMinutes: blogPosts.readingTimeMinutes,
        publishedAt: blogPosts.publishedAt,
        createdAt: blogPosts.createdAt,
        updatedAt: blogPosts.updatedAt,
        categoryId: blogPosts.categoryId,
        categoryName: blogCategories.name,
        categorySlug: blogCategories.slug,
        authorId: blogPosts.authorId,
        authorName: users.name,
      })
      .from(blogPosts)
      .leftJoin(blogCategories, eq(blogPosts.categoryId, blogCategories.id))
      .leftJoin(users, eq(blogPosts.authorId, users.id))
      .where(and(...conditions))
      .orderBy(desc(blogPosts.publishedAt))
      .limit(limit);

    const postIds = rows.map((r) => r.id);
    const tagsByPostId = await this.fetchTagsForPostIds(postIds);

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt,
      featuredImage: r.featuredImage,
      status: r.status as "draft" | "published",
      viewCount: r.viewCount,
      readingTimeMinutes: r.readingTimeMinutes,
      publishedAt: r.publishedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      category: r.categoryId && r.categoryName && r.categorySlug ? {
        id: r.categoryId,
        name: r.categoryName,
        slug: r.categorySlug,
      } : null,
      author: r.authorId && r.authorName ? {
        id: r.authorId,
        name: r.authorName,
      } : null,
      tags: tagsByPostId.get(r.id) || [],
    }));
  }

  async listAllPostsAdmin(query: ListBlogPostsQuery): Promise<ListBlogPostsResult> {
    const page = Math.max(1, query.page || 1);
    const pageSize = Math.max(1, query.pageSize || 10);
    const offset = (page - 1) * pageSize;

    const conditions = [];

    if (query.status) {
      conditions.push(eq(blogPosts.status, query.status));
    }

    if (query.categoryId) {
      conditions.push(eq(blogPosts.categoryId, query.categoryId));
    }

    if (query.search && query.search.trim().length > 0) {
      const term = `%${query.search.trim()}%`;
      conditions.push(
        or(
          like(blogPosts.title, term),
          like(blogPosts.slug, term),
          like(blogPosts.excerpt, term),
          like(blogPosts.content, term),
        )!,
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const totalCountRes = await this.db
      .select({ count: count() })
      .from(blogPosts)
      .where(whereClause);
    const totalCount = Number(totalCountRes[0]?.count ?? 0);
    const totalPages = Math.ceil(totalCount / pageSize);

    let orderBy = desc(blogPosts.createdAt);
    if (query.sortBy === "publishedAt") {
      orderBy = query.sortOrder === "asc" ? asc(blogPosts.publishedAt) : desc(blogPosts.publishedAt);
    } else if (query.sortBy === "viewCount") {
      orderBy = query.sortOrder === "asc" ? asc(blogPosts.viewCount) : desc(blogPosts.viewCount);
    } else if (query.sortBy === "title") {
      orderBy = query.sortOrder === "asc" ? asc(blogPosts.title) : desc(blogPosts.title);
    } else {
      orderBy = query.sortOrder === "asc" ? asc(blogPosts.createdAt) : desc(blogPosts.createdAt);
    }

    const rows = await this.db
      .select({
        id: blogPosts.id,
        title: blogPosts.title,
        slug: blogPosts.slug,
        excerpt: blogPosts.excerpt,
        featuredImage: blogPosts.featuredImage,
        status: blogPosts.status,
        viewCount: blogPosts.viewCount,
        readingTimeMinutes: blogPosts.readingTimeMinutes,
        publishedAt: blogPosts.publishedAt,
        createdAt: blogPosts.createdAt,
        updatedAt: blogPosts.updatedAt,
        categoryId: blogPosts.categoryId,
        categoryName: blogCategories.name,
        categorySlug: blogCategories.slug,
        authorId: blogPosts.authorId,
        authorName: users.name,
      })
      .from(blogPosts)
      .leftJoin(blogCategories, eq(blogPosts.categoryId, blogCategories.id))
      .leftJoin(users, eq(blogPosts.authorId, users.id))
      .where(whereClause)
      .orderBy(orderBy)
      .limit(pageSize)
      .offset(offset);

    const postIds = rows.map((r) => r.id);
    const tagsByPostId = await this.fetchTagsForPostIds(postIds);

    const summaries: BlogPostSummary[] = rows.map((r) => ({
      id: r.id,
      title: r.title,
      slug: r.slug,
      excerpt: r.excerpt,
      featuredImage: r.featuredImage,
      status: r.status as "draft" | "published",
      viewCount: r.viewCount,
      readingTimeMinutes: r.readingTimeMinutes,
      publishedAt: r.publishedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      category: r.categoryId && r.categoryName && r.categorySlug ? {
        id: r.categoryId,
        name: r.categoryName,
        slug: r.categorySlug,
      } : null,
      author: r.authorId && r.authorName ? {
        id: r.authorId,
        name: r.authorName,
      } : null,
      tags: tagsByPostId.get(r.id) || [],
    }));

    return {
      posts: summaries,
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }

  async getPostByIdAdmin(id: string): Promise<BlogPostWithDetails | null> {
    const post = await this.db
      .select({
        post: blogPosts,
        category: blogCategories,
        author: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(blogPosts)
      .leftJoin(blogCategories, eq(blogPosts.categoryId, blogCategories.id))
      .leftJoin(users, eq(blogPosts.authorId, users.id))
      .where(eq(blogPosts.id, id))
      .limit(1)
      .then((r) => r[0]);

    if (!post) return null;

    const tagsMap = await this.fetchTagsForPostIds([post.post.id]);
    const tags = tagsMap.get(post.post.id) || [];

    return {
      id: post.post.id,
      title: post.post.title,
      slug: post.post.slug,
      excerpt: post.post.excerpt,
      content: post.post.content,
      featuredImage: post.post.featuredImage,
      status: post.post.status as "draft" | "published",
      authorId: post.post.authorId,
      categoryId: post.post.categoryId,
      viewCount: post.post.viewCount,
      readingTimeMinutes: post.post.readingTimeMinutes,
      seoTitle: post.post.seoTitle,
      seoDescription: post.post.seoDescription,
      canonicalUrl: post.post.canonicalUrl,
      publishedAt: post.post.publishedAt,
      createdAt: post.post.createdAt,
      updatedAt: post.post.updatedAt,
      author: post.author && post.author.id ? {
        id: post.author.id,
        name: post.author.name,
        email: post.author.email,
      } : null,
      category: post.category ? {
        id: post.category.id,
        name: post.category.name,
        slug: post.category.slug,
        description: post.category.description,
        sortOrder: post.category.sortOrder,
        createdAt: post.category.createdAt,
        updatedAt: post.category.updatedAt,
      } : null,
      tags: tags.map((t) => ({ ...t, createdAt: new Date(), updatedAt: new Date() })),
    };
  }

  async getPostBySlugAdmin(slug: string): Promise<BlogPostWithDetails | null> {
    const post = await this.db
      .select({
        post: blogPosts,
        category: blogCategories,
        author: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(blogPosts)
      .leftJoin(blogCategories, eq(blogPosts.categoryId, blogCategories.id))
      .leftJoin(users, eq(blogPosts.authorId, users.id))
      .where(eq(blogPosts.slug, slug))
      .limit(1)
      .then((r) => r[0]);

    if (!post) return null;

    const tagsMap = await this.fetchTagsForPostIds([post.post.id]);
    const tags = tagsMap.get(post.post.id) || [];

    return {
      id: post.post.id,
      title: post.post.title,
      slug: post.post.slug,
      excerpt: post.post.excerpt,
      content: post.post.content,
      featuredImage: post.post.featuredImage,
      status: post.post.status as "draft" | "published",
      authorId: post.post.authorId,
      categoryId: post.post.categoryId,
      viewCount: post.post.viewCount,
      readingTimeMinutes: post.post.readingTimeMinutes,
      seoTitle: post.post.seoTitle,
      seoDescription: post.post.seoDescription,
      canonicalUrl: post.post.canonicalUrl,
      publishedAt: post.post.publishedAt,
      createdAt: post.post.createdAt,
      updatedAt: post.post.updatedAt,
      author: post.author && post.author.id ? {
        id: post.author.id,
        name: post.author.name,
        email: post.author.email,
      } : null,
      category: post.category ? {
        id: post.category.id,
        name: post.category.name,
        slug: post.category.slug,
        description: post.category.description,
        sortOrder: post.category.sortOrder,
        createdAt: post.category.createdAt,
        updatedAt: post.category.updatedAt,
      } : null,
      tags: tags.map((t) => ({ ...t, createdAt: new Date(), updatedAt: new Date() })),
    };
  }

  async getAdminStats(): Promise<AdminBlogStats> {
    const totalCountRes = await this.db.select({ count: count() }).from(blogPosts);
    const totalPosts = Number(totalCountRes[0]?.count ?? 0);

    const pubCountRes = await this.db
      .select({ count: count() })
      .from(blogPosts)
      .where(eq(blogPosts.status, "published"));
    const publishedPosts = Number(pubCountRes[0]?.count ?? 0);

    const draftCountRes = await this.db
      .select({ count: count() })
      .from(blogPosts)
      .where(eq(blogPosts.status, "draft"));
    const draftPosts = Number(draftCountRes[0]?.count ?? 0);

    const viewsRes = await this.db
      .select({ totalViews: sql<number>`coalesce(sum(${blogPosts.viewCount}), 0)` })
      .from(blogPosts);
    const totalViews = Number(viewsRes[0]?.totalViews ?? 0);

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

    await this.db.insert(blogPosts).values({
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
    });

    if (input.tagNames && input.tagNames.length > 0) {
      const tags = await this.getOrCreateTags(input.tagNames);
      for (const tag of tags) {
        await this.db
          .insert(blogPostTags)
          .values({ postId: id, tagId: tag.id })
          .onConflictDoNothing();
      }
    }

    const created = await this.getPostByIdAdmin(id);
    if (!created) throw new Error("Failed to retrieve created blog post");
    return created;
  }

  async updatePost(id: string, input: UpdateBlogPostInput): Promise<BlogPostWithDetails> {
    const existing = await this.getPostByIdAdmin(id);
    if (!existing) throw new Error(`Blog post with id ${id} not found`);

    const now = new Date();
    const updates: Record<string, unknown> = {
      updatedAt: now,
    };

    if (input.title !== undefined) updates.title = input.title;
    if (input.slug !== undefined) updates.slug = input.slug;
    if (input.excerpt !== undefined) updates.excerpt = input.excerpt;
    if (input.content !== undefined) updates.content = input.content;
    if (input.featuredImage !== undefined) updates.featuredImage = input.featuredImage;
    if (input.status !== undefined) {
      updates.status = input.status;
      if (input.status === "published" && !existing.publishedAt) {
        updates.publishedAt = now;
      }
    }
    if (input.categoryId !== undefined) updates.categoryId = input.categoryId;
    if (input.readingTimeMinutes !== undefined) updates.readingTimeMinutes = input.readingTimeMinutes;
    if (input.seoTitle !== undefined) updates.seoTitle = input.seoTitle;
    if (input.seoDescription !== undefined) updates.seoDescription = input.seoDescription;
    if (input.canonicalUrl !== undefined) updates.canonicalUrl = input.canonicalUrl;
    if (input.publishedAt !== undefined) {
      updates.publishedAt = input.publishedAt ? new Date(input.publishedAt) : null;
    }

    await this.db.update(blogPosts).set(updates).where(eq(blogPosts.id, id));

    if (input.tagNames !== undefined) {
      await this.db.delete(blogPostTags).where(eq(blogPostTags.postId, id));
      if (input.tagNames.length > 0) {
        const tags = await this.getOrCreateTags(input.tagNames);
        for (const tag of tags) {
          await this.db
            .insert(blogPostTags)
            .values({ postId: id, tagId: tag.id })
            .onConflictDoNothing();
        }
      }
    }

    const updated = await this.getPostByIdAdmin(id);
    if (!updated) throw new Error("Failed to retrieve updated blog post");
    return updated;
  }

  async deletePost(id: string): Promise<boolean> {
    const res = await this.db.delete(blogPosts).where(eq(blogPosts.id, id));
    return (res as any)?.rowCount ? (res as any).rowCount > 0 : true;
  }

  async publishPost(id: string): Promise<BlogPostWithDetails> {
    const existing = await this.getPostByIdAdmin(id);
    if (!existing) throw new Error(`Blog post with id ${id} not found`);

    const now = new Date();
    await this.db
      .update(blogPosts)
      .set({
        status: "published",
        publishedAt: existing.publishedAt || now,
        updatedAt: now,
      })
      .where(eq(blogPosts.id, id));

    const updated = await this.getPostByIdAdmin(id);
    if (!updated) throw new Error("Failed to retrieve published blog post");
    return updated;
  }

  async unpublishPost(id: string): Promise<BlogPostWithDetails> {
    const existing = await this.getPostByIdAdmin(id);
    if (!existing) throw new Error(`Blog post with id ${id} not found`);

    const now = new Date();
    await this.db
      .update(blogPosts)
      .set({
        status: "draft",
        updatedAt: now,
      })
      .where(eq(blogPosts.id, id));

    const updated = await this.getPostByIdAdmin(id);
    if (!updated) throw new Error("Failed to retrieve unpublished blog post");
    return updated;
  }

  async createCategory(
    name: string,
    slug: string,
    description?: string,
    sortOrder: number = 0,
  ): Promise<BlogCategoryRecord> {
    const id = randomUUID();
    const now = new Date();

    await this.db.insert(blogCategories).values({
      id,
      name,
      slug,
      description: description || null,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    });

    return {
      id,
      name,
      slug,
      description: description || null,
      sortOrder,
      postCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  async updateCategory(
    id: string,
    name: string,
    slug: string,
    description?: string,
    sortOrder?: number,
  ): Promise<BlogCategoryRecord> {
    const now = new Date();
    const updates: Record<string, unknown> = {
      name,
      slug,
      updatedAt: now,
    };
    if (description !== undefined) updates.description = description || null;
    if (sortOrder !== undefined) updates.sortOrder = sortOrder;

    await this.db.update(blogCategories).set(updates).where(eq(blogCategories.id, id));

    const updated = await this.getCategoryBySlug(slug);
    if (!updated) throw new Error(`Failed to retrieve updated category ${id}`);
    return updated;
  }

  async deleteCategory(id: string): Promise<boolean> {
    await this.db.update(blogPosts).set({ categoryId: null }).where(eq(blogPosts.categoryId, id));
    const res = await this.db.delete(blogCategories).where(eq(blogCategories.id, id));
    return (res as any)?.rowCount ? (res as any).rowCount > 0 : true;
  }

  async getOrCreateTags(tagNames: string[]): Promise<BlogTagRecord[]> {
    const result: BlogTagRecord[] = [];
    const now = new Date();

    for (const name of tagNames) {
      const cleanName = name.trim();
      if (!cleanName) continue;
      const cleanSlug = cleanName
        .toLowerCase()
        .replace(/[^a-zA-Z0-9\u0600-\u06FF]+/g, "-")
        .replace(/^-+|-+$/g, "");

      let existing = await this.db
        .select()
        .from(blogTags)
        .where(or(eq(blogTags.name, cleanName), eq(blogTags.slug, cleanSlug)))
        .limit(1)
        .then((r) => r[0]);

      if (!existing) {
        const id = randomUUID();
        await this.db.insert(blogTags).values({
          id,
          name: cleanName,
          slug: cleanSlug || `tag-${id.slice(0, 6)}`,
          createdAt: now,
          updatedAt: now,
        }).onConflictDoNothing();

        existing = await this.db
          .select()
          .from(blogTags)
          .where(eq(blogTags.name, cleanName))
          .limit(1)
          .then((r) => r[0]);
      }

      if (existing) {
        result.push({
          id: existing.id,
          name: existing.name,
          slug: existing.slug,
          createdAt: existing.createdAt,
          updatedAt: existing.updatedAt,
        });
      }
    }

    return result;
  }

  private async fetchTagsForPostIds(
    postIds: string[],
  ): Promise<Map<string, { id: string; name: string; slug: string }[]>> {
    const map = new Map<string, { id: string; name: string; slug: string }[]>();
    if (postIds.length === 0) return map;

    const rows = await this.db
      .select({
        postId: blogPostTags.postId,
        tagId: blogTags.id,
        tagName: blogTags.name,
        tagSlug: blogTags.slug,
      })
      .from(blogPostTags)
      .innerJoin(blogTags, eq(blogPostTags.tagId, blogTags.id))
      .where(inArray(blogPostTags.postId, postIds));

    for (const row of rows) {
      if (!map.has(row.postId)) {
        map.set(row.postId, []);
      }
      map.get(row.postId)!.push({
        id: row.tagId,
        name: row.tagName,
        slug: row.tagSlug,
      });
    }

    return map;
  }
}
