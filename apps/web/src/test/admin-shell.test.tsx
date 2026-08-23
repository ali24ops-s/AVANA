/**
 * Admin Shell & Navigation Architecture Tests.
 *
 * Verifies:
 *  - Platform Admin can access Admin Shell
 *  - Deep admin routes render with appropriate breadcrumbs and active nav items
 *  - Students / Non-admin users are denied and redirected to /home
 *  - Unauthenticated users are redirected to /sign-in
 *  - Navigation active state detection works across exact and nested routes
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
  ADMIN_NAV_GROUPS,
} from "../components/admin/adminNavigation.js";
import type { ReactNode } from "react";

function createMockFetch(userData: {
  id: string;
  email: string;
  name?: string;
  role: "platform_admin" | "student";
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

describe("Admin Shell & Navigation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("Case 1 — renders Admin Shell for platform_admin user", async () => {
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

    // After auth resolved: Shell elements are rendered
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-content")).toBeInTheDocument();
      expect(screen.getAllByText("آوانا ادمین").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("مدیر ارشد پلتفرم")).toBeInTheDocument();
      expect(screen.getByText("Platform Admin User")).toBeInTheDocument();
    });
  });

  it("Case 2 — deep admin route renders inside Admin Shell with proper breadcrumb", async () => {
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
      expect(screen.getByLabelText("مسیر راهنما")).toBeInTheDocument();
      expect(screen.getByText("پنل مدیریت")).toBeInTheDocument();
    });
  });

  it("Case 3 — redirects student / non-admin user to /home", async () => {
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

  it("Case 4 — redirects unauthenticated visitor to /sign-in via ProtectedRoute", async () => {
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

  it("Case 5 — navigation active state and route matching logic", () => {
    const allHrefs = ADMIN_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));

    // Exact matches
    expect(isNavItemActive("/admin/dashboard", "/admin/dashboard", allHrefs)).toBe(true);
    expect(isNavItemActive("/admin/users", "/admin/users", allHrefs)).toBe(true);

    // Sibling sub-routes without false prefix collision
    expect(isNavItemActive("/admin/analytics", "/admin/analytics/ai", allHrefs)).toBe(false);
    expect(isNavItemActive("/admin/analytics/ai", "/admin/analytics/ai", allHrefs)).toBe(true);

    expect(isNavItemActive("/admin/generation", "/admin/generation/providers", allHrefs)).toBe(false);
    expect(isNavItemActive("/admin/generation/providers", "/admin/generation/providers", allHrefs)).toBe(true);

    // Deep detail route
    expect(isNavItemActive("/admin/documents", "/admin/documents/doc-abc", allHrefs)).toBe(true);
    expect(isNavItemActive("/admin/generation", "/admin/generation/job-123", allHrefs)).toBe(true);

    // Breadcrumbs generation
    const dashboardInfo = getAdminPageInfo("/admin/dashboard");
    expect(dashboardInfo.title).toBe("داشبورد");
    expect(dashboardInfo.breadcrumbs.length).toBe(2);

    const docDetailInfo = getAdminPageInfo("/admin/documents/doc-123");
    expect(docDetailInfo.title).toContain("جزئیات");
    expect(docDetailInfo.breadcrumbs.some((b) => b.label === "فایل‌ها و اسناد")).toBe(true);
  });

  it("Case 6 — responsive mobile navigation drawer opens, navigates, and closes on Escape", async () => {
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
    const usersLink = screen.getByLabelText("ناوبری مدیریت موبایل").querySelector('a[href="/admin/users"]');
    expect(usersLink).not.toBeNull();
    if (usersLink) {
      fireEvent.click(usersLink);
    }

    await waitFor(() => {
      expect(screen.getByTestId("users-content")).toBeInTheDocument();
      expect(screen.getByLabelText("ناوبری مدیریت موبایل")).toHaveClass("translate-x-full");
    });
  });

  it("Case 7 — desktop sidebar collapse toggle collapses and expands sidebar", async () => {
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

  it("Case 8 — sign out in Admin Shell invokes auth signOut", async () => {
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
