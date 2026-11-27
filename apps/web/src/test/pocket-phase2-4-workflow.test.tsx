import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminPocketAssertionDetailPage } from "../pages/admin/pocket/AdminPocketAssertionDetailPage.js";
import { PocketReviewerWorkbenchPage } from "../pages/pocket/PocketReviewerWorkbenchPage.js";
import { PocketReviewerAssertionDetailPage } from "../pages/pocket/PocketReviewerAssertionDetailPage.js";

const mockUsePocketPermissions = vi.fn();
const mockUsePocketAdminAssertionDetail = vi.fn();
const mockUsePocketReviewerAssertions = vi.fn();
const mockUsePocketReviewerAssertionDetail = vi.fn();
const mockUseSubmitAssertionReview = vi.fn();
const mockUseRecordReviewDecision = vi.fn();
const mockUseWithdrawAssertionReview = vi.fn();
const mockUseVerifyAssertion = vi.fn();
const mockUseRejectAssertionVerification = vi.fn();
const mockUseRecordClinicalConflict = vi.fn();

vi.mock("../hooks/usePocketPermissions.js", () => ({
  usePocketPermissions: () => mockUsePocketPermissions(),
}));

vi.mock("../hooks/usePocketAssertions.js", () => ({
  usePocketAdminAssertionDetail: (...args: unknown[]) =>
    mockUsePocketAdminAssertionDetail(...args),
  usePocketReviewerAssertions: (...args: unknown[]) =>
    mockUsePocketReviewerAssertions(...args),
  usePocketReviewerAssertionDetail: (...args: unknown[]) =>
    mockUsePocketReviewerAssertionDetail(...args),
  useSubmitAssertionReview: () => mockUseSubmitAssertionReview(),
  useRecordReviewDecision: () => mockUseRecordReviewDecision(),
  useWithdrawAssertionReview: () => mockUseWithdrawAssertionReview(),
  usePublishAssertion: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

vi.mock("../hooks/usePocketVerifications.js", () => ({
  useVerifyAssertion: () => mockUseVerifyAssertion(),
  useRejectAssertionVerification: () => mockUseRejectAssertionVerification(),
  useRecordClinicalConflict: () => mockUseRecordClinicalConflict(),
  useResolveClinicalConflict: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

function makeDetailFixture(status = "draft") {
  return {
    assertion: {
      id: "11111111-1111-4111-8111-111111111111",
      assertionRootId: "root-1",
      versionNumber: 1,
      previousVersionId: null,
      assertionKey: "amoxicillin-dosing",
      statementText: "متن بالینی تست",
      assertionType: "dosing",
      aggregateType: "drug",
      aggregateId: "drug-1",
      aggregateTitleFa: "آموکسی‌سیلین",
      aggregateTitleEn: "Amoxicillin",
      aggregateSlug: "amoxicillin",
      jurisdiction: "IR",
      targetPopulation: "adults",
      clinicalSetting: "outpatient",
      status,
      releaseId: null,
      validUntilDate: null,
      supersededAt: null,
      createdAt: "2026-11-20T10:00:00.000Z",
      updatedAt: "2026-11-26T10:00:00.000Z",
    },
    clinicalSummary: {
      isClinicallyVerified: false,
      quorumSatisfied: false,
      requiredApprovals: 2,
      validApprovalCount: 0,
      validRejectionCount: 0,
      activeDisagreement: false,
      hasActiveConflict: false,
      hasActiveSafetyOverride: false,
      verificationBlockReasons: ["no_verifications"],
    },
    citations: [],
    versions: [],
    conflicts: [],
    history: [],
    myLatestVote: null,
  };
}

function renderWithRoute(ui: React.ReactElement, path: string, initialEntry: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AVANA Pocket Phase 2.4 Review & Clinical Verification Workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUsePocketPermissions.mockReturnValue({
      canReview: true,
      canVerify: true,
      canManageReviewers: true,
      activeCredential: { specialty: "داروسازی بالینی" },
      isLoading: false,
    });

    mockUseSubmitAssertionReview.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
      error: null,
      reset: vi.fn(),
    });
    mockUseRecordReviewDecision.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
      error: null,
      reset: vi.fn(),
    });
    mockUseWithdrawAssertionReview.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
      error: null,
      reset: vi.fn(),
    });
    mockUseVerifyAssertion.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
      error: null,
      reset: vi.fn(),
    });
    mockUseRejectAssertionVerification.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
      error: null,
      reset: vi.fn(),
    });
    mockUseRecordClinicalConflict.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({}),
      isPending: false,
      error: null,
      reset: vi.fn(),
    });
  });

  it("allows Submit Review from draft on AdminPocketAssertionDetailPage", async () => {
    const submitMutate = vi.fn().mockResolvedValue({});
    mockUseSubmitAssertionReview.mockReturnValue({
      mutateAsync: submitMutate,
      isPending: false,
      error: null,
      reset: vi.fn(),
    });
    mockUsePocketAdminAssertionDetail.mockReturnValue({
      data: makeDetailFixture("draft"),
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderWithRoute(
      <AdminPocketAssertionDetailPage />,
      "/admin/pocket/assertions/:id",
      "/admin/pocket/assertions/11111111-1111-4111-8111-111111111111",
    );

    fireEvent.click(screen.getByRole("button", { name: /ارسال برای بازبینی/i }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /تأیید و ارسال برای بازبینی/i }));

    await waitFor(() => {
      expect(submitMutate).toHaveBeenCalledWith({
        id: "11111111-1111-4111-8111-111111111111",
        body: undefined,
      });
    });
  });

  it("requires notes on Request Changes in Review Decision and supports Withdraw Review", async () => {
    const decisionMutate = vi.fn().mockResolvedValue({});
    const withdrawMutate = vi.fn().mockResolvedValue({});
    mockUseRecordReviewDecision.mockReturnValue({
      mutateAsync: decisionMutate,
      isPending: false,
      error: null,
      reset: vi.fn(),
    });
    mockUseWithdrawAssertionReview.mockReturnValue({
      mutateAsync: withdrawMutate,
      isPending: false,
      error: null,
      reset: vi.fn(),
    });
    mockUsePocketAdminAssertionDetail.mockReturnValue({
      data: makeDetailFixture("in_review"),
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderWithRoute(
      <AdminPocketAssertionDetailPage />,
      "/admin/pocket/assertions/:id",
      "/admin/pocket/assertions/11111111-1111-4111-8111-111111111111",
    );

    // Request Changes without notes should show validation error
    fireEvent.click(screen.getByRole("button", { name: /درخواست اصلاح/i }));
    const form = screen.getByLabelText(/توضیح اصلاحات موردنیاز/i).closest("form")!;
    fireEvent.submit(form);
    expect(await screen.findByText(/ثبت توضیح یا دلیل برای این عملیات الزامی است/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/توضیح اصلاحات موردنیاز/i), {
      target: { value: "نیاز به اصلاح دوز کلیوی" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.submit(form);

    await waitFor(() => {
      expect(decisionMutate).toHaveBeenCalledWith({
        id: "11111111-1111-4111-8111-111111111111",
        body: { decision: "request_changes", notes: "نیاز به اصلاح دوز کلیوی" },
      });
    });

    // Withdraw review
    fireEvent.click(screen.getByRole("button", { name: /انصراف از بازبینی/i }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /تأیید انصراف از بازبینی/i }));

    await waitFor(() => {
      expect(withdrawMutate).toHaveBeenCalledWith({
        id: "11111111-1111-4111-8111-111111111111",
        body: undefined,
      });
    });
  });

  it("blocks Reviewer Workbench access when user lacks active Clinical Reviewer Credential", () => {
    mockUsePocketPermissions.mockReturnValue({
      canReview: true,
      canVerify: false,
      canManageReviewers: true,
      activeCredential: null,
      isLoading: false,
    });
    mockUsePocketReviewerAssertions.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderWithRoute(
      <PocketReviewerWorkbenchPage />,
      "/pocket/reviewer-workbench",
      "/pocket/reviewer-workbench",
    );

    expect(screen.getByText(/عدم دسترسی به میز کار داوری بالینی/i)).toBeInTheDocument();
    expect(mockUsePocketReviewerAssertions).toHaveBeenCalledWith(
      expect.any(Object),
      { enabled: false },
    );
  });

  it("allows Clinical Verification, Clinical Rejection, and Conflict Recording in Reviewer Detail Page", async () => {
    const verifyMutate = vi.fn().mockResolvedValue({});
    const rejectMutate = vi.fn().mockResolvedValue({});
    const conflictMutate = vi.fn().mockResolvedValue({});

    mockUseVerifyAssertion.mockReturnValue({
      mutateAsync: verifyMutate,
      isPending: false,
      error: null,
      reset: vi.fn(),
    });
    mockUseRejectAssertionVerification.mockReturnValue({
      mutateAsync: rejectMutate,
      isPending: false,
      error: null,
      reset: vi.fn(),
    });
    mockUseRecordClinicalConflict.mockReturnValue({
      mutateAsync: conflictMutate,
      isPending: false,
      error: null,
      reset: vi.fn(),
    });
    mockUsePocketReviewerAssertionDetail.mockReturnValue({
      data: makeDetailFixture("reviewed"),
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderWithRoute(
      <PocketReviewerAssertionDetailPage />,
      "/pocket/reviewer-workbench/:id",
      "/pocket/reviewer-workbench/11111111-1111-4111-8111-111111111111",
    );

    // 1. Clinical Verify
    fireEvent.click(screen.getByRole("button", { name: /ثبت تأیید بالینی/i }));
    fireEvent.change(screen.getByLabelText(/یادداشت ارزیابی شواهد بالینی/i), {
      target: { value: "مطابق با گایدلاین UpToDate تأیید شد" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getAllByRole("button", { name: /ثبت تأیید بالینی/i })[1]);

    await waitFor(() => {
      expect(verifyMutate).toHaveBeenCalledWith({
        id: "11111111-1111-4111-8111-111111111111",
        body: {
          clinicalReviewNotes: "مطابق با گایدلاین UpToDate تأیید شد",
          parentVerificationId: null,
        },
      });
    });

    // 2. Clinical Reject
    fireEvent.click(screen.getByRole("button", { name: /ثبت رد بالینی/i }));
    fireEvent.change(screen.getByLabelText(/نقد علمی و دلیل رد بالینی/i), {
      target: { value: "دوز پیشنهادی برای نارسایی کلیوی ایمن نیست" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getAllByRole("button", { name: /ثبت رد بالینی/i })[1]);

    await waitFor(() => {
      expect(rejectMutate).toHaveBeenCalledWith({
        id: "11111111-1111-4111-8111-111111111111",
        body: {
          clinicalReviewNotes: "دوز پیشنهادی برای نارسایی کلیوی ایمن نیست",
          parentVerificationId: null,
        },
      });
    });

    // 3. Record Conflict
    fireEvent.click(screen.getByRole("button", { name: /ثبت Conflict/i }));
    fireEvent.change(screen.getByLabelText(/شناسه Assertion متعارض/i), {
      target: { value: "22222222-2222-4222-8222-222222222222" },
    });
    fireEvent.change(screen.getByLabelText(/موضوع تعارض/i), {
      target: { value: "تضاد دوز" },
    });
    fireEvent.change(screen.getByLabelText(/شرح دقیق اختلاف بالینی/i), {
      target: { value: "دو منبع مقادیر متفاوت ذکر کرده‌اند" },
    });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /ثبت تعارض بالینی/i }));

    await waitFor(() => {
      expect(conflictMutate).toHaveBeenCalledWith({
        assertionAId: "11111111-1111-4111-8111-111111111111",
        assertionBId: "22222222-2222-4222-8222-222222222222",
        conflictSubject: "تضاد دوز",
        discrepancyDescription: "دو منبع مقادیر متفاوت ذکر کرده‌اند",
      });
    });
  });

  it("prevents double submit when clinical verification mutation is pending", () => {
    mockUseVerifyAssertion.mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: true,
      error: null,
      reset: vi.fn(),
    });
    mockUsePocketReviewerAssertionDetail.mockReturnValue({
      data: makeDetailFixture("reviewed"),
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderWithRoute(
      <PocketReviewerAssertionDetailPage />,
      "/pocket/reviewer-workbench/:id",
      "/pocket/reviewer-workbench/11111111-1111-4111-8111-111111111111",
    );

    fireEvent.click(screen.getByRole("button", { name: /ثبت تأیید بالینی/i }));
    const submitBtn = screen.getAllByRole("button", { name: /ثبت تأیید بالینی/i })[1];
    expect(submitBtn).toBeDisabled();
    expect(screen.getByRole("button", { name: /انصراف/i })).toBeDisabled();
  });
});
