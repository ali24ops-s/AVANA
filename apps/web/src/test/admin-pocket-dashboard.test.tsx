import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminPocketDashboardPage } from "../pages/admin/pocket/AdminPocketDashboardPage.js";
import { AdminPocketNavigation } from "../components/admin/pocket/AdminPocketNavigation.js";

const mockUsePocketPermissions = vi.fn();
const mockUsePocketAdminSummary = vi.fn();

vi.mock("../hooks/usePocketPermissions.js", () => ({
  usePocketPermissions: () => mockUsePocketPermissions(),
}));

vi.mock("../hooks/usePocketAdminSummary.js", () => ({
  usePocketAdminSummary: (...args: unknown[]) => mockUsePocketAdminSummary(...args),
}));

function renderWithProviders(ui: React.ReactElement, initialRoute = "/admin/pocket") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Admin Pocket Dashboard Page (Phase 2.1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUsePocketPermissions.mockReturnValue({
      canManageReviewers: true,
      canManageSafetyOverrides: true,
      isLoading: false,
    });

    mockUsePocketAdminSummary.mockReturnValue({
      data: {
        assertions: {
          total: 24,
          draft: 5,
          inReview: 4,
          reviewed: 3,
          verified: 2,
          published: 8,
          superseded: 1,
          retired: 1,
        },
        clinical: {
          evaluatedAssertionsCount: 13,
          quorumMetCount: 10,
          quorumNotMetCount: 3,
          activeConflictCount: 1,
          activeSafetyOverrideCount: 2,
          verificationBlockedCount: 3,
        },
        operations: {
          activeReviewerCredentialsCount: 6,
          activeSafetyOverridesCount: 2,
        },
        generatedAt: "2026-11-27T00:00:00.000Z",
      },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });
  });

  it("renders dashboard KPIs with Persian digits and quick links", () => {
    renderWithProviders(<AdminPocketDashboardPage />);

    expect(screen.getByText("داشبورد AVANA Pocket")).toBeInTheDocument();
    expect(screen.getByText("۲۴")).toBeInTheDocument();
    expect(screen.getByText("۴")).toBeInTheDocument();
    expect(screen.getByText("۸")).toBeInTheDocument();
    expect(screen.getByText("۱۰")).toBeInTheDocument();
    expect(screen.getByText("۶")).toBeInTheDocument();

    expect(screen.getAllByRole("link", { name: /مدیریت داوران/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole("link", { name: /مدیریت داوران/i })[0]).toHaveAttribute(
      "href",
      "/admin/pocket/reviewers",
    );
    expect(
      screen.getAllByRole("link", { name: /مدیریت Safety Override/i })[0],
    ).toHaveAttribute("href", "/admin/pocket/safety-overrides");
  });

  it("highlights Dashboard tab on /admin/pocket in AdminPocketNavigation", () => {
    renderWithProviders(<AdminPocketNavigation />, "/admin/pocket");
    const dashboardLink = screen.getByRole("link", { name: "داشبورد" });
    const reviewersLink = screen.getByRole("link", { name: /مدیریت داوران/i });
    expect(dashboardLink).toHaveAttribute("aria-current", "page");
    expect(reviewersLink).not.toHaveAttribute("aria-current");
  });

  it("renders loading state and delays query while permissions are loading", () => {
    mockUsePocketPermissions.mockReturnValue({
      canManageReviewers: false,
      isLoading: true,
    });
    mockUsePocketAdminSummary.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderWithProviders(<AdminPocketDashboardPage />);
    expect(screen.getByText(/در حال دریافت آمار عملیاتی Pocket/i)).toBeInTheDocument();
    expect(mockUsePocketAdminSummary).toHaveBeenCalledWith({ enabled: false });
  });

  it("renders error state and invokes refetch on retry button click", () => {
    const refetchMock = vi.fn();
    mockUsePocketAdminSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("خطای ارتباط با سرور"),
      isFetching: false,
      refetch: refetchMock,
    });

    renderWithProviders(<AdminPocketDashboardPage />);
    expect(screen.getByText("خطای ارتباط با سرور")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /تلاش مجدد/i }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("renders empty database notice when all counts are zero", () => {
    mockUsePocketAdminSummary.mockReturnValue({
      data: {
        assertions: {
          total: 0,
          draft: 0,
          inReview: 0,
          reviewed: 0,
          verified: 0,
          published: 0,
          superseded: 0,
          retired: 0,
        },
        clinical: {
          evaluatedAssertionsCount: 0,
          quorumMetCount: 0,
          quorumNotMetCount: 0,
          activeConflictCount: 0,
          activeSafetyOverrideCount: 0,
          verificationBlockedCount: 0,
        },
        operations: {
          activeReviewerCredentialsCount: 0,
          activeSafetyOverridesCount: 0,
        },
        generatedAt: "2026-11-27T00:00:00.000Z",
      },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderWithProviders(<AdminPocketDashboardPage />);
    expect(screen.getByText(/بدون داده عملیاتی/i)).toBeInTheDocument();
  });

  it("denies access when user is not platform_admin", () => {
    mockUsePocketPermissions.mockReturnValue({
      canManageReviewers: false,
      isLoading: false,
    });

    renderWithProviders(<AdminPocketDashboardPage />);
    expect(screen.getByText(/دسترسی محدود/i)).toBeInTheDocument();
    expect(mockUsePocketAdminSummary).toHaveBeenCalledWith({ enabled: false });
  });
});
