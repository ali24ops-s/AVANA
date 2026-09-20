import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SourceProductionPanel } from "../components/admin/studio/SourceProductionPanel.js";
import { DocumentStatusCard } from "../components/documents/DocumentStatusCard.js";
import { AuthProvider } from "../providers/AuthProvider.js";
import type { OfficialCourse } from "../lib/api/admin.js";
import type { DocumentResource } from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const mockOrgId = "b4a0b464-16db-4087-92b7-163a1e6f6776";
const mockCourseId = "course-neuro-14";

const mockCourse: OfficialCourse = {
  id: mockCourseId,
  name: "فیزیولوژی دو عصب ۱۴",
  description: "دوره فیزیولوژی اعصاب",
  subject: "پزشکی",
  organizationId: mockOrgId,
  status: "draft",
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
  moduleCount: 1,
  lessonCount: 3,
  flashcardCount: 10,
  quizQuestionCount: 5,
};

function createMockDoc(
  id: string,
  name: string,
  status: DocumentResource["status"] = "extracted",
): DocumentResource {
  return {
    id,
    organization_id: mockOrgId,
    course_id: mockCourseId,
    owner_user_id: "user-1",
    original_name: name,
    mime_type: "application/pdf",
    size_bytes: 1024 * 1024,
    sha256: `sha-${id}`,
    status,
    error_code: null,
    retry_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("UX Bugfix: Incomplete Generation Lifecycle & Action Matrix (7 Scenarios)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  // -------------------------------------------------------------------------
  // Scenario 1: 0 of 4 generated -> Smart Generation shown, Review button NOT shown
  // -------------------------------------------------------------------------
  it("Scenario 1: 0 of 4 generated -> Smart generation shown, Review button NOT shown", async () => {
    const doc = createMockDoc("doc-neuro-0", "physiology_neuro_14.pdf", "extracted");

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes(`/documents`) && !urlStr.includes(`/content-status`) && !urlStr.includes(`/status`)) {
        return new Response(
          JSON.stringify({
            request_id: "r1",
            items: [doc],
            pagination: { total: 1, page: 1, limit: 100, total_pages: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr.includes(`/content-status`)) {
        return new Response(
          JSON.stringify({
            request_id: "status-0",
            document_id: doc.id,
            course_id: mockCourseId,
            lesson: { generated: false, count: 0 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const onNavigateToReview = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SourceProductionPanel
            course={mockCourse}
            organizationId={mockOrgId}
            onNavigateToReview={onNavigateToReview}
          />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Smart generation button must be shown
    expect(
      await screen.findByRole("button", { name: /تولید هوشمند محتوای آموزشی/i }),
    ).toBeDefined();

    // Review button should NOT be shown in the document card
    expect(screen.queryByRole("button", { name: /مشاهده در بازبینی/i })).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Scenario 2: 1 of 4 generated -> Smart generation shown + Review button shown
  // -------------------------------------------------------------------------
  it("Scenario 2: 1 of 4 generated -> Smart generation shown + Review button shown", async () => {
    const doc = createMockDoc("doc-neuro-1", "physiology_neuro_14.pdf", "review_pending");

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes(`/documents`) && !urlStr.includes(`/content-status`) && !urlStr.includes(`/status`)) {
        return new Response(
          JSON.stringify({
            request_id: "r1",
            items: [doc],
            pagination: { total: 1, page: 1, limit: 100, total_pages: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr.includes(`/content-status`)) {
        return new Response(
          JSON.stringify({
            request_id: "status-1",
            document_id: doc.id,
            course_id: mockCourseId,
            lesson: { generated: true, count: 2 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const onNavigateToReview = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SourceProductionPanel
            course={mockCourse}
            organizationId={mockOrgId}
            onNavigateToReview={onNavigateToReview}
          />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Smart generation button must still be available (partial generation)
    expect(
      await screen.findByRole("button", { name: /ادامه تولید هوشمند محتوا/i }),
    ).toBeDefined();

    // Review button must be available because 1 item is reviewable
    expect(
      screen.getByRole("button", { name: /مشاهده در بازبینی/i }),
    ).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Scenario 3: Real bug scenario - 3 of 4 generated -> Smart generation + Review button
  // -------------------------------------------------------------------------
  it("Scenario 3: Real bug scenario: 3 of 4 generated -> Smart generation + Review button shown", async () => {
    const doc = createMockDoc("doc-neuro-14", "فیزیولوژی دو عصب ۱۴.pdf", "review_pending");

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes(`/documents`) && !urlStr.includes(`/content-status`) && !urlStr.includes(`/status`)) {
        return new Response(
          JSON.stringify({
            request_id: "r1",
            items: [doc],
            pagination: { total: 1, page: 1, limit: 100, total_pages: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr.includes(`/content-status`)) {
        return new Response(
          JSON.stringify({
            request_id: "status-3",
            document_id: doc.id,
            course_id: mockCourseId,
            lesson: { generated: true, count: 3 },
            flashcards: { generated: true, count: 12 },
            exam: { generated: true, count: 6 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const onNavigateToReview = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SourceProductionPanel
            course={mockCourse}
            organizationId={mockOrgId}
            onNavigateToReview={onNavigateToReview}
          />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // 1. Partial badge is shown (3/4)
    expect(await screen.findByText(/تولید بخشی از محتوا \(3\/4\)/i)).toBeDefined();

    // 2. Smart generation button is STILL visible and clickable
    const genBtn = screen.getByRole("button", { name: /ادامه تولید هوشمند محتوا/i });
    expect(genBtn).toBeDefined();

    // 3. Review button is ALSO visible
    const reviewBtn = screen.getByRole("button", { name: /مشاهده در بازبینی/i });
    expect(reviewBtn).toBeDefined();

    // 4. Clicking generation button opens modal with already-generated items checked/disabled and ungenerated item active
    fireEvent.click(genBtn);
    expect(await screen.findByText("انتخاب محتوای موردنظر")).toBeDefined();
    expect(screen.getByText(/تولید شده \([3۳] درس\)/i)).toBeDefined();
    expect(screen.getByText(/تولید شده \([1۱۲]+ کارت\)/i)).toBeDefined();
    expect(screen.getByText(/تولید شده \([6۶] سؤال\)/i)).toBeDefined();
    expect(screen.getByText(/مرور ۱۰–۱۵ دقیقه‌ای/i)).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Scenario 4: 4 of 4 generated -> Review button shown, Smart generation HIDDEN
  // -------------------------------------------------------------------------
  it("Scenario 4: 4 of 4 generated -> Review button shown, Smart generation HIDDEN", async () => {
    const doc = createMockDoc("doc-neuro-4", "physiology_neuro_14.pdf", "review_pending");

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes(`/documents`) && !urlStr.includes(`/content-status`) && !urlStr.includes(`/status`)) {
        return new Response(
          JSON.stringify({
            request_id: "r1",
            items: [doc],
            pagination: { total: 1, page: 1, limit: 100, total_pages: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr.includes(`/content-status`)) {
        return new Response(
          JSON.stringify({
            request_id: "status-4",
            document_id: doc.id,
            course_id: mockCourseId,
            lesson: { generated: true, count: 3 },
            flashcards: { generated: true, count: 12 },
            exam: { generated: true, count: 6 },
            review_summary: { generated: true, count: 1 },
            can_generate: false,
            all_generated: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const onNavigateToReview = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SourceProductionPanel
            course={mockCourse}
            organizationId={mockOrgId}
            onNavigateToReview={onNavigateToReview}
          />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Badge indicates completed generation
    expect(await screen.findByText(/محتوا کامل تولید شده/i)).toBeDefined();

    // Smart generation button must NOT be present
    expect(screen.queryByRole("button", { name: /تولید هوشمند/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /ادامه تولید/i })).toBeNull();

    // Primary action is Review button
    const reviewBtn = screen.getByRole("button", { name: /مشاهده در بازبینی/i });
    expect(reviewBtn).toBeDefined();
    fireEvent.click(reviewBtn);
    expect(onNavigateToReview).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Scenario 5: Document review_pending but only 3 of 4 -> NOT considered completed
  // -------------------------------------------------------------------------
  it("Scenario 5: Document review_pending but only 3 of 4 -> Not considered completed in DocumentStatusCard", async () => {
    const doc = createMockDoc("doc-neuro-card", "physiology_neuro_14.pdf", "review_pending");

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes(`/content-status`)) {
        return new Response(
          JSON.stringify({
            request_id: "status-5",
            document_id: doc.id,
            course_id: mockCourseId,
            lesson: { generated: true, count: 3 },
            flashcards: { generated: true, count: 12 },
            exam: { generated: true, count: 6 },
            review_summary: { generated: false, count: 0 },
            can_generate: true,
            all_generated: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr.includes(`/documents/${doc.id}/status`)) {
        return new Response(
          JSON.stringify({
            request_id: "stat-5",
            status: { ...doc, page_count: 5, chunk_count: 10 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const onNavigateToReview = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <DocumentStatusCard
            document={doc}
            organizationId={mockOrgId}
            courseId={mockCourseId}
            onNavigateToReview={onNavigateToReview}
          />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Generation button is still active and clickable
    const genBtn = await screen.findByRole("button", { name: /تولید هوشمند محتوای آموزشی|ادامه تولید/i });
    expect(genBtn).toBeDefined();
    expect((genBtn as HTMLButtonElement).disabled).toBe(false);

    // Review button is also available
    expect(screen.getByRole("button", { name: /صف بازبینی محتوا/i })).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Scenario 6: Document ready with all 4 content -> Completed
  // -------------------------------------------------------------------------
  it("Scenario 6: Document ready with all 4 content -> Completed in DocumentStatusCard", async () => {
    const doc = createMockDoc("doc-neuro-ready", "physiology_neuro_14.pdf", "ready");

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes(`/content-status`)) {
        return new Response(
          JSON.stringify({
            request_id: "status-6",
            document_id: doc.id,
            course_id: mockCourseId,
            lesson: { generated: true, count: 3 },
            flashcards: { generated: true, count: 12 },
            exam: { generated: true, count: 6 },
            review_summary: { generated: true, count: 1 },
            can_generate: false,
            all_generated: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr.includes(`/documents/${doc.id}`)) {
        return new Response(
          JSON.stringify({
            request_id: "stat-6",
            status: { ...doc, page_count: 5, chunk_count: 10 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const onNavigateToReview = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <DocumentStatusCard
            document={doc}
            organizationId={mockOrgId}
            courseId={mockCourseId}
            onNavigateToReview={onNavigateToReview}
          />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Generation button is NOT displayed
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /تولید هوشمند محتوای آموزشی/i })).toBeNull();
    });

    // Primary action is review button
    const reviewBtn = screen.getByRole("button", { name: /مشاهده در بازبینی/i });
    expect(reviewBtn).toBeDefined();
    fireEvent.click(reviewBtn);
    expect(onNavigateToReview).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Scenario 7: Document failed/stopped but has previous content -> Smart generation shown + Review shown
  // -------------------------------------------------------------------------
  it("Scenario 7: Document with stopped/failed progress but previous content -> Smart generation + Review button shown", async () => {
    const doc = createMockDoc("doc-neuro-partial-fail", "physiology_neuro_14.pdf", "extracted");

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes(`/content-status`)) {
        return new Response(
          JSON.stringify({
            request_id: "status-7",
            document_id: doc.id,
            course_id: mockCourseId,
            lesson: { generated: true, count: 2 },
            flashcards: { generated: false, count: 0 },
            exam: { generated: false, count: 0 },
            review_summary: { generated: false, count: 0 },
            progress: { total: 4, completed: 1, failed: 1, pending: 2, status: "failed" },
            can_generate: true,
            all_generated: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr.includes(`/documents/${doc.id}`)) {
        return new Response(
          JSON.stringify({
            request_id: "stat-7",
            status: { ...doc, page_count: 5, chunk_count: 10 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    const onNavigateToReview = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <DocumentStatusCard
            document={doc}
            organizationId={mockOrgId}
            courseId={mockCourseId}
            onNavigateToReview={onNavigateToReview}
          />
        </AuthProvider>
      </QueryClientProvider>,
    );

    // Smart generation button allows resuming / generating remaining content
    const genBtn = await screen.findByRole("button", { name: /ادامه تولید هوشمند محتوا|تولید هوشمند/i });
    expect(genBtn).toBeDefined();

    // Review button is shown for the already generated lesson
    expect(screen.getByRole("button", { name: /صف بازبینی محتوا/i })).toBeDefined();
  });
});
