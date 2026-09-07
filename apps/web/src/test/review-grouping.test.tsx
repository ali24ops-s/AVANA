import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReviewQueueList } from "../components/review/ReviewQueueList.js";
import { ReviewDocumentGroup } from "../components/review/ReviewDocumentGroup.js";
import type { ReviewDocumentGroupResource } from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Admin Review Grouping UI & Interactions", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockCourseId = "00000000-0000-0000-0000-000000000002";

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("ReviewDocumentGroup renders header with filename, stats breakdown, and items", () => {
    const mockGroup: ReviewDocumentGroupResource = {
      document: {
        id: "doc-101",
        filename: "pharmacology-chapter-12.pdf",
        title: "فارماکولوژی فصل ۱۲",
        created_at: "2026-08-20T10:00:00Z",
      },
      stats: {
        total: 6,
        pending: 4,
        approved: 1,
        rejected: 1,
        needsRevision: 0,
      },
      items: [
        {
          id: "content-1",
          document_id: "doc-101",
          course_id: mockCourseId,
          type: "lesson",
          status: "draft",
          title: "درسنامه گیرنده‌های آدرنرژیک",
          updated_at: "2026-08-20T10:00:00Z",
        },
        {
          id: "content-2",
          document_id: "doc-101",
          course_id: mockCourseId,
          type: "flashcard",
          status: "draft",
          title: "مجموعه فلش‌کارت‌های آدرنرژیک",
          updated_at: "2026-08-20T10:00:00Z",
        },
        {
          id: "content-3",
          document_id: "doc-101",
          course_id: mockCourseId,
          type: "quiz",
          status: "draft",
          title: "آزمون ارزیابی داروشناسی",
          updated_at: "2026-08-20T10:00:00Z",
        },
      ],
    };

    const onSelectItem = vi.fn();

    render(
      <ReviewDocumentGroup
        group={mockGroup}
        onSelectItem={onSelectItem}
        defaultExpanded={true}
      />,
    );

    // 1. Verify header elements
    expect(screen.getByText("pharmacology-chapter-12.pdf")).toBeDefined();
    expect(screen.getByText("6 خروجی")).toBeDefined();
    expect(screen.getByText("4 در انتظار بازبینی")).toBeDefined();
    expect(screen.getByText("1 تأیید شده")).toBeDefined();
    expect(screen.getByText("1 رد شده")).toBeDefined();

    // 2. Default is expanded (defaultExpanded = true) -> items are visible
    expect(screen.getByText("درسنامه گیرنده‌های آدرنرژیک")).toBeDefined();
    expect(screen.getByText("مجموعه فلش‌کارت‌های آدرنرژیک")).toBeDefined();
    expect(screen.getByText("آزمون ارزیابی داروشناسی")).toBeDefined();

    // 3. Click item
    fireEvent.click(screen.getByText("درسنامه گیرنده‌های آدرنرژیک"));
    expect(onSelectItem).toHaveBeenCalledWith("content-1");

    // 4. Test collapse toggle
    const toggleBtn = screen.getByRole("button", { name: /pharmacology-chapter-12.pdf/i });
    fireEvent.click(toggleBtn);

    // Items should be collapsed
    expect(screen.queryByText("درسنامه گیرنده‌های آدرنرژیک")).toBeNull();

    // Click again to expand
    fireEvent.click(toggleBtn);
    expect(screen.getByText("درسنامه گیرنده‌های آدرنرژیک")).toBeDefined();
  });

  it("ReviewDocumentGroup defaults to collapsed when pending count is 0", () => {
    const mockCompletedGroup: ReviewDocumentGroupResource = {
      document: {
        id: "doc-completed",
        filename: "anatomy-intro.pdf",
        title: "آناتومی عمومی",
        created_at: "2026-08-20T10:00:00Z",
      },
      stats: {
        total: 2,
        pending: 0,
        approved: 2,
        rejected: 0,
        needsRevision: 0,
      },
      items: [],
    };

    render(
      <ReviewDocumentGroup
        group={mockCompletedGroup}
        onSelectItem={vi.fn()}
      />,
    );

    expect(screen.getByText("anatomy-intro.pdf")).toBeDefined();
    expect(screen.getByText("2 تأیید شده")).toBeDefined();
    // Default collapsed
    expect(screen.queryByText("موردی با فیلتر فعلی برای این فایل یافت نشد.")).toBeNull();
  });

  it("ReviewDocumentGroup renders Unknown Source group gracefully", () => {
    const mockUnknownGroup: ReviewDocumentGroupResource = {
      document: null,
      stats: {
        total: 1,
        pending: 1,
        approved: 0,
        rejected: 0,
        needsRevision: 0,
      },
      items: [
        {
          id: "content-orphan",
          document_id: "" as any,
          course_id: mockCourseId,
          type: "lesson",
          status: "draft",
          title: "درس بدون فایل منبع",
          updated_at: "2026-08-20T10:00:00Z",
        },
      ],
    };

    render(
      <ReviewDocumentGroup
        group={mockUnknownGroup}
        onSelectItem={vi.fn()}
        defaultExpanded={true}
      />,
    );

    expect(screen.getByText("منبع نامشخص")).toBeDefined();
    expect(screen.getByText("درس بدون فایل منبع")).toBeDefined();
  });

  it("ReviewQueueList implements Single-Select Accordion (all collapsed initially, only 1 open at a time)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: "req-grouped",
        groups: [
          {
            document: {
              id: "doc-1",
              filename: "pharma-ch12.pdf",
              title: "فارماکولوژی",
              created_at: "2026-08-20T10:00:00Z",
            },
            stats: {
              total: 3,
              pending: 3,
              approved: 0,
              rejected: 0,
              needsRevision: 0,
            },
            items: [
              {
                id: "c-1",
                document_id: "doc-1",
                course_id: mockCourseId,
                type: "lesson",
                status: "draft",
                title: "آگونیست‌های آدرنرژیک",
                updated_at: "2026-08-20T10:00:00Z",
              },
            ],
          },
          {
            document: {
              id: "doc-2",
              filename: "cardio-ch3.pdf",
              title: "قلب و عروق",
              created_at: "2026-08-20T10:00:00Z",
            },
            stats: {
              total: 2,
              pending: 2,
              approved: 0,
              rejected: 0,
              needsRevision: 0,
            },
            items: [
              {
                id: "c-2",
                document_id: "doc-2",
                course_id: mockCourseId,
                type: "flashcard",
                status: "draft",
                title: "فلش‌کارت‌های نوار قلب",
                updated_at: "2026-08-20T10:00:00Z",
              },
            ],
          },
        ],
        pending: [],
        pagination: {
          page: 1,
          limit: 20,
          total: 2,
          totalPages: 1,
        },
      }),
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ReviewQueueList
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // 1. Initial render: both file headers visible, but all accordions are collapsed (items not visible)
    await waitFor(() => {
      expect(screen.getByText("pharma-ch12.pdf")).toBeDefined();
      expect(screen.getByText("cardio-ch3.pdf")).toBeDefined();
    });
    expect(screen.queryByText("آگونیست‌های آدرنرژیک")).toBeNull();
    expect(screen.queryByText("فلش‌کارت‌های نوار قلب")).toBeNull();

    // 2. Click Group 1 to open it
    fireEvent.click(screen.getByText("pharma-ch12.pdf"));

    // Group 1 items are now visible, Group 2 items still collapsed
    expect(screen.getByText("آگونیست‌های آدرنرژیک")).toBeDefined();
    expect(screen.queryByText("فلش‌کارت‌های نوار قلب")).toBeNull();

    // 3. Click Group 2 to open it -> Group 1 must automatically collapse! (Single-select accordion)
    fireEvent.click(screen.getByText("cardio-ch3.pdf"));

    expect(screen.queryByText("آگونیست‌های آدرنرژیک")).toBeNull();
    expect(screen.getByText("فلش‌کارت‌های نوار قلب")).toBeDefined();

    // 4. Click Group 2 again -> toggles closed (all collapsed)
    fireEvent.click(screen.getByText("cardio-ch3.pdf"));
    expect(screen.queryByText("آگونیست‌های آدرنرژیک")).toBeNull();
    expect(screen.queryByText("فلش‌کارت‌های نوار قلب")).toBeNull();
  });

  it("Bulk Approve: renders 'تأیید همه' button, opens confirmation dialog, and triggers accept-all API", async () => {
    global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (opts?.method === "POST" && url.includes("/accept-all")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-bulk-done",
            document_id: "doc-1",
            total_items: 2,
            accepted_count: 2,
            already_accepted_count: 0,
            accepted_content_ids: ["c-1", "c-2"],
            results: [
              { content_id: "c-1", type: "lesson", status: "accepted", materialized_lesson_id: "les-1" },
              { content_id: "c-2", type: "flashcard", status: "accepted", materialized_lesson_id: null },
            ],
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-init",
          groups: [
            {
              document: {
                id: "doc-1",
                filename: "cardio-pack.pdf",
                title: "قلب و عروق",
                created_at: "2026-08-20T10:00:00Z",
              },
              stats: {
                total: 2,
                pending: 2,
                approved: 0,
                rejected: 0,
                needsRevision: 0,
              },
              items: [
                {
                  id: "c-1",
                  document_id: "doc-1",
                  course_id: mockCourseId,
                  type: "lesson",
                  status: "draft",
                  title: "درس قلب",
                  updated_at: "2026-08-20T10:00:00Z",
                },
              ],
            },
          ],
          pending: [],
          pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
        }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ReviewQueueList
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // 1. Check 'تأیید همه' button appears
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /تأیید همه پیش‌نویس‌های cardio-pack.pdf/i })).toBeDefined();
    });

    const approveAllBtn = screen.getByRole("button", { name: /تأیید همه پیش‌نویس‌های cardio-pack.pdf/i });
    fireEvent.click(approveAllBtn);

    // 2. Modal should open with confirmation text and pending count (2 مورد)
    expect(screen.getByText("تأیید یکجای محتوای بسته")).toBeDefined();
    expect(screen.getByText("2 مورد")).toBeDefined();

    // 3. Confirm button in modal
    const confirmBtn = screen.getByRole("button", { name: /تأیید و افزودن به دوره/i });
    fireEvent.click(confirmBtn);

    // 4. Verify API call
    await waitFor(() => {
      const calls = (global.fetch as any).mock.calls;
      const acceptAllCall = calls.find((c: any) => c[0].includes("/documents/doc-1/accept-all"));
      expect(acceptAllCall).toBeDefined();
      expect(acceptAllCall[1].method).toBe("POST");
    });
  });

  it("Bulk Approve: renders disabled 'همه تأیید شده' when pack has 0 pending items", () => {
    const mockAllApprovedGroup: ReviewDocumentGroupResource = {
      document: {
        id: "doc-done",
        filename: "completed-pack.pdf",
        title: "بسته کامل شده",
        created_at: "2026-08-20T10:00:00Z",
      },
      stats: {
        total: 3,
        pending: 0,
        approved: 3,
        rejected: 0,
        needsRevision: 0,
      },
      items: [],
    };

    render(
      <ReviewDocumentGroup
        group={mockAllApprovedGroup}
        onSelectItem={vi.fn()}
        onApproveAll={vi.fn()}
      />,
    );

    expect(screen.getByText("همه تأیید شده")).toBeDefined();
    expect(screen.queryByText("تأیید همه")).toBeNull();
  });
});
