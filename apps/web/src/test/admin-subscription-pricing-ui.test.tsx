import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AdminSubscriptionPricingSection } from "../components/admin/commerce/AdminSubscriptionPricingSection.js";
import { AdminSpecialExamPricingSection } from "../components/admin/commerce/AdminSpecialExamPricingSection.js";
import { AdminProductsPage } from "../pages/admin/commerce/AdminProductsPage.js";
import { useAdmin } from "../hooks/useAdmin.js";
import type { AdminProductRecord } from "../lib/api/admin.js";

vi.mock("../hooks/useAdmin.js", () => ({
  useAdmin: vi.fn(),
}));

describe("Admin Subscription & Special Exam Pricing UI Suite", () => {
  const mockSubMonthly: AdminProductRecord = {
    id: "prod-sub-1",
    code: "sub_monthly",
    type: "subscription",
    title: "اشتراک ماهانه آوانا",
    description: "توضیحات ۱ ماهه",
    price: 99000,
    currency: "toman",
    targetType: "plan",
    targetId: null,
    durationDays: 30,
    active: true,
    createdAt: "2026-09-17T10:00:00.000Z",
  };

  const mockSubQuarterly: AdminProductRecord = {
    id: "prod-sub-2",
    code: "sub_quarterly",
    type: "subscription",
    title: "اشتراک ۳ ماهه آوانا",
    description: "توضیحات ۳ ماهه",
    price: 249000,
    currency: "toman",
    targetType: "plan",
    targetId: null,
    durationDays: 90,
    active: true,
    createdAt: "2026-09-17T10:00:00.000Z",
  };

  const mockSubYearly: AdminProductRecord = {
    id: "prod-sub-3",
    code: "sub_yearly",
    type: "subscription",
    title: "اشتراک ۱ ساله آوانا",
    description: "توضیحات ۱ ساله",
    price: 790000,
    currency: "toman",
    targetType: "plan",
    targetId: null,
    durationDays: 365,
    active: true,
    createdAt: "2026-09-17T10:00:00.000Z",
  };

  const mockCourse: AdminProductRecord = {
    id: "prod-course-1",
    code: "course_pharma",
    type: "course",
    title: "دوره جامع فارماکولوژی بالینی",
    description: "دوره کامل",
    price: 350000,
    currency: "toman",
    targetType: "course",
    targetId: "c-101",
    durationDays: null,
    active: true,
    createdAt: "2026-09-17T10:00:00.000Z",
  };

  const mockContentPack: AdminProductRecord = {
    id: "prod-pack-1",
    code: "pack_anatomy",
    type: "content_pack",
    title: "بسته آناتومی اندام",
    description: "بسته",
    price: 150000,
    currency: "toman",
    targetType: "content_pack",
    targetId: "pack-1",
    durationDays: null,
    active: true,
    createdAt: "2026-09-17T10:00:00.000Z",
  };

  const mockContent: AdminProductRecord = {
    id: "prod-content-1",
    code: "lesson_1",
    type: "content",
    title: "درسنامه فیزیولوژی سلول",
    description: "درسنامه",
    price: 20000,
    currency: "toman",
    targetType: "content",
    targetId: "les-1",
    durationDays: null,
    active: true,
    createdAt: "2026-09-17T10:00:00.000Z",
  };

  const mockSpecialExam: AdminProductRecord = {
    id: "prod-exam-1",
    code: "special-exam-pharma-25",
    type: "special_exam",
    title: "آزمون ویژه فصل اول فارماکولوژی",
    description: "آزمون ۲۵ سوالی",
    price: 12500,
    currency: "toman",
    targetType: "special_exam",
    targetId: null,
    durationDays: null,
    active: true,
    createdAt: "2026-09-17T10:00:00.000Z",
  };

  const allProductsList: AdminProductRecord[] = [
    mockSubMonthly,
    mockSubQuarterly,
    mockSubYearly,
    mockCourse,
    mockContentPack,
    mockContent,
    mockSpecialExam,
  ];

  const mockAdminApi = {
    listCommerceProducts: vi.fn(),
    updateCommerceProduct: vi.fn(),
    getSubscriptionCreditBonuses: vi.fn(),
    updateSubscriptionCreditBonuses: vi.fn(),
    getContentGenerationPricing: vi.fn(),
    updateContentGenerationPricing: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAdmin).mockReturnValue(mockAdminApi as unknown as ReturnType<typeof useAdmin>);

    mockAdminApi.listCommerceProducts.mockResolvedValue({ products: allProductsList });
    mockAdminApi.updateCommerceProduct.mockResolvedValue({ success: true });
    mockAdminApi.getSubscriptionCreditBonuses.mockResolvedValue({
      monthly: 40000,
      quarterly: 100000,
      annual: 200000,
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
  });

  afterEach(() => {
    cleanup();
  });

  test("1. Renders AdminSubscriptionPricingSection with all subscription tiers", async () => {
    render(
      <MemoryRouter>
        <AdminSubscriptionPricingSection />
      </MemoryRouter>
    );

    expect(screen.getByText("قیمت‌گذاری پلن‌های اشتراک")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText("اشتراک ماهانه آوانا")).toBeDefined();
      expect(screen.getByText("اشتراک ۳ ماهه آوانا")).toBeDefined();
      expect(screen.getByText("اشتراک ۱ ساله آوانا")).toBeDefined();
      expect(screen.getByText("sub_monthly")).toBeDefined();
      expect(screen.getByText("sub_quarterly")).toBeDefined();
      expect(screen.getByText("sub_yearly")).toBeDefined();
      expect(screen.getByText("معادل: ۹۹٬۰۰۰ تومان")).toBeDefined();
      expect(screen.getByText("معادل: ۲۴۹٬۰۰۰ تومان")).toBeDefined();
      expect(screen.getByText("معادل: ۷۹۰٬۰۰۰ تومان")).toBeDefined();
    });
  });

  test("2. Allows editing subscription prices and validates input", async () => {
    render(
      <MemoryRouter>
        <AdminSubscriptionPricingSection />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText("قیمت اشتراک ماهانه آوانا")).toBeDefined();
    });

    const monthlyInput = screen.getByLabelText("قیمت اشتراک ماهانه آوانا");
    fireEvent.change(monthlyInput, { target: { value: "" } });

    const submitBtn = screen.getByRole("button", { name: /ذخیره تغییرات/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText(/لطفاً قیمت «اشتراک ماهانه آوانا» را وارد کنید/)).toBeDefined();
      expect(mockAdminApi.updateCommerceProduct).not.toHaveBeenCalled();
    });
  });

  test("3. Successfully submits updated subscription prices via updateCommerceProduct", async () => {
    render(
      <MemoryRouter>
        <AdminSubscriptionPricingSection />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText("قیمت اشتراک ماهانه آوانا")).toBeDefined();
    });

    const monthlyInput = screen.getByLabelText("قیمت اشتراک ماهانه آوانا");
    fireEvent.change(monthlyInput, { target: { value: "119000" } });

    const submitBtn = screen.getByRole("button", { name: /ذخیره تغییرات/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockAdminApi.updateCommerceProduct).toHaveBeenCalledWith("prod-sub-1", {
        price: 119000,
        active: true,
      });
      expect(screen.getByText(/قیمت‌های پلن‌های اشتراک با موفقیت ذخیره شدند/)).toBeDefined();
    });
  });

  test("4. Renders AdminSpecialExamPricingSection with baseline rate and reference tiers", async () => {
    render(
      <MemoryRouter>
        <AdminSpecialExamPricingSection />
      </MemoryRouter>
    );

    expect(screen.getByText("قیمت‌گذاری آزمون‌های ویژه")).toBeDefined();
    expect(screen.getByText("۵۰۰ تومان")).toBeDefined();
    expect(screen.getByText("تعداد سؤالات × ۵۰۰ تومان")).toBeDefined();
    expect(screen.getByText("آزمون مبحثی و فصلی (Chapter)")).toBeDefined();
    expect(screen.getByText("۱۲٬۵۰۰ تومان")).toBeDefined();
    expect(screen.getByText("آزمون جامع کل دوره (Course)")).toBeDefined();
    expect(screen.getByText("۴۰٬۰۰۰ تومان")).toBeDefined();
  });

  test("5. AdminProductsPage strictly displays only course products in the table and excludes subscriptions, packs, content and special exams", async () => {
    render(
      <MemoryRouter>
        <AdminProductsPage />
      </MemoryRouter>
    );

    expect(screen.getByText("کاتالوگ و قیمت‌گذاری محصولات")).toBeDefined();

    await waitFor(() => {
      // Standalone sections exist
      expect(screen.getByText("قیمت‌گذاری پلن‌های اشتراک")).toBeDefined();
      expect(screen.getByText("اعتبار هدیه کیف پول پس از فعالسازی اشتراک")).toBeDefined();
      expect(screen.getByText("قیمت‌گذاری تولید محتوا")).toBeDefined();
      expect(screen.getByText("قیمت‌گذاری آزمون‌های ویژه")).toBeDefined();

      // Course is in the table
      expect(screen.getByText("دوره جامع فارماکولوژی بالینی")).toBeDefined();
      expect(screen.getByText("۳۵۰٬۰۰۰")).toBeDefined();

      // Subscriptions, packs, content, special exams are NOT in the table
      expect(screen.queryByText("بسته آناتومی اندام")).toBeNull();
      expect(screen.queryByText("درسنامه فیزیولوژی سلول")).toBeNull();
      expect(screen.queryByText("آزمون ویژه فصل اول فارماکولوژی")).toBeNull();
    });
  });
});
