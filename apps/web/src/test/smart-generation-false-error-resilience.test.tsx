import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentStatusCard } from "../components/documents/DocumentStatusCard.js";
import type { DocumentResource } from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Smart Generation False Error Resilience & Lifecycle", () => {
  const mockOrgId = "org-resilience-101";
  const mockCourseId = "course-resilience-202";
  const mockDocId = "doc-resilience-303";

  const baseDocument: DocumentResource = {
    id: mockDocId,
    organization_id: mockOrgId,
    course_id: mockCourseId,
    owner_user_id: "user-123",
    original_name: "pathology_notes.pdf",
    mime_type: "application/pdf",
    size_bytes: 1024 * 50,
    sha256: "hash123",
    status: "extracted",
    error_code: null,
    retry_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const commonMockHandlers = (urlStr: string) => {
    if (urlStr.includes("/estimate-cost")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-est",
          estimated_price_toman: 0,
          formatted_price: "رایگان",
        }),
      };
    }

    if (urlStr.includes("/wallet/me")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          balance: 100000,
          currency: "toman",
          formatted_balance: "۱۰۰,۰۰۰ تومان",
        }),
      };
    }

    return null;
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Scenario 1: Timeout / Network drop after successful Job registration -> No false error, adopts active job", async () => {
    let generateCalled = false;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || "GET";

      const common = commonMockHandlers(urlStr);
      if (common) return common;

      if (urlStr.includes("/generate") && method === "POST") {
        generateCalled = true;
        // Simulate network timeout or connection drop after server already enqueued
        throw new TypeError("Failed to fetch");
      }

      if (urlStr.includes(`/documents/${mockDocId}/content-status`)) {
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
            // When checked after timeout, server has the active job
            active_job_id: generateCalled ? "job-registered-post-timeout" : null,
            latest_job: generateCalled
              ? {
                  id: "job-registered-post-timeout",
                  job_id: "job-registered-post-timeout",
                  status: "queued",
                  type: "lesson",
                }
              : null,
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-stat",
            status: {
              ...baseDocument,
              status: generateCalled ? "pending_generation" : "extracted",
            },
          }),
        };
      }

      if (urlStr.includes("jobs/job-registered-post-timeout")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-job",
            job: {
              id: "job-registered-post-timeout",
              document_id: mockDocId,
              status: "running",
              type: "lesson",
              progress: { completed: 1, total: 3, percentage: 33 },
            },
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({ request_id: "req-def", items: [] }) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={baseDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const generateBtn = await screen.findByRole("button", {
      name: /تولید هوشمند محتوای آموزشی/i,
    });
    fireEvent.click(generateBtn);

    const confirmBtn = await screen.findByRole("button", {
      name: /تولید محتوا/i,
    });
    await waitFor(() => {
      expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(confirmBtn);

    // Verify: No false error is shown
    await waitFor(() => {
      expect(screen.queryByText(/خطا در شروع/i)).toBeNull();
      expect(screen.queryByText(/Failed to fetch/i)).toBeNull();
    });

    // Verify: Active generation is tracked
    expect(await screen.findByText(/در حال تولید درسنامه/i)).toBeDefined();
  });

  it("Scenario 2: Real network error without Job registration -> Displays appropriate error", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || "GET";

      const common = commonMockHandlers(urlStr);
      if (common) return common;

      if (urlStr.includes("/generate") && method === "POST") {
        throw new TypeError("Failed to fetch");
      }

      if (urlStr.includes(`/documents/${mockDocId}/content-status`)) {
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
            latest_job: null,
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-stat",
            status: { ...baseDocument, status: "extracted" },
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({ request_id: "req-def", items: [] }) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={baseDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const generateBtn = await screen.findByRole("button", {
      name: /تولید هوشمند محتوای آموزشی/i,
    });
    fireEvent.click(generateBtn);

    const confirmBtn = await screen.findByRole("button", {
      name: /تولید محتوا/i,
    });
    await waitFor(() => {
      expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(confirmBtn);

    // Verify: Because no job was registered, the real error is rendered to the user
    expect(
      await screen.findByText(/خطا در برقراری ارتباط با سرور|Failed to fetch/i),
    ).toBeDefined();
  });

  it("Scenario 3: 409 Conflict with active Job for same document -> Adopts active job without error", async () => {
    let generateCalled = false;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || "GET";

      const common = commonMockHandlers(urlStr);
      if (common) return common;

      if (urlStr.includes("/generate") && method === "POST") {
        generateCalled = true;
        return {
          ok: false,
          status: 409,
          json: async () => ({
            error: {
              code: "conflict",
              message: "این سند در حال حاضر در حال پردازش یا تولید محتوا است. لطفاً منتظر بمانید.",
            },
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/content-status`)) {
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
            active_job_id: generateCalled ? "job-already-running-409" : null,
            latest_job: generateCalled
              ? {
                  id: "job-already-running-409",
                  job_id: "job-already-running-409",
                  status: "running",
                  type: "all",
                }
              : null,
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-stat",
            status: { ...baseDocument, status: generateCalled ? "generating" : "extracted" },
          }),
        };
      }

      if (urlStr.includes("jobs/job-already-running-409")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-job",
            job: {
              id: "job-already-running-409",
              document_id: mockDocId,
              status: "running",
              type: "all",
              progress: { completed: 2, total: 4, percentage: 50 },
            },
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({ request_id: "req-def", items: [] }) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={baseDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const generateBtn = await screen.findByRole("button", {
      name: /تولید هوشمند محتوای آموزشی/i,
    });
    fireEvent.click(generateBtn);

    const confirmBtn = await screen.findByRole("button", {
      name: /تولید محتوا/i,
    });
    await waitFor(() => {
      expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(confirmBtn);

    // Verify: No conflict failure banner is displayed
    await waitFor(() => {
      expect(screen.queryByText(/خطا در شروع/i)).toBeNull();
    });

    // Progress bar for the running job is displayed
    expect(await screen.findByText(/در حال تولید محتوای کامل آموزشی/i)).toBeDefined();
  });

  it("Scenario 4: 409 Conflict without active Job -> Displays informative conflict message", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || "GET";

      const common = commonMockHandlers(urlStr);
      if (common) return common;

      if (urlStr.includes("/generate") && method === "POST") {
        return {
          ok: false,
          status: 409,
          json: async () => ({
            error: {
              code: "conflict",
              message: "تولید محتوا برای این دوره هم‌اکنون توسط پردازش فعال دیگری در حال اجراست.",
            },
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/content-status`)) {
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
            latest_job: null,
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-stat",
            status: { ...baseDocument, status: "extracted" },
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({ request_id: "req-def", items: [] }) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={baseDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const generateBtn = await screen.findByRole("button", {
      name: /تولید هوشمند محتوای آموزشی/i,
    });
    fireEvent.click(generateBtn);

    const confirmBtn = await screen.findByRole("button", {
      name: /تولید محتوا/i,
    });
    await waitFor(() => {
      expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(confirmBtn);

    // Verify: Accurate conflict message is displayed
    expect(
      await screen.findByText(/تولید محتوا برای این دوره هم‌اکنون توسط پردازش فعال دیگری در حال اجراست/i),
    ).toBeDefined();
  });

  it("Scenario 5: Starting new generation when document previously had a failed job -> Never flashes old failure banner", async () => {
    let newJobStarted = false;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || "GET";

      const common = commonMockHandlers(urlStr);
      if (common) return common;

      if (urlStr.includes("/generate") && method === "POST") {
        newJobStarted = true;
        return {
          ok: true,
          status: 202,
          json: async () => ({
            request_id: "req-new",
            job_id: "new-fresh-job-999",
            status: "queued",
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/content-status`)) {
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
            // Prior to new generation, latest_job was failed!
            active_job_id: newJobStarted ? "new-fresh-job-999" : null,
            latest_job: newJobStarted
              ? {
                  id: "new-fresh-job-999",
                  job_id: "new-fresh-job-999",
                  status: "running",
                  type: "all",
                }
              : {
                  id: "old-failed-job-111",
                  job_id: "old-failed-job-111",
                  status: "failed",
                  error_message: "OLD_JOB_FAILURE_REASON",
                  type: "all",
                },
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-stat",
            status: { ...baseDocument, status: "extracted" },
          }),
        };
      }

      if (urlStr.includes("jobs/new-fresh-job-999")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-new-job",
            job: {
              id: "new-fresh-job-999",
              document_id: mockDocId,
              status: "running",
              type: "all",
              progress: { completed: 1, total: 4, percentage: 25 },
            },
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({ request_id: "req-def", items: [] }) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={baseDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Initial state shows old failed job alert
    expect(await screen.findByText(/OLD_JOB_FAILURE_REASON/i)).toBeDefined();

    // Now user clicks retry / generate
    const generateBtn = screen.getByRole("button", {
      name: /تلاش مجدد/i,
    });
    fireEvent.click(generateBtn);

    const confirmBtn = await screen.findByRole("button", {
      name: /تولید محتوا/i,
    });
    await waitFor(() => {
      expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(confirmBtn);

    // Verify: Old failure banner immediately disappears and does NOT linger or flash!
    await waitFor(() => {
      expect(screen.queryByText(/OLD_JOB_FAILURE_REASON/i)).toBeNull();
    });

    // New generation progress is displayed
    expect(await screen.findByText(/در حال تولید محتوای کامل آموزشی/i)).toBeDefined();
  });

  it("Scenario 6: Transient polling failure and recovery -> Does not abort polling permanently", async () => {
    let pollCount = 0;

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);

      const common = commonMockHandlers(urlStr);
      if (common) return common;

      if (urlStr.includes(`/documents/${mockDocId}/content-status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            document_id: mockDocId,
            course_id: mockCourseId,
            active_job_id: "job-polling-recovery",
            latest_job: {
              id: "job-polling-recovery",
              job_id: "job-polling-recovery",
              status: "running",
              type: "all",
            },
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-stat",
            status: { ...baseDocument, status: "generating" },
          }),
        };
      }

      if (urlStr.includes("jobs/job-polling-recovery")) {
        pollCount++;
        if (pollCount === 2) {
          // Second poll encounters a transient 502/network hiccup
          return {
            ok: false,
            status: 502,
            json: async () => ({ error: { message: "Bad Gateway" } }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: `req-job-${pollCount}`,
            job: {
              id: "job-polling-recovery",
              document_id: mockDocId,
              status: "running",
              type: "all",
              progress: { completed: pollCount >= 3 ? 3 : 1, total: 4, percentage: pollCount >= 3 ? 75 : 25 },
            },
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({ request_id: "req-def", items: [] }) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={baseDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Initial progress bar appears
    expect(await screen.findByText(/در حال تولید محتوای کامل آموزشی/i)).toBeDefined();

    // Verify polling does not crash or show unrecoverable failure
    expect(screen.queryByText(/خطای ناشناخته در پردازش جاب/i)).toBeNull();
  });

  it("Scenario 7: Real validation failure (400 Bad Request) -> Accurately displayed", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || "GET";

      const common = commonMockHandlers(urlStr);
      if (common) return common;

      if (urlStr.includes("/generate") && method === "POST") {
        return {
          ok: false,
          status: 400,
          json: async () => ({
            error: {
              code: "bad_request",
              message: "تمام محتواهای درخواستی از قبل برای این فایل وجود دارند.",
            },
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/content-status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-1",
            document_id: mockDocId,
            course_id: mockCourseId,
            can_generate: true,
            all_generated: false,
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-stat",
            status: { ...baseDocument, status: "extracted" },
          }),
        };
      }

      return { ok: true, status: 200, json: async () => ({ request_id: "req-def", items: [] }) };
    });

    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentStatusCard
          document={baseDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const generateBtn = await screen.findByRole("button", {
      name: /تولید هوشمند محتوای آموزشی/i,
    });
    fireEvent.click(generateBtn);

    const confirmBtn = await screen.findByRole("button", {
      name: /تولید محتوا/i,
    });
    await waitFor(() => {
      expect((confirmBtn as HTMLButtonElement).disabled).toBe(false);
    });
    fireEvent.click(confirmBtn);

    // Verify: Real error message is accurately displayed
    expect(
      await screen.findByText(/تمام محتواهای درخواستی از قبل برای این فایل وجود دارند/i),
    ).toBeDefined();
  });
});
