import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminContentStudioPage } from "../pages/admin/AdminContentStudioPage.js";
import { AuthProvider } from "../providers/AuthProvider.js";
import { AdminLayout } from "../components/shell/AdminLayout.js";
import type { OfficialCourse, OfficialReviewWorkspace } from "../lib/api/admin.js";

const mockCourse: OfficialCourse = {
  id: "course-pharma-101",
  organizationId: "b4a0b464-16db-4087-92b7-163a1e6f6776",
  name: "فارماکولوژی جامع",
  description: "دوره رسمی جامع داروشناسی",
  subject: "داروسازی",
  status: "review",
  isOfficial: true,
  moduleCount: 1,
  lessonCount: 2,
  flashcardCount: 10,
  quizQuestionCount: 5,
  product: null,
  createdAt: "2026-08-20T10:00:00Z",
  updatedAt: "2026-08-20T10:00:00Z",
};

const mockReviewWorkspace: OfficialReviewWorkspace = {
  course: mockCourse,
  draftContents: [
    {
      id: "draft-lesson-101",
      documentId: "doc-1",
      contentType: "lesson",
      status: "pending_review",
      itemCount: 2,
      hasMappingErrors: false,
      unresolvedItems: 0,
      payload: { title: "مقدمه بر گیرنده‌های آدرنرژیک" },
      createdAt: "2026-08-22T10:00:00Z",
    },
    {
      id: "draft-flashcard-102",
      documentId: "doc-1",
      contentType: "flashcard",
      status: "pending_review",
      itemCount: 5,
      hasMappingErrors: false,
      unresolvedItems: 0,
      payload: { title: "فلش‌کارت‌های آدرنرژیک" },
      createdAt: "2026-08-22T10:00:00Z",
    },
    {
      id: "draft-quiz-103",
      documentId: "doc-1",
      contentType: "quiz",
      status: "pending_review",
      itemCount: 4,
      hasMappingErrors: false,
      unresolvedItems: 0,
      payload: { title: "آزمون گیرنده‌ها" },
      createdAt: "2026-08-22T10:00:00Z",
    },
  ],
  unresolvedLessonMappings: 0,
  readyForApproval: true,
};

