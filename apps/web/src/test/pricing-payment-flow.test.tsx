import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { PricingPage } from "../pages/PricingPage.js";
import { PricingModal } from "../components/commerce/PricingModal.js";
import { CardToCardPaymentPage } from "../pages/CardToCardPaymentPage.js";
import * as useCommerceHooks from "../hooks/useCommerce.js";
import * as authProviderHooks from "../providers/AuthProvider.js";

// Mock commerce hooks
vi.mock("../hooks/useCommerce.js", () => ({
  useCommerceProducts: vi.fn(),
  useCheckout: vi.fn(),
  useMySubscription: vi.fn(),
  useCardToCardInfo: vi.fn(),
  useSubmitCardToCardPayment: vi.fn(),
  useExtractCardToCardPayment: vi.fn(),
}));

// Mock auth provider
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: vi.fn(),
}));

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
    id: "prod-sub-quarterly",
    code: "sub_quarterly",
    type: "subscription",
    title: "اشتراک ۳ ماهه",
    description: "محبوب‌ترین پلن آموزشی",
    price: 198000,
    currency: "toman",
    duration_days: 90,
    active: true,
  },
  {
    id: "prod-sub-yearly",
    code: "sub_yearly",
    type: "subscription",
    title: "اشتراک ۱ ساله",
    description: "بیشترین تخفیف و صرفه‌جویی",
    price: 599000,
    currency: "toman",
    duration_days: 365,
    active: true,
  },
];

