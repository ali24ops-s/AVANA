import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminCommerceDashboardPage } from "../pages/admin/commerce/AdminCommerceDashboardPage.js";
import { AdminOrdersPage } from "../pages/admin/commerce/AdminOrdersPage.js";
import { AdminPaymentsPage } from "../pages/admin/commerce/AdminPaymentsPage.js";
import { AdminSubscriptionsPage } from "../pages/admin/commerce/AdminSubscriptionsPage.js";
import { AdminEntitlementsPage } from "../pages/admin/commerce/AdminEntitlementsPage.js";
import { AdminProductsPage } from "../pages/admin/commerce/AdminProductsPage.js";
import { AdminProductEditModal } from "../components/admin/commerce/AdminProductEditModal.js";
import { AdminCancelSubscriptionModal } from "../components/admin/commerce/AdminCancelSubscriptionModal.js";
import { UserCommerceDrawer } from "../components/admin/commerce/UserCommerceDrawer.js";
import { formatToman } from "../components/admin/commerce/commerceUtils.js";
import { useAdmin } from "../hooks/useAdmin.js";

vi.mock("../hooks/useAdmin.js", () => ({
  useAdmin: vi.fn(),
}));

describe("Admin Commerce & Monetization Frontend Suite", () => {
  const mockAdminApi = {
    getCommerceStats: vi.fn(),
    listCommerceOrders: vi.fn(),
    listCommercePayments: vi.fn(),
    listCommerceSubscriptions: vi.fn(),
    listCommerceEntitlements: vi.fn(),
    listCommerceProducts: vi.fn(),
    updateCommerceProduct: vi.fn(),
    grantCommerceEntitlement: vi.fn(),
    cancelCommerceSubscription: vi.fn(),
    getUserCommerceProfile: vi.fn(),
    listCourses: vi.fn(),
    listUsers: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAdmin).mockReturnValue(mockAdminApi as any);
    mockAdminApi.listCourses.mockResolvedValue({ courses: [], totalCount: 0 });
    mockAdminApi.listCommerceProducts.mockResolvedValue({ products: [] });
    mockAdminApi.listUsers.mockResolvedValue({ users: [], totalCount: 0 });
    mockAdminApi.listCommerceOrders.mockResolvedValue({ orders: [], totalCount: 0 });
    mockAdminApi.listCommercePayments.mockResolvedValue({ payments: [], totalCount: 0 });
    mockAdminApi.listCommerceSubscriptions.mockResolvedValue({ subscriptions: [], totalCount: 0 });
    mockAdminApi.listCommerceEntitlements.mockResolvedValue({ entitlements: [], totalCount: 0 });
  });

  afterEach(() => {
    cleanup();
  });

  test("1. AdminCommerceDashboardPage renders KPI metrics and revenue breakdown", async () => {
    mockAdminApi.getCommerceStats.mockResolvedValue({
      totalRevenue: 2500000,
      todayRevenue: 298000,
      currentMonthRevenue: 1200000,
      successfulOrders: 18,
      activeSubscriptions: 12,
      lifetimePurchases: 6,
      subscriptionRevenue: 1500000,
      courseRevenue: 700000,
      contentPackRevenue: 300000,
      pendingOrders: 2,
      failedPayments: 1,
    });

    render(
      <MemoryRouter>
        <AdminCommerceDashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByText("داشبورد فروش و درآمد آوانا")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("۲٬۵۰۰٬۰۰۰ تومان")).toBeDefined();
      expect(screen.getByText("۱٬۲۰۰٬۰۰۰ تومان")).toBeDefined();
      expect(screen.getByText("درآمد اشتراک‌ها")).toBeDefined();
      expect(screen.getByText("درآمد فروش دوره‌ها")).toBeDefined();
    });
  });

  test("2. AdminOrdersPage renders order table with Persian badges", async () => {
    mockAdminApi.listCommerceOrders.mockResolvedValue({
      orders: [
        {
          id: "ord-1",
          orderNumber: "ORD-2026-99",
          userId: "user-1",
          userEmail: "student@test.com",
          productId: "prod-1",
          productTitle: "اشتراک ماهانه آوانا",
          productType: "subscription",
          amount: 99000,
          currency: "toman",
          status: "paid",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          paymentStatus: "paid",
          paymentGateway: "zarinpal",
        },
      ],
      totalCount: 1,
    });

    render(
      <MemoryRouter>
        <AdminOrdersPage />
      </MemoryRouter>
    );

    expect(screen.getByText("مدیریت سفارش‌ها (Orders)")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("ORD-2026-99")).toBeDefined();
      expect(screen.getAllByText("student@test.com").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("۹۹٬۰۰۰ تومان")).toBeDefined();
      expect(screen.getAllByText("پرداخت شده").length).toBeGreaterThanOrEqual(1);
    });
  });

  test("3. AdminEntitlementsPage renders lifetime access badges", async () => {
    mockAdminApi.listCommerceEntitlements.mockResolvedValue({
      entitlements: [
        {
          id: "ent-1",
          userId: "user-1",
          userEmail: "physician@test.com",
          resourceType: "course",
          resourceId: "course-cardio",
          resourceTitle: "فیزیولوژی پزشکی قلب",
          sourceType: "admin_grant",
          orderId: null,
          startsAt: new Date().toISOString(),
          expiresAt: null,
          lifetime: true,
          active: true,
          createdAt: new Date().toISOString(),
        },
      ],
      totalCount: 1,
    });

    render(
      <MemoryRouter>
        <AdminEntitlementsPage />
      </MemoryRouter>
    );

    expect(screen.getByText("دفتر کل حقوق دسترسی (User Entitlements)")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("فیزیولوژی پزشکی قلب")).toBeDefined();
      expect(screen.getAllByText("اعطای ادمین").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("دائمی / مادام‌العمر").length).toBeGreaterThanOrEqual(1);
    });
  });

  test("4. AdminProductsPage displays subscription products and handles edit modal", async () => {
    const subProduct = {
      id: "prod-sub-1",
      code: "sub_monthly",
      type: "subscription",
      title: "اشتراک ماهانه آوانا",
      description: "توضیحات",
      price: 99000,
      currency: "toman",
      targetType: "plan",
      targetId: null,
      durationDays: 30,
      active: true,
      createdAt: new Date().toISOString(),
    };

    mockAdminApi.listCommerceProducts.mockResolvedValue({
      products: [subProduct],
    });

    render(
      <MemoryRouter>
        <AdminProductsPage />
      </MemoryRouter>
    );

    expect(screen.getByText("کاتالوگ و قیمت‌گذاری محصولات (Products Catalog)")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("اشتراک ماهانه آوانا")).toBeDefined();
      expect(screen.getByText(formatToman(99000))).toBeDefined();
    });
  });

  test("5. AdminProductEditModal allows editing subscription price and submits new price", async () => {
    const subProduct = {
      id: "prod-sub-1",
      code: "sub_monthly",
      type: "subscription",
      title: "اشتراک ماهانه آوانا",
      description: "توضیحات",
      price: 99000,
      currency: "toman",
      targetType: "plan",
      targetId: null,
      durationDays: 30,
      active: true,
      createdAt: new Date().toISOString(),
    };

    mockAdminApi.updateCommerceProduct.mockResolvedValue({
      success: true,
      product: { ...subProduct, price: 129000 },
    });

    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(
      <AdminProductEditModal
        isOpen={true}
        product={subProduct}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    );

    expect(screen.getByText("ویرایش محصول کاتالوگ")).toBeDefined();
    expect(screen.queryByText("محافظت‌شده")).toBeNull();

    // Check that the input exists with the initial price
    const priceInput = screen.getByRole("spinbutton") as HTMLInputElement;
    expect(priceInput).toBeDefined();
    expect(priceInput.value).toBe("99000");

    // Change price
    fireEvent.change(priceInput, { target: { value: "129000" } });
    expect(priceInput.value).toBe("129000");

    // Submit form
    const submitBtn = screen.getByRole("button", { name: "ذخیره تغییرات" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAdminApi.updateCommerceProduct).toHaveBeenCalledWith(
        "prod-sub-1",
        {
          active: true,
          price: 129000,
        }
      );
    });
  });

  test("6. UserCommerceDrawer displays user financial profile and entitlements", async () => {
    mockAdminApi.getUserCommerceProfile.mockResolvedValue({
      user: { id: "u-123", email: "learner@test.com", name: "علی صادقی" },
      activeSubscription: {
        id: "sub-1",
        userId: "u-123",
        userEmail: "learner@test.com",
        productId: "p-sub",
        productTitle: "اشتراک سه‌ماهه آوانا",
        plan: "sub_quarterly",
        status: "active",
        startedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60 * 86400000).toISOString(),
        orderId: "ord-1",
        createdAt: new Date().toISOString(),
      },
      subscriptionHistory: [],
      lifetimePurchases: [
        {
          id: "ent-life-1",
          userId: "u-123",
          userEmail: "learner@test.com",
          resourceType: "course",
          resourceId: "c-100",
          resourceTitle: "دوره جامع بافت‌شناسی",
          sourceType: "purchase",
          orderId: "ord-2",
          startsAt: new Date().toISOString(),
          expiresAt: null,
          lifetime: true,
          active: true,
          createdAt: new Date().toISOString(),
        },
      ],
      entitlements: [],
      orders: [],
      payments: [],
    });

    render(
      <UserCommerceDrawer
        isOpen={true}
        userId="u-123"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("پرونده مالی و دسترسی کاربر")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("اشتراک سه‌ماهه آوانا")).toBeDefined();
      expect(screen.getByText("دوره جامع بافت‌شناسی")).toBeDefined();
      expect(screen.getByText("اشتراک فعال")).toBeDefined();
      expect(screen.getByText("لغو اشتراک")).toBeDefined();
    });
  });

  test("7. AdminSubscriptionsPage renders 'لغو اشتراک' button only for active subscriptions", async () => {
    mockAdminApi.listCommerceSubscriptions.mockResolvedValue({
      subscriptions: [
        {
          id: "sub-act-1",
          userId: "u-1",
          userName: "کاربر فعال",
          userEmail: "active@test.com",
          productId: "p-1",
          productTitle: "اشتراک ماهانه آوانا",
          plan: "sub_monthly",
          status: "active",
          startedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 20 * 86400000).toISOString(),
          orderId: "ord-1",
          createdAt: new Date().toISOString(),
        },
        {
          id: "sub-exp-2",
          userId: "u-2",
          userName: "کاربر منقضی",
          userEmail: "expired@test.com",
          productId: "p-1",
          productTitle: "اشتراک ماهانه آوانا",
          plan: "sub_monthly",
          status: "expired",
          startedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
          expiresAt: new Date(Date.now() - 30 * 86400000).toISOString(),
          orderId: "ord-2",
          createdAt: new Date().toISOString(),
        },
        {
          id: "sub-can-3",
          userId: "u-3",
          userName: "کاربر لغوشده",
          userEmail: "cancelled@test.com",
          productId: "p-1",
          productTitle: "اشتراک ماهانه آوانا",
          plan: "sub_monthly",
          status: "cancelled",
          startedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
          expiresAt: new Date().toISOString(),
          orderId: "ord-3",
          createdAt: new Date().toISOString(),
        },
      ],
      totalCount: 3,
    });

    render(
      <MemoryRouter>
        <AdminSubscriptionsPage />
      </MemoryRouter>
    );

    expect(screen.getByText("اشتراک‌های کاربران (User Subscriptions)")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("کاربر فعال")).toBeDefined();
      expect(screen.getByText("کاربر منقضی")).toBeDefined();
      expect(screen.getByText("کاربر لغوشده")).toBeDefined();
      expect(screen.getAllByRole("button", { name: /لغو اشتراک/i }).length).toBe(1);
    });
  });

  test("8. AdminCancelSubscriptionModal submits cancellation with reason and triggers callback", async () => {
    mockAdminApi.cancelCommerceSubscription.mockResolvedValue({
      success: true,
      subscription: {
        id: "sub-1",
        userId: "u-1",
        userEmail: "user@test.com",
        productId: "p-1",
        productTitle: "اشتراک ماهانه آوانا",
        plan: "sub_monthly",
        status: "cancelled",
        startedAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        orderId: null,
        createdAt: new Date().toISOString(),
      },
    });

    const handleSuccess = vi.fn();
    const handleClose = vi.fn();

    render(
      <AdminCancelSubscriptionModal
        isOpen={true}
        subscription={{
          id: "sub-1",
          userId: "u-1",
          userEmail: "user@test.com",
          productId: "p-1",
          productTitle: "اشتراک ماهانه آوانا",
          plan: "sub_monthly",
          status: "active",
          startedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 15 * 86400000).toISOString(),
          orderId: null,
          createdAt: new Date().toISOString(),
        }}
        onClose={handleClose}
        onSuccess={handleSuccess}
      />
    );

    expect(screen.getByText("تأیید لغو اشتراک کاربر")).toBeDefined();
    expect(screen.getByText(/با لغو اشتراک، دسترسی کاربر به مزایای اشتراک بلافاصله قطع می‌شود/)).toBeDefined();
    expect(screen.getByText("user@test.com")).toBeDefined();

    // Type reason
    const reasonInput = screen.getByPlaceholderText(/مثال: درخواست بازگشت وجه کاربر/i);
    fireEvent.change(reasonInput, { target: { value: "درخواست بازگشت وجه کاربر" } });

    // Click submit
    const submitBtn = screen.getByRole("button", { name: "لغو اشتراک و قطع دسترسی" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAdminApi.cancelCommerceSubscription).toHaveBeenCalledWith(
        "sub-1",
        "درخواست بازگشت وجه کاربر"
      );
      expect(handleSuccess).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });
  });

  test("9. AdminPaymentsPage renders Card-to-Card pending payments and handles Approve and Reject flows", async () => {
    mockAdminApi.approveCommercePayment = vi.fn().mockResolvedValue({ success: true });
    mockAdminApi.rejectCommercePayment = vi.fn().mockResolvedValue({ success: true });

    mockAdminApi.listCommercePayments.mockResolvedValue({
      payments: [
        {
          id: "pay-c2c-1",
          orderId: "ord-1",
          orderNumber: "ORD-C2C-100",
          userId: "user-1",
          userName: "دانشجوی متقاضی",
          userEmail: "c2cuser@test.com",
          productTitle: "اشتراک ۱ ماهه",
          amount: 99000,
          currency: "toman",
          gateway: "card_to_card",
          authority: null,
          transactionId: "TRK-998877",
          status: "pending_admin_review",
          trackingNumber: "TRK-998877",
          sourceCardLast4: "5555",
          payerName: "علی رضایی",
          receiptUrl: "https://example.com/receipt.jpg",
          initialValidationResult: { valid: true },
          rejectionReason: null,
          reviewedAt: null,
          reviewedBy: null,
          paidAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
      ],
      totalCount: 1,
    });

    render(
      <MemoryRouter>
        <AdminPaymentsPage />
      </MemoryRouter>
    );

    expect(screen.getByText("تراکنش‌ها و پرداخت‌ها (Payments & Gateways)")).toBeDefined();

    // Verify c2c row items
    await waitFor(() => {
      expect(screen.getByText("TRK-998877")).toBeDefined();
      expect(screen.getByText("کارت‌به‌کارت")).toBeDefined();
      expect(screen.getByText("****-5555")).toBeDefined();
      expect(screen.getByText("علی رضایی")).toBeDefined();
      expect(screen.getByText("تأیید")).toBeDefined();
      expect(screen.getByText("رد")).toBeDefined();
    });

    // Test Approve Flow
    fireEvent.click(screen.getByText("تأیید"));
    expect(screen.getByText("تأیید پرداخت کارت‌به‌کارت")).toBeDefined();
    fireEvent.click(screen.getByText("بله، تأیید و نهایی‌سازی"));

    await waitFor(() => {
      expect(mockAdminApi.approveCommercePayment).toHaveBeenCalledWith("pay-c2c-1");
    });

    // Test Reject Flow
    fireEvent.click(screen.getByText("رد"));
    expect(screen.getByText("رد پرداخت کارت‌به‌کارت")).toBeDefined();

    const reasonInput = screen.getByPlaceholderText(/مثال: فیش واریزی نامعتبر است/i);
    fireEvent.change(reasonInput, { target: { value: "فیش واریزی در حساب بانکی مطابقت ندارد." } });

    fireEvent.click(screen.getByText("رد پرداخت و لغو دسترسی"));

    await waitFor(() => {
      expect(mockAdminApi.rejectCommercePayment).toHaveBeenCalledWith(
        "pay-c2c-1",
        "فیش واریزی در حساب بانکی مطابقت ندارد."
      );
    });
  });
});
