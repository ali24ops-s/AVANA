/**
 * Blog Domain and Data Transfer Types.
 */

export type BlogPostStatus = "draft" | "published";

export interface BlogCategoryRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  postCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BlogTagRecord {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BlogPostAuthor {
  id: string;
  name: string;
  email?: string;
}

export interface BlogPostRecord {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  featuredImage: string | null;
  status: BlogPostStatus;
  authorId: string | null;
  categoryId: string | null;
  viewCount: number;
  readingTimeMinutes: number;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BlogPostWithDetails extends BlogPostRecord {
  author: BlogPostAuthor | null;
  category: BlogCategoryRecord | null;
  tags: BlogTagRecord[];
  relatedPosts?: BlogPostSummary[];
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
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  category: { id: string; name: string; slug: string } | null;
  author: { id: string; name: string } | null;
  tags: { id: string; name: string; slug: string }[];
}

export interface ListBlogPostsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  categorySlug?: string;
  categoryId?: string;
  tagSlug?: string;
  status?: BlogPostStatus;
  sortBy?: "publishedAt" | "viewCount" | "createdAt" | "title";
  sortOrder?: "asc" | "desc";
}

export interface ListBlogPostsResult {
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

export interface CreateBlogPostInput {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  featuredImage?: string;
  status?: BlogPostStatus;
  authorId?: string;
  categoryId?: string;
  tagNames?: string[];
  readingTimeMinutes?: number;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  publishedAt?: Date | string | null;
}

export interface UpdateBlogPostInput {
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
  publishedAt?: Date | string | null;
}
