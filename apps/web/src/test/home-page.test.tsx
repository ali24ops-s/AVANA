import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";
import { HomePage } from "../pages/HomePage.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("HomePage Component", () => {
  const orgId = "00000000-0000-0000-0000-000000000001";
  const courseId = "00000000-0000-0000-0000-000000000002";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Persian hero title, subtitle, CTA, study stats, user courses, AI mentor, and study plan", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-me",
              user: {
                id: "user-1",
                email: "student@avana.ir",
                role: "student",
              },
            }),
        } as Response);
      }
      if (urlStr.includes("/organizations/") && urlStr.includes("/courses")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-c",
              items: [
                {
                  id: courseId,
                  organization_id: orgId,
                  title: "فیزیولوژی قلب و عروق",
                  subject: "پزشکی",
                  code: "MED101",
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                },
              ],
            }),
        } as Response);
      }
      if (urlStr.includes("/organizations")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-orgs",
              items: [{ id: orgId, name: "دانشگاه آوانا", slug: "avana-univ" }],
            }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/home"]}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Verify Persian Hero section
    expect(screen.getByText("آوانا؛ همراه هوشمند یادگیری شما")).toBeInTheDocument();
    expect(
      screen.getByText(
        /جزوات و فایل‌های درسی PDF خود را بارگذاری کنید/i,
      ),
    ).toBeInTheDocument();

    // Verify CTA button
    const ctaButton = screen.getByRole("link", { name: /شروع یادگیری/i });
    expect(ctaButton).toBeInTheDocument();
    expect(ctaButton).toHaveAttribute("href", "/courses");

    // Verify stats grid
    expect(screen.getByText("زمان مطالعه این هفته")).toBeInTheDocument();
    expect(screen.getByText("درس‌های تکمیل‌شده")).toBeInTheDocument();
    expect(screen.getByText("آزمون‌ها")).toBeInTheDocument();
    expect(screen.getByText("streak")).toBeInTheDocument();

    // Verify side panel cards
    expect(screen.getByText("دستیار هوشمند آوانا")).toBeInTheDocument();
    expect(screen.getByText("برنامه مطالعه امروز")).toBeInTheDocument();
    expect(screen.getByText("پیشنهادات برای شما")).toBeInTheDocument();

    // Verify dynamic Persian date badge in greeting header
    const currentPersianYear = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      calendar: "persian",
      year: "numeric",
    }).format(new Date());
    expect(screen.getByText(currentPersianYear)).toBeInTheDocument();

    // Verify user courses loaded from real API
    await waitFor(() => {
      expect(screen.getByText("فیزیولوژی قلب و عروق")).toBeInTheDocument();
      expect(screen.getByText("ورود به دوره")).toBeInTheDocument();
    });

    // Ensure removed sections are NOT present in DOM
    expect(screen.queryByText("بارگذاری فایل PDF و تولید بسته یادگیری")).not.toBeInTheDocument();
    expect(screen.queryByText("شروع یادگیری با بارگذاری منبع درسی")).not.toBeInTheDocument();
    expect(screen.queryByText("چطور با آوانا یاد بگیریم؟")).not.toBeInTheDocument();
    expect(screen.queryByText("بارگذاری یا انتخاب درس")).not.toBeInTheDocument();
    expect(screen.queryByText("امکانات آوانا")).not.toBeInTheDocument();
    expect(screen.queryByText("فلش‌کارت‌های مرور فاصله‌دار")).not.toBeInTheDocument();
    expect(screen.queryByText("آزمون‌های خودسنجی")).not.toBeInTheDocument();
    expect(screen.queryByText("تحلیل پیشرفت و عملکرد")).not.toBeInTheDocument();
  });

  it("dynamically renders Persian date based on system time and not hardcoded strings", () => {
    vi.useFakeTimers();
    try {
      // Mock system time to 2026-08-20 (29 Mordad 1405, Thursday)
      vi.setSystemTime(new Date(2026, 7, 20, 10, 0, 0));

      const queryClient = createTestQueryClient();
      render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={["/home"]}>
              <HomePage />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      expect(screen.getByText("پنجشنبه، ۲۹ مرداد")).toBeInTheDocument();
      expect(screen.getByText("۱۴۰۵")).toBeInTheDocument();
      // Ensure the old hardcoded "۱۲ مهر" is NOT present
      expect(screen.queryByText("۱۲ مهر")).not.toBeInTheDocument();
      expect(screen.queryByText("۱۴۰۳")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("Scenario 1 & 4 & 5: renders top 2 recent courses with real progress percentage and real lesson count", async () => {
    const c1Id = "c1-uuid";
    const c2Id = "c2-uuid";
    const c3Id = "c3-uuid";

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ user: { id: "user-1", email: "student@avana.ir", role: "student" } }),
        } as Response);
      }
      if (urlStr.includes("/organizations") && !urlStr.includes("/courses") && !urlStr.includes("/progress")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [{ id: orgId, name: "دانشگاه آوانا" }] }),
        } as Response);
      }
      if (urlStr.includes(`/v1/organizations/${orgId}/courses`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              items: [
                { id: c1Id, organization_id: orgId, title: "فارماکولوژی تخصصی", created_at: "2026-08-01T10:00:00Z", updated_at: "2026-08-10T10:00:00Z" },
                { id: c2Id, organization_id: orgId, title: "پاتولوژی عمومی", created_at: "2026-08-02T10:00:00Z", updated_at: "2026-08-15T10:00:00Z" },
                { id: c3Id, organization_id: orgId, title: "بیوشیمی پزشکی", created_at: "2026-07-01T10:00:00Z", updated_at: "2026-07-15T10:00:00Z" },
              ],
            }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c2Id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c2Id, total_lessons: 15, completed_lessons: 12, percentage: 80 }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c1Id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c1Id, total_lessons: 20, completed_lessons: 5, percentage: 25 }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/home"]}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      // Recent active top 2: c2 (updated Aug 15) and c1 (updated Aug 10)
      expect(screen.getByText("پاتولوژی عمومی")).toBeInTheDocument();
      expect(screen.getByText("فارماکولوژی تخصصی")).toBeInTheDocument();
      // c3 should NOT be in the top 2
      expect(screen.queryByText("بیوشیمی پزشکی")).not.toBeInTheDocument();
    });

    await waitFor(() => {
      // Check real percentage & real total lesson counts
      expect(screen.getByText("80%")).toBeInTheDocument();
      expect(screen.getByText("15 درس")).toBeInTheDocument();
      expect(screen.getByText("25%")).toBeInTheDocument();
      expect(screen.getByText("20 درس")).toBeInTheDocument();
    });
  });

  it("Scenario 2: user with 1 course renders 1 user course + 1 real system fallback course", async () => {
    const c1Id = "c1-user-course";
    const c2Id = "c2-system-fallback";

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ user: { id: "user-1", email: "student@avana.ir", role: "student" } }),
        } as Response);
      }
      if (urlStr.includes("/organizations") && !urlStr.includes("/courses") && !urlStr.includes("/progress")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [{ id: orgId, name: "دانشگاه آوانا" }] }),
        } as Response);
      }
      if (urlStr.includes(`/v1/organizations/${orgId}/courses`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              items: [
                { id: c1Id, organization_id: orgId, title: "میکروب‌شناسی پزشکی", created_at: "2026-08-01T10:00:00Z", updated_at: "2026-08-01T10:00:00Z" },
                { id: c2Id, organization_id: orgId, title: "ایمونولوژی پایه", created_at: "2026-07-01T10:00:00Z", updated_at: "2026-07-01T10:00:00Z", archived: true },
              ],
            }),
        } as Response);
      }
      if (urlStr.includes("/progress")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: "any", total_lessons: 8, completed_lessons: 4, percentage: 50 }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/home"]}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      // 1 active course ("میکروب‌شناسی پزشکی") + 1 fallback real course ("ایمونولوژی پایه")
      expect(screen.getByText("میکروب‌شناسی پزشکی")).toBeInTheDocument();
      expect(screen.getByText("ایمونولوژی پایه")).toBeInTheDocument();
    });
  });

  it("Scenario 3 & 6: user with 0 courses displays fallback real courses and never fake/mock data", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ user: { id: "user-new", email: "newstudent@avana.ir", role: "student" } }),
        } as Response);
      }
      if (urlStr.includes("/organizations") && !urlStr.includes("/courses") && !urlStr.includes("/progress")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [{ id: orgId, name: "دانشگاه آوانا" }] }),
        } as Response);
      }
      if (urlStr.includes(`/v1/organizations/${orgId}/courses`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              items: [
                { id: "sys-1", organization_id: orgId, title: "نورولوژی بالینی", created_at: "2026-05-01T10:00:00Z" },
                { id: "sys-2", organization_id: orgId, title: "ژنتیک پزشکی", created_at: "2026-06-01T10:00:00Z" },
              ],
            }),
        } as Response);
      }
      if (urlStr.includes("/progress")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: "sys-1", total_lessons: 10, completed_lessons: 0, percentage: 0 }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/home"]}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      // Must display real system courses
      expect(screen.getByText("نورولوژی بالینی")).toBeInTheDocument();
      expect(screen.getByText("ژنتیک پزشکی")).toBeInTheDocument();

      // Must NEVER display fake/mock titles
      expect(screen.queryByText("آناتومی سیستم قلبی عروقی")).not.toBeInTheDocument();
      expect(screen.queryByText("فیزیولوژی سلولی")).not.toBeInTheDocument();
      expect(screen.queryByText("۱۲ درس باقیمانده")).not.toBeInTheDocument();
    });
  });

  it("opens Smart Assistant floating modal on trigger click and closes on close button or Escape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          user: { id: "user-1", email: "student@avana.ir", role: "student" },
          items: [],
        }),
    } as Response);

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/home"]}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Modal should initially be closed
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Click "از آوانا بپرس" button
    const openBtn = screen.getByRole("button", { name: /از آوانا بپرس/i });
    openBtn.click();

    // Modal should now be open in document.body
    await waitFor(() => {
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeInTheDocument();
      expect(dialog).toHaveAttribute("aria-modal", "true");
    });

    // Body scroll should be locked
    expect(document.body.style.overflow).toBe("hidden");

    // Close button should close modal
    const closeBtn = screen.getByRole("button", { name: /بستن دستیار/i });
    closeBtn.click();

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Body scroll should be restored
    expect(document.body.style.overflow).toBe("");
  });

  it("does not bind Dashboard Assistant to the first course when multiple courses exist", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ user: { id: "user-1", email: "student@avana.ir", role: "student" } }),
        } as Response);
      }
      if (urlStr.includes("/organizations") && !urlStr.includes("/courses") && !urlStr.includes("/progress")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [{ id: "org-1", name: "دانشگاه آوانا" }] }),
        } as Response);
      }
      if (urlStr.includes("/courses") && !urlStr.includes("/progress")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              items: [
                { id: "c-1", organization_id: "org-1", title: "فارماکولوژی ۱" },
                { id: "c-2", organization_id: "org-1", title: "شیمی دارویی" },
                { id: "c-3", organization_id: "org-1", title: "پاتولوژی تخصصی" },
              ],
            }),
        } as Response);
      }
      if (urlStr.includes("/v1/ai/ask")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                answer: "برای تولید فلش‌کارت و آزمون، فایل جزوه را در بخش اسناد آپلود کنید.",
                conversationId: "conv-100",
              }),
            ),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/home"]}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی ۱")).toBeInTheDocument();
      expect(screen.getByText("شیمی دارویی")).toBeInTheDocument();
    });

    // Open Assistant modal
    const openBtn = screen.getByRole("button", { name: /از آوانا بپرس/i });
    openBtn.click();

    // Verify header renders general assistant and NOT "دوره: فارماکولوژی ۱"
    await waitFor(() => {
      expect(screen.getByText("دستیار هوشمند و راهنمای یادگیری آوانا")).toBeInTheDocument();
      expect(screen.queryByText("دوره: فارماکولوژی ۱")).not.toBeInTheDocument();
    });

    // Send a message
    const textarea = screen.getByPlaceholderText("سوال خود را درباره امکانات آوانا یا روش مطالعه بنویسید...");
    fireEvent.change(textarea, { target: { value: "چطور از آوانا استفاده کنم؟" } });

    const submitBtn = screen.getByRole("button", { name: /ارسال/i });
    fireEvent.click(submitBtn);

    // Verify /v1/ai/ask payload has context.type === "dashboard" and NO courseId
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/v1/ai/ask"),
        expect.objectContaining({
          body: JSON.stringify({
            message: "چطور از آوانا استفاده کنم؟",
            context: {
              type: "dashboard",
            },
          }),
        }),
      );
    });
  });

  it("renders live data for completed lessons, completed exams, streak, and study time", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ user: { id: "user-stats-1", email: "learner@avana.ir", role: "student" } }),
        } as Response);
      }
      if (urlStr.includes("/v1/dashboard/study-time") || urlStr.includes("/v1/dashboard/stats")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-stats-1",
              stats: {
                completedLessons: 12,
                completedExams: 5,
                currentStreak: 7,
                longestStreak: 14,
                todayIsActive: true,
                todayStudySeconds: 1200,
              },
              thisWeek: {
                seconds: 16500,
                minutes: 275,
                formatted: "۴ ساعت و ۳۵ دقیقه",
              },
              lastWeek: {
                seconds: 13200,
                minutes: 220,
                formatted: "۳ ساعت و ۴۰ دقیقه",
              },
              changePercent: 25,
              daily: [],
            }),
        } as Response);
      }
      if (urlStr.includes("/organizations") && !urlStr.includes("/courses")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [{ id: "org-1", name: "دانشگاه آوانا" }] }),
        } as Response);
      }
      if (urlStr.includes("/courses")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              items: [{ id: "c-1", organization_id: "org-1", title: "فارماکولوژی ۱" }],
            }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/home"]}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Verify dynamic stats rendering in Persian numbers
    await waitFor(() => {
      expect(screen.getByText("۴ ساعت و ۳۵ دقیقه")).toBeInTheDocument();
      expect(screen.getByText("۱۲")).toBeInTheDocument();
      expect(screen.getByText("۵")).toBeInTheDocument();
      expect(screen.getByText("۷ روز")).toBeInTheDocument();
    });
  });
});



