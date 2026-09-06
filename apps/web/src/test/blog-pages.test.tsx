import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BlogListPage } from "../pages/blog/BlogListPage.js";
import { BlogDetailPage } from "../pages/blog/BlogDetailPage.js";
import { BlogCategoryPage } from "../pages/blog/BlogCategoryPage.js";
import { AdminBlogListPage } from "../pages/admin/blog/AdminBlogListPage.js";
import { AdminBlogEditor } from "../components/admin/blog/AdminBlogEditor.js";
import * as useBlogModule from "../hooks/useBlog.js";

describe("Educational Blog Frontend Pages & Components Suite", () => {
  let queryClient: QueryClient;

  const mockCategories = [
    { id: "cat-1", name: "فارماکولوژی", slug: "pharmacology", description: "مباحث داروشناسی", sortOrder: 1, postCount: 3 },
    { id: "cat-2", name: "نکات امتحانی", slug: "exam-tips", description: "تکنیک‌های آزمون", sortOrder: 2, postCount: 2 },
  ];

  const mockPosts = [
    {
      id: "p-1",
      title: "چگونه فارماکولوژی بخوانیم؟",
      slug: "how-to-study-pharmacology",
      excerpt: "راهنمای مطالعه فعال برای دانشجویان داروسازی",
      featuredImage: "https://example.com/img1.jpg",
      status: "published" as const,
      viewCount: 150,
      readingTimeMinutes: 6,
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      category: { id: "cat-1", name: "فارماکولوژی", slug: "pharmacology" },
      author: { id: "u-1", name: "تیم علمی آوانا" },
      tags: [{ id: "t-1", name: "فارماکولوژی", slug: "pharmacology" }],
    },
    {
      id: "p-2",
      title: "آگونیست و آنتاگونیست چیست؟",
      slug: "agonist-vs-antagonist",
      excerpt: "بررسی فارماکودینامیک با مثال‌های دارویی",
      featuredImage: "https://example.com/img2.jpg",
      status: "published" as const,
      viewCount: 95,
      readingTimeMinutes: 5,
      publishedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      category: { id: "cat-1", name: "فارماکولوژی", slug: "pharmacology" },
      author: { id: "u-1", name: "تیم علمی آوانا" },
      tags: [{ id: "t-1", name: "فارماکولوژی", slug: "pharmacology" }],
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test("1. BlogListPage renders Hero, category filters, and article cards", () => {
    vi.spyOn(useBlogModule, "usePublicBlogPosts").mockReturnValue({
      data: {
        posts: mockPosts,
        totalCount: 2,
        page: 1,
        pageSize: 9,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    vi.spyOn(useBlogModule, "useBlogCategories").mockReturnValue({
      data: { categories: mockCategories },
      isLoading: false,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/blog"]}>
          <BlogListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Hero title
    expect(screen.getByText(/یادگیری عمیق، علمی و ساختاریافته/i)).toBeDefined();
    // Category pills
    expect(screen.getByText(/همه مقالات/i)).toBeDefined();
    expect(screen.getAllByText(/فارماکولوژی/i).length).toBeGreaterThan(0);
    // Article titles
    expect(screen.getByText("چگونه فارماکولوژی بخوانیم؟")).toBeDefined();
    expect(screen.getByText("آگونیست و آنتاگونیست چیست؟")).toBeDefined();
  });

  test("2. BlogDetailPage renders article content, TOC, and metadata", () => {
    const singlePost = {
      ...mockPosts[0],
      content: "## مقدمه\nاین یک متن تستی است.\n\n### مکانیسم اثر\nتوضیحات تکمیلی مکانیسم...",
      seoTitle: "چگونه فارماکولوژی بخوانیم؟",
      seoDescription: "راهنمای مطالعه فعال",
      canonicalUrl: null,
      relatedPosts: [mockPosts[1]],
    };

    vi.spyOn(useBlogModule, "usePublicBlogPost").mockReturnValue({
      data: { post: singlePost },
      isLoading: false,
      isError: false,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/blog/how-to-study-pharmacology"]}>
          <Routes>
            <Route path="/blog/:slug" element={<BlogDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Title and excerpt
    expect(screen.getAllByText("چگونه فارماکولوژی بخوانیم؟").length).toBeGreaterThan(0);
    expect(screen.getByText("راهنمای مطالعه فعال برای دانشجویان داروسازی")).toBeDefined();
    // Table of contents items
    expect(screen.getAllByText(/مقدمه/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/مکانیسم اثر/i).length).toBeGreaterThan(0);
    // Related post
    expect(screen.getByText("آگونیست و آنتاگونیست چیست؟")).toBeDefined();
  });

  test("3. BlogCategoryPage renders category title, description, and filtered posts", () => {
    vi.spyOn(useBlogModule, "useCategoryWithPosts").mockReturnValue({
      data: {
        category: mockCategories[0],
        posts: [mockPosts[0]],
        totalCount: 1,
        page: 1,
        pageSize: 12,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/blog/category/pharmacology"]}>
          <Routes>
            <Route path="/blog/category/:slug" element={<BlogCategoryPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getAllByText("فارماکولوژی").length).toBeGreaterThan(0);
    expect(screen.getByText("مباحث داروشناسی")).toBeDefined();
    expect(screen.getByText("چگونه فارماکولوژی بخوانیم؟")).toBeDefined();
  });

  test("4. AdminBlogListPage renders stats metrics and table with quick actions", () => {
    vi.spyOn(useBlogModule, "useAdminBlogStats").mockReturnValue({
      data: {
        stats: {
          totalPosts: 6,
          publishedPosts: 5,
          draftPosts: 1,
          totalViews: 1200,
        },
      },
    } as any);

    vi.spyOn(useBlogModule, "useAdminBlogCategories").mockReturnValue({
      data: { categories: mockCategories },
    } as any);

    vi.spyOn(useBlogModule, "useAdminBlogPosts").mockReturnValue({
      data: {
        posts: mockPosts,
        totalCount: 2,
        page: 1,
        pageSize: 15,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/admin/blog"]}>
          <AdminBlogListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Check stats metrics
    expect(screen.getByText("کل مقالات")).toBeDefined();
    expect(screen.getByText("مقالات منتشر شده")).toBeDefined();
    expect(screen.getByText("پیش‌نویس‌ها (Draft)")).toBeDefined();
    // Check table headers & posts
    expect(screen.getByText("عنوان و مشخصات مقاله")).toBeDefined();
    expect(screen.getByText("چگونه فارماکولوژی بخوانیم؟")).toBeDefined();
    expect(screen.getByText("افزودن مقاله جدید")).toBeDefined();
  });

  test("5. AdminBlogEditor allows editing content and validates mandatory fields", () => {
    const onSaveMock = vi.fn();
    const onPublishMock = vi.fn();

    render(
      <MemoryRouter>
        <AdminBlogEditor
          categories={mockCategories}
          isSaving={false}
          onSave={onSaveMock}
          onPublish={onPublishMock}
        />
      </MemoryRouter>,
    );

    // Save with empty title/content triggers validation error
    const saveButton = screen.getByText(/ذخیره پیش‌نویس/i);
    fireEvent.click(saveButton);

    expect(screen.getByText("عنوان مقاله الزامی است.")).toBeDefined();
    expect(onSaveMock).not.toHaveBeenCalled();

    // Fill title and content
    const titleInput = screen.getByPlaceholderText(/مثلاً: چگونه برای امتحان فارماکولوژی بهتر درس بخوانیم؟/i);
    fireEvent.change(titleInput, { target: { value: "مقاله جدید تستی" } });

    const contentTextarea = screen.getByPlaceholderText(/محتوای مقاله را با فرمت Markdown بنویسید.../i);
    fireEvent.change(contentTextarea, { target: { value: "## تیتر تست\nمتن بدنه تست" } });

    fireEvent.click(saveButton);
    expect(onSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "مقاله جدید تستی",
        content: "## تیتر تست\nمتن بدنه تست",
        status: "draft",
      }),
    );
  });
});
