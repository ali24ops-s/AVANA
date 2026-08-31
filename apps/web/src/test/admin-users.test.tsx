/**
 * Admin Users Tests (Phase 4).
 *
 * Verifies:
 *  - Case 1: Platform Admin Users Page renders
 *  - Case 2: User Data renders correctly
 *  - Case 3: Search queries users correctly
 *  - Case 4: Role filter works
 *  - Case 5: Empty Result handles cleanly
 *  - Case 6: Loading state displays
 *  - Case 7: API Error state handles cleanly
 *  - Case 8: Pagination works correctly
 *  - Case 9: Existing action (Role Change) invokes API
 *  - Case 10: Non Admin is blocked
 */

import * as React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";
import { AdminLayout } from "../components/shell/AdminLayout.js";
import { AdminUsersPage } from "../pages/admin/AdminUsersPage.js";

const mockUserData = {
  id: "admin-1",
  email: "admin@avana.test",
  name: "Platform Admin User",
  role: "platform_admin" as const,
};

const mockUsersList = {
  users: [
    {
      id: "u-101",
      email: "student1@avana.test",
      name: "Student One",
      role: "student",
      emailVerified: true,
      createdAt: "2026-08-01T10:00:00.000Z",
    },
    {
      id: "u-102",
      email: "teacher1@avana.test",
      name: "Teacher One",
      role: "teacher",
      emailVerified: false,
      createdAt: "2026-08-05T12:00:00.000Z",
    },
  ],
  totalCount: 2,
};

function setupMockFetch(options: {
  user?: typeof mockUserData | null;
  users?: typeof mockUsersList | null;
  delayUsers?: boolean;
  failUsers?: boolean;
  emptyUsers?: boolean;
} = {}) {
  const {
    user = mockUserData,
    users = mockUsersList,
    delayUsers = false,
    failUsers = false,
    emptyUsers = false,
  } = options;

  return vi.fn().mockImplementation((url: string, fetchOptions?: RequestInit) => {
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

    // Update Role Mutation
    if (url.includes("/role") && fetchOptions?.method === "PATCH") {
      return Promise.resolve(
        new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    }

    // List Users
    if (url.includes("/v1/admin/users")) {
      if (failUsers) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: "internal_error", message: "Server error" } }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      if (delayUsers) {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              new Response(
                JSON.stringify(users),
                { status: 200, headers: { "Content-Type": "application/json" } }
              )
            );
          }, 100);
        });
      }
      if (emptyUsers) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ users: [], totalCount: 0 }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify(users),
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

class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: Error | null}> {
  constructor(props: {children: React.ReactNode}) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  render() { if (this.state.hasError) return <div data-testid="error-boundary">{String(this.state.error)}</div>; return this.props.children; }
}

