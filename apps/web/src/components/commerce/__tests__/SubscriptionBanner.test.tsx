import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { SubscriptionBanner } from "../SubscriptionBanner.js";
import * as useCommerceHooks from "../../../hooks/useCommerce.js";
import type { UseQueryResult } from "@tanstack/react-query";
import type { UserSubscriptionResponse, CommerceProductListResponse } from "@avana/contracts";

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

describe("SubscriptionBanner", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    vi.mocked(useCommerceHooks.useCommerceProducts).mockReturnValue({
      data: {
        items: [
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
        ],
        total: 1,
      },
      isLoading: false,
    } as unknown as UseQueryResult<CommerceProductListResponse, Error>);

    vi.mocked(useCommerceHooks.useMySubscription).mockReturnValue({
      data: null,
      isLoading: false,
    } as unknown as UseQueryResult<UserSubscriptionResponse, Error>);
  });

  const renderBanner = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <SubscriptionBanner {...props} />
        </BrowserRouter>
      </QueryClientProvider>
    );
  };

  it("renders card variant correctly with title, features, and CTA", () => {
    renderBanner();

    expect(screen.queryByText("فرصت ویژه یادگیری")).not.toBeInTheDocument();
    expect(screen.getByText("دسترسی کامل به مسیر یادگیری AVANA")).toBeInTheDocument();
    expect(screen.getByText("همه دوره‌ها")).toBeInTheDocument();
    expect(screen.getByText("فلش‌کارت و آزمون")).toBeInTheDocument();
    expect(screen.getByText("دستیار هوشمند")).toBeInTheDocument();

    const ctaButton = screen.getByRole("button", { name: /مشاهده پلن‌ها و خرید/i });
    expect(ctaButton).toBeInTheDocument();
  });

  it("opens PricingModal when CTA button is clicked", () => {
    renderBanner();

    const ctaButton = screen.getByRole("button", { name: /مشاهده پلن‌ها و خرید/i });
    fireEvent.click(ctaButton);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not render banner if user already has an active subscription", () => {
    vi.mocked(useCommerceHooks.useMySubscription).mockReturnValue({
      data: {
        subscription: {
          id: "sub-1",
          status: "active",
          expires_at: "2027-01-01T00:00:00Z",
        },
      },
      isLoading: false,
    } as unknown as UseQueryResult<UserSubscriptionResponse, Error>);

    const { container } = renderBanner();
    expect(container.firstChild).toBeNull();
  });

  it("renders compact variant properly", () => {
    renderBanner({ variant: "compact" });

    expect(
      screen.getByText(/مسیر یادگیریت را با اشتراک آوانا کامل کن/i)
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /مشاهده پلن‌ها و خرید/i })).toBeInTheDocument();
  });
});
