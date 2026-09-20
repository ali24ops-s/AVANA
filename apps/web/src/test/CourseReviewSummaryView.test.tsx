import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

    // Chapter 1 tab is visible with stripped prefix and Persian sequence number
    expect(await screen.findByText("مقدمات")).toBeInTheDocument();
    expect(screen.getByText("پاتولوژی جامع")).toBeInTheDocument();
    expect(screen.getByText("۱")).toBeInTheDocument();
    expect(screen.getByText("۲")).toBeInTheDocument();

    // The Free/Lock badges should be visible on Chapter tabs
    expect(screen.getByText("رایگان")).toBeInTheDocument();
    expect(screen.getByText("قفل")).toBeInTheDocument();

    // Clicking Chapter 2 should switch to Chapter 2 and show locked card with paywall CTA
    const ch2Button = screen.getByText("پاتولوژی جامع").closest("button");
    expect(ch2Button).toBeInTheDocument();
    fireEvent.click(ch2Button!);

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

    expect(await screen.findByText("مقدمات")).toBeInTheDocument();
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
});
