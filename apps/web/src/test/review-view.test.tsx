import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReviewQueueList } from "../components/review/ReviewQueueList.js";
import { ContentReviewDetail } from "../components/review/ContentReviewDetail.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Review Queue and Detail Flow", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockCourseId = "00000000-0000-0000-0000-000000000002";
  const mockContentId = "00000000-0000-0000-0000-000000000003";

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders pending review queue items and filters", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: "req-1",
        pending: [
          {
            id: mockContentId,
            organization_id: mockOrgId,
            course_id: mockCourseId,
            document_id: "doc-1",
            type: "lesson",
            status: "draft",
            title: "Beta-Adrenergic Blockers Overview",
            updated_at: new Date().toISOString(),
          },
        ],
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

    await waitFor(() => {
      expect(screen.getByText("Beta-Adrenergic Blockers Overview")).toBeDefined();
      expect(screen.getByText("بازبینی پیش‌نویس")).toBeDefined();
    });
  });

  it("renders detail view with split preview and citations and triggers accept", async () => {
    const onBack = vi.fn();

    global.fetch = vi.fn().mockImplementation((_url: string, opts?: { method?: string }) => {
      if (opts?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-acc",
            content_id: mockContentId,
            status: "accepted",
            materialized_lesson_id: null,
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-detail",
          content: {
            id: mockContentId,
            document_id: "doc-1",
            course_id: mockCourseId,
            type: "lesson",
            status: "draft",
            payload: {
              title: "Beta-Adrenergic Blockers Overview",
              markdown: "# Beta-Blockers\n\nClinical mechanisms and pharmacology.",
            },
            prompt_version: "v1",
            model: "gemini-1.5-pro",
            token_usage: { input_tokens: 100, output_tokens: 200 },
            citations: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          source_chunks: [
            {
              id: "chunk-1",
              sequence: 0,
              heading: null,
              content: "Beta-blockers compete with catecholamines for adrenergic receptors.",
              start_page: 12,
              end_page: 12,
            },
          ],
          generation: {
            model: "gemini-1.5-pro",
            prompt_version: "lesson_generation_v1",
            token_usage: { input_tokens: 100, output_tokens: 200 },
          },
        }),
      });
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ContentReviewDetail
          organizationId={mockOrgId}
          courseId={mockCourseId}
          contentId={mockContentId}
          onBack={onBack}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getAllByText("Beta-Adrenergic Blockers Overview").length).toBeGreaterThan(0);
      expect(screen.getByText(/توالی #0/i)).toBeDefined();
      expect(
        screen.getByText(
          "Beta-blockers compete with catecholamines for adrenergic receptors.",
        ),
      ).toBeDefined();
    });

    // Click Accept & Publish
    const acceptBtn = screen.getByText("تایید و انتشار");
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(onBack).toHaveBeenCalled();
    });
  });
});
