import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";
import { AuthenticatedShell } from "../components/shell/AuthenticatedShell.js";
import { FILES_ENABLED } from "../config/features.js";
import { router } from "../routes/index.js";

describe("Files Feature Temporary Disable", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("has FILES_ENABLED default set to false", () => {
    expect(FILES_ENABLED).toBe(false);
  });

  it("does not render 'فایل‌ها' in AuthenticatedShell header or mobile drawer", async () => {
    const mockMeResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-req",
          user: {
            id: "user-1",
            email: "student@avana.ir",
            role: "student" as const,
          },
        }),
    } as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMeResponse);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/home"]}>
          <AuthProvider>
            <AuthenticatedShell />
          </AuthProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Verify presence of all standard navigation links
    await waitFor(() => {
      expect(screen.getByText("خانه")).toBeInTheDocument();
      expect(screen.getByText("دوره‌ها")).toBeInTheDocument();
      expect(screen.getByText("فلش‌کارت‌ها")).toBeInTheDocument();
      expect(screen.getByText("آزمون‌ها")).toBeInTheDocument();
      expect(screen.getByText("کتابخانه")).toBeInTheDocument();
      expect(screen.getByText("وبلاگ")).toBeInTheDocument();
    });

    // Verify 'فایل‌ها' is NOT rendered anywhere in header or drawer
    expect(screen.queryByText("فایل‌ها")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /فایل‌ها/i })).not.toBeInTheDocument();
  });

  it("redirects direct access from /files to /library in router configuration", async () => {
    // Find the protected shell route in router definition
    const rootRoutes = router.routes;
    const protectedParent = rootRoutes.find((r) => r.path === "/" && r.children);
    expect(protectedParent).toBeDefined();

    const shellRoute = protectedParent?.children?.find(
      (r) => r.children?.some((c) => c.path === "files"),
    );
    expect(shellRoute).toBeDefined();

    const filesRoute = shellRoute?.children?.find((c) => c.path === "files");
    expect(filesRoute).toBeDefined();

    // Verify element renders Navigate to /library
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/files"]}>
          <Routes>
            <Route path="/files" element={filesRoute?.element} />
            <Route
              path="/library"
              element={<div data-testid="target-library">Library Page Content</div>}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("target-library")).toBeInTheDocument();
    });
  });
});
