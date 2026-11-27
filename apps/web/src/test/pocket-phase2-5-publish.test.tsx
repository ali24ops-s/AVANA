import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminPocketAssertionDetailPage } from "../pages/admin/pocket/AdminPocketAssertionDetailPage.js";

const mockUsePocketPermissions = vi.fn();
const mockUsePocketAdminAssertionDetail = vi.fn();
const mockUsePublishAssertion = vi.fn();

vi.mock("../hooks/usePocketPermissions.js", () => ({
  usePocketPermissions: () => mockUsePocketPermissions(),
}));

vi.mock("../hooks/usePocketAssertions.js", () => ({
  usePocketAdminAssertionDetail: (...args: unknown[]) =>
    mockUsePocketAdminAssertionDetail(...args),
  useSubmitAssertionReview: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
  useRecordReviewDecision: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
  useWithdrawAssertionReview: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    error: null,
    reset: vi.fn(),
  }),
  usePublishAssertion: () => mockUsePublishAssertion(),
}));

function makeVerifiedDetail(overrides?: {
  status?: string;
  isClinicallyVerified?: boolean;
  quorumSatisfied?: boolean;
  hasActiveConflict?: boolean;
  hasActiveSafetyOverride?: boolean;
}) {
  return {
    assertion: {
      id: "11111111-1111-4111-8111-111111111111",
      assertionRootId: "root-1",
      versionNumber: 2,
      previousVersionId: "00000000-0000-4000-8000-000000000001",
      assertionKey: "amoxicillin-dosing-v2",
      statementText: "دوز استاندارد آموکسی‌سیلین ۵۰۰ میلی‌گرم هر ۸ ساعت است.",
      assertionType: "dosing",
      aggregateType: "drug",
      aggregateId: "drug-1",
      aggregateTitleFa: "آموکسی‌سیلین",
      aggregateTitleEn: "Amoxicillin",
      aggregateSlug: "amoxicillin",
      jurisdiction: "IR",
      targetPopulation: "adults",
      clinicalSetting: "outpatient",
      status: overrides?.status ?? "verified",
      releaseId: null,
      validUntilDate: null,
      supersededAt: null,
      createdAt: "2026-11-26T10:00:00.000Z",
      updatedAt: "2026-11-26T10:00:00.000Z",
    },
    clinicalSummary: {
      isClinicallyVerified: overrides?.isClinicallyVerified ?? true,
      quorumSatisfied: overrides?.quorumSatisfied ?? true,
      requiredApprovals: 2,
      validApprovalCount: 2,
      validRejectionCount: 0,
      activeDisagreement: false,
      hasActiveConflict: overrides?.hasActiveConflict ?? false,
      hasActiveSafetyOverride: overrides?.hasActiveSafetyOverride ?? false,
      verificationBlockReasons: [],
    },
    citations: [],
    versions: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        versionNumber: 2,
        previousVersionId: "00000000-0000-4000-8000-000000000001",
        status: overrides?.status ?? "verified",
        isActivePublished: overrides?.status === "published",
        supersededAt: null,
        createdAt: "2026-11-26T10:00:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000001",
        versionNumber: 1,
        previousVersionId: null,
        status: "published",
        isActivePublished: true,
        supersededAt: null,
        createdAt: "2026-11-01T10:00:00.000Z",
      },
    ],
    conflicts: [],
    history: [],
  };
}

