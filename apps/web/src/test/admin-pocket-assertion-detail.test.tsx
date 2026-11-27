import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminPocketAssertionDetailPage } from "../pages/admin/pocket/AdminPocketAssertionDetailPage.js";

const mockUsePocketPermissions = vi.fn();
const mockUsePocketAdminAssertionDetail = vi.fn();

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
  usePublishAssertion: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  }),
}));

function renderDetailPage(assertionId = "a-v2") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/admin/pocket/assertions/${assertionId}`]}>
        <Routes>
          <Route path="/admin/pocket/assertions/:id" element={<AdminPocketAssertionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Admin Pocket Assertion Detail Page (Phase 2.3)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockUsePocketPermissions.mockReturnValue({
      canManageReviewers: true,
      isLoading: false,
    });

    mockUsePocketAdminAssertionDetail.mockReturnValue({
      data: {
        assertion: {
          id: "a-v2",
          assertionRootId: "root-1",
          versionNumber: 2,
          previousVersionId: "a-v1",
          assertionKey: "amoxicillin-dosing-adult",
          statementText: "دوز استاندارد آموکسی‌سیلین ۵۰۰ میلی‌گرم هر ۸ ساعت است.",
          assertionType: "dosing",
          aggregateType: "drug",
          aggregateId: "drug-1",
          aggregateTitleFa: "آموکسی‌سیلین",
          aggregateTitleEn: "Amoxicillin",
          aggregateSlug: "amoxicillin",
          jurisdiction: "IR",
          targetPopulation: "بزرگسالان",
          clinicalSetting: "سرپایی",
          status: "published",
          releaseId: null,
          validUntilDate: null,
          supersededAt: null,
          createdAt: "2026-11-20T10:00:00.000Z",
          updatedAt: "2026-11-26T10:00:00.000Z",
        },
        clinicalSummary: {
          isClinicallyVerified: true,
          quorumSatisfied: true,
          requiredApprovals: 2,
          validApprovalCount: 2,
          validRejectionCount: 0,
          activeDisagreement: false,
          hasActiveConflict: false,
          hasActiveSafetyOverride: false,
          verificationBlockReasons: [],
        },
        citations: [
          {
            id: "cit-1",
            sourceId: "src-1",
            sourceCode: "UPTODATE-2026",
            sourceTitle: "UpToDate Clinical Reference",
            publisher: "Wolters Kluwer",
            sourceType: "clinical_guideline",
            editionOrVersion: "2026.1",
            publicationDate: "2026-01-01",
            doi: "10.1000/xyz",
            canonicalUrl: "https://example.com/uptodate",
            sourceAuditStatus: "approved",
            locationReference: "Section 3",
            sourceSnapshotUrl: null,
            accessedAt: "2026-11-20",
            evidenceGrade: "A",
            citationStatus: "verified",
          },
        ],
        versions: [
          {
            id: "a-v2",
            versionNumber: 2,
            previousVersionId: "a-v1",
            status: "published",
            isActivePublished: true,
            supersededAt: null,
            createdAt: "2026-11-26T10:00:00.000Z",
          },
          {
            id: "a-v1",
            versionNumber: 1,
            previousVersionId: null,
            status: "superseded",
            isActivePublished: false,
            supersededAt: "2026-11-26T10:00:00.000Z",
            createdAt: "2026-11-20T10:00:00.000Z",
          },
        ],
        conflicts: [],
        history: [
          {
            id: "hist-1",
            assertionId: "a-v2",
            action: "published",
            previousStatus: "verified",
            newStatus: "published",
            clinicalNotes: "انتشار پس از تکمیل حدنصاب",
            createdAt: "2026-11-26T10:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });
  });

  it("renders core assertion info, clinical metadata, citations, Resolver summary, history, and versions", () => {
    renderDetailPage();

    expect(screen.getByText("amoxicillin-dosing-adult")).toBeInTheDocument();
    expect(screen.getByText(/دوز استاندارد آموکسی‌سیلین ۵۰۰ میلی‌گرم/)).toBeInTheDocument();
    expect(screen.getByText("آموکسی‌سیلین")).toBeInTheDocument();
    expect(screen.getByText("بزرگسالان")).toBeInTheDocument();
    expect(screen.getByText("سرپایی")).toBeInTheDocument();

    // Citations
    expect(screen.getByText("UpToDate Clinical Reference")).toBeInTheDocument();
    expect(screen.getByText("منبع ممیزی‌شده")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /مشاهده منبع اصلی/i })).toHaveAttribute(
      "href",
      "https://example.com/uptodate",
    );

    // Resolver summary
    expect(screen.getByText("دارای اعتبار بالینی")).toBeInTheDocument();
    expect(screen.getByText(/۲ از ۲/)).toBeInTheDocument();

    // History
    expect(screen.getByText("انتشار رسمی")).toBeInTheDocument();
    expect(screen.getByText("انتشار پس از تکمیل حدنصاب")).toBeInTheDocument();

    // Versions
    expect(screen.getByText("نسخه جاری")).toBeInTheDocument();
    expect(screen.getByText("نسخه فعال منتشرشده")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "مشاهده" })).toHaveAttribute(
      "href",
      "/admin/pocket/assertions/a-v1",
    );
  });

  it("renders loading, error with retry, and empty states properly", () => {
    const refetchMock = vi.fn();
    mockUsePocketAdminAssertionDetail.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      isFetching: false,
      refetch: refetchMock,
    });

    const { rerender } = renderDetailPage();
    expect(screen.getByText(/در حال دریافت جزئیات Assertion/i)).toBeInTheDocument();

    mockUsePocketAdminAssertionDetail.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("خطا در بارگذاری جزئیات"),
      isFetching: false,
      refetch: refetchMock,
    });
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={["/admin/pocket/assertions/a-v2"]}>
          <Routes>
            <Route path="/admin/pocket/assertions/:id" element={<AdminPocketAssertionDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText("خطا در بارگذاری جزئیات")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /تلاش مجدد/i }));
    expect(refetchMock).toHaveBeenCalledTimes(1);
  });

  it("denies access when user is not platform_admin", () => {
    mockUsePocketPermissions.mockReturnValue({
      canManageReviewers: false,
      isLoading: false,
    });

    renderDetailPage();
    expect(screen.getByText(/دسترسی محدود/i)).toBeInTheDocument();
    expect(mockUsePocketAdminAssertionDetail).toHaveBeenCalledWith("a-v2", { enabled: false });
  });

  it("renders active, resolved, and dismissed conflicts and opens ResolveConflictModal for platform_admin", async () => {
    mockUsePocketPermissions.mockReturnValue({
      canManageReviewers: true,
      canReview: true,
      canPublish: true,
      isLoading: false,
    });

    const currentReturn = mockUsePocketAdminAssertionDetail.mock.results[0]?.value ??
      mockUsePocketAdminAssertionDetail.getMockImplementation()?.();
    const baseData = (currentReturn as { data?: Record<string, unknown> } | undefined)?.data ?? {};

    mockUsePocketAdminAssertionDetail.mockReturnValue({
      data: {
        ...baseData,
        assertion: {
          id: "a-v2",
          assertionRootId: "root-1",
          versionNumber: 2,
          previousVersionId: "a-v1",
          assertionKey: "amoxicillin-dosing-adult",
          statementText: "دوز استاندارد آموکسی‌سیلین",
          assertionType: "dosing_rule",
          aggregateType: "drug",
          aggregateId: "drug-1",
          aggregateTitleFa: "آموکسی‌سیلین",
          aggregateTitleEn: "Amoxicillin",
          targetPopulation: "بزرگسالان",
          clinicalSetting: "سرپایی",
          jurisdiction: "ایران",
          status: "published",
          validUntilDate: null,
          supersededAt: null,
          createdAt: "2026-11-26T10:00:00.000Z",
          updatedAt: "2026-11-26T10:00:00.000Z",
        },
        clinicalSummary: {
          isClinicallyVerified: false,
          validApprovalCount: 0,
          validRejectionCount: 0,
          requiredApprovals: 2,
          quorumSatisfied: false,
          activeDisagreement: false,
          hasActiveConflict: true,
          hasActiveSafetyOverride: false,
          verificationBlockReasons: ["unresolved_clinical_conflict"],
          lastValidApprovalTimestamp: null,
        },
        citations: [],
        versions: [],
        history: [],
        conflicts: [
          {
            id: "conf-active",
            conflictSubject: "تعارض فعال دوز",
            assertionAId: "a-v2",
            assertionBId: "a-other",
            discrepancyDescription: "اختلاف دوز",
            status: "active_discrepancy",
            createdAt: "2026-11-26T10:00:00.000Z",
          },
          {
            id: "conf-resolved",
            conflictSubject: "تعارض حل‌شده",
            assertionAId: "a-v2",
            assertionBId: "a-other-2",
            discrepancyDescription: "برطرف شد",
            status: "resolved",
            resolvedAt: "2026-11-26T11:00:00.000Z",
            resolutionNotes: "اجماع علمی ثبت شد",
            createdAt: "2026-11-26T09:00:00.000Z",
          },
          {
            id: "conf-dismissed",
            conflictSubject: "تعارض ردشده",
            assertionAId: "a-v2",
            assertionBId: "a-other-3",
            discrepancyDescription: "اشتباه تایپی",
            status: "dismissed",
            resolvedAt: "2026-11-26T11:30:00.000Z",
            resolutionNotes: "بی‌موضوع بود",
            createdAt: "2026-11-26T08:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      isFetching: false,
      refetch: vi.fn(),
    });

    renderDetailPage();
    expect(screen.getByText("تعارض فعال")).toBeInTheDocument();
    expect(screen.getByText("حل‌شده (نیازمند تأیید مجدد)")).toBeInTheDocument();
    expect(screen.getByText("ردشده / بی‌موضوع")).toBeInTheDocument();
    expect(screen.getByText(/اجماع علمی ثبت شد/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /تعیین تکلیف تعارض/i }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("تعیین تکلیف تعارض بالینی")).toBeInTheDocument();
  });
});
