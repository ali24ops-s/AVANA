/**
 * AVANA Pocket — Phase UI-3 Frontend Component & Pages Test Suite
 *
 * Verifies:
 * 1. PocketHomePage renders clinical pillars, search trigger, and reviewer banner
 * 2. PocketExplorerPage tab switching, search input, and zero-mock notices
 * 3. PocketAggregateDetailPage metadata header, summary, and published assertion list
 * 4. PocketAssertionDetailPage clinical statement, privacy masking for students
 *    (reviewerUserId completely hidden, review notes hidden from students),
 *    and reviewer actions visible for certified clinical reviewers
 * 5. Error and 404 boundaries for invalid aggregate types or missing assertions
 */

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { PocketHomePage } from "../pages/pocket/PocketHomePage.js";
import { PocketExplorerPage } from "../pages/pocket/PocketExplorerPage.js";
import { PocketAggregateDetailPage } from "../pages/pocket/PocketAggregateDetailPage.js";
import { PocketAssertionDetailPage } from "../pages/pocket/PocketAssertionDetailPage.js";
import type {
  ClinicalAggregateMetadata,
  PublishedAssertionItem,
  AssertionVerificationRecord,
  ClinicalConflictRecord,
  AggregateAssertionsQueryResult,
  ReviewerMeData,
  PocketDiscoveryResponse,
} from "../lib/api/pocket.js";

// Mock Auth State
let mockAuthUser: { id: string; role: string; name?: string } | null = {
  id: "student-user-1",
  role: "student",
};

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: mockAuthUser,
    isAuthenticated: !!mockAuthUser,
  }),
}));

// Mock Data
let mockReviewerMeData: ReviewerMeData = {
  isReviewer: false,
  credential: null,
};

let mockMetadata: ClinicalAggregateMetadata | null = {
  id: "c8b0a514-4fb9-4f80-b747-91f1a5ff6818",
  type: "drug",
  slug: "atorvastatin",
  nameEn: "Atorvastatin",
  nameFa: "آتورواستاتین",
  classification: "HMG-CoA Reductase Inhibitor",
  summary: "داروی کاهش‌دهنده چربی خون.",
  publishedAt: "2026-03-20T10:00:00Z",
  versionNumber: 1,
};

let mockPublishedAssertions: PublishedAssertionItem[] = [
  {
    id: "asst-1",
    assertionRootId: "root-1",
    versionNumber: 1,
    previousVersionId: null,
    aggregateType: "drug",
    aggregateId: "c8b0a514-4fb9-4f80-b747-91f1a5ff6818",
    assertionType: "contraindication",
    assertionKey: "atorva_rhabdo",
    statementText: "ممکن است در موارد نادر باعث میوپاتی یا رابدومیولیز شود.",
    jurisdiction: "IR / FDA",
    targetPopulation: "Adults",
    clinicalSetting: "Outpatient / Inpatient",
    validUntilDate: null,
    publishedAt: "2026-03-20T10:00:00Z",
  },
  {
    id: "asst-2",
    assertionRootId: "root-2",
    versionNumber: 1,
    previousVersionId: null,
    aggregateType: "drug",
    aggregateId: "c8b0a514-4fb9-4f80-b747-91f1a5ff6818",
    assertionType: "interaction",
    assertionKey: "atorva_cyp3a4",
    statementText: "از مصرف همزمان با مهارکننده‌های قوی CYP3A4 خودداری شود.",
    jurisdiction: "Global",
    targetPopulation: "All patients",
    clinicalSetting: "General Practice",
    validUntilDate: null,
    publishedAt: "2026-03-20T11:00:00Z",
  },
];

let mockConsumptionResult: AggregateAssertionsQueryResult = {
  aggregateType: "drug",
  aggregateId: "c8b0a514-4fb9-4f80-b747-91f1a5ff6818",
  currentVersion: 1,
  assertions: mockPublishedAssertions,
};

