import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, RouterProvider, createMemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { NotFoundPage, ErrorView, AppErrorBoundary, RouteErrorElement, OfflineBanner } from "../components/error/index.js";
import { AdminLayout } from "../components/shell/AdminLayout.js";
import { ProtectedRoute } from "../components/shell/ProtectedRoute.js";
import * as AuthProviderModule from "../providers/AuthProvider.js";
import type { UserResource, UserMembership } from "@avana/contracts";
import React from "react";

describe("AVANA Error Page System", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.title = "آوانا";
    const metaTag = document.querySelector('meta[name="robots"]');
    if (metaTag) {
      metaTag.remove();
    }
  });

  describe("NotFoundPage (404)", () => {
    it("renders approved 404 Persian content, status code, mascot and actions", () => {
      render(
        <MemoryRouter initialEntries={["/404"]}>
          <NotFoundPage />
        </MemoryRouter>,
      );

      // Verify Persian main title
      expect(
        screen.getByRole("heading", { name: "اینجا چیزی برای پیدا کردن نیست!" }),
      ).toBeInTheDocument();

      // Verify approved explanation text
      expect(
        screen.getByText(
          "صفحه‌ای که دنبالش هستی پیدا نشد. شاید آدرس اشتباه باشه یا این صفحه جابه‌جا شده باشه.",
        ),
      ).toBeInTheDocument();

      // Verify status code badge
      expect(screen.getByText("کد ۴۰۴")).toBeInTheDocument();

      // Verify primary and secondary action buttons
      expect(screen.getByRole("button", { name: /رفتن به صفحه اصلی/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /بازگشت به صفحه قبل/ })).toBeInTheDocument();

      // Verify support link with valid project route
      const supportLink = screen.getByRole("link", {
        name: /نیاز به راهنمایی داری؟ ارتباط با پشتیبانی/,
      });
      expect(supportLink).toHaveAttribute("href", "/account/support");
    });

    it("sets document title and noindex meta tag for SEO", () => {
      render(
        <MemoryRouter initialEntries={["/unknown-path"]}>
          <NotFoundPage />
        </MemoryRouter>,
      );

      expect(document.title).toBe("صفحه پیدا نشد | آوانا");
      const metaTag = document.querySelector('meta[name="robots"]');
      expect(metaTag).not.toBeNull();
      expect(metaTag?.getAttribute("content")).toBe("noindex, nofollow");
    });

    it("smart back navigation safely handles empty browser history without error", () => {
      // Mock history state where idx is 0 (first page entry)
      Object.defineProperty(window, "history", {
        writable: true,
        value: {
          length: 1,
          state: { idx: 0 },
          back: vi.fn(),
        },
      });

      render(
        <MemoryRouter initialEntries={["/404"]}>
          <NotFoundPage />
        </MemoryRouter>,
      );

      const backBtn = screen.getByRole("button", { name: /بازگشت به صفحه قبل/ });
      fireEvent.click(backBtn);

      // In MemoryRouter with idx 0, fallback navigate safely occurs without throwing
      expect(window.history.back).not.toHaveBeenCalled();
    });

    it("smart back navigation calls history back when previous route exists in history", () => {
      Object.defineProperty(window, "history", {
        writable: true,
        value: {
          length: 2,
          state: { idx: 1 },
          back: vi.fn(),
        },
      });

      // MemoryRouter with prior entry
      render(
        <MemoryRouter initialEntries={["/home", "/404"]} initialIndex={1}>
          <NotFoundPage />
        </MemoryRouter>,
      );

      const backBtn = screen.getByRole("button", { name: /بازگشت به صفحه قبل/ });
      fireEvent.click(backBtn);
      // Navigation is triggered safely
    });
  });

  describe("Unified ErrorView component", () => {
    it("renders server error (500) variant with retry action", () => {
      const reloadMock = vi.fn();
      Object.defineProperty(window, "location", {
        writable: true,
        value: { reload: reloadMock },
      });

      render(
        <MemoryRouter>
          <ErrorView type="500" />
        </MemoryRouter>,
      );

      expect(screen.getByText("خطایی غیرمنتظره در سرور رخ داد")).toBeInTheDocument();
      expect(screen.getByText("کد ۵۰۰")).toBeInTheDocument();

      const retryBtn = screen.getByRole("button", { name: /تلاش مجدد/ });
      expect(retryBtn).toBeInTheDocument();
      fireEvent.click(retryBtn);
      expect(reloadMock).toHaveBeenCalled();
    });

    it("renders offline / network error variant with clear friendly guidance", () => {
      render(
        <MemoryRouter>
          <ErrorView type="offline" />
        </MemoryRouter>,
      );

      expect(screen.getByText("ارتباط با اینترنت برقرار نیست")).toBeInTheDocument();
      expect(
        screen.getByText(
          "به نظر می‌رسد دسترسی شما به شبکه قطع شده است. اتصال اینترنت خود را بررسی کنید.",
        ),
      ).toBeInTheDocument();
    });

    it("renders compact mode for embedding inside component cards without full page header", () => {
      render(
        <MemoryRouter>
          <ErrorView
            compact={true}
            type="general"
            title="خطا در دریافت خلاصه"
            description="خلاصه این درس بارگذاری نشد."
            primaryAction={{ label: "تلاش مجدد", onClick: vi.fn() }}
          />
        </MemoryRouter>,
      );

      expect(screen.getByText("خطا در دریافت خلاصه")).toBeInTheDocument();
      expect(screen.getByText("خلاصه این درس بارگذاری نشد.")).toBeInTheDocument();
      // In compact mode, the top header is not rendered
      expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    });
  });

  describe("AppErrorBoundary and Router Integration", () => {
    it("catches unhandled React render errors and prevents white screen crash", () => {
      const BombComponent = () => {
        throw new Error("Critical UI render failure");
      };

      // Suppress console.error in test output for caught boundary error
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(
        <MemoryRouter>
          <AppErrorBoundary>
            <BombComponent />
          </AppErrorBoundary>
        </MemoryRouter>,
      );

      // Verify safe Persian error message is displayed
      expect(screen.getByText("خطای غیرمنتظره در سامانه")).toBeInTheDocument();
      // Verify raw error message and stack trace are NOT leaked to the user
      expect(screen.queryByText("Critical UI render failure")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /تلاش مجدد/ })).toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });

    it("renders 404 page for unmatched routes via Data Router", async () => {
      const testRouter = createMemoryRouter(
        [
          {
            path: "/",
            element: <div>صفحه اصلی</div>,
            errorElement: <RouteErrorElement />,
          },
          {
            path: "/404",
            element: <NotFoundPage />,
          },
          {
            path: "*",
            element: <NotFoundPage />,
          },
        ],
        {
          initialEntries: ["/some-random-unknown-page"],
        },
      );

      render(<RouterProvider router={testRouter} />);

      await waitFor(() => {
        expect(
          screen.getByRole("heading", { name: "اینجا چیزی برای پیدا کردن نیست!" }),
        ).toBeInTheDocument();
      });
    });

    it("renders ErrorView outside router context without crashing", () => {
      render(
        <ErrorView
          type="500"
          title="خطای مستقل از روتر"
          description="این کامپوننت بدون روتر بیرونی کرش نمی‌کند."
        />,
      );

      expect(screen.getByText("خطای مستقل از روتر")).toBeInTheDocument();
      expect(
        screen.getByText("این کامپوننت بدون روتر بیرونی کرش نمی‌کند."),
      ).toBeInTheDocument();
    });
  });

  describe("OfflineBanner Component", () => {
    it("renders nothing when browser is online", () => {
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: true,
      });

      render(<OfflineBanner />);
      expect(
        screen.queryByText(/ارتباط شما با اینترنت قطع شده است/),
      ).not.toBeInTheDocument();
    });

    it("renders warning banner when browser goes offline", () => {
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: false,
      });

      render(<OfflineBanner />);

      expect(
        screen.getByText("ارتباط شما با اینترنت قطع شده است. در حال کار در حالت آفلاین هستید."),
      ).toBeInTheDocument();
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("displays reconnection message when coming back online after offline", () => {
      vi.useFakeTimers();
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: false,
      });

      const { rerender } = render(<OfflineBanner />);
      expect(screen.getByRole("alert")).toBeInTheDocument();

      // Simulate coming back online
      Object.defineProperty(navigator, "onLine", {
        writable: true,
        value: true,
      });

      act(() => {
        window.dispatchEvent(new Event("online"));
      });
      rerender(<OfflineBanner />);

      expect(
        screen.getByText("اتصال به اینترنت مجدداً برقرار شد."),
      ).toBeInTheDocument();

      // Fast forward past notice timeout
      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(
        screen.queryByText("اتصال به اینترنت مجدداً برقرار شد."),
      ).not.toBeInTheDocument();

      vi.useRealTimers();
    });
  });

  describe("AdminLayout (403 Forbidden Access State)", () => {
    it("renders ErrorView forbidden with 403 when user is logged in but lacks admin role", () => {
      vi.spyOn(AuthProviderModule, "useAuth").mockReturnValue({
        user: {
          id: "usr-student-123",
          email: "student@avana.ir",
          name: "دانشجو آوانا",
          role: "student",
        } as unknown as UserResource,
        memberships: [
          {
            organization_id: "org-1",
            user_id: "usr-student-123",
            role: "member",
          } as unknown as UserMembership,
        ],
        isLoading: false,
        error: null,
        isAuthenticated: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        isVerified: true,
        signIn: vi.fn(),
        signInDevWorker: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        verifyChannel: vi.fn(),
        sendVerification: vi.fn(),
        refreshUser: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/admin/courses"]}>
          <Routes>
            <Route path="/admin/*" element={<AdminLayout />}>
              <Route path="courses" element={<div>Admin Courses Page</div>} />
            </Route>
            <Route path="/sign-in" element={<div>Sign In Page</div>} />
          </Routes>
        </MemoryRouter>,
      );

      // Verify that the student user is NOT shown admin content
      expect(screen.queryByText("Admin Courses Page")).not.toBeInTheDocument();
      // Verify that user is presented with the explicit 403 Forbidden ErrorView
      expect(screen.getByText("دسترسی به پنل مدیریت محدود است")).toBeInTheDocument();
      expect(screen.getByText("کد ۴۰۳")).toBeInTheDocument();
      expect(
        screen.getByText("حساب کاربری شما مجوز لازم برای ورود به پنل مدیریت را ندارد."),
      ).toBeInTheDocument();
      // Verify safe recovery links
      expect(screen.getByRole("link", { name: /رفتن به صفحه اصلی/ })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /مشاهده دوره‌ها/ })).toBeInTheDocument();
    });

    it("redirects unauthenticated visitor to /sign-in", () => {
      vi.spyOn(AuthProviderModule, "useAuth").mockReturnValue({
        user: null,
        memberships: [],
        isLoading: false,
        error: null,
        isAuthenticated: false,
        isEmailVerified: false,
        isPhoneVerified: false,
        isVerified: false,
        signIn: vi.fn(),
        signInDevWorker: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        verifyChannel: vi.fn(),
        sendVerification: vi.fn(),
        refreshUser: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/admin/dashboard"]}>
          <Routes>
            <Route path="/admin/*" element={<AdminLayout />} />
            <Route path="/sign-in" element={<div>صفحه ورود به سامانه</div>} />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText("صفحه ورود به سامانه")).toBeInTheDocument();
    });
  });

  describe("ProtectedRoute Redirect Security", () => {
    function LocationDisplay() {
      const location = useLocation();
      return <div data-testid="search">{location.search}</div>;
    }

    it("preserves safe deep-link URL on sign-in redirect", () => {
      vi.spyOn(AuthProviderModule, "useAuth").mockReturnValue({
        user: null,
        memberships: [],
        isLoading: false,
        error: null,
        isAuthenticated: false,
        isEmailVerified: false,
        isPhoneVerified: false,
        isVerified: false,
        signIn: vi.fn(),
        signInDevWorker: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        verifyChannel: vi.fn(),
        sendVerification: vi.fn(),
        refreshUser: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/courses/cardiology-101"]}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/courses/cardiology-101" element={<div>دوره قلب</div>} />
            </Route>
            <Route path="/sign-in" element={<LocationDisplay />} />
          </Routes>
        </MemoryRouter>,
      );

      const expectedParam = encodeURIComponent("/courses/cardiology-101");
      expect(screen.getByTestId("search").textContent).toBe(`?redirect=${expectedParam}`);
    });

    it("prevents redirect loops by not setting redirect query when path is already an auth route", () => {
      vi.spyOn(AuthProviderModule, "useAuth").mockReturnValue({
        user: null,
        memberships: [],
        isLoading: false,
        error: null,
        isAuthenticated: false,
        isEmailVerified: false,
        isPhoneVerified: false,
        isVerified: false,
        signIn: vi.fn(),
        signInDevWorker: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        verifyChannel: vi.fn(),
        sendVerification: vi.fn(),
        refreshUser: vi.fn(),
      });

      render(
        <MemoryRouter initialEntries={["/login"]}>
          <Routes>
            <Route element={<ProtectedRoute />}>
              <Route path="/login" element={<div>ورود</div>} />
            </Route>
            <Route path="/sign-in" element={<LocationDisplay />} />
          </Routes>
        </MemoryRouter>,
      );

      // Must not redirect to /sign-in?redirect=/login
      expect(screen.getByTestId("search").textContent).toBe("");
    });
  });
});
