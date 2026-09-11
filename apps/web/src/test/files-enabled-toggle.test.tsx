import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";

// Mock FILES_ENABLED as true to verify re-enabling behavior
vi.mock("../config/features.js", () => ({
  FILES_ENABLED: true,
}));

// Mock AuthenticatedShell dependencies
import { AuthenticatedShell } from "../components/shell/AuthenticatedShell.js";

describe("Files Feature Toggle (when re-enabled)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders 'فایل‌ها' in navigation when FILES_ENABLED is true", async () => {
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

    await waitFor(() => {
      expect(screen.getByText("دوره‌ها")).toBeInTheDocument();
      // Files navigation links are now rendered when flag is enabled
      const fileLinks = screen.getAllByText("فایل‌ها");
      expect(fileLinks.length).toBeGreaterThanOrEqual(1);
    });
  });
});
