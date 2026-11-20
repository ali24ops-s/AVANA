import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SourceProductionPanel } from "../components/admin/studio/SourceProductionPanel.js";
import type { OfficialCourse } from "../lib/api/admin.js";
import type { DocumentResource } from "@avana/contracts";

const mockUseAuth = vi.fn();
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => mockUseAuth(),
}));

const mockTriggerPurge = vi.fn();
vi.mock("../hooks/useAdmin.js", () => ({
  useAdmin: () => ({
    officialContentStudio: {
      triggerOfficialGeneration: vi.fn(),
      purgeGeneratedContent: (...args: any[]) => mockTriggerPurge(...args),
    },
  }),
}));

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const mockCourse: OfficialCourse = {
  id: "test-course-uuid",
  name: "دوره جامع داروشناسی",
  description: "دوره تستی رسمی",
  level: "intermediate",
  subject: "پزشکی",
  organizationId: "test-org-uuid",
  status: "draft",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  modules_count: 1,
  lessons_count: 2,
  flashcards_count: 5,
  quizzes_count: 1,
};

function createMockDoc(
  id: string,
  courseId: string,
  name: string,
  status: DocumentResource["status"] = "ready",
): DocumentResource {
  return {
    id,
    organization_id: "test-org-uuid",
    course_id: courseId,
    owner_user_id: "user-1",
    original_name: name,
    mime_type: "application/pdf",
    size_bytes: 2 * 1024 * 1024,
    sha256: `sha-${id}`,
    status,
    error_code: null,
    retry_count: 0,
    created_at: new Date(2026, 0, 1).toISOString(),
    updated_at: new Date(2026, 0, 1).toISOString(),
  };
}

