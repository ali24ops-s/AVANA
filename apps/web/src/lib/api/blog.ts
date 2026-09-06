/**
 * Typed API calls for AVANA Educational Blog (Public & Admin).
 */

import type { ApiClient } from "./client.js";

export type BlogPostStatus = "draft" | "published";

export interface BlogCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  postCount?: number;
}

export interface BlogTag {
  id: string;
  name: string;
  slug: string;
}

export interface BlogPostSummary {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  featuredImage: string | null;
  status: BlogPostStatus;
  viewCount: number;
  readingTimeMinutes: number;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string; slug: string } | null;
  author: { id: string; name: string } | null;
  tags: { id: string; name: string; slug: string }[];
}

export interface BlogPostDetail extends BlogPostSummary {
  content: string;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  relatedPosts?: BlogPostSummary[];
}

export interface ListBlogPostsResponse {
  posts: BlogPostSummary[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AdminBlogStats {
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  totalViews: number;
}

export interface CreateBlogPostRequest {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  featuredImage?: string;
  status?: BlogPostStatus;
  categoryId?: string;
  tagNames?: string[];
  readingTimeMinutes?: number;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  publishedAt?: string | null;
}

export interface UpdateBlogPostRequest {
  title?: string;
  slug?: string;
  excerpt?: string;
  content?: string;
  featuredImage?: string | null;
  status?: BlogPostStatus;
  categoryId?: string | null;
  tagNames?: string[];
  readingTimeMinutes?: number;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  publishedAt?: string | null;
}

export function createBlogApi(client: ApiClient) {
  return {
    // -----------------------------------------------------------------------
    // Public Endpoints
    // -----------------------------------------------------------------------

    /**
     * List published blog posts with pagination, search and filters.
     */
    async getPublishedPosts(params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      category?: string;
      tag?: string;
      sortBy?: "publishedAt" | "viewCount" | "createdAt" | "title";
      sortOrder?: "asc" | "desc";
    }): Promise<ListBlogPostsResponse> {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize));
      if (params?.search) searchParams.set("search", params.search);
      if (params?.category) searchParams.set("category", params.category);
      if (params?.tag) searchParams.set("tag", params.tag);
      if (params?.sortBy) searchParams.set("sortBy", params.sortBy);
      if (params?.sortOrder) searchParams.set("sortOrder", params.sortOrder);

      const qs = searchParams.toString();
      return client.get<ListBlogPostsResponse>(`/v1/blog/posts${qs ? `?${qs}` : ""}`);
    },

    /**
     * Get published article by slug.
     */
    async getPostBySlug(slug: string): Promise<{ post: BlogPostDetail }> {
      return client.get<{ post: BlogPostDetail }>(`/v1/blog/posts/${encodeURIComponent(slug)}`);
    },

    /**
     * List all categories with counts.
     */
    async getCategories(): Promise<{ categories: BlogCategory[] }> {
      return client.get<{ categories: BlogCategory[] }>("/v1/blog/categories");
    },

    /**
     * Get category by slug and its articles.
     */
    async getCategoryBySlug(
      slug: string,
      params?: { page?: number; pageSize?: number },
    ): Promise<{ category: BlogCategory } & ListBlogPostsResponse> {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize));
      const qs = searchParams.toString();
      return client.get<{ category: BlogCategory } & ListBlogPostsResponse>(
        `/v1/blog/categories/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`,
      );
    },

    /**
     * List tags.
     */
    async getTags(): Promise<{ tags: BlogTag[] }> {
      return client.get<{ tags: BlogTag[] }>("/v1/blog/tags");
    },

    // -----------------------------------------------------------------------
    // Admin Endpoints (Require platform_admin)
    // -----------------------------------------------------------------------

    /**
     * Get admin stats.
     */
    async getAdminStats(): Promise<{ stats: AdminBlogStats }> {
      return client.get<{ stats: AdminBlogStats }>("/v1/admin/blog/stats");
    },

    /**
     * List all posts in admin CMS (draft + published).
     */
    async getAdminPosts(params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: "draft" | "published" | "all";
      categoryId?: string;
      sortBy?: "publishedAt" | "viewCount" | "createdAt" | "title";
      sortOrder?: "asc" | "desc";
    }): Promise<ListBlogPostsResponse> {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize));
      if (params?.search) searchParams.set("search", params.search);
      if (params?.status) searchParams.set("status", params.status);
      if (params?.categoryId) searchParams.set("categoryId", params.categoryId);
      if (params?.sortBy) searchParams.set("sortBy", params.sortBy);
      if (params?.sortOrder) searchParams.set("sortOrder", params.sortOrder);

      const qs = searchParams.toString();
      return client.get<ListBlogPostsResponse>(`/v1/admin/blog/posts${qs ? `?${qs}` : ""}`);
    },

    /**
     * Get post by ID for admin edit.
     */
    async getAdminPostById(id: string): Promise<{ post: BlogPostDetail }> {
      return client.get<{ post: BlogPostDetail }>(`/v1/admin/blog/posts/${id}`);
    },

    /**
     * Get preview of post for admin.
     */
    async getAdminPostPreview(id: string): Promise<{ post: BlogPostDetail }> {
      return client.get<{ post: BlogPostDetail }>(`/v1/admin/blog/posts/${id}/preview`);
    },

    /**
     * Create new blog post.
     */
    async createPost(data: CreateBlogPostRequest): Promise<{ post: BlogPostDetail }> {
      return client.post<{ post: BlogPostDetail }>("/v1/admin/blog/posts", data);
    },

    /**
     * Update existing blog post.
     */
    async updatePost(id: string, data: UpdateBlogPostRequest): Promise<{ post: BlogPostDetail }> {
      return client.patch<{ post: BlogPostDetail }>(`/v1/admin/blog/posts/${id}`, data);
    },

    /**
     * Delete post.
     */
    async deletePost(id: string): Promise<{ success: boolean }> {
      return client.delete<{ success: boolean }>(`/v1/admin/blog/posts/${id}`);
    },

    /**
     * Publish post.
     */
    async publishPost(id: string): Promise<{ post: BlogPostDetail }> {
      return client.post<{ post: BlogPostDetail }>(`/v1/admin/blog/posts/${id}/publish`);
    },

    /**
     * Unpublish post (revert to draft).
     */
    async unpublishPost(id: string): Promise<{ post: BlogPostDetail }> {
      return client.post<{ post: BlogPostDetail }>(`/v1/admin/blog/posts/${id}/unpublish`);
    },

    /**
     * Admin categories list.
     */
    async getAdminCategories(): Promise<{ categories: BlogCategory[] }> {
      return client.get<{ categories: BlogCategory[] }>("/v1/admin/blog/categories");
    },

    /**
     * Admin create category.
     */
    async createCategory(data: {
      name: string;
      slug?: string;
      description?: string;
      sortOrder?: number;
    }): Promise<{ category: BlogCategory }> {
      return client.post<{ category: BlogCategory }>("/v1/admin/blog/categories", data);
    },

    /**
     * Admin update category.
     */
    async updateCategory(
      id: string,
      data: { name: string; slug?: string; description?: string; sortOrder?: number },
    ): Promise<{ category: BlogCategory }> {
      return client.patch<{ category: BlogCategory }>(`/v1/admin/blog/categories/${id}`, data);
    },

    /**
     * Admin delete category.
     */
    async deleteCategory(id: string): Promise<{ success: boolean }> {
      return client.delete<{ success: boolean }>(`/v1/admin/blog/categories/${id}`);
    },
  };
}

export type BlogApi = ReturnType<typeof createBlogApi>;
