import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { UserWalletPage } from "../UserWalletPage.js";
import * as useWalletHooks from "../../../hooks/useWallet.js";

// Mock useWallet hooks
vi.mock("../../../hooks/useWallet.js", () => ({
  useMyWallet: vi.fn(),
  useMyWalletTransactions: vi.fn(),
  useMyWalletTopups: vi.fn(),
}));

type MockWalletReturn = ReturnType<typeof useWalletHooks.useMyWallet>;
type MockTransactionsReturn = ReturnType<typeof useWalletHooks.useMyWalletTransactions>;
type MockTopupsReturn = ReturnType<typeof useWalletHooks.useMyWalletTopups>;

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

describe("UserWalletPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useWalletHooks.useMyWalletTopups).mockReturnValue({
      data: { topups: [] },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockTopupsReturn);
  });

  it("1. Wallet page renders current balance in Credits and Tomans", () => {
    vi.mocked(useWalletHooks.useMyWallet).mockReturnValue({
      data: {
        balance: 12500,
        currency: "toman",
        formatted_balance: "۱۲٬۵۰۰ تومان",
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockWalletReturn);

    vi.mocked(useWalletHooks.useMyWalletTransactions).mockReturnValue({
      data: {
        transactions: [],
        total: 0,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockTransactionsReturn);

    renderWithProviders(<UserWalletPage />);

    expect(screen.getByRole("heading", { level: 1, name: "کیف پول" })).toBeDefined();
    expect(screen.getByText("موجودی شما برای استفاده از خدمات و تولید محتوای هوشمند")).toBeDefined();
    expect(screen.getByText("موجودی کیف پول")).toBeDefined();
    expect(screen.getByText("Credit")).toBeDefined();
    expect(screen.getAllByText(/۱۲[٬,]۵۰۰/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/معادل/)).toBeDefined();
    expect(screen.getByText(/هر ۱ Credit برابر با ۱ تومان است/)).toBeDefined();
  });

  it("2. Transactions render correctly with title, description, and Persian date", () => {
    vi.mocked(useWalletHooks.useMyWallet).mockReturnValue({
      data: {
        balance: 40000,
        currency: "toman",
        formatted_balance: "۴۰٬۰۰۰ تومان",
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockWalletReturn);

    vi.mocked(useWalletHooks.useMyWalletTransactions).mockReturnValue({
      data: {
        transactions: [
          {
            id: "tx-1",
            type: "credit",
            amount: 40000,
            balance_before: 0,
            balance_after: 40000,
            source: "subscription_bonus",
            reference_type: "user_subscription",
            reference_id: "sub-12345678-abcd",
            created_at: "2026-09-17T10:00:00.000Z",
          },
          {
            id: "tx-2",
            type: "debit",
            amount: 15000,
            balance_before: 40000,
            balance_after: 25000,
            source: "content_generation",
            reference_type: "generation_job",
            reference_id: "job-87654321-efgh",
            created_at: "2026-09-17T11:30:00.000Z",
          },
        ],
        total: 2,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockTransactionsReturn);

    renderWithProviders(<UserWalletPage />);

    expect(screen.getByText("تاریخچه تراکنش‌ها")).toBeDefined();
    expect(screen.getByText(/۲ تراکنش/)).toBeDefined();
    expect(screen.getByText("هدیه اشتراک آوانا")).toBeDefined();
    expect(screen.getByText("تولید هوشمند محتوا")).toBeDefined();
    expect(screen.getByText("واریز / شارژ")).toBeDefined();
    expect(screen.getByText("کسر / مصرف")).toBeDefined();
  });

  it("3. Positive and negative amounts display correctly with sign prefix", () => {
    vi.mocked(useWalletHooks.useMyWallet).mockReturnValue({
      data: { balance: 25000, currency: "toman", formatted_balance: "۲۵٬۰۰۰ تومان" },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockWalletReturn);

    vi.mocked(useWalletHooks.useMyWalletTransactions).mockReturnValue({
      data: {
        transactions: [
          {
            id: "tx-credit",
            type: "credit",
            amount: 40000,
            balance_before: 0,
            balance_after: 40000,
            source: "subscription_bonus",
            reference_type: "user_subscription",
            reference_id: "sub-123",
            created_at: "2026-09-17T10:00:00.000Z",
          },
          {
            id: "tx-debit",
            type: "debit",
            amount: 15000,
            balance_before: 40000,
            balance_after: 25000,
            source: "content_generation",
            reference_type: "generation_job",
            reference_id: "job-456",
            created_at: "2026-09-17T11:00:00.000Z",
          },
          {
            id: "tx-refund",
            type: "refund",
            amount: 5000,
            balance_before: 25000,
            balance_after: 30000,
            source: "generation_refund",
            reference_type: "generation_job",
            reference_id: "job-789",
            created_at: "2026-09-17T12:00:00.000Z",
          },
        ],
        total: 3,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockTransactionsReturn);

    renderWithProviders(<UserWalletPage />);

    expect(screen.getByText("بازگشت وجه تولید محتوا")).toBeDefined();
    expect(screen.getByText("بازگشت وجه")).toBeDefined();
    expect(screen.getAllByText("+").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("-").length).toBeGreaterThanOrEqual(1);
  });

  it("4. Empty transactions state displays appropriate message", () => {
    vi.mocked(useWalletHooks.useMyWallet).mockReturnValue({
      data: { balance: 0, currency: "toman", formatted_balance: "۰ تومان" },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockWalletReturn);

    vi.mocked(useWalletHooks.useMyWalletTransactions).mockReturnValue({
      data: { transactions: [], total: 0 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockTransactionsReturn);

    renderWithProviders(<UserWalletPage />);

    expect(screen.getByText("هنوز تراکنشی ثبت نشده است")).toBeDefined();
    expect(screen.getByText(/تراکنش‌های حاصل از هدیه فعال‌سازی اشتراک/)).toBeDefined();
  });

  it("5. Loading state displays skeleton placeholders", () => {
    vi.mocked(useWalletHooks.useMyWallet).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockWalletReturn);

    vi.mocked(useWalletHooks.useMyWalletTransactions).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockTransactionsReturn);

    const { container } = renderWithProviders(<UserWalletPage />);

    expect(screen.getByRole("heading", { level: 1, name: "کیف پول" })).toBeDefined();
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("6. API error state displays alert and triggers retry on button click", () => {
    const mockRefetchWallet = vi.fn();
    const mockRefetchTransactions = vi.fn();

    vi.mocked(useWalletHooks.useMyWallet).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("خطای اتصال به سرور کیف پول"),
      refetch: mockRefetchWallet,
    } as unknown as MockWalletReturn);

    vi.mocked(useWalletHooks.useMyWalletTransactions).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("خطای دریافت تراکنش‌ها"),
      refetch: mockRefetchTransactions,
    } as unknown as MockTransactionsReturn);

    renderWithProviders(<UserWalletPage />);

    expect(screen.getByText("خطا در برقراری ارتباط با سرویس کیف پول")).toBeDefined();
    expect(screen.getByText("خطای اتصال به سرور کیف پول")).toBeDefined();

    const retryBtn = screen.getByRole("button", { name: /تلاش مجدد/i });
    expect(retryBtn).toBeDefined();

    fireEvent.click(retryBtn);
    expect(mockRefetchWallet).toHaveBeenCalledTimes(1);
    expect(mockRefetchTransactions).toHaveBeenCalledTimes(1);
  });

  it("7. Authenticated route navigation links are present", () => {
    vi.mocked(useWalletHooks.useMyWallet).mockReturnValue({
      data: { balance: 10000, currency: "toman", formatted_balance: "۱۰٬۰۰۰ تومان" },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockWalletReturn);

    vi.mocked(useWalletHooks.useMyWalletTransactions).mockReturnValue({
      data: { transactions: [], total: 0 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockTransactionsReturn);

    renderWithProviders(<UserWalletPage />);

    const subLink = screen.getByRole("link", { name: /مدیریت اشتراک/i });
    const purchasesLink = screen.getByRole("link", { name: /فاکتورها و خریدهای من/i });

    expect(subLink.getAttribute("href")).toBe("/account/subscription");
    expect(purchasesLink.getAttribute("href")).toBe("/account/purchases");
  });

  it("8. Mobile/RTL-sensitive rendering features", () => {
    vi.mocked(useWalletHooks.useMyWallet).mockReturnValue({
      data: { balance: 50000, currency: "toman", formatted_balance: "۵۰٬۰۰۰ تومان" },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockWalletReturn);

    vi.mocked(useWalletHooks.useMyWalletTransactions).mockReturnValue({
      data: {
        transactions: [
          {
            id: "tx-mobile",
            type: "credit",
            amount: 50000,
            balance_before: 0,
            balance_after: 50000,
            source: "wallet_topup",
            reference_type: "order",
            reference_id: "ord-999",
            created_at: "2026-09-17T08:00:00.000Z",
          },
        ],
        total: 1,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockTransactionsReturn);

    const { container } = renderWithProviders(<UserWalletPage />);
    const root = container.querySelector('[dir="rtl"]');
    expect(root).toBeDefined();
    expect(screen.getByText("شارژ مستقیم کیف پول")).toBeDefined();
  });

  it("9. Top-up modal opens when clicking 'افزایش موجودی' and enables amount selection", () => {
    vi.mocked(useWalletHooks.useMyWallet).mockReturnValue({
      data: { balance: 20000, currency: "toman", formatted_balance: "۲۰٬۰۰۰ تومان" },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockWalletReturn);

    vi.mocked(useWalletHooks.useMyWalletTransactions).mockReturnValue({
      data: { transactions: [], total: 0 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockTransactionsReturn);

    renderWithProviders(<UserWalletPage />);

    // Click topup button
    const topupBtn = screen.getByRole("button", { name: /افزایش موجودی/i });
    expect(topupBtn).toBeDefined();
    fireEvent.click(topupBtn);

    // Modal is opened
    expect(screen.getByText("افزایش اعتبار کیف پول")).toBeDefined();
    expect(screen.getByText("مبالغ پیشنهادی:")).toBeDefined();
    expect(screen.getByRole("button", { name: /ادامه و ثبت فیش واریز/i })).toBeDefined();
  });

  it("10. Displays recent top-up requests with unified status badges, labels, and subtexts", () => {
    vi.mocked(useWalletHooks.useMyWallet).mockReturnValue({
      data: {
        balance: 150000,
        currency: "toman",
        formatted_balance: "۱۵۰٬۰۰۰ تومان",
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockWalletReturn);

    vi.mocked(useWalletHooks.useMyWalletTransactions).mockReturnValue({
      data: { transactions: [], total: 0 },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockTransactionsReturn);

    vi.mocked(useWalletHooks.useMyWalletTopups).mockReturnValue({
      data: {
        topups: [
          {
            id: "topup-1",
            order_id: "ord-1",
            amount: 100000,
            currency: "toman",
            status: "pending_admin_review",
            tracking_number: "TRK-PENDING-123",
            sourceCardLast4: "6037",
            payer_name: "Ali",
            receipt_url: null,
            rejection_reason: null,
            created_at: "2026-09-17T09:00:00.000Z",
            reviewed_at: null,
          },
          {
            id: "topup-2",
            order_id: "ord-2",
            amount: 50000,
            currency: "toman",
            status: "admin_approved",
            tracking_number: "123456789",
            source_card_last4: "1234",
            payer_name: "Ali",
            receipt_url: null,
            rejection_reason: null,
            created_at: "2026-09-17T12:46:00.000Z",
            reviewed_at: "2026-09-17T13:00:00.000Z",
          },
          {
            id: "topup-3",
            order_id: "ord-3",
            amount: 25000,
            currency: "toman",
            status: "admin_rejected",
            tracking_number: "TRK-REJ-456",
            source_card_last4: "5892",
            payer_name: "Ali",
            receipt_url: null,
            rejection_reason: "فیش واریزی ناخوانا است",
            created_at: "2026-09-16T14:00:00.000Z",
            reviewed_at: "2026-09-16T15:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as MockTopupsReturn);

    renderWithProviders(<UserWalletPage />);

    expect(screen.getByText("درخواست‌های افزایش موجودی کارت‌به‌کارت")).toBeDefined();
    // Pending item
    expect(screen.getByText("در انتظار بررسی ادمین")).toBeDefined();
    expect(screen.getByText("پس از تایید ادمین اعمال خواهد شد")).toBeDefined();
    // Approved item
    expect(screen.getByText("تأیید شد")).toBeDefined();
    expect(screen.getByText("به کیف پول واریز شد")).toBeDefined();
    expect(screen.getByText(/کد رهگیری: 123456789/)).toBeDefined();
    expect(screen.getByText(/کارت: 1234\*\*\*\*/)).toBeDefined();
    // Rejected item
    expect(screen.getByText("رد شده")).toBeDefined();
    expect(screen.getByText("واریز نشد")).toBeDefined();
    expect(screen.getByText(/فیش واریزی ناخوانا است/)).toBeDefined();
    expect(screen.getByText(/کد رهگیری: TRK-PENDING-123/)).toBeDefined();
  });
});

