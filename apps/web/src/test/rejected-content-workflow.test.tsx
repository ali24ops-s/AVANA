import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReviewQueueList } from "../components/review/ReviewQueueList.js";
import { ContentReviewDetail } from "../components/review/ContentReviewDetail.js";
import type { ReviewQueueResponse, GeneratedContentReviewResponse } from "@avana/contracts";

const mockReviewQueue: ReviewQueueResponse = {
  request_id: "req-1",
  groups: [
    {
      document: {
        id: "doc-1",
        filename: "cardiology-notes.pdf",
        title: "Cardiology",
        created_at: "2026-09-01T10:00:00.000Z",
      },
      stats: {
        total: 2,
        pending: 1,
        approved: 0,
        rejected: 1,
        needsRevision: 0,
      },
      items: [
        {
          id: "gc-1" as any,
          document_id: "doc-1" as any,
          course_id: "course-1" as any,
          type: "lesson",
          status: "draft",
          title: "جلسه اول: مکانیسم اثر داروهای قلبی",
          updated_at: "2026-09-01T10:00:00.000Z",
        },
      ],
    },
  ],
  pending: [],
};

const mockRejectedQueue: ReviewQueueResponse = {
  request_id: "req-2",
  groups: [
    {
      document: {
        id: "doc-1",
        filename: "cardiology-notes.pdf",
        title: "Cardiology",
        created_at: "2026-09-01T10:00:00.000Z",
      },
      stats: {
        total: 2,
        pending: 0,
        approved: 0,
        rejected: 1,
        needsRevision: 0,
      },
      items: [
        {
          id: "gc-rej-1" as any,
          document_id: "doc-1" as any,
          course_id: "course-1" as any,
          type: "quiz",
          status: "rejected",
          title: "آزمون ارزیابی آموخته‌ها: قلب و عروق",
          updated_at: "2026-09-02T12:00:00.000Z",
        },
      ],
    },
  ],
  pending: [],
};

const mockEmptyQueue: ReviewQueueResponse = {
  request_id: "req-3",
  groups: [],
  pending: [],
};

const mockRejectedContentDetail: GeneratedContentReviewResponse = {
  request_id: "req-detail-1",
  content: {
    id: "gc-rej-1" as any,
    document_id: "doc-1" as any,
    course_id: "course-1" as any,
    type: "quiz",
    status: "rejected",
    payload: {
      title: "آزمون ارزیابی آموخته‌ها: قلب و عروق",
      questions: [
        {
          question: "کدام دارو در نارسایی قلبی حاد منع مصرف دارد؟",
          options: ["پروپرانولول", "دوپامین", "لازیکس", "نیتروپروساید"],
          correctAnswer: 0,
          explanation: "بتابلوکرها در نارسایی جبران‌نشده حاد منع مصرف دارند.",
        },
      ],
    },
    prompt_version: "v2.1",
    model: "gemini-1.5-pro",
    token_usage: { input_tokens: 500, output_tokens: 300 },
    citations: ["chunk-1"],
    reviewed_by: "user-admin-123",
    reviewed_at: "2026-09-02T12:00:00.000Z",
    review_reason: "کیفیت گزینه‌ها نامناسب است و گزینه ۴ دارای ابهام علمی می‌باشد.",
    edited_by: null,
    edited_at: null,
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-02T12:00:00.000Z",
  },
  source_chunks: [
    {
      id: "chunk-1" as any,
      sequence: 1,
      heading: "داروهای قلبی عروقی",
      content: "متن منبع درباره بتابلوکرها...",
      start_page: 1,
      end_page: 2,
    },
  ],
  generation: {
    model: "gemini-1.5-pro",
    prompt_version: "v2.1",
    token_usage: { input_tokens: 500, output_tokens: 300 },
  },
};

describe("Rejected Content Review Workflow UI", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.restoreAllMocks();
  });

  it("renders pending review queue items without status tabs", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockReviewQueue,
    });
    global.fetch = fetchMock;

    render(
      <QueryClientProvider client={queryClient}>
        <ReviewQueueList organizationId="org-1" courseId="course-1" />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("صف بازبینی و تایید محتوا")).toBeDefined();
      expect(screen.queryByRole("tab", { name: "رد شده‌ها" })).toBeNull();
      expect(screen.getByText("جلسه اول: مکانیسم اثر داروهای قلبی")).toBeDefined();
    });
  });

  it("renders empty state when no pending items exist in ReviewQueueList", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockEmptyQueue,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ReviewQueueList
          organizationId="org-1"
          courseId="course-1"
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("موردی در انتظار بازبینی وجود ندارد")).toBeDefined();
      expect(
        screen.getByText(/تمامی پیش‌نویس‌های تولیدشده بازبینی و تایید شده‌اند/),
      ).toBeDefined();
    });
  });

  it("renders rejection reason card with reason, reviewer, and timestamp in ContentReviewDetail", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockRejectedContentDetail,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ContentReviewDetail
          organizationId="org-1"
          courseId="course-1"
          contentId="gc-rej-1"
          onBack={vi.fn()}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("علت رد محتوا")).toBeDefined();
      expect(
        screen.getByText("کیفیت گزینه‌ها نامناسب است و گزینه ۴ دارای ابهام علمی می‌باشد."),
      ).toBeDefined();
      expect(screen.getByText(/رد شده توسط:/)).toBeDefined();
      expect(screen.getByText("بازبین محتوا")).toBeDefined();
      expect(screen.getByText("پیش‌نویس رد شده")).toBeDefined();
      expect(screen.getByText("تولید مجدد")).toBeDefined();
    });

    // 'رد کردن' and 'ویرایش محتوا' should NOT be shown for rejected content
    expect(screen.queryByText("رد کردن")).toBeNull();
    expect(screen.queryByText("ویرایش محتوا")).toBeNull();
  });
});