function renderUsersPage({ initialEntries = ["/admin/users"] }: { initialEntries?: string[] } = {}) {
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
              <Route path="users" element={<ErrorBoundary><AdminUsersPage /></ErrorBoundary>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

describe("Admin Users Management — Phase 4", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("Case 1 — Platform Admin Users Page renders", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(setupMockFetch());
    renderUsersPage();

    await waitFor(() => {
      expect(screen.getByText("مدیریت کاربران")).toBeInTheDocument();
      expect(screen.getByText("جستجو، فیلتر و مدیریت نقش کاربران پلتفرم")).toBeInTheDocument();
    });
  });

  it("Case 2 — User Data renders correctly", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(setupMockFetch());
    renderUsersPage();

    await waitFor(() => {
      expect(screen.getByText("student1@avana.test")).toBeInTheDocument();
      expect(screen.getByText("Student One")).toBeInTheDocument();
      expect(screen.getAllByText("دانش‌آموز").length).toBeGreaterThan(0);
      
      expect(screen.getByText("teacher1@avana.test")).toBeInTheDocument();
      expect(screen.getByText("Teacher One")).toBeInTheDocument();
      expect(screen.getAllByText("معلم").length).toBeGreaterThan(0);
    });
  });

  it("Case 3 — Search queries users correctly", async () => {
    const mockFetch = setupMockFetch();
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
    renderUsersPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("جستجو با ایمیل یا نام...")).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText("جستجو با ایمیل یا نام...");
    fireEvent.change(searchInput, { target: { value: "student1" } });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("search=student1"),
        expect.any(Object)
      );
    });
  });

  it("Case 4 — Role filter works", async () => {
    const mockFetch = setupMockFetch();
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
    renderUsersPage();

    await waitFor(() => {
      expect(screen.getByLabelText("فیلتر بر اساس نقش")).toBeInTheDocument();
    });

    const roleSelect = screen.getByLabelText("فیلتر بر اساس نقش");
    fireEvent.change(roleSelect, { target: { value: "teacher" } });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("role=teacher"),
        expect.any(Object)
      );
    });
  });

  it("Case 5 — Empty Result handles cleanly", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(setupMockFetch({ emptyUsers: true }));
    renderUsersPage();

    await waitFor(() => {
      expect(screen.getByText("کاربری یافت نشد")).toBeInTheDocument();
    });
  });

  it("Case 6 — Loading state displays", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(setupMockFetch({ delayUsers: true }));
    renderUsersPage();

    await waitFor(() => {
      expect(screen.getByText("در حال بارگذاری کاربران...")).toBeInTheDocument();
    });
  });

  it("Case 7 — API Error state handles cleanly", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(setupMockFetch({ failUsers: true }));
    renderUsersPage();

    await waitFor(() => {
      expect(screen.getByText("خطا در دریافت لیست کاربران.")).toBeInTheDocument();
      expect(screen.getByText("تلاش مجدد")).toBeInTheDocument();
    });
  });

  it("Case 8 — Pagination works correctly", async () => {
    const mockFetch = setupMockFetch({
      users: {
        users: mockUsersList.users,
        totalCount: 40, // More than 1 page
      }
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
    renderUsersPage();

    await waitFor(() => {
      expect(screen.getByText("مجموع: 40 کاربر")).toBeInTheDocument();
      expect(screen.getByLabelText("صفحه بعد")).toBeInTheDocument();
    });

    const nextBtn = screen.getByLabelText("صفحه بعد");
    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("page=2"),
        expect.any(Object)
      );
    });
  });

  it("Case 9 — Existing action (Role Change) invokes API", async () => {
    const mockFetch = setupMockFetch();
    vi.spyOn(globalThis, "fetch").mockImplementation(mockFetch);
    renderUsersPage();

    await waitFor(() => {
      expect(screen.getAllByTitle("تغییر نقش")[0]).toBeInTheDocument();
    });

    // Click on the first user's edit role button
    const editBtns = screen.getAllByTitle("تغییر نقش");
    fireEvent.click(editBtns[0]);

    await waitFor(() => {
      expect(screen.getByText("تغییر نقش کاربر")).toBeInTheDocument();
    });

    // Change role in select
    const roleSelect = screen.getByLabelText("انتخاب نقش جدید");
    fireEvent.change(roleSelect, { target: { value: "course_editor" } });

    // Submit
    const submitBtn = screen.getByText("تأیید و اعمال");
    fireEvent.click(submitBtn);

    await waitFor(() => {
      const calls = mockFetch.mock.calls;
      const patchCall = calls.find((c) => c[0].includes("/role") && c[1]?.method === "PATCH");
      expect(patchCall).toBeDefined();
      expect(patchCall![1].body).toContain('"role":"course_editor"');
    });
  });

  it("Case 10 — Non Admin is blocked", async () => {
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

    renderUsersPage();

    await waitFor(() => {
      expect(screen.getByTestId("student-home")).toBeInTheDocument();
      expect(screen.queryByText("مدیریت کاربران")).not.toBeInTheDocument();
    });
  });
});
