import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserSubscriptionPage } from "../UserSubscriptionPage.js";
import { UserPurchasesPage } from "../UserPurchasesPage.js";
import { PricingPage } from "../../PricingPage.js";
import * as useCommerceHooks from "../../../hooks/useCommerce.js";

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

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{ui}</BrowserRouter>
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
  });

  describe("UserSubscriptionPage", () => {
    it("renders active subscription with remaining days and plan title", () => {
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

      expect(screen.getByText("اشتراک من")).toBeDefined();
      expect(screen.getByText("اشتراک ماهانه آوانا")).toBeDefined();
      expect(screen.getAllByText(/روز/).length).toBeGreaterThan(0);
      expect(screen.getByText("تمدید یا ارتقای اشتراک")).toBeDefined();
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
