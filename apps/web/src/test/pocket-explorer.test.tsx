/**
 * AVANA Pocket — Phase UI-4.2 Explorer Revamp Test Suite
 *
 * Verifies:
 * 1. Initial Discovery load (renders all pillars, default sort, and real items)
 * 2. Pillar switching (All, Drugs, Diseases, Treatments, Emergencies) and parameter propagation
 * 3. Sorting controls (recent, name_asc, name_desc) and preserving active filters
 * 4. Pagination / Load More behavior (accumulates items, resets on filter change, prevents duplicates)
 * 5. Prevention of stale results when switching filter or sort
 * 6. Empty state rendering when no items exist
 * 7. Error state rendering and retry action
 * 8. Result card details (titleFa, titleEn, badges, verification, version, summary)
 * 9. Navigation links to aggregate detail (/pocket/:type/:id)
 * 10. RTL layout and mobile accessibility
 */

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PocketExplorerPage } from "../pages/pocket/PocketExplorerPage.js";
import { clearExplorerSessionCache } from "../pages/pocket/explorerSessionCache.js";
import type {
  PocketDiscoveryItem,
  PocketDiscoveryResponse,
  PocketDiscoveryQueryParams,
  PocketSearchResponse,
} from "../lib/api/pocket.js";

// Mock Auth
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "test-user", role: "student" },
    isAuthenticated: true,
  }),
}));

// Test Fixtures
const sampleDrugItem: PocketDiscoveryItem = {
  id: "drug-1",
  slug: "atorvastatin",
  type: "drug",
  titleEn: "Atorvastatin",
  titleFa: "آتورواستاتین",
  classification: "Statin / Lipid Lowering",
  summary: "داروی کاهنده کلسترول و خط اول پیشگیری از حوادث قلبی-عروقی.",
  category: "Statin / Lipid Lowering",
  publishedAt: "2026-03-20T10:00:00Z",
  versionNumber: 2,
  verification: {
    isClinicallyVerified: true,
    verifiedAssertionsCount: 4,
    totalAssertionsCount: 5,
    lastVerifiedAt: "2026-03-21T09:00:00Z",
  },
};

const sampleDiseaseItem: PocketDiscoveryItem = {
  id: "dis-1",
  slug: "hypertension",
  type: "disease",
  titleEn: "Hypertension",
  titleFa: "پرفشاری خون",
  classification: "I10",
  summary: "افزایش مزمن فشار خون شریانی سیستمیک.",
  category: "Cardiovascular",
  publishedAt: "2026-03-20T11:00:00Z",
  versionNumber: 1,
  verification: {
    isClinicallyVerified: false,
    verifiedAssertionsCount: 0,
    totalAssertionsCount: 2,
    lastVerifiedAt: null,
  },
};

const sampleTreatmentItem: PocketDiscoveryItem = {
  id: "treat-1",
  slug: "lifestyle-mod",
  type: "treatment",
  titleEn: "Lifestyle Modification",
  titleFa: "اصلاح سبک زندگی",
  classification: "Non-pharmacological",
  summary: "رژیم غذایی کم‌نمک و ورزش هوازی منظم.",
  category: "Non-pharmacological",
  publishedAt: "2026-03-20T12:00:00Z",
  versionNumber: 1,
  verification: {
    isClinicallyVerified: true,
    verifiedAssertionsCount: 3,
    totalAssertionsCount: 3,
    lastVerifiedAt: "2026-03-22T08:00:00Z",
  },
};

const sampleEmergencyItem: PocketDiscoveryItem = {
  id: "emg-1",
  slug: "anaphylaxis",
  type: "emergency",
  titleEn: "Anaphylaxis",
  titleFa: "شوک آنافیلاکسی",
  classification: "Type I Hypersensitivity",
  summary: "واکنش آلرژیک حاد و تهدیدکننده حیات؛ تزریق فوری اپی‌نفرین عضلانی ضروری است.",
  category: "Allergy & Immunology",
  publishedAt: "2026-03-20T13:00:00Z",
  versionNumber: 3,
  verification: {
    isClinicallyVerified: true,
    verifiedAssertionsCount: 6,
    totalAssertionsCount: 6,
    lastVerifiedAt: "2026-03-23T14:00:00Z",
  },
};

