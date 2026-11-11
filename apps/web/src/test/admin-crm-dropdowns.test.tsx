import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminCrmCustomersPage } from "../pages/admin/crm/AdminCrmCustomersPage.js";
import { AdminCrmCustomerDetailPage } from "../pages/admin/crm/AdminCrmCustomerDetailPage.js";
import { AdminCrmSegmentsPage } from "../pages/admin/crm/AdminCrmSegmentsPage.js";
import * as adminApi from "../lib/api/admin.js";

// Mock AuthProvider hook
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: vi.fn(() => ({
    user: {
      id: "admin-1",
      email: "admin@avana.org",
      role: "platform_admin",
      globalRole: "platform_admin",
    },
    isAuthenticated: true,
  })),
}));

// Mock Admin API
vi.mock("../lib/api/admin.js", async () => {
  const actual = await vi.importActual("../lib/api/admin.js");
  return {
    ...actual,
    listCrmCustomers: vi.fn(),
    listCrmTags: vi.fn(),
    createCrmTag: vi.fn(),
    deleteCrmTag: vi.fn(),
    assignCrmCustomerTag: vi.fn(),
    removeCrmCustomerTag: vi.fn(),
    getCrmCustomer360: vi.fn(),
    listCrmSegments: vi.fn(),
    createCrmSegment: vi.fn(),
    updateCrmSegment: vi.fn(),
    deleteCrmSegment: vi.fn(),
    previewCrmSegmentCount: vi.fn(),
    getCrmSegmentMembers: vi.fn(),
  };
});

