import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  CourseReviewSummaryView,
  stripChapterPrefix,
} from "../components/documents/CourseReviewSummaryView.js";
import { ReviewSummaryViewer } from "../components/documents/ReviewSummaryViewer.js";

const mockGetReviewSummary = vi.fn();
const mockTriggerReviewSummary = vi.fn();
const mockListDocuments = vi.fn();

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

vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: vi.fn(() => ({
    user: { id: "user-1", email: "user@test.com" },
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

describe("stripChapterPrefix helper", () => {
  it("correctly strips 'فصل' prefix variations while preserving topic title", () => {
    expect(stripChapterPrefix("فصل ۱ — مبانی دستگاه عصبی")).toBe("مبانی دستگاه عصبی");
    expect(stripChapterPrefix("فصل ۲ — انتقال‌دهنده‌های عصبی")).toBe("انتقال‌دهنده‌های عصبی");
    expect(stripChapterPrefix("فصل ۳ - داروهای مؤثر بر دستگاه عصبی")).toBe("داروهای مؤثر بر دستگاه عصبی");
    expect(stripChapterPrefix("فصل اول: مقدمات")).toBe("مقدمات");
    expect(stripChapterPrefix("فصل دوم: پاتولوژی جامع")).toBe("پاتولوژی جامع");
    expect(stripChapterPrefix("فصل 1: فیزیولوژی سلولی")).toBe("فیزیولوژی سلولی");
    expect(stripChapterPrefix("فصل: بیوشیمی")).toBe("بیوشیمی");
    expect(stripChapterPrefix("مبانی آناتومی")).toBe("مبانی آناتومی");
  });
});

describe("CourseReviewSummaryView & Preview Access Control", () => {
  const mockModules = [
    {
      id: "mod-1",
      title: "فصل اول: مقدمات",
      document_id: "doc-1",
      sort_order: 1,
    },
    {
      id: "mod-2",
      title: "فصل دوم: پاتولوژی جامع",
      document_id: "doc-2",
      sort_order: 2,
    },
  ];

  const mockDocsList = {
    items: [
      {
        id: "doc-1",
        title: "فصل اول: مقدمات",
        fileName: "ch1.pdf",
        status: "ready",
      },
      {
        id: "doc-2",
        title: "فصل دوم: پاتولوژی جامع",
        fileName: "ch2.pdf",
        status: "ready",
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockListDocuments.mockResolvedValue(mockDocsList);
  });

  it("In preview mode (isPreview=true), shows chapter 1 as accessible and chapter 2 as locked with Persian index numbers", async () => {
    const onUnlock = vi.fn();
    mockGetReviewSummary.mockResolvedValue({
      content: {
        id: "summary-1",
        payload: {
          text: "محتوای خلاصه فصل اول",
          keyTakeaways: ["نکته یک"],
          sections: [{ heading: "بخش ۱", summary: "خلاصه ۱" }],
        },
      },
    });

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={mockModules as any}
        previewDocumentId="doc-1"
        isPreview={true}
        onUnlock={onUnlock}
      />,
      { wrapper: createWrapper() },
    );

    // Open drawer to inspect chapter items
    const triggerBtn = await screen.findByRole("button", { name: /نمایش سرفصل‌های دوره/i });
    expect(triggerBtn).toBeInTheDocument();
    fireEvent.click(triggerBtn);

    // Chapter 1 tab is visible in Drawer with stripped prefix and Persian sequence number
    expect(screen.getByText("مقدمات")).toBeInTheDocument();
    expect(screen.getByText("پاتولوژی جامع")).toBeInTheDocument();
    expect(screen.getByText("۱")).toBeInTheDocument();
    expect(screen.getByText("۲")).toBeInTheDocument();

    // The Free/Lock badges should be visible on Chapter tabs
    expect(screen.getByText("رایگان")).toBeInTheDocument();
    expect(screen.getByText("قفل")).toBeInTheDocument();

    // Clicking Chapter 2 should switch to Chapter 2, close drawer, and show locked card with paywall CTA
    const ch2Button = screen.getByText("پاتولوژی جامع").closest("button");
    expect(ch2Button).toBeInTheDocument();
    fireEvent.click(ch2Button!);

    // Drawer is closed immediately
    expect(screen.queryByTestId("curriculum-backdrop")).not.toBeInTheDocument();
    expect(screen.queryByTestId("curriculum-drawer")).not.toBeInTheDocument();

    // Locked paywall card is shown for chapter 2 preserving original document title in data
    expect(
      screen.getByText("خلاصه مروری فصل «فصل دوم: پاتولوژی جامع» قفل است"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/این فصل شامل خلاصه جامع نکات کلیدی، مقایسه‌ها و جمع‌بندی نکات پرتکرار آزمونی است/i),
    ).toBeInTheDocument();

    // Buttons on locked card
    expect(screen.getByText("مشاهده فصل اول (پیش‌نمایش رایگان)")).toBeInTheDocument();

    // Clicking unlock button calls onUnlock
    const unlockBtn = screen.getByRole("button", { name: /مشاهده تعرفه‌ها و خرید دوره/i });
    fireEvent.click(unlockBtn);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("In entitled mode (isPreview=false), all chapters are accessible without lock badges", async () => {
    mockGetReviewSummary.mockResolvedValue({
      content: {
        id: "summary-1",
        payload: {
          text: "محتوای خلاصه فصل اول",
          keyTakeaways: ["نکته یک"],
          sections: [{ heading: "بخش ۱", summary: "خلاصه ۱" }],
        },
      },
    });

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={mockModules as any}
        isPreview={false}
      />,
      { wrapper: createWrapper() },
    );

    // Open drawer to inspect chapters
    const triggerBtn = await screen.findByRole("button", { name: /نمایش سرفصل‌های دوره/i });
    expect(triggerBtn).toBeInTheDocument();
    fireEvent.click(triggerBtn);

    expect(screen.getByText("مقدمات")).toBeInTheDocument();
    expect(screen.getByText("۱")).toBeInTheDocument();
    expect(screen.getByText("۲")).toBeInTheDocument();
    expect(screen.queryByText("پیش‌نمایش رایگان")).not.toBeInTheDocument();
    expect(screen.queryByText("خلاصه مروری این فصل قفل است")).not.toBeInTheDocument();
  });

  it("ReviewSummaryViewer renders locked paywall gracefully when backend returns 403 Forbidden", async () => {
    const onUnlock = vi.fn();
    const forbiddenError = new Error("Forbidden access");
    (forbiddenError as any).status = 403;
    mockGetReviewSummary.mockRejectedValue(forbiddenError);

    render(
      <ReviewSummaryViewer
        organizationId="org-1"
        courseId="course-1"
        documentId="doc-2"
        documentTitle="فصل دوم"
        onUnlock={onUnlock}
      />,
      { wrapper: createWrapper() },
    );

    // Wait for the query to fail and verify paywall card is rendered
    expect(await screen.findByText("خلاصه مروری این فصل قفل است")).toBeInTheDocument();
    expect(
      screen.getByText("برای دسترسی به خلاصه مروری جامع این فصل، نکات کلیدی و نکات مهم آزمونی، دوره مربوطه را تهیه نمایید یا اشتراک آوانا پلاس را فعال کنید."),
    ).toBeInTheDocument();

    const unlockBtn = screen.getByRole("button", { name: /مشاهده تعرفه‌ها و خرید دوره/i });
    fireEvent.click(unlockBtn);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  it("renders chapter titles in lessons-like drawer navigation and handles selection and drawer lifecycle", async () => {
    const variedLengthModules = [
      {
        id: "mod-short",
        title: "قلب",
        document_id: "doc-short",
        sort_order: 1,
      },
      {
        id: "mod-long",
        title: "فصل ۲ — فارماکولوژی داروهای کاهنده فشار خون و گشادکننده عروق کرونر",
        document_id: "doc-long",
        sort_order: 2,
      },
      {
        id: "mod-very-long",
        title: "فصل ۳ — فیزیوپاتولوژی اختلالات حاد متابولیک، شوک سپتیک، مدیریت مایع‌درمانی و نارسایی ارگان‌های حیاتی در بخش مراقبت‌های ویژه",
        document_id: "doc-very-long",
        sort_order: 3,
      },
    ];

    mockGetReviewSummary.mockResolvedValue({
      content: {
        id: "summary-short",
        payload: {
          text: "محتوای خلاصه",
          keyTakeaways: ["نکته"],
          sections: [{ heading: "بخش ۱", summary: "خلاصه" }],
        },
      },
    });

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={variedLengthModules as any}
        previewDocumentId="doc-short"
        isPreview={true}
      />,
      { wrapper: createWrapper() },
    );

    // 1. Drawer is initially closed
    expect(screen.queryByTestId("curriculum-backdrop")).not.toBeInTheDocument();
    expect(screen.queryByTestId("curriculum-drawer")).not.toBeInTheDocument();

    // 2. Open drawer via trigger button
    const triggerBtn = await screen.findByRole("button", { name: /نمایش سرفصل‌های دوره/i });
    expect(triggerBtn).toBeInTheDocument();
    fireEvent.click(triggerBtn);

    // 3. Chapter items are rendered in drawer navigation
    const drawerAside = screen.getByTestId("curriculum-drawer");
    const shortTitleSpan = within(drawerAside).getByText("قلب");
    expect(shortTitleSpan).toBeInTheDocument();
    expect(shortTitleSpan.className).toContain("line-clamp-2");
    expect(shortTitleSpan.className).not.toContain("sm:truncate");

    const longTitleSpan = within(drawerAside).getByText("فارماکولوژی داروهای کاهنده فشار خون و گشادکننده عروق کرونر");
    expect(longTitleSpan).toBeInTheDocument();
    expect(longTitleSpan.className).toContain("line-clamp-2");

    const veryLongTitle = "فیزیوپاتولوژی اختلالات حاد متابولیک، شوک سپتیک، مدیریت مایع‌درمانی و نارسایی ارگان‌های حیاتی در بخش مراقبت‌های ویژه";
    const veryLongTitleSpan = within(drawerAside).getByText(veryLongTitle);
    expect(veryLongTitleSpan).toBeInTheDocument();

    // 4. Initial selected state matches lessons sidebar visual pattern
    const ch1Button = shortTitleSpan.closest("button");
    expect(ch1Button).toBeInTheDocument();
    expect(ch1Button).toHaveAttribute("aria-current", "true");
    expect(ch1Button?.className).toContain("bg-primary/10");
    expect(ch1Button?.className).toContain("border-r-3");

    // 5. Unselected items have unselected style and no aria-current
    const ch3Button = veryLongTitleSpan.closest("button");
    expect(ch3Button).toBeInTheDocument();
    expect(ch3Button).not.toHaveAttribute("aria-current");

    // 6. Persian digits and lock/preview badges are shrink-0
    const badgeNumber = within(drawerAside).getAllByText("۳")[0];
    expect(badgeNumber.className).toContain("shrink-0");
    const lockBadges = within(drawerAside).getAllByText("قفل");
    expect(lockBadges[0].parentElement?.className).toContain("shrink-0");

    // 7. Clicking backdrop closes drawer
    const backdrop = screen.getByTestId("curriculum-backdrop");
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop);
    expect(screen.queryByTestId("curriculum-backdrop")).not.toBeInTheDocument();

    // 8. Switching selection updates active state and closes drawer
    fireEvent.click(triggerBtn);
    const reOpenedDrawer = screen.getByTestId("curriculum-drawer");
    const reOpenedCh3Button = within(reOpenedDrawer).getByText(veryLongTitle).closest("button");
    fireEvent.click(reOpenedCh3Button!);
    expect(screen.queryByTestId("curriculum-backdrop")).not.toBeInTheDocument();
    expect(screen.getByText(`فصل فعال: ${veryLongTitle}`)).toBeInTheDocument();
  });

  it("verifies unified syllabus drawer interaction behavior across all viewports (trigger, backdrop, escape, and selection)", async () => {
    const testModules = [
      { id: "mod-1", title: "فصل اول: مقدمات فیزیولوژی", document_id: "doc-1", sort_order: 1 },
      { id: "mod-2", title: "فصل دوم: پاتولوژی جامع", document_id: "doc-2", sort_order: 2 },
      { id: "mod-3", title: "فصل سوم: فارماکولوژی بالینی", document_id: "doc-3", sort_order: 3 },
    ];

    mockGetReviewSummary.mockResolvedValue({
      content: {
        id: "summary-1",
        payload: {
          text: "محتوای خلاصه فصل اول",
          keyTakeaways: ["نکته ۱"],
          sections: [{ heading: "بخش ۱", summary: "خلاصه ۱" }],
        },
      },
    });

    render(
      <CourseReviewSummaryView
        organizationId="org-1"
        courseId="course-1"
        modules={testModules as any}
        previewDocumentId="doc-1"
        isPreview={false}
      />,
      { wrapper: createWrapper() },
    );

    // 1. Top trigger for syllabus is rendered with active chapter and count
    const triggerBtn = screen.getByRole("button", { name: /نمایش سرفصل‌های دوره/i });
    expect(triggerBtn).toBeInTheDocument();
    expect(triggerBtn).toHaveTextContent("سرفصل‌ها (۳)");
    expect(screen.getByText("فصل فعال: مقدمات فیزیولوژی")).toBeInTheDocument();

    // 2. Drawer and backdrop are initially NOT open/mounted
    expect(screen.queryByTestId("curriculum-backdrop")).not.toBeInTheDocument();
    expect(screen.queryByTestId("curriculum-drawer")).not.toBeInTheDocument();

    // 3. Desktop persistent sidebar does NOT exist anywhere in DOM
    expect(screen.queryByTestId("desktop-sidebar")).not.toBeInTheDocument();

    // 4. Clicking trigger opens the drawer and shows backdrop
    fireEvent.click(triggerBtn);
    const backdrop = screen.getByTestId("curriculum-backdrop");
    const drawer = screen.getByTestId("curriculum-drawer");
    expect(backdrop).toBeInTheDocument();
    expect(drawer).toBeInTheDocument();

    // 5. Clicking backdrop closes drawer without changing current selection
    fireEvent.click(backdrop);
    expect(screen.queryByTestId("curriculum-backdrop")).not.toBeInTheDocument();
    expect(screen.queryByTestId("curriculum-drawer")).not.toBeInTheDocument();

    // 6. Reopening drawer and pressing Escape key closes drawer
    fireEvent.click(triggerBtn);
    expect(screen.getByTestId("curriculum-backdrop")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("curriculum-backdrop")).not.toBeInTheDocument();

    // 7. Reopening drawer and clicking close button (X button) closes drawer
    fireEvent.click(triggerBtn);
    const closeBtn = screen.getByRole("button", { name: /بستن منوی سرفصل‌ها/i });
    fireEvent.click(closeBtn);
    expect(screen.queryByTestId("curriculum-backdrop")).not.toBeInTheDocument();

    // 8. Reopening drawer and selecting a chapter (Chapter 3) changes active chapter and immediately closes drawer
    fireEvent.click(triggerBtn);
    const drawerAside = screen.getByTestId("curriculum-drawer");
    const drawerCh3 = within(drawerAside).getByText("فارماکولوژی بالینی").closest("button");
    expect(drawerCh3).toBeInTheDocument();
    fireEvent.click(drawerCh3!);

    // Drawer is closed immediately
    expect(screen.queryByTestId("curriculum-backdrop")).not.toBeInTheDocument();
    expect(screen.queryByTestId("curriculum-drawer")).not.toBeInTheDocument();

    // Active chapter is now Chapter 3 and trigger reflects it
    expect(screen.getByText("فصل فعال: فارماکولوژی بالینی")).toBeInTheDocument();
  });
});

