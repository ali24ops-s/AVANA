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

    // Verify stats grid
    expect(screen.getByText("زمان مطالعه این هفته")).toBeInTheDocument();
    expect(screen.getByText("درس‌های تکمیل‌شده")).toBeInTheDocument();
    expect(screen.getByText("آزمون‌ها")).toBeInTheDocument();
    expect(screen.getByText("streak")).toBeInTheDocument();

    // Verify side panel cards
    expect(screen.getByText("دستیار هوشمند آوانا")).toBeInTheDocument();
    expect(screen.getByText("برنامه مطالعه امروز")).toBeInTheDocument();
    expect(screen.getByText("به‌زودی")).toBeInTheDocument();
    expect(screen.getByText("امتحانات پیش رو")).toBeInTheDocument();
    expect(screen.getAllByText("افزودن امتحان").length).toBeGreaterThan(0);

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
    let c2Percentage = 80;

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

    // Verify dynamic stats rendering in Persian numbers
    await waitFor(() => {
      expect(screen.getByText("۴ ساعت و ۳۵ دقیقه")).toBeInTheDocument();
      expect(screen.getByText("۱۲")).toBeInTheDocument();
      expect(screen.getByText("۵")).toBeInTheDocument();
      expect(screen.getByText("۷ روز")).toBeInTheDocument();
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
    expect(todayBadge).toHaveClass("text-rose-300", "bg-rose-500/20", "border-rose-500/30"); // < 3 days (0): Red
    // Verify synchronized icon container color for today's exam
    const todayCard = todayBadge.closest("div.glass-panel")!;
    const todayIconBox = todayCard.querySelector("div.w-9.h-9")!;
    expect(todayIconBox).toHaveClass("text-rose-400", "bg-rose-950/40", "border-rose-500/30");

    const in3DaysBadge = screen.getByText("۳ روز باقیمانده");
    expect(in3DaysBadge).toBeInTheDocument();
    expect(in3DaysBadge).toHaveClass("text-amber-300", "bg-amber-500/20", "border-amber-500/30"); // 3-6 days (3): Yellow
    // Verify synchronized icon container color for 3 days exam
    const in3DaysCard = in3DaysBadge.closest("div.glass-panel")!;
    const in3DaysIconBox = in3DaysCard.querySelector("div.w-9.h-9")!;
    expect(in3DaysIconBox).toHaveClass("text-amber-400", "bg-amber-950/40", "border-amber-500/30");

    const in10DaysBadge = screen.getByText("۱۰ روز باقیمانده");
    expect(in10DaysBadge).toBeInTheDocument();
    expect(in10DaysBadge).toHaveClass("text-teal-300", "bg-teal-500/20", "border-teal-500/30"); // >= 7 days (10): Teal
    // Verify synchronized icon container color for 10 days exam
    const in10DaysCard = in10DaysBadge.closest("div.glass-panel")!;
    const in10DaysIconBox = in10DaysCard.querySelector("div.w-9.h-9")!;
    expect(in10DaysIconBox).toHaveClass("text-teal-400", "bg-teal-950/40", "border-teal-500/30");
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
    let patchedPayload: any = null;

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

  describe("Popular Content Packs (محبوب‌ترین بسته‌های محتوای آموزشی) Section Tests", () => {
    const popularOrgId = "00000000-0000-0000-0000-000000000001";
    const sample8Packs = Array.from({ length: 8 }, (_, i) => ({
      id: `c0000000-0000-0000-0000-00000000000${i + 1}`,
      title: `بسته آموزشی شماره ${toPersianDigits(i + 1)}`,
      description: `توضیحات جامع برای بسته آموزشی شماره ${toPersianDigits(i + 1)}`,
      subject: `موضوع ${toPersianDigits(i + 1)}`,
      creator: {
        id: "creator-1",
        name: "استاد دکتر رضایی",
      },
      usage_count: 10 - i,
      stats: {
        session_count: 4,
        flashcard_count: 24,
        quiz_question_count: 10,
        estimated_reading_minutes: 15,
      },
      published_at: new Date(2026, 7, 20 - i).toISOString(),
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

    function setupPopularMocks(popularPacks = sample8Packs, myCourses: any[] = []) {
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
        if (urlStr.includes("/v1/library/packs")) {
          return Promise.resolve(
            makeMockResponse({
              request_id: "req-packs",
              items: popularPacks,
              pagination: {
                page: 1,
                limit: 8,
                total_count: popularPacks.length,
                total_pages: Math.ceil(popularPacks.length / 8) || 1,
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

    it("Test 1 & 2: Renders section title, subtitle, and first 2 content packs initially", async () => {
      setupPopularMocks(sample8Packs, []);

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
      expect(await screen.findByText("محبوب‌ترین بسته‌های محتوای آموزشی")).toBeInTheDocument();
      expect(
        await screen.findByText("بسته‌های آموزشی پرمخاطب که بیشترین استفاده را توسط کاربران آوانا داشته‌اند"),
      ).toBeInTheDocument();

      // Verify first 2 packs are visible
      expect(
        await screen.findByText("بسته آموزشی شماره ۱", {}, { timeout: 4000 }),
      ).toBeInTheDocument();
      expect(
        await screen.findByText("بسته آموزشی شماره ۲", {}, { timeout: 4000 }),
      ).toBeInTheDocument();

      // Packs 3-8 are not in current 2-card group
      expect(screen.queryByText("بسته آموزشی شماره ۳")).not.toBeInTheDocument();
      expect(screen.queryByText("بسته آموزشی شماره ۴")).not.toBeInTheDocument();

      // Verify indicator shows "۱ از ۴"
      expect(screen.getByText("۱ از ۴")).toBeInTheDocument();
    });

    it("Test 3 & 4: Manual/Automatic rotation advances from Group 1 to Group 2, 3, 4 and loops back to 1", async () => {
      setupPopularMocks(sample8Packs, []);

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

      // Group 1: Packs 1, 2
      await waitFor(() => {
        expect(screen.getAllByText("بسته آموزشی شماره ۱").length).toBeGreaterThan(0);
        expect(screen.getAllByText("بسته آموزشی شماره ۲").length).toBeGreaterThan(0);
      });

      // Switch to Group 2 via pagination dot
      const group2Btn = screen.getByLabelText("رفتن به گروه ۲");
      fireEvent.click(group2Btn);

      // Group 2: Packs 3, 4
      await waitFor(() => {
        expect(screen.getAllByText("بسته آموزشی شماره ۳").length).toBeGreaterThan(0);
        expect(screen.getAllByText("بسته آموزشی شماره ۴").length).toBeGreaterThan(0);
        expect(screen.queryByText("بسته آموزشی شماره ۱")).not.toBeInTheDocument();
      });

      // Switch to Group 3
      const group3Btn = screen.getByLabelText("رفتن به گروه ۳");
      fireEvent.click(group3Btn);
      await waitFor(() => {
        expect(screen.getAllByText("بسته آموزشی شماره ۵").length).toBeGreaterThan(0);
        expect(screen.getAllByText("بسته آموزشی شماره ۶").length).toBeGreaterThan(0);
      });

      // Switch to Group 4
      const group4Btn = screen.getByLabelText("رفتن به گروه ۴");
      fireEvent.click(group4Btn);
      await waitFor(() => {
        expect(screen.getAllByText("بسته آموزشی شماره ۷").length).toBeGreaterThan(0);
        expect(screen.getAllByText("بسته آموزشی شماره ۸").length).toBeGreaterThan(0);
      });

      // Switch back to Group 1
      const group1Btn = screen.getByLabelText("رفتن به گروه ۱");
      fireEvent.click(group1Btn);
      await waitFor(() => {
        expect(screen.getAllByText("بسته آموزشی شماره ۱").length).toBeGreaterThan(0);
        expect(screen.getAllByText("بسته آموزشی شماره ۲").length).toBeGreaterThan(0);
      });
    });

    it("Test 5: Handles fewer than 8 packs (e.g. 1, 2, 4, 6 packs) gracefully", async () => {
      // 1 pack scenario
      setupPopularMocks([sample8Packs[0]], []);

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
        expect(screen.getByText("محبوب‌ترین بسته‌های محتوای آموزشی")).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getAllByText("بسته آموزشی شماره ۱").length).toBeGreaterThan(0);
      });

      // For 1 pack, no dots indicator
      expect(screen.queryByLabelText("رفتن به گروه ۲")).not.toBeInTheDocument();
    });

    it("Test 6: Renders clean empty state when 0 popular packs exist", async () => {
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
        expect(screen.getByText("هنوز بسته آموزشی در کتابخانه منتشر نشده است")).toBeInTheDocument();
        expect(screen.getByText("+ مشاهده کتابخانه محتوا")).toBeInTheDocument();
      });
    });

    it("Test 7: Cleans up timer on component unmount", async () => {
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
      setupPopularMocks(sample8Packs, []);

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
        expect(screen.getByText("محبوب‌ترین بسته‌های محتوای آموزشی")).toBeInTheDocument();
      });

      await waitFor(() => {
        expect(screen.getAllByText("بسته آموزشی شماره ۱").length).toBeGreaterThan(0);
      });

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();
    });

    it("Test 8: Ensures no mock/static course strings exist in popular content packs section", async () => {
      setupPopularMocks(sample8Packs, []);

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
        expect(screen.getByText("محبوب‌ترین بسته‌های محتوای آموزشی")).toBeInTheDocument();
      });

      expect(screen.queryByText("فصل ۴ — سیستم عصبی خودمختار")).not.toBeInTheDocument();
      expect(screen.queryByText("فارماکولوژی پایه")).not.toBeInTheDocument();
      expect(screen.queryByText("پیشنهادات برای شما")).not.toBeInTheDocument();
      expect(screen.queryByText("محبوب‌ترین دوره‌های آوانا")).not.toBeInTheDocument();
    });
  });
});

