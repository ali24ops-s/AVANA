// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentStatusCard } from "../components/documents/DocumentStatusCard.js";
import { ReviewQueueList } from "../components/review/ReviewQueueList.js";
import type { DocumentResource } from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Smart Educational Content Generation Button & End-to-End Flow", () => {
  const mockOrgId = "b4a0b464-16db-4087-92b7-163a1e6f6776";
  const mockCourseId = "3a6d05f7-f61b-4470-9b72-6b56686bb09e";
  const mockDocId = "a2a8caed-5f6c-460a-8324-3802c176bf46";
  const mockJobId = "job-e2e-12345";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Full lifecycle: extracted document -> click «تولید هوشمند محتوای آموزشی» -> POST /generate -> job polling -> review queue", async () => {
    const fetchRequests: Array<{ url: string; method: string; body?: unknown }> = [];

    const mockDocument: DocumentResource = {
      id: mockDocId,
      organization_id: mockOrgId,
      course_id: mockCourseId,
      owner_user_id: "user-123",
      original_name: "pharmacology_digoxin.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024 * 50,
      sha256: "abc123sha",
      status: "extracted",
      error_code: null,
      retry_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let jobStatusResponse = "queued";

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || "GET";
      let bodyData: unknown = undefined;
      if (init?.body) {
        try {
          bodyData = JSON.parse(init.body as string);
        } catch {
          bodyData = init.body;
        }
      }
      fetchRequests.push({ url: urlStr, method, body: bodyData });

      // 1. Document status polling
      if (urlStr.includes(`/documents/${mockDocId}/status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-status",
            status: {
              document_id: mockDocId,
              organization_id: mockOrgId,
              status: "extracted",
              page_count: 4,
              chunk_count: 8,
              error_code: null,
              retry_count: 0,
              updated_at: new Date().toISOString(),
            },
          }),
        };
      }

      // 2. Generation trigger POST
      if (urlStr.includes(`/documents/${mockDocId}/generate`) && method === "POST") {
        return {
          ok: true,
          status: 202,
          json: async () => ({
            request_id: "req-gen",
            job_id: mockJobId,
            status: "queued",
          }),
        };
      }

      // 3. Job polling GET
      if (urlStr.includes(`/generate/jobs/${mockJobId}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-job",
            job: {
              id: mockJobId,
              organization_id: mockOrgId,
              document_id: mockDocId,
              course_id: mockCourseId,
              type: "generation",
              status: jobStatusResponse,
              attempts: 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        };
      }

      // 4. Review queue GET
      if (urlStr.includes(`/courses/${mockCourseId}/generated/review-queue`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-review",
            pending: [
              {
                id: "gen-lesson-1",
                document_id: mockDocId,
                course_id: mockCourseId,
                type: "lesson",
                status: "draft",
                title: "فارماکولوژی گلیکوزیدهای قلبی و دیگوکسین",
                updated_at: new Date().toISOString(),
              },
              {
                id: "gen-flashcard-1",
                document_id: mockDocId,
                course_id: mockCourseId,
                type: "flashcard",
                status: "draft",
                title: "مجموعه ۴ فلش‌کارت آموزشی دیگوکسین",
                updated_at: new Date().toISOString(),
              },
              {
                id: "gen-quiz-1",
                document_id: mockDocId,
                course_id: mockCourseId,
                type: "quiz",
                status: "draft",
                title: "آزمون ارزیابی آموخته‌های فارماکولوژی",
                updated_at: new Date().toISOString(),
              },
            ],
          }),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ request_id: "req-def", items: [] }),
      };
    });

    const queryClient = createTestQueryClient();
    const onNavigateToReview = vi.fn();

    // Render DocumentStatusCard for an extracted document
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={mockDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
          onNavigateToReview={onNavigateToReview}
        />
      </QueryClientProvider>,
    );

    // Verify card rendered with document info
    expect(screen.getByText("pharmacology_digoxin.pdf")).toBeDefined();

    // Step 1: Button «تولید هوشمند محتوای آموزشی» must be visible and enabled
    const generateBtn = await screen.findByRole("button", {
      name: /تولید هوشمند محتوای آموزشی/i,
    });
    expect(generateBtn).toBeDefined();
    expect((generateBtn as HTMLButtonElement).disabled).toBe(false);

    // Step 2: Click the button to open selection modal
    fireEvent.click(generateBtn);

    // Step 2b: Verify modal «انتخاب محتوای موردنظر» opened
    expect(await screen.findByText("انتخاب محتوای موردنظر")).toBeDefined();

    // Step 2c: Click «تولید محتوا» inside modal to confirm
    const confirmBtn = await screen.findByRole("button", {
      name: /تولید محتوا/i,
    });
    fireEvent.click(confirmBtn);

    // Step 3: Verify POST /generate was called with exact URL & payload
    await waitFor(() => {
      const genReq = fetchRequests.find(
        (r) =>
          r.method === "POST" &&
          r.url.includes(`/v1/organizations/${mockOrgId}/courses/${mockCourseId}/documents/${mockDocId}/generate`),
      );
      expect(genReq).toBeDefined();
      expect(genReq?.body).toEqual({
        types: ["lesson", "flashcard", "quiz"],
      });
    });

    // Step 4: Verify UI enters generating state
    await waitFor(() => {
      expect(screen.getByText(/در حال تولید هوشمند محتوا.../i)).toBeDefined();
    });

    // Step 5: Simulate worker completing job (status = 'succeeded')
    jobStatusResponse = "succeeded";

    // Step 6: Refetch job query to pick up 'succeeded'
    await queryClient.refetchQueries({
      queryKey: ["generation-job", mockOrgId, mockCourseId, mockDocId, mockJobId],
    });

    // Step 7: Verify success message banner appears
    await waitFor(() => {
      expect(
        screen.getByText(/پیش‌نویس درس‌ها، فلش‌کارت‌ها و آزمون‌ها با موفقیت تولید شد./i),
      ).toBeDefined();
    });

    // Step 8: Click "مشاهده صف بازبینی" link
    const reviewLink = screen.getByRole("button", { name: /مشاهده صف بازبینی/i });
    expect(reviewLink).toBeDefined();
    fireEvent.click(reviewLink);
    expect(onNavigateToReview).toHaveBeenCalledTimes(1);

    // Step 9: Render ReviewQueueList to verify newly generated items are displayed
    const reviewQueryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={reviewQueryClient}>
        <ReviewQueueList
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("فارماکولوژی گلیکوزیدهای قلبی و دیگوکسین")).toBeDefined();
      expect(screen.getByText("مجموعه ۴ فلش‌کارت آموزشی دیگوکسین")).toBeDefined();
      expect(screen.getByText("آزمون ارزیابی آموخته‌های فارماکولوژی")).toBeDefined();
    });
  });

  it("Renders «شروع استخراج متن» when document is in uploaded status, and transitions after extraction", async () => {
    const fetchRequests: Array<{ url: string; method: string }> = [];

    const mockWaitingDoc: DocumentResource = {
      id: mockDocId,
      organization_id: mockOrgId,
      course_id: mockCourseId,
      owner_user_id: "user-123",
      original_name: "lecture_slides.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024 * 20,
      sha256: "slide123sha",
      status: "uploaded",
      error_code: null,
      retry_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || "GET";
      fetchRequests.push({ url: urlStr, method });

      if (urlStr.includes(`/documents/${mockDocId}/status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-stat",
            status: {
              document_id: mockDocId,
              organization_id: mockOrgId,
              status: "uploaded",
              page_count: null,
              chunk_count: null,
              error_code: null,
              retry_count: 0,
              updated_at: new Date().toISOString(),
            },
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/extract`) && method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-ext",
            status: {
              document_id: mockDocId,
              organization_id: mockOrgId,
              status: "extracted",
              page_count: 2,
              chunk_count: 4,
              error_code: null,
              retry_count: 0,
              updated_at: new Date().toISOString(),
            },
          }),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ request_id: "req-def", items: [] }),
      };
    });

    const queryClient = createTestQueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={mockWaitingDoc}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Initial state: «شروع استخراج متن» button is rendered
    const extractBtn = await screen.findByRole("button", {
      name: /شروع استخراج متن/i,
    });
    expect(extractBtn).toBeDefined();

    // Click extraction
    fireEvent.click(extractBtn);

    await waitFor(() => {
      const extractReq = fetchRequests.find(
        (r) => r.method === "POST" && r.url.includes(`/documents/${mockDocId}/extract`),
      );
      expect(extractReq).toBeDefined();
    });
  });
});
