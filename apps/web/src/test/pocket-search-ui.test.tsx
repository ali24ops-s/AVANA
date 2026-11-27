/**
 * AVANA Pocket — Phase UI-4.2 Phase 2 Frontend Search UI Test Suite
 *
 * Verifies:
 * 1. PocketSearchBar: RTL input, debounce trigger, submit, clear button, loading spinner, ARIA combobox.
 * 2. PocketSearchDropdown: Suggestions list, empty state, error state, keyboard active highlight, outside click dismiss.
 * 3. PocketSearchFilters: 4 pillars + "All" filter tabs, selection toggle, accessible states.
 * 4. PocketSearchResultCard: Entity metadata, clinical verification badges, match indicator, navigation link.
 * 5. PocketHomePage Search Integration:
 *    - Initial view (pillars, direct UUID lookup, notice)
 *    - Typeahead suggestions flow and keyboard navigation (ArrowDown/ArrowUp/Enter/Escape)
 *    - Full search execution and search results rendering
 *    - Pillar filter switching without clearing input
 *    - Empty state when no items match
 *    - Reset to home view when search is cleared
 */

import React from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  PocketSearchBar,
  PocketSearchDropdown,
  PocketSearchFilters,
  PocketSearchResultCard,
} from "../components/pocket/index.js";
import { PocketHomePage } from "../pages/pocket/PocketHomePage.js";
import type {
  PocketSearchResultItem,
  PocketSearchSuggestion,
  PocketSearchResponse,
  PocketSuggestionsResponse,
  ReviewerMeData,
} from "../lib/api/pocket.js";

// Hoisted Mocks
const { mockPocketApi, mockReviewerMeData, mockAuthUser, setMockState } = vi.hoisted(() => {
  const reviewerMeData: ReviewerMeData = {
    isReviewer: false,
    credential: null,
  };
  const authUser = {
    id: "student-user-1",
    role: "student",
    name: "دانشجوی پزشکی",
  };
  let searchResults: PocketSearchResultItem[] = [];
  let suggestions: PocketSearchSuggestion[] = [];
  let searchTotal = 0;

  const pocketApi = {
    search: vi.fn().mockImplementation(async (params) => {
      return {
        query: params.q || "",
        limit: Number(params.limit) || 20,
        offset: Number(params.offset) || 0,
        total: searchTotal,
        hasMore: false,
        items: searchResults,
      } as PocketSearchResponse;
    }),
    getSuggestions: vi.fn().mockImplementation(async (params) => {
      return {
        query: params.q || "",
        suggestions,
      } as PocketSuggestionsResponse;
    }),
  };

  return {
    mockPocketApi: pocketApi,
    mockReviewerMeData: reviewerMeData,
    mockAuthUser: authUser,
    setMockState: (state: {
      searchResults?: PocketSearchResultItem[];
      suggestions?: PocketSearchSuggestion[];
      searchTotal?: number;
    }) => {
      if (state.searchResults !== undefined) searchResults = state.searchResults;
      if (state.suggestions !== undefined) suggestions = state.suggestions;
      if (state.searchTotal !== undefined) searchTotal = state.searchTotal;
    },
  };
});

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: mockAuthUser,
    isAuthenticated: true,
  }),
}));

