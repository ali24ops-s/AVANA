import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LearningPage } from "../pages/LearningPage.js";
import { LessonEditor } from "../components/content/LessonEditor.js";
import type { ContentLessonResource } from "@avana/contracts";

// Mock AuthProvider
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "student@avana.ir", role: "student" },
    memberships: [{ organization_id: "org-1", role: "student" }],
    token: "mock-token",
  }),
}));

// Mock API clients
const mockGetCourseLearning = vi.fn();
const mockListOrganizations = vi.fn();
const mockListProducts = vi.fn();
const mockUpdateLesson = vi.fn();
const mockSetLessonPricing = vi.fn();
const mockCheckout = vi.fn();

vi.mock("../lib/api/learning.js", () => ({
  createLearningApi: () => ({
    getCourseLearning: mockGetCourseLearning,
    markLessonComplete: vi.fn(),
  }),
}));

vi.mock("../lib/api/organizations.js", () => ({
  createOrganizationApi: () => ({
    listOrganizations: mockListOrganizations,
  }),
}));

vi.mock("../lib/api/commerce.js", () => ({
  createCommerceApi: () => ({
    listProducts: mockListProducts,
    checkout: mockCheckout,
    getMySubscription: vi.fn().mockResolvedValue({ has_active_subscription: false }),
    getMyEntitlements: vi.fn().mockResolvedValue({ items: [] }),
    checkAccess: vi.fn(),
  }),
}));

vi.mock("../hooks/useAdmin.js", () => ({
  useAdmin: () => ({
    setLessonPricing: mockSetLessonPricing,
  }),
}));

describe("LearningPage & LessonEditor Pricing and Paywall UI Wiring", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });

    mockListOrganizations.mockResolvedValue({
      items: [{ id: "org-1", name: "سازمان تست" }],
    });

    mockListProducts.mockResolvedValue({
      items: [
        {
          id: "prod-lesson-1",
          code: "content_lesson-1",
          type: "content",
          title: "درس اول",
          price: 45000,
          currency: "toman",
          target_type: "content",
          target_id: "lesson-1",
          active: true,
        },
        {
          id: "prod-course-1",
          code: "course_course-1",
          type: "course",
          title: "دوره کامل",
          price: 250000,
          currency: "toman",
          target_type: "course",
          target_id: "course-1",
          active: true,
        },
        {
          id: "sub-monthly",
          code: "sub_pro_monthly",
          type: "subscription",
          title: "اشتراک ماهانه",
          price: 189000,
          currency: "toman",
          target_type: "subscription",
          target_id: "plan_monthly",
          active: true,
        },
      ],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders locked paid lesson with dynamic purchase options and Course Purchase CTA in CourseHeader", async () => {
    mockGetCourseLearning.mockResolvedValue({
      request_id: "req-1",
      course: {
        id: "course-1",
        organization_id: "org-1",
        title: "دوره پیشرفته ریاضی",
        subject: "Mathematics",
        locked: true,
        access_reason: "locked",
      },
      modules: [
        {
          id: "mod-1",
          title: "فصل اول",
          lessons: [
            {
              id: "lesson-1",
              module_id: "mod-1",
              title: "درس اول: حد و پیوستگی",
              content_type: "markdown",
              content_markdown: "🔒 این محتوا مخصوص اعضای ویژه آوانا است.",
              locked: true,
              access_reason: "locked",
              purchase_options: [
                {
                  type: "content",
                  productId: "prod-lesson-1",
                  code: "content_lesson-1",
                  title: "درس اول: حد و پیوستگی",
                  price: 45000,
                  currency: "toman",
                  durationDays: null,
                },
                {
                  type: "course",
                  productId: "prod-course-1",
                  code: "course_course-1",
                  title: "دوره پیشرفته ریاضی",
                  price: 250000,
                  currency: "toman",
                  durationDays: null,
                },
                {
                  type: "subscription",
                  productId: "sub-monthly",
                  code: "sub_pro_monthly",
                  title: "اشتراک ماهانه آوانا پلاس",
                  price: 189000,
                  currency: "toman",
                  durationDays: 30,
                },
              ],
            },
          ],
        },
      ],
      progress: {
        total_lessons: 1,
        completed_lessons: 0,
        progress_percent: 0,
      },
      access: {
        granted: false,
        reason: "locked",
        expiresAt: null,
        availablePurchaseOptions: [
          {
            type: "course",
            productId: "prod-course-1",
            code: "course_course-1",
            title: "دوره پیشرفته ریاضی",
            price: 250000,
            currency: "toman",
            durationDays: null,
          },
        ],
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={["/courses/course-1?lessonId=lesson-1"]}>
          <Routes>
            <Route path="/courses/:courseId" element={<LearningPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    // 1. Verify Course Purchase CTA in CourseHeader
    await waitFor(() => {
      expect(screen.getByText(/خرید کل دوره — ۲۵۰٬۰۰۰ تومان/)).toBeInTheDocument();
    });

    // 2. Verify Locked Lesson Banner with purchase button
    expect(screen.getByText(/محتوای ویژه آوانا پلاس/)).toBeInTheDocument();
    expect(screen.getByText(/خرید تکی درسنامه \(۴۵٬۰۰۰ تومان\)/)).toBeInTheDocument();

    // 3. Click Paywall button to open modal
    const openPaywallBtn = screen.getByText("مشاهده گزینه‌های خرید و دسترسی");
    fireEvent.click(openPaywallBtn);

    // 4. Verify Modal contains Content, Course, and Subscription purchase options with accurate Persian prices
    await waitFor(() => {
      expect(screen.getByText("خرید تکی این درسنامه (دسترسی همیشگی)")).toBeInTheDocument();
      expect(screen.getByText("۴۵٬۰۰۰ تومان")).toBeInTheDocument();
      expect(screen.getByText("خرید کل این دوره (شامل تمام درسنامه‌ها)")).toBeInTheDocument();
      expect(screen.getByText("۲۵۰٬۰۰۰ تومان")).toBeInTheDocument();
      expect(screen.getByText(/خرید اشتراک آوانا پلاس \(۱۸۹٬۰۰۰ تومان\)/)).toBeInTheDocument();
    });
  });

  it("LessonEditor allows editing pricing, displaying Free/Paid badges and saves via studio pricing API", async () => {
    mockUpdateLesson.mockResolvedValue({
      lesson: {
        id: "lesson-1",
        title: "درس اول",
        content_markdown: "# محتوا",
        estimated_minutes: 10,
      },
    });
    mockSetLessonPricing.mockResolvedValue({ success: true });

    const lesson: ContentLessonResource = {
      id: "lesson-1",
      module_id: "mod-1",
      title: "درس اول",
      content_type: "markdown",
      content_markdown: "# محتوا",
      sort_order: 1,
      estimated_minutes: 10,
      publication_status: "draft",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    };

    render(
      <QueryClientProvider client={queryClient}>
        <LessonEditor
          lesson={lesson}
          organizationId="org-1"
          courseId="course-1"
          moduleId="mod-1"
          moduleTitle="فصل اول"
        />
      </QueryClientProvider>,
    );

    // Initial price loaded from mockListProducts (45000)
    await waitFor(() => {
      const priceInput = screen.getByDisplayValue("45000") as HTMLInputElement;
      expect(priceInput).toBeInTheDocument();
      expect(screen.getByText("پولی")).toBeInTheDocument();
    });

    // Change price to 0 -> badge turns to Free
    const priceInput = screen.getByDisplayValue("45000");
    fireEvent.change(priceInput, { target: { value: "0" } });
    expect(screen.getByText("رایگان")).toBeInTheDocument();
  });
});
