import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminCourseHubPage } from "../pages/admin/AdminCourseHubPage.js";
import { PublicationActionCenter } from "../components/admin/studio/PublicationActionCenter.js";
import { AuthProvider } from "../providers/AuthProvider.js";
import { AdminLayout } from "../components/shell/AdminLayout.js";
import { ProtectedRoute } from "../components/shell/ProtectedRoute.js";
import type {
  OfficialCourse,
  OfficialReviewWorkspace,
  ConsistencyValidationReport,
  AdminCourseHierarchy,
} from "../lib/api/admin.js";

const mockOfficialCourseDraft: OfficialCourse = {
  id: "official-course-1",
  organizationId: "b4a0b464-16db-4087-92b7-163a1e6f6776",
  name: "فارماکولوژی جامع بالینی",
  description: "دوره رسمی جامع داروشناسی بالینی برای آزمون دستیاری",
  subject: "داروسازی",
  status: "draft",
  isOfficial: true,
  moduleCount: 2,
  lessonCount: 5,
  flashcardCount: 20,
  quizQuestionCount: 10,
  product: {
    id: "product-1",
    code: "course_official-course-1",
    price: 499000,
    currency: "toman",
    active: false,
  },
  createdAt: "2026-08-20T10:00:00Z",
  updatedAt: "2026-08-20T10:00:00Z",
};

const mockOfficialCourseApproved: OfficialCourse = {
  ...mockOfficialCourseDraft,
  id: "official-course-2",
  name: "شیمی دارویی پیشرفته",
  status: "approved",
  moduleCount: 3,
  lessonCount: 6,
  flashcardCount: 30,
  quizQuestionCount: 15,
};

const mockHierarchy: AdminCourseHierarchy = {
  id: "official-course-1",
  name: "فارماکولوژی جامع بالینی",
  subject: "داروسازی",
  modules: [
    {
      id: "mod-1",
      title: "فصل اول: فارماکودینامیک و گیرنده‌ها",
      lessons: [
        {
          id: "les-1",
          title: "درس ۱: مقدمه بر گیرنده‌های آدرنرژیک",
          publicationStatus: "published",
          flashcardCount: 10,
          quizCount: 5,
          hasContent: true,
          createdAt: "2026-08-22T10:00:00Z",
        },
      ],
    },
  ],
};

const mockReviewWorkspaceValid: OfficialReviewWorkspace = {
  course: mockOfficialCourseDraft,
  draftContents: [
    {
      id: "draft-lesson-1",
      documentId: "doc-1",
      contentType: "lesson",
      status: "pending_review",
      itemCount: 3,
      hasMappingErrors: false,
      unresolvedItems: 0,
      payload: {
        sessions: [
          { title: "مقدمه بر گیرنده‌های آدرنرژیک", topic: "آدرنرژیک", sessionIndex: 1 },
        ],
      },
    },
  ],
  unresolvedLessonMappings: 0,
  readyForApproval: true,
};

const mockConsistencyReportValid: ConsistencyValidationReport = {
  valid: true,
  courseStatus: "approved",
  moduleCount: 1,
  lessonCount: 1,
  flashcardCount: 10,
  quizCount: 1,
  quizQuestionCount: 5,
  unresolvedLessonMappings: 0,
  productLinked: true,
  productPrice: 499000,
  productActive: false,
  errors: [],
};