function renderWithRouter(initialEntries: string[] = ["/"]) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/checkout/card-to-card" element={<CardToCardPaymentPage />} />
          <Route
            path="/modal-test"
            element={<PricingModal isOpen={true} onClose={vi.fn()} initialProductId="prod-sub-monthly" />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Pricing & Card-to-Card UX Refactor Suite", () => {
  const mockCheckoutMutate = vi.fn();
  const mockC2cMutate = vi.fn();
  const mockExtractMutate = vi.fn();

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
      mutate: mockCheckoutMutate,
      isPending: false,
    } as any);

    vi.mocked(useCommerceHooks.useSubmitCardToCardPayment).mockReturnValue({
      mutate: mockC2cMutate,
      isPending: false,
    } as any);

    vi.mocked(useCommerceHooks.useExtractCardToCardPayment).mockReturnValue({
      mutate: mockExtractMutate,
      isPending: false,
    } as any);

    vi.mocked(useCommerceHooks.useMySubscription).mockReturnValue({
      data: { subscription: null } as any,
      isLoading: false,
    } as any);

    vi.mocked(useCommerceHooks.useCardToCardInfo).mockReturnValue({
      data: {
        enabled: true,
        destinationCardNumber: "5894631131738239",
        cardholderName: "علی محمدلو",
        instructions: "لطفاً مبلغ دقیق اشتراک را به شماره کارت فوق واریز کرده و سپس اطلاعات پرداخت را ثبت نمایید.",
      } as any,
      isLoading: false,
    } as any);
  });

  afterEach(() => {
    document.body.style.overflow = "";
  });

  it("1. PricingModal does NOT display destination card or payment inputs", () => {
    renderWithRouter(["/modal-test"]);

    expect(screen.getByText("ارتقا به آوانا پلاس (اشتراک ویژه)")).toBeDefined();
    expect(screen.getByText("پرداخت آنلاین")).toBeDefined();
    expect(screen.getByText("به‌زودی")).toBeDefined();
    expect(screen.getByText("کارت‌به‌کارت (فعال‌سازی فوری)")).toBeDefined();

    // Destination card and payment form MUST NOT be in the modal
    expect(screen.queryByText("5894 6311 3173 8239")).toBeNull();
    expect(screen.queryByText("5894631131738239")).toBeNull();
    expect(screen.queryByText("علی محمدلو")).toBeNull();
    expect(screen.queryByPlaceholderText("مثال: ۱۲۳۴۵۶۷۸۹")).toBeNull();
    expect(screen.queryByPlaceholderText("مثال: ۵۶۷۸")).toBeNull();
  });

  it("2. Selecting Card-to-Card in PricingModal and clicking Continue navigates to CardToCardPaymentPage", () => {
    renderWithRouter(["/modal-test"]);

    // Select Card-to-Card tab
    const c2cTab = screen.getByText("کارت‌به‌کارت (فعال‌سازی فوری)");
    fireEvent.click(c2cTab);

    // Verify continue button
    const continueBtn = screen.getByText("ادامه جهت پرداخت کارت‌به‌کارت");
    expect(continueBtn).toBeDefined();

    fireEvent.click(continueBtn);

    // Now CardToCardPaymentPage is rendered!
    expect(screen.getByText(/پرداخت کارت‌به‌کارت با استخراج خودکار/)).toBeDefined();
  });

  it("3. Dedicated CardToCardPaymentPage displays card number, cardholder, exact price, and copy button", () => {
    renderWithRouter(["/checkout/card-to-card?productId=prod-sub-monthly"]);

    // Destination details
    expect(screen.getByText("5894 6311 3173 8239")).toBeDefined();
    expect(screen.queryByText("علی محمدلو")).toBeNull();
    expect(screen.getAllByText(/۹۹٬۰۰۰/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("کپی")).toBeDefined();

    // Primary Textarea & Extraction button
    expect(screen.getByText("اطلاعات پرداخت")).toBeDefined();
    expect(screen.getByText("استخراج اطلاعات پرداخت")).toBeDefined();
    expect(screen.getByText("ورود دستی اطلاعات")).toBeDefined();
  });

  it("4. Automated extraction with complete receipt populates all preview fields", () => {
    mockExtractMutate.mockImplementation((_data, callbacks) => {
      callbacks.onSuccess({
        data: {
          amount: 99000,
          currency: "toman",
          trackingNumber: "TRK-123456",
          sourceCardLast4: "4321",
          paymentDate: "1404/12/15",
          paymentTime: "14:30",
          payerName: "علی رضایی",
        },
        confidence: {
          amount: "high",
          trackingNumber: "high",
          sourceCardLast4: "high",
          paymentDate: "high",
          paymentTime: "high",
          payerName: "medium",
        },
        extractionMethod: "rule",
        missingFields: [],
        sanitizedText: "...",
      });
    });

    renderWithRouter(["/checkout/card-to-card?productId=prod-sub-monthly"]);

    const textarea = screen.getByPlaceholderText(/بانک ملت/);
    fireEvent.change(textarea, { target: { value: "برداشت از ۴۳۲۱ مبلغ ۹۹۰۰۰ پیگیری ۱۲۳۴۵۶" } });

    const extractBtn = screen.getByText("استخراج اطلاعات پرداخت");
    fireEvent.click(extractBtn);

    expect(mockExtractMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "برداشت از ۴۳۲۱ مبلغ ۹۹۰۰۰ پیگیری ۱۲۳۴۵۶",
        product_id: "prod-sub-monthly",
      }),
      expect.any(Object),
    );

    // Form preview is now rendered with extracted values
    expect(screen.getByDisplayValue("TRK-123456")).toBeDefined();
    expect(screen.getByDisplayValue("4321")).toBeDefined();
    expect(screen.getByDisplayValue("علی رضایی")).toBeDefined();
    expect(screen.getByText("تأیید اطلاعات و فعال‌سازی فوری")).toBeDefined();
    expect(screen.getByText(/با ثبت پرداخت، اشتراک شما فعال می‌شود/)).toBeDefined();
  });

  it("5. Partial extraction displays missing field banners and prompts user to fill missing data", () => {
    mockExtractMutate.mockImplementation((_data, callbacks) => {
      callbacks.onSuccess({
        data: {
          amount: 99000,
          currency: "toman",
          trackingNumber: null,
          sourceCardLast4: "4321",
          paymentDate: "1404/12/15",
          paymentTime: "14:30",
          payerName: null,
        },
        confidence: {
          amount: "high",
          trackingNumber: "low",
          sourceCardLast4: "high",
          paymentDate: "high",
          paymentTime: "high",
          payerName: "low",
        },
        extractionMethod: "rule",
        missingFields: ["trackingNumber"],
        sanitizedText: "...",
      });
    });

    renderWithRouter(["/checkout/card-to-card?productId=prod-sub-monthly"]);

    const textarea = screen.getByPlaceholderText(/بانک ملت/);
    fireEvent.change(textarea, { target: { value: "مبلغ ۹۹۰۰۰ از کارت ۴۳۲۱" } });

    const extractBtn = screen.getByText("استخراج اطلاعات پرداخت");
    fireEvent.click(extractBtn);

    // Warning banner for missing tracking number
    expect(screen.getByText(/شماره پیگیری در متن پیدا نشد/)).toBeDefined();
    expect(screen.getByDisplayValue("4321")).toBeDefined();
  });

  it("6. Extraction failure shows error alert and gracefully switches to manual entry mode", () => {
    mockExtractMutate.mockImplementation((_data, callbacks) => {
      callbacks.onError({
        message: "متن پیامک ناخوانا است",
      });
    });

    renderWithRouter(["/checkout/card-to-card?productId=prod-sub-monthly"]);

    const textarea = screen.getByPlaceholderText(/بانک ملت/);
    fireEvent.change(textarea, { target: { value: "متن نامعتبر و ناخوانا" } });

    const extractBtn = screen.getByText("استخراج اطلاعات پرداخت");
    fireEvent.click(extractBtn);

    expect(screen.getByText("متن پیامک ناخوانا است")).toBeDefined();
    expect(screen.getByText("حالت ورود دستی اطلاعات پرداخت")).toBeDefined();
  });

  it("7. User can manually correct extracted values and submit updated data", () => {
    mockExtractMutate.mockImplementation((_data, callbacks) => {
      callbacks.onSuccess({
        data: {
          amount: 99000,
          currency: "toman",
          trackingNumber: "AUTO-111",
          sourceCardLast4: "1111",
          paymentDate: "1404/12/15",
          paymentTime: "14:30",
          payerName: "نام اولیه",
        },
        confidence: {
          amount: "high",
          trackingNumber: "high",
          sourceCardLast4: "high",
          paymentDate: "high",
          paymentTime: "high",
          payerName: "medium",
        },
        extractionMethod: "rule",
        missingFields: [],
        sanitizedText: "...",
      });
    });

    renderWithRouter(["/checkout/card-to-card?productId=prod-sub-monthly"]);

    const textarea = screen.getByPlaceholderText(/بانک ملت/);
    fireEvent.change(textarea, { target: { value: "متن نمونه" } });
    fireEvent.click(screen.getByText("استخراج اطلاعات پرداخت"));

    // User edits the tracking number and last 4
    const trackingInput = screen.getByDisplayValue("AUTO-111");
    fireEvent.change(trackingInput, { target: { value: "USER-EDITED-999" } });

    const last4Input = screen.getByDisplayValue("1111");
    fireEvent.change(last4Input, { target: { value: "9988" } });

    const submitBtn = screen.getByText("تأیید اطلاعات و فعال‌سازی فوری");
    fireEvent.click(submitBtn);

    expect(mockC2cMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: "prod-sub-monthly",
        amount: 99000,
        tracking_number: "USER-EDITED-999",
        source_card_last4: "9988",
      }),
      expect.any(Object),
    );
  });

  it("8. Prevents submission with invalid last4 and displays validation error", () => {
    renderWithRouter(["/checkout/card-to-card?productId=prod-sub-monthly"]);

    const manualBtn = screen.getByText("ورود دستی اطلاعات");
    fireEvent.click(manualBtn);

    const trackingInput = screen.getByPlaceholderText("مثال: ۱۲۳۴۵۶۷۸۹");
    fireEvent.change(trackingInput, { target: { value: "TRK-VALID" } });

    const last4Input = screen.getByPlaceholderText("مثال: ۵۶۷۸");
    fireEvent.change(last4Input, { target: { value: "99" } }); // invalid 2 digits

    const submitBtn = screen.getByText("تأیید اطلاعات و فعال‌سازی فوری");
    fireEvent.click(submitBtn);

    expect(mockC2cMutate).not.toHaveBeenCalled();
    expect(screen.getByText("۴ رقم آخر کارت مبدأ باید دقیقاً ۴ رقم عددی باشد.")).toBeDefined();
  });

  it("9. Reset button allows re-pasting text", () => {
    mockExtractMutate.mockImplementation((_data, callbacks) => {
      callbacks.onSuccess({
        data: {
          amount: 99000,
          currency: "toman",
          trackingNumber: "TRK-123456",
          sourceCardLast4: "4321",
          paymentDate: "1404/12/15",
          paymentTime: "14:30",
          payerName: null,
        },
        confidence: {
          amount: "high",
          trackingNumber: "high",
          sourceCardLast4: "high",
          paymentDate: "high",
          paymentTime: "high",
          payerName: "low",
        },
        extractionMethod: "rule",
        missingFields: [],
        sanitizedText: "...",
      });
    });

    renderWithRouter(["/checkout/card-to-card?productId=prod-sub-monthly"]);

    const textarea = screen.getByPlaceholderText(/بانک ملت/);
    fireEvent.change(textarea, { target: { value: "تست" } });
    fireEvent.click(screen.getByText("استخراج اطلاعات پرداخت"));

    expect(screen.getByText("Paste مجدد متن")).toBeDefined();
    fireEvent.click(screen.getByText("Paste مجدد متن"));

    expect(screen.getByPlaceholderText(/بانک ملت/)).toBeDefined();
  });

  it("10. PricingPage renders enhanced hero headline, shared features section, and 12-hour refund policy", () => {
    renderWithRouter(["/pricing"]);

    // Hero headline
    expect(screen.getByText(/سرمایه‌گذاری روی/)).toBeDefined();
    expect(screen.getByText(/یادگیری عمیق و بدون محدودیت/)).toBeDefined();

    // Shared features section
    expect(screen.getByText("امکانات مشترک همه پلن‌ها")).toBeDefined();
    expect(
      screen.getByText("با خرید هر یک از پلن‌های اشتراک، به تمامی امکانات زیر بدون محدودیت دسترسی خواهید داشت"),
    ).toBeDefined();
    expect(screen.getByText("شامل تمام پلن‌ها")).toBeDefined();
    expect(screen.getByText("دسترسی نامحدود به متن تمام درسنامه‌ها")).toBeDefined();
    expect(screen.getByText("مرور هوشمند فلش‌کارت‌ها با الگوریتم FSRS")).toBeDefined();
    expect(screen.getByText("گفتگوی نامحدود با دستیار هوشمند (AI Tutor)")).toBeDefined();

    // Single-line plan-specific highlights
    expect(screen.getByText("دسترسی ۳۰ روزه به کلیه امکانات")).toBeDefined();
    expect(screen.getByText("دسترسی ۹۰ روزه به کلیه امکانات")).toBeDefined();
    expect(screen.getByText("دسترسی ۳۶۵ روزه به کلیه امکانات")).toBeDefined();

    // Refund policy FAQ text
    const faqButton = screen.getByText("آیا امکان لغو اشتراک و بازگشت وجه وجود دارد؟");
    expect(faqButton).toBeDefined();
    fireEvent.click(faqButton);

    expect(
      screen.getByText(
        "بله، در صورت عدم رضایت تا ۱۲ ساعت پس از خرید، می‌توانید با پشتیبانی آوانا ارتباط برقرار کرده و درخواست بازگشت وجه دهید.",
      ),
    ).toBeDefined();
    expect(screen.queryByText(/۴۸ ساعت/)).toBeNull();
  });
});

