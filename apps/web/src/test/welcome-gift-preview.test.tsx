import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WelcomeGiftPreviewPage } from "../pages/dev/WelcomeGiftPreviewPage.js";
import { HomePage } from "../pages/HomePage.js";
import { AuthProvider } from "../providers/AuthProvider.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("WelcomeGiftPreviewPage (Dev-Only Preview)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the preview page with dev badge, security notice, and modal automatically open", () => {
    render(
      <MemoryRouter>
        <WelcomeGiftPreviewPage />
      </MemoryRouter>
    );

    // Dev preview header and badges
    expect(screen.getByText("پیش‌نمایش هدیه خوشامدگویی آوانا")).toBeInTheDocument();
    expect(screen.getByText("محیط توسعه (Dev Only)")).toBeInTheDocument();
    expect(
      screen.getByText(/این پیش‌نمایش کاملاً مستقل از بک‌اند کار می‌کند/)
    ).toBeInTheDocument();

    // Modal contents rendered by default with sample values
    expect(screen.getByText("به خانواده آوانا خوش اومدی!")).toBeInTheDocument();
    expect(screen.getByLabelText("آوانی - کاراکتر اختصاصی آوانا")).toBeInTheDocument();
    expect(screen.getByText("شارژ هدیه کیف پول")).toBeInTheDocument();
    expect(screen.getByText(/۲۰٬۰۰۰ تومان/)).toBeInTheDocument();
    expect(screen.getByText("اشتراک رایگان آوانا")).toBeInTheDocument();
    expect(screen.getAllByText(/۷ روز/).length).toBeGreaterThanOrEqual(1);

    // CTA button exists
    expect(screen.getByRole("button", { name: "بزن بریم!" })).toBeInTheDocument();
  });

  it("closes modal safely without any API calls when user clicks CTA button", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(
      <MemoryRouter>
        <WelcomeGiftPreviewPage />
      </MemoryRouter>
    );

    const ctaButton = screen.getByRole("button", { name: "بزن بریم!" });
    fireEvent.click(ctaButton);

    // Modal should close
    await waitFor(() => {
      expect(screen.queryByText("به خانواده آوانا خوش اومدی!")).not.toBeInTheDocument();
    });

    // Confirmation message shown on preview page
    expect(
      screen.getByText(/مودال با موفقیت بسته شد/)
    ).toBeInTheDocument();

    // Zero API requests were sent
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("allows re-opening the modal after closing", async () => {
    render(
      <MemoryRouter>
        <WelcomeGiftPreviewPage />
      </MemoryRouter>
    );

    // Close it first
    fireEvent.click(screen.getByRole("button", { name: "بزن بریم!" }));
    expect(screen.queryByText("به خانواده آوانا خوش اومدی!")).not.toBeInTheDocument();

    // Click reopen button
    const reopenButton = screen.getByRole("button", { name: /نمایش مجدد مودال/ });
    fireEvent.click(reopenButton);

    // Modal is visible again
    expect(screen.getByText("به خانواده آوانا خوش اومدی!")).toBeInTheDocument();
  });

  it("allows simulating loading state (isAcknowledging)", () => {
    render(
      <MemoryRouter>
        <WelcomeGiftPreviewPage />
      </MemoryRouter>
    );

    const simulateButton = screen.getByRole("button", { name: /تست حالت در حال دریافت/ });
    fireEvent.click(simulateButton);

    // Button in modal switches to "در حال دریافت..."
    expect(screen.getByRole("button", { name: "در حال دریافت..." })).toBeInTheDocument();
  });

  it("updates preview cards when wallet amount or subscription days are modified", () => {
    render(
      <MemoryRouter>
        <WelcomeGiftPreviewPage />
      </MemoryRouter>
    );

    const amountInput = screen.getByDisplayValue("20000");
    fireEvent.change(amountInput, { target: { value: "50000" } });

    expect(screen.getByText(/۵۰٬۰۰۰ تومان/)).toBeInTheDocument();

    const daysInput = screen.getByDisplayValue("7");
    fireEvent.change(daysInput, { target: { value: "30" } });

    expect(screen.getByText(/۳۰ روز/)).toBeInTheDocument();
  });

  it("toggles dark mode class on document element", () => {
    render(
      <MemoryRouter>
        <WelcomeGiftPreviewPage />
      </MemoryRouter>
    );

    const darkModeBtn = screen.getByRole("button", { name: /تغییر به تم تاریک/ });
    fireEvent.click(darkModeBtn);

    expect(document.documentElement.classList.contains("dark")).toBe(true);

    const lightModeBtn = screen.getByRole("button", { name: /تغییر به تم روشن/ });
    fireEvent.click(lightModeBtn);

    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});

describe("HomePage dev preview integration (?preview-welcome-gift=1)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows modal in dev preview on HomePage without acknowledging to backend API", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = String(url);
      if (urlStr.includes("/v1/me")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              request_id: "req-me",
              user: {
                id: "user-test",
                email: "test@avana.ir",
                role: "student",
              },
            }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ items: [] }),
      } as Response);
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/home?preview-welcome-gift=1"]}>
            <HomePage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>
    );

    // Modal is rendered in HomePage
    await waitFor(() => {
      expect(screen.getByText("به خانواده آوانا خوش اومدی!")).toBeInTheDocument();
    });

    expect(screen.getByText(/۲۰٬۰۰۰ تومان/)).toBeInTheDocument();
    expect(screen.getByText(/۷ روز/)).toBeInTheDocument();

    // Click CTA button
    const cta = screen.getByRole("button", { name: "بزن بریم!" });
    fireEvent.click(cta);

    // Modal closes
    await waitFor(() => {
      expect(screen.queryByText("به خانواده آوانا خوش اومدی!")).not.toBeInTheDocument();
    });

    // Verify /v1/welcome-gift/acknowledge was NEVER called
    const ackCalls = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).includes("/v1/welcome-gift/acknowledge")
    );
    expect(ackCalls.length).toBe(0);
  });
});