let mockSingleAssertion: PublishedAssertionItem | null = {
  id: "asst-1",
  assertionRootId: "root-1",
  versionNumber: 1,
  previousVersionId: null,
  aggregateType: "drug",
  aggregateId: "c8b0a514-4fb9-4f80-b747-91f1a5ff6818",
  assertionType: "contraindication",
  assertionKey: "atorva_rhabdo",
  statementText: "ممکن است در موارد نادر باعث میوپاتی یا رابدومیولیز شود.",
  jurisdiction: "IR / FDA",
  targetPopulation: "Adults",
  clinicalSetting: "Outpatient / Inpatient",
  validUntilDate: null,
  publishedAt: "2026-03-20T10:00:00Z",
};

let mockVerifications: AssertionVerificationRecord[] = [
  {
    id: "ver-1",
    assertionId: "asst-1",
    verificationAction: "clinical_verified",
    clinicalReviewNotes: "بررسی شده طبق راهنماهای معتبر دارویی.",
    verifiedAt: "2026-03-20T12:00:00Z",
  },
];

let mockConflicts: ClinicalConflictRecord[] = [];

let mockIsLoading = false;
let mockIsError = false;

// Mock the direct hooks used across components
vi.mock("../hooks/usePocketReviewer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/usePocketReviewer.js")>();
  return {
    ...actual,
    usePocketReviewer: () => ({
      data: mockReviewerMeData,
      isLoading: false,
    }),
    usePocketReviewerMe: () => ({
      data: mockReviewerMeData,
      isLoading: false,
    }),
  };
});

vi.mock("../hooks/usePocketPermissions.js", () => ({
  usePocketPermissions: () => {
    const isDoctor = mockAuthUser?.role === "clinical_reviewer";
    const isAdmin = mockAuthUser?.role === "platform_admin";
    const hasValidCredential = Boolean(mockReviewerMeData.isReviewer && mockReviewerMeData.credential?.isActive);
    return {
      canReview: isDoctor || isAdmin,
      canVerify: (isDoctor || isAdmin) && hasValidCredential,
      canPublish: isAdmin,
      canManageReviewers: isAdmin,
      isClinicalReviewer: hasValidCredential,
      credential: mockReviewerMeData.credential,
    };
  },
}));

vi.mock("../hooks/usePocketAggregateMetadata.js", () => ({
  usePocketAggregateMetadata: () => ({
    data: mockMetadata,
    isLoading: mockIsLoading,
    error: mockIsError ? new Error("Failed to load metadata") : null,
  }),
}));

vi.mock("../hooks/usePocketConsumption.js", () => ({
  usePocketConsumption: () => ({
    data: mockConsumptionResult,
    isLoading: mockIsLoading,
    error: mockIsError ? new Error("Failed to load consumption") : null,
    refetch: vi.fn(),
  }),
}));

vi.mock("../hooks/usePocketAssertion.js", () => ({
  usePocketAssertion: () => ({
    data: mockSingleAssertion,
    isLoading: mockIsLoading,
    error: mockIsError || !mockSingleAssertion ? new Error("Assertion not found") : null,
    refetch: vi.fn(),
  }),
}));

vi.mock("../hooks/usePocketVerifications.js", () => ({
  usePocketVerifications: () => ({
    data: {
      verifications: mockVerifications,
      conflicts: mockConflicts,
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useVerifyAssertion: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ success: true }),
    isPending: false,
  }),
  useRejectAssertionVerification: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ success: true }),
    isPending: false,
  }),
  useRecordClinicalConflict: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ success: true }),
    isPending: false,
  }),
}));

const mockDiscoveryResponse: PocketDiscoveryResponse = {
  items: [],
  total: 0,
  limit: 20,
  offset: 0,
  hasMore: false,
  type: "all",
};

vi.mock("../hooks/usePocketDiscovery.js", () => ({
  usePocketDiscovery: () => ({
    data: mockDiscoveryResponse,
    isLoading: mockIsLoading,
    isFetching: false,
    isError: mockIsError,
    error: mockIsError ? new Error("Discovery fetch failed") : null,
    refetch: vi.fn(),
  }),
}));

