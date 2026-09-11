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

  it("renders navigation links without 'فایل‌ها' when files feature is disabled", async () => {
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
      expect(screen.getByText("فلش‌کارت‌ها")).toBeInTheDocument();
      expect(screen.getByText("آزمون‌ها")).toBeInTheDocument();
      expect(screen.getByText("کتابخانه")).toBeInTheDocument();
      expect(screen.getByText("وبلاگ")).toBeInTheDocument();
    });

    // Files link must NOT be rendered when feature is disabled
    expect(screen.queryByText("فایل‌ها")).not.toBeInTheDocument();
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

  it("renders user name/email as a clickable trigger linking to /account/subscription", async () => {
    const mockMeResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-req",
          user: {
            id: "user-1",
            email: "sara@example.com",
            name: "سارا احمدی",
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
      const userLink = screen.getByRole("link", { name: /سارا احمدی/i });
      expect(userLink).toBeInTheDocument();
      expect(userLink).toHaveAttribute("href", "/account/subscription");
    });
  });

  it("does not render separate 'پلن‌های اشتراک' pill in the header navigation", async () => {
    const mockMeResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-req",
          user: {
            id: "user-1",
            email: "user@example.com",
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
      expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });

    // The standalone "پلن‌های اشتراک" header pill should not exist in the document
    expect(screen.queryByText("پلن‌های اشتراک")).not.toBeInTheDocument();
  });

  it("renders 'فعال' badge on User Chip when subscription is active with > 5 days remaining", async () => {
    const futureExpiry = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(); // +15 days

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-1",
              user: { id: "u-1", email: "active@avana.test", name: "دکتر رضا", role: "student" as const },
            }),
        } as Response);
      }
      if (url.includes("/subscriptions/my")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              subscription: {
                id: "sub-1",
                product_id: "prod-1",
                status: "active",
                started_at: new Date().toISOString(),
                expires_at: futureExpiry,
              },
            }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });

    renderWithProviders(
      <AuthProvider>
        <AuthenticatedShell />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("دکتر رضا")).toBeInTheDocument();
      expect(screen.getByText("فعال")).toBeInTheDocument();
    });
  });

  it("renders '۳ روز باقیمانده' warning badge when subscription has 3 days remaining", async () => {
    // 3 days and 2 hours in the future
    const futureExpiry = new Date(Date.now() + (3 * 24 + 2) * 60 * 60 * 1000).toISOString();

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-2",
              user: { id: "u-2", email: "warn@avana.test", name: "مریم احمدی", role: "student" as const },
            }),
        } as Response);
      }
      if (url.includes("/subscriptions/my")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              subscription: {
                id: "sub-2",
                product_id: "prod-1",
                status: "active",
                started_at: new Date().toISOString(),
                expires_at: futureExpiry,
              },
            }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });

    renderWithProviders(
      <AuthProvider>
        <AuthenticatedShell />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("مریم احمدی")).toBeInTheDocument();
      expect(screen.getByText("۳ روز باقیمانده")).toBeInTheDocument();
    });
  });

  it("renders 'کمتر از ۱ روز' warning badge when subscription has < 24 hours remaining", async () => {
    // 10 hours in the future
    const futureExpiry = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString();

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-3",
              user: { id: "u-3", email: "urgent@avana.test", name: "علی کریمی", role: "student" as const },
            }),
        } as Response);
      }
      if (url.includes("/subscriptions/my")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              subscription: {
                id: "sub-3",
                product_id: "prod-1",
                status: "active",
                started_at: new Date().toISOString(),
                expires_at: futureExpiry,
              },
            }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });

    renderWithProviders(
      <AuthProvider>
        <AuthenticatedShell />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("علی کریمی")).toBeInTheDocument();
      expect(screen.getByText("کمتر از ۱ روز")).toBeInTheDocument();
    });
  });

  it("renders 'منقضی شده' badge when subscription is expired", async () => {
    // 2 days in the past
    const pastExpiry = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-4",
              user: { id: "u-4", email: "expired@avana.test", name: "حسین صادقی", role: "student" as const },
            }),
        } as Response);
      }
      if (url.includes("/subscriptions/my")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              subscription: {
                id: "sub-4",
                product_id: "prod-1",
                status: "expired",
                started_at: new Date().toISOString(),
                expires_at: pastExpiry,
              },
            }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });

    renderWithProviders(
      <AuthProvider>
        <AuthenticatedShell />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("حسین صادقی")).toBeInTheDocument();
      expect(screen.getByText("منقضی شده")).toBeInTheDocument();
    });
  });

  it("renders clean User Chip without subscription badge when user has no subscription", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);
      if (url.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-5",
              user: { id: "u-5", email: "nosub@avana.test", name: "کاربر جدید", role: "student" as const },
            }),
        } as Response);
      }
      if (url.includes("/subscriptions/my")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              subscription: null,
            }),
        } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response);
    });

    renderWithProviders(
      <AuthProvider>
        <AuthenticatedShell />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("کاربر جدید")).toBeInTheDocument();
    });

    expect(screen.queryByText("فعال")).not.toBeInTheDocument();
    expect(screen.queryByText("منقضی شده")).not.toBeInTheDocument();
    expect(screen.queryByText(/روز باقی‌مانده/i)).not.toBeInTheDocument();
    expect(screen.queryByText("کمتر از ۱ روز")).not.toBeInTheDocument();
  });
});

