import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { PricingModal } from "../PricingModal.js";
import { PaywallModal } from "../PaywallModal.js";
import * as useCommerceHooks from "../../../hooks/useCommerce.js";
import * as authProviderHooks from "../../../providers/AuthProvider.js";

// Mock commerce hooks
vi.mock("../../../hooks/useCommerce.js", () => ({
  useCommerceProducts: vi.fn(),
  useCheckout: vi.fn(),
  useMySubscription: vi.fn(),
  useCardToCardInfo: vi.fn(),
  useSubmitCardToCardPayment: vi.fn(),
}));

// Mock auth provider
vi.mock("../../../providers/AuthProvider.js", () => ({
  useAuth: vi.fn(() => ({
    isAuthenticated: true,
    user: { id: "user-1", email: "student@test.com" },
  })),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

const mockProducts = [
  {
    id: "prod-sub-monthly",
    code: "sub_monthly",
    type: "subscription",
    title: "اشتراک ۱ ماهه",
    description: "دسترسی کامل ۱ ماهه",
    price: 99000,
    currency: "toman",
    duration_days: 30,
    active: true,
  },
  {
    id: "prod-sub-yearly",
    code: "sub_yearly",
    type: "subscription",
    title: "اشتراک ۱ ساله",
    description: "دسترسی کامل ۱ ساله",
    price: 599000,
    currency: "toman",
    duration_days: 365,
    active: true,
  },
];

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

describe("PricingModal & PaywallModal Components", () => {
  const mockMutate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = "";

    vi.mocked(authProviderHooks.useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: "user-1", email: "student@test.com" } as any,
    } as any);

    vi.mocked(useCommerceHooks.useCommerceProducts).mockReturnValue({
      data: { items: mockProducts } as any,
      isLoading: false,
    } as any);

    vi.mocked(useCommerceHooks.useCheckout).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    } as any);

    vi.mocked(useCommerceHooks.useMySubscription).mockReturnValue({
      data: { subscription: null } as any,
      isLoading: false,
    } as any);
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  describe("PricingModal", () => {
    it("does not render when isOpen is false", () => {
      renderWithProviders(<PricingModal isOpen={false} onClose={vi.fn()} />);
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("renders into document.body via Portal with high z-index and role=dialog", () => {
      const { baseElement } = renderWithProviders(
        <PricingModal isOpen={true} onClose={vi.fn()} />,
      );

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();
      expect(dialog.getAttribute("aria-modal")).toBe("true");

      // Verify portal renders under document.body directly
      expect(dialog.parentElement).toBe(baseElement);

      // Verify z-index is z-[9999] so it floats above Header (z-50)
      expect(dialog.className).toContain("z-[9999]");
      expect(dialog.className).toContain("fixed");
      expect(dialog.className).toContain("inset-0");

      // Verify title & products are rendered
      expect(screen.getByText("ارتقا به آوانا پلاس (اشتراک ویژه)")).toBeDefined();
      expect(screen.getAllByText("اشتراک ۱ ماهه").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("اشتراک ۱ ساله").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("پرداخت آنلاین و فعال‌سازی")).toBeDefined();
    });

    it("does NOT display destination card number, cardholder name or tracking inputs inside PricingModal", () => {
      renderWithProviders(<PricingModal isOpen={true} onClose={vi.fn()} />);

      // Ensure no card details leaked into modal
      expect(screen.queryByText("5894 6311 3173 8239")).toBeNull();
      expect(screen.queryByText("5894631131738239")).toBeNull();
      expect(screen.queryByText("علی محمدلو")).toBeNull();
      expect(screen.queryByPlaceholderText("مثال: ۱۲۳۴۵۶۷۸۹")).toBeNull();
      expect(screen.queryByPlaceholderText("مثال: ۵۶۷۸")).toBeNull();
    });

    it("locks body overflow when open and restores it when closed", () => {
      const { unmount } = renderWithProviders(
        <PricingModal isOpen={true} onClose={vi.fn()} />,
      );

      expect(document.body.style.overflow).toBe("hidden");

      unmount();
      expect(document.body.style.overflow).toBe("");
    });

    it("calls onClose when close button is clicked", () => {
      const onCloseMock = vi.fn();
      renderWithProviders(<PricingModal isOpen={true} onClose={onCloseMock} />);

      const closeButton = screen.getByLabelText("بستن");
      fireEvent.click(closeButton);

      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it("calls onClose when Escape key is pressed", () => {
      const onCloseMock = vi.fn();
      renderWithProviders(<PricingModal isOpen={true} onClose={onCloseMock} />);

      fireEvent.keyDown(window, { key: "Escape" });
      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });

    it("handles product selection and calls online checkout mutation", () => {
      renderWithProviders(<PricingModal isOpen={true} onClose={vi.fn()} />);

      // Click on monthly product
      const monthlyCard = screen.getAllByText("اشتراک ۱ ماهه")[0];
      fireEvent.click(monthlyCard);

      // Click checkout button
      const checkoutBtn = screen.getByText("پرداخت آنلاین و فعال‌سازی");
      fireEvent.click(checkoutBtn);

      expect(mockMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          product_id: "prod-sub-monthly",
        }),
        expect.any(Object),
      );
    });

    it("allows switching to Card-to-Card and navigates to dedicated Card-to-Card page on Continue", () => {
      renderWithProviders(<PricingModal isOpen={true} onClose={vi.fn()} />);

      // Switch to Card-to-Card tab
      const c2cTab = screen.getByText("کارت‌به‌کارت (فعال‌سازی فوری)");
      fireEvent.click(c2cTab);

      // Select monthly product
      const monthlyCard = screen.getAllByText("اشتراک ۱ ماهه")[0];
      fireEvent.click(monthlyCard);

      // CTA button changes to continue to card-to-card
      const continueBtn = screen.getByText("ادامه جهت پرداخت کارت‌به‌کارت");
      expect(continueBtn).toBeDefined();

      fireEvent.click(continueBtn);

      expect(mockNavigate).toHaveBeenCalledWith(
        "/checkout/card-to-card?productId=prod-sub-monthly",
      );
    });
  });

  describe("PaywallModal", () => {
    it("renders into document.body via Portal and handles transition to PricingModal", () => {
      const onCloseMock = vi.fn();
      renderWithProviders(
        <PaywallModal
          isOpen={true}
          onClose={onCloseMock}
          title="محتوای قفل‌شده دوره"
          resourceTitle="درس اول: مقدمات"
          resourceType="lesson"
        />,
      );

      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeDefined();
      expect(dialog.className).toContain("z-[9999]");
      expect(screen.getByText("محتوای قفل‌شده دوره")).toBeDefined();
      expect(screen.getByText("درس اول: مقدمات")).toBeDefined();

      // Click "مشاهده و خرید اشتراک آوانا پلاس"
      const openPricingBtn = screen.getByText("مشاهده و خرید اشتراک آوانا پلاس");
      fireEvent.click(openPricingBtn);

      // Now PricingModal should be visible
      expect(screen.getByText("ارتقا به آوانا پلاس (اشتراک ویژه)")).toBeDefined();
    });

    it("calls onClose on cancel button in PaywallModal", () => {
      const onCloseMock = vi.fn();
      renderWithProviders(
        <PaywallModal isOpen={true} onClose={onCloseMock} />,
      );

      const cancelBtn = screen.getByText("فعلاً نه، بعداً یادآوری کن");
      fireEvent.click(cancelBtn);

      expect(onCloseMock).toHaveBeenCalledTimes(1);
    });
  });
});
