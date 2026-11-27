import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminPocketAssertionsPage } from "../pages/admin/pocket/AdminPocketAssertionsPage.js";
import { AdminPocketNavigation } from "../components/admin/pocket/AdminPocketNavigation.js";

const mockUsePocketPermissions = vi.fn();
const mockUsePocketAdminAssertions = vi.fn();

vi.mock("../hooks/usePocketPermissions.js", () => ({
  usePocketPermissions: () => mockUsePocketPermissions(),
}));

vi.mock("../hooks/usePocketAssertions.js", () => ({
  usePocketAdminAssertions: (...args: unknown[]) => mockUsePocketAdminAssertions(...args),
}));

function renderWithProviders(ui: React.ReactElement, initialRoute = "/admin/pocket/assertions") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Admin Pocket Assertions Page (Phase 2.2)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUsePocketPermissions.mockReturnValue({
      canManageReviewers: true,
      isLoading: false,
    });

    mockUsePocketAdminAssertions.mockReturnValue({
      data: {
        items: [
          {
            id: "a-1",
            assertionRootId: "root-1",
            versionNumber: 1,
            assertionKey: "amoxicillin-dosing",
            statementText: "دوز استاندارد آموکسی‌سیلین در بزرگسالان",
            assertionType: "dosing",
            aggregateType: "drug",
            aggregateId: "drug-1",
            aggregateTitleFa: "آموکسی‌سیلین",
            aggregateTitleEn: "Amoxicillin",
            aggregateSlug: "amoxicillin",
            status: "in_review",
            createdAt: "2026-11-20T10:00:00.000Z",
            updatedAt: "2026-11-25T10:00:00.000Z",
            clinicalSummary: {
              isClinicallyVerified: false,
              quorumSatisfied: false,
              requiredApprovals: 2,
              validApprovalCount: 1,
              validRejectionCount: 0,
              activeDisagreement: false,
              hasActiveConflict: false,
              hasActiveSafetyOverride: false,
              verificationBlockReasons: ["quorum_not_met"],
            },
          },
          {
            id: "a-2",
            assertionRootId: "root-2",
            versionNumber: 2,
            assertionKey: "warfarin-bleeding-risk",
            statementText: "هشدار خونریزی وارفارین",
            assertionType: "safety_warning",
            aggregateType: "drug",
            aggregateId: "drug-2",
            aggregateTitleFa: "وارفارین",
            aggregateTitleEn: "Warfarin",
            aggregateSlug: "warfarin",
            status: "published",
            createdAt: "2026-11-20T10:00:00.000Z",
            updatedAt: "2026-11-26T10:00:00.000Z",
            clinicalSummary: {
              isClinicallyVerified: false,
              quorumSatisfied: true,
              requiredApprovals: 2,
              validApprovalCount: 2,
              validRejectionCount: 0,
              activeDisagreement: false,
              hasActiveConflict: false,
              hasActiveSafetyOverride: true,
              verificationBlockReasons: ["active_safety_override"],
            },
          },
        ],
        totalCount: 25,
        limit: 20,
        offset: 0,
      },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });
  });

  it("renders assertions table with workflow and Resolver clinical badges", () => {
    renderWithProviders(<AdminPocketAssertionsPage />);

    expect(screen.getByText("amoxicillin-dosing")).toBeInTheDocument();
    expect(screen.getByText("آموکسی‌سیلین")).toBeInTheDocument();
    expect(screen.getByText(/در انتظار تکمیل Quorum \(۱\/۲\)/i)).toBeInTheDocument();
    expect(screen.getByText("دارای Safety Override فعال")).toBeInTheDocument();
  });

  it("highlights Assertions tab on /admin/pocket/assertions in AdminPocketNavigation", () => {
    renderWithProviders(<AdminPocketNavigation />, "/admin/pocket/assertions");
    const assertionsLink = screen.getByRole("link", { name: /فهرست Assertionها/i });
    expect(assertionsLink).toHaveAttribute("aria-current", "page");
  });

  it("updates query filters and pagination while preserving active filters", () => {
    renderWithProviders(<AdminPocketAssertionsPage />);

    const selects = screen.getAllByRole("combobox");
    // Status filter
    fireEvent.change(selects[0], { target: { value: "in_review" } });
    // Aggregate filter
    fireEvent.change(selects[1], { target: { value: "drug" } });

    // Next page button
    fireEvent.click(screen.getByLabelText("صفحه بعد"));

    expect(mockUsePocketAdminAssertions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        status: "in_review",
        aggregateType: "drug",
        limit: 20,
        offset: 20,
      }),
      { enabled: true },
    );
  });

  it("renders loading, empty, and error states with retry", () => {
    const refetchMock = vi.fn();
    mockUsePocketAdminAssertions.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      isFetching: false,
      refetch: refetchMock,
    });

    const { rerender } = renderWithProviders(<AdminPocketAssertionsPage />);
    expect(screen.getByText(/در حال بارگذاری/i)).toBeInTheDocument();

    mockUsePocketAdminAssertions.mockReturnValue({
      data: { items: [], totalCount: 0, limit: 20, offset: 0 },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: refetchMock,
    });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/admin/pocket/assertions"]}>
          <AdminPocketAssertionsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText(/هیچ Assertion با فیلترهای انتخاب‌شده یافت نشد/i)).toBeInTheDocument();

    mockUsePocketAdminAssertions.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("خطای ارتباط با سرور"),
      isFetching: false,
      refetch: refetchMock,
    });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/admin/pocket/assertions"]}>
          <AdminPocketAssertionsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /تلاش مجدد/i }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("denies access when user lacks platform_admin permissions", () => {
    mockUsePocketPermissions.mockReturnValue({
      canManageReviewers: false,
      isLoading: false,
    });

    renderWithProviders(<AdminPocketAssertionsPage />);
    expect(screen.getByText(/دسترسی محدود/i)).toBeInTheDocument();
    expect(mockUsePocketAdminAssertions).toHaveBeenCalledWith(
      expect.any(Object),
      { enabled: false },
    );
  });
});