describe("CRM Dropdowns Design System Integration Tests", () => {
  let queryClient: QueryClient;

  const mockTags = [
    { id: "tag-vip", name: "VIP", color: "#f59e0b", description: "مشتری طلایی", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
    { id: "tag-high", name: "High Intent", color: "#10b981", description: "قصد خرید بالا", createdAt: "2026-01-01", updatedAt: "2026-01-01" },
  ];

  const mockCustomers = [
    {
      id: "user-1",
      name: "سارا احمدی",
      email: "sara@example.com",
      phoneNumber: "09123456789",
      isVerified: true,
      tags: [mockTags[0]],
      successfulOrdersCount: 3,
      totalPaidAmount: 1500000,
      createdAt: "2026-01-10T08:00:00Z",
      lastActiveAt: "2026-03-01T10:00:00Z",
    },
  ];

  const mockCustomer360 = {
    profile: {
      identity: {
        id: "user-1",
        name: "سارا احمدی",
        email: "sara@example.com",
        phoneNumber: "09123456789",
        isVerified: true,
        createdAt: "2026-01-10T08:00:00Z",
        lastActiveAt: "2026-03-01T10:00:00Z",
      },
      financial: {
        totalPaidAmount: 1500000,
        walletBalance: 200000,
        successfulOrdersCount: 3,
        orders: [],
      },
      education: {
        enrolledCoursesCount: 2,
        studyTimeSeconds: 7200,
        completedQuizzesCount: 5,
        averageQuizScore: 88,
        studySessionsCount: 12,
        courses: [],
      },
      tags: [mockTags[0]],
      notes: [],
    },
  };

  const mockSegments = [
    {
      id: "segment-1",
      name: "خریداران برتر",
      description: "خریداران بالای ۱ میلیون",
      isActive: true,
      matchOperator: "and" as const,
      filterRules: [
        {
          field: "payment.totalCashSpent" as const,
          operator: "greater_than_or_equal" as const,
          value: 1000000,
        },
      ],
      createdById: "admin-1",
      createdByName: "مدیر سیستم",
      createdAt: "2026-03-01T10:00:00Z",
      updatedAt: "2026-03-01T10:00:00Z",
      estimatedCount: 10,
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    vi.mocked(adminApi.listCrmTags).mockResolvedValue({ tags: mockTags });
    vi.mocked(adminApi.listCrmCustomers).mockResolvedValue({
      customers: mockCustomers,
      totalCount: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    vi.mocked(adminApi.getCrmCustomer360).mockResolvedValue(mockCustomer360 as any);
    vi.mocked(adminApi.listCrmSegments).mockResolvedValue({
      segments: mockSegments,
      totalCount: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    vi.mocked(adminApi.previewCrmSegmentCount).mockResolvedValue({ count: 12 });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  describe("1. AdminCrmCustomersPage Dropdowns", () => {
    it("renders all 4 AvanaSelect dropdowns (SortBy, VerifiedStatus, HasPurchases, Tag) with Estedad font", async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AdminCrmCustomersPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("مرتب‌سازی: تاریخ ثبت‌نام")).toBeDefined();
        expect(screen.getByText("همه کاربران")).toBeDefined();
        expect(screen.getByText("همه")).toBeDefined();
        expect(screen.getByText("همه برچسب‌ها")).toBeDefined();
      });

      // All triggers must be comboboxes styled with Design System font-sans
      const comboboxes = screen.getAllByRole("combobox");
      expect(comboboxes.length).toBeGreaterThanOrEqual(4);

      // Verify that size="sm" is applied to the 3 filter dropdowns (min-h-[40px] on mobile, sm:min-h-[34px] on desktop)
      const verifiedTrigger = comboboxes.find((b) => b.textContent?.includes("همه کاربران"));
      expect(verifiedTrigger).toBeDefined();
      expect(verifiedTrigger?.className).toContain("min-h-[40px]");
      expect(verifiedTrigger?.className).toContain("sm:min-h-[34px]");
    });

    it("changes sort option when clicking an option in the AvanaSelect menu", async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AdminCrmCustomersPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("مرتب‌سازی: تاریخ ثبت‌نام")).toBeDefined();
      });

      const sortTrigger = screen.getByText("مرتب‌سازی: تاریخ ثبت‌نام").closest("button")!;
      fireEvent.click(sortTrigger);

      // Select 'مرتب‌سازی: مجموع خرید'
      const option = await screen.findByRole("option", { name: /مرتب‌سازی: مجموع خرید/i });
      fireEvent.click(option);

      await waitFor(() => {
        expect(screen.getByText("مرتب‌سازی: مجموع خرید")).toBeDefined();
        expect(adminApi.listCrmCustomers).toHaveBeenCalledWith(
          expect.objectContaining({ sortBy: "totalSpent" })
        );
      });
    });

    it("updates tag filter and triggers list query with selected tagId", async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AdminCrmCustomersPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("همه برچسب‌ها")).toBeDefined();
      });

      const tagFilterTrigger = screen.getByText("همه برچسب‌ها").closest("button")!;
      fireEvent.click(tagFilterTrigger);

      const vipOption = await screen.findByRole("option", { name: /VIP/i });
      fireEvent.click(vipOption);

      await waitFor(() => {
        expect(screen.getByText("VIP")).toBeDefined();
        expect(adminApi.listCrmCustomers).toHaveBeenCalledWith(
          expect.objectContaining({ tagId: "tag-vip" })
        );
      });
    });
  });

  describe("2. AdminCrmCustomerDetailPage Dropdown", () => {
    it("renders AvanaSelect for adding new tag with size='sm' and triggers assign mutation", async () => {
      vi.mocked(adminApi.assignCrmCustomerTag).mockResolvedValue({ ok: true } as any);

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/admin/crm/customers/user-1"]}>
            <Routes>
              <Route path="/admin/crm/customers/:userId" element={<AdminCrmCustomerDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("+ افزودن برچسب جدید...")).toBeDefined();
      });

      const tagTrigger = screen.getByText("+ افزودن برچسب جدید...").closest("button")!;
      expect(tagTrigger.className).toContain("min-h-[40px]");
      expect(tagTrigger.className).toContain("sm:min-h-[34px]");

      fireEvent.click(tagTrigger);

      // 'High Intent' is available to attach (since 'VIP' is already attached)
      const highIntentOpt = await screen.findByRole("option", { name: /High Intent/i });
      fireEvent.click(highIntentOpt);

      await waitFor(() => {
        expect(adminApi.assignCrmCustomerTag).toHaveBeenCalledWith("user-1", "tag-high");
      });
    });
  });

  describe("3. AdminCrmSegmentsPage Dropdowns & Portal", () => {
    it("renders statusFilter AvanaSelect and filters segments list", async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AdminCrmSegmentsPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("همه وضعیت‌ها")).toBeDefined();
      });

      const statusTrigger = screen.getByText("همه وضعیت‌ها").closest("button")!;
      fireEvent.click(statusTrigger);

      const activeOpt = await screen.findByRole("option", { name: /فقط سگمنت‌های فعال/i });
      fireEvent.click(activeOpt);

      await waitFor(() => {
        expect(adminApi.listCrmSegments).toHaveBeenCalledWith(
          expect.objectContaining({ isActive: true })
        );
      });
    });

    it("opens segment builder drawer and renders Rule Builder selects with usePortal={true} and categories", async () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AdminCrmSegmentsPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("تعریف سگمنت جدید")).toBeDefined();
      });

      fireEvent.click(screen.getByText("تعریف سگمنت جدید"));

      await waitFor(() => {
        expect(screen.getByText("تعریف سگمنت پویای جدید")).toBeDefined();
      });

      // The rule builder starts with payment.totalCashSpent
      expect(screen.getByText("مجموع پرداختی نقدی (تومان)")).toBeDefined();
      expect(screen.getByText("بزرگتر یا مساوی (>=)")).toBeDefined();

      // Click on Field Selector trigger inside the drawer
      const fieldTrigger = screen.getByText("مجموع پرداختی نقدی (تومان)").closest("button")!;
      fireEvent.click(fieldTrigger);

      // In usePortal={true}, the listbox is portaled to document.body
      const listbox = screen.getByRole("listbox");
      expect(listbox.parentElement).toBe(document.body);

      // Verify category group headers are displayed
      expect(screen.getByText("خرید و پرداخت")).toBeDefined();
      expect(screen.getByText("فعالیت و یادگیری")).toBeDefined();
      expect(screen.getByText("کاربر")).toBeDefined();
    });
  });
});
