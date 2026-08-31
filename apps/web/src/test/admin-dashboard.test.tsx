/**
 * Admin Dashboard Tests (Phase 3).
 *
 * Verifies:
 *  - Case 1: Platform Admin Dashboard renders inside Admin Shell
 *  - Case 2: KPI Data renders known values accurately (Users, Courses, Lessons, Flashcards, Quizzes, Documents, AI metrics)
 *  - Case 3: Loading skeleton state is displayed while dashboard queries are pending
 *  - Case 4: Zero / Empty data state handles cleanly without crashing or NaN
 *  - Case 5: API error state renders error message and retry button without crashing shell
 *  - Case 6: System health status widget renders live status badges
 *  - Case 7: Recent activity section renders real audit log rows
 *  - Case 8: Quick action navigation shortcuts link to existing admin routes
 *  - Case 9: Student / Non-admin user is blocked from dashboard (regression)
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";
import { AdminLayout } from "../components/shell/AdminLayout.js";
import { AdminDashboardPage } from "../pages/admin/AdminDashboardPage.js";

const mockUserData = {
  id: "admin-1",
  email: "admin@avana.test",
  name: "Platform Admin User",
  role: "platform_admin" as const,
};

const mockDashboardStats = {
  totalUsers: 1420,
  newUsersToday: 18,
  totalCourses: 12,
  totalLessons: 84,
  totalFlashcards: 520,
  totalQuizzes: 45,
  totalDocuments: 38,
  generationSuccessRate: 96,
  generationsToday: 64,
};

const mockSystemHealth = {
  database: "healthy" as const,
  redis: "healthy" as const,
  ai: "healthy" as const,
  lastCheck: "2026-08-23T12:00:00.000Z",
};

const mockAuditLogs = {
  logs: [
    {
      id: "audit-1",
      adminEmail: "admin@avana.test",
      action: "update_user_role",
      entity: "user",
      entityId: "u-101",
      timestamp: "2026-08-23T11:45:00.000Z",
      metadata: { newRole: "teacher" },
    },
    {
      id: "audit-2",
      adminEmail: "admin@avana.test",
      action: "retry_document",
      entity: "document",
      entityId: "doc-55",
      timestamp: "2026-08-23T10:30:00.000Z",
      metadata: {},
    },
  ],
  totalCount: 2,
};

function setupMockFetch(options: {
  user?: typeof mockUserData | null;
  stats?: typeof mockDashboardStats | null;
  health?: typeof mockSystemHealth | null;
  audit?: typeof mockAuditLogs | null;
  delayStats?: boolean;
  failStats?: boolean;
  failHealth?: boolean;
} = {}) {
  const {
    user = mockUserData,
    stats = mockDashboardStats,
    health = mockSystemHealth,
    audit = mockAuditLogs,
    delayStats = false,
    failStats = false,
    failHealth = false,
  } = options;

  return vi.fn().mockImplementation((url: string) => {
    // Auth endpoints
    if (url.includes("/v1/auth/me") || url.includes("/v1/me")) {
      if (!user) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: "unauthorized", message: "Not authenticated" } }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ user }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    // Dashboard Stats
    if (url.includes("/v1/admin/dashboard")) {
      if (failStats) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: "internal_error", message: "Server error" } }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      if (delayStats) {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              new Response(
                JSON.stringify(stats),
                { status: 200, headers: { "Content-Type": "application/json" } }
              )
            );
          }, 1000);
        });
      }
      return Promise.resolve(
        new Response(
          JSON.stringify(stats),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    // System Health
    if (url.includes("/v1/admin/system/health")) {
      if (failHealth) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: "internal_error" } }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify(health),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    // Audit Logs
    if (url.includes("/v1/admin/system/audit")) {
      return Promise.resolve(
        new Response(
          JSON.stringify(audit),
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
}

function renderDashboard({ initialEntries = ["/admin/dashboard"] }: { initialEntries?: string[] } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={initialEntries}>
          <Routes>
            <Route path="/home" element={<div data-testid="student-home">صفحه خانه دانشجو</div>} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="dashboard" element={<AdminDashboardPage />} />
              <Route path="users" element={<div data-testid="users-page">مدیریت کاربران</div>} />
              <Route path="courses" element={<div data-testid="courses-page">دوره‌ها</div>} />
              <Route path="content" element={<div data-testid="content-page">مدیریت محتوا</div>} />
              <Route path="documents" element={<div data-testid="documents-page">فایل‌ها و اسناد</div>} />
              <Route path="generation" element={<div data-testid="generation-page">تاریخچه تولیدات</div>} />
              <Route path="system/health" element={<div data-testid="health-page">سلامت سیستم</div>} />
              <Route path="system/audit" element={<div data-testid="audit-page">گزارش حسابرسی</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("Admin Dashboard — Phase 3", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("Case 1 — Platform Admin Dashboard renders inside Admin Shell", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(setupMockFetch());

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText("داشبورد مدیریت").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("نمای عملیاتی پلتفرم")).toBeInTheDocument();
      expect(screen.getByText("وضعیت کلی کاربران، محتوای آموزشی، پردازش‌های هوش مصنوعی و زیرساخت")).toBeInTheDocument();
    });
  });

  it("Case 2 — KPI Data renders known values accurately", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(setupMockFetch());

    renderDashboard();

    await waitFor(() => {
      // Primary KPI metrics
      expect(screen.getByRole("heading", { name: /۱[٬,]۴۲۰/ })).toBeInTheDocument(); // totalUsers
      expect(screen.getByText(/۱۸ کاربر جدید امروز/)).toBeInTheDocument(); // newUsersToday
      expect(screen.getByRole("heading", { name: "۱۲" })).toBeInTheDocument(); // totalCourses
      expect(screen.getByText(/۸۴ درس فعال/)).toBeInTheDocument(); // totalLessons
      expect(screen.getByRole("heading", { name: "۳۸" })).toBeInTheDocument(); // totalDocuments
      expect(screen.getByRole("heading", { name: "۶۴" })).toBeInTheDocument(); // generationsToday
      expect(screen.getByText(/نرخ موفقیت: 96%/)).toBeInTheDocument();

      // Content Hierarchy
      expect(screen.getByText("۵۲۰")).toBeInTheDocument(); // totalFlashcards
      expect(screen.getByText("۴۵")).toBeInTheDocument(); // totalQuizzes
    });
  });

  it("Case 3 — Loading skeleton state is displayed while dashboard queries are pending", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(setupMockFetch({ delayStats: true }));

    renderDashboard();

    // While auth resolves then stats query is pending, skeleton pulses exist
    await waitFor(() => {
      expect(document.querySelector(".animate-pulse")).not.toBeNull();
    });
  });

  it("Case 4 — Empty / Zero data state handles cleanly without crashing or NaN", async () => {
    const zeroStats = {
      totalUsers: 0,
      newUsersToday: 0,
      totalCourses: 0,
      totalLessons: 0,
      totalFlashcards: 0,
      totalQuizzes: 0,
      totalDocuments: 0,
      generationSuccessRate: 0,
      generationsToday: 0,
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(
      setupMockFetch({ stats: zeroStats, audit: { logs: [], totalCount: 0 } })
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText(/۰/).length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/۰ کاربر جدید امروز/)).toBeInTheDocument();
      expect(screen.getByText("بدون درخواست امروز")).toBeInTheDocument();
      expect(screen.getByText("هیچ فعالیت اخیری ثبت نشده است.")).toBeInTheDocument();
      expect(screen.queryByText("NaN")).not.toBeInTheDocument();
      expect(screen.queryByText("undefined")).not.toBeInTheDocument();
    });
  });

  it("Case 5 — API error state renders error message and retry button without crashing shell", async () => {
    const mockFetch = setupMockFetch({ failStats: true });
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("خطا در دریافت اطلاعات داشبورد")).toBeInTheDocument();
      expect(screen.getByText("امکان ارتباط با سرور یا دریافت شاخص‌های عملیاتی وجود ندارد.")).toBeInTheDocument();
      expect(screen.getByText("تلاش مجدد")).toBeInTheDocument();
    });

    // Shell header remains rendered
    expect(screen.getAllByText("آوانا ادمین").length).toBeGreaterThanOrEqual(1);

    // Clicking retry refetches
    const retryBtn = screen.getByText("تلاش مجدد");
    fireEvent.click(retryBtn);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/admin/dashboard"),
      expect.any(Object)
    );
  });

  it("Case 6 — System health widget renders live status badges", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(setupMockFetch());

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("سلامت سرویس‌های زیرساخت")).toBeInTheDocument();
      expect(screen.getByText("پایگاه داده (PostgreSQL)")).toBeInTheDocument();
      expect(screen.getByText("حافظه پنهان (Redis)")).toBeInTheDocument();
      expect(screen.getByText("سرویس هوش مصنوعی (AI Provider)")).toBeInTheDocument();
      expect(screen.getAllByText("healthy").length).toBe(3);
    });
  });

  it("Case 7 — Recent activity section renders real audit log rows", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(setupMockFetch());

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("آخرین فعالیت‌های سیستمی")).toBeInTheDocument();
      expect(screen.getByText("update_user_role")).toBeInTheDocument();
      expect(screen.getByText("retry_document")).toBeInTheDocument();
      expect(screen.getByText("مجموع لاگ‌های ثبت‌شده:")).toBeInTheDocument();
    });
  });

  it("Case 8 — Quick action navigation shortcuts link to existing admin routes", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(setupMockFetch());

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("مدیریت کاربران")).toBeInTheDocument();
    });

    const usersQuickNav = screen.getByRole("link", { name: /مدیریت کاربران/i });
    expect(usersQuickNav).toHaveAttribute("href", "/admin/users");

    fireEvent.click(usersQuickNav);

    await waitFor(() => {
      expect(screen.getByTestId("users-page")).toBeInTheDocument();
    });
  });

  it("Case 9 — Non-admin (student) user is blocked and redirected to /home", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      setupMockFetch({
        user: {
          id: "student-1",
          email: "student@avana.test",
          name: "Student",
          role: "student",
        },
      })
    );

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByTestId("student-home")).toBeInTheDocument();
      expect(screen.queryByText("داشبورد مدیریت")).not.toBeInTheDocument();
    });
  });
});
