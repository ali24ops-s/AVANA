import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CourseReviewSummaryView } from "../components/documents/CourseReviewSummaryView.js";
import { ReviewSummaryViewer } from "../components/documents/ReviewSummaryViewer.js";
import { PersonalSummaryConfirmationModal } from "../components/documents/PersonalSummaryConfirmationModal.js";

// Mocks
const mockGetReviewSummary = vi.fn();
const mockTriggerReviewSummary = vi.fn();
const mockListDocuments = vi.fn();
const mockGetPersonalSummary = vi.fn();
const mockGeneratePersonalSummary = vi.fn();
const mockGetMyWallet = vi.fn();

vi.mock("../lib/api/generation.js", () => ({
  createGenerationApi: () => ({
    getReviewSummary: mockGetReviewSummary,
    triggerReviewSummary: mockTriggerReviewSummary,
  }),
}));

vi.mock("../lib/api/documents.js", () => ({
  createDocumentsApi: () => ({
    listDocuments: mockListDocuments,
  }),
}));

vi.mock("../lib/api/personal-summary.js", () => ({
  createPersonalSummaryApi: () => ({
    getPersonalSummary: mockGetPersonalSummary,
    generatePersonalSummary: mockGeneratePersonalSummary,
  }),
}));

vi.mock("../lib/api/wallet.js", () => ({
  createWalletApi: () => ({
    getMyWallet: mockGetMyWallet,
  }),
}));

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "user-123", email: "student@avana.ir" },
    memberships: [],
  })),
}));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const mockModules = [
  {
    id: "mod-1",
    title: "فصل اول: فارماکولوژی قلب",
    document_id: "doc-1",
    sort_order: 1,
  },
];

const officialPayload = {
  kind: "review_summary",
  title: "خلاصه فارماکولوژی قلب",
  estimatedReadingMinutes: 10,
  overview: "مرور نکات کلیدی داروهای قلبی عروقی",
  sections: [
    {
      title: "بتا بلوکرها",
      keyPoints: ["پروپرانولول غیرانتخابی است"],
      examPoints: ["کنترااندیکاسیون در آسم"],
    },
  ],
};

const personalPayload = {
  kind: "review_summary",
  title: "خلاصه شخصی فارماکولوژی قلب",
  estimatedReadingMinutes: 8,
  overview: "خلاصه شخصی‌سازی‌شده بر مبنای یادداشت‌ها و هایلایت‌های شما",
  sections: [
    {
      title: "نکات مهم هایلایت‌شده",
      keyPoints: ["متوپرولول بتا-۱ انتخابی است"],
      examPoints: ["کاهش مرگ و میر در نارسایی قلبی"],
    },
  ],
};

