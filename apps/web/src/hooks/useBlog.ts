/**
 * React Query hooks for AVANA Educational Blog (Public & Admin).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import {
  createBlogApi,
  type CreateBlogPostRequest,
  type UpdateBlogPostRequest,
} from "../lib/api/blog.js";

function getBlogApi() {
  const client = createApiClient({ baseUrl: getApiBaseUrl() });
  return createBlogApi(client);
}

// ---------------------------------------------------------------------------
// Public Blog Hooks
// ---------------------------------------------------------------------------

export function usePublicBlogPosts(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  category?: string;
  tag?: string;
  sortBy?: "publishedAt" | "viewCount" | "createdAt" | "title";
  sortOrder?: "asc" | "desc";
}) {
  const api = getBlogApi();
  return useQuery({
    queryKey: [
      "public-blog-posts",
      params?.page ?? 1,
      params?.pageSize ?? 10,
      params?.search ?? "",
      params?.category ?? "",
      params?.tag ?? "",
      params?.sortBy ?? "publishedAt",
      params?.sortOrder ?? "desc",
    ],
    queryFn: () => api.getPublishedPosts(params),
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });
}

export function usePublicBlogPost(slug: string | undefined | null) {
  const api = getBlogApi();
  return useQuery({
    queryKey: ["public-blog-post", slug],
    queryFn: () => api.getPostBySlug(slug!),
    enabled: Boolean(slug && slug.trim().length > 0),
    staleTime: 60_000,
  });
}

export function useBlogCategories() {
  const api = getBlogApi();
  return useQuery({
    queryKey: ["blog-categories"],
    queryFn: () => api.getCategories(),
    staleTime: 60_000,
  });
}

export function useCategoryWithPosts(
  slug: string | undefined | null,
  params?: { page?: number; pageSize?: number },
) {
  const api = getBlogApi();
  return useQuery({
    queryKey: ["blog-category-posts", slug, params?.page ?? 1, params?.pageSize ?? 10],
    queryFn: () => api.getCategoryBySlug(slug!, params),
    enabled: Boolean(slug && slug.trim().length > 0),
    staleTime: 30_000,
  });
}

export function useBlogTags() {
  const api = getBlogApi();
  return useQuery({
    queryKey: ["blog-tags"],
    queryFn: () => api.getTags(),
    staleTime: 60_000,
  });
}

// ---------------------------------------------------------------------------
// Admin Blog Hooks
// ---------------------------------------------------------------------------

export function useAdminBlogStats() {
  const api = getBlogApi();
  return useQuery({
    queryKey: ["admin-blog-stats"],
    queryFn: () => api.getAdminStats(),
    staleTime: 15_000,
  });
}

export function useAdminBlogPosts(params?: {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: "draft" | "published" | "all";
  categoryId?: string;
  sortBy?: "publishedAt" | "viewCount" | "createdAt" | "title";
  sortOrder?: "asc" | "desc";
}) {
  const api = getBlogApi();
  return useQuery({
    queryKey: [
      "admin-blog-posts",
      params?.page ?? 1,
      params?.pageSize ?? 20,
      params?.search ?? "",
      params?.status ?? "all",
      params?.categoryId ?? "",
      params?.sortBy ?? "createdAt",
      params?.sortOrder ?? "desc",
    ],
    queryFn: () => api.getAdminPosts(params),
    placeholderData: (previousData) => previousData,
    staleTime: 10_000,
  });
}

export function useAdminBlogPost(id: string | undefined | null) {
  const api = getBlogApi();
  return useQuery({
    queryKey: ["admin-blog-post", id],
    queryFn: () => api.getAdminPostById(id!),
    enabled: Boolean(id && id.trim().length > 0),
    staleTime: 10_000,
  });
}

export function useAdminBlogPostPreview(id: string | undefined | null) {
  const api = getBlogApi();
  return useQuery({
    queryKey: ["admin-blog-post-preview", id],
    queryFn: () => api.getAdminPostPreview(id!),
    enabled: Boolean(id && id.trim().length > 0),
    staleTime: 5_000,
  });
}

export function useAdminBlogCategories() {
  const api = getBlogApi();
  return useQuery({
    queryKey: ["admin-blog-categories"],
    queryFn: () => api.getAdminCategories(),
    staleTime: 30_000,
  });
}

export function useCreateBlogPost() {
  const queryClient = useQueryClient();
  const api = getBlogApi();

  return useMutation({
    mutationFn: (data: CreateBlogPostRequest) => api.createPost(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-blog-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["public-blog-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["blog-categories"] });
    },
  });
}

export function useUpdateBlogPost() {
  const queryClient = useQueryClient();
  const api = getBlogApi();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateBlogPostRequest }) =>
      api.updatePost(id, data),
    onSuccess: (_, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-blog-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-blog-post", variables.id] });
      void queryClient.invalidateQueries({ queryKey: ["public-blog-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["public-blog-post"] });
      void queryClient.invalidateQueries({ queryKey: ["blog-categories"] });
    },
  });
}

export function useDeleteBlogPost() {
  const queryClient = useQueryClient();
  const api = getBlogApi();

  return useMutation({
    mutationFn: (id: string) => api.deletePost(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-blog-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["public-blog-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["blog-categories"] });
    },
  });
}

export function usePublishBlogPost() {
  const queryClient = useQueryClient();
  const api = getBlogApi();

  return useMutation({
    mutationFn: (id: string) => api.publishPost(id),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-blog-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-blog-post", id] });
      void queryClient.invalidateQueries({ queryKey: ["public-blog-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["blog-categories"] });
    },
  });
}

export function useUnpublishBlogPost() {
  const queryClient = useQueryClient();
  const api = getBlogApi();

  return useMutation({
    mutationFn: (id: string) => api.unpublishPost(id),
    onSuccess: (_, id) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-blog-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-blog-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-blog-post", id] });
      void queryClient.invalidateQueries({ queryKey: ["public-blog-posts"] });
      void queryClient.invalidateQueries({ queryKey: ["blog-categories"] });
    },
  });
}

export function useCreateBlogCategory() {
  const queryClient = useQueryClient();
  const api = getBlogApi();

  return useMutation({
    mutationFn: (data: { name: string; slug?: string; description?: string; sortOrder?: number }) =>
      api.createCategory(data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-blog-categories"] });
      void queryClient.invalidateQueries({ queryKey: ["blog-categories"] });
    },
  });
}
