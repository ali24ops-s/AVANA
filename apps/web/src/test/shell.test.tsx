/**
 * Authenticated Shell tests.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";
import { AuthenticatedShell } from "../components/shell/AuthenticatedShell.js";
import type { ReactNode } from "react";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">Outlet content</div>,
  };
});

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AuthenticatedShell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows loading state while auth is being determined", () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () => new Promise(() => {}),
    );

    renderWithProviders(
      <AuthProvider>
        <AuthenticatedShell />
      </AuthProvider>,
    );

    expect(screen.getByText("در حال بارگذاری حساب کاربری...")).toBeInTheDocument();
  });

  it("renders user email from /v1/me on success", async () => {
    const mockMeResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-req",
          user: {
            id: "user-1",
            email: "alice@example.com",
            role: "student" as const,
          },
        }),
    } as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMeResponse);

    renderWithProviders(
      <AuthProvider>
        <AuthenticatedShell />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    });
  });

  it("renders navigation links", async () => {
    const mockMeResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-req",
          user: {
            id: "user-1",
            email: "bob@example.com",
            role: "student" as const,
          },
        }),
    } as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMeResponse);

    renderWithProviders(
      <AuthProvider>
        <AuthenticatedShell />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("دوره‌ها")).toBeInTheDocument();
      expect(screen.getByText("خانه")).toBeInTheDocument();
    });
  });

  it("renders sign-out button", async () => {
    const mockMeResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-req",
          user: {
            id: "user-1",
            email: "carol@example.com",
            role: "student" as const,
          },
        }),
    } as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMeResponse);

    renderWithProviders(
      <AuthProvider>
        <AuthenticatedShell />
      </AuthProvider>,
    );

    await waitFor(() => {
      const buttons = screen.getAllByText("خروج");
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders Outlet content for child routes", async () => {
    const mockMeResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-req",
          user: {
            id: "user-1",
            email: "dave@example.com",
            role: "student" as const,
          },
        }),
    } as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMeResponse);

    renderWithProviders(
      <AuthProvider>
        <AuthenticatedShell />
      </AuthProvider>,
    );

    await waitFor(() => {
      const outlets = screen.getAllByTestId("outlet");
      expect(outlets.length).toBeGreaterThanOrEqual(1);
    });
  });
});
