import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentStatusCard } from "../components/documents/DocumentStatusCard.js";
import { GenerateContentModal } from "../components/documents/GenerateContentModal.js";
import type { DocumentResource } from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Selective Smart AI Content Generation & Lifecycle (12 Scenarios)", () => {
  const mockOrgId = "b4a0b464-16db-4087-92b7-163a1e6f6776";
  const mockCourseId = "3a6d05f7-f61b-4470-9b72-6b56686bb09e";
  const mockDocId = "a2a8caed-5f6c-460a-8324-3802c176bf46";

  const mockDocument: DocumentResource = {
    id: mockDocId,
    organization_id: mockOrgId,
    course_id: mockCourseId,
    owner_user_id: "user-123",
    original_name: "cardiovascular_pharmacology.pdf",
    mime_type: "application/pdf",
    size_bytes: 1024 * 100,
    sha256: "cardio123sha",
    status: "extracted",
    error_code: null,
    retry_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: New file -> All 3 selected -> All 3 generated
  // -------------------------------------------------------------------------
  it("Scenario 1: New file -> All 3 selected -> Triggers generation with ['lesson', 'flashcard', 'quiz']", async () => {
    let capturedBody: { types?: string[] } | null = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || "GET";

      if (urlStr.includes(`/content-status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "status-1",
            document_id: mockDocId,
            course_id: mockCourseId,
            lesson: { generated: false, count: 0 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
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
            request_id: "stat-1",
            status: { ...mockDocument, page_count: 5, chunk_count: 10 },
          }),
        };
      }

      if (urlStr.includes(`/generate`) && method === "POST") {
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 202,
          json: async () => ({
            request_id: "gen-1",
            job_id: "job-1",
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
          document={mockDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const mainBtn = await screen.findByRole("button", {
      name: /تولید هوشمند محتوای آموزشی/i,
    });
    fireEvent.click(mainBtn);

    // Modal opens with all 3 options
    expect(await screen.findByText("انتخاب محتوای موردنظر")).toBeDefined();
    expect(screen.getByText(/درس \(Lesson\)/i)).toBeDefined();
    expect(screen.getByText(/فلش‌کارت \(Flashcards\)/i)).toBeDefined();
    expect(screen.getByText(/آزمون \(Exam \/ Quiz\)/i)).toBeDefined();

    const submitBtn = screen.getByRole("button", { name: /تولید محتوا/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(capturedBody).toEqual({
        types: ["lesson", "flashcard", "quiz"],
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 2: New file -> Only Lesson selected -> Only Lesson generated
  // -------------------------------------------------------------------------
  it("Scenario 2: New file -> Only Lesson selected -> Generates only ['lesson']", async () => {
    let capturedBody: { types?: string[] } | null = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || "GET";

      if (urlStr.includes(`/content-status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "status-2",
            document_id: mockDocId,
            course_id: mockCourseId,
            lesson: { generated: false, count: 0 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
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
            request_id: "stat-2",
            status: { ...mockDocument, page_count: 5, chunk_count: 10 },
          }),
        };
      }

      if (urlStr.includes(`/generate`) && method === "POST") {
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 202,
          json: async () => ({
            request_id: "gen-2",
            job_id: "job-2",
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
          document={mockDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const mainBtn = await screen.findByRole("button", {
      name: /تولید هوشمند محتوای آموزشی/i,
    });
    fireEvent.click(mainBtn);

    // Uncheck Flashcards and Exam
    const flashcardCheckbox = await screen.findByLabelText("انتخاب فلش‌کارت");
    const examCheckbox = await screen.findByLabelText("انتخاب آزمون");

    fireEvent.click(flashcardCheckbox);
    fireEvent.click(examCheckbox);

    const submitBtn = screen.getByRole("button", {
      name: /تولید محتوای انتخاب‌شده/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(capturedBody).toEqual({
        types: ["lesson"],
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Lesson exists in DB -> Lesson disabled and labeled "تولید شده", Flashcards & Exam selectable
  // -------------------------------------------------------------------------
  it("Scenario 3: Lesson already in DB -> Lesson is disabled and labeled «تولید شده», Flashcards & Exam are selectable", async () => {
    let capturedBody: { types?: string[] } | null = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || "GET";

      if (urlStr.includes(`/content-status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "status-3",
            document_id: mockDocId,
            course_id: mockCourseId,
            lesson: { generated: true, count: 2 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
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
            request_id: "stat-3",
            status: { ...mockDocument, page_count: 5, chunk_count: 10 },
          }),
        };
      }

      if (urlStr.includes(`/generate`) && method === "POST") {
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 202,
          json: async () => ({
            request_id: "gen-3",
            job_id: "job-3",
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
          document={mockDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const mainBtn = await screen.findByRole("button", {
      name: /تولید هوشمند محتوای آموزشی/i,
    });
    fireEvent.click(mainBtn);

    // Verify Lesson is disabled and labeled as generated
    const lessonCheckbox = (await screen.findByLabelText("انتخاب درس")) as HTMLInputElement;
    expect(lessonCheckbox.disabled).toBe(true);
    expect(lessonCheckbox.checked).toBe(true);
    expect(screen.getByText(/تولید شده \(2 درس\)/i)).toBeDefined();

    // Verify Flashcards & Exam are enabled
    const flashcardCheckbox = (await screen.findByLabelText("انتخاب فلش‌کارت")) as HTMLInputElement;
    const examCheckbox = (await screen.findByLabelText("انتخاب آزمون")) as HTMLInputElement;
    expect(flashcardCheckbox.disabled).toBe(false);
    expect(examCheckbox.disabled).toBe(false);

    // Submit generation
    const submitBtn = screen.getByRole("button", {
      name: /تولید محتوای انتخاب‌شده/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(capturedBody).toEqual({
        types: ["flashcard", "quiz"],
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 4: Lesson + Flashcards exist in DB -> Only Exam is selectable
  // -------------------------------------------------------------------------
  it("Scenario 4: Lesson + Flashcards exist in DB -> Only Exam is selectable and generated", async () => {
    let capturedBody: { types?: string[] } | null = null;

    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const urlStr = String(url);
      const method = init?.method || "GET";

      if (urlStr.includes(`/content-status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "status-4",
            document_id: mockDocId,
            course_id: mockCourseId,
            lesson: { generated: true, count: 3 },
            flashcards: { generated: true, count: 12 },
            exam: { generated: false, count: 0 },
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
            request_id: "stat-4",
            status: { ...mockDocument, page_count: 5, chunk_count: 10 },
          }),
        };
      }

      if (urlStr.includes(`/generate`) && method === "POST") {
        capturedBody = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 202,
          json: async () => ({
            request_id: "gen-4",
            job_id: "job-4",
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
          document={mockDocument}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const mainBtn = await screen.findByRole("button", {
      name: /تولید هوشمند محتوای آموزشی/i,
    });
    fireEvent.click(mainBtn);

    const lessonCheckbox = (await screen.findByLabelText("انتخاب درس")) as HTMLInputElement;
    const flashcardCheckbox = (await screen.findByLabelText("انتخاب فلش‌کارت")) as HTMLInputElement;
    const examCheckbox = (await screen.findByLabelText("انتخاب آزمون")) as HTMLInputElement;

    expect(lessonCheckbox.disabled).toBe(true);
    expect(flashcardCheckbox.disabled).toBe(true);
    expect(examCheckbox.disabled).toBe(false);

    const submitBtn = screen.getByRole("button", {
      name: /تولید محتوای انتخاب‌شده/i,
    });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(capturedBody).toEqual({
        types: ["quiz"],
      });
    });
  });

  // -------------------------------------------------------------------------
  // Scenario 5: All 3 exist in DB -> Main button is disabled with completed message and modal does not open
  // -------------------------------------------------------------------------
  it("Scenario 5: All 3 exist in DB -> Button is disabled with «تمام محتوای این فایل تولید شده است» and modal does not open", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);

      if (urlStr.includes(`/content-status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "status-5",
            document_id: mockDocId,
            course_id: mockCourseId,
            lesson: { generated: true, count: 4 },
            flashcards: { generated: true, count: 16 },
            exam: { generated: true, count: 1 },
            can_generate: false,
            all_generated: true,
          }),
        };
      }

      if (urlStr.includes(`/documents/${mockDocId}/status`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "stat-5",
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

    // Button should show completed state and be disabled
    const completedBtn = (await screen.findByRole("button", {
      name: /تمام محتوای این فایل تولید شده است/i,
    })) as HTMLButtonElement;

    expect(completedBtn).toBeDefined();
    expect(completedBtn.disabled).toBe(true);

    // Clicking it should NOT open the modal
    fireEvent.click(completedBtn);
    expect(screen.queryByText("انتخاب محتوای موردنظر")).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Scenario 6: 0 items selected -> Submit button disabled and warning displayed
  // -------------------------------------------------------------------------
  it("Scenario 6 / Scenario 12: 0 ungenerated items selected -> Submit disabled and warning message shown", async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <GenerateContentModal
        isOpen={true}
        onClose={onClose}
        documentName="pharmacology.pdf"
        contentStatus={{
          lesson: { generated: true, count: 2 },
          flashcards: { generated: false, count: 0 },
          exam: { generated: false, count: 0 },
        }}
        onConfirmGenerate={onConfirm}
      />,
    );

    // Uncheck both ungenerated items (flashcards and exam)
    const flashcardCheckbox = screen.getByLabelText("انتخاب فلش‌کارت");
    const examCheckbox = screen.getByLabelText("انتخاب آزمون");

    fireEvent.click(flashcardCheckbox);
    fireEvent.click(examCheckbox);

    // Warning alert is visible
    expect(screen.getByText("حداقل یک نوع محتوا را برای تولید انتخاب کنید.")).toBeDefined();

    // Submit button is disabled
    const submitBtn = screen.getByRole("button", {
      name: /تولید محتوای انتخاب‌شده/i,
    }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    fireEvent.click(submitBtn);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