describe("SourceProductionPanel AI Generated Content Deletion UI", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();

    // Default: platform_admin
    mockUseAuth.mockReturnValue({
      user: { role: "platform_admin" },
      memberships: [{ role: "platform_admin" }],
    });

    // Default mock fetch for documents & content status
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/documents")) {
        return new Response(
          JSON.stringify({
            request_id: "req-1",
            items: [
              createMockDoc("doc-gen-1", mockCourse.id, "pharmacology_guide.pdf", "ready"),
            ],
            pagination: { total: 1, page: 1, limit: 100, total_pages: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr.includes("/content-status")) {
        return new Response(
          JSON.stringify({
            all_generated: true,
            lesson: { generated: true, count: 2 },
            flashcards: { generated: true, count: 5 },
            exam: { generated: true, count: 1 },
            review_summary: { generated: true },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
  });

  it("1. Renders «حذف محتوا» button for authorized admin when content has been generated", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SourceProductionPanel course={mockCourse} organizationId="test-org-uuid" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("pharmacology_guide.pdf")).toBeInTheDocument();
    });

    const purgeBtn = await screen.findByRole("button", { name: "حذف محتوا" });
    expect(purgeBtn).toBeInTheDocument();
    expect(purgeBtn).not.toBeDisabled();

    // Verify source document deletion button is distinct and clearly labeled
    const deleteDocBtn = screen.getByRole("button", { name: "حذف فایل منبع" });
    expect(deleteDocBtn).toBeInTheDocument();
  });

  it("2. Does NOT show «حذف محتوا» button for unauthorized roles (e.g. student)", async () => {
    mockUseAuth.mockReturnValue({
      user: { role: "student" },
      memberships: [{ role: "student" }],
    });

    render(
      <QueryClientProvider client={queryClient}>
        <SourceProductionPanel course={mockCourse} organizationId="test-org-uuid" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("pharmacology_guide.pdf")).toBeInTheDocument();
    });

    expect(screen.queryByRole("button", { name: "حذف محتوا" })).not.toBeInTheDocument();
  });

  it("3. Disables «حذف محتوا» button when course or pipeline is actively generating", async () => {
    const generatingCourse: OfficialCourse = {
      ...mockCourse,
      status: "generating",
    };

    render(
      <QueryClientProvider client={queryClient}>
        <SourceProductionPanel course={generatingCourse} organizationId="test-org-uuid" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("pharmacology_guide.pdf")).toBeInTheDocument();
    });

    const purgeBtn = await screen.findByRole("button", { name: "حذف محتوا" });
    expect(purgeBtn).toBeDisabled();
    expect(purgeBtn).toHaveAttribute(
      "title",
      "تا پایان تولید محتوا امکان حذف وجود ندارد.",
    );
  });

  it("4. Opens PurgeGeneratedContentModal with exact required Persian text and buttons on click", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SourceProductionPanel course={mockCourse} organizationId="test-org-uuid" />
      </QueryClientProvider>,
    );

    const purgeBtn = await screen.findByRole("button", { name: "حذف محتوا" });
    fireEvent.click(purgeBtn);

    // Modal opens
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("حذف محتوای تولیدشده")).toBeInTheDocument();

    // Exact required Persian copy
    expect(
      screen.getByText(
        "تمام محتوای تولیدشده از این فایل، شامل درسنامه‌ها، آزمون‌ها و فلش‌کارت‌ها حذف خواهد شد. فایل منبع و اطلاعات اصلی آن حفظ می‌شوند. این عملیات قابل بازگشت نیست.",
      ),
    ).toBeInTheDocument();

    // Displays target document name in card and modal
    expect(screen.getAllByText("pharmacology_guide.pdf").length).toBeGreaterThanOrEqual(2);

    // Buttons
    expect(screen.getByRole("button", { name: "انصراف" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حذف دائمی محتوا" })).toBeInTheDocument();
  });

  it("5. Closes modal when user clicks «انصراف» without triggering deletion API", async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <SourceProductionPanel course={mockCourse} organizationId="test-org-uuid" />
      </QueryClientProvider>,
    );

    const purgeBtn = await screen.findByRole("button", { name: "حذف محتوا" });
    fireEvent.click(purgeBtn);

    const cancelBtn = screen.getByRole("button", { name: "انصراف" });
    fireEvent.click(cancelBtn);

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    expect(mockTriggerPurge).not.toHaveBeenCalled();
  });

  it("6. Successfully executes deletion, prevents duplicate calls, closes modal, and shows success banner while preserving source file", async () => {
    mockTriggerPurge.mockResolvedValueOnce({
      success: true,
      documentId: "doc-gen-1",
      documentStatus: "extracted",
      deletedSummary: {
        lessonsCount: 2,
        quizzesCount: 1,
        flashcardsCount: 5,
        generatedContentsCount: 2,
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <SourceProductionPanel course={mockCourse} organizationId="test-org-uuid" />
      </QueryClientProvider>,
    );

    const purgeBtn = await screen.findByRole("button", { name: "حذف محتوا" });
    fireEvent.click(purgeBtn);

    const confirmPurgeBtn = screen.getByRole("button", { name: "حذف دائمی محتوا" });
    fireEvent.click(confirmPurgeBtn);

    // Verify API called with course id and document id
    await waitFor(() => {
      expect(mockTriggerPurge).toHaveBeenCalledTimes(1);
      expect(mockTriggerPurge).toHaveBeenCalledWith(mockCourse.id, "doc-gen-1");
    });

    // Modal closes
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    // Success banner is displayed
    await waitFor(() => {
      expect(
        screen.getByText(
          /تمام محتوای تولیدشده از فایل «pharmacology_guide.pdf» با موفقیت حذف شد. فایل منبع حفظ گردید./,
        ),
      ).toBeInTheDocument();
    });

    // Source document remains in the UI
    expect(screen.getByText("pharmacology_guide.pdf")).toBeInTheDocument();
  });

  it("7. Displays backend error (e.g. 409 conflict during active generation) inside modal", async () => {
    mockTriggerPurge.mockRejectedValueOnce(
      new Error("تا زمانی که تولید محتوا از این فایل به پایان نرسیده است، امکان حذف آن وجود ندارد."),
    );

    render(
      <QueryClientProvider client={queryClient}>
        <SourceProductionPanel course={mockCourse} organizationId="test-org-uuid" />
      </QueryClientProvider>,
    );

    const purgeBtn = await screen.findByRole("button", { name: "حذف محتوا" });
    fireEvent.click(purgeBtn);

    const confirmPurgeBtn = screen.getByRole("button", { name: "حذف دائمی محتوا" });
    fireEvent.click(confirmPurgeBtn);

    // Modal remains open and shows Persian error
    await waitFor(() => {
      expect(
        screen.getByText(
          "تا زمانی که تولید محتوا از این فایل به پایان نرسیده است، امکان حذف آن وجود ندارد.",
        ),
      ).toBeInTheDocument();
    });
  });
});