describe("AdminCourseHubPage (/admin/courses/:courseId)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0 },
      },
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  function setupFetchMock(options?: {
    coursesList?: OfficialCourse[];
    reviewWorkspace?: OfficialReviewWorkspace;
    hierarchy?: AdminCourseHierarchy;
    consistencyReport?: ConsistencyValidationReport;
  }) {
    const courses = options?.coursesList ?? [
      mockOfficialCourseDraft,
      mockOfficialCourseApproved,
    ];
    const rw = options?.reviewWorkspace ?? mockReviewWorkspaceValid;
    const hier = options?.hierarchy ?? mockHierarchy;
    const cr = options?.consistencyReport ?? mockConsistencyReportValid;

    const mockFetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method || "GET";

      // /v1/me
      if (url.includes("/v1/me")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: {
                id: "admin-user-id",
                email: "admin@avana.ir",
                name: "Admin User",
                role: "platform_admin",
                emailVerified: true,
              },
              memberships: [
                {
                  id: "m-1",
                  organization_id: "b4a0b464-16db-4087-92b7-163a1e6f6776",
                  role: "platform_admin",
                  created_at: "2026-01-01T00:00:00Z",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      // /v1/admin/content-studio/courses list
      if (url.includes("/admin/content-studio/courses") && method === "GET" && !url.includes("/review") && !url.includes("/validate")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ courses }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      // /v1/admin/content-studio/courses/:id/review
      if (url.includes("/review")) {
        return Promise.resolve(
          new Response(
            JSON.stringify(rw),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      // /v1/admin/content-studio/courses/:id/validate
      if (url.includes("/validate")) {
        return Promise.resolve(
          new Response(
            JSON.stringify(cr),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      // /v1/admin/content/courses/:id/hierarchy
      if (url.includes("/hierarchy")) {
        return Promise.resolve(
          new Response(
            JSON.stringify(hier),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      // /v1/admin/courses/:id (PATCH)
      if (url.includes("/admin/courses/") && method === "PATCH") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ success: true }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      // /v1/admin/content-studio/courses/:id/archive (POST)
      if (url.includes("/archive") && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({ success: true, courseStatus: "archived" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      // Documents list
      if (url.includes("/v1/orgs/") && url.includes("/documents")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ data: [], meta: { total: 0 } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      return Promise.resolve(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    });

    global.fetch = mockFetch;
    return mockFetch;
  }

  function renderCourseHub(initialPath = "/admin/courses/official-course-1") {
    return render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={[initialPath]}>
            <Routes>
              <Route path="/" element={<ProtectedRoute />}>
                <Route path="admin" element={<AdminLayout />}>
                  <Route path="courses/:courseId" element={<AdminCourseHubPage />} />
                  <Route path="courses" element={<div>Courses List Page</div>} />
                </Route>
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );
  }

  it("Case 1: Renders Course Hub with default tab (structure), header breadcrumbs, counters and badges", async () => {
    setupFetchMock();
    renderCourseHub("/admin/courses/official-course-1");

    // Loading transition to course loaded
    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی جامع بالینی")).toBeInTheDocument();
    });

    // Verify Breadcrumb elements
    expect(screen.getAllByText("آموزش و دوره‌ها").length).toBeGreaterThan(0);

    // Verify Course Badges & Counters
    expect(screen.getByText("دوره رسمی آوانا")).toBeInTheDocument();
    expect(screen.getByText("داروسازی")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument(); // 2 modules
    expect(screen.getByText("5")).toBeInTheDocument(); // 5 lessons
    expect(screen.getByText("20")).toBeInTheDocument(); // 20 flashcards
    expect(screen.getByText("10")).toBeInTheDocument(); // 10 quiz questions

    // Verify Default Tab is Structure
    expect(screen.getByText(/ساختار و درخت محتوای دوره/i)).toBeInTheDocument();
  });

  it("Case 2: Fallback to structure tab when tab query param is invalid or empty", async () => {
    setupFetchMock();
    renderCourseHub("/admin/courses/official-course-1?tab=invalid_tab_name");

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی جامع بالینی")).toBeInTheDocument();
    });

    expect(screen.getByText(/ساختار و درخت محتوای دوره/i)).toBeInTheDocument();
  });

  it("Case 3: Direct deep-linking to ?tab=generation, ?tab=review, ?tab=publish, and ?tab=settings", async () => {
    setupFetchMock();

    // Test ?tab=generation
    const { unmount: unmount1 } = renderCourseHub("/admin/courses/official-course-1?tab=generation");
    await waitFor(() => {
      expect(screen.getByText(/بارگذاری منابع درسی/i)).toBeInTheDocument();
    });
    unmount1();

    // Test ?tab=review
    const { unmount: unmount2 } = renderCourseHub("/admin/courses/official-course-1?tab=review");
    await waitFor(() => {
      expect(screen.getByText(/محیط بازبینی پیش‌نویس‌های هوش مصنوعی/i)).toBeInTheDocument();
    });
    unmount2();

    // Test ?tab=publish
    const { unmount: unmount3 } = renderCourseHub("/admin/courses/official-course-1?tab=publish");
    await waitFor(() => {
      expect(screen.getByText(/مرحله ۱: تایید رسمی و ثبت ساختار دوره/i)).toBeInTheDocument();
    });
    unmount3();

    // Test ?tab=settings
    const { unmount: unmount4 } = renderCourseHub("/admin/courses/official-course-1?tab=settings");
    await waitFor(() => {
      expect(screen.getByText(/تنظیمات و متادیتای دوره/i)).toBeInTheDocument();
    });
    unmount4();
  });

  it("Case 4: Backward compatibility with legacy ?tab=sources mapping to generation", async () => {
    setupFetchMock();
    renderCourseHub("/admin/courses/official-course-1?tab=sources");

    await waitFor(() => {
      expect(screen.getByText(/بارگذاری منابع درسی/i)).toBeInTheDocument();
    });
  });

  it("Case 5: Interactive tab switching renders the target panel", async () => {
    setupFetchMock();
    renderCourseHub("/admin/courses/official-course-1");

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی جامع بالینی")).toBeInTheDocument();
    });

    // Click Tab 5: Settings
    const settingsTabBtn = screen.getByRole("button", { name: /۵\. تنظیمات دوره/i });
    fireEvent.click(settingsTabBtn);

    await waitFor(() => {
      expect(screen.getByText(/تنظیمات و متادیتای دوره/i)).toBeInTheDocument();
      expect(screen.getByText(/اطلاعات پایه دوره/i)).toBeInTheDocument();
    });

    // Click Tab 4: Publish
    const publishTabBtn = screen.getByRole("button", { name: /۴\. انتشار و تجاری‌سازی/i });
    fireEvent.click(publishTabBtn);

    await waitFor(() => {
      expect(screen.getByText(/مرحله ۱: تایید رسمی و ثبت ساختار دوره/i)).toBeInTheDocument();
    });
  });

  it("Case 6: Settings panel allows editing metadata (PATCH /v1/admin/courses/:id)", async () => {
    const mockFetch = setupFetchMock();
    renderCourseHub("/admin/courses/official-course-1?tab=settings");

    await waitFor(() => {
      expect(screen.getByText(/تنظیمات و متادیتای دوره/i)).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue("فارماکولوژی جامع بالینی");
    fireEvent.change(nameInput, { target: { value: "فارماکولوژی بالینی ویرایش ۲" } });

    const saveBtn = screen.getByRole("button", { name: /ذخیره تغییرات/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/مشخصات دوره با موفقیت ذخیره شد/i)).toBeInTheDocument();
    });

    // Verify PATCH was called
    const patchCalls = mockFetch.mock.calls.filter(([url, init]) =>
      url.toString().includes("/v1/admin/courses/official-course-1") && init?.method === "PATCH"
    );
    expect(patchCalls.length).toBeGreaterThan(0);
    expect(JSON.parse(patchCalls[0][1]?.body as string)).toEqual({
      name: "فارماکولوژی بالینی ویرایش ۲",
      subject: "داروسازی",
    });
  });

  it("Case 7: Settings panel allows archiving course with confirmation", async () => {
    const mockFetch = setupFetchMock();
    renderCourseHub("/admin/courses/official-course-1?tab=settings");

    await waitFor(() => {
      expect(screen.getByText(/تنظیمات و متادیتای دوره/i)).toBeInTheDocument();
    });

    // Click Initial Archive Button
    const initialArchiveBtn = screen.getByRole("button", { name: /بایگانی کردن این دوره/i });
    fireEvent.click(initialArchiveBtn);

    // Confirmation prompt should appear
    expect(screen.getByText(/آیا از بایگانی کردن این دوره اطمینان کامل دارید؟/i)).toBeInTheDocument();

    // Click Confirm Archive Button
    const confirmArchiveBtn = screen.getByRole("button", { name: /بله، بایگانی کن/i });
    fireEvent.click(confirmArchiveBtn);

    await waitFor(() => {
      expect(screen.getByText(/دوره با موفقیت بایگانی شد/i)).toBeInTheDocument();
    });

    const archiveCalls = mockFetch.mock.calls.filter(([url, init]) =>
      url.toString().includes("/v1/admin/content-studio/courses/official-course-1/archive") && init?.method === "POST"
    );
    expect(archiveCalls.length).toBeGreaterThan(0);
  });

  it("Case 8: Displays 404 state when course is not found", async () => {
    setupFetchMock({ coursesList: [] });
    renderCourseHub("/admin/courses/non-existent-course-id");

    await waitFor(() => {
      expect(screen.getByText(/دوره مورد نظر یافت نشد/i)).toBeInTheDocument();
      expect(screen.getByText(/non-existent-course-id/i)).toBeInTheDocument();
      expect(screen.getByText(/بازگشت به لیست دوره‌ها/i)).toBeInTheDocument();
    });
  });

  it("Case 9: Export and Import package triggers open respective modals", async () => {
    setupFetchMock();
    renderCourseHub("/admin/courses/official-course-1");

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی جامع بالینی")).toBeInTheDocument();
    });

    // Click Export ZIP button
    const exportBtn = screen.getByRole("button", { name: /خروجی ZIP/i });
    fireEvent.click(exportBtn);

    expect(screen.getByText(/خروجی محتوا \(Export Package\)/i)).toBeInTheDocument();

    // Close export modal
    const closeBtns = screen.getAllByRole("button");
    const closeExport = closeBtns.find((b) => b.querySelector("svg") && b.className.includes("text-slate-400"));
    if (closeExport) fireEvent.click(closeExport);

    // Click Import button
    const importBtn = screen.getByRole("button", { name: /ورود محتوا/i });
    fireEvent.click(importBtn);

    expect(screen.getByText(/ورود محتوا \(Import Content Package\)/i)).toBeInTheDocument();
  });

  it("Case 10 (Fix 1): Pricing mutation invokes onSuccess callback and updates Course Hub data", async () => {
    let coursesRefetchCount = 0;
    const mockFetch = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method || "GET";

      if (url.includes("/v1/me")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: { id: "admin-user-id", email: "admin@avana.ir", role: "platform_admin" },
              memberships: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (url.includes("/admin/content-studio/courses") && method === "GET" && !url.includes("/review") && !url.includes("/validate")) {
        coursesRefetchCount++;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              courses: [
                {
                  ...mockOfficialCourseDraft,
                  product: coursesRefetchCount > 1
                    ? { id: "product-1", code: "course_official-course-1", price: 650000, currency: "toman", active: true }
                    : mockOfficialCourseDraft.product,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }

      if (url.includes("/review")) {
        return Promise.resolve(
          new Response(JSON.stringify(mockReviewWorkspaceValid), { status: 200, headers: { "Content-Type": "application/json" } })
        );
      }

      if (url.includes("/validate")) {
        return Promise.resolve(
          new Response(JSON.stringify(mockConsistencyReportValid), { status: 200, headers: { "Content-Type": "application/json" } })
        );
      }

      if (url.includes("/pricing") && method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true, price: 650000 }), { status: 200, headers: { "Content-Type": "application/json" } })
        );
      }

      return Promise.resolve(new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } }));
    });

    global.fetch = mockFetch;
    renderCourseHub("/admin/courses/official-course-1?tab=publish");

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی جامع بالینی")).toBeInTheDocument();
    });

    const priceInput = screen.getByLabelText(/قیمت فروش دوره/i);
    fireEvent.change(priceInput, { target: { value: "650000" } });

    const submitPricingBtn = screen.getByRole("button", { name: /ثبت قیمت تجاری/i });
    fireEvent.click(submitPricingBtn);

    await waitFor(() => {
      const pricingCalls = mockFetch.mock.calls.filter(([url, init]) =>
        url.toString().includes("/pricing") && init?.method === "POST"
      );
      expect(pricingCalls.length).toBeGreaterThan(0);
      expect(JSON.parse(pricingCalls[0][1]?.body as string)).toEqual({ price: 650000 });

      // fetchCourses() must have been refreshed via onSuccess callback
      expect(coursesRefetchCount).toBeGreaterThan(1);
    });
  });

  it("Case 11 (Fix 2): PublicationActionCenter priceInput synchronizes when switching courses", async () => {
    setupFetchMock();
    const handleSuccess = vi.fn();

    const courseA: OfficialCourse = {
      ...mockOfficialCourseDraft,
      id: "course-a",
      product: { id: "prod-a", code: "code-a", price: 350000, currency: "toman", active: true },
    };

    const courseB: OfficialCourse = {
      ...mockOfficialCourseDraft,
      id: "course-b",
      product: { id: "prod-b", code: "code-b", price: 850000, currency: "toman", active: true },
    };

    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <PublicationActionCenter course={courseA} onSuccess={handleSuccess} />
      </QueryClientProvider>
    );

    const priceInput = screen.getByLabelText(/قیمت فروش دوره/i) as HTMLInputElement;
    expect(priceInput.value).toBe("350000");

    // Rerender with Course B having a different price
    rerender(
      <QueryClientProvider client={queryClient}>
        <PublicationActionCenter course={courseB} onSuccess={handleSuccess} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(priceInput.value).toBe("850000");
    });
  });
});
