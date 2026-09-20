import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BlogListPage } from "../pages/blog/BlogListPage.js";
import { BlogDetailPage } from "../pages/blog/BlogDetailPage.js";
import { BlogCategoryPage } from "../pages/blog/BlogCategoryPage.js";
import { BlogTagPage } from "../pages/blog/BlogTagPage.js";
import { AdminBlogListPage } from "../pages/admin/blog/AdminBlogListPage.js";
import { AdminBlogEditor } from "../components/admin/blog/AdminBlogEditor.js";
import { AdminBlogCategoriesManager } from "../components/admin/blog/AdminBlogCategoriesManager.js";
import { AdminBlogTagsManager } from "../components/admin/blog/AdminBlogTagsManager.js";
import * as useBlogModule from "../hooks/useBlog.js";

describe("Educational Blog Frontend Pages & Components Suite", () => {
  let queryClient: QueryClient;

  const mockCategories = [
    { id: "cat-1", name: "فارماکولوژی", slug: "pharmacology", description: "مباحث داروشناسی", sortOrder: 1, postCount: 3 },
    { id: "cat-2", name: "نکات امتحانی", slug: "exam-tips", description: "تکنیک‌های آزمون", sortOrder: 2, postCount: 2 },
  ];

  const mockTags = [
    { id: "t-1", name: "فارماکولوژی", slug: "pharmacology", postCount: 3, createdAt: new Date().toISOString() },
    { id: "t-2", name: "قلب و عروق", slug: "cardiovascular", postCount: 1, createdAt: new Date().toISOString() },
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

  test("2. BlogListPage handles active tag query param correctly", () => {
    const mockUsePosts = vi.spyOn(useBlogModule, "usePublicBlogPosts").mockReturnValue({
      data: {
        posts: [mockPosts[0]],
        totalCount: 1,
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
        <MemoryRouter initialEntries={["/blog?tag=pharmacology"]}>
          <BlogListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(mockUsePosts).toHaveBeenCalledWith(
      expect.objectContaining({ tag: "pharmacology" }),
    );
    expect(screen.getAllByText(/فیلتر برچسب: #pharmacology/i).length).toBeGreaterThan(0);
  });

  test("3. BlogDetailPage renders article content, TOC, and clickable tag links", () => {
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
    // Clickable tag link
    const tagLink = screen.getByRole("link", { name: "#فارماکولوژی" });
    expect(tagLink.getAttribute("href")).toBe("/blog/tag/pharmacology");
    // Related post
    expect(screen.getByText("آگونیست و آنتاگونیست چیست؟")).toBeDefined();
  });

  test("4. BlogCategoryPage renders category title, description, and filtered posts", () => {
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

  test("5. BlogTagPage renders tag archive title, badge, and posts", () => {
    vi.spyOn(useBlogModule, "useTagWithPosts").mockReturnValue({
      data: {
        tag: mockTags[0],
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
        <MemoryRouter initialEntries={["/blog/tag/pharmacology"]}>
          <Routes>
            <Route path="/blog/tag/:slug" element={<BlogTagPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getAllByText(/#فارماکولوژی/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/آرشیو تمام مقالات علمی و آموزشی/i)).toBeDefined();
    expect(screen.getByText("چگونه فارماکولوژی بخوانیم؟")).toBeDefined();
  });

  test("6. AdminBlogListPage renders tabs and switches between posts, categories, and tags", () => {
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

    vi.spyOn(useBlogModule, "useAdminBlogTags").mockReturnValue({
      data: { tags: mockTags },
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

    // Check tabs
    expect(screen.getByRole("button", { name: /مقالات \(/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /دسته‌بندی‌ها/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /برچسب‌ها \(Tags\)/i })).toBeDefined();

    // Check stats metrics
    expect(screen.getByText("کل مقالات")).toBeDefined();
    expect(screen.getByText("چگونه فارماکولوژی بخوانیم؟")).toBeDefined();

    // Switch to categories tab
    fireEvent.click(screen.getByRole("button", { name: /دسته‌بندی‌ها/i }));
    expect(screen.getByText("مدیریت دسته‌بندی‌های وبلاگ")).toBeDefined();

    // Switch to tags tab
    fireEvent.click(screen.getByRole("button", { name: /برچسب‌ها \(Tags\)/i }));
    expect(screen.getByText("مدیریت برچسب‌های وبلاگ (Tags)")).toBeDefined();
  });

  test("7. AdminBlogCategoriesManager allows opening create modal", () => {
    vi.spyOn(useBlogModule, "useAdminBlogCategories").mockReturnValue({
      data: { categories: mockCategories },
      isLoading: false,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminBlogCategoriesManager />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("فارماکولوژی")).toBeDefined();
    expect(screen.getByText("نکات امتحانی")).toBeDefined();

    // Click create category button
    fireEvent.click(screen.getByText("افزودن دسته‌بندی جدید"));
    expect(screen.getAllByText("افزودن دسته‌بندی جدید").length).toBeGreaterThan(0);
  });

  test("8. AdminBlogTagsManager allows opening create modal", () => {
    vi.spyOn(useBlogModule, "useAdminBlogTags").mockReturnValue({
      data: { tags: mockTags },
      isLoading: false,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminBlogTagsManager />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("#فارماکولوژی")).toBeDefined();
    expect(screen.getByText("#قلب و عروق")).toBeDefined();

    // Click create tag button
    fireEvent.click(screen.getByText("افزودن برچسب جدید"));
    expect(screen.getAllByText("افزودن برچسب جدید").length).toBeGreaterThan(0);
  });

  test("9. AdminBlogEditor supports interactive tag chips and validation", () => {
    const onSaveMock = vi.fn();
    const onPublishMock = vi.fn();

    vi.spyOn(useBlogModule, "useAdminBlogTags").mockReturnValue({
      data: { tags: mockTags },
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminBlogEditor
            categories={mockCategories}
            initialPost={{
              ...mockPosts[0],
              content: "## متن مقاله تست\nتوضیحات کامل...",
              tags: [{ id: "t-1", name: "فارماکولوژی", slug: "pharmacology" }],
            } as any}
            isSaving={false}
            onSave={onSaveMock}
            onPublish={onPublishMock}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Initial tag chip should be visible with #
    expect(screen.getByText("#فارماکولوژی")).toBeDefined();

    // Add suggested tag
    const cardioTag = screen.getByText("+قلب و عروق");
    fireEvent.click(cardioTag);

    // Both tags should now be in the selected tag chips
    expect(screen.getByText("#قلب و عروق")).toBeDefined();

    // Save
    const saveButton = screen.getByText(/ذخیره پیش‌نویس/i);
    fireEvent.click(saveButton);

    expect(onSaveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tagNames: expect.arrayContaining(["فارماکولوژی", "قلب و عروق"]),
      }),
    );
  });

  test("10. Blog Header audit: removes destination-less anchor items and keeps only valid routes", () => {
    vi.spyOn(useBlogModule, "usePublicBlogPosts").mockReturnValue({
      data: { posts: mockPosts, totalCount: 2, totalPages: 1 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <BlogListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const nav = screen.getByRole("navigation", { name: "ناوبری اصلی درباره ما" });
    expect(nav).toBeDefined();

    // Valid links should exist
    expect(screen.getByRole("link", { name: "صفحه اصلی" })).toBeDefined();
    expect(screen.getByRole("link", { name: "وبلاگ" })).toBeDefined();

    // Destination-less anchor items must NOT exist in the header
    expect(screen.queryByText("مشکل اطلاعات")).toBeNull();
    expect(screen.queryByText("زنجیره یادگیری")).toBeNull();
    expect(screen.queryByText("فلسفه ما")).toBeNull();
    expect(screen.queryByText("اکوسیستم آوانا")).toBeNull();
  });
});
