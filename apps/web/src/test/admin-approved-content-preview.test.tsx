import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ReviewQueueList } from "../components/review/ReviewQueueList.js";
import { CourseStructurePanel } from "../components/admin/studio/CourseStructurePanel.js";
import { AdminCourseHubPage } from "../pages/admin/AdminCourseHubPage.js";
import { AuthProvider } from "../providers/AuthProvider.js";

describe("Admin Approved Content & Submission Preview", () => {
  let queryClient: QueryClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it("1. ReviewQueueList displays status pills and renders 'مشاهده محتوا' for accepted items", async () => {
    const orgId = "org-1";
    const courseId = "course-1";

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/generated/review-queue")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              request_id: "req-1",
              groups: [
                {
                  document: { id: "doc-1", filename: "جزوه داروسازی.pdf", title: null },
                  stats: { total: 2, pending: 1, approved: 1, rejected: 0, needsRevision: 0 },
                  items: [
                    {
                      id: "item-pending-1",
                      document_id: "doc-1",
                      course_id: courseId,
                      type: "lesson",
                      status: "draft",
                      title: "درسنامه آنتی‌بیوتیک‌ها",
                      updated_at: new Date().toISOString(),
                    },
                    {
                      id: "item-accepted-1",
                      document_id: "doc-1",
                      course_id: courseId,
                      type: "lesson",
                      status: "accepted",
                      title: "درسنامه مسکن‌های اوپیوئیدی",
                      updated_at: new Date().toISOString(),
                    },
                  ],
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    global.fetch = fetchMock;

    render(
      <QueryClientProvider client={queryClient}>
        <ReviewQueueList organizationId={orgId} courseId={courseId} />
      </QueryClientProvider>,
    );

    // Verify status filter pills are rendered
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: "همه" }).length).toBeGreaterThanOrEqual(2);
      expect(screen.getByRole("button", { name: "در انتظار بررسی" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "تأیید شده" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "رد شده" })).toBeInTheDocument();
    });

    // Expand the group
    await waitFor(() => {
      expect(screen.getByText("جزوه داروسازی.pdf")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("جزوه داروسازی.pdf"));

    // Verify draft item has "بازبینی پیش‌نویس" and accepted item has "مشاهده محتوا"
    await waitFor(() => {
      expect(screen.getByText("درسنامه آنتی‌بیوتیک‌ها")).toBeInTheDocument();
      expect(screen.getByText("درسنامه مسکن‌های اوپیوئیدی")).toBeInTheDocument();
      expect(screen.getByText("بازبینی پیش‌نویس")).toBeInTheDocument();
      expect(screen.getByText("مشاهده محتوا")).toBeInTheDocument();
    });
  });

  it("2. CourseStructurePanel opens preview modal with full markdown, flashcards, and quizzes tabs", async () => {
    const courseId = "course-123";
    const lessonId = "les-456";

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes(`/admin/content/courses/${courseId}/hierarchy`)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              course: { id: courseId, name: "شیمی آلی", subject: "شیمی" },
              groups: [],
              modules: [
                {
                  id: "mod-1",
                  title: "فصل اول",
                  lessons: [
                    {
                      id: lessonId,
                      title: "آلکان‌ها و آلکن‌ها",
                      sortOrder: 1,
                      publicationStatus: "published",
                      flashcardCount: 2,
                      quizCount: 1,
                      hasContent: true,
                    },
                  ],
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url.includes(`/admin/content/lessons/${lessonId}`)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: lessonId,
              title: "آلکان‌ها و آلکن‌ها",
              courseName: "شیمی آلی",
              moduleTitle: "فصل اول",
              contentMarkdown: "### مبانی هیدروکربن‌ها\n\nآلکان‌ها هیدروکربن‌های سیرشده هستند.",
              createdAt: new Date().toISOString(),
              flashcards: [
                {
                  id: "fc-1",
                  front: "تعریف آلکان",
                  back: "هیدروکربن با پیوند یگانه",
                  explanation: "توضیح...",
                  difficulty: "easy",
                },
              ],
              quizQuestions: [
                {
                  id: "qq-1",
                  question: "ساده‌ترین آلکان کدام است؟",
                  choices: ["متان", "اتان", "پروپان", "بوتان"],
                  correctAnswer: "متان",
                  explanation: "متان با فرمول CH4 است.",
                  difficulty: "easy",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    global.fetch = fetchMock;

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CourseStructurePanel courseId={courseId} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Expand module to see lesson
    await waitFor(() => {
      expect(screen.getByText("فصل اول")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("فصل اول"));

    await waitFor(() => {
      expect(screen.getByText("آلکان‌ها و آلکن‌ها")).toBeInTheDocument();
    });

    // Click "مشاهده" to open modal
    const viewButton = screen.getByRole("button", { name: "مشاهده" });
    fireEvent.click(viewButton);

    // Verify modal header and tabs
    await waitFor(() => {
      expect(screen.getByText("متن درسنامه")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /فلش‌کارت‌ها/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /سؤالات تستی/ })).toBeInTheDocument();
      expect(screen.getByText(/مبانی هیدروکربن‌ها/)).toBeInTheDocument();
    });

    // Switch to Flashcards tab
    fireEvent.click(screen.getByRole("button", { name: /فلش‌کارت‌ها/ }));
    await waitFor(() => {
      expect(screen.getByText("تعریف آلکان")).toBeInTheDocument();
      expect(screen.getByText("هیدروکربن با پیوند یگانه")).toBeInTheDocument();
    });

    // Switch to Quizzes tab
    fireEvent.click(screen.getByRole("button", { name: /سؤالات تستی/ }));
    await waitFor(() => {
      expect(screen.getByText("ساده‌ترین آلکان کدام است؟")).toBeInTheDocument();
      expect(screen.getAllByText(/متان/)[0]).toBeInTheDocument();
    });
  });

  it("3. AdminCourseHubPage displays pending course submission banner with approval and rejection actions", async () => {
    const courseId = "course-sub-1";

    const fetchMock = vi.fn().mockImplementation((url: string) => {
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

      if (url.includes(`/admin/courses/${courseId}`)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              course: {
                id: courseId,
                name: "فیزیولوژی پزشکی گایتون",
                scope: "teacher",
                status: "pending_review",
                counts: { modules: 2, lessons: 5, flashcards: 10, quizzes: 5 },
                subject: "پزشکی",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url.includes("/admin/course-submissions")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: "pub-sub-1",
                  courseId,
                  version: 1,
                  title: "فیزیولوژی پزشکی گایتون",
                  status: "pending_review",
                  creator: {
                    id: "u-teacher-1",
                    name: "دکتر حسینی",
                    email: "hoseini@med.ac.ir",
                  },
                  product: {
                    id: "prod-1",
                    priceAmount: 49000,
                    priceCurrency: "toman",
                  },
                  createdAt: new Date().toISOString(),
                },
              ],
              totalCount: 1,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    global.fetch = fetchMock;

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={[`/admin/courses/${courseId}`]}>
            <Routes>
              <Route path="/admin/courses/:courseId" element={<AdminCourseHubPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Verify submission banner appears
    await waitFor(() => {
      expect(screen.getByText("درخواست بررسی و انتشار دوره توسط مدرس")).toBeInTheDocument();
      expect(screen.getByText(/دکتر حسینی/)).toBeInTheDocument();
      expect(screen.getByText("تأیید و انتشار عمومی")).toBeInTheDocument();
      expect(screen.getByText("رد درخواست")).toBeInTheDocument();
    });

    // Click "تأیید و انتشار عمومی" opens modal with explicit accessType options
    fireEvent.click(screen.getByText("تأیید و انتشار عمومی"));
    await waitFor(() => {
      expect(screen.getByText("دوره رایگان (Free)")).toBeInTheDocument();
      expect(screen.getByText("دوره پولی (Paid)")).toBeInTheDocument();
      expect(screen.getByText("قیمت فروش نهایی (تومان)")).toBeInTheDocument();
      expect(screen.getByText("تأیید و انتشار")).toBeInTheDocument();
    });

    // Submitting paid course sends accessType: "paid" and valid price
    fireEvent.click(screen.getByText("تأیید و انتشار"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/admin/course-submissions/pub-sub-1/approve"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            accessType: "paid",
            price: 49000,
          }),
        }),
      );
    });
  });

  it("4. Course submission approval modal sends accessType: 'free' without price when Free is selected", async () => {
    const courseId = "course-test-free";
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes(`/admin/courses/${courseId}`)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              course: {
                id: courseId,
                name: "دوره مقدماتی پایتون",
                scope: "teacher",
                status: "pending_review",
                counts: { modules: 1, lessons: 2, flashcards: 5, quizzes: 2 },
                subject: "برنامه‌نویسی",
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url.includes("/admin/course-submissions") && init?.method === "POST") {
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        );
      }

      if (url.includes("/admin/course-submissions")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: "pub-sub-free",
                  courseId,
                  version: 1,
                  title: "دوره مقدماتی پایتون",
                  status: "pending_review",
                  accessType: "free",
                  creator: { id: "u-1", name: "استاد محمدی" },
                  createdAt: new Date().toISOString(),
                },
              ],
              totalCount: 1,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    global.fetch = fetchMock;

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={[`/admin/courses/${courseId}`]}>
            <Routes>
              <Route path="/admin/courses/:courseId" element={<AdminCourseHubPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("تأیید و انتشار عمومی")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("تأیید و انتشار عمومی"));
    await waitFor(() => {
      expect(screen.getByText("دوره رایگان (Free)")).toBeInTheDocument();
      expect(screen.getByText(/این دوره پس از تأیید به صورت کاملاً رایگان/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("تأیید و انتشار"));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/admin/course-submissions/pub-sub-free/approve"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            accessType: "free",
          }),
        }),
      );
    });
  });

  it("5. Moderation modal rejects zero or negative price for Paid access and does not auto-convert to free", async () => {
    const courseId = "course-test-val";
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes(`/admin/courses/${courseId}`)) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              course: {
                id: courseId,
                name: "دوره تست اعتبارسنجی فرانت",
                scope: "teacher",
                status: "pending_review",
                counts: { modules: 1, lessons: 1, flashcards: 0, quizzes: 0 },
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      if (url.includes("/admin/course-submissions")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: "pub-sub-val",
                  courseId,
                  version: 1,
                  title: "دوره تست اعتبارسنجی فرانت",
                  status: "pending_review",
                  accessType: "paid",
                  product: { id: "p-1", priceAmount: 30000 },
                  creator: { id: "u-1", name: "استاد محمدی" },
                  createdAt: new Date().toISOString(),
                },
              ],
              totalCount: 1,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      }

      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });
    global.fetch = fetchMock;

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={[`/admin/courses/${courseId}`]}>
            <Routes>
              <Route path="/admin/courses/:courseId" element={<AdminCourseHubPage />} />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("تأیید و انتشار عمومی")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("تأیید و انتشار عمومی"));
    await waitFor(() => {
      expect(screen.getByText("قیمت فروش نهایی (تومان)")).toBeInTheDocument();
    });

    // Clear price input (make it invalid/zero)
    const priceInput = screen.getByRole("spinbutton");
    fireEvent.change(priceInput, { target: { value: "0" } });

    // Attempt to submit
    fireEvent.click(screen.getByText("تأیید و انتشار"));

    // Verify error message is shown and fetch was not called with approve
    await waitFor(() => {
      expect(
        screen.getByText("برای دوره آموزشی پولی، قیمت معتبر به تومان الزامی است (بزرگتر از صفر)."),
      ).toBeInTheDocument();
    });
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/approve"),
      expect.anything(),
    );
  });
});
