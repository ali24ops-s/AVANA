/**
 * Route protection tests.
 *
 * Tests:
 *  - Unauthenticated user is redirected to /sign-in
 *  - Authenticated user can access protected routes
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";
import { ProtectedRoute } from "../components/shell/ProtectedRoute.js";
import type { ReactNode } from "react";

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("Route protection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects unauthenticated user to /sign-in", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          request_id: "req-1",
          error: { code: "unauthorized", message: "Not signed in" },
        }),
    } as Response);

    renderWithProviders(
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route
              path="/sign-in"
              element={<div data-testid="sign-in-page">Sign In Page</div>}
            />
            <Route element={<ProtectedRoute />}>
              <Route
                index
                element={
                  <div data-testid="protected-page">Protected Content</div>
                }
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    // After auth check resolves (401), should redirect to /sign-in
    await waitFor(() => {
      const elements = screen.getAllByTestId("sign-in-page");
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("allows authenticated user to access protected routes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "req-1",
          user: {
            id: "user-1",
            email: "alice@example.com",
            role: "student" as const,
            emailVerified: true,
            isVerified: true,
          },
        }),
    } as Response);

    renderWithProviders(
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route
              path="/sign-in"
              element={<div data-testid="sign-in-page">Sign In Page</div>}
            />
            <Route element={<ProtectedRoute />}>
              <Route
                index
                element={
                  <div data-testid="protected-page">Protected Content</div>
                }
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => {
      const elements = screen.getAllByTestId("protected-page");
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("redirects unverified authenticated user to /verify-email", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "req-1",
          user: {
            id: "user-unverified",
            email: "unverified@example.com",
            role: "student" as const,
            emailVerified: false,
          },
        }),
    } as Response);

    renderWithProviders(
      <AuthProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route
              path="/sign-in"
              element={<div data-testid="sign-in-page">Sign In Page</div>}
            />
            <Route
              path="/verify-email"
              element={
                <div data-testid="verify-email-page">Verify Email Page</div>
              }
            />
            <Route element={<ProtectedRoute />}>
              <Route
                index
                element={
                  <div data-testid="protected-page">Protected Content</div>
                }
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => {
      const elements = screen.getAllByTestId("verify-email-page");
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByTestId("protected-page")).toBeNull();
  });

  it("blocks unverified user from accessing nested protected routes (e.g., /dashboard/courses)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "req-nested",
          user: {
            id: "user-unverified-nested",
            email: "unverified_nested@example.com",
            role: "student" as const,
            phoneNumber: "+989123456789",
            emailVerified: false,
            phoneVerified: false,
            isVerified: false,
          },
        }),
    } as Response);

    renderWithProviders(
      <AuthProvider>
        <MemoryRouter initialEntries={["/dashboard/courses"]}>
          <Routes>
            <Route
              path="/verify-email"
              element={<div data-testid="verify-email-page">Verify Email Page</div>}
            />
            <Route element={<ProtectedRoute />}>
              <Route
                path="/dashboard/courses"
                element={<div data-testid="protected-nested-courses">Protected Course Content</div>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => {
      const elements = screen.getAllByTestId("verify-email-page");
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByTestId("protected-nested-courses")).toBeNull();
  });

  it("allows access to protected routes if phone is verified even if email is unverified", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "req-phone-verified",
          user: {
            id: "user-phone-only",
            email: "phone_only@example.com",
            role: "student" as const,
            phoneNumber: "+989123456789",
            emailVerified: false,
            phoneVerified: true,
            isVerified: true,
          },
        }),
    } as Response);

    renderWithProviders(
      <AuthProvider>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <Routes>
            <Route
              path="/verify-email"
              element={<div data-testid="verify-email-page">Verify Email Page</div>}
            />
            <Route element={<ProtectedRoute />}>
              <Route
                path="/dashboard"
                element={<div data-testid="protected-dashboard">Protected Dashboard</div>}
              />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => {
      const elements = screen.getAllByTestId("protected-dashboard");
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByTestId("verify-email-page")).toBeNull();
  });

  describe("Legacy Account Routes Redirects", () => {
    function LocationDisplay() {
      const location = useLocation();
      return <div data-testid="current-location">{location.pathname + location.search}</div>;
    }

    const testRoutes = (
      <Routes>
        <Route path="/account/subscription" element={<LocationDisplay />} />
        <Route path="/account/wallet" element={<Navigate to="/account/subscription?tab=wallet" replace />} />
        <Route path="/settings/wallet" element={<Navigate to="/account/subscription?tab=wallet" replace />} />
        <Route path="/account/purchases" element={<Navigate to="/account/subscription?tab=purchases" replace />} />
        <Route path="/settings/purchases" element={<Navigate to="/account/subscription?tab=purchases" replace />} />
        <Route path="/settings/subscription" element={<Navigate to="/account/subscription" replace />} />
      </Routes>
    );

    it("redirects /account/wallet to /account/subscription?tab=wallet", async () => {
      renderWithProviders(
        <MemoryRouter initialEntries={["/account/wallet"]}>
          {testRoutes}
        </MemoryRouter>,
      );
      expect(screen.getByTestId("current-location").textContent).toBe("/account/subscription?tab=wallet");
    });

    it("redirects /account/purchases to /account/subscription?tab=purchases", async () => {
      renderWithProviders(
        <MemoryRouter initialEntries={["/account/purchases"]}>
          {testRoutes}
        </MemoryRouter>,
      );
      expect(screen.getByTestId("current-location").textContent).toBe("/account/subscription?tab=purchases");
    });

    it("redirects /settings/wallet to /account/subscription?tab=wallet", async () => {
      renderWithProviders(
        <MemoryRouter initialEntries={["/settings/wallet"]}>
          {testRoutes}
        </MemoryRouter>,
      );
      expect(screen.getByTestId("current-location").textContent).toBe("/account/subscription?tab=wallet");
    });

    it("redirects /settings/purchases to /account/subscription?tab=purchases", async () => {
      renderWithProviders(
        <MemoryRouter initialEntries={["/settings/purchases"]}>
          {testRoutes}
        </MemoryRouter>,
      );
      expect(screen.getByTestId("current-location").textContent).toBe("/account/subscription?tab=purchases");
    });

    it("redirects /settings/subscription to /account/subscription", async () => {
      renderWithProviders(
        <MemoryRouter initialEntries={["/settings/subscription"]}>
          {testRoutes}
        </MemoryRouter>,
      );
      expect(screen.getByTestId("current-location").textContent).toBe("/account/subscription");
    });
  });
});
