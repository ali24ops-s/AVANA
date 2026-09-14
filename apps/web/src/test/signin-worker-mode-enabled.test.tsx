import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Mock WORKER_MODE_ENABLED as true to verify enabled behavior
vi.mock("../config/features.js", () => ({
  FILES_ENABLED: false,
  CONTENT_GENERATION_ENABLED: false,
  WORKER_MODE_ENABLED: true,
}));

import { SignInPage } from "../components/shell/SignInPage.js";
import { AuthProvider } from "../providers/AuthProvider.js";

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("SignInPage Worker Quick Login Visibility (when WORKER_MODE_ENABLED = true)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders '⚡ ورود سریع به محیط محلی Worker' button in SignInPage when enabled", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { code: "unauthorized" } }),
    } as Response);

    renderWithProviders(
      <AuthProvider>
        <SignInPage />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("ورود به آوانا")).toBeInTheDocument();
    });

    // The button must now be present in the document
    expect(screen.getByText("⚡ ورود سریع به محیط محلی Worker")).toBeInTheDocument();
  });

  it("triggers workerAutoLogin when quick login button is clicked", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("/v1/auth/worker-auto-login")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "test",
              user: {
                id: "worker-001",
                email: "worker-worker-001@avana.local",
                role: "content_worker",
                isVerified: true,
              },
              memberships: [],
            }),
        } as Response);
      }
      return Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { code: "unauthorized" } }),
      } as Response);
    });

    renderWithProviders(
      <AuthProvider>
        <SignInPage />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("⚡ ورود سریع به محیط محلی Worker")).toBeInTheDocument();
    });

    const button = screen.getByText("⚡ ورود سریع به محیط محلی Worker");
    fireEvent.click(button);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/v1/auth/worker-auto-login"),
        expect.anything(),
      );
    });
  });
});