function renderAdminDetail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/pocket/assertions/11111111-1111-4111-8111-111111111111"]}>
        <Routes>
          <Route path="/admin/pocket/assertions/:id" element={<AdminPocketAssertionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AVANA Pocket Phase 2.5 Official Publishing UI", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUsePocketPermissions.mockReturnValue({
      canManageReviewers: true,
      canReview: true,
      canPublish: true,
      isLoading: false,
    });

    mockUsePublishAssertion.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    });
  });

  it("hides Publish section when user lacks canPublish permission", () => {
    mockUsePocketPermissions.mockReturnValue({
      canManageReviewers: true,
      canReview: true,
      canPublish: false,
      isLoading: false,
    });
    mockUsePocketAdminAssertionDetail.mockReturnValue({
      data: makeVerifiedDetail(),
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderAdminDetail();
    expect(screen.queryByRole("heading", { name: "انتشار رسمی" })).not.toBeInTheDocument();
  });

  it("disables publish button when Resolver reports not clinically verified", () => {
    mockUsePocketAdminAssertionDetail.mockReturnValue({
      data: makeVerifiedDetail({ isClinicallyVerified: false, quorumSatisfied: false }),
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderAdminDetail();
    const publishBtn = screen.getByRole("button", { name: /انتشار رسمی نسخه/i });
    expect(publishBtn).toBeDisabled();
  });

  it("requires explicit confirmation in PublishAssertionModal and calls official publish mutation", async () => {
    const publishMutate = vi.fn().mockResolvedValue({});
    const refetchMock = vi.fn();
    mockUsePublishAssertion.mockReturnValue({
      mutateAsync: publishMutate,
      isPending: false,
      isError: false,
      error: null,
      reset: vi.fn(),
    });
    mockUsePocketAdminAssertionDetail.mockReturnValue({
      data: makeVerifiedDetail(),
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: refetchMock,
    });

    renderAdminDetail();

    fireEvent.click(screen.getByRole("button", { name: /انتشار رسمی نسخه/i }));
    expect(screen.getByText(/تأیید انتشار رسمی Assertion/i)).toBeInTheDocument();
    expect(screen.getByText(/نسخه فعال فعلی \(نسخه ۱\) پس از انتشار منسوخ/i)).toBeInTheDocument();

    const confirmSubmitBtn = screen.getByRole("button", { name: /تأیید و انتشار رسمی/i });
    expect(confirmSubmitBtn).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/یادداشت انتشار/i), {
      target: { value: "انتشار نهایی نسخه ۲" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(confirmSubmitBtn).not.toBeDisabled();

    fireEvent.click(confirmSubmitBtn);

    await waitFor(() => {
      expect(publishMutate).toHaveBeenCalledWith({
        id: "11111111-1111-4111-8111-111111111111",
        body: { notes: "انتشار نهایی نسخه ۲" },
      });
    });
    expect(refetchMock).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/با موفقیت منتشر رسمی شد/i)).toBeInTheDocument();
  });

  it("maps Backend publishing gate errors (quorum_not_met, safety override) to clear Persian messages", () => {
    mockUsePublishAssertion.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
      isError: true,
      error: Object.assign(new Error("Publishing gate failed"), {
        status: 409,
        details: { primaryBlockReason: "active_safety_override" },
      }),
      reset: vi.fn(),
    });
    mockUsePocketAdminAssertionDetail.mockReturnValue({
      data: makeVerifiedDetail(),
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderAdminDetail();
    fireEvent.click(screen.getByRole("button", { name: /انتشار رسمی نسخه/i }));

    expect(
      screen.getByText(/به‌دلیل فعال بودن Safety Override، انتشار این گزاره مسدود است/i),
    ).toBeInTheDocument();
  });

  it("prevents re-publishing an already published assertion", () => {
    mockUsePocketAdminAssertionDetail.mockReturnValue({
      data: makeVerifiedDetail({ status: "published" }),
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderAdminDetail();
    expect(screen.getByText(/این نسخه هم‌اکنون منتشر شده است/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /انتشار رسمی نسخه/i })).not.toBeInTheDocument();
  });

  it("prevents double submit when publish mutation is pending", () => {
    mockUsePublishAssertion.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      isError: false,
      error: null,
      reset: vi.fn(),
    });
    mockUsePocketAdminAssertionDetail.mockReturnValue({
      data: makeVerifiedDetail(),
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderAdminDetail();
    fireEvent.click(screen.getByRole("button", { name: /انتشار رسمی نسخه/i }));

    expect(screen.getByRole("button", { name: /تأیید و انتشار رسمی/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /انصراف/i })).toBeDisabled();
  });
});
