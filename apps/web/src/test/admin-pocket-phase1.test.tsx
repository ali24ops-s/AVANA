import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminPocketReviewersPage } from "../pages/admin/pocket/AdminPocketReviewersPage.js";
import { AdminPocketSafetyOverridesPage } from "../pages/admin/pocket/AdminPocketSafetyOverridesPage.js";
import { AdminPocketNavigation } from "../components/admin/pocket/AdminPocketNavigation.js";

const mockUsePocketPermissions = vi.fn();
const mockUsePocketReviewerCredentials = vi.fn();
const mockUseGrantReviewerCredential = vi.fn();
const mockUseSuspendReviewerCredential = vi.fn();
const mockUseReactivateReviewerCredential = vi.fn();
const mockUseRevokeReviewerCredential = vi.fn();
const mockUsePocketReviewerCredentialEvents = vi.fn();
const mockUsePocketSafetyOverrides = vi.fn();
const mockUsePocketSafetyOverride = vi.fn();
const mockUseActivateSafetyOverride = vi.fn();
const mockUseClearSafetyOverride = vi.fn();
const mockListUsers = vi.fn();
const mockAdminApi = {
  listUsers: mockListUsers,
};

vi.mock("../hooks/usePocketPermissions.js", () => ({
  usePocketPermissions: () => mockUsePocketPermissions(),
}));

vi.mock("../hooks/usePocketReviewerCredentials.js", () => ({
  usePocketReviewerCredentials: (...args: unknown[]) => mockUsePocketReviewerCredentials(...args),
  useGrantReviewerCredential: () => mockUseGrantReviewerCredential(),
  useSuspendReviewerCredential: () => mockUseSuspendReviewerCredential(),
  useReactivateReviewerCredential: () => mockUseReactivateReviewerCredential(),
  useRevokeReviewerCredential: () => mockUseRevokeReviewerCredential(),
  usePocketReviewerCredentialEvents: (...args: unknown[]) =>
    mockUsePocketReviewerCredentialEvents(...args),
}));

vi.mock("../hooks/usePocketSafetyOverrides.js", () => ({
  usePocketSafetyOverrides: (...args: unknown[]) => mockUsePocketSafetyOverrides(...args),
  usePocketSafetyOverride: (...args: unknown[]) => mockUsePocketSafetyOverride(...args),
  useActivateSafetyOverride: () => mockUseActivateSafetyOverride(),
  useClearSafetyOverride: () => mockUseClearSafetyOverride(),
}));

vi.mock("../hooks/useAdmin.js", () => ({
  useAdmin: () => mockAdminApi,
}));

