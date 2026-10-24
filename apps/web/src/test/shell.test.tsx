/**
 * Authenticated Shell tests.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";
import { AuthenticatedShell } from "../components/shell/AuthenticatedShell.js";
import { TeacherShell } from "../components/teacher/TeacherShell.js";
import type { ReactNode } from "react";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">Outlet content</div>,
  };
});

function renderWithProviders(ui: ReactNode, initialEntries: string[] = ["/"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

// Mock localStorage for test isolation
const createMockLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

const mockStorage = createMockLocalStorage();
Object.defineProperty(window, "localStorage", {
  value: mockStorage,
  writable: true,
});

describe("AuthenticatedShell", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
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

  it("opens user account dropdown with 'دعوت از دوستان' linking to /account/referral when profile chip is clicked", async () => {
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
    });

    const userLink = screen.getByRole("link", { name: /سارا احمدی/i });
    fireEvent.click(userLink);

    await waitFor(() => {
      const referralLink = screen.getByRole("link", { name: /دعوت از دوستان/i });
      expect(referralLink).toBeInTheDocument();
      expect(referralLink).toHaveAttribute("href", "/account/referral");
    });
  });

  it("does not render personal account options in the mobile navigation drawer, but preserves general navigation", async () => {
    const mockMeResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-req",
          user: {
            id: "user-1",
            email: "mobile@example.com",
            name: "کاربر موبایل",
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
      expect(screen.getByText("کاربر موبایل")).toBeInTheDocument();
    });

    // Open the mobile menu drawer
    const menuButton = screen.getByRole("button", { name: "منو" });
    fireEvent.click(menuButton);

    const drawerNav = screen.getByRole("navigation", { name: "منوی ناوبری موبایل" });

    // Verify general navigation items ARE rendered in the mobile drawer
    expect(within(drawerNav).getByText("صفحه اصلی")).toBeInTheDocument();
    expect(within(drawerNav).getByText("دوره‌ها")).toBeInTheDocument();
    expect(within(drawerNav).getByText("فلش‌کارت‌ها")).toBeInTheDocument();
    expect(within(drawerNav).getByText("کلاس‌های من")).toBeInTheDocument();
    expect(within(drawerNav).getByText("آزمون‌ها")).toBeInTheDocument();
    expect(within(drawerNav).getByText("کتابخانه")).toBeInTheDocument();

    // Verify personal account options are NOT rendered in the mobile drawer
    expect(within(drawerNav).queryByText(/اشتراک/i)).not.toBeInTheDocument();
    expect(within(drawerNav).queryByText("اشتراک و امور مالی")).not.toBeInTheDocument();
    expect(within(drawerNav).queryByText("خریدهای من و فاکتورها")).not.toBeInTheDocument();
    expect(within(drawerNav).queryByText("کیف پول من")).not.toBeInTheDocument();
    expect(within(drawerNav).queryByText("دعوت از دوستان")).not.toBeInTheDocument();
    expect(within(drawerNav).queryByText("پشتیبانی و بازخورد")).not.toBeInTheDocument();
    expect(within(drawerNav).queryByText("ویرایش مشخصات")).not.toBeInTheDocument();
    expect(within(drawerNav).queryByText("تنظیمات")).not.toBeInTheDocument();
  });

  it("preserves privileged management links in the mobile drawer for platform_admin", async () => {
    const mockMeResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-admin",
          user: {
            id: "admin-1",
            email: "admin@example.com",
            name: "مدیر سیستم",
            role: "platform_admin" as const,
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
      expect(screen.getByText("مدیر سیستم")).toBeInTheDocument();
    });

    // Open the mobile menu drawer
    const menuButton = screen.getByRole("button", { name: "منو" });
    fireEvent.click(menuButton);

    const drawerNav = screen.getByRole("navigation", { name: "منوی ناوبری موبایل" });
    // Privileged admin panel link should still be available in the drawer
    expect(within(drawerNav).getByRole("link", { name: /پنل مدیریت/i })).toBeInTheDocument();
  });

  it("provides an accessible account control with >= 44x44px touch target, ARIA attributes, and no chevron indicator", async () => {
    const mockMeResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-req",
          user: {
            id: "user-1",
            email: "user@example.com",
            name: "مهسا کریمی",
            role: "student" as const,
          },
        }),
    } as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMeResponse);

    const { container } = renderWithProviders(
      <AuthProvider>
        <AuthenticatedShell />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("مهسا کریمی")).toBeInTheDocument();
    });

    const accountControl = screen.getByRole("link", { name: /مهسا کریمی/i });
    expect(accountControl).toBeInTheDocument();
    expect(accountControl).toHaveAttribute("aria-expanded", "false");
    expect(accountControl).toHaveAttribute("aria-haspopup", "true");
    expect(accountControl.className).toContain("min-h-[44px]");
    expect(accountControl.className).toContain("min-w-[44px]");

    // Verify ChevronDown has been removed
    expect(container.querySelector(".lucide-chevron-down")).toBeNull();

    // Click to open account menu
    fireEvent.click(accountControl);

    // Verify aria-expanded updates and active styling is applied
    expect(accountControl).toHaveAttribute("aria-expanded", "true");
    expect(accountControl.className).toContain("border-[#008080]");

    // Verify dedicated account options appear in the open menu
    expect(screen.getByText("ویرایش مشخصات")).toBeInTheDocument();
    expect(screen.getByText("اشتراک و امور مالی")).toBeInTheDocument();
    expect(screen.queryByText("اشتراک من")).not.toBeInTheDocument();
    expect(screen.queryByText("خریدهای من و فاکتورها")).not.toBeInTheDocument();
    expect(screen.queryByText("کیف پول من")).not.toBeInTheDocument();
    expect(screen.getByText("دعوت از دوستان")).toBeInTheDocument();
    expect(screen.getByText("پشتیبانی و بازخورد")).toBeInTheDocument();

    // Clicking again closes the menu
    fireEvent.click(accountControl);
    expect(accountControl).toHaveAttribute("aria-expanded", "false");
  });

  it("renders first-time onboarding aura, respects prefers-reduced-motion, and permanently dismisses on first click", async () => {
    const mockMeResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-req-hint",
          user: {
            id: "user-new",
            email: "newuser@example.com",
            name: "کاربر جدید",
            role: "student" as const,
          },
        }),
    } as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMeResponse);

    const { unmount } = renderWithProviders(
      <AuthProvider>
        <AuthenticatedShell />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("کاربر جدید")).toBeInTheDocument();
    });

    // 1. Aura should be rendered on first visit
    const aura = screen.getByTestId("account-hint-aura");
    expect(aura).toBeInTheDocument();
    expect(aura.className).toContain("motion-safe:animate-account-aura");
    expect(aura.className).toContain("motion-reduce:animate-none");

    const accountControl = screen.getByRole("link", { name: /کاربر جدید/i });

    // 2. Clicking on account control dismisses the aura and persists to localStorage
    fireEvent.click(accountControl);
    expect(screen.queryByTestId("account-hint-aura")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("avana_account_menu_hint_seen")).toBe("true");

    // 3. Closing the menu does not bring the aura back
    fireEvent.click(accountControl);
    expect(screen.queryByTestId("account-hint-aura")).not.toBeInTheDocument();

    unmount();

    // 4. On subsequent visit, aura is not rendered at all
    renderWithProviders(
      <AuthProvider>
        <AuthenticatedShell />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("کاربر جدید")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("account-hint-aura")).not.toBeInTheDocument();
  });

  it("closes open menus when Escape key is pressed", async () => {
    const mockMeResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-req",
          user: {
            id: "user-1",
            email: "esc@example.com",
            name: "کاربر کیبورد",
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
      expect(screen.getByText("کاربر کیبورد")).toBeInTheDocument();
    });

    // 1. Test account dropdown escape
    const accountControl = screen.getByRole("link", { name: /کاربر کیبورد/i });
    fireEvent.click(accountControl);
    expect(accountControl).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("ویرایش مشخصات")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(accountControl).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("ویرایش مشخصات")).not.toBeInTheDocument();

    // 2. Test mobile drawer escape
    const menuButton = screen.getByRole("button", { name: "منو" });
    fireEvent.click(menuButton);
    expect(screen.getByRole("navigation", { name: "منوی ناوبری موبایل" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("navigation", { name: "منوی ناوبری موبایل" })).not.toBeInTheDocument();
  });

  it("handles unauthenticated state gracefully by pointing directly to /sign-in and hiding sign out button", async () => {
    const mockMeResponse = {
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          message: "Unauthorized",
        }),
    } as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockMeResponse);

    renderWithProviders(
      <AuthProvider>
        <AuthenticatedShell />
      </AuthProvider>,
    );

    // Wait until loading finishes
    await waitFor(() => {
      expect(screen.queryByText("در حال بارگذاری حساب کاربری...")).not.toBeInTheDocument();
    });

    // The account control for guests should link to /sign-in
    const signInControl = screen.getByRole("link", { name: /ورود به حساب کاربری/i });
    expect(signInControl).toBeInTheDocument();
    expect(signInControl).toHaveAttribute("href", "/sign-in");
    expect(signInControl.className).toContain("min-h-[44px]");
    expect(signInControl.className).toContain("min-w-[44px]");

    // Sign out button must NOT be present
    expect(screen.queryByRole("button", { name: "خروج از حساب" })).not.toBeInTheDocument();

    // Clicking the sign-in link must not open any authenticated account panel
    fireEvent.click(signInControl);
    expect(screen.queryByText("ویرایش مشخصات")).not.toBeInTheDocument();
    expect(screen.queryByText("اشتراک و امور مالی")).not.toBeInTheDocument();
    expect(screen.queryByText("اشتراک من")).not.toBeInTheDocument();
  });

  it("TeacherShell: provides touch target and ARIA attributes for teacher account button and deduplicates mobile drawer", async () => {
    const mockTeacherResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-teacher",
          user: {
            id: "teacher-1",
            email: "teacher@example.com",
            name: "استاد رضایی",
            role: "teacher" as const,
          },
        }),
    } as Response;

    vi.spyOn(globalThis, "fetch").mockResolvedValue(mockTeacherResponse);

    const { container } = renderWithProviders(
      <AuthProvider>
        <TeacherShell />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("استاد رضایی")).toBeInTheDocument();
    });

    const accountControl = screen.getByRole("button", { name: /استاد رضایی/i });
    expect(accountControl).toBeInTheDocument();
    expect(accountControl).toHaveAttribute("aria-expanded", "false");
    expect(accountControl).toHaveAttribute("aria-haspopup", "true");
    expect(accountControl.className).toContain("min-h-[44px]");
    expect(accountControl.className).toContain("min-w-[44px]");

    // Verify ChevronDown has been removed in TeacherShell
    expect(container.querySelector(".lucide-chevron-down")).toBeNull();

    // Verify first-time aura exists and clicking dismisses it
    expect(screen.getByTestId("account-hint-aura")).toBeInTheDocument();
    fireEvent.click(accountControl);
    expect(screen.queryByTestId("account-hint-aura")).not.toBeInTheDocument();
    fireEvent.click(accountControl); // Close menu

    // Open teacher mobile drawer
    const menuButton = screen.getByRole("button", { name: "منو" });
    fireEvent.click(menuButton);

    const drawerNav = screen.getByRole("navigation", { name: "منوی ناوبری اساتید" });
    expect(within(drawerNav).getByText("داشبورد استاد")).toBeInTheDocument();
    expect(within(drawerNav).getByText("کلاس‌های من")).toBeInTheDocument();
    expect(within(drawerNav).getByText("پیام‌های دانشجویان")).toBeInTheDocument();

    // Verify 'خروج از حساب' is NOT in the mobile drawer
    expect(within(drawerNav).queryByText("خروج از حساب")).not.toBeInTheDocument();
  });

  describe("Header positioning behavior (relative on lesson page, sticky top-0 elsewhere)", () => {
    const mockUserResponse = {
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "test-req",
          user: {
            id: "user-1",
            email: "student@example.com",
            name: "دانشجو",
            role: "student" as const,
          },
        }),
    } as Response;

    it("uses relative in-flow positioning for the site header on lesson page (/courses/:courseId)", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockUserResponse);

      const { container } = renderWithProviders(
        <AuthProvider>
          <AuthenticatedShell />
        </AuthProvider>,
        ["/courses/cardiology-101"],
      );

      await waitFor(() => {
        expect(screen.getByText("دانشجو")).toBeInTheDocument();
      });

      const header = container.querySelector("header");
      expect(header).not.toBeNull();
      // On lesson page, header must be relative so it scrolls out of view naturally
      expect(header?.className).toContain("relative");
      expect(header?.className).not.toContain("sticky");
    });

    it("maintains sticky top-0 positioning on regular pages like /home and /courses", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockUserResponse);

      const { container } = renderWithProviders(
        <AuthProvider>
          <AuthenticatedShell />
        </AuthProvider>,
        ["/home"],
      );

      await waitFor(() => {
        expect(screen.getByText("دانشجو")).toBeInTheDocument();
      });

      const header = container.querySelector("header");
      expect(header).not.toBeNull();
      expect(header?.className).toContain("sticky");
      expect(header?.className).toContain("top-0");
      expect(header?.className).toContain("z-50");
    });

    it("maintains sticky top-0 positioning on /courses list page", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValue(mockUserResponse);

      const { container } = renderWithProviders(
        <AuthProvider>
          <AuthenticatedShell />
        </AuthProvider>,
        ["/courses"],
      );

      await waitFor(() => {
        expect(screen.getByText("دانشجو")).toBeInTheDocument();
      });

      const header = container.querySelector("header");
      expect(header).not.toBeNull();
      expect(header?.className).toContain("sticky");
      expect(header?.className).toContain("top-0");
      expect(header?.className).toContain("z-50");
    });
  });
});