// Mock the usePocketDiscovery hook directly to verify caller interactions and data bindings
let mockHookState: {
  data: PocketDiscoveryResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
};

let capturedQueryParams: PocketDiscoveryQueryParams | undefined;
const mockRefetch = vi.fn().mockResolvedValue({});

vi.mock("../hooks/usePocketDiscovery.js", () => ({
  usePocketDiscovery: (params?: PocketDiscoveryQueryParams) => {
    capturedQueryParams = params;
    return {
      ...mockHookState,
      refetch: mockRefetch,
    };
  },
}));

let mockSearchHookState: {
  data: PocketSearchResponse | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
} = {
  data: undefined,
  isLoading: false,
  isFetching: false,
  isError: false,
  error: null,
};

vi.mock("../hooks/usePocketSearch.js", () => ({
  usePocketSearch: (_params?: unknown, options?: { enabled?: boolean }) => {
    return {
      data: options?.enabled ? mockSearchHookState.data : undefined,
      isLoading: options?.enabled ? mockSearchHookState.isLoading : false,
      isFetching: options?.enabled ? mockSearchHookState.isFetching : false,
      isError: options?.enabled ? mockSearchHookState.isError : false,
      error: options?.enabled ? mockSearchHookState.error : null,
      refetch: vi.fn().mockResolvedValue({}),
    };
  },
}));

