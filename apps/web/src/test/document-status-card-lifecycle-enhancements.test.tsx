import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentStatusCard } from "../components/documents/DocumentStatusCard.js";
import type { DocumentResource } from "@avana/contracts";

// Mock react-router-dom
vi.mock("react-router-dom", () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to, ...props }: any) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

// Mock toast
vi.mock("../components/Toast.js", () => ({
  useToast: () => ({
    addToast: vi.fn(),
  }),
}));

const mockOrgId = "b4a0b464-16db-4087-92b7-163a1e6f6776";
const mockCourseId = "3a6d05f7-f61b-4470-9b72-6b56686bb09e";
const mockDocId = "a2a8caed-5f6c-460a-8324-3802c176bf46";

const mockDocument: DocumentResource = {
  id: mockDocId,
  organization_id: mockOrgId,
  course_id: mockCourseId,
  owner_user_id: "user-123",
  original_name: "cardiology.pdf",
  mime_type: "application/pdf",
  size_bytes: 1024 * 100,
  sha256: "cardio123sha",
  status: "extracted",
  error_code: null,
  retry_count: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
      },
    },
  });
}

describe("DocumentStatusCard - Generation Lifecycle & Polish", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("recovers in-flight generation on page reload via contentStatus.active_job_id and shows progress bar", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);

      if (urlStr.includes("/content-status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            document_id: mockDocId,
            course_id: mockCourseId,
            lesson: { generated: true, count: 5 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
            active_job_id: "job-reloaded-123",
            latest_job: {
              job_id: "job-reloaded-123",
              status: "running",
              types: ["flashcard"],
              created_at: new Date().toISOString(),
            },
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "stat-1",
            status: { ...mockDocument, page_count: 5, chunk_count: 10 },
          }),
        };
      }

      if (urlStr.includes("jobs/job-reloaded-123")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-job",
            job: {
              id: "job-reloaded-123",
              document_id: mockDocId,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              status: "running",
              type: "flashcard",
              types: ["flashcard"],
              progress: {
                currentStage: "flashcard",
                completed: 4,
                total: 8,
                percentage: 50,
              },
            },
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={mockDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Progress bar for flashcard should be automatically restored
    expect(await screen.findByText(/در حال تولید فلش‌کارت‌ها/i)).toBeDefined();
    expect(screen.getByText(/۵۰٪/)).toBeDefined();
    expect(screen.getByText(/تولید فلش‌کارت‌های مرور فاصله‌دار/i)).toBeDefined();
  });

  it("unmounts pipeline progress bar upon job completion and renders dismissible success banner", async () => {
    let jobStatus = "running";

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);

      if (urlStr.includes("/content-status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            document_id: mockDocId,
            course_id: mockCourseId,
            lesson: { generated: jobStatus === "succeeded", count: jobStatus === "succeeded" ? 4 : 0 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
            active_job_id: jobStatus === "running" ? "job-456" : null,
            latest_job: {
              job_id: "job-456",
              status: jobStatus,
              types: ["lesson"],
              created_at: new Date().toISOString(),
            },
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "stat-1",
            status: { ...mockDocument, page_count: 5, chunk_count: 10 },
          }),
        };
      }

      if (urlStr.includes("jobs/job-456")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-job",
            job: {
              id: "job-456",
              document_id: mockDocId,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              status: jobStatus,
              type: "lesson",
              types: ["lesson"],
              progress: {
                currentStage: "lesson",
                completed: jobStatus === "succeeded" ? 8 : 4,
                total: 8,
                percentage: jobStatus === "succeeded" ? 100 : 50,
              },
            },
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    const queryClient = createTestQueryClient();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={mockDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Initial running state shows progress bar
    expect(await screen.findByText(/در حال تولید درسنامه/i)).toBeDefined();

    // Now job succeeds
    jobStatus = "succeeded";
    await queryClient.invalidateQueries();

    rerender(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={mockDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Pipeline progress bar should disappear, success banner should appear
    await waitFor(() => {
      expect(screen.queryByText(/در حال تولید درسنامه/i)).toBeNull();
      expect(screen.getByText(/پیش‌نویس درسنامه با موفقیت تولید شد/i)).toBeDefined();
    });

    // Success banner contains dismiss button
    const dismissBtn = screen.getByRole("button", { name: /بستن پیام/i });
    fireEvent.click(dismissBtn);

    // Dismissing banner removes it
    await waitFor(() => {
      expect(screen.queryByText(/پیش‌نویس درسنامه با موفقیت تولید شد/i)).toBeNull();
    });
  });

  it("displays failure alert with retry button when job fails and allows dismissal", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);

      if (urlStr.includes("/content-status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            document_id: mockDocId,
            course_id: mockCourseId,
            lesson: { generated: false, count: 0 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
            active_job_id: null,
            latest_job: {
              job_id: "job-fail-789",
              status: "failed",
              types: ["quiz"],
              error_message: "rate_limit_exceeded: LLM quota reached",
              created_at: new Date().toISOString(),
            },
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "stat-1",
            status: { ...mockDocument, page_count: 5, chunk_count: 10 },
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={mockDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Failure alert is shown with error message and retry button
    expect(await screen.findByText(/سهمیه سرویس هوش مصنوعی در حال حاضر به پایان رسیده است/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /تلاش مجدد/i })).toBeDefined();

    // Dismiss failure
    const dismissBtn = screen.getByRole("button", { name: /بستن پیام/i });
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(screen.queryByText(/سهمیه سرویس هوش مصنوعی در حال حاضر به پایان رسیده است/i)).toBeNull();
    });
  });

  it("renders 4 content readiness chips reflecting exact generation status", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);

      if (urlStr.includes("/content-status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            document_id: mockDocId,
            course_id: mockCourseId,
            lesson: { generated: true, count: 3 },
            flashcards: { generated: true, count: 15 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
            active_job_id: null,
            latest_job: null,
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "stat-1",
            status: { ...mockDocument, page_count: 5, chunk_count: 10 },
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={mockDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Check readiness section
    expect(await screen.findByText(/وضعیت بخش‌های محتوای آموزشی این سند:/i)).toBeDefined();
    expect(screen.getByText(/درسنامه/i)).toBeDefined();
    expect(screen.getByText(/فلش‌کارت‌ها/i)).toBeDefined();
    expect(screen.getByText(/آزمون و تست‌ها/i)).toBeDefined();
    expect(screen.getByText(/خلاصه مرور/i)).toBeDefined();
  });

  it("handles sequential flow: lesson completes -> collapses -> user generates flashcards independently from 0%", async () => {
    let currentJobId = "job-lesson-1";
    let lessonJobStatus = "running";
    let flashcardJobStatus = "queued";
    let lessonGenerated = false;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method ?? "GET";

      if (urlStr.includes("/generate") && method === "POST") {
        currentJobId = "job-flashcard-2";
        flashcardJobStatus = "running";
        return {
          ok: true,
          status: 202,
          json: async () => ({
            request_id: "req-gen-2",
            job_id: "job-flashcard-2",
            status: "queued",
          }),
        };
      }

      if (urlStr.includes("/estimate-cost")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-est",
            estimated_price_toman: 5000,
            formatted_price: "۵٬۰۰۰ تومان",
            currency: "toman",
            disclaimer: "",
          }),
        };
      }

      if (urlStr.includes("/content-status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            document_id: mockDocId,
            course_id: mockCourseId,
            lesson: { generated: lessonGenerated, count: lessonGenerated ? 4 : 0 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
            active_job_id: currentJobId === "job-lesson-1" && lessonJobStatus === "running" ? "job-lesson-1" : (currentJobId === "job-flashcard-2" ? "job-flashcard-2" : null),
            latest_job: {
              job_id: currentJobId,
              status: currentJobId === "job-lesson-1" ? lessonJobStatus : flashcardJobStatus,
              types: currentJobId === "job-lesson-1" ? ["lesson"] : ["flashcard"],
              created_at: new Date().toISOString(),
            },
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "stat-1",
            status: { ...mockDocument, page_count: 5, chunk_count: 10 },
          }),
        };
      }

      if (urlStr.includes("jobs/job-lesson-1")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-job-1",
            job: {
              id: "job-lesson-1",
              document_id: mockDocId,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              status: lessonJobStatus,
              type: "lesson",
              types: ["lesson"],
              progress: {
                currentStage: "lesson",
                completed: lessonJobStatus === "succeeded" ? 5 : 2,
                total: 5,
                percentage: lessonJobStatus === "succeeded" ? 100 : 40,
              },
            },
          }),
        };
      }

      if (urlStr.includes("jobs/job-flashcard-2")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-job-2",
            job: {
              id: "job-flashcard-2",
              document_id: mockDocId,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              status: flashcardJobStatus,
              type: "flashcard",
              types: ["flashcard"],
              progress: {
                currentStage: "flashcard",
                completed: 1, // Only 1 chunk completed so far for flashcards
                total: 9, // 1 planning + 8 flashcards
                percentage: 11,
              },
            },
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    const queryClient = createTestQueryClient();
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={mockDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // 1. Initial State: Lesson generation is in progress
    expect(await screen.findByText(/در حال تولید درسنامه/i)).toBeDefined();

    // 2. Lesson generation completes
    lessonJobStatus = "succeeded";
    lessonGenerated = true;
    await queryClient.invalidateQueries();

    rerender(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={mockDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Pipeline unmounts and lesson success banner is displayed
    await waitFor(() => {
      expect(screen.queryByText(/در حال تولید درسنامه/i)).toBeNull();
      expect(screen.getByText(/پیش‌نویس درسنامه با موفقیت تولید شد/i)).toBeDefined();
    });

    // 3. User now triggers Flashcard generation
    const genButton = screen.getByRole("button", { name: /تولید هوشمند محتوای آموزشی/i });
    fireEvent.click(genButton);

    // Modal opens; submit generation for flashcards
    expect(await screen.findByText("انتخاب محتوای موردنظر")).toBeDefined();
    const submitBtn = await screen.findByRole("button", { name: /تولید محتوای انتخاب‌شده/i });
    await waitFor(() => {
      expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(submitBtn);

    // Invalidate queries so flashcard job takes over
    await queryClient.invalidateQueries();

    rerender(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={mockDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // 4. Old lesson success banner is gone, NEW flashcard progress bar is displayed starting from clean progress
    await waitFor(() => {
      expect(screen.queryByText(/پیش‌نویس درسنامه با موفقیت تولید شد/i)).toBeNull();
      expect(screen.getByText(/در حال تولید فلش‌کارت‌ها/i)).toBeDefined();
      expect(screen.getByText(/۱۱٪/)).toBeDefined();
    });
  });
});
