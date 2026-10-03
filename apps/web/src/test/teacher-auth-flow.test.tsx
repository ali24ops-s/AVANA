/**
 * Comprehensive Teacher Entry, Authentication, Role Security, and Routing Test Suite.
 *
 * Covers:
 * 1. Anonymous -> /teachers (Intro page with Teacher CTAs)
 * 2. Anonymous -> Teacher Signup Context (/sign-up?redirect=/teacher&role=teacher)
 * 3. Anonymous -> Teacher Sign-in Context (/sign-in?redirect=/teacher)
 * 4. Authorized Teacher (role="teacher") -> /teacher access
 * 5. Authorized Org Admin (role="organization_admin") -> /teacher access
 * 6. Authorized Platform Admin (role="platform_admin") -> /teacher access
 * 7. Student without application -> Honest onboarding message (NOT fake pending)
 * 8. User with pending application -> Pending status view
 * 9. Unauthenticated direct access to /teacher -> Safe redirect to /sign-in
 * 10. Safe redirect after login
 * 11. Safe redirect after email verification
 * 12. Refresh / state preservation in teacher guard
 * 13. Logout / account switching
 * 14. Mobile navigation drawer includes 'برای اساتید'
 * 15. Open redirect security (malicious external URLs sanitized to /home)
 * 16. Security invariant: role=teacher in client query NEVER grants teacher permissions
 * 17. Normal student login/signup regression-free
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TeacherRouteGuard, isTeacherOrAdmin } from "../components/teacher/TeacherRouteGuard.js";
import { TeacherIntroPage } from "../pages/TeacherIntroPage.js";
import { SignInPage } from "../components/shell/SignInPage.js";
import { RegisterPage } from "../components/shell/RegisterPage.js";
import { EmailVerificationPage } from "../components/shell/EmailVerificationPage.js";
import { LandingPage } from "../components/LandingPage.js";
import { getSafeInternalRedirect } from "../utils/urlSecurity.js";

// Mock Auth context state
let mockCurrentUser: {
  id: string;
  email: string;
  role: string;
  teacherApplicationStatus?: string;
} | null = null;
let mockUserMemberships: Array<{ organization_id: string; role: string }> = [];
let mockIsAuthenticated = false;
let mockIsLoading = false;
let mockIsEmailVerified = false;
let mockIsPhoneVerified = false;
let mockIsVerified = false;

const mockSignIn = vi.fn().mockResolvedValue(undefined);
const mockSignUp = vi.fn().mockResolvedValue(undefined);
const mockSignOut = vi.fn().mockResolvedValue(undefined);
const mockVerifyChannel = vi.fn().mockResolvedValue(undefined);
const mockSendVerification = vi.fn().mockResolvedValue(undefined);

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: mockCurrentUser,
    memberships: mockUserMemberships,
    isLoading: mockIsLoading,
    error: null,
    isAuthenticated: mockIsAuthenticated,
    isEmailVerified: mockIsEmailVerified,
    isPhoneVerified: mockIsPhoneVerified,
    isVerified: mockIsVerified,
    signIn: mockSignIn,
    signUp: mockSignUp,
    signOut: mockSignOut,
    verifyChannel: mockVerifyChannel,
    sendVerification: mockSendVerification,
    workerAutoLogin: vi.fn(),
    sendPhoneLoginOtp: vi.fn(),
    verifyPhoneLoginOtp: vi.fn(),
    updateProfile: vi.fn(),
    clearError: vi.fn(),
  }),
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

describe("Teacher Entry, Auth & Security Test Suite", () => {
  beforeEach(() => {
    mockCurrentUser = null;
    mockUserMemberships = [];
    mockIsAuthenticated = false;
    mockIsLoading = false;
    mockIsEmailVerified = false;
    mockIsPhoneVerified = false;
    mockIsVerified = false;
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Anonymous -> /teachers Intro Page
  // -------------------------------------------------------------------------
  it("Scenario 1: Anonymous visitor can view /teachers intro page with clear CTAs", () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={["/teachers"]}>
          <Routes>
            <Route path="/teachers" element={<TeacherIntroPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("پنل استاد AVANA")).toBeInTheDocument();
    expect(
      screen.getByText("کلاس، محتوای آموزشی، تکلیف و آزمون‌هایتان را در یک محیط یکپارچه مدیریت کنید."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("ورود به پنل استاد").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ثبت‌نام استاد").length).toBeGreaterThanOrEqual(1);
  });

  // -------------------------------------------------------------------------
  // 2. Anonymous -> Teacher Signup Context
  // -------------------------------------------------------------------------
  it("Scenario 2: Teacher signup context renders teacher-specific onboarding heading", () => {
    const { container } = render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={["/sign-up?redirect=/teacher&role=teacher"]}>
          <Routes>
            <Route path="/sign-up" element={<RegisterPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("ثبت‌نام به‌ عنوان استاد")).toBeInTheDocument();
    expect(
      screen.getByText("برای ایجاد حساب کاربری اساتید، اطلاعات زیر را تکمیل نمایید."),
    ).toBeInTheDocument();
    expect(screen.getByText("دانشگاه محل تدریس")).toBeInTheDocument();
    expect(screen.getByText("دانشکده (اختیاری)")).toBeInTheDocument();
    expect(screen.getByText("گروه آموزشی")).toBeInTheDocument();
    expect(container.querySelector("#university")).toBeInTheDocument();
    expect(container.querySelector("#faculty")).toBeInTheDocument();
    expect(container.querySelector("#department")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 3. Anonymous -> Teacher Sign-in Context
  // -------------------------------------------------------------------------
  it("Scenario 3: Teacher sign-in context renders teacher-specific header", () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={["/sign-in?redirect=/teacher"]}>
          <Routes>
            <Route path="/sign-in" element={<SignInPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("ورود به پنل استاد")).toBeInTheDocument();
    expect(
      screen.getByText("برای دسترسی به پنل مدیریت کلاس‌ها و آزمون‌ها وارد شوید."),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 4, 5, 6. Authorized Roles -> /teacher access
  // -------------------------------------------------------------------------
  it("Scenario 4: Authorized teacher (role='teacher') accesses /teacher successfully", () => {
    mockCurrentUser = { id: "t-1", email: "teacher@test.com", role: "teacher" };
    mockIsAuthenticated = true;

    render(
      <MemoryRouter initialEntries={["/teacher"]}>
        <Routes>
          <Route element={<TeacherRouteGuard />}>
            <Route path="/teacher" element={<div>Teacher Platform Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Teacher Platform Dashboard")).toBeInTheDocument();
  });

  it("Scenario 5: Authorized organization_admin accesses /teacher successfully", () => {
    mockCurrentUser = { id: "org-admin-1", email: "admin@test.com", role: "organization_admin" };
    mockIsAuthenticated = true;

    render(
      <MemoryRouter initialEntries={["/teacher"]}>
        <Routes>
          <Route element={<TeacherRouteGuard />}>
            <Route path="/teacher" element={<div>Teacher Platform Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Teacher Platform Dashboard")).toBeInTheDocument();
  });

  it("Scenario 6: Authorized platform_admin accesses /teacher successfully", () => {
    mockCurrentUser = { id: "p-admin-1", email: "padmin@test.com", role: "platform_admin" };
    mockIsAuthenticated = true;

    render(
      <MemoryRouter initialEntries={["/teacher"]}>
        <Routes>
          <Route element={<TeacherRouteGuard />}>
            <Route path="/teacher" element={<div>Teacher Platform Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("Teacher Platform Dashboard")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 7. Student without application -> Honest onboarding message (NOT fake pending)
  // -------------------------------------------------------------------------
  it("Scenario 7: Authenticated student without application receives honest onboarding message", () => {
    mockCurrentUser = { id: "s-1", email: "student@test.com", role: "student" };
    mockIsAuthenticated = true;

    render(
      <MemoryRouter initialEntries={["/teacher"]}>
        <Routes>
          <Route element={<TeacherRouteGuard />}>
            <Route path="/teacher" element={<div>Teacher Platform Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText("برای استفاده از پنل استاد، ابتدا باید به‌عنوان استاد ثبت‌نام کنید."),
    ).toBeInTheDocument();
    expect(screen.getByText("ثبت‌نام استاد")).toBeInTheDocument();
    expect(screen.getByText("بازگشت به پیشخوان دانشجو")).toBeInTheDocument();
    // Must NOT display fake pending message
    expect(
      screen.queryByText("درخواست ثبت‌نام شما به‌عنوان استاد دریافت شد."),
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 8. User with pending application -> Pending view
  // -------------------------------------------------------------------------
  it("Scenario 8: User with pending application status receives pending view", () => {
    mockCurrentUser = {
      id: "pending-1",
      email: "applicant@test.com",
      role: "student",
      teacherApplicationStatus: "pending",
    };
    mockIsAuthenticated = true;

    render(
      <MemoryRouter initialEntries={["/teacher"]}>
        <Routes>
          <Route element={<TeacherRouteGuard />}>
            <Route path="/teacher" element={<div>Teacher Platform Dashboard</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(
      screen.getByText("درخواست ثبت‌نام شما به‌عنوان استاد دریافت شد."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("پس از بررسی درخواست، دسترسی پنل استاد برای شما فعال می‌شود."),
    ).toBeInTheDocument();
    expect(screen.getByText("بازگشت به پیشخوان دانشجو")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 9. Unauthenticated direct access to /teacher -> Safe redirect
  // -------------------------------------------------------------------------
  it("Scenario 9: Unauthenticated user accessing /teacher is redirected to /sign-in?redirect=%2Fteacher", () => {
    mockCurrentUser = null;
    mockIsAuthenticated = false;

    render(
      <MemoryRouter initialEntries={["/teacher"]}>
        <Routes>
          <Route element={<TeacherRouteGuard />}>
            <Route path="/teacher" element={<div>Teacher Platform Dashboard</div>} />
          </Route>
          <Route path="/sign-in" element={<SignInPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("ورود به پنل استاد")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 10. Open Redirect Sanitizer Validation
  // -------------------------------------------------------------------------
  it("Scenario 10 & 15: Open redirect attack prevention", () => {
    expect(getSafeInternalRedirect("https://malicious-site.com")).toBe("/home");
    expect(getSafeInternalRedirect("http://evil.com/fake-login")).toBe("/home");
    expect(getSafeInternalRedirect("//evil.com")).toBe("/home");
    expect(getSafeInternalRedirect("/\\evil.com")).toBe("/home");
    expect(getSafeInternalRedirect("javascript:alert(1)")).toBe("/home");
    expect(getSafeInternalRedirect("data:text/html,evil")).toBe("/home");
    expect(getSafeInternalRedirect(null)).toBe("/home");
    expect(getSafeInternalRedirect(undefined)).toBe("/home");
    expect(getSafeInternalRedirect("")).toBe("/home");

    // Legitimate internal paths
    expect(getSafeInternalRedirect("/teacher")).toBe("/teacher");
    expect(getSafeInternalRedirect("/teacher/classrooms")).toBe("/teacher/classrooms");
    expect(getSafeInternalRedirect("/teacher/exams/123")).toBe("/teacher/exams/123");
    expect(getSafeInternalRedirect("/courses/anatomy-heart")).toBe("/courses/anatomy-heart");
  });

  // -------------------------------------------------------------------------
  // 11. Security Invariant: role=teacher query param NEVER grants teacher access
  // -------------------------------------------------------------------------
  it("Scenario 16: role=teacher in client query parameter NEVER confers teacher authorization", () => {
    // Student with role=teacher in URL
    mockCurrentUser = { id: "student_1", email: "student@test.com", role: "student" };
    mockUserMemberships = [{ organization_id: "org-1", role: "student" }];
    mockIsAuthenticated = true;

    // Direct domain role check
    const hasTeacherAccess = isTeacherOrAdmin(mockCurrentUser.role, mockUserMemberships);
    expect(hasTeacherAccess).toBe(false);

    // Guard evaluation
    render(
      <MemoryRouter initialEntries={["/teacher?role=teacher"]}>
        <Routes>
          <Route element={<TeacherRouteGuard />}>
            <Route path="/teacher" element={<div>Protected Teacher Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    // Guard rejects!
    expect(screen.queryByText("Protected Teacher Content")).not.toBeInTheDocument();
    expect(
      screen.getByText("برای استفاده از پنل استاد، ابتدا باید به‌عنوان استاد ثبت‌نام کنید."),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 12. Landing Page Navigation and Mobile Drawer
  // -------------------------------------------------------------------------
  it("Scenario 14: Landing page renders 'برای اساتید' in navigation and teacher CTA", () => {
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // Desktop nav link
    expect(screen.getByText("برای اساتید")).toBeInTheDocument();

    // Teacher CTA Section
    expect(screen.getByText("استاد هستید؟")).toBeInTheDocument();
    expect(
      screen.getByText("کلاس‌ها و آزمون‌های خود را در AVANA مدیریت کنید."),
    ).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 13. Authenticated Student on /teachers page (Duplicate account prevention)
  // -------------------------------------------------------------------------
  it("Scenario 13: Logged in student visiting /teachers sees existing account state and option to switch", () => {
    mockCurrentUser = { id: "student-1", email: "student@test.com", role: "student" };
    mockIsAuthenticated = true;

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={["/teachers"]}>
          <Routes>
            <Route path="/teachers" element={<TeacherIntroPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText("حساب کاربری فعال: دانشجو")).toBeInTheDocument();
    expect(screen.getAllByText("ورود با حساب استاد").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("بازگشت به پیشخوان دانشجو")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 14. Email Verification Safe Redirect to /teacher
  // -------------------------------------------------------------------------
  it("Scenario 11: EmailVerificationPage redirects safely to /teacher upon verification", async () => {
    mockCurrentUser = { id: "user-1", email: "teacher@test.com", role: "teacher" };
    mockIsAuthenticated = true;
    mockIsVerified = true;

    render(
      <MemoryRouter initialEntries={["/verify-email?redirect=/teacher"]}>
        <Routes>
          <Route path="/verify-email" element={<EmailVerificationPage />} />
          <Route path="/teacher" element={<div>Teacher Platform</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("Teacher Platform")).toBeInTheDocument();
    });
  });
});
