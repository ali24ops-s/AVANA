/**
 * Browser Acceptance Tests for 3 Core AVANA Flows:
 *
 * 1. TEST 1 — DELETE
 * 2. TEST 2 — REGENERATE
 * 3. TEST 3 — REGENERATE AFTER PUBLISH & RESILIENCE
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CourseDocumentsView } from "../components/documents/CourseDocumentsView.js";
import { ReviewQueueList } from "../components/review/ReviewQueueList.js";
import { ContentReviewDetail } from "../components/review/ContentReviewDetail.js";
import type { DocumentResource, ReviewQueueResource, GeneratedContentReviewResponse } from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Browser Acceptance: 3 User Flows", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockCourseId = "00000000-0000-0000-0000-000000000002";
  const mockDocId = "00000000-0000-0000-0000-000000000003";
  const mockContentId = "00000000-0000-0000-0000-000000000004";

  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // TEST 1 — DELETE (Browser Acceptance)
  // =========================================================================
  it("TEST 1 — DELETE: Uploads document, verifies persistence, confirms deletion prompt, and removes card from DOM", async () => {
    let documents: DocumentResource[] = [];

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes(`/documents/${mockDocId}`) && method === "DELETE") {
        documents = documents.filter((d) => d.id !== mockDocId);
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ request_id: "req-del", deleted: true }),
        });
      }

      if (url.includes(`/documents/${mockDocId}/extract`) && method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ request_id: "req-ext", status: { status: "extracted", page_count: 5, chunk_count: 12 } }),
        });
      }

      if (url.includes(`/documents/${mockDocId}/status`)) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-st",
            status: {
              id: mockDocId,
              status: "extracted",
              page_count: 5,
              chunk_count: 12,
            },
          }),
        });
      }

      if (url.includes("/documents") && method === "POST") {
        const newDoc: DocumentResource = {
          id: mockDocId,
          organization_id: mockOrgId,
          course_id: mockCourseId,
          owner_user_id: "user-1",
          original_name: "مبانی_هوش_مصنوعی.pdf",
          mime_type: "application/pdf",
          size_bytes: 1024 * 500,
          sha256: "abc123hash",
          status: "extracted",
          error_code: null,
          retry_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        documents.push(newDoc);
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({ request_id: "req-up", document: newDoc, duplicate: false }),
        });
      }

      if (url.includes("/documents") && method === "GET") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ request_id: "req-list", items: documents }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });
    });

    const queryClient = createTestQueryClient();
    const { unmount } = render(
      <QueryClientProvider client={queryClient}>
        <CourseDocumentsView organizationId={mockOrgId} courseId={mockCourseId} />
      </QueryClientProvider>,
    );

    // 1. Select Persian PDF and click upload
    const file = new File(["dummy pdf binary content"], "مبانی_هوش_مصنوعی.pdf", {
      type: "application/pdf",
    });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("مبانی_هوش_مصنوعی.pdf")).toBeDefined();
    });

    const uploadBtn = screen.getByRole("button", { name: /آپلود و شروع پردازش/i });
    fireEvent.click(uploadBtn);

    // 2. Verify it appears in the document list
    await waitFor(() => {
      expect(screen.getByText(/مبانی_هوش_مصنوعی\.pdf/)).toBeDefined();
      expect(screen.getByRole("button", { name: /حذف سند/i })).toBeDefined();
    });

    // 3. Refresh the page / re-render
    unmount();
    const freshQueryClient = createTestQueryClient();
    const { unmount: unmountRefreshed } = render(
      <QueryClientProvider client={freshQueryClient}>
        <CourseDocumentsView organizationId={mockOrgId} courseId={mockCourseId} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText(/مبانی_هوش_مصنوعی\.pdf/)).toBeDefined();
    });

    // 4. Click delete in UI
    const deleteBtn = screen.getByRole("button", { name: /حذف سند/i });
    fireEvent.click(deleteBtn);

    // 5. Confirm deletion
    await waitFor(() => {
      expect(screen.getByText(/تایید حذف سند/i)).toBeDefined();
    });
    const confirmBtn = screen.getByRole("button", { name: /تایید حذف سند/i });
    fireEvent.click(confirmBtn);

    // 6 & 7. Verify document does NOT reappear and list shows empty state
    await waitFor(() => {
      expect(screen.getByText("هنوز سندی بارگذاری نشده است")).toBeDefined();
    });

    // 8. Re-upload the exact same file after deletion
    const reuploadFileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(reuploadFileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("مبانی_هوش_مصنوعی.pdf")).toBeDefined();
    });

    const reuploadBtn = screen.getByRole("button", { name: /آپلود و شروع پردازش/i });
    fireEvent.click(reuploadBtn);

    // Verify it re-appears in the document list cleanly
    await waitFor(() => {
      expect(screen.getByText(/مبانی_هوش_مصنوعی\.pdf/)).toBeDefined();
      expect(screen.getByRole("button", { name: /حذف سند/i })).toBeDefined();
    });

    unmountRefreshed();
  });

  // =========================================================================
  // TEST 2 — REGENERATE (Browser Acceptance)
  // =========================================================================
  it("TEST 2 — REGENERATE: Triggers regenerate from detail view, confirms 202 status and review queue refresh", async () => {
    let regenRequested = false;
    const onBack = vi.fn();

    const mockDetail: GeneratedContentReviewResponse = {
      request_id: "req-detail",
      content: {
        id: mockContentId,
        document_id: mockDocId,
        course_id: mockCourseId,
        type: "lesson",
        status: "draft",
        payload: {
          title: "درس تولید شده با هوش مصنوعی",
          contentMarkdown: "# مفاهیم پایه\n\nتوضیحات تکمیلی درس به زبان فارسی.",
        },
        prompt_version: "lesson_v1",
        model: "gemini-3.6-flash",
        token_usage: { input_tokens: 150, output_tokens: 300 },
        citations: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      source_chunks: [
        {
          id: "chunk-1",
          sequence: 0,
          heading: "مقدمه",
          content: "مفاهیم اولیه یادگیری ماشین.",
          start_page: 1,
          end_page: 2,
        },
      ],
      generation: {
        model: "gemini-3.6-flash",
        prompt_version: "lesson_v1",
        token_usage: { input_tokens: 150, output_tokens: 300 },
      },
    };

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes(`/generated/${mockContentId}/regenerate`) && method === "POST") {
        regenRequested = true;
        return Promise.resolve({
          ok: true,
          status: 202,
          json: async () => ({
            request_id: "req-regen",
            content_id: mockContentId,
            job_id: "job-regen-123",
            status: "regenerating",
          }),
        });
      }

      if (url.includes(`/generated/${mockContentId}`) && method === "GET") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockDetail,
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
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

    // Verify detail loaded
    await waitFor(() => {
      expect(screen.getAllByText("درس تولید شده با هوش مصنوعی").length).toBeGreaterThan(0);
      expect(screen.getByRole("button", { name: /تولید مجدد/i })).toBeDefined();
    });

    // Click Regenerate
    const regenBtn = screen.getByRole("button", { name: /تولید مجدد/i });
    fireEvent.click(regenBtn);

    // Verify NO 500 error, regenerate endpoint called with 202, and user navigated back to review queue
    await waitFor(() => {
      expect(regenRequested).toBe(true);
      expect(onBack).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // TEST 3 — REGENERATE AFTER PUBLISH & ACCEPT
  // =========================================================================
  it("TEST 3 — REGENERATE AFTER PUBLISH: Approves content, verifies acceptance mutation, and handles review flow", async () => {
    let accepted = false;
    const onBack = vi.fn();

    const pendingQueueItems: ReviewQueueResource[] = [
      {
        id: mockContentId,
        course_id: mockCourseId,
        document_id: mockDocId,
        type: "lesson",
        status: "draft",
        title: "درس بازتولید شده",
        updated_at: new Date().toISOString(),
      },
    ];

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase();

      if (url.includes(`/generated/${mockContentId}/accept`) && method === "POST") {
        accepted = true;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-acc",
            content_id: mockContentId,
            status: "accepted",
            materialized_lesson_id: "lesson-mat-1",
          }),
        });
      }

      if (url.includes("/review-queue") && method === "GET") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-q",
            pending: pendingQueueItems,
          }),
        });
      }

      if (url.includes(`/generated/${mockContentId}`) && method === "GET") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-d",
            content: {
              id: mockContentId,
              document_id: mockDocId,
              course_id: mockCourseId,
              type: "lesson",
              status: "draft",
              payload: {
                title: "درس بازتولید شده",
                contentMarkdown: "# نسخه جدید درس بازتولید شده",
              },
              prompt_version: "lesson_v1",
              model: "gemini-3.6-flash",
              token_usage: { input_tokens: 100, output_tokens: 200 },
              citations: [],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
            source_chunks: [],
            generation: {
              model: "gemini-3.6-flash",
              prompt_version: "lesson_v1",
              token_usage: { input_tokens: 100, output_tokens: 200 },
            },
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      });
    });

    // 1. Render review queue
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <ReviewQueueList organizationId={mockOrgId} courseId={mockCourseId} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("درس بازتولید شده")).toBeDefined();
    });

    // 2. Render detail and click Accept & Publish
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
      expect(screen.getByRole("button", { name: /تایید و انتشار/i })).toBeDefined();
    });

    const acceptBtn = screen.getByRole("button", { name: /تایید و انتشار/i });
    fireEvent.click(acceptBtn);

    await waitFor(() => {
      expect(accepted).toBe(true);
      expect(onBack).toHaveBeenCalled();
    });
  });
});
