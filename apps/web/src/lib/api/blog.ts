/**
 * Typed API calls for AVANA Educational Blog (Public & Admin).
 */

import type { ApiClient } from "./client.js";
import { generateUUID, getApiBaseUrl } from "./client.js";
import { ApiError } from "./errors.js";
import type { ErrorEnvelope } from "@avana/contracts";

export interface UploadBlogImageResponse {
  url: string;
  image_url: string;
  storage_key: string;
}

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
  postCount?: number;
  createdAt?: string;
  updatedAt?: string;
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

    /**
     * Get tag by slug and its articles.
     */
    async getTagBySlug(
      slug: string,
      params?: { page?: number; pageSize?: number },
    ): Promise<{ tag: BlogTag } & ListBlogPostsResponse> {
      const searchParams = new URLSearchParams();
      if (params?.page) searchParams.set("page", String(params.page));
      if (params?.pageSize) searchParams.set("pageSize", String(params.pageSize));
      const qs = searchParams.toString();
      return client.get<{ tag: BlogTag } & ListBlogPostsResponse>(
        `/v1/blog/tags/${encodeURIComponent(slug)}${qs ? `?${qs}` : ""}`,
      );
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

    /**
     * Admin tags list with counts.
     */
    async getAdminTags(params?: { search?: string }): Promise<{ tags: BlogTag[] }> {
      const searchParams = new URLSearchParams();
      if (params?.search) searchParams.set("search", params.search);
      const qs = searchParams.toString();
      return client.get<{ tags: BlogTag[] }>(`/v1/admin/blog/tags${qs ? `?${qs}` : ""}`);
    },

    /**
     * Admin create tag.
     */
    async createTag(data: { name: string; slug?: string }): Promise<{ tag: BlogTag }> {
      return client.post<{ tag: BlogTag }>("/v1/admin/blog/tags", data);
    },

    /**
     * Admin update tag.
     */
    async updateTag(
      id: string,
      data: { name: string; slug?: string },
    ): Promise<{ tag: BlogTag }> {
      return client.patch<{ tag: BlogTag }>(`/v1/admin/blog/tags/${id}`, data);
    },

    /**
     * Admin delete tag.
     */
    async deleteTag(id: string): Promise<{ success: boolean }> {
      return client.delete<{ success: boolean }>(`/v1/admin/blog/tags/${id}`);
    },

    /**
     * Admin upload blog image.
     */
    async uploadImage(file: File): Promise<UploadBlogImageResponse> {
      const formData = new FormData();
      formData.append("file", file, file.name);

      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/v1/admin/blog/images`, {
        method: "POST",
        headers: {
          "x-request-id": generateUUID(),
        },
        credentials: "include",
        body: formData,
      });

      let data: unknown;
      try {
        if (typeof response.text === "function") {
          const text = await response.text();
          data = text ? JSON.parse(text) : undefined;
        } else if (typeof response.json === "function") {
          data = await response.json();
        }
      } catch {
        data = null;
      }

      if (!response.ok) {
        if (
          data &&
          typeof data === "object" &&
          "error" in data &&
          data.error &&
          typeof (data as { error: unknown }).error === "object"
        ) {
          throw new ApiError(data as ErrorEnvelope);
        }
        const message =
          response.status === 413
            ? "حجم تصویر بیش از حد مجاز است (حداکثر ۵ مگابایت)."
            : (data as { message?: string })?.message ||
              "خطا در بارگذاری تصویر مقاله.";
        throw new Error(message);
      }

      return data as UploadBlogImageResponse;
    },
  };
}

export type BlogApi = ReturnType<typeof createBlogApi>;
