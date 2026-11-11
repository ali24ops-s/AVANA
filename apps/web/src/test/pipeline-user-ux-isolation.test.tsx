import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentStatusCard } from "../components/documents/DocumentStatusCard.js";
import type { DocumentResource } from "@avana/contracts";

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

const mockOrgId = "org-user-1";
const mockCourseId = "course-bio-101";

const mockDocA: DocumentResource = {
  id: "doc-aaa-111",
  organization_id: mockOrgId,
  course_id: mockCourseId,
  original_name: "pathology-ch1.pdf",
  storage_path: "pathology-ch1.pdf",
  mime_type: "application/pdf",
  size_bytes: 1024 * 500,
  status: "extracted",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockDocB: DocumentResource = {
  id: "doc-bbb-222",
  organization_id: mockOrgId,
  course_id: mockCourseId,
  original_name: "histology-ch2.pdf",
  storage_path: "histology-ch2.pdf",
  mime_type: "application/pdf",
  size_bytes: 1024 * 700,
  status: "extracted",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

const mockDocNoCourse: DocumentResource = {
  id: "doc-nocourse-999",
  organization_id: mockOrgId,
  course_id: null,
  original_name: "freestanding.pdf",
  storage_path: "freestanding.pdf",
  mime_type: "application/pdf",
  size_bytes: 1024 * 200,
  status: "extracted",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe("Content Generation Pipeline UX & Per-File Isolation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Initial State: Unrequested & Ungenerated document shows default overview
  // ---------------------------------------------------------------------------
  it("Scenario 1: Clean extracted document with 0 generated items shows 4 readiness chips", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes("/content-status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "r1",
            document_id: mockDocA.id,
            lesson: { generated: false, count: 0 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({}) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={mockDocA}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/وضعیت بخش‌های محتوای آموزشی این سند:/i)).toBeDefined();
    expect(screen.getByText("درسنامه")).toBeDefined();
    expect(screen.getByText("فلش‌کارت‌ها")).toBeDefined();
    expect(screen.getByText("آزمون و تست‌ها")).toBeDefined();
    expect(screen.getByText("خلاصه مرور")).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 2. Only Flashcards selected: Pipeline renders ONLY Flashcards stage
  // ---------------------------------------------------------------------------
  it("Scenario 2: Only Flashcards requested -> Pipeline renders ONLY Flashcards stage", async () => {
    let capturedBody: Record<string, unknown> | null = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method ?? "GET";

      if (urlStr.includes("/content-status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "r2",
            document_id: mockDocA.id,
            lesson: { generated: false, count: 0 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
          }),
        };
      }

      if (urlStr.includes(`/estimate-cost`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-est-1",
            estimated_price_toman: 15000,
            formatted_price: "۱۵٬۰۰۰ تومان",
            currency: "toman",
            disclaimer: "هزینه تخمینی",
          }),
        };
      }

      if (urlStr.includes("/generate") && method === "POST") {
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 202,
          json: async () => ({
            request_id: "gen-job-1",
            job_id: "job-flash-1",
            status: "queued",
          }),
        };
      }

      if (urlStr.includes("jobs/job-flash-1")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "job-r",
            job: {
              id: "job-flash-1",
              status: "running",
              type: "flashcard",
              types: ["flashcard"],
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
          document={mockDocA}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Open modal
    const mainBtn = await screen.findByRole("button", {
      name: /تولید هوشمند محتوای آموزشی/i,
    });
    fireEvent.click(mainBtn);

    // Deselect Lesson and Exam, keeping ONLY Flashcards
    const lessonCheckbox = screen.getByLabelText("انتخاب درس");
    const examCheckbox = screen.getByLabelText("انتخاب آزمون");
    fireEvent.click(lessonCheckbox);
    fireEvent.click(examCheckbox);

    const submitBtn = screen.getByRole("button", { name: /تولید محتوای انتخاب‌شده/i });
    await waitFor(() => {
      expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(capturedBody).toEqual({ types: ["flashcard"] });
    });

    // Pipeline must now show ONLY Flashcards stage!
    expect(await screen.findByText(/پایپ‌لاین تولید محتوای این سند:/i)).toBeDefined();
    expect(screen.getByTestId("pipeline-stage-flashcard")).toBeDefined();
    expect(screen.queryByTestId("pipeline-stage-lesson")).toBeNull();
    expect(screen.queryByTestId("pipeline-stage-quiz")).toBeNull();
  });

  // ---------------------------------------------------------------------------
  // 3. Sequential Multi-stage: Previous Flashcards Completed (dimmed), new Quiz Active
  // ---------------------------------------------------------------------------
  it("Scenario 3: Flashcards already completed -> User generates Quiz -> Flashcards remains Completed (dimmed) and Quiz is processing", async () => {
    let capturedBody: Record<string, unknown> | null = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method ?? "GET";

      if (urlStr.includes("/content-status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "r3",
            document_id: mockDocA.id,
            lesson: { generated: false, count: 0 },
            flashcards: { generated: true, count: 25 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
          }),
        };
      }

      if (urlStr.includes(`/estimate-cost`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-est-3",
            estimated_price_toman: 15000,
            formatted_price: "۱۵٬۰۰۰ تومان",
            currency: "toman",
            disclaimer: "هزینه تخمینی",
          }),
        };
      }

      if (urlStr.includes("/generate") && method === "POST") {
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 202,
          json: async () => ({
            request_id: "gen-quiz",
            job_id: "job-quiz-99",
            status: "queued",
          }),
        };
      }

      if (urlStr.includes("jobs/job-quiz-99")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "job-r3",
            job: {
              id: "job-quiz-99",
              status: "running",
              type: "quiz",
              types: ["quiz"],
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
          document={mockDocA}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Initial state: Flashcard was already generated, so pipeline contains flashcard (completed)
    expect(await screen.findByTestId("pipeline-stage-flashcard")).toBeDefined();
    const flashStageInitial = screen.getByTestId("pipeline-stage-flashcard");
    expect(flashStageInitial.getAttribute("data-status")).toBe("completed");
    expect(flashStageInitial.className).toContain("opacity-75");

    // Open modal and request Quiz
    const mainBtn = screen.getByRole("button", { name: /تولید هوشمند محتوای آموزشی/i });
    fireEvent.click(mainBtn);

    // In modal, Flashcard is already generated so it cannot be selected.
    // Deselect Lesson, select Quiz
    const lessonCheckbox = screen.getByLabelText("انتخاب درس");
    fireEvent.click(lessonCheckbox);

    const submitBtn = screen.getByRole("button", { name: /تولید محتوای انتخاب‌شده/i });
    await waitFor(() => {
      expect((submitBtn as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(capturedBody).toEqual({ types: ["quiz"] });
    });

    // In pipeline:
    // - Flashcard is STILL completed (dimmed, opacity-75)
    // - Quiz is now processing
    // - Lesson is NOT in pipeline
    await waitFor(() => {
      const flashStage = screen.getByTestId("pipeline-stage-flashcard");
      expect(flashStage.getAttribute("data-status")).toBe("completed");
      expect(flashStage.className).toContain("opacity-75");

      const quizStage = screen.getByTestId("pipeline-stage-quiz");
      expect(quizStage.getAttribute("data-status")).toBe("processing");

      expect(screen.queryByTestId("pipeline-stage-lesson")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Per-File Isolation between Document A and Document B
  // ---------------------------------------------------------------------------
  it("Scenario 4: Per-file isolation - Document A generating does not affect Document B", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);

      if (urlStr.includes(`/documents/${mockDocA.id}/content-status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "docA-status",
            document_id: mockDocA.id,
            active_job_id: "job-docA-active",
            lesson: { generated: false, count: 0 },
            flashcards: { generated: true, count: 12 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
            latest_job: {
              job_id: "job-docA-active",
              status: "running",
              types: ["quiz"],
            },
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocB.id}/content-status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "docB-status",
            document_id: mockDocB.id,
            active_job_id: null,
            lesson: { generated: false, count: 0 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
          }),
        };
      }

      if (urlStr.includes("jobs/job-docA-active")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "jobA",
            job: {
              id: "job-docA-active",
              status: "running",
              type: "quiz",
              types: ["quiz"],
            },
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <div data-testid="card-container-A">
          <DocumentStatusCard
            document={mockDocA}
            organizationId={mockOrgId}
            courseId={mockCourseId}
          />
        </div>
        <div data-testid="card-container-B">
          <DocumentStatusCard
            document={mockDocB}
            organizationId={mockOrgId}
            courseId={mockCourseId}
          />
        </div>
      </QueryClientProvider>,
    );

    const containerA = await screen.findByTestId("card-container-A");
    const containerB = await screen.findByTestId("card-container-B");

    // Document A has active pipeline with Flashcards (completed) and Quiz (processing)
    await waitFor(() => {
      const flashA = containerA.querySelector('[data-testid="pipeline-stage-flashcard"]');
      const quizA = containerA.querySelector('[data-testid="pipeline-stage-quiz"]');
      expect(flashA).not.toBeNull();
      expect(flashA?.getAttribute("data-status")).toBe("completed");
      expect(quizA).not.toBeNull();
      expect(quizA?.getAttribute("data-status")).toBe("processing");
    });

    // Document B is completely idle, has NO active pipeline stages, showing initial readiness overview
    const pipelineB = containerB.querySelector('[data-testid="pipeline-stage-quiz"]');
    expect(pipelineB).toBeNull();
    expect(containerB.textContent).toContain("وضعیت بخش‌های محتوای آموزشی این سند:");
  });

  // ---------------------------------------------------------------------------
  // 5. Failure Isolation: Failed Quiz does not fail previously completed Flashcards
  // ---------------------------------------------------------------------------
  it("Scenario 5: Quiz fails -> Flashcard remains completed (dimmed), Quiz shows failed with Retry button", async () => {
    const jobStatus = "failed";

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);

      if (urlStr.includes("/content-status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "r5",
            document_id: mockDocA.id,
            active_job_id: "job-fail-quiz",
            lesson: { generated: false, count: 0 },
            flashcards: { generated: true, count: 30 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
            latest_job: {
              job_id: "job-fail-quiz",
              status: jobStatus,
              types: ["quiz"],
              error_message: "Rate limit reached on AI provider",
            },
          }),
        };
      }

      if (urlStr.includes("jobs/job-fail-quiz")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "job-r5",
            job: {
              id: "job-fail-quiz",
              status: jobStatus,
              type: "quiz",
              types: ["quiz"],
              error_message: "Rate limit reached on AI provider",
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
          document={mockDocA}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Check that Flashcard is STILL completed (dimmed)
    const flashStage = await screen.findByTestId("pipeline-stage-flashcard");
    expect(flashStage.getAttribute("data-status")).toBe("completed");
    expect(flashStage.className).toContain("opacity-75");

    // Check that Quiz is marked failed
    const quizStage = await screen.findByTestId("pipeline-stage-quiz");
    expect(quizStage.getAttribute("data-status")).toBe("failed");
    expect(quizStage.textContent).toContain("خطا در تولید");

    // Check that a dedicated Retry button exists for Quiz
    const retryBtn = quizStage.querySelector("button");
    expect(retryBtn).not.toBeNull();
    expect(retryBtn?.textContent).toContain("تلاش مجدد");
  });

  // ---------------------------------------------------------------------------
  // 6. Retry single failed stage preserves completed stages
  // ---------------------------------------------------------------------------
  it("Scenario 6: Clicking Retry on failed Quiz retries ONLY Quiz without resetting Flashcard", async () => {
    let capturedBody: Record<string, unknown> | null = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method ?? "GET";

      if (urlStr.includes("/content-status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "r6",
            document_id: mockDocA.id,
            active_job_id: "job-fail-quiz-prev",
            lesson: { generated: false, count: 0 },
            flashcards: { generated: true, count: 30 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
            latest_job: {
              job_id: "job-fail-quiz-prev",
              status: "failed",
              types: ["quiz"],
              error_message: "Quota error",
            },
          }),
        };
      }

      if (urlStr.includes("jobs/job-fail-quiz-prev")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "job-r6",
            job: {
              id: "job-fail-quiz-prev",
              status: "failed",
              type: "quiz",
              types: ["quiz"],
              error_message: "Quota error",
            },
          }),
        };
      }

      if (urlStr.includes("/generate") && method === "POST") {
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 202,
          json: async () => ({
            request_id: "gen-retry",
            job_id: "job-retry-quiz-2",
            status: "queued",
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={mockDocA}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const quizStage = await screen.findByTestId("pipeline-stage-quiz");
    const retryBtn = quizStage.querySelector("button")!;
    expect(retryBtn).toBeDefined();

    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(capturedBody).toEqual({ types: ["quiz"] });
    });

    // Flashcard must remain completed
    const flashStage = screen.getByTestId("pipeline-stage-flashcard");
    expect(flashStage.getAttribute("data-status")).toBe("completed");
  });

  // ---------------------------------------------------------------------------
  // 7. CourseId Independence: Document without courseId polls without errors
  // ---------------------------------------------------------------------------
  it("Scenario 7: Document with null courseId executes polling and status checks without error", async () => {
    let jobPolled = false;

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);

      if (urlStr.includes("/content-status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "nocourse-r",
            document_id: mockDocNoCourse.id,
            active_job_id: "job-standalone-1",
            lesson: { generated: true, count: 3 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
            latest_job: {
              job_id: "job-standalone-1",
              status: "running",
              types: ["lesson"],
            },
          }),
        };
      }

      // Check that it calls document-level jobs route without course in URL
      if (urlStr.includes(`/documents/${mockDocNoCourse.id}/generate/jobs/job-standalone-1`)) {
        jobPolled = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "job-standalone-resp",
            job: {
              id: "job-standalone-1",
              document_id: mockDocNoCourse.id,
              organization_id: mockOrgId,
              status: "running",
              type: "lesson",
              types: ["lesson"],
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
          document={mockDocNoCourse}
          organizationId={mockOrgId}
          courseId={null}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(jobPolled).toBe(true);
    });

    expect(await screen.findByTestId("pipeline-stage-lesson")).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 8. Pipeline Progression Independent of Lesson (Flashcard -> Quiz)
  // ---------------------------------------------------------------------------
  it("Scenario 8: Multi-type job without lesson (Flashcard + Quiz) progresses correctly through stages", async () => {
    let jobStage = "flashcard";
    let flashcardGenerated = false;

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);

      if (urlStr.includes("/content-status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "r8",
            document_id: mockDocA.id,
            active_job_id: "job-multi-1",
            lesson: { generated: false, count: 0 },
            flashcards: { generated: flashcardGenerated, count: flashcardGenerated ? 20 : 0 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
            latest_job: {
              job_id: "job-multi-1",
              status: "running",
              types: ["flashcard", "quiz"],
            },
          }),
        };
      }

      if (urlStr.includes("jobs/job-multi-1")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "job-r8",
            job: {
              id: "job-multi-1",
              status: "running",
              type: "all",
              types: ["flashcard", "quiz"],
              generationProgress: {
                stage: jobStage,
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
          document={mockDocA}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Initial stage: flashcard is processing, quiz is pending
    await waitFor(() => {
      const flashStage = screen.getByTestId("pipeline-stage-flashcard");
      const quizStage = screen.getByTestId("pipeline-stage-quiz");
      expect(flashStage.getAttribute("data-status")).toBe("processing");
      expect(quizStage.getAttribute("data-status")).toBe("pending");
      expect(screen.queryByTestId("pipeline-stage-lesson")).toBeNull();
    });

    // Advance to quiz stage: flashcard is now generated (completed dimmed), quiz is processing
    jobStage = "quiz";
    flashcardGenerated = true;
    await queryClient.invalidateQueries();

    rerender(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={mockDocA}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      const flashStage = screen.getByTestId("pipeline-stage-flashcard");
      const quizStage = screen.getByTestId("pipeline-stage-quiz");
      expect(flashStage.getAttribute("data-status")).toBe("completed");
      expect(flashStage.className).toContain("opacity-75");
      expect(quizStage.getAttribute("data-status")).toBe("processing");
      expect(screen.queryByTestId("pipeline-stage-lesson")).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Debounce & Double-click Prevention during Submission
  // ---------------------------------------------------------------------------
  it("Scenario 9: Submit and Card actions are disabled while generating/submitting to prevent double clicks", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);

      if (urlStr.includes("/content-status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "r9",
            document_id: mockDocA.id,
            active_job_id: "job-active-debounce",
            lesson: { generated: false, count: 0 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
            latest_job: {
              job_id: "job-active-debounce",
              status: "running",
              types: ["flashcard"],
            },
          }),
        };
      }

      if (urlStr.includes("jobs/job-active-debounce")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "job-r9",
            job: {
              id: "job-active-debounce",
              status: "running",
              type: "flashcard",
              types: ["flashcard"],
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
          document={mockDocA}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // When generating is in progress, the main generate button is disabled
    const generateBtn = await screen.findByRole("button", { name: /در حال تولید هوشمند محتوا/i });
    expect((generateBtn as HTMLButtonElement).disabled).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 10. Pipeline Transition & Success Alert on Job Completion
  // ---------------------------------------------------------------------------
  it("Scenario 10: Successful job completion transitions stage to completed and shows dismissible success alert", async () => {
    let jobStatus = "running";

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);

      if (urlStr.includes("/content-status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "r10",
            document_id: mockDocA.id,
            active_job_id: "job-complete-10",
            lesson: { generated: false, count: 0 },
            flashcards: { generated: jobStatus === "succeeded", count: jobStatus === "succeeded" ? 15 : 0 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: jobStatus === "succeeded",
            latest_job: {
              job_id: "job-complete-10",
              status: jobStatus,
              types: ["flashcard"],
            },
          }),
        };
      }

      if (urlStr.includes("jobs/job-complete-10")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "job-r10",
            job: {
              id: "job-complete-10",
              status: jobStatus,
              type: "flashcard",
              types: ["flashcard"],
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
          document={mockDocA}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId("pipeline-stage-flashcard")).toBeDefined();

    // Transition job to succeeded
    jobStatus = "succeeded";
    await queryClient.refetchQueries();

    rerender(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={mockDocA}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      // Pipeline stage should be completed
      const stage = screen.getByTestId("pipeline-stage-flashcard");
      expect(stage.getAttribute("data-status")).toBe("completed");
      expect(stage.className).toContain("opacity-75");

      // Success alert is visible
      expect(screen.getByText(/پیش‌نویس فلش‌کارت‌ها با موفقیت تولید شد/i)).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 11. Priority 1: Smart Generation Button remains visible and enabled after partial generation
  // ---------------------------------------------------------------------------
  it("Scenario 11: Priority 1 - Smart Generation Button remains visible and enabled when can_generate is true", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);

      if (urlStr.includes("/content-status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "r11",
            document_id: mockDocA.id,
            active_job_id: null,
            lesson: { generated: false, count: 0 },
            flashcards: { generated: true, count: 20, accepted: true },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
            latest_job: {
              job_id: "job-prev-fc",
              status: "succeeded",
              types: ["flashcard"],
            },
          }),
        };
      }

      if (urlStr.includes("/courses")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            courses: [{ id: mockCourseId, name: "زیست‌شناسی جامع", status: "active" }],
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({}) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={mockDocA}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Button MUST remain visible because can_generate is true (even if all_generated on job was set)
    const genButton = await screen.findByRole("button", {
      name: /ادامه تولید هوشمند محتوا|تولید هوشمند محتوای آموزشی/i,
    });
    expect(genButton).toBeDefined();
    expect((genButton as HTMLButtonElement).disabled).toBe(false);

    // Clicking button opens the modal to generate remaining content
    fireEvent.click(genButton);
    expect(await screen.findByRole("dialog")).toBeDefined();
    expect(screen.getByText(/تولید هوشمند محتوای آموزشی/i)).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 12. Priority 2: Polling stops when job is terminal (succeeded, failed, cancelled)
  // ---------------------------------------------------------------------------
  it("Scenario 12: Priority 2 - contentStatusQuery refetchInterval stops when job reaches terminal status", async () => {
    let contentStatusFetchCount = 0;

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);

      if (urlStr.includes("/content-status")) {
        contentStatusFetchCount++;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "r12",
            document_id: mockDocA.id,
            active_job_id: null,
            lesson: { generated: true, count: 1 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
            latest_job: {
              job_id: "job-term-12",
              status: "succeeded",
              types: ["lesson"],
            },
          }),
        };
      }

      if (urlStr.includes("jobs/job-term-12")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "job-r12",
            job: {
              id: "job-term-12",
              status: "succeeded",
              type: "lesson",
              types: ["lesson"],
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
          document={mockDocA}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Initial render fetches content-status
    await waitFor(() => {
      expect(contentStatusFetchCount).toBeGreaterThan(0);
    });

    // Content status query should evaluate refetchInterval to false
    const query = queryClient
      .getQueryCache()
      .find({ queryKey: ["document-content-status", mockOrgId, mockDocA.id, mockCourseId] });
    expect(query).toBeDefined();

    // The query options refetchInterval when invoked with terminal job data should return false
    const refetchIntervalFn = query?.options.refetchInterval;
    if (typeof refetchIntervalFn === "function") {
      const intervalResult = (refetchIntervalFn as (q: unknown) => unknown)(query);
      expect(intervalResult).toBe(false);
    }
  });

  // ---------------------------------------------------------------------------
  // 13. Priority 3: Multiple types requested with !currentStage shows only first in canonical order as processing
  // ---------------------------------------------------------------------------
  it("Scenario 13: Priority 3 - Multiple types requested with !currentStage shows ONLY first stage in canonical worker order as processing", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);

      if (urlStr.includes("/content-status")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "r13",
            document_id: mockDocA.id,
            active_job_id: "job-multi-13",
            lesson: { generated: false, count: 0 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: false,
            all_generated: false,
            latest_job: {
              job_id: "job-multi-13",
              status: "running",
              types: ["flashcard", "quiz"],
            },
          }),
        };
      }

      if (urlStr.includes("jobs/job-multi-13")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "job-r13",
            job: {
              id: "job-multi-13",
              status: "running",
              types: ["flashcard", "quiz"],
              generationProgress: {
                // stage is NOT reported yet by worker
                stage: null,
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
          document={mockDocA}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // In canonical worker order ["lesson", "flashcard", "quiz", "review_summary"],
    // the first among ["flashcard", "quiz"] is "flashcard".
    // Therefore Flashcard stage MUST be processing, and Quiz stage MUST be pending!
    const flashStage = await screen.findByTestId("pipeline-stage-flashcard");
    expect(flashStage.getAttribute("data-status")).toBe("processing");

    const quizStage = await screen.findByTestId("pipeline-stage-quiz");
    expect(quizStage.getAttribute("data-status")).toBe("pending");
  });
});