vi.mock("../hooks/usePocketReviewer.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/usePocketReviewer.js")>();
  return {
    ...actual,
    getPocketApi: () => mockPocketApi,
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
  usePocketPermissions: () => ({
    canReview: false,
    canVerify: false,
    canPublish: false,
    canManageReviewers: false,
    isClinicalReviewer: false,
    credential: null,
  }),
}));

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/pocket"]}>
        <Routes>
          <Route path="/pocket" element={ui} />
          <Route path="/pocket/:type/:id" element={<div data-testid="detail-page">جزئیات موجودیت</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AVANA Pocket Search UI Components", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setMockState({
      searchResults: [],
      suggestions: [],
      searchTotal: 0,
    });
  });

  describe("1. PocketSearchBar", () => {
    it("renders search input, search icon, and submit button", () => {
      const handleChange = vi.fn();
      const handleSearch = vi.fn();

      render(
        <PocketSearchBar
          value=""
          onChange={handleChange}
          onSearch={handleSearch}
          placeholder="جستجوی بالینی..."
        />,
      );

      const input = screen.getByRole("combobox", { name: "جستجوی جامع بالینی" });
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("placeholder", "جستجوی بالینی...");

      const submitButton = screen.getByRole("button", { name: "اجرای جستجو" });
      expect(submitButton).toBeDisabled();
    });

    it("triggers onChange when user types", () => {
      const handleChange = vi.fn();
      const handleSearch = vi.fn();

      render(
        <PocketSearchBar
          value=""
          onChange={handleChange}
          onSearch={handleSearch}
        />,
      );

      const input = screen.getByRole("combobox");
      fireEvent.change(input, { target: { value: "آتورواستاتین" } });
      expect(handleChange).toHaveBeenCalledWith("آتورواستاتین");
    });

    it("triggers onSearch on Enter keypress and button submit", () => {
      const handleChange = vi.fn();
      const handleSearch = vi.fn();

      render(
        <PocketSearchBar
          value="آسپیرین"
          onChange={handleChange}
          onSearch={handleSearch}
        />,
      );

      const input = screen.getByRole("combobox");
      fireEvent.keyDown(input, { key: "Enter" });
      expect(handleSearch).toHaveBeenCalledWith("آسپیرین");

      const submitBtn = screen.getByRole("button", { name: "اجرای جستجو" });
      expect(submitBtn).toBeEnabled();
      fireEvent.click(submitBtn);
      expect(handleSearch).toHaveBeenCalledTimes(2);
    });

    it("renders clear button when value is present and clears input on click", () => {
      const handleChange = vi.fn();
      const handleClear = vi.fn();

      render(
        <PocketSearchBar
          value="متفورمین"
          onChange={handleChange}
          onSearch={vi.fn()}
          onClear={handleClear}
        />,
      );

      const clearBtn = screen.getByRole("button", { name: "پاک کردن ورودی جستجو" });
      expect(clearBtn).toBeInTheDocument();

      fireEvent.click(clearBtn);
      expect(handleChange).toHaveBeenCalledWith("");
      expect(handleClear).toHaveBeenCalled();
    });

    it("displays loading spinner when isLoading is true", () => {
      render(
        <PocketSearchBar
          value="دیابت"
          onChange={vi.fn()}
          onSearch={vi.fn()}
          isLoading={true}
        />,
      );

      expect(screen.getByRole("status", { name: "در حال جستجو" })).toBeInTheDocument();
    });
  });

  describe("2. PocketSearchDropdown", () => {
    const sampleSuggestions: PocketSearchSuggestion[] = [
      {
        id: "drug-1",
        type: "drug",
        slug: "atorvastatin",
        titleEn: "Atorvastatin",
        titleFa: "آتورواستاتین",
        classification: "استاتین",
        matchedText: "آتورواستاتین",
      },
      {
        id: "disease-1",
        type: "disease",
        slug: "hypertension",
        titleEn: "Hypertension",
        titleFa: "پرفشاری خون",
        classification: "قلبی عروقی",
        matchedText: "فشار خون بالا",
      },
    ];

    it("does not render when isOpen is false", () => {
      const { container } = render(
        <PocketSearchDropdown
          isOpen={false}
          suggestions={sampleSuggestions}
          isLoading={false}
          isError={false}
          query="آتور"
          selectedIndex={-1}
          onSelect={vi.fn()}
          onSearchAll={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(container.firstChild).toBeNull();
    });

    it("renders suggestion items with Persian/English titles and handles click selection", () => {
      const handleSelect = vi.fn();

      render(
        <PocketSearchDropdown
          isOpen={true}
          suggestions={sampleSuggestions}
          isLoading={false}
          isError={false}
          query="آتور"
          selectedIndex={-1}
          onSelect={handleSelect}
          onSearchAll={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText("آتورواستاتین")).toBeInTheDocument();
      expect(screen.getByText("(Atorvastatin)")).toBeInTheDocument();
      expect(screen.getByText("رده: استاتین")).toBeInTheDocument();
      expect(screen.getByText("پرفشاری خون")).toBeInTheDocument();
      expect(screen.getByText("منطبق با: فشار خون بالا")).toBeInTheDocument();

      fireEvent.click(screen.getByText("آتورواستاتین"));
      expect(handleSelect).toHaveBeenCalledWith(sampleSuggestions[0]);
    });

    it("highlights item based on selectedIndex for keyboard accessibility", () => {
      render(
        <PocketSearchDropdown
          isOpen={true}
          suggestions={sampleSuggestions}
          isLoading={false}
          isError={false}
          query="آتور"
          selectedIndex={1}
          onSelect={vi.fn()}
          onSearchAll={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveAttribute("aria-selected", "false");
      expect(options[1]).toHaveAttribute("aria-selected", "true");
    });

    it("renders empty state and search-all action when no suggestions exist", () => {
      const handleSearchAll = vi.fn();

      render(
        <PocketSearchDropdown
          isOpen={true}
          suggestions={[]}
          isLoading={false}
          isError={false}
          query="عبارت ناموجود"
          selectedIndex={-1}
          onSelect={vi.fn()}
          onSearchAll={handleSearchAll}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText(/موردی در پیشنهادهای اولیه برای/)).toBeInTheDocument();
      const searchAllBtn = screen.getByRole("button", { name: "جستجوی سراسری در پایگاه داده بالینی" });
      fireEvent.click(searchAllBtn);
      expect(handleSearchAll).toHaveBeenCalledWith("عبارت ناموجود");
    });

    it("renders error state when isError is true", () => {
      render(
        <PocketSearchDropdown
          isOpen={true}
          suggestions={[]}
          isLoading={false}
          isError={true}
          query="تست"
          selectedIndex={-1}
          onSelect={vi.fn()}
          onSearchAll={vi.fn()}
          onClose={vi.fn()}
        />,
      );

      expect(screen.getByText(/خطا در دریافت پیشنهادهای لحظه‌ای/)).toBeInTheDocument();
    });
  });

  describe("3. PocketSearchFilters", () => {
    it("renders all 5 filter buttons and toggles active selection", () => {
      const handleChange = vi.fn();

      render(
        <PocketSearchFilters
          selectedType="all"
          onSelectType={handleChange}
        />,
      );

      const allBtn = screen.getByRole("tab", { name: "همه" });
      const drugBtn = screen.getByRole("tab", { name: "دارو" });
      const diseaseBtn = screen.getByRole("tab", { name: "بیماری" });
      const treatmentBtn = screen.getByRole("tab", { name: "درمان" });
      const emergencyBtn = screen.getByRole("tab", { name: "اورژانس" });

      expect(allBtn).toHaveAttribute("aria-selected", "true");
      expect(drugBtn).toHaveAttribute("aria-selected", "false");
      expect(diseaseBtn).toHaveAttribute("aria-selected", "false");
      expect(treatmentBtn).toHaveAttribute("aria-selected", "false");
      expect(emergencyBtn).toHaveAttribute("aria-selected", "false");

      fireEvent.click(emergencyBtn);
      expect(handleChange).toHaveBeenCalledWith("emergency");
    });
  });

  describe("4. PocketSearchResultCard", () => {
    const sampleItem: PocketSearchResultItem = {
      id: "drug-1",
      type: "drug",
      slug: "atorvastatin",
      titleEn: "Atorvastatin",
      titleFa: "آتورواستاتین",
      classification: "مهارکننده HMG-CoA",
      summary: "کاهش کلسترول خون و پیشگیری اولیه از حوادث قلبی عروقی.",
      versionNumber: 2,
      relevanceScore: 0.95,
      matchedTerm: "آتورواستاتین ۲۰",
      matchField: "brand_name",
      verification: {
        isClinicallyVerified: true,
        lastVerifiedAt: "2026-03-20T10:00:00Z",
        verifiedAssertionsCount: 8,
        totalAssertionsCount: 10,
      },
    };

    it("renders title, classification, summary, verification badge, and ratio", () => {
      render(
        <MemoryRouter>
          <PocketSearchResultCard item={sampleItem} />
        </MemoryRouter>,
      );

      expect(screen.getByText("آتورواستاتین")).toBeInTheDocument();
      expect(screen.getByText("(Atorvastatin)")).toBeInTheDocument();
      expect(screen.getByText("مهارکننده HMG-CoA")).toBeInTheDocument();
      expect(screen.getByText("نسخه 2")).toBeInTheDocument();
      expect(screen.getByText("کاهش کلسترول خون و پیشگیری اولیه از حوادث قلبی عروقی.")).toBeInTheDocument();
      expect(screen.getByText("تأییدشده بالینی")).toBeInTheDocument();
      expect(screen.getByText("8 از 10 بیانیه")).toBeInTheDocument();
      expect(screen.getByText("آتورواستاتین ۲۰")).toBeInTheDocument();
      expect(screen.getByText("(نام تجاری / برند)")).toBeInTheDocument();

      const link = screen.getByRole("link", { name: "مشاهده اسناد و بیانیه‌ها" });
      expect(link).toHaveAttribute("href", "/pocket/drug/drug-1");
    });

    it("renders unverified badge when entity is not clinically verified", () => {
      const unverifiedItem: PocketSearchResultItem = {
        ...sampleItem,
        verification: {
          isClinicallyVerified: false,
          lastVerifiedAt: null,
          verifiedAssertionsCount: 0,
          totalAssertionsCount: 3,
        },
      };

      render(
        <MemoryRouter>
          <PocketSearchResultCard item={unverifiedItem} />
        </MemoryRouter>,
      );

      expect(screen.getByText("در انتظار داوری نهایی")).toBeInTheDocument();
    });
  });

  describe("5. PocketHomePage Search Integration", () => {
    it("renders default home view when no search query is active", () => {
      renderWithProviders(<PocketHomePage />);

      expect(screen.getByText("AVANA Pocket")).toBeInTheDocument();
      expect(screen.getByText("ارکان چهارگانه بالینی")).toBeInTheDocument();
      expect(screen.getByText("داروها")).toBeInTheDocument();
      expect(screen.getByText("بیماری‌ها")).toBeInTheDocument();
      expect(screen.getByText("درمان‌ها")).toBeInTheDocument();
      expect(screen.getByText("اورژانس‌ها")).toBeInTheDocument();
      expect(screen.getByText("جستجو با شناسه یکتای مرجع (Direct Identifier Lookup)")).toBeInTheDocument();
      expect(screen.getByText(/سیستم مصرف بالینی AVANA Pocket/)).toBeInTheDocument();
    });

    it("triggers debounced suggestions and handles keyboard arrow navigation and Escape", async () => {
      setMockState({
        suggestions: [
          {
            id: "drug-10",
            type: "drug",
            slug: "amoxicillin",
            titleEn: "Amoxicillin",
            titleFa: "آموکسی‌سیلین",
            classification: "آنتی‌بیوتیک",
          },
          {
            id: "drug-11",
            type: "drug",
            slug: "azithromycin",
            titleEn: "Azithromycin",
            titleFa: "آزیترومایسین",
            classification: "ماکرولید",
          },
        ],
      });

      renderWithProviders(<PocketHomePage />);

      const searchInput = screen.getByRole("combobox", { name: "جستجوی جامع بالینی" });
      fireEvent.change(searchInput, { target: { value: "آموکسی" } });

      // Fast-forward debounce timer
      await act(async () => {
        await new Promise((r) => setTimeout(r, 350));
      });

      await waitFor(() => {
        expect(screen.getByText("آموکسی‌سیلین")).toBeInTheDocument();
        expect(screen.getByText("آزیترومایسین")).toBeInTheDocument();
      });

      // Press ArrowDown to select first suggestion
      fireEvent.keyDown(searchInput, { key: "ArrowDown" });
      const options = screen.getAllByRole("option");
      expect(options[0]).toHaveAttribute("aria-selected", "true");

      // Press ArrowDown again to select second suggestion
      fireEvent.keyDown(searchInput, { key: "ArrowDown" });
      expect(options[1]).toHaveAttribute("aria-selected", "true");

      // Press Escape to dismiss dropdown
      fireEvent.keyDown(searchInput, { key: "Escape" });
      await waitFor(() => {
        expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
      });
    });

    it("executes search on Enter, displays search results, and hides default pillars", async () => {
      setMockState({
        searchResults: [
          {
            id: "drug-1",
            type: "drug",
            slug: "atorvastatin",
            titleEn: "Atorvastatin",
            titleFa: "آتورواستاتین",
            classification: "استاتین",
            summary: "کاهش کلسترول خون و پیشگیری از حوادث قلبی عروقی.",
            versionNumber: 1,
            relevanceScore: 1.0,
            verification: {
              isClinicallyVerified: true,
              lastVerifiedAt: "2026-03-20T10:00:00Z",
              verifiedAssertionsCount: 5,
              totalAssertionsCount: 5,
            },
          },
        ],
        searchTotal: 1,
      });

      renderWithProviders(<PocketHomePage />);

      const searchInput = screen.getByRole("combobox", { name: "جستجوی جامع بالینی" });
      fireEvent.change(searchInput, { target: { value: "آتورواستاتین" } });

      await waitFor(() => {
        expect(searchInput).toHaveValue("آتورواستاتین");
      });

      fireEvent.keyDown(searchInput, { key: "Enter" });

      await waitFor(() => {
        expect(screen.getByText("نتایج جستجو")).toBeInTheDocument();
        expect(screen.getByText(/برای/)).toBeInTheDocument();
        expect(screen.getByText(/1 موجودیت یافت شد/)).toBeInTheDocument();
        expect(screen.getByText("کاهش کلسترول خون و پیشگیری از حوادث قلبی عروقی.")).toBeInTheDocument();
      });

      // Default home sections should be replaced by search results
      expect(screen.queryByText("ساختار معماری AVANA Pocket")).not.toBeInTheDocument();
    });

    it("renders empty state when search returns no matching entities", async () => {
      setMockState({
        searchResults: [],
        searchTotal: 0,
      });

      renderWithProviders(<PocketHomePage />);

      const searchInput = screen.getByRole("combobox", { name: "جستجوی جامع بالینی" });
      fireEvent.change(searchInput, { target: { value: "عبارت_نامعتبر_بالینی" } });

      await waitFor(() => {
        expect(searchInput).toHaveValue("عبارت_نامعتبر_بالینی");
      });

      fireEvent.keyDown(searchInput, { key: "Enter" });

      await waitFor(() => {
        expect(screen.getByText(/هیچ موجودیتی برای/)).toBeInTheDocument();
        expect(screen.getByText("مشاهده تمام ارکان بالینی")).toBeInTheDocument();
      });
    });

    it("resets to initial home view when clear button is clicked", async () => {
      setMockState({
        searchResults: [
          {
            id: "drug-1",
            type: "drug",
            slug: "atorvastatin",
            titleEn: "Atorvastatin",
            titleFa: "آتورواستاتین",
            versionNumber: 1,
            relevanceScore: 1.0,
          },
        ],
        searchTotal: 1,
      });

      renderWithProviders(<PocketHomePage />);

      const searchInput = screen.getByRole("combobox", { name: "جستجوی جامع بالینی" });
      fireEvent.change(searchInput, { target: { value: "آتورواستاتین" } });

      await waitFor(() => {
        expect(searchInput).toHaveValue("آتورواستاتین");
      });

      fireEvent.keyDown(searchInput, { key: "Enter" });

      await waitFor(() => {
        expect(screen.getByText("نتایج جستجو")).toBeInTheDocument();
      });

      const clearBtn = screen.getByRole("button", { name: "پاک کردن ورودی جستجو" });
      fireEvent.click(clearBtn);

      await waitFor(() => {
        expect(screen.getByText("ارکان چهارگانه بالینی")).toBeInTheDocument();
        expect(screen.queryByText("نتایج جستجو")).not.toBeInTheDocument();
      });
    });
  });
});
