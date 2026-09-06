/**
 * Header Logo Consistency Test Suite
 *
 * Verifies that all headers across the application (Landing, About/Blog,
 * Terms, AuthenticatedShell, Sign-In, Register, Email Verification,
 * Onboarding, Processing, Upload, Quiz/Exam, and Admin) display only
 * the AVANA logo icon/symbol and do NOT render any wordmarks.
 * Also verifies that non-header sections (such as footers) preserve
 * their intended brand wordmarks.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { LandingPage } from "../components/LandingPage.js";
import { AboutNavbar } from "../components/about/AboutNavbar.js";
import { TermsPage } from "../pages/TermsPage.js";
import { AuthenticatedShell } from "../components/shell/AuthenticatedShell.js";
import { SignInPage } from "../components/shell/SignInPage.js";
import { RegisterPage } from "../components/shell/RegisterPage.js";
import { EmailVerificationPage } from "../components/shell/EmailVerificationPage.js";
import { AdminSidebar } from "../components/admin/AdminSidebar.js";
import { OnboardingFlow } from "../components/OnboardingFlow.js";
import { ProcessingPage } from "../components/processing/ProcessingPage.js";
import { UploadPage } from "../components/upload/UploadPage.js";
import { ExamTakingView } from "../components/quiz/ExamTakingView.js";
import { BRAND_LOGO_SRC, BRAND_WORDMARK_SRC } from "../components/brand/BrandLogo.js";

// Mock AuthProvider for components that rely on useAuth
let mockAuthState = {
  user: {
    id: "user-test-1",
    email: "test@avana.ir",
    name: "کاربر تستی",
    role: "student" as const,
  },
  isAuthenticated: true,
  isLoading: false,
};

vi.mock("../providers/AuthProvider.js", async () => {
  const actual = await vi.importActual("../providers/AuthProvider.js");
  return {
    ...actual,
    useAuth: () => ({
      user: mockAuthState.user,
      isAuthenticated: mockAuthState.isAuthenticated,
      isLoading: mockAuthState.isLoading,
      login: vi.fn(),
      register: vi.fn(),
      signOut: vi.fn(),
      verifyEmail: vi.fn(),
      resendCode: vi.fn(),
    }),
  };
});

// Mock react-router Outlet
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    Outlet: () => <div data-testid="outlet">Outlet Content</div>,
  };
});

function renderWithProviders(ui: React.ReactElement, initialEntries = ["/"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Header Logo Consistency Suite (لوگو فقط نشان/آیکون در تمام هدرها)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = {
      user: {
        id: "user-test-1",
        email: "test@avana.ir",
        name: "کاربر تستی",
        role: "student" as const,
      },
      isAuthenticated: true,
      isLoading: false,
    };
  });

  describe("1. Public Landing Page Header", () => {
    it("renders only the icon logo mark and NO wordmark in the header nav", () => {
      renderWithProviders(<LandingPage />);

      const headerNav = screen.getByRole("navigation", { name: "ناوبری اصلی صفحه لندینگ" });
      expect(headerNav).toBeInTheDocument();

      const logoImg = within(headerNav).getByAltText("لوگوی آوانا");
      expect(logoImg).toBeInTheDocument();
      expect(logoImg).toHaveAttribute("src", BRAND_LOGO_SRC);

      // Verify NO wordmark in header nav
      const wordmarkImg = within(headerNav).queryByAltText("AVANA");
      expect(wordmarkImg).not.toBeInTheDocument();
      const allImages = within(headerNav).getAllByRole("img");
      expect(allImages.every((img) => !img.getAttribute("src")?.includes("avana-wordmark"))).toBe(true);
    });

    it("preserves the wordmark in the Landing Page footer", () => {
      renderWithProviders(<LandingPage />);

      const footer = screen.getByRole("contentinfo");
      expect(footer).toBeInTheDocument();

      const footerWordmark = within(footer).getByAltText("AVANA");
      expect(footerWordmark).toBeInTheDocument();
      expect(footerWordmark).toHaveAttribute("src", BRAND_WORDMARK_SRC);
    });
  });

  describe("2. About & Blog Shared Navbar (AboutNavbar)", () => {
    it("renders only the icon logo mark and NO wordmark in the navbar", () => {
      renderWithProviders(<AboutNavbar />);

      const headerNav = screen.getByRole("navigation", { name: "ناوبری اصلی درباره ما" });
      expect(headerNav).toBeInTheDocument();

      const logoImg = within(headerNav).getByAltText("لوگوی آوانا");
      expect(logoImg).toBeInTheDocument();
      expect(logoImg).toHaveAttribute("src", BRAND_LOGO_SRC);

      const wordmarkImg = within(headerNav).queryByAltText("AVANA");
      expect(wordmarkImg).not.toBeInTheDocument();
    });
  });

  describe("3. Terms Page (قوانین و مقررات)", () => {
    it("renders only the icon logo mark and NO wordmark in the top header", () => {
      renderWithProviders(<TermsPage />);

      const header = screen.getByRole("banner");
      expect(header).toBeInTheDocument();

      const headerLogo = within(header).getByAltText("لوگوی آوانا");
      expect(headerLogo).toBeInTheDocument();

      const headerWordmark = within(header).queryByAltText("AVANA");
      expect(headerWordmark).not.toBeInTheDocument();
    });

    it("preserves the wordmark in the Terms Page footer", () => {
      renderWithProviders(<TermsPage />);

      const footer = screen.getByRole("contentinfo");
      expect(footer).toBeInTheDocument();

      const footerWordmark = within(footer).getByAltText("AVANA");
      expect(footerWordmark).toBeInTheDocument();
    });
  });

  describe("4. Authenticated Shell (هدر اصلی تمام صفحات کاربری)", () => {
    it("renders only the icon logo mark and NO wordmark in top header", () => {
      renderWithProviders(<AuthenticatedShell />);

      const header = screen.getByRole("banner");
      expect(header).toBeInTheDocument();

      const logoImg = within(header).getByAltText("لوگوی آوانا");
      expect(logoImg).toBeInTheDocument();

      const wordmarkImg = within(header).queryByAltText("AVANA");
      expect(wordmarkImg).not.toBeInTheDocument();
    });
  });

  describe("5. Authentication Pages Headers", () => {
    it("Sign-In page header contains only the logo mark and NO wordmark", () => {
      mockAuthState = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
      };
      renderWithProviders(<SignInPage />);

      const header = screen.getByRole("banner");
      expect(header).toBeInTheDocument();

      const headerLogo = within(header).getByAltText("لوگوی آوانا");
      expect(headerLogo).toBeInTheDocument();

      const headerWordmark = within(header).queryByAltText("AVANA");
      expect(headerWordmark).not.toBeInTheDocument();
    });

    it("Register page header contains only the logo mark and NO wordmark", () => {
      mockAuthState = {
        user: null,
        isAuthenticated: false,
        isLoading: false,
      };
      renderWithProviders(<RegisterPage />);

      const header = screen.getByRole("banner");
      expect(header).toBeInTheDocument();

      const headerLogo = within(header).getByAltText("لوگوی آوانا");
      expect(headerLogo).toBeInTheDocument();

      const headerWordmark = within(header).queryByAltText("AVANA");
      expect(headerWordmark).not.toBeInTheDocument();
    });

    it("Email Verification page header contains only the logo mark and NO wordmark", () => {
      mockAuthState = {
        user: {
          id: "user-test-1",
          email: "test@avana.ir",
          name: "کاربر تستی",
          role: "student" as const,
        },
        isAuthenticated: true,
        isLoading: false,
      };
      renderWithProviders(<EmailVerificationPage />);

      const header = screen.getByRole("banner");
      expect(header).toBeInTheDocument();

      const headerLogo = within(header).getByAltText("لوگوی آوانا");
      expect(headerLogo).toBeInTheDocument();

      const headerWordmark = within(header).queryByAltText("AVANA");
      expect(headerWordmark).not.toBeInTheDocument();
    });
  });

  describe("6. Specialized Flows & Views Headers", () => {
    it("OnboardingFlow header contains only the logo mark and NO wordmark", () => {
      renderWithProviders(
        <OnboardingFlow onComplete={vi.fn()} onToggleDark={vi.fn()} isDark={true} />,
      );

      const header = screen.getByRole("banner");
      expect(header).toBeInTheDocument();

      const headerLogo = within(header).getByAltText("لوگوی آوانا");
      expect(headerLogo).toBeInTheDocument();

      const headerWordmark = within(header).queryByAltText("AVANA");
      expect(headerWordmark).not.toBeInTheDocument();
    });

    it("ProcessingPage header contains only the logo mark and NO wordmark", () => {
      renderWithProviders(
        <ProcessingPage onComplete={vi.fn()} onCancel={vi.fn()} isDark={true} />,
      );

      const header = screen.getByRole("banner");
      expect(header).toBeInTheDocument();

      const headerLogo = within(header).getByAltText("لوگوی آوانا");
      expect(headerLogo).toBeInTheDocument();

      const headerWordmark = within(header).queryByAltText("AVANA");
      expect(headerWordmark).not.toBeInTheDocument();
    });

    it("UploadPage header contains only the logo mark and NO wordmark", () => {
      renderWithProviders(
        <UploadPage
          onUploadComplete={vi.fn()}
          onBack={vi.fn()}
          onToggleDark={vi.fn()}
          isDark={true}
        />,
      );

      const header = screen.getByRole("banner");
      expect(header).toBeInTheDocument();

      const headerLogo = within(header).getByAltText("لوگوی آوانا");
      expect(headerLogo).toBeInTheDocument();

      const headerWordmark = within(header).queryByAltText("AVANA");
      expect(headerWordmark).not.toBeInTheDocument();
    });

    it("ExamTakingView header contains only the logo mark and NO wordmark", () => {
      const mockQuestions = [
        {
          id: "q1",
          questionText: "تست سوال",
          options: ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
          correctOption: 0,
        },
      ];

      renderWithProviders(
        <ExamTakingView
          questions={mockQuestions}
          examTitle="آزمون آزمایشی"
          durationMinutes={10}
          onFinish={vi.fn()}
          onExit={vi.fn()}
        />,
      );

      const header = screen.getByRole("banner");
      expect(header).toBeInTheDocument();

      const headerLogo = within(header).getByAltText("لوگوی آوانا");
      expect(headerLogo).toBeInTheDocument();

      const headerWordmark = within(header).queryByAltText("AVANA");
      expect(headerWordmark).not.toBeInTheDocument();
    });
  });

  describe("7. Admin Console Header/Sidebar", () => {
    it("AdminSidebar contains only the logo mark and NO wordmark image", () => {
      renderWithProviders(
        <AdminSidebar mobileOpen={true} onCloseMobile={vi.fn()} />,
      );

      const asides = screen.getAllByRole("complementary");
      expect(asides.length).toBeGreaterThan(0);

      for (const aside of asides) {
        const logoImgs = within(aside).getAllByAltText("لوگوی آوانا");
        expect(logoImgs.length).toBeGreaterThan(0);

        const wordmarkImg = within(aside).queryByAltText("AVANA");
        expect(wordmarkImg).not.toBeInTheDocument();
      }
    });
  });
});