describe("Personal Summary: Tab Separation & 4 Display States (Requirement 4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMyWallet.mockResolvedValue({
      balance: 10000,
      currency: "TOMAN",
      organization_id: "org-1",
    });
  });

  it("State 1: When BOTH official Avana summary AND personal summary exist, renders both tabs and allows switching", async () => {
    mockGetReviewSummary.mockResolvedValue({
      content: {
        id: "gen-1",
        status: "draft",
        payload: officialPayload,
      },
    });

    mockGetPersonalSummary.mockResolvedValue({
      has_personal_summary: true,
      summary: {
        id: "p-1",
        userId: "user-123",
        moduleId: "mod-1",
        version: 1,
        status: "completed",
        payload: personalPayload,
        highlightsCount: 5,
        notesCount: 2,
        costToman: 3000,
        createdAt: "2026-11-03T10:00:00Z",
      },
      current_annotations: {
        highlights_count: 5,
        notes_count: 2,
        total_count: 7,
        has_new_annotations: false,
      },
      cost_toman: 3000,
    });

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={mockModules}
      />,
      { wrapper: createWrapper() },
    );

    // Verify tab list is present
    const tabList = await screen.findByRole("tablist", { name: "نوع خلاصه" });
    expect(tabList).toBeDefined();

    // Verify both tab buttons exist
    const officialTab = screen.getByRole("tab", { name: /خلاصه رسمی آوانا/ });
    const personalTab = screen.getByRole("tab", { name: /خلاصه شخصی من/ });
    expect(officialTab).toBeDefined();
    expect(personalTab).toBeDefined();

    // Switch to personal tab
    fireEvent.click(personalTab);

    // Personal badges should be visible
    const personalLabels = await screen.findAllByText("خلاصه شخصی من");
    expect(personalLabels.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/۵\s*هایلایت • ۲\s*یادداشت/)).toBeDefined();
    expect(screen.getByText("متوپرولول بتا-۱ انتخابی است")).toBeDefined();

    // Switch back to official tab
    fireEvent.click(officialTab);
    expect(await screen.findByText("پروپرانولول غیرانتخابی است")).toBeDefined();
  });

  it("State 2: When ONLY personal summary exists, displays personal summary directly with notice", async () => {
    mockGetReviewSummary.mockResolvedValue({
      content: null,
    });

    mockGetPersonalSummary.mockResolvedValue({
      has_personal_summary: true,
      summary: {
        id: "p-1",
        userId: "user-123",
        moduleId: "mod-1",
        version: 1,
        status: "completed",
        payload: personalPayload,
        highlightsCount: 3,
        notesCount: 1,
        costToman: 3000,
        createdAt: "2026-11-03T10:00:00Z",
      },
      current_annotations: {
        highlights_count: 3,
        notes_count: 1,
        total_count: 4,
        has_new_annotations: false,
      },
      cost_toman: 3000,
    });

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={mockModules}
      />,
      { wrapper: createWrapper() },
    );

    // Notice that official summary is not ready yet
    expect(
      await screen.findByText(/خلاصه رسمی آوانا برای این فصل هنوز آماده نشده است/),
    ).toBeDefined();

    // Personal summary content is rendered directly
    expect(screen.getByText("متوپرولول بتا-۱ انتخابی است")).toBeDefined();
    expect(screen.getByText(/۳ هایلایت • ۱ یادداشت/)).toBeDefined();
  });

  it("State 3: When ONLY official summary exists and user has annotations, renders official summary + personal CTA banner", async () => {
    mockGetReviewSummary.mockResolvedValue({
      content: {
        id: "gen-1",
        status: "draft",
        payload: officialPayload,
      },
    });

    mockGetPersonalSummary.mockResolvedValue({
      has_personal_summary: false,
      summary: null,
      current_annotations: {
        highlights_count: 4,
        notes_count: 2,
        total_count: 6,
        has_new_annotations: true,
      },
      cost_toman: 3000,
    });

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={mockModules}
      />,
      { wrapper: createWrapper() },
    );

    // Official content rendered
    expect(await screen.findByText("پروپرانولول غیرانتخابی است")).toBeDefined();

    // Personal CTA banner rendered with highlight/note count and 3,000 Toman badge
    expect(screen.getByText("تولید خلاصه شخصی اختصاصی شما")).toBeDefined();
    expect(screen.getByText("۳٬۰۰۰ تومان")).toBeDefined();
    expect(screen.getByText(/۴ هایلایت و ۲ یادداشت/)).toBeDefined();
    expect(screen.getByRole("button", { name: "ساخت خلاصه شخصی من" })).toBeDefined();
  });

  it("State 4: When NEITHER summary exists and user has annotations, renders personal generation CTA card", async () => {
    mockGetReviewSummary.mockResolvedValue({
      content: null,
    });

    mockGetPersonalSummary.mockResolvedValue({
      has_personal_summary: false,
      summary: null,
      current_annotations: {
        highlights_count: 7,
        notes_count: 3,
        total_count: 10,
        has_new_annotations: true,
      },
      cost_toman: 3000,
    });

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={mockModules}
      />,
      { wrapper: createWrapper() },
    );

    expect(
      await screen.findByText("تولید خلاصه شخصی بر اساس هایلایت‌ها و یادداشت‌های شما"),
    ).toBeDefined();
    expect(screen.getByText(/۷ هایلایت و ۳ یادداشت/)).toBeDefined();
    expect(screen.getByText("(خلاصه رسمی آوانا برای این فصل هنوز منتشر نشده است)")).toBeDefined();
    expect(
      screen.getByRole("button", { name: "ساخت خلاصه شخصی من (۳٬۰۰۰ تومان)" }),
    ).toBeDefined();
  });

  it("State 4 (Zero Annotations): When NEITHER summary exists and user has 0 annotations, renders educational empty state", async () => {
    mockGetReviewSummary.mockResolvedValue({
      content: null,
    });

    mockGetPersonalSummary.mockResolvedValue({
      has_personal_summary: false,
      summary: null,
      current_annotations: {
        highlights_count: 0,
        notes_count: 0,
        total_count: 0,
        has_new_annotations: false,
      },
      cost_toman: 3000,
    });

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={mockModules}
      />,
      { wrapper: createWrapper() },
    );

    expect(
      await screen.findByText("خلاصه مروری هنوز برای این فصل ایجاد نشده است"),
    ).toBeDefined();
    expect(
      screen.getByText(/خلاصه رسمی آوانا به زودی پس از انتشار در دسترس قرار خواهد گرفت/),
    ).toBeDefined();
  });
});

