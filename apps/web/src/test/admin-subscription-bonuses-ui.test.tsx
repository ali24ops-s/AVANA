import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminSubscriptionBonusesSection } from "../components/admin/commerce/AdminSubscriptionBonusesSection.js";
import { AdminProductsPage } from "../pages/admin/commerce/AdminProductsPage.js";
import { useAdmin } from "../hooks/useAdmin.js";
import type { SubscriptionCreditBonusesConfig } from "../lib/api/admin.js";

vi.mock("../hooks/useAdmin.js", () => ({
  useAdmin: vi.fn(),
}));

describe("Admin Subscription Gift Credit Bonuses UI Suite", () => {
  const mockConfig: SubscriptionCreditBonusesConfig = {
    monthly: 40000,
    quarterly: 100000,
    annual: 200000,
    updatedAt: "2026-09-17T12:00:00.000Z",
    updatedBy: "admin-uuid-1",
  };

  const mockAdminApi = {
    getSubscriptionCreditBonuses: vi.fn(),
    updateSubscriptionCreditBonuses: vi.fn(),
    getContentGenerationPricing: vi.fn(),
    updateContentGenerationPricing: vi.fn(),
    listCommerceProducts: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAdmin).mockReturnValue(mockAdminApi as unknown as ReturnType<typeof useAdmin>);
    mockAdminApi.getSubscriptionCreditBonuses.mockResolvedValue(mockConfig);
    mockAdminApi.updateSubscriptionCreditBonuses.mockResolvedValue({
      success: true,
      bonuses: {
        monthly: 50000,
        quarterly: 120000,
        annual: 250000,
        updatedAt: "2026-09-17T14:30:00.000Z",
        updatedBy: "admin-uuid-1",
      },
    });
    mockAdminApi.getContentGenerationPricing.mockResolvedValue({
      referenceDocumentId: "ref-doc-1",
      referenceFileName: "40.pdf",
      referenceCourseName: "فارماکولوژی",
      referenceUsableTokens: 35572,
      lessonBaselinePriceToman: 15000,
      flashcardBaselinePriceToman: 7000,
      examBaselinePriceToman: 9000,
      summaryFixedPriceToman: 4000,
      currency: "toman",
    });
    mockAdminApi.listCommerceProducts.mockResolvedValue({ products: [] });
  });

  afterEach(() => {
    cleanup();
  });

  test("1. Renders subscription bonuses section with header, description and last updated date", async () => {
    render(
      <MemoryRouter>
        <AdminSubscriptionBonusesSection />
      </MemoryRouter>
    );

    expect(
      screen.getByText("اعتبار هدیه کیف پول پس از فعالسازی اشتراک")
    ).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText(/مکانیزم واریز خودکار اعتبار هدیه/)).toBeDefined();
      expect(screen.getByText("آخرین بروزرسانی:")).toBeDefined();
    });
  });

  test("2. Loads and displays existing gift bonus amounts for all 3 subscription tiers", async () => {
    render(
      <MemoryRouter>
        <AdminSubscriptionBonusesSection />
      </MemoryRouter>
    );

    await waitFor(() => {
      const monthlyInput = screen.getByLabelText("مبلغ هدیه اشتراک ۱ ماهه") as HTMLInputElement;
      const quarterlyInput = screen.getByLabelText("مبلغ هدیه اشتراک ۳ ماهه") as HTMLInputElement;
      const annualInput = screen.getByLabelText("مبلغ هدیه اشتراک ۱ ساله") as HTMLInputElement;

      expect(monthlyInput.value).toBe("40000");
      expect(quarterlyInput.value).toBe("100000");
      expect(annualInput.value).toBe("200000");

      expect(screen.getByText("معادل: ۴۰٬۰۰۰ تومان")).toBeDefined();
      expect(screen.getByText("معادل: ۱۰۰٬۰۰۰ تومان")).toBeDefined();
      expect(screen.getByText("معادل: ۲۰۰٬۰۰۰ تومان")).toBeDefined();
    });
  });

  test("3. Validates inputs preventing empty or invalid values", async () => {
    render(
      <MemoryRouter>
        <AdminSubscriptionBonusesSection />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText("مبلغ هدیه اشتراک ۱ ماهه")).toBeDefined();
    });

    const monthlyInput = screen.getByLabelText("مبلغ هدیه اشتراک ۱ ماهه");
    fireEvent.change(monthlyInput, { target: { value: "" } });

    const submitBtn = screen.getByRole("button", { name: /ذخیره تغییرات/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/لطفاً مبلغ هدیه اشتراک ۱ ماهه را وارد کنید/)
      ).toBeDefined();
      expect(mockAdminApi.updateSubscriptionCreditBonuses).not.toHaveBeenCalled();
    });
  });

  test("4. Successfully submits updated bonuses and refreshes UI with new amounts", async () => {
    render(
      <MemoryRouter>
        <AdminSubscriptionBonusesSection />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText("مبلغ هدیه اشتراک ۱ ماهه")).toBeDefined();
    });

    const monthlyInput = screen.getByLabelText("مبلغ هدیه اشتراک ۱ ماهه");
    const quarterlyInput = screen.getByLabelText("مبلغ هدیه اشتراک ۳ ماهه");
    const annualInput = screen.getByLabelText("مبلغ هدیه اشتراک ۱ ساله");

    fireEvent.change(monthlyInput, { target: { value: "50000" } });
    fireEvent.change(quarterlyInput, { target: { value: "120000" } });
    fireEvent.change(annualInput, { target: { value: "250000" } });

    const submitBtn = screen.getByRole("button", { name: /ذخیره تغییرات/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAdminApi.updateSubscriptionCreditBonuses).toHaveBeenCalledWith({
        monthly: 50000,
        quarterly: 120000,
        annual: 250000,
      });

      expect(
        screen.getByText(/مبالغ اعتبار هدیه اشتراک‌ها با موفقیت ذخیره شدند/)
      ).toBeDefined();

      expect((monthlyInput as HTMLInputElement).value).toBe("50000");
      expect((quarterlyInput as HTMLInputElement).value).toBe("120000");
      expect((annualInput as HTMLInputElement).value).toBe("250000");

      expect(screen.getByText("معادل: ۵۰٬۰۰۰ تومان")).toBeDefined();
      expect(screen.getByText("معادل: ۱۲۰٬۰۰۰ تومان")).toBeDefined();
      expect(screen.getByText("معادل: ۲۵۰٬۰۰۰ تومان")).toBeDefined();
    });
  });

  test("5. Displays error message when API update fails", async () => {
    mockAdminApi.updateSubscriptionCreditBonuses.mockRejectedValueOnce(
      new Error("خطای ارتباط با سرور")
    );

    render(
      <MemoryRouter>
        <AdminSubscriptionBonusesSection />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText("مبلغ هدیه اشتراک ۱ ماهه")).toBeDefined();
    });

    const submitBtn = screen.getByRole("button", { name: /ذخیره تغییرات/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("خطای ارتباط با سرور")).toBeDefined();
    });
  });

  test("6. Integrates into AdminProductsPage seamlessly", async () => {
    render(
      <MemoryRouter>
        <AdminProductsPage />
      </MemoryRouter>
    );

    expect(screen.getByText("کاتالوگ و قیمت‌گذاری محصولات")).toBeDefined();

    await waitFor(() => {
      expect(
        screen.getByText("اعتبار هدیه کیف پول پس از فعالسازی اشتراک")
      ).toBeDefined();
      expect(screen.getByLabelText("مبلغ هدیه اشتراک ۱ ماهه")).toBeDefined();
      expect(screen.getByLabelText("مبلغ هدیه اشتراک ۳ ماهه")).toBeDefined();
      expect(screen.getByLabelText("مبلغ هدیه اشتراک ۱ ساله")).toBeDefined();
    });
  });
});
