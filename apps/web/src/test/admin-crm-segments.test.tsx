import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
    listCrmSegments: vi.fn(),
    createCrmSegment: vi.fn(),
    updateCrmSegment: vi.fn(),
    deleteCrmSegment: vi.fn(),
    previewCrmSegmentCount: vi.fn(),
    getCrmSegmentMembers: vi.fn(),
    listCrmTags: vi.fn(),
  };
});

describe("AdminCrmSegmentsPage (Frontend Tests)", () => {
  let queryClient: QueryClient;

  const mockSegments = [
    {
      id: "segment-1",
      name: "کاربران طلایی پردرآمد",
      description: "خریداران نقدی بالای ۵ میلیون",
      isActive: true,
      matchOperator: "and" as const,
      filterRules: [
        {
          field: "payment.totalCashSpent" as const,
          operator: "greater_than_or_equal" as const,
          value: 5000000,
          timeWindow: "all_time" as const,
        },
      ],
      createdById: "admin-1",
      createdByName: "مدیر سیستم",
      createdAt: "2026-03-01T10:00:00Z",
      updatedAt: "2026-03-01T10:00:00Z",
      estimatedCount: 14,
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    vi.mocked(adminApi.listCrmSegments).mockResolvedValue({
      segments: mockSegments,
      totalCount: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    vi.mocked(adminApi.listCrmTags).mockResolvedValue({
      tags: [
        {
          id: "tag-1",
          name: "vip",
          color: "#f59e0b",
          description: "کاربر طلایی",
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });

    vi.mocked(adminApi.previewCrmSegmentCount).mockResolvedValue({ count: 28 });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminCrmSegmentsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it("renders segment list page with header and segment cards/table", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("سگمنت‌های پویای مشتریان (Dynamic Segmentation)")).toBeDefined();
      expect(screen.getByText("کاربران طلایی پردرآمد")).toBeDefined();
      expect(screen.getByText("۱۴ عضو")).toBeDefined();
      expect(screen.getByText("فعال")).toBeDefined();
    });
  });

  it("opens segment builder drawer when clicking 'تعریف سگمنت جدید'", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("تعریف سگمنت جدید")).toBeDefined();
    });

    fireEvent.click(screen.getByText("تعریف سگمنت جدید"));

    await waitFor(() => {
      expect(screen.getByText("تعریف سگمنت پویای جدید")).toBeDefined();
      expect(screen.getByPlaceholderText("مثلاً: خریداران وفادار بالای ۵ میلیون تومان")).toBeDefined();
    });
  });

  it("runs live member count preview on demand", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("تعریف سگمنت جدید")).toBeDefined();
    });

    fireEvent.click(screen.getByText("تعریف سگمنت جدید"));

    await waitFor(() => {
      expect(screen.getByText("پیش‌نمایش تعداد اعضا (Live Evaluation)")).toBeDefined();
    });

    fireEvent.click(screen.getByText("پیش‌نمایش تعداد اعضا (Live Evaluation)"));

    await waitFor(() => {
      expect(adminApi.previewCrmSegmentCount).toHaveBeenCalled();
      expect(screen.getByText("۲۸ کاربر منطبق")).toBeDefined();
    });
  });
});
