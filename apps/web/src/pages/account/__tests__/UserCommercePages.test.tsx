import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserSubscriptionPage } from "../UserSubscriptionPage.js";
import { UserPurchasesPage } from "../UserPurchasesPage.js";
import { PricingPage } from "../../PricingPage.js";
import * as useCommerceHooks from "../../../hooks/useCommerce.js";
import * as useWalletHooks from "../../../hooks/useWallet.js";

// Mock hooks
vi.mock("../../../hooks/useCommerce.js", () => ({
  useMySubscription: vi.fn(),
  useMyEntitlements: vi.fn(),
  useMyOrders: vi.fn(),
  useCommerceProducts: vi.fn(),
  useCheckout: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useVerifyPayment: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useCardToCardInfo: vi.fn(() => ({ data: { enabled: true, destinationCardNumber: "6037-9918-1234-5678" }, isLoading: false })),
  useSubmitCardToCardPayment: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock("../../../hooks/useWallet.js", () => ({
  useMyWallet: vi.fn(),
  useMyWalletTransactions: vi.fn(),
  useMyWalletTopups: vi.fn(),
}));

function renderWithProviders(ui: React.ReactElement, initialEntries = ["/"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("UserCommercePages", () => {
  const mockProducts = [
    {
      id: "prod-sub-monthly",
      code: "sub_monthly",
      type: "subscription",
      title: "اشتراک ماهانه آوانا",
      description: "دسترسی ۱ ماهه به تمام امکانات",
      price: 99000,
      currency: "toman",
      target_type: "plan",
      target_id: "monthly",
      duration_days: 30,
      active: true,
    },
    {
      id: "prod-sub-yearly",
      code: "sub_yearly",
      type: "subscription",
      title: "اشتراک سالانه آوانا",
      description: "دسترسی ۱ ساله به تمام امکانات با ۵۰٪ تخفیف",
      price: 599000,
      currency: "toman",
      target_type: "plan",
      target_id: "yearly",
      duration_days: 365,
      active: true,
    },
    {
      id: "prod-course-cardio",
      code: "prod_course_cardio",
      type: "course",
      title: "دوره فیزیولوژی قلب",
      description: "دسترسی مادام‌العمر به مباحث قلب",
      price: 350000,
      currency: "toman",
      target_type: "course",
      target_id: "course-123",
      duration_days: null,
      active: true,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useCommerceHooks.useCommerceProducts).mockReturnValue({
      data: { items: mockProducts } as any,
      isLoading: false,
    } as any);

    vi.mocked(useCommerceHooks.useMyOrders).mockReturnValue({
      data: { items: [] },
      isLoading: false,
      refetch: vi.fn(),
    } as any);

    vi.mocked(useCommerceHooks.useMyEntitlements).mockReturnValue({
      data: { items: [] },
      isLoading: false,
      refetch: vi.fn(),
    } as any);

    vi.mocked(useWalletHooks.useMyWallet).mockReturnValue({
      data: {
        balance: 25000,
        currency: "toman",
        formatted_balance: "۲۵٬۰۰۰ تومان",
      },
      isLoading: false,
      refetch: vi.fn(),
    } as any);

    vi.mocked(useWalletHooks.useMyWalletTransactions).mockReturnValue({
      data: { transactions: [], total: 0 },
      isLoading: false,
      refetch: vi.fn(),
    } as any);

    vi.mocked(useWalletHooks.useMyWalletTopups).mockReturnValue({
      data: { topups: [] },
      isLoading: false,
      refetch: vi.fn(),
    } as any);
  });

  describe("UserSubscriptionPage", () => {
    it("renders active subscription with summary cards and tabs", () => {
      const futureExpiry = new Date(Date.now() + 20 * 86400000).toISOString();
      const pastStart = new Date(Date.now() - 10 * 86400000).toISOString();

      vi.mocked(useCommerceHooks.useMySubscription).mockReturnValue({
        data: {
          subscription: {
            id: "sub-1",
            product_id: "prod-sub-monthly",
            status: "active",
            started_at: pastStart,
            expires_at: futureExpiry,
          },
        } as any,
        isLoading: false,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<UserSubscriptionPage />);

      // Unified Header
      expect(screen.getByText("اشتراک و امور مالی")).toBeDefined();
      expect(screen.getByText("مرکز یکپارچه حساب کاربری")).toBeDefined();

      // Top Summary Cards
      expect(screen.getByText("وضعیت اشتراک")).toBeDefined();
      expect(screen.getByText("موجودی کیف پول")).toBeDefined();
      expect(screen.getAllByText(/۲۵[٬,]۰۰۰/).length).toBeGreaterThan(0);
      expect(screen.getByText("۰ سفارش ثبت‌شده")).toBeDefined();
      expect(screen.getByText("تومان")).toBeDefined();
      expect(screen.queryByText("Credit")).toBeNull();
      expect(screen.queryByText(/هر ۱ Credit/)).toBeNull();

      // Subscription Tab Details
      expect(screen.getAllByText("اشتراک ماهانه آوانا").length).toBeGreaterThan(0);
      expect(screen.getAllByText(/روز/).length).toBeGreaterThan(0);
      expect(screen.getAllByText("تمدید یا ارتقای اشتراک").length).toBeGreaterThan(0);

      // Remaining time elements with high contrast teal classes
      const remainingElements = screen.getAllByText(/باقی‌مانده/);
      expect(remainingElements.length).toBe(2);
      const heroPill = remainingElements[1].closest("div");
      expect(heroPill?.className).toContain("text-teal-800");
      expect(heroPill?.className).toContain("bg-teal-50");
      expect(heroPill?.className).toContain("dark:text-teal-200");
      expect(remainingElements[0].className).toContain("text-teal-800");

      // Tabs
      expect(screen.getByRole("button", { name: /^اشتراک$/ })).toBeDefined();
      expect(screen.getByRole("button", { name: /^کیف پول/ })).toBeDefined();
      expect(screen.getByRole("button", { name: /^فاکتورها و خریدها/ })).toBeDefined();
    });

    it("renders empty state when user has no active subscription", () => {
      vi.mocked(useCommerceHooks.useMySubscription).mockReturnValue({
        data: { subscription: null } as any,
        isLoading: false,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<UserSubscriptionPage />);

      expect(screen.getByText("شما در حال حاضر اشتراک فعالی ندارید")).toBeDefined();
      expect(screen.getByText("مشاهده و انتخاب پلن اشتراک")).toBeDefined();
      expect(screen.getAllByText("بدون اشتراک").length).toBeGreaterThan(0);
    });

    it("supports switching to wallet tab and purchases tab", () => {
      vi.mocked(useCommerceHooks.useMySubscription).mockReturnValue({
        data: { subscription: null } as any,
        isLoading: false,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<UserSubscriptionPage />);

      // Click on Wallet tab
      const walletTabBtn = screen.getByRole("button", { name: /^کیف پول/ });
      fireEvent.click(walletTabBtn);

      // Wallet embedded content should be visible
      expect(screen.getByText("تاریخچه تراکنش‌ها")).toBeDefined();

      // Click on Purchases tab
      const purchasesTabBtn = screen.getByRole("button", { name: /^فاکتورها و خریدها/ });
      fireEvent.click(purchasesTabBtn);

      // Purchases embedded content should be visible
      expect(screen.getByText("محتوای خریداری‌شده")).toBeDefined();
    });

    it("supports direct deep linking via query string (?tab=wallet)", () => {
      vi.mocked(useCommerceHooks.useMySubscription).mockReturnValue({
        data: { subscription: null } as any,
        isLoading: false,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<UserSubscriptionPage />, ["/account/subscription?tab=wallet"]);

      expect(screen.getByText("تاریخچه تراکنش‌ها")).toBeDefined();
    });

    it("falls back to subscription tab when query string tab is invalid", () => {
      vi.mocked(useCommerceHooks.useMySubscription).mockReturnValue({
        data: { subscription: null } as any,
        isLoading: false,
        refetch: vi.fn(),
      } as any);

      renderWithProviders(<UserSubscriptionPage />, ["/account/subscription?tab=invalid_xyz"]);

      expect(screen.getByText("شما در حال حاضر اشتراک فعالی ندارید")).toBeDefined();
    });
  });

  describe("UserPurchasesPage", () => {
    it("renders purchased entitlements and order history tabs", () => {
      vi.mocked(useCommerceHooks.useMyEntitlements).mockReturnValue({
        data: {
          items: [
            {
              id: "ent-1",
              resource_type: "course",
              resource_id: "course-123",
              source_type: "purchase",
              starts_at: "2026-08-01T00:00:00Z",
              expires_at: null,
            },
          ],
        } as any,
        isLoading: false,
      } as any);

      vi.mocked(useCommerceHooks.useMyOrders).mockReturnValue({
        data: {
          items: [
            {
              id: "ord-1",
              order_number: "ORD-20260901-001",
              product_id: "prod-course-cardio",
              amount: 350000,
              currency: "toman",
              status: "paid",
              created_at: "2026-08-01T00:00:00Z",
              updated_at: "2026-08-01T00:00:00Z",
            },
          ],
        } as any,
        isLoading: false,
      } as any);

      vi.mocked(useCommerceHooks.useMySubscription).mockReturnValue({
        data: { subscription: null } as any,
        isLoading: false,
      } as any);

      renderWithProviders(<UserPurchasesPage />);

      expect(screen.getByText("خریدهای من و تاریخچه سفارش‌ها")).toBeDefined();
      expect(screen.getByText("محتوای خریداری‌شده")).toBeDefined();
      expect(screen.getByText("سفارش‌ها و فاکتورها")).toBeDefined();
      expect(screen.getByText("دوره فیزیولوژی قلب")).toBeDefined();
      expect(screen.getByText("ورود به دوره")).toBeDefined();
    });
  });

  describe("PricingPage", () => {
    it("renders subscription plans from dynamic products list", () => {
      vi.mocked(useCommerceHooks.useMySubscription).mockReturnValue({
        data: { subscription: null } as any,
        isLoading: false,
      } as any);

      renderWithProviders(<PricingPage />);

      expect(screen.getByText("پلن‌های اشتراک آوانا پلاس")).toBeDefined();
      expect(screen.getByText("اشتراک ماهانه آوانا")).toBeDefined();
      expect(screen.getByText("اشتراک سالانه آوانا")).toBeDefined();
      expect(screen.getAllByText("خرید و فعال‌سازی آنی").length).toBeGreaterThan(0);
    });
  });
});
