import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SignInPage } from "../components/shell/SignInPage.js";
import { AuthProvider } from "../providers/AuthProvider.js";
import { WORKER_MODE_ENABLED } from "../config/features.js";
import type { ReactNode } from "react";

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

describe("SignInPage Worker Quick Login Visibility", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Default / Production environment (WORKER_MODE_ENABLED = false)", () => {
    it("has WORKER_MODE_ENABLED set to false by default", () => {
      expect(WORKER_MODE_ENABLED).toBe(false);
    });

    it("does NOT render '⚡ ورود سریع به محیط محلی Worker' button in SignInPage", async () => {
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

      // The button should not be present in the document
      expect(screen.queryByText(/ورود سریع به محیط محلی Worker/)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /ورود سریع به محیط محلی Worker/ })).not.toBeInTheDocument();

      // Standard elements must still be present
      expect(screen.getByText("ثبت‌نام کنید")).toBeInTheDocument();
    });
  });
});
