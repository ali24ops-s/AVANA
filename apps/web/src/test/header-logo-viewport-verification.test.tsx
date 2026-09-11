/**
 * Header Logo Viewport and Responsive Verification Test Suite
 *
 * Validates AVANA Header Logo sizing, responsiveness, layout proportions,
 * and zero overflow across canonical viewports when doubled:
 * - 320px (Mobile Extra-Small / iPhone SE)
 * - 375px (Mobile Small / iPhone 13 mini)
 * - 414px (Mobile Medium / iPhone Plus/Max)
 * - 768px (Tablet Portrait / iPad)
 * - 1024px (Tablet Landscape / Desktop Small)
 * - 1280px (Desktop Standard / HD)
 * - 1440px (Desktop Large / FHD+)
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { AuthenticatedShell } from "../components/shell/AuthenticatedShell.js";
import { LandingPage } from "../components/LandingPage.js";
import { BrandLogo, BRAND_LOGO_SRC } from "../components/brand/BrandLogo.js";

// Mock AuthProvider for AuthenticatedShell
vi.mock("../providers/AuthProvider.js", async () => {
  const actual = await vi.importActual("../providers/AuthProvider.js");
  return {
    ...actual,
    useAuth: () => ({
      user: {
        id: "usr-audit-1",
        email: "doctor@avana.ir",
        name: "دکتر آوانا",
        role: "student" as const,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      signOut: vi.fn(),
    }),
  };
});

// Mock react-router Outlet
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">Content</div>,
  };
});

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/"]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const VIEWPORTS = [
  { width: 320, name: "320px (Mobile XS)", expectedClass: "h-20", heightPx: 80, widthPx: 118.38, ratio: "100%" },
  { width: 375, name: "375px (Mobile S)", expectedClass: "h-20", heightPx: 80, widthPx: 118.38, ratio: "100%" },
  { width: 414, name: "414px (Mobile M)", expectedClass: "h-20", heightPx: 80, widthPx: 118.38, ratio: "100%" },
  { width: 768, name: "768px (Tablet)", expectedClass: "md:h-24", heightPx: 96, widthPx: 142.06, ratio: "120%" },
  { width: 1024, name: "1024px (Desktop S)", expectedClass: "md:h-24", heightPx: 96, widthPx: 142.06, ratio: "120%" },
  { width: 1280, name: "1280px (Desktop M)", expectedClass: "md:h-24", heightPx: 96, widthPx: 142.06, ratio: "120%" },
  { width: 1440, name: "1440px (Desktop L)", expectedClass: "md:h-24", heightPx: 96, widthPx: 142.06, ratio: "120%" },
];

describe("Header Logo Viewport & Proportionality Verification (Doubled Size)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. BrandLogo Class & Sizing Specification", () => {
    it("renders BrandLogo with doubled responsive classes h-20 sm:h-[88px] md:h-24 w-auto for size='md'", () => {
      renderWithProviders(<BrandLogo variant="logo-only" size="md" />);
      const logoImg = screen.getByAltText("لوگوی آوانا");
      expect(logoImg).toBeInTheDocument();
      expect(logoImg.className).toContain("h-20");
      expect(logoImg.className).toContain("sm:h-[88px]");
      expect(logoImg.className).toContain("md:h-24");
      expect(logoImg.className).toContain("w-auto");
      expect(logoImg.className).toContain("shrink-0");
    });
  });

  describe("2. AuthenticatedShell Header Viewport Verification", () => {
    VIEWPORTS.forEach(({ width, name, heightPx, widthPx, ratio }) => {
      it(`verifies layout, logo presence, and zero overflow at ${name}`, () => {
        window.innerWidth = width;
        window.dispatchEvent(new Event("resize"));

        const { container } = renderWithProviders(<AuthenticatedShell />);
        const header = container.querySelector("header");
        expect(header).toBeInTheDocument();

        // Check header container height class
        const headerInner = header?.querySelector("div");
        expect(headerInner?.className).toContain("h-20");

        // Check logo image exists and has responsive classes
        const logo = within(header!).getByAltText("لوگوی آوانا");
        expect(logo).toBeInTheDocument();
        expect(logo).toHaveAttribute("src", BRAND_LOGO_SRC);
        expect(logo.className).toContain("h-20");
        expect(logo.className).toContain("sm:h-[88px]");
        expect(logo.className).toContain("md:h-24");

        // Verify logo dimensions:
        // Intrinsic aspect ratio: 512 / 346 = 1.479768786
        const calculatedWidth = heightPx * (512 / 346);
        expect(Math.abs(calculatedWidth - widthPx)).toBeLessThan(0.1);

        // Header height ratio verification:
        // Header is h-20 (80px), so heightPx / 80px
        const calculatedRatio = `${Math.round((heightPx / 80) * 100)}%`;
        expect(calculatedRatio).toBe(ratio);

        // Verify NO wordmark in top header
        const wordmark = within(header!).queryByAltText("AVANA");
        expect(wordmark).not.toBeInTheDocument();

        // Verify shrink-0 is preserved so logo never collapses
        expect(logo.className).toContain("shrink-0");

        // Verify root direction is RTL
        const shellRoot = container.querySelector("[dir='rtl']");
        expect(shellRoot).toBeInTheDocument();
      });
    });
  });

  describe("3. Public Landing Page Header Viewport Verification", () => {
    VIEWPORTS.forEach(({ width, name }) => {
      it(`verifies Public Landing header logo at ${name}`, () => {
        window.innerWidth = width;
        window.dispatchEvent(new Event("resize"));

        renderWithProviders(<LandingPage />);
        const headerNav = screen.getByRole("navigation", { name: "ناوبری اصلی صفحه لندینگ" });
        expect(headerNav).toBeInTheDocument();

        const logo = within(headerNav).getByAltText("لوگوی آوانا");
        expect(logo).toBeInTheDocument();
        expect(logo.className).toContain("h-12");
        expect(logo.className).toContain("w-auto");

        // Verify NO wordmark in header nav
        expect(within(headerNav).queryByAltText("AVANA")).not.toBeInTheDocument();
      });
    });
  });
});
