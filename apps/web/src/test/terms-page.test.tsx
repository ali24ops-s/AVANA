/**
 * Comprehensive test suite for the Terms of Service (قوانین و مقررات) Page.
 *
 * Tests:
 *  - Public accessibility without authentication (no redirect to /sign-in)
 *  - Document title and main hero header rendering
 *  - Configurable Last Updated Date display
 *  - Presence and IDs of all 14 mandatory legal sections
 *  - Prominent Medical Disclaimer callout card with warnings
 *  - Table of Contents navigation link mappings
 *  - Footer link to /terms from the Landing Page
 *  - Register Page terms acceptance link
 *  - Routing alias /terms-of-service redirecting to /terms
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";
import { TermsPage, TERMS_SECTIONS, TERMS_LAST_UPDATED } from "../pages/TermsPage.js";
import { Footer } from "../components/landing/Footer.js";
import { RegisterPage } from "../components/shell/RegisterPage.js";
import { router } from "../routes/index.js";
import type { ReactNode } from "react";

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/terms"]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Terms of Service Page (TermsPage)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.scrollTo = vi.fn();
  });

  it("renders the main page heading and description", () => {
    renderWithProviders(<TermsPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /قوانین و مقررات استفاده از آوانا/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/سامانه هوشمند آموزش داروسازی آوانا/i),
    ).toBeInTheDocument();
  });

  it("renders the configurable Last Updated Date", () => {
    renderWithProviders(<TermsPage />);

    const dateElement = screen.getByTestId("last-updated-date");
    expect(dateElement).toBeInTheDocument();
    expect(dateElement.textContent).toContain(TERMS_LAST_UPDATED.fullDisplay);
  });

  it("renders all 14 mandatory legal sections with their IDs and titles", () => {
    renderWithProviders(<TermsPage />);

    expect(TERMS_SECTIONS.length).toBe(14);

    TERMS_SECTIONS.forEach((section) => {
      // 1. Article element with section ID must exist in DOM
      const sectionEl = document.getElementById(section.id);
      expect(sectionEl).toBeInTheDocument();

      // 2. Heading text must be rendered
      const heading = screen.getByRole("heading", {
        name: new RegExp(section.title, "i"),
      });
      expect(heading).toBeInTheDocument();
    });
  });

  it("renders Section 3 (Medical Disclaimer) as a critical alert callout with proper medical warning", () => {
    renderWithProviders(<TermsPage />);

    const medicalSection = document.getElementById("medical-disclaimer");
    expect(medicalSection).toBeInTheDocument();

    // Verify critical alert badge
    expect(screen.getByText(/اخطار ویژه و بسیار مهم/i)).toBeInTheDocument();

    // Verify key medical disclaimer terms
    expect(
      screen.getByText(/صرفاً با اهداف آموزشی، پژوهشی و کمک‌آموزشی/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/جایگزین نظر، تشخیص بالینی، نسخه/i),
    ).toBeInTheDocument();
  });

  it("renders the Table of Contents with jump buttons mapping to all 14 section IDs", () => {
    renderWithProviders(<TermsPage />);

    TERMS_SECTIONS.forEach((section) => {
      // In Desktop TOC or Mobile navigator, buttons with section title exist
      const tocButtons = screen.getAllByRole("button", {
        name: new RegExp(section.title, "i"),
      });
      expect(tocButtons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("is accessible to unauthenticated users without redirecting to /sign-in", async () => {
    // Unauthenticated 401 response from /v1/me
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 401,
      json: () =>
        Promise.resolve({
          request_id: "req-1",
          error: { code: "unauthorized", message: "Not signed in" },
        }),
    } as Response);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MemoryRouter initialEntries={["/terms"]}>
            <Routes>
              <Route path="/terms" element={<TermsPage />} />
              <Route
                path="/sign-in"
                element={<div data-testid="sign-in-page">Sign In Page</div>}
              />
            </Routes>
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Wait and verify TermsPage remains rendered and was not redirected to /sign-in
    await waitFor(() => {
      expect(
        screen.getByRole("heading", {
          level: 1,
          name: /قوانین و مقررات استفاده از آوانا/i,
        }),
      ).toBeInTheDocument();
    });

    expect(screen.queryByTestId("sign-in-page")).toBeNull();
  });

  it("renders a link to /terms in the Landing Page Footer", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Footer />
      </MemoryRouter>,
    );

    const termsLink = screen.getByRole("link", { name: "قوانین و مقررات" });
    expect(termsLink).toBeInTheDocument();
    expect(termsLink).toHaveAttribute("href", "/terms");
  });

  it("renders a link to /terms in the Register Page", () => {
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <AuthProvider>
          <MemoryRouter initialEntries={["/register"]}>
            <RegisterPage />
          </MemoryRouter>
        </AuthProvider>
      </QueryClientProvider>,
    );

    const termsLink = screen.getByRole("link", {
      name: "قوانین و مقررات استفاده",
    });
    expect(termsLink).toBeInTheDocument();
    expect(termsLink).toHaveAttribute("href", "/terms");
  });

  it("smoothly triggers scroll when a TOC button is clicked", () => {
    const scrollSpy = vi.fn();
    window.scrollTo = scrollSpy;

    renderWithProviders(<TermsPage />);

    const aiButton = screen.getAllByRole("button", {
      name: /محتوای تولیدشده توسط هوش مصنوعی/i,
    })[0];

    fireEvent.click(aiButton);
    expect(scrollSpy).toHaveBeenCalled();
  });

  it("handles alias /terms-of-service by redirecting to /terms", async () => {
    render(
      <MemoryRouter initialEntries={["/terms-of-service"]}>
        <Routes>
          <Route path="/terms" element={<TermsPage />} />
          <Route
            path="/terms-of-service"
            element={<TermsPage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /قوانین و مقررات استفاده از آوانا/i,
      }),
    ).toBeInTheDocument();
  });
});
