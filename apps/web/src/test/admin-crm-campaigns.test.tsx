import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminCrmCampaignsPage } from "../pages/admin/crm/AdminCrmCampaignsPage.js";
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
    listCrmCampaigns: vi.fn(),
    createCrmCampaign: vi.fn(),
    updateCrmCampaign: vi.fn(),
    deleteCrmCampaign: vi.fn(),
    executeCrmCampaign: vi.fn(),
    pauseCrmCampaign: vi.fn(),
    resumeCrmCampaign: vi.fn(),
    cancelCrmCampaign: vi.fn(),
    listCrmCampaignExecutions: vi.fn(),
    listCrmCampaignRecipients: vi.fn(),
    listCrmSegments: vi.fn(),
  };
});

describe("AdminCrmCampaignsPage (Frontend Tests)", () => {
  let queryClient: QueryClient;

  const mockSegments = [
    {
      id: "segment-1",
      name: "کاربران طلایی پردرآمد",
      description: "خریداران نقدی بالای ۵ میلیون",
      isActive: true,
      matchOperator: "and" as const,
      filterRules: [],
      createdById: "admin-1",
      createdAt: "2026-03-01T10:00:00Z",
      updatedAt: "2026-03-01T10:00:00Z",
      estimatedCount: 42,
    },
  ];

  const mockCampaigns = [
    {
      id: "campaign-1",
      name: "تخفیف ویژه نوروزی",
      description: "ارسال پیامک تخفیف به کاربران طلایی",
      targetSegmentId: "segment-1",
      targetSegmentName: "کاربران طلایی پردرآمد",
      channel: "sms" as const,
      status: "draft" as const,
      messageContent: "سلام {name} عزیز، ۲۰٪ تخفیف عیدانه برای شما فعال شد.",
      scheduledAt: null,
      createdById: "admin-1",
      createdByName: "مدیر کل",
      estimatedRecipientsCount: 42,
      lastExecution: null,
      createdAt: "2026-03-10T12:00:00Z",
      updatedAt: "2026-03-10T12:00:00Z",
    },
    {
      id: "campaign-2",
      name: "اطلاعیه شروع دوره هوش مصنوعی",
      description: "ارسال ایمیل برای دوره جدید",
      targetSegmentId: "segment-1",
      targetSegmentName: "کاربران طلایی پردرآمد",
      channel: "email" as const,
      status: "running" as const,
      messageContent: "دوره جدید آغاز گردید.",
      scheduledAt: null,
      createdById: "admin-1",
      createdByName: "مدیر کل",
      estimatedRecipientsCount: 42,
      lastExecution: {
        id: "exec-1",
        status: "running" as const,
        totalRecipients: 42,
        processedRecipients: 20,
        successfulRecipients: 18,
        failedRecipients: 2,
        startedAt: "2026-03-12T08:00:00Z",
        completedAt: null,
      },
      createdAt: "2026-03-11T12:00:00Z",
      updatedAt: "2026-03-11T12:00:00Z",
    },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    vi.mocked(adminApi.listCrmCampaigns).mockResolvedValue({
      campaigns: mockCampaigns,
      totalCount: 2,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });

    vi.mocked(adminApi.listCrmSegments).mockResolvedValue({
      segments: mockSegments,
      totalCount: 1,
      page: 1,
      pageSize: 100,
      totalPages: 1,
    });

    vi.mocked(adminApi.listCrmCampaignExecutions).mockResolvedValue({
      executions: [
        {
          id: "exec-1",
          campaignId: "campaign-2",
          status: "running",
          totalRecipients: 42,
          processedRecipients: 20,
          successfulRecipients: 18,
          failedRecipients: 2,
          startedAt: "2026-03-12T08:00:00Z",
          completedAt: null,
          triggeredById: "admin-1",
          triggeredByName: "مدیر سیستم",
          createdAt: "2026-03-12T08:00:00Z",
          updatedAt: "2026-03-12T08:00:00Z",
        },
      ],
    });

    vi.mocked(adminApi.listCrmCampaignRecipients).mockResolvedValue({
      recipients: [
        {
          id: "rec-1",
          campaignId: "campaign-2",
          executionId: "exec-1",
          userId: "user-100",
          userName: "سارا احمدی",
          userEmail: "sara@example.com",
          userPhoneNumber: "09123456789",
          channel: "email",
          status: "sent",
          errorMessage: null,
          sentAt: "2026-03-12T08:01:00Z",
          createdAt: "2026-03-12T08:00:00Z",
        },
      ],
      totalCount: 1,
      page: 1,
      pageSize: 15,
      totalPages: 1,
    });

    vi.mocked(adminApi.createCrmCampaign).mockResolvedValue({
      campaign: mockCampaigns[0],
    });

    vi.mocked(adminApi.executeCrmCampaign).mockResolvedValue({
      ok: true,
      execution: {
        id: "exec-2",
        campaignId: "campaign-1",
        status: "running",
        totalRecipients: 42,
        processedRecipients: 0,
        successfulRecipients: 0,
        failedRecipients: 0,
        startedAt: "2026-03-12T10:00:00Z",
        completedAt: null,
        triggeredById: "admin-1",
        createdAt: "2026-03-12T10:00:00Z",
        updatedAt: "2026-03-12T10:00:00Z",
      },
      recipientCount: 42,
    });

    vi.mocked(adminApi.pauseCrmCampaign).mockResolvedValue({
      ok: true,
      campaign: { ...mockCampaigns[1], status: "paused" },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  const renderComponent = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <AdminCrmCampaignsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it("renders campaign list page with header, metric cards, and campaign rows", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("کمپین‌های مشتریان (Customer Campaigns)")).toBeDefined();
      expect(screen.getByText("تخفیف ویژه نوروزی")).toBeDefined();
      expect(screen.getByText("اطلاعیه شروع دوره هوش مصنوعی")).toBeDefined();
      expect(screen.getAllByText("پیامک (SMS)").length).toBeGreaterThan(0);
      expect(screen.getAllByText("ایمیل (Email)").length).toBeGreaterThan(0);
      expect(screen.getByText("پیش‌نویس")).toBeDefined();
      expect(screen.getByText("در حال اجرا")).toBeDefined();
    });
  });

  it("opens campaign creation modal with segment selection and recipient preview", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByText("ایجاد کمپین جدید")).toBeDefined();
    });

    fireEvent.click(screen.getByText("ایجاد کمپین جدید"));

    await waitFor(() => {
      expect(screen.getByText("تعریف کمپین جدید")).toBeDefined();
      expect(screen.getByPlaceholderText("مثلاً: تخفیف ویژه بازگشت به تحصیل برای دانشجویان مهندسی")).toBeDefined();
    });

    // Select target segment
    const segmentSelect = screen.getByDisplayValue("-- انتخاب سگمنت هدف --");
    fireEvent.change(segmentSelect, { target: { value: "segment-1" } });

    await waitFor(() => {
      expect(screen.getByText("تعداد مخاطبان پیش‌بینی‌شده سگمنت:")).toBeDefined();
      expect(screen.getAllByText(/۴۲ کاربر/).length).toBeGreaterThanOrEqual(3);
    });
  });

  it("executes a draft campaign when clicking the play button", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTitle("اجرای کمپین")).toBeDefined();
    });

    fireEvent.click(screen.getByTitle("اجرای کمپین"));

    await waitFor(() => {
      expect(adminApi.executeCrmCampaign).toHaveBeenCalledWith("campaign-1");
      expect(screen.getByText(/کمپین با موفقیت راه‌اندازی شد/)).toBeDefined();
    });
  });

  it("pauses a running campaign when clicking the pause button", async () => {
    renderComponent();

    await waitFor(() => {
      expect(screen.getByTitle("توقف موقت کمپین")).toBeDefined();
    });

    fireEvent.click(screen.getByTitle("توقف موقت کمپین"));

    await waitFor(() => {
      expect(adminApi.pauseCrmCampaign).toHaveBeenCalledWith("campaign-2");
      expect(screen.getByText("کمپین متوقف شد.")).toBeDefined();
    });
  });

  it("opens execution and delivery monitoring modal when clicking view button", async () => {
    renderComponent();

    await waitFor(() => {
      const viewButtons = screen.getAllByTitle("مشاهده گزارش و گیرندگان");
      expect(viewButtons.length).toBeGreaterThan(0);
      fireEvent.click(viewButtons[1]); // Click for campaign-2
    });

    await waitFor(() => {
      expect(screen.getByText(/رهگیری اجرا و گزارش تحویل کمپین/)).toBeDefined();
      expect(screen.getByText("سارا احمدی")).toBeDefined();
      expect(screen.getByText("sara@example.com")).toBeDefined();
      expect(screen.getByText("ارسال موفق")).toBeDefined();
    });
  });
});