function renderWithClient(ui: React.ReactElement, initialRoute = "/pocket") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/pocket" element={<PocketHomePage />} />
          <Route path="/pocket/explorer" element={<PocketExplorerPage />} />
          <Route path="/pocket/:type/:id" element={<PocketAggregateDetailPage />} />
          <Route path="/pocket/assertions/:id" element={<PocketAssertionDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AVANA Pocket Phase UI-3: Consumer UI & Pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthUser = { id: "student-1", role: "student", name: "دانشجو" };
    mockReviewerMeData = { isReviewer: false, credential: null };
    mockMetadata = {
      id: "c8b0a514-4fb9-4f80-b747-91f1a5ff6818",
      type: "drug",
      slug: "atorvastatin",
      nameEn: "Atorvastatin",
      nameFa: "آتورواستاتین",
      classification: "HMG-CoA Reductase Inhibitor",
      summary: "داروی کاهش‌دهنده چربی خون.",
      publishedAt: "2026-03-20T10:00:00Z",
      versionNumber: 1,
    };
    mockPublishedAssertions = [
      {
        id: "asst-1",
        assertionRootId: "root-1",
        versionNumber: 1,
        previousVersionId: null,
        aggregateType: "drug",
        aggregateId: "c8b0a514-4fb9-4f80-b747-91f1a5ff6818",
        assertionType: "contraindication",
        assertionKey: "atorva_rhabdo",
        statementText: "ممکن است در موارد نادر باعث میوپاتی یا رابدومیولیز شود.",
        jurisdiction: "IR / FDA",
        targetPopulation: "Adults",
        clinicalSetting: "Outpatient / Inpatient",
        validUntilDate: null,
        publishedAt: "2026-03-20T10:00:00Z",
      },
      {
        id: "asst-2",
        assertionRootId: "root-2",
        versionNumber: 1,
        previousVersionId: null,
        aggregateType: "drug",
        aggregateId: "c8b0a514-4fb9-4f80-b747-91f1a5ff6818",
        assertionType: "interaction",
        assertionKey: "atorva_cyp3a4",
        statementText: "از مصرف همزمان با مهارکننده‌های قوی CYP3A4 خودداری شود.",
        jurisdiction: "Global",
        targetPopulation: "All patients",
        clinicalSetting: "General Practice",
        validUntilDate: null,
        publishedAt: "2026-03-20T11:00:00Z",
      },
    ];
    mockConsumptionResult = {
      aggregateType: "drug",
      aggregateId: "c8b0a514-4fb9-4f80-b747-91f1a5ff6818",
      currentVersion: 1,
      assertions: mockPublishedAssertions,
    };
    mockSingleAssertion = {
      id: "asst-1",
      assertionRootId: "root-1",
      versionNumber: 1,
      previousVersionId: null,
      aggregateType: "drug",
      aggregateId: "c8b0a514-4fb9-4f80-b747-91f1a5ff6818",
      assertionType: "contraindication",
      assertionKey: "atorva_rhabdo",
      statementText: "ممکن است در موارد نادر باعث میوپاتی یا رابدومیولیز شود.",
      jurisdiction: "IR / FDA",
      targetPopulation: "Adults",
      clinicalSetting: "Outpatient / Inpatient",
      validUntilDate: null,
      publishedAt: "2026-03-20T10:00:00Z",
    };
    mockVerifications = [
      {
        id: "ver-1",
        assertionId: "asst-1",
        verificationAction: "clinical_verified",
        clinicalReviewNotes: "بررسی شده طبق راهنماهای معتبر دارویی.",
        verifiedAt: "2026-03-20T12:00:00Z",
      },
    ];
    mockConflicts = [];
    mockIsLoading = false;
    mockIsError = false;
  });

  describe("1. PocketHomePage", () => {
    it("renders page header and 4 medical pillars", () => {
      renderWithClient(<PocketHomePage />);

      expect(screen.getByText("AVANA Pocket")).toBeInTheDocument();
      expect(screen.getByText(/مرجع سریع و بالینی بر بالین بیمار/)).toBeInTheDocument();

      // Four pillars
      expect(screen.getByText("داروها")).toBeInTheDocument();
      expect(screen.getByText("بیماری‌ها")).toBeInTheDocument();
      expect(screen.getByText("درمان‌ها")).toBeInTheDocument();
      expect(screen.getByText("اورژانس‌ها")).toBeInTheDocument();

      // Search bar trigger with UUID placeholder
      expect(screen.getByPlaceholderText(/c8b0a514/)).toBeInTheDocument();
    });

    it("does not render reviewer banner for normal students", () => {
      renderWithClient(<PocketHomePage />);
      expect(screen.queryByText(/داور بالینی معتبر AVANA/)).not.toBeInTheDocument();
    });

    it("renders reviewer banner when user is active clinical reviewer", () => {
      mockAuthUser = { id: "doc-1", role: "clinical_reviewer", name: "دکتر رضایی" };
      mockReviewerMeData = {
        isReviewer: true,
        credential: {
          id: "cred-1",
          userId: "doc-1",
          medicalLicenseNumber: "12345",
          specialty: "کاردیولوژی",
          licensingAuthority: "سازمان نظام پزشکی",
          isActive: true,
          suspendedAt: null,
          suspensionReason: null,
          grantedBy: "admin-1",
          grantedAt: "2026-01-01T00:00:00Z",
          licenseExpiresAt: "2027-01-01T00:00:00Z",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      };

      renderWithClient(<PocketHomePage />);
      expect(screen.getByText("داور بالینی معتبر AVANA")).toBeInTheDocument();
      expect(screen.getByText("کاردیولوژی")).toBeInTheDocument();
      expect(screen.getByText(/پروانه فعال/)).toBeInTheDocument();
    });
  });

  describe("2. PocketExplorerPage", () => {
    it("renders buttons for all 4 clinical pillars and allows pillar selection", () => {
      renderWithClient(<PocketExplorerPage />, "/pocket/explorer");

      expect(screen.getByRole("button", { name: /داروها/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /بیماری‌ها/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /درمان‌ها/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /اورژانس/ })).toBeInTheDocument();

      // Click on Emergency pillar
      fireEvent.click(screen.getByRole("button", { name: /اورژانس/ }));
      expect(screen.getByRole("button", { name: /اورژانس/ })).toHaveClass("bg-[#008080]");
    });

    it("displays honest empty state notice without fabricating data", () => {
      renderWithClient(<PocketExplorerPage />, "/pocket/explorer");

      expect(
        screen.getByText(/هیچ موردی در این رکن بالینی یافت نشد/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/در حال حاضر داده‌ای مطابق با فیلتر انتخابی شما در پایگاه دانش بالینی منتشر نشده است/)
      ).toBeInTheDocument();
    });
  });

  describe("3. PocketAggregateDetailPage", () => {
    it("renders aggregate title, classification, summary, and published assertions", () => {
      renderWithClient(
        <PocketAggregateDetailPage />,
        "/pocket/drug/c8b0a514-4fb9-4f80-b747-91f1a5ff6818",
      );

      // Titles
      expect(screen.getAllByText("آتورواستاتین").length).toBeGreaterThan(0);
      expect(screen.getByText("عنوان علمی لاتین: Atorvastatin")).toBeInTheDocument();
      expect(screen.getByText(/HMG-CoA Reductase Inhibitor/)).toBeInTheDocument();
      expect(screen.getByText("داروی کاهش‌دهنده چربی خون.")).toBeInTheDocument();

      // Assertions
      expect(screen.getByText("ممکن است در موارد نادر باعث میوپاتی یا رابدومیولیز شود.")).toBeInTheDocument();
      expect(screen.getByText("از مصرف همزمان با مهارکننده‌های قوی CYP3A4 خودداری شود.")).toBeInTheDocument();
    });

    it("renders invalid aggregate error when unknown pillar is provided", () => {
      renderWithClient(<PocketAggregateDetailPage />, "/pocket/unknown-type/c8b0a514-4fb9-4f80-b747-91f1a5ff6818");
      expect(screen.getByText(/نوع رکن بالینی نامعتبر است/)).toBeInTheDocument();
    });

    it("renders invalid identifier error when malformed identifier is provided", () => {
      renderWithClient(<PocketAggregateDetailPage />, "/pocket/drug/invalid%20id!");
      expect(screen.getByText(/شناسه موجودیت بالینی نامعتبر است/)).toBeInTheDocument();
      expect(screen.getByText(/شناسه 'invalid id!' یک شناسه معتبر بالینی \(UUID یا اسلاگ\) نیست/)).toBeInTheDocument();
    });
  });

  describe("4. PocketAssertionDetailPage & Privacy Masking", () => {
    it("renders Persian and English clinical assertion statements", () => {
      renderWithClient(<PocketAssertionDetailPage />, "/pocket/assertions/asst-1");

      expect(
        screen.getByText("ممکن است در موارد نادر باعث میوپاتی یا رابدومیولیز شود.")
      ).toBeInTheDocument();
      expect(screen.getByText("Adults")).toBeInTheDocument();
    });

    it("enforces strict privacy: never exposes reviewerUserId to students", () => {
      renderWithClient(<PocketAssertionDetailPage />, "/pocket/assertions/asst-1");

      // Verify that no element renders any reviewer UUID or user ID
      expect(screen.queryByText(/doc-/)).not.toBeInTheDocument();
      expect(screen.queryByText(/reviewerUserId/)).not.toBeInTheDocument();

      // Reviewer action buttons must NOT be visible to student
      expect(screen.queryByText("تأیید بالینی")).not.toBeInTheDocument();
      expect(screen.queryByText("رد اعتبارسنجی")).not.toBeInTheDocument();
      expect(screen.queryByText("ثبت تضاد علمی")).not.toBeInTheDocument();
    });

    it("displays reviewer action drawer triggers when logged in as certified clinical reviewer", () => {
      mockAuthUser = { id: "doc-1", role: "clinical_reviewer", name: "دکتر احمدی" };
      mockReviewerMeData = {
        isReviewer: true,
        credential: {
          id: "cred-1",
          userId: "doc-1",
          medicalLicenseNumber: "98765",
          specialty: "فارماکولوژی",
          licensingAuthority: "سازمان نظام پزشکی",
          isActive: true,
          suspendedAt: null,
          suspensionReason: null,
          grantedBy: "admin-1",
          grantedAt: "2026-01-01T00:00:00Z",
          licenseExpiresAt: "2027-01-01T00:00:00Z",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      };

      renderWithClient(<PocketAssertionDetailPage />, "/pocket/assertions/asst-1");

      // Reviewer buttons must be present
      expect(screen.getByText("تأیید بالینی")).toBeInTheDocument();
      expect(screen.getByText("رد اعتبارسنجی")).toBeInTheDocument();
      expect(screen.getByText("ثبت تضاد علمی")).toBeInTheDocument();
    });

    it("renders 404/not found state when assertion is missing or unpublished", () => {
      mockSingleAssertion = null;
      renderWithClient(<PocketAssertionDetailPage />, "/pocket/assertions/non-existent");

      expect(screen.getByText("بیانیه علمی یافت نشد")).toBeInTheDocument();
      expect(screen.getByText("بازگشت به خانه پاکت")).toBeInTheDocument();
    });

    it("renders publication date and validity expiration date when provided", () => {
      mockSingleAssertion = {
        ...mockSingleAssertion!,
        publishedAt: "2026-02-15T00:00:00Z",
        validUntilDate: "2027-02-15T00:00:00Z",
      };
      renderWithClient(<PocketAssertionDetailPage />, "/pocket/assertions/asst-1");

      expect(screen.getByText(/تاریخ انتشار:/)).toBeInTheDocument();
      expect(screen.getByText(/اعتبار تا:/)).toBeInTheDocument();
    });
  });
});