describe("Admin Review Workspace — Complete Parity with User Review Experience", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: 0 },
        mutations: { retry: false },
      },
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  function setupMocks() {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method || "GET";

      // /v1/me
      if (url.includes("/v1/me")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              user: {
                id: "admin-1",
                email: "admin@avana.ir",
                name: "مدیر ارشد",
                role: "platform_admin",
                emailVerified: true,
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      // /v1/admin/content-studio/courses/:id/review
      if (url.includes("/admin/content-studio/courses/") && url.includes("/review")) {
        return Promise.resolve(
          new Response(JSON.stringify(mockReviewWorkspace), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      // /v1/admin/content-studio/courses (GET)
      if (url.includes("/admin/content-studio/courses")) {
        return Promise.resolve(
          new Response(JSON.stringify({ courses: [mockCourse] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      // /v1/organizations/:id/courses/:id/generated/review-queue
      if (url.includes("/generated/review-queue")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              request_id: "r-queue",
              pending: [
                {
                  id: "draft-lesson-101",
                  document_id: "doc-1",
                  course_id: mockCourse.id,
                  type: "lesson",
                  status: "pending_review",
                  title: "درسنامه گیرنده‌های آدرنرژیک",
                  updated_at: "2026-08-22T10:00:00Z",
                },
                {
                  id: "draft-flashcard-102",
                  document_id: "doc-1",
                  course_id: mockCourse.id,
                  type: "flashcard",
                  status: "pending_review",
                  title: "فلش‌کارت‌های آدرنرژیک",
                  updated_at: "2026-08-22T10:00:00Z",
                },
                {
                  id: "draft-quiz-103",
                  document_id: "doc-1",
                  course_id: mockCourse.id,
                  type: "quiz",
                  status: "pending_review",
                  title: "آزمون گیرنده‌ها",
                  updated_at: "2026-08-22T10:00:00Z",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      // GET /v1/organizations/:id/courses/:id/generated/:contentId
      if (url.includes("/generated/draft-lesson-101") && method === "GET") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              request_id: "r-detail",
              content: {
                id: "draft-lesson-101",
                document_id: "doc-1",
                course_id: mockCourse.id,
                type: "lesson",
                status: "pending_review",
                payload: {
                  title: "درسنامه گیرنده‌های آدرنرژیک",
                  moduleTitle: "فصل اول: فارماکودینامیک",
                  content_markdown: "## مقدمه بر گیرنده‌ها\n\nگیرنده‌های آدرنرژیک به دو دسته اصلی تقسیم می‌شوند.",
                },
                prompt_version: "v1.2",
                model: "gemini-1.5-pro",
                citations: ["chunk-1"],
                created_at: "2026-08-22T10:00:00Z",
                updated_at: "2026-08-22T10:00:00Z",
              },
              source_chunks: [
                {
                  id: "chunk-1",
                  sequence: 1,
                  heading: "فارماکولوژی کاتزونگ",
                  content: "گیرنده‌های آدرنرژیک اهداف مهم دارودرمانی هستند.",
                  start_page: 12,
                  end_page: 14,
                },
              ],
              generation: {
                model: "gemini-1.5-pro",
                prompt_version: "v1.2",
                token_usage: { input_tokens: 1500, output_tokens: 800 },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      // PATCH /v1/organizations/:id/courses/:id/generated/:contentId
      if (url.includes("/generated/draft-lesson-101") && method === "PATCH") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              request_id: "r-patch",
              content: {
                id: "draft-lesson-101",
                document_id: "doc-1",
                course_id: mockCourse.id,
                type: "lesson",
                status: "edited",
                payload: {
                  title: "درسنامه گیرنده‌های آدرنرژیک (ویرایش‌شده)",
                  content_markdown: "## مقدمه اصلاح‌شده",
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      // POST /v1/organizations/:id/courses/:id/generated/:contentId/accept
      if (url.includes("/generated/draft-lesson-101/accept") && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              request_id: "r-acc",
              content_id: "draft-lesson-101",
              status: "accepted",
              materialized_lesson_id: "les-new-1",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      // POST /v1/organizations/:id/courses/:id/generated/:contentId/reject
      if (url.includes("/generated/draft-lesson-101/reject") && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              request_id: "r-rej",
              content_id: "draft-lesson-101",
              status: "rejected",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      // POST /v1/organizations/:id/courses/:id/generated/:contentId/regenerate
      if (url.includes("/generated/draft-lesson-101/regenerate") && method === "POST") {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              request_id: "r-regen",
              content_id: "draft-lesson-101",
              job_id: "job-regen-999",
              status: "regenerating",
            }),
            { status: 202, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    global.fetch = fetchMock;
    return fetchMock;
  }

  it("Flow 1: Admin navigates to Review Workspace tab, views canonical queue, filters, and invariant audit", async () => {
    setupMocks();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/admin/content-studio?courseId=' + mockCourse.id]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Switch to Review Tab
    await waitFor(() => {
      expect(screen.getByText("۲. پیش‌نویس‌ها و بازبینی (Draft Review)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("۲. پیش‌نویس‌ها و بازبینی (Draft Review)"));

    // Verify Invariant Audit Banner
    await waitFor(() => {
      expect(screen.getByText(/نگاشت قطعی درسنامه تایید شد/i)).toBeInTheDocument();
      expect(screen.getByText("انتقال به بخش تایید و انتشار")).toBeInTheDocument();
    });

    // Verify Shared Queue Header, Filter Pills, and Items
    await waitFor(() => {
      expect(screen.getByText("صف بازبینی و تایید محتوا")).toBeInTheDocument();
      expect(screen.getByText("درسنامه گیرنده‌های آدرنرژیک")).toBeInTheDocument();
      expect(screen.getByText("فلش‌کارت‌های آدرنرژیک")).toBeInTheDocument();
      expect(screen.getByText("آزمون گیرنده‌ها")).toBeInTheDocument();
    });

    // Test filter pills
    const lessonFilter = screen.getByRole("button", { name: "درس‌ها" });
    fireEvent.click(lessonFilter);
    expect(screen.getByText("درسنامه گیرنده‌های آدرنرژیک")).toBeInTheDocument();
    expect(screen.queryByText("فلش‌کارت‌های آدرنرژیک")).not.toBeInTheDocument();
  });

  it("Flow 2: Admin opens draft detail and uses shared Edit, Reject, Regenerate, and Accept actions", async () => {
    const fetchMock = setupMocks();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/admin/content-studio?courseId=' + mockCourse.id]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("۲. پیش‌نویس‌ها و بازبینی (Draft Review)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("۲. پیش‌نویس‌ها و بازبینی (Draft Review)"));

    await waitFor(() => {
      expect(screen.getByText("درسنامه گیرنده‌های آدرنرژیک")).toBeInTheDocument();
    });

    // Click item to open ContentReviewDetail
    fireEvent.click(screen.getByText("درسنامه گیرنده‌های آدرنرژیک"));

    // Verify rich ContentReviewDetail elements
    await waitFor(() => {
      expect(screen.getByText("ویرایش پیش‌نویس")).toBeInTheDocument();
      expect(screen.getByText("تولید مجدد")).toBeInTheDocument();
      expect(screen.getByText("رد کردن")).toBeInTheDocument();
      expect(screen.getByText("تایید و انتشار")).toBeInTheDocument();
      expect(screen.getByText("فصل اول: فارماکودینامیک")).toBeInTheDocument();
      expect(screen.getByText("ارجاعات و شواهد متنی از منبع")).toBeInTheDocument();
    });

    // 1. Test Edit Dialog
    fireEvent.click(screen.getByText("ویرایش پیش‌نویس"));
    await waitFor(() => {
      expect(screen.getByText("ویرایش پیش‌نویس محتوا")).toBeInTheDocument();
    });
    const saveBtn = screen.getByText("ذخیره تغییرات");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(([url, init]) =>
        url.toString().includes("/generated/draft-lesson-101") && init?.method === "PATCH",
      );
      expect(patchCalls.length).toBeGreaterThan(0);
    });

    // 2. Test Accept Action (materializes item and returns to queue)
    const acceptBtn = screen.getByText("تایید و انتشار");
    fireEvent.click(acceptBtn);
    await waitFor(() => {
      const acceptCalls = fetchMock.mock.calls.filter(([url, init]) =>
        url.toString().includes("/generated/draft-lesson-101/accept") && init?.method === "POST",
      );
      expect(acceptCalls.length).toBeGreaterThan(0);
    });

    // 3. Returned to queue view
    await waitFor(() => {
      expect(screen.getByText("صف بازبینی و تایید محتوا")).toBeInTheDocument();
    });
  });

  it("Flow 3: Admin uses Reject with mandatory reason and triggers Regenerate", async () => {
    const fetchMock = setupMocks();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={['/admin/content-studio?courseId=' + mockCourse.id]}>
            <Routes>
              <Route path="/admin" element={<AdminLayout />}>
                <Route path="content-studio" element={<AdminContentStudioPage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("۲. پیش‌نویس‌ها و بازبینی (Draft Review)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("۲. پیش‌نویس‌ها و بازبینی (Draft Review)"));

    await waitFor(() => {
      expect(screen.getByText("درسنامه گیرنده‌های آدرنرژیک")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("درسنامه گیرنده‌های آدرنرژیک"));

    await waitFor(() => {
      expect(screen.getByText("رد کردن")).toBeInTheDocument();
      expect(screen.getByText("تولید مجدد")).toBeInTheDocument();
    });

    // 1. Test Reject Dialog with reason
    fireEvent.click(screen.getByText("رد کردن"));
    await waitFor(() => {
      expect(screen.getByText("رد کردن پیش‌نویس محتوا")).toBeInTheDocument();
    });

    const reasonInput = screen.getByPlaceholderText(/ناقص بودن/i);
    fireEvent.change(reasonInput, { target: { value: "مبحث فارماکوکینتیک به اندازه کافی دقیق نبود." } });

    const confirmRejectBtn = screen.getByText("تایید رد پیش‌نویس");
    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      const rejectCalls = fetchMock.mock.calls.filter(([url, init]) =>
        url.toString().includes("/generated/draft-lesson-101/reject") && init?.method === "POST",
      );
      expect(rejectCalls.length).toBeGreaterThan(0);
    });

    // 2. Returned to queue, click again to test Regenerate
    await waitFor(() => {
      expect(screen.getByText("صف بازبینی و تایید محتوا")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("درسنامه گیرنده‌های آدرنرژیک"));

    await waitFor(() => {
      expect(screen.getByText("تولید مجدد")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("تولید مجدد"));
    await waitFor(() => {
      const regenCalls = fetchMock.mock.calls.filter(([url, init]) =>
        url.toString().includes("/generated/draft-lesson-101/regenerate") && init?.method === "POST",
      );
      expect(regenCalls.length).toBeGreaterThan(0);
    });
  });
});
