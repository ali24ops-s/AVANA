import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminContentPricingSection } from "../components/admin/commerce/AdminContentPricingSection.js";
import { AdminProductsPage } from "../pages/admin/commerce/AdminProductsPage.js";
import { useAdmin } from "../hooks/useAdmin.js";
import type { ContentGenerationPricingConfig } from "../lib/api/admin.js";

vi.mock("../hooks/useAdmin.js", () => ({
  useAdmin: vi.fn(),
}));

describe("Admin Content Generation Pricing UI Suite", () => {
  const mockConfig: ContentGenerationPricingConfig = {
    referenceDocumentId: "19313b37-8baf-47bb-a80d-3a70e5ed910e",
    referenceFileName: "40.pdf",
    referenceCourseName: "فارماکولوژی ۳",
    referenceUsableTokens: 35572,
    lessonBaselinePriceToman: 15000,
    flashcardBaselinePriceToman: 7000,
    examBaselinePriceToman: 9000,
    summaryFixedPriceToman: 4000,
    currency: "toman",
    updatedAt: "2026-09-15T12:00:00.000Z",
    updatedBy: "admin-1",
  };

  const mockAdminApi = {
    getContentGenerationPricing: vi.fn(),
    updateContentGenerationPricing: vi.fn(),
    listCommerceProducts: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAdmin).mockReturnValue(mockAdminApi as unknown as ReturnType<typeof useAdmin>);
    mockAdminApi.getContentGenerationPricing.mockResolvedValue(mockConfig);
    mockAdminApi.updateContentGenerationPricing.mockResolvedValue({
      success: true,
      pricing: {
        ...mockConfig,
        lessonBaselinePriceToman: 20000,
        flashcardBaselinePriceToman: 10000,
        examBaselinePriceToman: 12000,
        summaryFixedPriceToman: 5000,
      },
    });
    mockAdminApi.listCommerceProducts.mockResolvedValue({ products: [] });
  });

  afterEach(() => {
    cleanup();
  });

  test("1. Renders content generation pricing section with read-only calibration metadata", async () => {
    render(
      <MemoryRouter>
        <AdminContentPricingSection />
      </MemoryRouter>
    );

    expect(screen.getByText("قیمت‌گذاری تولید محتوا")).toBeDefined();

    await waitFor(() => {
      // Check calibration metadata
      expect(screen.getByText("40.pdf")).toBeDefined();
      expect(screen.getByText(/۳۵٬۵۷۲ توکن/)).toBeDefined();
    });
  });

  test("2. Loads and displays existing baseline prices in inputs", async () => {
    render(
      <MemoryRouter>
        <AdminContentPricingSection />
      </MemoryRouter>
    );

    await waitFor(() => {
      const lessonInput = screen.getByPlaceholderText("15000") as HTMLInputElement;
      const flashcardInput = screen.getByPlaceholderText("7000") as HTMLInputElement;
      const quizInput = screen.getByPlaceholderText("9000") as HTMLInputElement;
      const reviewInput = screen.getByPlaceholderText("4000") as HTMLInputElement;

      expect(lessonInput.value).toBe("15000");
      expect(flashcardInput.value).toBe("7000");
      expect(quizInput.value).toBe("9000");
      expect(reviewInput.value).toBe("4000");
    });
  });

  test("3. Validates inputs preventing invalid values", async () => {
    render(
      <MemoryRouter>
        <AdminContentPricingSection />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("15000")).toBeDefined();
    });

    const lessonInput = screen.getByPlaceholderText("15000");
    fireEvent.change(lessonInput, { target: { value: "" } });

    const saveButton = screen.getByRole("button", { name: /ذخیره تغییرات/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText(/لطفاً قیمت تولید درس را وارد کنید/i)).toBeDefined();
      expect(mockAdminApi.updateContentGenerationPricing).not.toHaveBeenCalled();
    });
  });

  test("4. Successfully submits updated baseline prices and displays success message", async () => {
    render(
      <MemoryRouter>
        <AdminContentPricingSection />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("15000")).toBeDefined();
    });

    const lessonInput = screen.getByPlaceholderText("15000");
    const flashcardInput = screen.getByPlaceholderText("7000");
    const quizInput = screen.getByPlaceholderText("9000");
    const reviewInput = screen.getByPlaceholderText("4000");

    fireEvent.change(lessonInput, { target: { value: "20000" } });
    fireEvent.change(flashcardInput, { target: { value: "10000" } });
    fireEvent.change(quizInput, { target: { value: "12000" } });
    fireEvent.change(reviewInput, { target: { value: "5000" } });

    const saveButton = screen.getByRole("button", { name: /ذخیره تغییرات/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(mockAdminApi.updateContentGenerationPricing).toHaveBeenCalledWith({
        lessonBaselinePriceToman: 20000,
        flashcardBaselinePriceToman: 10000,
        examBaselinePriceToman: 12000,
        summaryFixedPriceToman: 5000,
      });
      expect(screen.getByText(/قیمت‌های مرجع تولید محتوا با موفقیت ذخیره شدند/i)).toBeDefined();
    });
  });

  test("5. Displays error message when API update fails", async () => {
    mockAdminApi.updateContentGenerationPricing.mockRejectedValue(
      new Error("خطای ارتباط با سرور")
    );

    render(
      <MemoryRouter>
        <AdminContentPricingSection />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText("15000")).toBeDefined();
    });

    const saveButton = screen.getByRole("button", { name: /ذخیره تغییرات/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText("خطای ارتباط با سرور")).toBeDefined();
    });
  });

  test("6. Renders dedicated currency badge alongside each pricing input", async () => {
    render(
      <MemoryRouter>
        <AdminContentPricingSection />
      </MemoryRouter>
    );

    await waitFor(() => {
      const inputs = screen.getAllByRole("spinbutton");
      expect(inputs.length).toBe(4);
      const tomanBadges = screen.getAllByText("تومان");
      expect(tomanBadges.length).toBe(4);
    });
  });

  test("7. Integrates into AdminProductsPage seamlessly", async () => {
    render(
      <MemoryRouter>
        <AdminProductsPage />
      </MemoryRouter>
    );

    expect(screen.getByText("کاتالوگ و قیمت‌گذاری محصولات")).toBeDefined();

    await waitFor(() => {
      expect(screen.getAllByText("قیمت‌گذاری تولید محتوا").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("40.pdf")).toBeDefined();
    });
  });
});
