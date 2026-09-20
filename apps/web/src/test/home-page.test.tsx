import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";
import { HomePage } from "../pages/HomePage.js";
import { getDailyMotivationalQuote } from "../utils/dailyQuote.js";
import { toPersianDigits } from "@avana/domain";

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
    vi.useRealTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders Persian greeting header, stats grid, and side panels without mock data", async () => {
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
      if (urlStr.includes("/progress")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              course_id: courseId,
              total_lessons: 10,
              completed_lessons: 6,
              percentage: 60,
            }),
        } as Response);
      }
      if (urlStr.includes("/v1/study/daily-plan")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              plan: {
                id: "plan-1",
                userId: "user-1",
                planDate: "2026-09-18",
                status: "in_progress",
                targetDurationMinutes: 45,
                completedDurationMinutes: 15,
                remainingDurationMinutes: 30,
                tasks: [
                  {
                    id: "task-1",
                    planId: "plan-1",
                    userId: "user-1",
                    taskType: "read_lesson",
                    status: "pending",
                    title: "مطالعه درس اول فیزیولوژی",
                    description: "درس دوره فیزیولوژی",
                    priority: 1,
                    estimatedMinutes: 15,
                    completedAt: null,
                    courseId: courseId,
                    moduleId: "mod-1",
                    lessonId: "l-1",
                    quizId: null,
                    metadata: {},
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  },
                ],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
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

    // Verify stats section
    expect(screen.getByText("زمان مطالعه این هفته")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("فعالیت مطالعه")).toBeInTheDocument();
      expect(screen.getByText(/روز فعالیت در سال جاری/)).toBeInTheDocument();
    });
    expect(screen.queryByText("درس‌های تکمیل‌شده")).not.toBeInTheDocument();
    expect(screen.queryByText("آزمون‌ها")).not.toBeInTheDocument();

    // Verify side panel cards
    expect(screen.getByText("دستیار هوشمند آوانا")).toBeInTheDocument();
    expect(screen.getByText("برنامه مطالعه امروز")).toBeInTheDocument();
    expect(screen.queryByText("به‌زودی")).not.toBeInTheDocument();
    expect(screen.getByText("امتحانات پیش رو")).toBeInTheDocument();
    expect(screen.getAllByText("افزودن امتحان").length).toBeGreaterThan(0);

    // Verify real daily planner task rendered in HomePage (after expanding)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /فعالیت‌های مطالعه امروز/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /فعالیت‌های مطالعه امروز/i }));
    expect(screen.getByText("مطالعه درس اول فیزیولوژی")).toBeInTheDocument();

    // Verify dynamic Persian date badge in greeting header
    const currentPersianYear = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
      calendar: "persian",
      year: "numeric",
    }).format(new Date());
    expect(screen.getByText(currentPersianYear)).toBeInTheDocument();

    // Verify daily motivational quote in greeting header
    const expectedQuote = getDailyMotivationalQuote();
    expect(screen.getByText(expectedQuote)).toBeInTheDocument();

    // Verify user courses loaded from real API
    await waitFor(() => {
      expect(screen.getAllByText("فیزیولوژی قلب و عروق").length).toBeGreaterThan(0);
      expect(screen.getByText("ادامه یادگیری")).toBeInTheDocument();
      expect(screen.getByText("۶۰٪ تکمیل شده")).toBeInTheDocument();
    });

    // Ensure mock / fake strings are NEVER in the DOM
    expect(screen.queryByText("فصل ۴ — سیستم عصبی خودمختار")).not.toBeInTheDocument();
    expect(screen.queryByText("۶۸٪ تکمیل شده")).not.toBeInTheDocument();
    expect(screen.queryByText("فارماکولوژی پایه")).not.toBeInTheDocument();
    expect(screen.queryByText("پیشنهادات برای شما")).not.toBeInTheDocument();
    expect(screen.queryByText("بارگذاری فایل PDF و تولید بسته یادگیری")).not.toBeInTheDocument();
    expect(screen.queryByText("چطور با آوانا یاد بگیریم؟")).not.toBeInTheDocument();
  });

  it("Scenario 1 (0 courses): renders Empty State with 'اولین دوره خود را ایجاد کنید' and CTA 'ایجاد دوره'", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              user: { id: "user-empty", email: "empty@avana.ir", role: "student" },
            }),
        } as Response);
      }
      if (urlStr.includes("/organizations") && !urlStr.includes("/courses")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              items: [{ id: orgId, name: "دانشگاه آوانا" }],
            }),
        } as Response);
      }
      if (urlStr.includes("/courses")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ items: [] }),
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

    // Verify Empty State in Hero section
    await waitFor(() => {
      expect(screen.getByText("اولین دوره خود را ایجاد کنید")).toBeInTheDocument();
    });

    const createCourseBtn = screen.getByRole("link", { name: /ایجاد دوره/i });
    expect(createCourseBtn).toBeInTheDocument();
    expect(createCourseBtn).toHaveAttribute("href", "/courses");

    // Ensure NO mock/fake titles exist
    expect(screen.queryByText("فصل ۴ — سیستم عصبی خودمختار")).not.toBeInTheDocument();
    expect(screen.queryByText("۶۸٪ تکمیل شده")).not.toBeInTheDocument();
    expect(screen.queryByText("فارماکولوژی پایه")).not.toBeInTheDocument();
  });

  it("Scenario 2 (1 course): renders single static course card with real progress and NO carousel controls", async () => {
    const c1Id = "c1-single";

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              user: { id: "user-1", email: "student@avana.ir", role: "student" },
            }),
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
                {
                  id: c1Id,
                  organization_id: orgId,
                  title: "فیزیولوژی اعصاب",
                  subject: "علوم اعصاب",
                  created_at: "2026-08-01T10:00:00Z",
                  updated_at: "2026-08-10T10:00:00Z",
                },
              ],
            }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c1Id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              course_id: c1Id,
              total_lessons: 20,
              completed_lessons: 9,
              percentage: 45,
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

    await waitFor(() => {
      expect(screen.getAllByText("فیزیولوژی اعصاب").length).toBeGreaterThan(0);
      expect(screen.getAllByText("علوم اعصاب").length).toBeGreaterThan(0);
      expect(screen.getByText("۹ از ۲۰ درس تکمیل شده است.")).toBeInTheDocument();
      expect(screen.getByText("۴۵٪ تکمیل شده")).toBeInTheDocument();
    });

    // Verify NO carousel navigation controls (no next/prev buttons, no dots)
    expect(screen.queryByLabelText("دوره قبلی")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("دوره بعدی")).not.toBeInTheDocument();
    expect(screen.queryByText(/دوره ۱ از/i)).not.toBeInTheDocument();

    // CTA links to this specific course
    const ctaLink = screen.getByRole("link", { name: /ادامه یادگیری/i });
    expect(ctaLink).toHaveAttribute("href", `/courses/${c1Id}`);
  });

  it("Scenario 3 (2 courses): renders carousel with 2 courses and allows navigating strictly between the 2", async () => {
    const c1Id = "c1-two";
    const c2Id = "c2-two";

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
                { id: c1Id, organization_id: orgId, title: "فارماکولوژی تخصصی", created_at: "2026-08-01T10:00:00Z" },
                { id: c2Id, organization_id: orgId, title: "پاتولوژی عمومی", created_at: "2026-08-02T10:00:00Z" },
              ],
            }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c1Id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c1Id, total_lessons: 10, completed_lessons: 9, percentage: 90 }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c2Id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c2Id, total_lessons: 10, completed_lessons: 4, percentage: 40 }),
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

    // Initial card: Top course is c1 (90% completion)
    await waitFor(() => {
      expect(screen.getByText("دوره ۱ از ۲")).toBeInTheDocument();
      expect(screen.getByText("۹۰٪ تکمیل شده")).toBeInTheDocument();
    });

    // Click Next button
    const nextBtn = screen.getByLabelText("دوره بعدی");
    fireEvent.click(nextBtn);

    // Second card: c2 (40% completion)
    await waitFor(() => {
      expect(screen.getByText("دوره ۲ از ۲")).toBeInTheDocument();
      expect(screen.getByText("۴۰٪ تکمیل شده")).toBeInTheDocument();
    });

    // Click Next button again -> wraps strictly back to c1 (1 of 2)
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(screen.getByText("دوره ۱ از ۲")).toBeInTheDocument();
      expect(screen.getByText("۹۰٪ تکمیل شده")).toBeInTheDocument();
    });
  });

  it("Scenario 4 (3 courses): renders carousel with top 3 courses sorted by completion descending", async () => {
    const c1 = { id: "c-1", title: "درس یک (پایین)", created_at: "2026-08-01T00:00:00Z" };
    const c2 = { id: "c-2", title: "درس دو (بالاترین)", created_at: "2026-08-02T00:00:00Z" };
    const c3 = { id: "c-3", title: "درس سه (متوسط)", created_at: "2026-08-03T00:00:00Z" };

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
          json: () => Promise.resolve({ items: [c1, c2, c3] }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c1.id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c1.id, total_lessons: 10, completed_lessons: 3, percentage: 30 }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c2.id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c2.id, total_lessons: 10, completed_lessons: 9, percentage: 90 }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c3.id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c3.id, total_lessons: 10, completed_lessons: 6, percentage: 60 }),
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

    // Initial card: Top completion is c2 (90%)
    await waitFor(() => {
      expect(screen.getByText("دوره ۱ از ۳")).toBeInTheDocument();
      expect(screen.getByText("۹۰٪ تکمیل شده")).toBeInTheDocument();
    });

    // Next -> c3 (60%)
    const nextBtn = screen.getByLabelText("دوره بعدی");
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(screen.getByText("دوره ۲ از ۳")).toBeInTheDocument();
      expect(screen.getByText("۶۰٪ تکمیل شده")).toBeInTheDocument();
    });

    // Next -> c1 (30%)
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(screen.getByText("دوره ۳ از ۳")).toBeInTheDocument();
      expect(screen.getByText("۳۰٪ تکمیل شده")).toBeInTheDocument();
    });

    // Next -> wraps back to c2 (90%)
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(screen.getByText("دوره ۱ از ۳")).toBeInTheDocument();
      expect(screen.getByText("۹۰٪ تکمیل شده")).toBeInTheDocument();
    });
  });

  it("Scenario 5 (>3 courses): strictly selects Top 3 courses by completion and carousel cycles only within Top 3", async () => {
    const c1 = { id: "c-1", title: "دوره رتبه چهارم", created_at: "2026-08-01T00:00:00Z" };
    const c2 = { id: "c-2", title: "دوره رتبه اول (۹۵٪)", created_at: "2026-08-02T00:00:00Z" };
    const c3 = { id: "c-3", title: "دوره رتبه دوم (۷۵٪)", created_at: "2026-08-03T00:00:00Z" };
    const c4 = { id: "c-4", title: "دوره رتبه سوم (۵۰٪)", created_at: "2026-08-04T00:00:00Z" };
    const c5 = { id: "c-5", title: "دوره رتبه پنجم (۱۰٪)", created_at: "2026-08-05T00:00:00Z" };

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
          json: () => Promise.resolve({ items: [c1, c2, c3, c4, c5] }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c2.id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c2.id, total_lessons: 20, completed_lessons: 19, percentage: 95 }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c3.id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c3.id, total_lessons: 20, completed_lessons: 15, percentage: 75 }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c4.id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c4.id, total_lessons: 20, completed_lessons: 10, percentage: 50 }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c1.id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c1.id, total_lessons: 20, completed_lessons: 6, percentage: 30 }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c5.id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c5.id, total_lessons: 20, completed_lessons: 2, percentage: 10 }),
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

    // Carousel must strictly show 3 cards (Top 3)
    await waitFor(() => {
      expect(screen.getByText("دوره ۱ از ۳")).toBeInTheDocument();
      expect(screen.getByText("۹۵٪ تکمیل شده")).toBeInTheDocument();
    });

    const nextBtn = screen.getByLabelText("دوره بعدی");

    // 1 -> 2 (c3, 75%)
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(screen.getByText("دوره ۲ از ۳")).toBeInTheDocument();
      expect(screen.getByText("۷۵٪ تکمیل شده")).toBeInTheDocument();
    });

    // 2 -> 3 (c4, 50%)
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(screen.getByText("دوره ۳ از ۳")).toBeInTheDocument();
      expect(screen.getByText("۵۰٪ تکمیل شده")).toBeInTheDocument();
    });

    // 3 -> wraps back to 1 (c2, 95%) — NEVER reaches 4th or 5th course!
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(screen.getByText("دوره ۱ از ۳")).toBeInTheDocument();
      expect(screen.getByText("۹۵٪ تکمیل شده")).toBeInTheDocument();
    });
  });

  it("Hero Carousel: supports backward navigation and direct dot selection", async () => {
    const c1 = { id: "c-1", title: "درس یک (پایین)", created_at: "2026-08-01T00:00:00Z" };
    const c2 = { id: "c-2", title: "درس دو (بالاترین)", created_at: "2026-08-02T00:00:00Z" };
    const c3 = { id: "c-3", title: "درس سه (متوسط)", created_at: "2026-08-03T00:00:00Z" };

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
          json: () => Promise.resolve({ items: [c1, c2, c3] }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c1.id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c1.id, total_lessons: 10, completed_lessons: 3, percentage: 30 }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c2.id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c2.id, total_lessons: 10, completed_lessons: 9, percentage: 90 }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c3.id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c3.id, total_lessons: 10, completed_lessons: 6, percentage: 60 }),
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

    // Initial card: Top course is c2 (1 of 3)
    await waitFor(() => {
      expect(screen.getByText("دوره ۱ از ۳")).toBeInTheDocument();
      expect(screen.getByText("۹۰٪ تکمیل شده")).toBeInTheDocument();
    });

    // Navigate backward (Prev) -> should wrap to card 3 (c1, 30%)
    const prevBtn = screen.getByLabelText("دوره قبلی");
    fireEvent.click(prevBtn);
    await waitFor(() => {
      expect(screen.getByText("دوره ۳ از ۳")).toBeInTheDocument();
      expect(screen.getByText("۳۰٪ تکمیل شده")).toBeInTheDocument();
    });

    // Jump directly to card 2 (c3, 60%) using dot indicator
    const dot2Btn = screen.getByLabelText("رفتن به دوره ۲");
    fireEvent.click(dot2Btn);
    await waitFor(() => {
      expect(screen.getByText("دوره ۲ از ۳")).toBeInTheDocument();
      expect(screen.getByText("۶۰٪ تکمیل شده")).toBeInTheDocument();
    });
  });

  it("Scenario 6: updating progress dynamically alters course rank in hero carousel", async () => {
    let c1Percentage = 20;
    const c2Percentage = 80;

    const c1 = { id: "c-1", title: "درس آلفا", created_at: "2026-08-01T00:00:00Z" };
    const c2 = { id: "c-2", title: "درس بتا", created_at: "2026-08-02T00:00:00Z" };

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
          json: () => Promise.resolve({ items: [c1, c2] }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c1.id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c1.id, total_lessons: 10, completed_lessons: (c1Percentage / 10), percentage: c1Percentage }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${c2.id}/progress`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ course_id: c2.id, total_lessons: 10, completed_lessons: (c2Percentage / 10), percentage: c2Percentage }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });

    const queryClient = createTestQueryClient();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/home"]}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Initially c2 (80%) is top rank (Card 1)
    await waitFor(() => {
      expect(screen.getByText("دوره ۱ از ۲")).toBeInTheDocument();
      expect(screen.getByText("۸۰٪ تکمیل شده")).toBeInTheDocument();
    });

    // User completes more lessons in c1 -> c1 now has 100% completion
    c1Percentage = 100;
    await queryClient.invalidateQueries({ queryKey: ["course-progress"] });

    rerender(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/home"]}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Now c1 (100%) becomes top rank (Card 1)
    await waitFor(() => {
      expect(screen.getByText("دوره ۱ از ۲")).toBeInTheDocument();
      expect(screen.getByText("۱۰۰٪ تکمیل شده")).toBeInTheDocument();
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
      expect(screen.getAllByText("فارماکولوژی ۱").length).toBeGreaterThan(0);
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

    // Verify dynamic stats rendering in Persian numbers and Activity Heatmap
    await waitFor(() => {
      expect(screen.getByText("۴ ساعت و ۳۵ دقیقه")).toBeInTheDocument();
      expect(screen.getByText("فعالیت مطالعه")).toBeInTheDocument();
      expect(screen.queryByText(/روز streak/)).not.toBeInTheDocument();
      expect(screen.getByText(/↑ ۲۵٪ نسبت به هفته قبل/)).toBeInTheDocument();
    });
  });

  it("Upcoming Exams: renders upcoming exams sorted by nearest date with Persian date and real days remaining", async () => {
    const c1Id = "c1-exam";
    const c2Id = "c2-exam";
    const c3Id = "c3-exam";
    const cPastId = "cpast-exam";

    const now = new Date();
    const todayExam = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0).toISOString();
    const in3DaysExam = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 3, 12, 0, 0).toISOString();
    const in10DaysExam = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 10, 12, 0, 0).toISOString();
    const pastExam = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5, 12, 0, 0).toISOString();

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
                {
                  id: c1Id,
                  organization_id: orgId,
                  title: "فارماکولوژی تخصصی",
                  exam_at: in3DaysExam, // 3 days remaining
                  created_at: "2026-08-01T10:00:00Z",
                  updated_at: "2026-08-10T10:00:00Z",
                },
                {
                  id: c2Id,
                  organization_id: orgId,
                  title: "پاتولوژی عمومی",
                  exam_at: in10DaysExam, // 10 days remaining
                  created_at: "2026-08-02T10:00:00Z",
                  updated_at: "2026-08-15T10:00:00Z",
                },
                {
                  id: c3Id,
                  organization_id: orgId,
                  title: "آناتومی سر و گردن",
                  exam_at: todayExam, // Today (0 days)
                  created_at: "2026-07-01T10:00:00Z",
                  updated_at: "2026-07-15T10:00:00Z",
                },
                {
                  id: cPastId,
                  organization_id: orgId,
                  title: "بیوشیمی پایه",
                  exam_at: pastExam, // Past exam (negative days)
                  created_at: "2026-06-01T10:00:00Z",
                  updated_at: "2026-06-15T10:00:00Z",
                },
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
      expect(screen.getByText("آناتومی سر و گردن")).toBeInTheDocument();
      expect(screen.getAllByText("فارماکولوژی تخصصی").length).toBeGreaterThan(0);
      expect(screen.getAllByText("پاتولوژی عمومی").length).toBeGreaterThan(0);
    });

    // Verify past exam is NOT in upcoming exams
    expect(screen.queryByText("بیوشیمی پایه")).not.toBeInTheDocument();

    // Verify days remaining badges and their color threshold styling
    const todayBadge = screen.getByText("امروز");
    expect(todayBadge).toBeInTheDocument();
    expect(todayBadge).toHaveClass("bg-[var(--avana-error-bg)]", "text-[var(--avana-error-text)]", "border-[var(--avana-error-border)]"); // < 3 days (0): Red
    // Verify synchronized icon container color for today's exam
    const todayCard = todayBadge.closest("div.rounded-card")!;
    const todayIconBox = todayCard.querySelector("div.w-9.h-9")!;
    expect(todayIconBox).toHaveClass("text-[var(--avana-error)]", "bg-[var(--avana-error-bg)]", "border-[var(--avana-error-border)]");

    const in3DaysBadge = screen.getByText("۳ روز باقیمانده");
    expect(in3DaysBadge).toBeInTheDocument();
    expect(in3DaysBadge).toHaveClass("bg-[var(--avana-warning-bg)]", "text-[var(--avana-warning-text)]", "border-[var(--avana-warning-border)]"); // 3-6 days (3): Yellow
    // Verify synchronized icon container color for 3 days exam
    const in3DaysCard = in3DaysBadge.closest("div.rounded-card")!;
    const in3DaysIconBox = in3DaysCard.querySelector("div.w-9.h-9")!;
    expect(in3DaysIconBox).toHaveClass("text-[var(--avana-warning)]", "bg-[var(--avana-warning-bg)]", "border-[var(--avana-warning-border)]");

    const in10DaysBadge = screen.getByText("۱۰ روز باقیمانده");
    expect(in10DaysBadge).toBeInTheDocument();
    expect(in10DaysBadge).toHaveClass("text-primary", "bg-[var(--color-primary-soft)]", "border-primary/20"); // >= 7 days (10): Teal
    // Verify synchronized icon container color for 10 days exam
    const in10DaysCard = in10DaysBadge.closest("div.rounded-card")!;
    const in10DaysIconBox = in10DaysCard.querySelector("div.w-9.h-9")!;
    expect(in10DaysIconBox).toHaveClass("text-primary", "bg-[var(--color-primary-light)]", "border-primary/20");
  });

  it("Upcoming Exams: renders empty state with CTA when no exams are scheduled", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-me",
              user: { id: "user-1", email: "student@avana.ir", role: "student" },
              memberships: [{ organization_id: orgId, role: "student" }],
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
                  id: "c-no-exam",
                  organization_id: orgId,
                  title: "فیزیولوژی عمومی",
                  exam_at: null,
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
              items: [{ id: orgId, name: "دانشگاه آوانا" }],
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

    await waitFor(() => {
      expect(screen.getByText("هیچ امتحانی ثبت نشده است")).toBeInTheDocument();
      expect(
        screen.getByText("با ثبت تاریخ آزمون‌ها، زمان‌بندی و مطالعه خود را مدیریت کنید."),
      ).toBeInTheDocument();
    });
  });

  it("Upcoming Exams: allows selecting an existing course and registering/updating its exam date via modal", async () => {
    let patchedPayload: { exam_at?: string | null } | null = null;

    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-me",
              user: { id: "user-1", email: "student@avana.ir", role: "student" },
              memberships: [{ organization_id: orgId, role: "student" }],
            }),
        } as Response);
      }
      if (init?.method === "PATCH" && urlStr.includes(`/v1/organizations/${orgId}/courses/${courseId}`)) {
        patchedPayload = JSON.parse(String(init.body));
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-patch",
              course: {
                id: courseId,
                title: "فیزیولوژی قلب و عروق",
                exam_at: patchedPayload.exam_at,
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
                  exam_at: null,
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
              items: [{ id: orgId, name: "دانشگاه آوانا" }],
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

    await waitFor(() => {
      expect(screen.getByText("هیچ امتحانی ثبت نشده است")).toBeInTheDocument();
    });

    // Click "افزودن امتحان" button
    const addExamBtns = screen.getAllByRole("button", { name: /افزودن امتحان/i });
    fireEvent.click(addExamBtns[0]);

    // Modal should be open
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("افزودن تاریخ امتحان")).toBeInTheDocument();
      expect(screen.getByLabelText("انتخاب درس / دوره")).toBeInTheDocument();
    });

    // Select course in modal
    const courseSelect = screen.getByLabelText("انتخاب درس / دوره");
    fireEvent.change(courseSelect, { target: { value: courseId } });

    // Open Persian Date Picker
    const datePickerBtn = screen.getByLabelText("تاریخ برگزاری امتحان");
    fireEvent.click(datePickerBtn);

    // Calendar popup should be open
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "تقویم انتخاب تاریخ شمسی" })).toBeInTheDocument();
    });

    // Select today from Persian calendar
    const selectTodayBtn = screen.getByRole("button", { name: /انتخاب امروز/i });
    fireEvent.click(selectTodayBtn);

    // Submit form
    const submitBtn = screen.getByRole("button", { name: "ثبت امتحان" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(patchedPayload).not.toBeNull();
      expect(patchedPayload.exam_at).toBeDefined();
    });
  });

  it("Upcoming Exams: allows configuring exam scope (selecting specific modules) in AddExamModal", async () => {
    let patchedPayload: { exam_at?: string; exam_scope?: { moduleIds?: string[] } } | null = null;
    const orgId = "00000000-0000-0000-0000-000000000001";
    const courseId = "00000000-0000-0000-0000-000000000010";
    const moduleId = "00000000-0000-0000-0000-000000000100";

    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/auth/session") || urlStr.includes("/v1/auth/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              user: { id: "user-1", name: "student", email: "student@avana.ai", role: "student" },
              memberships: [{ organization_id: orgId, role: "student" }],
            }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${courseId}/learn`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              course: { id: courseId, title: "فیزیولوژی قلب و عروق" },
              modules: [
                {
                  id: moduleId,
                  title: "فصل اول: الکتروفیزیولوژی",
                  sortOrder: 1,
                  lessons: [
                    { id: "les-1", title: "پتانسیل عمل", contentType: "markdown", sortOrder: 1, estimatedMinutes: 20, isCompleted: false },
                  ],
                },
              ],
            }),
        } as Response);
      }
      if (init?.method === "PATCH" && urlStr.includes(`/v1/organizations/${orgId}/courses/${courseId}`)) {
        patchedPayload = JSON.parse(String(init.body));
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-patch",
              course: {
                id: courseId,
                title: "فیزیولوژی قلب و عروق",
                exam_at: patchedPayload.exam_at,
                exam_scope: patchedPayload.exam_scope,
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
                  exam_at: null,
                  exam_scope: null,
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
              items: [{ id: orgId, name: "دانشگاه آوانا" }],
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

    await waitFor(() => {
      expect(screen.getByText("هیچ امتحانی ثبت نشده است")).toBeInTheDocument();
    });

    // Click "افزودن امتحان" button
    const addExamBtns = screen.getAllByRole("button", { name: /افزودن امتحان/i });
    fireEvent.click(addExamBtns[0]);

    // Modal open
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByLabelText("انتخاب درس / دوره")).toBeInTheDocument();
    });

    // Select course
    const courseSelect = screen.getByLabelText("انتخاب درس / دوره");
    fireEvent.change(courseSelect, { target: { value: courseId } });

    // Verify exam scope is collapsed by default (no module preview/list shown)
    const scopeToggleBtn = screen.getByRole("button", { name: /مباحث و سرفصل‌های امتحان \(اختیاری\)/i });
    expect(scopeToggleBtn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("فصل اول: الکتروفیزیولوژی")).not.toBeInTheDocument();

    // Click to expand syllabus list
    fireEvent.click(scopeToggleBtn);
    expect(scopeToggleBtn).toHaveAttribute("aria-expanded", "true");

    // Check module checkbox
    await waitFor(() => {
      expect(screen.getByText("فصل اول: الکتروفیزیولوژی")).toBeInTheDocument();
    });
    const moduleCheckbox = screen.getByLabelText(/فصل اول: الکتروفیزیولوژی/);
    fireEvent.click(moduleCheckbox);

    // Open Persian Date Picker
    const datePickerBtn = screen.getByLabelText("تاریخ برگزاری امتحان");
    fireEvent.click(datePickerBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "تقویم انتخاب تاریخ شمسی" })).toBeInTheDocument();
    });

    const selectTodayBtn = screen.getByRole("button", { name: /انتخاب امروز/i });
    fireEvent.click(selectTodayBtn);

    // Submit form
    const submitBtn = screen.getByRole("button", { name: "ثبت امتحان" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(patchedPayload).not.toBeNull();
      expect(patchedPayload.exam_at).toBeDefined();
      expect(patchedPayload.exam_scope).toEqual({
        moduleIds: [moduleId],
      });
    });
  });

  it("Upcoming Exams: toggles syllabus accordion, supports select/deselect all, and shows selected count badge", async () => {
    const orgId = "00000000-0000-0000-0000-000000000001";
    const courseId = "00000000-0000-0000-0000-000000000020";
    const mod1Id = "00000000-0000-0000-0000-000000000201";
    const mod2Id = "00000000-0000-0000-0000-000000000202";

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              user: { id: "user-1", name: "student", email: "student@avana.ai", role: "student" },
              memberships: [{ organization_id: orgId, role: "student" }],
            }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${courseId}/learn`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              course: { id: courseId, title: "فارماکولوژی کاربردی" },
              modules: [
                { id: mod1Id, title: "فصل اول: آنتی‌بیوتیک‌ها", sortOrder: 1, lessons: [{ id: "l1", title: "پنی‌سیلین" }] },
                { id: mod2Id, title: "فصل دوم: داروهای قلبی", sortOrder: 2, lessons: [{ id: "l2", title: "بتابلاکرها" }] },
              ],
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
                  title: "فارماکولوژی کاربردی",
                  exam_at: null,
                  exam_scope: null,
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
              items: [{ id: orgId, name: "دانشگاه آوانا" }],
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

    await waitFor(() => {
      expect(screen.getByText("هیچ امتحانی ثبت نشده است")).toBeInTheDocument();
    });

    // Open Add Exam modal
    const addExamBtns = screen.getAllByRole("button", { name: /افزودن امتحان/i });
    fireEvent.click(addExamBtns[0]);

    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByLabelText("انتخاب درس / دوره")).toBeInTheDocument();
    });

    // Select course
    const courseSelect = screen.getByLabelText("انتخاب درس / دوره");
    fireEvent.change(courseSelect, { target: { value: courseId } });

    // 1. Initially Collapsed: Chapters are NOT rendered in DOM
    const toggleBtn = screen.getByRole("button", { name: /مباحث و سرفصل‌های امتحان \(اختیاری\)/i });
    expect(toggleBtn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("فصل اول: آنتی‌بیوتیک‌ها")).not.toBeInTheDocument();
    expect(screen.queryByText("فصل دوم: داروهای قلبی")).not.toBeInTheDocument();
    expect(screen.queryByText("انتخاب همه")).not.toBeInTheDocument();

    // 2. Click to Expand: Chapters become visible
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute("aria-expanded", "true");

    await waitFor(() => {
      expect(screen.getByText("فصل اول: آنتی‌بیوتیک‌ها")).toBeInTheDocument();
      expect(screen.getByText("فصل دوم: داروهای قلبی")).toBeInTheDocument();
    });

    // 3. Test "انتخاب همه" (Select all)
    const selectAllBtn = screen.getByRole("button", { name: "انتخاب همه" });
    fireEvent.click(selectAllBtn);

    // Verify badge shows "۲ مورد انتخاب شده"
    await waitFor(() => {
      expect(screen.getByText("۲ مورد انتخاب شده")).toBeInTheDocument();
    });

    // 4. Test "حذف همه" (Deselect all)
    const deselectAllBtn = screen.getByRole("button", { name: "حذف همه" });
    fireEvent.click(deselectAllBtn);

    // Verify badge is removed
    await waitFor(() => {
      expect(screen.queryByText("۲ مورد انتخاب شده")).not.toBeInTheDocument();
    });

    // 5. Select one chapter manually
    const mod1Checkbox = screen.getByLabelText(/فصل اول: آنتی‌بیوتیک‌ها/);
    fireEvent.click(mod1Checkbox);
    expect(screen.getByText("۱ مورد انتخاب شده")).toBeInTheDocument();

    // 6. Click toggle button to Collapse again
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute("aria-expanded", "false");

    // In collapsed state, list is not visible, but selection counter is preserved on the toggle header
    await waitFor(() => {
      expect(screen.queryByText("فصل اول: آنتی‌بیوتیک‌ها")).not.toBeInTheDocument();
    });
    expect(screen.getByText("۱ مورد انتخاب شده")).toBeInTheDocument();
  });

  it("Upcoming Exams: displays delete/cancel button for registered exams and allows canceling deletion", async () => {
    const examCourseId = "course-exam-del-1";
    const now = new Date();
    const in5DaysExam = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 5, 12, 0, 0).toISOString();

    let patchCalled = false;

    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-me",
              user: { id: "user-1", email: "student@avana.ir", role: "student" },
              memberships: [{ organization_id: orgId, role: "student" }],
            }),
        } as Response);
      }
      if (init?.method === "PATCH") {
        patchCalled = true;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ request_id: "req-p", course: { id: examCourseId, exam_at: null } }),
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
                  id: examCourseId,
                  organization_id: orgId,
                  title: "ایمونولوژی پایه",
                  exam_at: in5DaysExam,
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
              items: [{ id: orgId, name: "دانشگاه آوانا" }],
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

    await waitFor(() => {
      expect(screen.getAllByText("ایمونولوژی پایه").length).toBeGreaterThan(0);
    });

    // Find delete button with clear aria-label and click it
    const deleteBtn = screen.getByRole("button", { name: "حذف ثبت امتحان ایمونولوژی پایه" });
    expect(deleteBtn).toBeInTheDocument();
    fireEvent.click(deleteBtn);

    // Confirmation dialog should open
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "لغو ثبت امتحان" })).toBeInTheDocument();
      expect(screen.getByText(/آیا مطمئن هستید که می‌خواهید زمان‌بندی و ثبت امتحان درس/)).toBeInTheDocument();
      expect(screen.getByText("«ایمونولوژی پایه»")).toBeInTheDocument();
    });

    // Click "انصراف" (Cancel)
    const cancelBtn = screen.getByRole("button", { name: "انصراف" });
    fireEvent.click(cancelBtn);

    // Modal should close without sending PATCH request
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "لغو ثبت امتحان" })).not.toBeInTheDocument();
    });
    expect(patchCalled).toBe(false);
    expect(screen.getAllByText("ایمونولوژی پایه").length).toBeGreaterThan(0);
  });

  it("Upcoming Exams: confirming deletion sends PATCH with null exam_at, removes exam from UI, and allows re-registering", async () => {
    const examCourseId = "course-exam-del-2";
    const now = new Date();
    const in4DaysExam = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 4, 12, 0, 0).toISOString();

    let currentExamAt: string | null = in4DaysExam;
    let patchPayload: Record<string, unknown> | null = null;

    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-me",
              user: { id: "user-1", email: "student@avana.ir", role: "student" },
              memberships: [{ organization_id: orgId, role: "student" }],
            }),
        } as Response);
      }
      if (init?.method === "PATCH" && urlStr.includes(`/v1/organizations/${orgId}/courses/${examCourseId}`)) {
        patchPayload = JSON.parse(String(init.body));
        currentExamAt = null;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-patch",
              course: {
                id: examCourseId,
                title: "ژنتیک پزشکی",
                exam_at: null,
                exam_scope: null,
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
                  id: examCourseId,
                  organization_id: orgId,
                  title: "ژنتیک پزشکی",
                  exam_at: currentExamAt,
                  exam_scope: null,
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
              items: [{ id: orgId, name: "دانشگاه آوانا" }],
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

    await waitFor(() => {
      expect(screen.getAllByText("ژنتیک پزشکی").length).toBeGreaterThan(0);
    });

    // Click delete exam button
    const deleteBtn = screen.getByRole("button", { name: "حذف ثبت امتحان ژنتیک پزشکی" });
    fireEvent.click(deleteBtn);

    // Confirmation dialog appears
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "لغو ثبت امتحان" })).toBeInTheDocument();
    });

    // Click "حذف ثبت امتحان" in modal
    const confirmDeleteBtn = screen.getByRole("button", { name: "حذف ثبت امتحان" });
    fireEvent.click(confirmDeleteBtn);

    // Verify PATCH payload cleared exam_at and exam_scope
    await waitFor(() => {
      expect(patchPayload).toEqual({
        exam_at: null,
        exam_scope: null,
      });
    });

    // Upcoming exams section should now show empty state without full page refresh
    await waitFor(() => {
      expect(screen.getByText("هیچ امتحانی ثبت نشده است")).toBeInTheDocument();
    });
  });

  it("Upcoming Exams: displays clear Persian error message when deletion fails and keeps exam in UI", async () => {
    const examCourseId = "course-exam-del-3";
    const now = new Date();
    const in6DaysExam = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6, 12, 0, 0).toISOString();

    vi.spyOn(globalThis, "fetch").mockImplementation((url, init) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-me",
              user: { id: "user-1", email: "student@avana.ir", role: "student" },
              memberships: [{ organization_id: orgId, role: "student" }],
            }),
        } as Response);
      }
      if (init?.method === "PATCH") {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () =>
            Promise.resolve({
              error: { code: "internal_error", message: "خطای سرور در انجام عملیات" },
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
                  id: examCourseId,
                  organization_id: orgId,
                  title: "میکروب‌شناسی عمومی",
                  exam_at: in6DaysExam,
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
              items: [{ id: orgId, name: "دانشگاه آوانا" }],
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

    await waitFor(() => {
      expect(screen.getAllByText("میکروب‌شناسی عمومی").length).toBeGreaterThan(0);
    });

    // Open delete confirmation modal
    const deleteBtn = screen.getByRole("button", { name: "حذف ثبت امتحان میکروب‌شناسی عمومی" });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "لغو ثبت امتحان" })).toBeInTheDocument();
    });

    // Confirm delete
    const confirmDeleteBtn = screen.getByRole("button", { name: "حذف ثبت امتحان" });
    fireEvent.click(confirmDeleteBtn);

    // Error banner should be shown inside dialog
    await waitFor(() => {
      expect(screen.getByText(/خطای سرور در انجام عملیات|خطا در لغو ثبت امتحان/)).toBeInTheDocument();
    });

    // Close modal
    const cancelBtn = screen.getByRole("button", { name: "انصراف" });
    fireEvent.click(cancelBtn);

    // Course should still remain in UI
    await waitFor(() => {
      expect(screen.getAllByText("میکروب‌شناسی عمومی").length).toBeGreaterThan(0);
    });
  });

  it("Upcoming Exams: allows deleting exam registration from within AddExamModal when editing an exam", async () => {
    const examCourseId = "course-exam-del-4";
    const now = new Date();
    const in7DaysExam = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7, 12, 0, 0).toISOString();

    vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-me",
              user: { id: "user-1", email: "student@avana.ir", role: "student" },
              memberships: [{ organization_id: orgId, role: "student" }],
            }),
        } as Response);
      }
      if (urlStr.includes(`/v1/courses/${examCourseId}/learn`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              course: { id: examCourseId, title: "بافت‌شناسی تخصصی" },
              modules: [],
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
                  id: examCourseId,
                  organization_id: orgId,
                  title: "بافت‌شناسی تخصصی",
                  exam_at: in7DaysExam,
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
              items: [{ id: orgId, name: "دانشگاه آوانا" }],
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

    await waitFor(() => {
      expect(screen.getAllByText("بافت‌شناسی تخصصی").length).toBeGreaterThan(0);
    });

    // Click edit exam button to open AddExamModal
    const editBtn = screen.getByRole("button", { name: "ویرایش امتحان بافت‌شناسی تخصصی" });
    fireEvent.click(editBtn);

    // AddExamModal opens with "حذف تاریخ امتحان" button in footer
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /حذف تاریخ امتحان/i })).toBeInTheDocument();
    });

    // Click "حذف تاریخ امتحان" in AddExamModal
    const deleteInModalBtn = screen.getByRole("button", { name: /حذف تاریخ امتحان/i });
    fireEvent.click(deleteInModalBtn);

    // Confirmation dialog should open for this course
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "لغو ثبت امتحان" })).toBeInTheDocument();
      expect(screen.getByText("«بافت‌شناسی تخصصی»")).toBeInTheDocument();
    });
  });

  describe("Popular Courses (دوره‌های محبوب) Section Tests", () => {
    const popularOrgId = "00000000-0000-0000-0000-000000000001";
    const sample8Courses = Array.from({ length: 8 }, (_, i) => ({
      id: `c0000000-0000-0000-0000-00000000000${i + 1}`,
      title: `دوره آموزشی شماره ${toPersianDigits(i + 1)}`,
      subject: `پزشکی ${toPersianDigits(i + 1)}`,
      exam_at: null,
      created_at: new Date(2026, 7, 20 - i).toISOString(),
      updated_at: new Date(2026, 7, 20 - i).toISOString(),
      archived: false,
    }));

    function makeMockResponse(data: unknown) {
      const jsonStr = JSON.stringify(data);
      return {
        ok: true,
        status: 200,
        headers: {
          get: (h: string) => (h.toLowerCase() === "content-type" ? "application/json" : null),
        },
        json: () => Promise.resolve(data),
        text: () => Promise.resolve(jsonStr),
      } as unknown as Response;
    }

    function setupPopularMocks(popularCourses = sample8Courses, myCourses: Array<{ id: string }> = []) {
      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes("/v1/me")) {
          return Promise.resolve(
            makeMockResponse({
              user: { id: "user-1", email: "student@avana.ir", name: "دانشجو", role: "student" },
              memberships: [{ organization_id: popularOrgId, role: "student" }],
            }),
          );
        }
        if (urlStr.includes("/organizations") && !urlStr.includes("/courses")) {
          return Promise.resolve(
            makeMockResponse({
              items: [{ id: popularOrgId, name: "دانشگاه آوانا" }],
            }),
          );
        }
        if (urlStr.includes("/courses/popular")) {
          return Promise.resolve(
            makeMockResponse({
              request_id: "req-popular-courses",
              items: popularCourses,
              pagination: {
                limit: 8,
                next_cursor: null,
              },
            }),
          );
        }
        if (urlStr.includes("/courses/my")) {
          return Promise.resolve(
            makeMockResponse({ items: myCourses }),
          );
        }
        if (urlStr.includes("/progress")) {
          return Promise.resolve(
            makeMockResponse({
              total_lessons: 12,
              completed_lessons: 4,
              percentage: 33,
            }),
          );
        }
        if (urlStr.includes("/v1/dashboard/study-time") || urlStr.includes("/v1/dashboard/stats")) {
          return Promise.resolve(
            makeMockResponse({
              request_id: "req-popular-stats",
              stats: { completedLessons: 0, completedExams: 0, currentStreak: 0, longestStreak: 0, todayIsActive: false, todayStudySeconds: 0 },
              thisWeek: { seconds: 0, minutes: 0, formatted: "۰ دقیقه" },
              lastWeek: { seconds: 0, minutes: 0, formatted: "۰ دقیقه" },
              changePercent: null,
              daily: [],
            }),
          );
        }
        if (urlStr.includes("/courses")) {
          return Promise.resolve(
            makeMockResponse({ items: myCourses }),
          );
        }
        return Promise.resolve(makeMockResponse({}));
      });
    }

    it("Test 1: Renders section title, subtitle, and first 2 popular courses initially", async () => {
      setupPopularMocks(sample8Courses, []);

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

      // Verify title and subtitle
      expect(await screen.findByText("دوره‌های محبوب")).toBeInTheDocument();
      expect(
        await screen.findByText("دوره‌هایی که بیشترین استفاده و استقبال را توسط کاربران آوانا داشته‌اند"),
      ).toBeInTheDocument();

      // Verify first 2 courses are visible
      expect(
        await screen.findByText("دوره آموزشی شماره ۱", {}, { timeout: 4000 }),
      ).toBeInTheDocument();
      expect(
        await screen.findByText("دوره آموزشی شماره ۲", {}, { timeout: 4000 }),
      ).toBeInTheDocument();

      // Courses 3-8 are not in current 2-card group
      expect(screen.queryByText("دوره آموزشی شماره ۳")).not.toBeInTheDocument();
      expect(screen.queryByText("دوره آموزشی شماره ۴")).not.toBeInTheDocument();

      // Verify indicator shows "۱ از ۴"
      expect(screen.getByText("۱ از ۴")).toBeInTheDocument();
    });

    it("Test 2: Rotates between course groups and loops back", async () => {
      setupPopularMocks(sample8Courses, []);

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

      // Group 1: Courses 1, 2
      await waitFor(() => {
        expect(screen.getAllByText("دوره آموزشی شماره ۱").length).toBeGreaterThan(0);
        expect(screen.getAllByText("دوره آموزشی شماره ۲").length).toBeGreaterThan(0);
      });

      // Switch to Group 2 via pagination dot
      const group2Btn = screen.getByLabelText("رفتن به گروه ۲");
      fireEvent.click(group2Btn);

      // Group 2: Courses 3, 4
      await waitFor(() => {
        expect(screen.getAllByText("دوره آموزشی شماره ۳").length).toBeGreaterThan(0);
        expect(screen.getAllByText("دوره آموزشی شماره ۴").length).toBeGreaterThan(0);
        expect(screen.queryByText("دوره آموزشی شماره ۱")).not.toBeInTheDocument();
      });

      // Switch to Group 3
      const group3Btn = screen.getByLabelText("رفتن به گروه ۳");
      fireEvent.click(group3Btn);
      await waitFor(() => {
        expect(screen.getAllByText("دوره آموزشی شماره ۵").length).toBeGreaterThan(0);
        expect(screen.getAllByText("دوره آموزشی شماره ۶").length).toBeGreaterThan(0);
      });

      // Switch to Group 4
      const group4Btn = screen.getByLabelText("رفتن به گروه ۴");
      fireEvent.click(group4Btn);
      await waitFor(() => {
        expect(screen.getAllByText("دوره آموزشی شماره ۷").length).toBeGreaterThan(0);
        expect(screen.getAllByText("دوره آموزشی شماره ۸").length).toBeGreaterThan(0);
      });

      // Switch back to Group 1
      const group1Btn = screen.getByLabelText("رفتن به گروه ۱");
      fireEvent.click(group1Btn);
      await waitFor(() => {
        expect(screen.getAllByText("دوره آموزشی شماره ۱").length).toBeGreaterThan(0);
        expect(screen.getAllByText("دوره آموزشی شماره ۲").length).toBeGreaterThan(0);
      });
    });

    it("Test 3: Handles fewer than 8 courses (e.g. 1 course) gracefully without pagination dots", async () => {
      setupPopularMocks([sample8Courses[0]], []);

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
        expect(screen.getByText("دوره‌های محبوب")).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getAllByText("دوره آموزشی شماره ۱").length).toBeGreaterThan(0);
      });

      // For 1 course, no dots indicator
      expect(screen.queryByLabelText("رفتن به گروه ۲")).not.toBeInTheDocument();
    });

    it("Test 4: Excludes archived courses from display", async () => {
      const coursesWithArchived = [
        sample8Courses[0],
        { ...sample8Courses[1], archived: true, title: "دوره بایگانی‌شده" },
        sample8Courses[2],
      ];
      setupPopularMocks(coursesWithArchived, []);

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
        expect(screen.getByText("دوره‌های محبوب")).toBeInTheDocument();
      });

      // Active courses 1 and 3 are visible
      expect(await screen.findByText("دوره آموزشی شماره ۱")).toBeInTheDocument();
      expect(await screen.findByText("دوره آموزشی شماره ۳")).toBeInTheDocument();

      // Archived course is not rendered
      expect(screen.queryByText("دوره بایگانی‌شده")).not.toBeInTheDocument();
    });

    it("Test 5: Renders clean empty state when 0 popular courses exist without falling back to content packs", async () => {
      setupPopularMocks([], []);

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
        expect(screen.getByText("هنوز دوره‌ای در دسترس نیست")).toBeInTheDocument();
        expect(screen.getByText("+ مشاهده دوره‌ها")).toBeInTheDocument();
      });

      // Ensure no content packs fallback
      expect(screen.queryByText("محبوب‌ترین بسته‌های محتوای آموزشی")).not.toBeInTheDocument();
      expect(screen.queryByText("هنوز بسته آموزشی در کتابخانه منتشر نشده است")).not.toBeInTheDocument();
    });

    it("Test 6: Cleans up timer on component unmount", async () => {
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
      setupPopularMocks(sample8Courses, []);

      const queryClient = createTestQueryClient();
      const { unmount } = render(
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <MemoryRouter initialEntries={["/home"]}>
              <HomePage />
            </MemoryRouter>
          </AuthProvider>
        </QueryClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText("دوره‌های محبوب")).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getAllByText("دوره آموزشی شماره ۱").length).toBeGreaterThan(0);
      });

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it("Test 7: Links each course card and the 'مشاهده همه' header to courses routes", async () => {
      setupPopularMocks(sample8Courses, []);

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
        expect(screen.getByText("دوره‌های محبوب")).toBeInTheDocument();
      });

      // Verify "مشاهده همه" links to /courses
      const viewAllLink = await screen.findByRole("link", { name: /مشاهده همه/i });
      expect(viewAllLink).toHaveAttribute("href", "/courses");

      // Verify course card link points to /courses/:id
      const courseTitleEl = await screen.findByText("دوره آموزشی شماره ۱");
      const course1Link = courseTitleEl.closest("a");
      expect(course1Link).toHaveAttribute("href", `/courses/${sample8Courses[0].id}`);
    });
  });

  describe("Activity Heatmap Dashboard Integration", () => {
    it("renders Activity Heatmap with real aggregated data, discrete color levels, and accessible aria-labels", async () => {
      const mockHeatmapData = {
        weeks: [
          [
            {
              date: "2026-09-19",
              jalaliYear: 1405,
              jalaliMonth: 6,
              jalaliDay: 28,
              jalaliMonthName: "شهریور",
              jalaliFormatted: "۲۸ شهریور",
              fullFormatted: "۲۸ شهریور ۱۴۰۵",
              dayOfWeek: 0,
              weekdayName: "شنبه",
              seconds: 3600,
              minutes: 60,
              sessionCount: 2,
              level: 4 as const,
              formattedDuration: "۱ ساعت",
              isToday: false,
              isFuture: false,
            },
            {
              date: "2026-09-20",
              jalaliYear: 1405,
              jalaliMonth: 6,
              jalaliDay: 29,
              jalaliMonthName: "شهریور",
              jalaliFormatted: "۲۹ شهریور",
              fullFormatted: "۲۹ شهریور ۱۴۰۵",
              dayOfWeek: 1,
              weekdayName: "یکشنبه",
              seconds: 1200,
              minutes: 20,
              sessionCount: 1,
              level: 2 as const,
              formattedDuration: "۲۰ دقیقه",
              isToday: true,
              isFuture: false,
            },
          ],
        ],
        monthLabels: [{ name: "شهریور", weekIndex: 0 }],
        totalActiveDays: 14,
        activeDaysThisYear: 14,
        currentPersianYear: 1405,
        currentStreak: 5,
        longestStreak: 12,
        todayIsActive: true,
        totalStudySeconds: 4800,
      };

      vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
        const urlStr = String(url);
        if (urlStr.includes("/v1/me")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ user: { id: "u-heat", email: "student@avana.ir", role: "student" } }),
          } as Response);
        }
        if (urlStr.includes("/v1/dashboard/study-time") || urlStr.includes("/v1/dashboard/stats")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                request_id: "req-heat",
                stats: { completedLessons: 8, completedExams: 3, currentStreak: 5, longestStreak: 12, todayIsActive: true, todayStudySeconds: 1200 },
                thisWeek: { seconds: 4800, minutes: 80, formatted: "۱ ساعت و ۲۰ دقیقه" },
                lastWeek: { seconds: 3600, minutes: 60, formatted: "۱ ساعت" },
                changePercent: 33,
                daily: [],
                heatmap: mockHeatmapData,
              }),
          } as Response);
        }
        if (urlStr.includes("/organizations")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ items: [{ id: orgId, name: "دانشگاه آوانا" }] }),
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

      // Verify Header & Summary
      await waitFor(() => {
        expect(screen.getByText("فعالیت مطالعه")).toBeInTheDocument();
        expect(screen.getByText(/۱۴ روز فعالیت در سال جاری/)).toBeInTheDocument();
        expect(screen.queryByText(/streak/i)).not.toBeInTheDocument();
      });

      // Verify Legend
      expect(screen.getByText("کمتر")).toBeInTheDocument();
      expect(screen.getByText("بیشتر")).toBeInTheDocument();

      // Verify Cells with discrete level colors & aria-labels
      const cellLevel4 = screen.getByLabelText(/۲۸ شهریور ۱۴۰۵: ۱ ساعت/);
      expect(cellLevel4).toBeInTheDocument();
      expect(cellLevel4).toHaveClass("bg-[#008080]");

      const cellLevel2 = screen.getByLabelText(/۲۹ شهریور ۱۴۰۵: ۲۰ دقیقه/);
      expect(cellLevel2).toBeInTheDocument();
      expect(cellLevel2).toHaveClass("bg-[#70C4B8]");

      // Verify the 3 old stat cards and streak are completely gone
      expect(screen.queryByText("درس‌های تکمیل‌شده")).not.toBeInTheDocument();
      expect(screen.queryByText("آزمون‌ها")).not.toBeInTheDocument();
      expect(screen.queryByText(/روز streak/)).not.toBeInTheDocument();
      expect(screen.queryByText(/بدون streak/)).not.toBeInTheDocument();
    });
  });
});