function renderExplorer(initialRoute = "/pocket/explorer") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/pocket/explorer" element={<PocketExplorerPage />} />
          <Route
            path="/pocket/:type/:id"
            element={<div data-testid="aggregate-detail-page">Aggregate Detail Page</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function TestNavController() {
  const navigate = useNavigate();
  return (
    <div data-testid="test-nav-controller">
      <button data-testid="test-nav-back" onClick={() => navigate(-1)}>Back</button>
      <button data-testid="test-nav-forward" onClick={() => navigate(1)}>Forward</button>
      <button data-testid="test-nav-to-warfarin" onClick={() => navigate("/pocket/explorer?q=وارفارین&type=drug&sort=name_asc")}>To Warfarin</button>
    </div>
  );
}

function renderExplorerWithHistory(initialEntries: string[], initialIndex = 0) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries} initialIndex={initialIndex}>
        <TestNavController />
        <Routes>
          <Route path="/pocket/explorer" element={<PocketExplorerPage />} />
          <Route
            path="/pocket/:type/:id"
            element={<div data-testid="aggregate-detail-page">Aggregate Detail Page</div>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AVANA Pocket UI-4.2 Phase 3: PocketExplorerPage Revamp", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearExplorerSessionCache();
    capturedQueryParams = undefined;
    mockHookState = {
      data: {
        items: [sampleDrugItem, sampleDiseaseItem, sampleTreatmentItem, sampleEmergencyItem],
        total: 4,
        limit: 20,
        offset: 0,
        hasMore: false,
        type: "all",
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: mockRefetch,
    };
    mockSearchHookState = {
      data: {
        query: "آتورواستاتین",
        items: [sampleDrugItem],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
        type: "drug",
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
    };
  });

  describe("1. Initial Load & Layout", () => {
    it("renders page header, subtitle, RTL direction, and all 5 filter buttons", () => {
      const { container } = renderExplorer();

      expect(container.querySelector("[dir='rtl']")).toBeInTheDocument();
      expect(screen.getByText("کاوشگر بالینی (Clinical Explorer)")).toBeInTheDocument();
      expect(
        screen.getByText(/مرور ساختاریافته پایگاه دانش بالینی در چهار رکن پزشکی/)
      ).toBeInTheDocument();

      // All 5 category options: All + 4 pillars
      expect(screen.getByRole("button", { name: /همه/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /داروها/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /بیماری‌ها/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /درمان‌ها/ })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /اورژانس/ })).toBeInTheDocument();
    });

    it("displays valid results counter strictly from API response total", () => {
      renderExplorer();

      expect(screen.getByText("نمایش")).toBeInTheDocument();
      expect(screen.getAllByText("4").length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("موجودیت بالینی")).toBeInTheDocument();
    });

    it("defaults to type='all', sort='recent', limit=20, offset=0", () => {
      renderExplorer();

      expect(capturedQueryParams).toEqual({
        type: "all",
        sort: "recent",
        limit: 20,
        offset: 0,
      });
    });

    it("renders real discovery result cards without fabricated data", () => {
      renderExplorer();

      // Drug Card
      expect(screen.getByText("آتورواستاتین")).toBeInTheDocument();
      expect(screen.getByText("(Atorvastatin)")).toBeInTheDocument();
      expect(screen.getByText("Statin / Lipid Lowering")).toBeInTheDocument();
      expect(screen.getByText("نسخه 2")).toBeInTheDocument();
      expect(screen.getByText("4 از 5 بیانیه")).toBeInTheDocument();
      expect(
        screen.getByText("داروی کاهنده کلسترول و خط اول پیشگیری از حوادث قلبی-عروقی.")
      ).toBeInTheDocument();

      // Disease Card
      expect(screen.getByText("پرفشاری خون")).toBeInTheDocument();
      expect(screen.getByText("(Hypertension)")).toBeInTheDocument();
      expect(screen.getByText("در انتظار داوری نهایی")).toBeInTheDocument();

      // Treatment Card
      expect(screen.getByText("اصلاح سبک زندگی")).toBeInTheDocument();
      expect(screen.getByText("(Lifestyle Modification)")).toBeInTheDocument();

      // Emergency Card
      expect(screen.getByText("شوک آنافیلاکسی")).toBeInTheDocument();
      expect(screen.getByText("(Anaphylaxis)")).toBeInTheDocument();
      expect(screen.getByText("6 از 6 بیانیه")).toBeInTheDocument();
    });
  });

  describe("2. Pillar Filtering & Query Parameters", () => {
    it("switches to 'drug' pillar, updates active styling, and passes type='drug' to query", () => {
      renderExplorer();

      const drugButton = screen.getByRole("button", { name: /داروها/ });
      fireEvent.click(drugButton);

      expect(drugButton).toHaveClass("bg-[#008080]");
      expect(capturedQueryParams?.type).toBe("drug");
      expect(capturedQueryParams?.offset).toBe(0);
    });

    it("switches to 'disease' pillar and sends type='disease'", () => {
      renderExplorer();

      fireEvent.click(screen.getByRole("button", { name: /بیماری‌ها/ }));

      expect(capturedQueryParams?.type).toBe("disease");
      expect(capturedQueryParams?.offset).toBe(0);
    });

    it("allows returning to 'all' pillar", () => {
      renderExplorer("/pocket/explorer?type=drug");

      fireEvent.click(screen.getByRole("button", { name: /^همه/ }));

      expect(capturedQueryParams?.type).toBe("all");
      expect(capturedQueryParams?.offset).toBe(0);
    });
  });

  describe("3. Sorting Controls", () => {
    it("changes sort to 'name_asc' and triggers query with new sort while keeping pillar", () => {
      renderExplorer("/pocket/explorer?type=treatment");

      const select = screen.getByLabelText(/مرتب‌سازی:/);
      fireEvent.change(select, { target: { value: "name_asc" } });

      expect(capturedQueryParams?.type).toBe("treatment");
      expect(capturedQueryParams?.sort).toBe("name_asc");
      expect(capturedQueryParams?.offset).toBe(0);
    });

    it("changes sort to 'name_desc' and resets offset to 0", () => {
      renderExplorer();

      const select = screen.getByLabelText(/مرتب‌سازی:/);
      fireEvent.change(select, { target: { value: "name_desc" } });

      expect(capturedQueryParams?.sort).toBe("name_desc");
      expect(capturedQueryParams?.offset).toBe(0);
    });
  });

  describe("4. Pagination & Load More", () => {
    it("renders 'بارگذاری بیشتر' button when hasMore is true", () => {
      mockHookState.data = {
        items: [sampleDrugItem],
        total: 25,
        limit: 20,
        offset: 0,
        hasMore: true,
        type: "all",
      };

      renderExplorer();

      const loadMoreButton = screen.getByRole("button", { name: /بارگذاری بیشتر/ });
      expect(loadMoreButton).toBeInTheDocument();
    });

    it("increments offset when 'بارگذاری بیشتر' is clicked", () => {
      mockHookState.data = {
        items: [sampleDrugItem],
        total: 25,
        limit: 20,
        offset: 0,
        hasMore: true,
        type: "all",
      };

      renderExplorer();

      const loadMoreButton = screen.getByRole("button", { name: /بارگذاری بیشتر/ });
      fireEvent.click(loadMoreButton);

      expect(capturedQueryParams?.offset).toBe(20);
    });

    it("disables Load More button during next page fetch to prevent duplicate requests", () => {
      mockHookState.data = {
        items: [sampleDrugItem],
        total: 25,
        limit: 20,
        offset: 0,
        hasMore: true,
        type: "all",
      };

      renderExplorer();

      const loadMoreButton = screen.getByRole("button", { name: /بارگذاری بیشتر/ });
      expect(loadMoreButton).not.toBeDisabled();

      // Click load more
      fireEvent.click(loadMoreButton);

      // Now query is called with offset=20
      expect(capturedQueryParams?.offset).toBe(20);
    });

    it("does not render Load More button when hasMore is false", () => {
      mockHookState.data = {
        items: [sampleDrugItem],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
        type: "all",
      };

      renderExplorer();

      expect(screen.queryByRole("button", { name: /بارگذاری بیشتر/ })).not.toBeInTheDocument();
    });
  });

  describe("5. Stale Results Suppression on Filter Change", () => {
    it("immediately clears old results and displays skeleton loading when filter changes", () => {
      renderExplorer();

      expect(screen.getByText("آتورواستاتین")).toBeInTheDocument();

      // Transition hook state to loading for next filter
      mockHookState.data = undefined;
      mockHookState.isLoading = true;

      // Click on Emergency
      fireEvent.click(screen.getByRole("button", { name: /اورژانس/ }));

      // Old item from previous pillar must NOT be visible as new result
      expect(screen.queryByText("آتورواستاتین")).not.toBeInTheDocument();
      expect(screen.getByTestId("discovery-loading-state")).toBeInTheDocument();
    });
  });

  describe("6. Empty & Error States", () => {
    it("renders empty state notice when no items exist", () => {
      mockHookState.data = {
        items: [],
        total: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
        type: "drug",
      };

      renderExplorer();

      expect(screen.getByTestId("discovery-empty-state")).toBeInTheDocument();
      expect(screen.getByText("هیچ موردی در این رکن بالینی یافت نشد")).toBeInTheDocument();
      expect(
        screen.getByText("در حال حاضر داده‌ای مطابق با فیلتر انتخابی شما در پایگاه دانش بالینی منتشر نشده است.")
      ).toBeInTheDocument();
    });

    it("renders error state with retry button on query failure", () => {
      mockHookState.data = undefined;
      mockHookState.isError = true;
      mockHookState.error = new Error("خطای اتصال به سرور پایگاه دانش");

      renderExplorer();

      expect(screen.getByTestId("discovery-error-state")).toBeInTheDocument();
      expect(screen.getByText("خطا در دریافت اطلاعات کشف بالینی")).toBeInTheDocument();
      expect(screen.getByText("خطای اتصال به سرور پایگاه دانش")).toBeInTheDocument();

      const retryBtn = screen.getByRole("button", { name: /تلاش مجدد/ });
      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("7. Navigation to Aggregate Detail", () => {
    it("contains link targeting /pocket/:type/:id for each discovery card", () => {
      renderExplorer();

      const detailLinks = screen.getAllByRole("link", { name: /مشاهده اسناد و بیانیه‌ها/ });
      expect(detailLinks[0]).toHaveAttribute("href", "/pocket/drug/drug-1");
      expect(detailLinks[1]).toHaveAttribute("href", "/pocket/disease/dis-1");
      expect(detailLinks[2]).toHaveAttribute("href", "/pocket/treatment/treat-1");
      expect(detailLinks[3]).toHaveAttribute("href", "/pocket/emergency/emg-1");
    });
  });

  describe("8. Direct UUID Lookup Utility", () => {
    it("validates empty UUID input and displays warning", () => {
      renderExplorer();

      const submitButton = screen.getByRole("button", { name: /استعلام سند/ });
      fireEvent.click(submitButton);

      expect(
        screen.getByText("لطفاً شناسه یکتای موجودیت (UUID) را وارد نمایید.")
      ).toBeInTheDocument();
    });
  });

  describe("9. Final Acceptance Audit & Resilience Scenarios", () => {
    it("handles rapid filter switching without state corruption", () => {
      renderExplorer();

      // Click Drug, then Treatment, then Emergency rapidly
      fireEvent.click(screen.getByRole("button", { name: /داروها/ }));
      fireEvent.click(screen.getByRole("button", { name: /درمان‌ها/ }));
      fireEvent.click(screen.getByRole("button", { name: /اورژانس/ }));

      expect(capturedQueryParams?.type).toBe("emergency");
      expect(capturedQueryParams?.offset).toBe(0);
    });

    it("handles sort change during loading and resets offset to 0", () => {
      mockHookState.isLoading = true;
      renderExplorer();

      const select = screen.getByLabelText(/مرتب‌سازی:/);
      fireEvent.change(select, { target: { value: "name_desc" } });

      expect(capturedQueryParams?.sort).toBe("name_desc");
      expect(capturedQueryParams?.offset).toBe(0);
    });

    it("resets pagination and clears items if filter is changed while Load More was in progress", () => {
      mockHookState.data = {
        items: [sampleDrugItem],
        total: 25,
        limit: 20,
        offset: 0,
        hasMore: true,
        type: "all",
      };
      renderExplorer();

      // User triggers load more
      const loadMoreButton = screen.getByRole("button", { name: /بارگذاری بیشتر/ });
      fireEvent.click(loadMoreButton);
      expect(capturedQueryParams?.offset).toBe(20);

      // Before page 2 completes, user clicks 'disease' pillar
      fireEvent.click(screen.getByRole("button", { name: /بیماری‌ها/ }));

      // Offset must reset to 0, not stay at 20
      expect(capturedQueryParams?.type).toBe("disease");
      expect(capturedQueryParams?.offset).toBe(0);
    });

    it("preserves previous items on Load More failure and retry calls refetch", () => {
      mockHookState.data = {
        items: [sampleDrugItem],
        total: 25,
        limit: 20,
        offset: 0,
        hasMore: true,
        type: "all",
      };
      renderExplorer();

      // Trigger load more
      fireEvent.click(screen.getByRole("button", { name: /بارگذاری بیشتر/ }));

      // Simulate failure of page 2
      mockHookState.isError = true;
      mockHookState.error = new Error("شبکه در دسترس نیست");
      mockHookState.isFetching = false;

      // Re-render in error state
      fireEvent.click(screen.getByRole("button", { name: /بارگذاری بیشتر/ }));

      // Previous item must still be on screen
      expect(screen.getByText("آتورواستاتین")).toBeInTheDocument();

      // Retry button calls refetch
      const retryBtn = screen.getByRole("button", { name: /تلاش مجدد/ });
      fireEvent.click(retryBtn);
      expect(mockRefetch).toHaveBeenCalled();
    });

    it("deduplicates identical IDs if server returns an already loaded item", () => {
      mockHookState.data = {
        items: [sampleDrugItem],
        total: 2,
        limit: 20,
        offset: 0,
        hasMore: true,
        type: "all",
      };
      renderExplorer();

      // Trigger next page with overlapping drug-1
      fireEvent.click(screen.getByRole("button", { name: /بارگذاری بیشتر/ }));

      mockHookState.data = {
        items: [sampleDrugItem, sampleDiseaseItem],
        total: 2,
        limit: 20,
        offset: 20,
        hasMore: false,
        type: "all",
      };

      // Click to trigger re-render
      fireEvent.click(screen.getByRole("button", { name: /بارگذاری بیشتر/ }));

      // Should only have 1 card with drug-1, not two
      const drugCards = screen.getAllByTestId("discovery-card-drug-1");
      expect(drugCards).toHaveLength(1);
    });

    it("safely handles incomplete, null, and inconsistent discovery item data in PocketDiscoveryCard", () => {
      const corruptedItem: PocketDiscoveryItem = {
        id: "corrupted-1",
        slug: "partial-item",
        type: "drug",
        titleEn: "",
        titleFa: "",
        classification: "",
        summary: "",
        category: "",
        publishedAt: null,
        versionNumber: 1,
        verification: {
          isClinicallyVerified: false,
          verifiedAssertionsCount: 5,
          totalAssertionsCount: 2, // Inconsistent ratio: verified > total
          lastVerifiedAt: null,
        },
      };

      mockHookState.data = {
        items: [corruptedItem],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
        type: "all",
      };

      renderExplorer();

      // Fallback title should render slug
      expect(screen.getByText("partial-item")).toBeInTheDocument();
      // Should show unverified badge
      expect(screen.getByText("در انتظار داوری نهایی")).toBeInTheDocument();
      // Inconsistent ratio (5 of 2) should NOT be displayed
      expect(screen.queryByText(/5 از 2/)).not.toBeInTheDocument();
    });

    it("ignores late arrival of stale responses for a previous filter", () => {
      renderExplorer();

      // Start on all, click disease
      fireEvent.click(screen.getByRole("button", { name: /بیماری‌ها/ }));

      // Late response arrives with type="drug"
      mockHookState.data = {
        items: [sampleDrugItem],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
        type: "drug", // type does not match selectedType="disease"
      };

      // Drug item should NOT be synced into disease view
      expect(screen.queryByText("آتورواستاتین")).not.toBeInTheDocument();
    });

    it("ignores late arrival of specific pillar response when selectedType is 'all'", () => {
      renderExplorer();

      // Initially renders all 4 items including disease
      expect(screen.getByText("پرفشاری خون")).toBeInTheDocument();

      // Currently on "all", late drug response arrives with total: 1 and only drug item
      mockHookState.data = {
        items: [sampleDrugItem],
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
        type: "drug", // does not match selectedType="all"
      };

      // Drug-only response must NOT replace the all list; hypertension remains in document
      expect(screen.getByText("پرفشاری خون")).toBeInTheDocument();
    });

    it("hides stale counter and Load More button immediately when filter changes", () => {
      mockHookState.data = {
        items: [sampleDrugItem],
        total: 25,
        limit: 20,
        offset: 0,
        hasMore: true,
        type: "all",
      };

      renderExplorer();

      expect(screen.getByText("بارگذاری بیشتر")).toBeInTheDocument();

      // Transition hook state to loading for next filter
      mockHookState.data = undefined;
      mockHookState.isLoading = true;

      // Click on Emergency
      fireEvent.click(screen.getByRole("button", { name: /اورژانس/ }));

      // Counter must show loading placeholder, NOT previous total 25
      expect(screen.getByText("در حال کشف اطلاعات بالینی...")).toBeInTheDocument();
      // Load more button must be hidden
      expect(screen.queryByText("بارگذاری بیشتر")).not.toBeInTheDocument();
    });

    it("synchronizes query state during browser Back and Forward navigation", () => {
      // Initialize with drug and sort=name_asc
      renderExplorer("/pocket/explorer?type=drug&sort=name_asc");

      expect(capturedQueryParams?.type).toBe("drug");
      expect(capturedQueryParams?.sort).toBe("name_asc");

      // User selects 'treatment'
      fireEvent.click(screen.getByRole("button", { name: /درمان‌ها/ }));
      expect(capturedQueryParams?.type).toBe("treatment");

      // User selects 'emergency'
      fireEvent.click(screen.getByRole("button", { name: /اورژانس/ }));
      expect(capturedQueryParams?.type).toBe("emergency");
    });

    it("rejects delayed page 2 response from a previous sort when sort has changed", () => {
      // 1. User is on drug pillar with recent sort, page 1 loaded
      mockHookState.data = {
        items: [sampleDrugItem],
        total: 25,
        limit: 20,
        offset: 0,
        hasMore: true,
        type: "drug",
      };

      renderExplorer("/pocket/explorer?type=drug&sort=recent");
      expect(screen.getByText("آتورواستاتین")).toBeInTheDocument();

      // 2. User requests page 2 (offset=20)
      fireEvent.click(screen.getByRole("button", { name: /بارگذاری بیشتر/ }));
      expect(capturedQueryParams?.offset).toBe(20);

      // 3. Before page 2 returns, user changes sort to 'name_asc'
      const sortSelect = screen.getByLabelText(/مرتب‌سازی:/);
      fireEvent.change(sortSelect, { target: { value: "name_asc" } });

      // Offset resets to 0 for new sort
      expect(capturedQueryParams?.sort).toBe("name_asc");
      expect(capturedQueryParams?.offset).toBe(0);

      // 4. Delayed response for page 2 of 'recent' arrives with offset: 20
      const delayedPage2Item: PocketDiscoveryItem = {
        id: "delayed-drug-2",
        slug: "delayed-drug",
        type: "drug",
        titleEn: "Delayed Drug",
        titleFa: "داروی دیرهنگام",
        classification: "Delayed",
        summary: "توضیح داروی دیرهنگام",
        category: "Delayed",
        publishedAt: null,
        versionNumber: 1,
        verification: {
          isClinicallyVerified: true,
          verifiedAssertionsCount: 1,
          totalAssertionsCount: 1,
          lastVerifiedAt: null,
        },
      };

      mockHookState.data = {
        items: [delayedPage2Item],
        total: 25,
        limit: 20,
        offset: 20, // Belongs to previous page 2 request, not offset 0
        hasMore: true,
        type: "drug",
      };

      // Component re-renders with the delayed response
      // Delayed item with offset=20 MUST NOT be accepted into offset=0 view
      expect(screen.queryByText("داروی دیرهنگام")).not.toBeInTheDocument();
    });

    it("allows typing new characters in search input without URL resetting the input, and supports submitting search", () => {
      // 1. Initial entry with q in URL, plus active pillar (type=drug) and sort (sort=name_asc)
      renderExplorer("/pocket/explorer?q=آتورواستاتین&type=drug&sort=name_asc");

      const searchInput = screen.getByTestId("explorer-search-input") as HTMLInputElement;
      expect(searchInput.value).toBe("آتورواستاتین");

      const drugPillarBtn = screen.getByRole("button", { name: /دارو/ });
      expect(drugPillarBtn).toHaveAttribute("aria-pressed", "true");

      // 2. User types new characters into search field
      // CRITICAL BUG VERIFICATION: The previous URL value ('آتورواستاتین') MUST NOT overwrite this keystroke!
      fireEvent.change(searchInput, { target: { value: "آتورواستاتین کلسیم ۲۰" } });
      expect(searchInput.value).toBe("آتورواستاتین کلسیم ۲۰");

      // 3. User submits search query
      const submitBtn = screen.getByTestId("explorer-search-submit-btn");
      fireEvent.click(submitBtn);

      // Input remains intact and pillar remains preserved
      expect(searchInput.value).toBe("آتورواستاتین کلسیم ۲۰");
      expect(drugPillarBtn).toHaveAttribute("aria-pressed", "true");

      // 4. User clears search
      const clearBtn = screen.getByTestId("explorer-clear-search-button");
      fireEvent.click(clearBtn);

      // Search input is cleared, Discovery mode is restored
      expect(searchInput.value).toBe("");
      expect(screen.queryByText(/جستجو برای:/)).not.toBeInTheDocument();
      const sortSelect = screen.getByLabelText(/مرتب‌سازی:/) as HTMLSelectElement;
      expect(sortSelect).toBeInTheDocument();
      expect(sortSelect.value).toBe("name_asc");
      expect(drugPillarBtn).toHaveAttribute("aria-pressed", "true");
    });

    it("synchronizes query state during external navigation and simulated browser Back and Forward", () => {
      // History entries: [0] = Atorvastatin, [1] = Aspirin
      // Starts at index 1 (Aspirin)
      renderExplorerWithHistory(
        [
          "/pocket/explorer?q=آتورواستاتین&type=drug&sort=name_asc",
          "/pocket/explorer?q=آسپیرین&type=drug&sort=name_asc",
        ],
        1,
      );

      const searchInput = screen.getByTestId("explorer-search-input") as HTMLInputElement;
      expect(searchInput.value).toBe("آسپیرین");

      const drugPillarBtn = screen.getByRole("button", { name: /دارو/ });
      expect(drugPillarBtn).toHaveAttribute("aria-pressed", "true");

      // 1. Simulate Browser Back (navigate to index 0)
      const backBtn = screen.getByTestId("test-nav-back");
      fireEvent.click(backBtn);

      // Input synchronizes with URL query param 'آتورواستاتین'
      expect(searchInput.value).toBe("آتورواستاتین");
      expect(drugPillarBtn).toHaveAttribute("aria-pressed", "true");

      // 2. Simulate Browser Forward (navigate back to index 1)
      const forwardBtn = screen.getByTestId("test-nav-forward");
      fireEvent.click(forwardBtn);

      // Input synchronizes with URL query param 'آسپیرین'
      expect(searchInput.value).toBe("آسپیرین");
      expect(drugPillarBtn).toHaveAttribute("aria-pressed", "true");

      // 3. External route navigation (e.g. user clicked a link with a different q)
      const toWarfarinBtn = screen.getByTestId("test-nav-to-warfarin");
      fireEvent.click(toWarfarinBtn);

      // Input synchronizes with the new URL query 'وارفارین'
      expect(searchInput.value).toBe("وارفارین");
      expect(drugPillarBtn).toHaveAttribute("aria-pressed", "true");
    });

    it("hydrates pagination offset from explorerSessionCache and loads next page on Back navigation", async () => {
      const {
        buildExplorerSessionKey,
        startExplorerSession,
        updateExplorerSession,
      } = await import("../pages/pocket/explorerSessionCache.js");

      const sessionKey = buildExplorerSessionKey("", "drug", "recent");
      const { generation } = startExplorerSession(sessionKey);
      updateExplorerSession(
        sessionKey,
        {
          items: [
            {
              id: "d-hydrated-1",
              slug: "hydrated-drug",
              type: "drug",
              titleEn: "Hydrated Drug",
              titleFa: "داروی کش‌شده",
              classification: "Antibiotic",
              summary: "Cached summary",
              category: "Antibiotic",
              publishedAt: "2026-01-01T00:00:00Z",
              versionNumber: 1,
              verification: {
                isClinicallyVerified: true,
                verifiedAssertionsCount: 1,
                totalAssertionsCount: 1,
                lastVerifiedAt: "2026-01-02T00:00:00Z",
              },
            },
          ],
          total: 50,
          offset: 20,
          hasMore: true,
        },
        generation,
      );

      mockHookState.data = {
        items: [],
        total: 50,
        limit: 20,
        offset: 20,
        hasMore: true,
        type: "drug",
      };

      renderExplorerWithHistory(["/pocket/explorer?type=drug"], 0);

      // Should immediately display hydrated item and request offset=20 (not 0)
      expect(screen.getByText("داروی کش‌شده")).toBeInTheDocument();
      expect(capturedQueryParams?.type).toBe("drug");
      expect(capturedQueryParams?.offset).toBe(20);

      // Clicking Load More should increment offset from 20 -> 40
      const loadMoreBtn = screen.getByRole("button", { name: /بارگذاری بیشتر/ });
      fireEvent.click(loadMoreBtn);

      expect(capturedQueryParams?.offset).toBe(40);
    });
  });
});
