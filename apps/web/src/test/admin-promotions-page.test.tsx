import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminPromotionsPage } from "../pages/admin/commerce/AdminPromotionsPage.js";
import { useAdmin } from "../hooks/useAdmin.js";

vi.mock("../hooks/useAdmin.js", () => ({
  useAdmin: vi.fn(),
}));

describe("Admin Promotions & Discounts Management Suite", () => {
  const mockAdminApi = {
    listCommercePromotions: vi.fn(),
    getCommercePromotion: vi.fn(),
    createCommercePromotion: vi.fn(),
    updateCommercePromotion: vi.fn(),
    toggleCommercePromotionActive: vi.fn(),
    deleteCommercePromotion: vi.fn(),
    bulkGenerateCommercePromotionCodes: vi.fn(),
    listCommercePromotionRedemptions: vi.fn(),
  };

  const samplePromo = {
    id: "promo-uuid-1",
    name: "تخفیف ویژه نوروز",
    description: "جشنواره عیدانه برای همه کاربران",
    benefitType: "percentage_discount" as const,
    benefitValue: 25,
    maxDiscountAmount: 150000,
    minOrderAmount: 200000,
    totalUsageLimit: 1000,
    perUserUsageLimit: 1,
    active: true,
    startsAt: "2026-03-20T00:00:00.000Z",
    endsAt: "2026-04-05T23:59:59.999Z",
    codesCount: 1,
    primaryCode: "NOWRUZ25",
    totalRedemptions: 12,
    totalDiscountGranted: 300000,
    totalCashbackGranted: 0,
    createdAt: "2026-03-01T12:00:00.000Z",
  };

  const samplePromoDetail = {
    ...samplePromo,
    codes: [
      {
        id: "code-uuid-1",
        code: "NOWRUZ25",
        maxUses: null,
        timesUsed: 12,
        active: true,
        createdAt: "2026-03-01T12:00:00.000Z",
      },
    ],
    productRestrictions: [
      {
        id: "pr-1",
        productId: null,
        productType: "subscription",
      },
    ],
    userRestrictions: [],
    stats: {
      totalRedemptions: 12,
      completedRedemptions: 12,
      pendingRedemptions: 0,
      totalDiscountGranted: 300000,
      totalCashbackGranted: 0,
      remainingUsage: 988,
    },
    metadata: {},
    updatedAt: "2026-03-01T12:00:00.000Z",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAdmin).mockReturnValue(mockAdminApi as unknown as ReturnType<typeof useAdmin>);

    mockAdminApi.listCommercePromotions.mockResolvedValue({
      items: [samplePromo],
      promotions: [samplePromo],
      totalCount: 1,
    });

    mockAdminApi.getCommercePromotion.mockResolvedValue(samplePromoDetail);

    mockAdminApi.listCommercePromotionRedemptions.mockResolvedValue({
      items: [
        {
          id: "red-1",
          userId: "user-1",
          userName: "سارا رضایی",
          userEmail: "sara@example.com",
          orderId: "order-1",
          orderNumber: "ORD-1001",
          code: "NOWRUZ25",
          benefitType: "percentage_discount",
          benefitValue: 25,
          discountAmount: 50000,
          cashbackAmount: 0,
          orderOriginalAmount: 200000,
          orderFinalAmount: 150000,
          status: "completed",
          redeemedAt: "2026-03-22T10:00:00.000Z",
          completedAt: "2026-03-22T10:05:00.000Z",
        },
      ],
      redemptions: [],
      totalCount: 1,
    });

    mockAdminApi.toggleCommercePromotionActive.mockResolvedValue({
      ...samplePromoDetail,
      active: false,
    });

    mockAdminApi.deleteCommercePromotion.mockResolvedValue({ success: true });
    mockAdminApi.createCommercePromotion.mockResolvedValue(samplePromoDetail);
    mockAdminApi.updateCommercePromotion.mockResolvedValue(samplePromoDetail);
    mockAdminApi.bulkGenerateCommercePromotionCodes.mockResolvedValue({
      codes: ["NOWRUZ-ABC1", "NOWRUZ-ABC2"],
      count: 2,
    });

    vi.spyOn(window, "confirm").mockImplementation(() => true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  test("1. Renders promotion list, stats cards, and action buttons", async () => {
    render(
      <MemoryRouter>
        <AdminPromotionsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("تخفیف ویژه نوروز")).toBeInTheDocument();
    });

    // Check code and badge
    expect(screen.getByText("NOWRUZ25")).toBeInTheDocument();
    expect(screen.getByText(/تخفیف ۲۵٪/)).toBeInTheDocument();

    // Verify stats were fetched
    expect(mockAdminApi.listCommercePromotions).toHaveBeenCalledWith({ pageSize: 100 });
    expect(mockAdminApi.listCommercePromotionRedemptions).toHaveBeenCalledWith({ limit: 500 });
  });

  test("2. Toggles promotion active status and updates UI", async () => {
    render(
      <MemoryRouter>
        <AdminPromotionsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("فعال")).toBeInTheDocument();
    });

    const toggleBtn = screen.getByText("فعال").closest("button");
    expect(toggleBtn).not.toBeNull();
    fireEvent.click(toggleBtn!);

    await waitFor(() => {
      expect(mockAdminApi.toggleCommercePromotionActive).toHaveBeenCalledWith("promo-uuid-1", false);
    });
  });

  test("3. Opens details modal with overview, codes, and timesUsed", async () => {
    render(
      <MemoryRouter>
        <AdminPromotionsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("تخفیف ویژه نوروز")).toBeInTheDocument();
    });

    const viewDetailBtn = screen.getByTitle("مشاهده جزئیات و تاریخچه");
    fireEvent.click(viewDetailBtn);

    await waitFor(() => {
      expect(mockAdminApi.getCommercePromotion).toHaveBeenCalledWith("promo-uuid-1");
    });

    // Overview tab content
    await waitFor(() => {
      expect(screen.getByText("جشنواره عیدانه برای همه کاربران")).toBeInTheDocument();
    });

    // Switch to Codes tab
    const codesTabBtn = screen.getByText(/کدهای کوپن/);
    fireEvent.click(codesTabBtn);

    await waitFor(() => {
      expect(screen.getAllByText("NOWRUZ25").length).toBeGreaterThanOrEqual(1);
      // timesUsed displayed as Persian digits (۱۲)
      expect(screen.getByText("۱۲")).toBeInTheDocument();
    });
  });

  test("4. Opens edit modal with prefilled data and submits updates with target ID", async () => {
    render(
      <MemoryRouter>
        <AdminPromotionsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("تخفیف ویژه نوروز")).toBeInTheDocument();
    });

    const editBtn = screen.getByTitle("ویرایش");
    fireEvent.click(editBtn);

    await waitFor(() => {
      expect(mockAdminApi.getCommercePromotion).toHaveBeenCalledWith("promo-uuid-1");
    });

    // Form modal should be open and populated
    await waitFor(() => {
      expect(screen.getByDisplayValue("تخفیف ویژه نوروز")).toBeInTheDocument();
    });
    const nameInput = screen.getByDisplayValue("تخفیف ویژه نوروز");

    // Change name
    fireEvent.change(nameInput, { target: { value: "تخفیف نوروز ویرایش‌شده" } });

    // Submit form
    const saveBtn = screen.getByText("ذخیره تغییرات");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockAdminApi.updateCommercePromotion).toHaveBeenCalledWith(
        "promo-uuid-1",
        expect.objectContaining({
          name: "تخفیف نوروز ویرایش‌شده",
          benefitType: "percentage_discount",
          benefitValue: 25,
        }),
      );
    });
  });

  test("5. Opens bulk generate modal, submits generation, and renders generated codes", async () => {
    render(
      <MemoryRouter>
        <AdminPromotionsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("تخفیف ویژه نوروز")).toBeInTheDocument();
    });

    const bulkBtn = screen.getByTitle("تولید کدهای دسته‌ای");
    fireEvent.click(bulkBtn);

    await waitFor(() => {
      expect(screen.getByText("تولید انبوه کدهای تخفیف")).toBeInTheDocument();
    });

    const submitBtn = screen.getByText(/تولید ۵۰ کد تخفیف/);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAdminApi.bulkGenerateCommercePromotionCodes).toHaveBeenCalledWith(
        "promo-uuid-1",
        expect.objectContaining({
          count: 50,
        }),
      );
    });

    // Generated codes view
    await waitFor(() => {
      expect(screen.getByText("کپی همه کدها")).toBeInTheDocument();
      expect(screen.getByText("دانلود فایل متنی (TXT)")).toBeInTheDocument();
    });
  });

  test("6. Confirms and deletes promotion, updating the list", async () => {
    render(
      <MemoryRouter>
        <AdminPromotionsPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText("تخفیف ویژه نوروز")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByTitle("حذف پروموشن");
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mockAdminApi.deleteCommercePromotion).toHaveBeenCalledWith("promo-uuid-1");
    });
  });
});