function renderWithProviders(ui: React.ReactElement, initialRoute = "/admin/pocket/reviewers") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Admin Pocket Phase 1 UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockListUsers.mockResolvedValue({ users: [], totalCount: 0 });

    mockUsePocketPermissions.mockReturnValue({
      canReview: true,
      canVerify: false,
      canPublish: true,
      canManageReviewers: true,
      canManageSafetyOverrides: true,
      isClinicalReviewer: false,
      activeCredential: null,
      isLoading: false,
    });

    mockUseGrantReviewerCredential.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    });
    mockUseSuspendReviewerCredential.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    });
    mockUseReactivateReviewerCredential.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    });
    mockUseRevokeReviewerCredential.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    });
    mockUsePocketReviewerCredentialEvents.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
    });

    mockUseActivateSafetyOverride.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    });
    mockUseClearSafetyOverride.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    });
    mockUsePocketSafetyOverride.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
    });

    mockUsePocketReviewerCredentials.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    mockUsePocketSafetyOverrides.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });
  });

  it("renders AdminPocketNavigation with both Phase 1 links", () => {
    renderWithProviders(<AdminPocketNavigation />, "/admin/pocket/reviewers");
    const reviewersLink = screen.getByRole("link", { name: /مدیریت داوران/i });
    const overridesLink = screen.getByRole("link", { name: /مدیریت Safety Override/i });
    expect(reviewersLink).toHaveAttribute("aria-current", "page");
    expect(overridesLink).not.toHaveAttribute("aria-current");
  });

  it("denies access on both pages when user lacks platform_admin permissions", () => {
    mockUsePocketPermissions.mockReturnValue({
      canManageReviewers: false,
      canManageSafetyOverrides: false,
      isLoading: false,
    });

    const { unmount } = renderWithProviders(<AdminPocketReviewersPage />);
    expect(screen.getByText(/دسترسی محدود/i)).toBeInTheDocument();
    expect(mockUsePocketReviewerCredentials).toHaveBeenCalledWith(
      { limit: 100 },
      { enabled: false },
    );
    unmount();

    renderWithProviders(<AdminPocketSafetyOverridesPage />, "/admin/pocket/safety-overrides");
    expect(screen.getByText(/دسترسی محدود/i)).toBeInTheDocument();
    expect(mockUsePocketSafetyOverrides).toHaveBeenCalledWith(
      { isActive: undefined, targetEntityType: undefined, limit: 100 },
      { enabled: false },
    );
  });

  it("delays queries while permissions are loading", () => {
    mockUsePocketPermissions.mockReturnValue({
      canManageReviewers: false,
      canManageSafetyOverrides: false,
      isLoading: true,
    });

    renderWithProviders(<AdminPocketReviewersPage />);
    expect(mockUsePocketReviewerCredentials).toHaveBeenCalledWith(
      { limit: 100 },
      { enabled: false },
    );
  });

  it("renders active, inactive, and expired credential statuses accurately without guessing suspend vs revoke", () => {
    mockUsePocketReviewerCredentials.mockReturnValue({
      data: [
        {
          id: "cred-active",
          userId: "11111111-1111-4111-8111-111111111111",
          medicalLicenseNumber: "IR-MC-ACTIVE",
          specialty: "داروسازی بالینی",
          licensingAuthority: "نظام پزشکی",
          isActive: true,
          suspendedAt: null,
          suspensionReason: null,
          grantedBy: "admin-1",
          grantedAt: "2026-01-01T00:00:00.000Z",
          licenseExpiresAt: "2030-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "cred-inactive",
          userId: "22222222-2222-4222-8222-222222222222",
          medicalLicenseNumber: "IR-MC-INACTIVE",
          specialty: "طب اورژانس",
          licensingAuthority: "نظام پزشکی",
          isActive: false,
          suspendedAt: "2026-02-01T00:00:00.000Z",
          suspensionReason: "پایان همکاری داور",
          grantedBy: "admin-1",
          grantedAt: "2026-01-01T00:00:00.000Z",
          licenseExpiresAt: "2030-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
        {
          id: "cred-expired",
          userId: "33333333-3333-4333-8333-333333333333",
          medicalLicenseNumber: "IR-MC-EXPIRED",
          specialty: "داخلی",
          licensingAuthority: "نظام پزشکی",
          isActive: true,
          suspendedAt: null,
          suspensionReason: null,
          grantedBy: "admin-1",
          grantedAt: "2020-01-01T00:00:00.000Z",
          licenseExpiresAt: "2022-01-01T00:00:00.000Z",
          createdAt: "2020-01-01T00:00:00.000Z",
          updatedAt: "2020-01-01T00:00:00.000Z",
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderWithProviders(<AdminPocketReviewersPage />);

    const table = screen.getByRole("table");
    expect(within(table).getByText("IR-MC-ACTIVE")).toBeInTheDocument();
    expect(within(table).getByText("IR-MC-INACTIVE")).toBeInTheDocument();
    expect(within(table).getByText("IR-MC-EXPIRED")).toBeInTheDocument();
    expect(within(table).getByText(/معلق|غیرفعال/)).toBeInTheDocument();
    expect(within(table).getByText("منقضی‌شده")).toBeInTheDocument();
    expect(within(table).getByText("پایان همکاری داور")).toBeInTheDocument();
  });

  it("handles suspend confirmation and revoke with both empty and non-empty reason", async () => {
    const suspendMutate = vi.fn().mockResolvedValue({});
    const revokeMutate = vi.fn().mockResolvedValue({});
    mockUseSuspendReviewerCredential.mockReturnValue({
      mutateAsync: suspendMutate,
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    });
    mockUseRevokeReviewerCredential.mockReturnValue({
      mutateAsync: revokeMutate,
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    });

    mockUsePocketReviewerCredentials.mockReturnValue({
      data: [
        {
          id: "cred-1",
          userId: "11111111-1111-4111-8111-111111111111",
          medicalLicenseNumber: "IR-MC-9988",
          specialty: "داروسازی بالینی",
          licensingAuthority: "نظام پزشکی",
          isActive: true,
          suspendedAt: null,
          suspensionReason: null,
          grantedBy: "admin-1",
          grantedAt: "2026-01-01T00:00:00.000Z",
          licenseExpiresAt: "2030-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderWithProviders(<AdminPocketReviewersPage />);

    // 1. Suspend flow
    fireEvent.click(screen.getByRole("button", { name: /تعلیق/i }));
    fireEvent.change(screen.getByLabelText(/دلیل تعلیق/i), {
      target: { value: "بررسی مجدد مدارک" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /تأیید و تعلیق اعتبارنامه/i }));

    await waitFor(() => {
      expect(suspendMutate).toHaveBeenCalledWith({
        id: "cred-1",
        body: { reason: "بررسی مجدد مدارک" },
      });
    });

    // 2. Revoke with empty reason is blocked by validation
    fireEvent.click(screen.getByRole("button", { name: /^لغو$/i }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(screen.getByRole("button", { name: /تأیید و لغو اعتبارنامه/i }).closest("form")!);

    expect(await screen.findByText("ثبت دلیل لغو الزامی است.")).toBeInTheDocument();
    expect(revokeMutate).not.toHaveBeenCalled();

    // 3. Revoke with explicit reason
    fireEvent.change(screen.getByLabelText(/دلیل لغو/i), {
      target: { value: "درخواست داور" },
    });
    fireEvent.click(screen.getByRole("button", { name: /تأیید و لغو اعتبارنامه/i }));

    await waitFor(() => {
      expect(revokeMutate).toHaveBeenCalledWith({
        id: "cred-1",
        body: { reason: "درخواست داور" },
      });
    });
  });

  it("validates GrantCredentialModal inputs, searches users, and submits valid credential", async () => {
    const grantMutate = vi.fn().mockResolvedValue({ id: "cred-new" });
    mockUseGrantReviewerCredential.mockReturnValue({
      mutateAsync: grantMutate,
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    });
    mockListUsers.mockResolvedValue({
      users: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          email: "dr.reza@example.com",
          name: "دکتر رضا",
          role: "teacher",
          emailVerified: true,
          phoneVerified: true,
          isVerified: true,
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      totalCount: 1,
    });

    renderWithProviders(<AdminPocketReviewersPage />);

    fireEvent.click(screen.getByRole("button", { name: /اعطای اعتبارنامه/i }));

    // Invalid UUID validation
    fireEvent.change(screen.getByLabelText(/شناسه کاربر/i), {
      target: { value: "invalid-uuid" },
    });
    fireEvent.change(screen.getByLabelText(/شماره نظام پزشکی/i), {
      target: { value: "IR-123" },
    });
    fireEvent.change(screen.getByLabelText(/تخصص بالینی/i), {
      target: { value: "قلب" },
    });
    fireEvent.change(screen.getByLabelText(/مرجع صادرکننده/i), {
      target: { value: "نظام پزشکی" },
    });
    const form = screen.getByLabelText(/شناسه کاربر/i).closest("form")!;
    fireEvent.submit(form);
    expect(await screen.findByText(/شناسه کاربر \(UUID\) معتبر الزامی است/i)).toBeInTheDocument();

    // User search & selection
    fireEvent.change(screen.getByPlaceholderText(/جستجوی نام یا ایمیل کاربر/i), {
      target: { value: "رضا" },
    });
    const userOption = await screen.findByText("دکتر رضا");
    fireEvent.click(userOption);
    expect(screen.getByLabelText(/شناسه کاربر/i)).toHaveValue(
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    );

    // Select future date via PersianDatePicker (navigate to next month and pick day 15)
    fireEvent.click(screen.getByText(/انتخاب تاریخ انقضا/i));
    fireEvent.click(screen.getByLabelText(/ماه بعد/i));
    const day15Buttons = screen.getAllByRole("button", { name: /^۱۵\s/ });
    fireEvent.click(day15Buttons[0]);

    fireEvent.submit(form);

    await waitFor(() => {
      expect(grantMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          medicalLicenseNumber: "IR-123",
          specialty: "قلب",
          licensingAuthority: "نظام پزشکی",
        }),
      );
    });
  });

  it("prevents double submit and accidental modal close while mutation is pending", () => {
    mockUseActivateSafetyOverride.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      isError: false,
      error: null,
      reset: vi.fn(),
    });

    renderWithProviders(<AdminPocketSafetyOverridesPage />, "/admin/pocket/safety-overrides");
    fireEvent.click(screen.getByRole("button", { name: /ایجاد Safety Override/i }));

    const submitBtn = screen.getByRole("button", { name: /تأیید و فعال‌سازی Override/i });
    const cancelBtn = screen.getByRole("button", { name: /انصراف/i });
    expect(submitBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();

    // Attempting to close via Escape or close button should not close while pending
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByText(/ایجاد و فعال‌سازی Safety Override/i)).toBeInTheDocument();
  });

  it("handles ClearSafetyOverrideModal validation and valid clear submission", async () => {
    const clearMutate = vi.fn().mockResolvedValue({});
    mockUseClearSafetyOverride.mockReturnValue({
      mutateAsync: clearMutate,
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    });
    mockUsePocketSafetyOverrides.mockReturnValue({
      data: [
        {
          id: "ovr-1",
          targetEntityType: "drug",
          targetEntityId: "33333333-3333-4333-8333-333333333333",
          actionState: "active",
          isActive: true,
          currentEventId: "ev-1",
          updatedAt: "2026-02-01T10:00:00.000Z",
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderWithProviders(<AdminPocketSafetyOverridesPage />, "/admin/pocket/safety-overrides");

    fireEvent.click(screen.getByRole("button", { name: /پاک‌سازی/i }));

    // Empty reason validation
    const form = screen.getByLabelText(/دلیل پاک‌سازی/i).closest("form")!;
    fireEvent.submit(form);
    expect(await screen.findByText(/ثبت دلیل لغو \(Clear\) Safety Override الزامی است/i)).toBeInTheDocument();

    // Valid clear submission
    fireEvent.change(screen.getByLabelText(/دلیل پاک‌سازی/i), {
      target: { value: "رفع هشدار بالینی پس از بازبینی" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(form);

    await waitFor(() => {
      expect(clearMutate).toHaveBeenCalledWith({
        id: "ovr-1",
        body: { reason: "رفع هشدار بالینی پس از بازبینی" },
      });
    });
  });

  it("renders SafetyOverrideDetailModal loading, error, and event history", () => {
    mockUsePocketSafetyOverrides.mockReturnValue({
      data: [
        {
          id: "ovr-1",
          targetEntityType: "assertion",
          targetEntityId: "33333333-3333-4333-8333-333333333333",
          actionState: "active",
          isActive: true,
          currentEventId: "ev-1",
          updatedAt: "2026-02-01T10:00:00.000Z",
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    // 1. Loading state
    mockUsePocketSafetyOverride.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
    });
    const { rerender } = renderWithProviders(
      <AdminPocketSafetyOverridesPage />,
      "/admin/pocket/safety-overrides",
    );
    fireEvent.click(screen.getByRole("button", { name: /جزئیات و تاریخچه/i }));
    expect(screen.getByText(/در حال بارگذاری جزئیات/i)).toBeInTheDocument();

    // 2. Error state
    mockUsePocketSafetyOverride.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("خطای شبکه"),
    });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/admin/pocket/safety-overrides"]}>
          <AdminPocketSafetyOverridesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText("خطای شبکه")).toBeInTheDocument();

    // 3. Event history state
    mockUsePocketSafetyOverride.mockReturnValue({
      data: {
        override: {
          id: "ovr-1",
          targetEntityType: "assertion",
          targetEntityId: "33333333-3333-4333-8333-333333333333",
          actionState: "active",
          isActive: true,
          currentEventId: "ev-1",
          updatedAt: "2026-02-01T10:00:00.000Z",
        },
        events: [
          {
            id: "ev-1",
            overrideId: "ovr-1",
            eventType: "activated",
            targetEntityType: "assertion",
            targetEntityId: "33333333-3333-4333-8333-333333333333",
            actorUserId: "admin-uuid-1",
            reason: "تداخل دارویی خطرناک",
            previousState: null,
            newState: "active",
            eventTimestamp: "2026-02-01T10:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/admin/pocket/safety-overrides"]}>
          <AdminPocketSafetyOverridesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText("تداخل دارویی خطرناک")).toBeInTheDocument();
    expect(screen.getByText(/Actor: admin-uuid-1/i)).toBeInTheDocument();
  });

  it("displays API error state and invokes refetch on retry", () => {
    const refetchMock = vi.fn();
    mockUsePocketReviewerCredentials.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
      error: new Error("خطا در ارتباط با سرور"),
      isFetching: false,
      refetch: refetchMock,
    });

    renderWithProviders(<AdminPocketReviewersPage />);
    expect(screen.getByText("خطا در ارتباط با سرور")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /به‌روزرسانی/i }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("handles Reactivate for suspended credential, surfaces 409 Conflict, hides mutation actions on revoked, and opens CredentialEventsModal", async () => {
    const reactivateMutate = vi
      .fn()
      .mockRejectedValueOnce(new Error("User already has an active clinical reviewer credential (409)"))
      .mockResolvedValueOnce({ id: "cred-susp", isActive: true, lifecycleStatus: "active" });

    mockUseReactivateReviewerCredential.mockReturnValue({
      mutateAsync: reactivateMutate,
      isPending: false,
      isError: true,
      error: new Error("User already has an active clinical reviewer credential (409)"),
      reset: vi.fn(),
    });

    mockUsePocketReviewerCredentialEvents.mockReturnValue({
      data: [
        {
          id: "evt-1",
          credentialId: "cred-rev",
          actorUserId: "admin-uuid-1",
          eventType: "granted",
          reason: "اعطای اولیه",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "evt-2",
          credentialId: "cred-rev",
          actorUserId: "admin-uuid-1",
          eventType: "revoked",
          reason: "لغو دائمی",
          createdAt: "2026-03-01T00:00:00.000Z",
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
    });

    mockUsePocketReviewerCredentials.mockReturnValue({
      data: [
        {
          id: "cred-susp",
          userId: "22222222-2222-4222-8222-222222222222",
          medicalLicenseNumber: "IR-MC-SUSP",
          specialty: "طب اورژانس",
          licensingAuthority: "نظام پزشکی",
          isActive: false,
          suspendedAt: "2026-02-01T00:00:00.000Z",
          suspensionReason: "مرخصی",
          revokedAt: null,
          lifecycleStatus: "suspended",
          validityStatus: "valid",
          grantedBy: "admin-1",
          grantedAt: "2026-01-01T00:00:00.000Z",
          licenseExpiresAt: "2030-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-02-01T00:00:00.000Z",
        },
        {
          id: "cred-rev",
          userId: "33333333-3333-4333-8333-333333333333",
          medicalLicenseNumber: "IR-MC-REV",
          specialty: "قلب",
          licensingAuthority: "نظام پزشکی",
          isActive: false,
          suspendedAt: null,
          suspensionReason: null,
          revokedAt: "2026-03-01T00:00:00.000Z",
          revocationReason: "لغو دائمی",
          lifecycleStatus: "revoked",
          validityStatus: "valid",
          grantedBy: "admin-1",
          grantedAt: "2026-01-01T00:00:00.000Z",
          licenseExpiresAt: "2030-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-03-01T00:00:00.000Z",
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderWithProviders(<AdminPocketReviewersPage />);

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    const suspRow = rows.find((r) => r.textContent?.includes("IR-MC-SUSP"))!;
    const revRow = rows.find((r) => r.textContent?.includes("IR-MC-REV"))!;

    // Revoked row shows لغوشده and NO فعال‌سازی مجدد / تعلیق / لغو buttons
    expect(within(revRow).getByText("لغوشده")).toBeInTheDocument();
    expect(within(revRow).queryByRole("button", { name: /فعال‌سازی مجدد/i })).toBeNull();
    expect(within(revRow).queryByRole("button", { name: /تعلیق/i })).toBeNull();
    expect(within(revRow).queryByRole("button", { name: /^لغو$/i })).toBeNull();

    // Open history modal on revoked row
    fireEvent.click(within(revRow).getByRole("button", { name: /تاریخچه/i }));
    const historyDialog = await screen.findByRole("dialog");
    expect(within(historyDialog).getByText("تاریخچه رویدادهای اعتبارنامه")).toBeInTheDocument();
    expect(within(historyDialog).getByText("اعطای اعتبارنامه")).toBeInTheDocument();
    expect(within(historyDialog).getByText("لغو دائم")).toBeInTheDocument();
    fireEvent.click(within(historyDialog).getByRole("button", { name: /^بستن$/i }));

    // Trigger Reactivate on suspended row -> surfaces 409 conflict error
    fireEvent.click(within(suspRow).getByRole("button", { name: /فعال‌سازی مجدد/i }));
    expect(
      screen.getByText("User already has an active clinical reviewer credential (409)"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /تأیید و فعال‌سازی مجدد/i }));

    await waitFor(() => {
      expect(reactivateMutate).toHaveBeenCalledWith({
        id: "cred-susp",
        body: undefined,
      });
    });
  });
});
