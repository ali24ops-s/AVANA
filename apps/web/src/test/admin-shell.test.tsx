/**
 * Admin Shell & Navigation Architecture Tests.
 *
 * Verifies:
 *  - Platform Admin sees 7 workspaces in sidebar
 *  - Content Worker sees exactly 2 workspaces (Courses, Blog)
 *  - Deep admin routes render with appropriate breadcrumbs and active nav items
 *  - Students / Non-admin users are denied and redirected to /home
 *  - Unauthenticated users are redirected to /sign-in
 *  - Navigation active state detection works across workspaces and nested routes
 *  - Responsive mobile navigation drawer opens, navigates, and closes on Escape
 *  - Collapsible desktop sidebar toggles
 *  - Sign out triggers auth signOut mechanism
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";
import { AdminLayout } from "../components/shell/AdminLayout.js";
import { ProtectedRoute } from "../components/shell/ProtectedRoute.js";
import {
  isNavItemActive,
  getAdminPageInfo,
  getVisibleNavItems,
  PLATFORM_ADMIN_NAV_ITEMS,
  CONTENT_WORKER_NAV_ITEMS,
} from "../components/admin/adminNavigation.js";
import type { ReactNode } from "react";

function createMockFetch(userData: {
  id: string;
  email: string;
  name?: string;
  role: "platform_admin" | "content_worker" | "student";
} | null) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes("/v1/auth/sign-out")) {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }

    if (!userData) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            request_id: "req-unauth",
            error: { code: "unauthorized", message: "Not authenticated" },
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        ),
      );
    }

    return Promise.resolve(
      new Response(
        JSON.stringify({
          request_id: "req-auth",
          user: userData,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
  });
}

function renderWithProviders(
  ui: ReactNode,
  { initialEntries = ["/admin/dashboard"] }: { initialEntries?: string[] } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("Admin Shell & Navigation Architecture", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("Case 1 — renders Admin Shell with exactly 7 workspaces for platform_admin user", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch({
        id: "admin-1",
        email: "admin@avana.test",
        name: "Platform Admin User",
        role: "platform_admin",
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route
            path="dashboard"
            element={<div data-testid="dashboard-content">محتوای داشبورد</div>}
          />
        </Route>
      </Routes>,
      { initialEntries: ["/admin/dashboard"] },
    );

    // Initial auth loading indicator
    expect(screen.getByText("در حال بارگذاری پنل مدیریت...")).toBeInTheDocument();

    // After auth resolved: Shell elements and 7 workspaces are rendered
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-content")).toBeInTheDocument();
      expect(screen.getAllByText("آوانا ادمین").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("مدیر ارشد پلتفرم")).toBeInTheDocument();
      expect(screen.getByText("Platform Admin User")).toBeInTheDocument();
    });

    // Check 7 workspaces for platform_admin
    const platformItems = getVisibleNavItems("platform_admin");
    expect(platformItems).toHaveLength(7);
    expect(platformItems.map((i) => i.name)).toEqual([
      "داشبورد و آمار",
      "آموزش و دوره‌ها",
      "کاربران و دسترسی‌ها",
      "امور مالی و فروش",
      "مقالات و وبلاگ",
      "مرکز هوش مصنوعی",
      "سیستم و نظارت",
    ]);

    // Check links in desktop sidebar
    const desktopNav = screen.getByRole("complementary", { name: "ناوبری مدیریت" });
    expect(desktopNav.querySelectorAll('a[href="/admin/dashboard"]')).toHaveLength(1);
    expect(desktopNav.querySelectorAll('a[href="/admin/courses"]')).toHaveLength(1);
    expect(desktopNav.querySelectorAll('a[href="/admin/users"]')).toHaveLength(1);
    expect(desktopNav.querySelectorAll('a[href="/admin/commerce"]')).toHaveLength(1);
    expect(desktopNav.querySelectorAll('a[href="/admin/blog"]')).toHaveLength(1);
    expect(desktopNav.querySelectorAll('a[href="/admin/generation"]')).toHaveLength(1);
    expect(desktopNav.querySelectorAll('a[href="/admin/system/health"]')).toHaveLength(1);
  });

  it("Case 2 — renders Admin Shell with exactly 2 workspaces for content_worker", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch({
        id: "worker-1",
        email: "worker@avana.test",
        name: "Content Worker User",
        role: "content_worker",
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route
            path="courses"
            element={<div data-testid="courses-content">محتوای دوره‌ها</div>}
          />
        </Route>
      </Routes>,
      { initialEntries: ["/admin/courses"] },
    );

    await waitFor(() => {
      expect(screen.getByTestId("courses-content")).toBeInTheDocument();
    });

    const workerItems = getVisibleNavItems("content_worker");
    expect(workerItems).toHaveLength(2);
    expect(workerItems.map((i) => i.name)).toEqual([
      "آموزش و دوره‌ها",
      "مقالات و وبلاگ",
    ]);

    const desktopNav = screen.getByRole("complementary", { name: "ناوبری مدیریت" });
    expect(desktopNav.querySelectorAll('a[href="/admin/courses"]')).toHaveLength(1);
    expect(desktopNav.querySelectorAll('a[href="/admin/blog"]')).toHaveLength(1);
    expect(desktopNav.querySelectorAll('a[href="/admin/dashboard"]')).toHaveLength(0);
    expect(desktopNav.querySelectorAll('a[href="/admin/users"]')).toHaveLength(0);
  });

  it("Case 3 — deep admin route renders inside Admin Shell with proper breadcrumb", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch({
        id: "admin-1",
        email: "admin@avana.test",
        name: "Platform Admin User",
        role: "platform_admin",
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route
            path="users"
            element={<div data-testid="users-content">جدول مدیریت کاربران</div>}
          />
        </Route>
      </Routes>,
      { initialEntries: ["/admin/users"] },
    );

    await waitFor(() => {
      expect(screen.getByTestId("users-content")).toBeInTheDocument();
      const breadcrumbNav = screen.getByLabelText("مسیر راهنما");
      expect(breadcrumbNav).toBeInTheDocument();
      expect(breadcrumbNav).toHaveTextContent("پنل مدیریت");
      expect(breadcrumbNav).toHaveTextContent("کاربران و دسترسی‌ها");
    });
  });

  it("Case 4 — redirects student / non-admin user to /home", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch({
        id: "student-1",
        email: "student@avana.test",
        role: "student",
      }),
    );

    renderWithProviders(
      <Routes>
        <Route
          path="/home"
          element={<div data-testid="student-home">صفحه خانه دانشجو</div>}
        />
        <Route path="/admin" element={<AdminLayout />}>
          <Route
            path="dashboard"
            element={<div data-testid="dashboard-content">محتوای ادمین</div>}
          />
        </Route>
      </Routes>,
      { initialEntries: ["/admin/dashboard"] },
    );

    await waitFor(() => {
      expect(screen.getByTestId("student-home")).toBeInTheDocument();
      expect(screen.queryByTestId("dashboard-content")).not.toBeInTheDocument();
    });
  });

  it("Case 5 — redirects unauthenticated visitor to /sign-in via ProtectedRoute", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(createMockFetch(null));

    renderWithProviders(
      <Routes>
        <Route
          path="/sign-in"
          element={<div data-testid="sign-in-page">صفحه ورود</div>}
        />
        <Route element={<ProtectedRoute />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route
              path="dashboard"
              element={<div data-testid="dashboard-content">محتوای ادمین</div>}
            />
          </Route>
        </Route>
      </Routes>,
      { initialEntries: ["/admin/dashboard"] },
    );

    await waitFor(() => {
      expect(screen.getByTestId("sign-in-page")).toBeInTheDocument();
      expect(screen.queryByTestId("dashboard-content")).not.toBeInTheDocument();
    });
  });

  it("Case 6 — workspace active state and route matching logic across sub-routes", () => {
    // 1. Dashboard workspace active on analytics sub-routes
    expect(isNavItemActive("/admin/dashboard", "/admin/dashboard")).toBe(true);
    expect(isNavItemActive("/admin/dashboard", "/admin/analytics")).toBe(true);
    expect(isNavItemActive("/admin/dashboard", "/admin/analytics/ai")).toBe(true);
    expect(isNavItemActive("/admin/courses", "/admin/analytics")).toBe(false);

    // 2. Education workspace active on studio, content, documents, and community-content
    expect(isNavItemActive("/admin/courses", "/admin/courses")).toBe(true);
    expect(isNavItemActive("/admin/courses", "/admin/courses/c-123")).toBe(true);
    expect(isNavItemActive("/admin/courses", "/admin/content-studio")).toBe(true);
    expect(isNavItemActive("/admin/courses", "/admin/content-studio/c-123")).toBe(true);
    expect(isNavItemActive("/admin/courses", "/admin/content")).toBe(true);
    expect(isNavItemActive("/admin/courses", "/admin/documents")).toBe(true);
    expect(isNavItemActive("/admin/courses", "/admin/documents/doc-abc")).toBe(true);
    expect(isNavItemActive("/admin/courses", "/admin/community-content")).toBe(true);
    expect(isNavItemActive("/admin/courses", "/admin/community-content/rev-1")).toBe(true);
    expect(isNavItemActive("/admin/users", "/admin/documents")).toBe(false);

    // 3. Users workspace
    expect(isNavItemActive("/admin/users", "/admin/users")).toBe(true);
    expect(isNavItemActive("/admin/users", "/admin/users/u-123")).toBe(true);
    expect(isNavItemActive("/admin/courses", "/admin/users")).toBe(false);

    // 4. Commerce workspace active on orders, payments, subscriptions, entitlements, products
    expect(isNavItemActive("/admin/commerce", "/admin/commerce")).toBe(true);
    expect(isNavItemActive("/admin/commerce", "/admin/commerce/orders")).toBe(true);
    expect(isNavItemActive("/admin/commerce", "/admin/commerce/payments")).toBe(true);
    expect(isNavItemActive("/admin/commerce", "/admin/commerce/subscriptions")).toBe(true);
    expect(isNavItemActive("/admin/commerce", "/admin/commerce/entitlements")).toBe(true);
    expect(isNavItemActive("/admin/commerce", "/admin/commerce/products")).toBe(true);

    // 5. Blog workspace
    expect(isNavItemActive("/admin/blog", "/admin/blog")).toBe(true);
    expect(isNavItemActive("/admin/blog", "/admin/blog/new")).toBe(true);
    expect(isNavItemActive("/admin/blog", "/admin/blog/p-1/edit")).toBe(true);
    expect(isNavItemActive("/admin/blog", "/admin/blog/p-1/preview")).toBe(true);

    // 6. AI Generation workspace
    expect(isNavItemActive("/admin/generation", "/admin/generation")).toBe(true);
    expect(isNavItemActive("/admin/generation", "/admin/generation/providers")).toBe(true);
    expect(isNavItemActive("/admin/generation", "/admin/generation/prompts")).toBe(true);
    expect(isNavItemActive("/admin/generation", "/admin/generation/job-123")).toBe(true);

    // 7. System workspace active on system subroutes and settings
    expect(isNavItemActive("/admin/system/health", "/admin/system/health")).toBe(true);
    expect(isNavItemActive("/admin/system/health", "/admin/system/integrity")).toBe(true);
    expect(isNavItemActive("/admin/system/health", "/admin/system/logs")).toBe(true);
    expect(isNavItemActive("/admin/system/health", "/admin/system/audit")).toBe(true);
    expect(isNavItemActive("/admin/system/health", "/admin/settings")).toBe(true);

    // Breadcrumbs generation
    const dashboardInfo = getAdminPageInfo("/admin/dashboard");
    expect(dashboardInfo.title).toBe("داشبورد و آمار");
    expect(dashboardInfo.breadcrumbs).toHaveLength(2);

    const docDetailInfo = getAdminPageInfo("/admin/documents/doc-123");
    expect(docDetailInfo.title).toBe("جزئیات سند");
    expect(docDetailInfo.breadcrumbs.some((b) => b.label === "آموزش و دوره‌ها")).toBe(true);
    expect(docDetailInfo.breadcrumbs.some((b) => b.label === "فایل‌ها و اسناد")).toBe(true);

    const studioInfo = getAdminPageInfo("/admin/content-studio/c-123");
    expect(studioInfo.title).toBe("ویرایش دوره در استودیو");
    expect(studioInfo.breadcrumbs.some((b) => b.label === "استودیو محتوای رسمی")).toBe(true);
  });

  it("Case 7 — responsive mobile navigation drawer opens, navigates, and closes on Escape", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch({
        id: "admin-1",
        email: "admin@avana.test",
        role: "platform_admin",
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route
            path="dashboard"
            element={<div data-testid="dashboard-content">محتوای داشبورد</div>}
          />
          <Route
            path="users"
            element={<div data-testid="users-content">محتوای کاربران</div>}
          />
        </Route>
      </Routes>,
      { initialEntries: ["/admin/dashboard"] },
    );

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-content")).toBeInTheDocument();
    });

    // Open mobile menu
    const openMenuBtn = screen.getByLabelText("باز کردن منوی مدیریت");
    fireEvent.click(openMenuBtn);

    // Mobile drawer is open
    expect(screen.getByLabelText("ناوبری مدیریت موبایل")).toHaveClass("translate-x-0");

    // Close on Escape key
    fireEvent.keyDown(window, { key: "Escape" });
    // After escape, drawer is closed
    expect(screen.getByLabelText("ناوبری مدیریت موبایل")).toHaveClass("translate-x-full");

    // Open again and click a link to navigate and close
    fireEvent.click(openMenuBtn);
    const usersLink = screen
      .getByLabelText("ناوبری مدیریت موبایل")
      .querySelector('a[href="/admin/users"]');
    expect(usersLink).not.toBeNull();
    if (usersLink) {
      fireEvent.click(usersLink);
    }

    await waitFor(() => {
      expect(screen.getByTestId("users-content")).toBeInTheDocument();
      expect(screen.getByLabelText("ناوبری مدیریت موبایل")).toHaveClass("translate-x-full");
    });
  });

  it("Case 8 — desktop sidebar collapse toggle collapses and expands sidebar", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      createMockFetch({
        id: "admin-1",
        email: "admin@avana.test",
        role: "platform_admin",
      }),
    );

    renderWithProviders(
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route
            path="dashboard"
            element={<div data-testid="dashboard-content">داشبورد</div>}
          />
        </Route>
      </Routes>,
      { initialEntries: ["/admin/dashboard"] },
    );

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-content")).toBeInTheDocument();
    });

    const collapseBtn = screen.getByLabelText("جمع کردن نوار کناری");
    expect(collapseBtn).toBeInTheDocument();

    // Click collapse
    fireEvent.click(collapseBtn);
    expect(screen.getByLabelText("گسترش نوار کناری")).toBeInTheDocument();

    // Click expand
    fireEvent.click(screen.getByLabelText("گسترش نوار کناری"));
    expect(screen.getByLabelText("جمع کردن نوار کناری")).toBeInTheDocument();
  });

  it("Case 9 — sign out in Admin Shell invokes auth signOut", async () => {
    const mockFetch = createMockFetch({
      id: "admin-1",
      email: "admin@avana.test",
      role: "platform_admin",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);

    renderWithProviders(
      <Routes>
        <Route
          path="/home"
          element={<div data-testid="home-page">صفحه خانه</div>}
        />
        <Route path="/admin" element={<AdminLayout />}>
          <Route
            path="dashboard"
            element={<div data-testid="dashboard-content">داشبورد</div>}
          />
        </Route>
      </Routes>,
      { initialEntries: ["/admin/dashboard"] },
    );

    await waitFor(() => {
      expect(screen.getByTestId("dashboard-content")).toBeInTheDocument();
    });

    const signOutButtons = screen.getAllByLabelText("خروج از حساب");
    expect(signOutButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(signOutButtons[0]);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/v1/auth/sign-out"),
        expect.any(Object),
      );
    });
  });
});