describe("Personal Summary: Confirmation Modal & Transparent Pricing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders confirmation modal with 3,000 Toman fee, wallet balance, and annotations count", async () => {
    mockGetMyWallet.mockResolvedValue({
      balance: 15000,
      currency: "TOMAN",
      organization_id: "org-1",
    });

    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <PersonalSummaryConfirmationModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        chapterTitle="فارماکولوژی قلب"
        highlightsCount={6}
        notesCount={2}
        costToman={3000}
      />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText("ساخت خلاصه شخصی من")).toBeDefined();
    expect(screen.getAllByText(/۳,۰۰۰ تومان/).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText(/۱۵,۰۰۰ تومان/)).toBeDefined(); // async balance
    expect(screen.getByText(/۶\s*هایلایت • ۲\s*یادداشت/)).toBeDefined();

    const confirmBtn = await screen.findByRole("button", { name: /تأیید و پرداخت/ });
    expect(confirmBtn).toBeDefined();
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders insufficient balance warning and charge CTA when wallet balance is below 3,000 Tomans", async () => {
    mockGetMyWallet.mockResolvedValue({
      balance: 1000, // < 3000
      currency: "TOMAN",
      organization_id: "org-1",
    });

    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <PersonalSummaryConfirmationModal
        isOpen={true}
        onClose={onClose}
        onConfirm={onConfirm}
        chapterTitle="فارماکولوژی قلب"
        highlightsCount={4}
        notesCount={1}
        costToman={3000}
      />,
      { wrapper: createWrapper() },
    );

    expect(await screen.findByText("موجودی کیف پول شما برای این عملیات کافی نیست")).toBeDefined();
    expect(screen.getByText(/افزایش موجودی کیف پول/)).toBeDefined();

    // Confirm button is disabled
    const confirmBtn = screen.getByRole("button", { name: /تأیید و پرداخت/ });
    expect(confirmBtn.getAttribute("disabled")).not.toBeNull();
  });
});

describe("ReviewSummaryViewer: Personal Summary Mode", () => {
  it("renders personal summary version, reading time, and regenerate action", () => {
    const onRegenerate = vi.fn();

    render(
      <ReviewSummaryViewer
        organizationId="org-1"
        documentId="doc-1"
        isPersonalSummary={true}
        personalPayload={personalPayload as any}
        personalSummaryVersion={2}
        highlightsCount={8}
        notesCount={3}
        hasNewAnnotations={true}
        onRegeneratePersonal={onRegenerate}
      />,
      { wrapper: createWrapper() },
    );

    expect(screen.getByText("خلاصه شخصی من")).toBeDefined();
    expect(screen.getByText("نسخه ۲")).toBeDefined();
    expect(screen.getByText(/۸ هایلایت • ۳ یادداشت/)).toBeDefined();
    expect(screen.getByText(/شما هایلایت‌ها یا یادداشت‌های جدیدی در این فصل ثبت کرده‌اید/)).toBeDefined();

    const regenBtn = screen.getByRole("button", { name: /به‌روزرسانی خلاصه شخصی \(۳٬۰۰۰ تومان\)/ });
    expect(regenBtn).toBeDefined();
    fireEvent.click(regenBtn);
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });
});
