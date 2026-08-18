/**
 * Route protection tests.
 *
 * Tests:
 *  - Unauthenticated user is redirected to /sign-in
 *  - Authenticated user can access protected routes
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
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

  it("allows unverified authenticated user to access protected routes (UNVERIFIED !== UNAUTHENTICATED)", async () => {
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
});
