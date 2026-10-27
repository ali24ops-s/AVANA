import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentUploader } from "../components/documents/DocumentUploader.js";
import { CourseDocumentsView } from "../components/documents/CourseDocumentsView.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Document Ingestion Views", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockCourseId = "00000000-0000-0000-0000-000000000002";

  beforeEach(() => {
    // Reset fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ request_id: "req-1", items: [] }),
    });
  });

  it("renders upload dropzone and displays file when selected", async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <DocumentUploader
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/بارگذاری منابع و جزوات آموزشی/i)).toBeDefined();
    expect(screen.getByText(/برای انتخاب فایل کلیک کنید یا فایل را به اینجا بکشید/i)).toBeDefined();

    const file = new File(["test document content"], "lecture1.pdf", {
      type: "application/pdf",
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeDefined();

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("lecture1.pdf")).toBeDefined();
      expect(screen.getByRole("button", { name: /آپلود و شروع پردازش/i })).toBeDefined();
    });
  });

  it("renders CourseDocumentsView with empty state", async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <CourseDocumentsView
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("هنوز سندی بارگذاری نشده است")).toBeDefined();
    });
  });

  it("CourseDocumentsView excludes documents belonging to other courses or unassigned", async () => {
    const queryClient = createTestQueryClient();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: "req-filter",
        items: [
          {
            id: "doc-correct",
            organization_id: mockOrgId,
            course_id: mockCourseId,
            original_name: "valid-course-syllabus.pdf",
            mime_type: "application/pdf",
            size_bytes: 1024,
            status: "ready",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: "doc-foreign",
            organization_id: mockOrgId,
            course_id: "other-course-uuid",
            original_name: "leaked-foreign-file.pdf",
            mime_type: "application/pdf",
            size_bytes: 2048,
            status: "ready",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: "doc-unassigned",
            organization_id: mockOrgId,
            course_id: null,
            original_name: "unassigned-library-file.pdf",
            mime_type: "application/pdf",
            size_bytes: 4096,
            status: "ready",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      }),
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CourseDocumentsView
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("valid-course-syllabus.pdf")).toBeDefined();
    });

    expect(screen.queryByText("leaked-foreign-file.pdf")).toBeNull();
    expect(screen.queryByText("unassigned-library-file.pdf")).toBeNull();
  });

  it("shows only the pack item when 3 files belong to a pack (constituent files do not appear as standalone cards)", async () => {
    const queryClient = createTestQueryClient();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/source-packs")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-packs",
            source_packs: [
              {
                id: "pack-1",
                organization_id: mockOrgId,
                course_id: mockCourseId,
                title: "پک ۳ فایلی فارماکولوژی",
                description: null,
                created_by_user_id: "user-1",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                documents: [
                  {
                    document_id: "doc-1",
                    role: "primary_notes",
                    order_index: 0,
                    original_name: "lecture1.pdf",
                    status: "ready",
                  },
                  {
                    document_id: "doc-2",
                    role: "supplementary_reference",
                    order_index: 1,
                    original_name: "slides1.pdf",
                    status: "ready",
                  },
                  {
                    document_id: "doc-3",
                    role: "question_template",
                    order_index: 2,
                    original_name: "sample-questions.pdf",
                    status: "ready",
                  },
                ],
              },
            ],
          }),
        });
      }

      if (url.includes("/documents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-docs",
            items: [
              {
                id: "doc-1",
                organization_id: mockOrgId,
                course_id: mockCourseId,
                original_name: "lecture1.pdf",
                mime_type: "application/pdf",
                size_bytes: 1024,
                status: "ready",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              {
                id: "doc-2",
                organization_id: mockOrgId,
                course_id: mockCourseId,
                original_name: "slides1.pdf",
                mime_type: "application/pdf",
                size_bytes: 2048,
                status: "ready",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              {
                id: "doc-3",
                organization_id: mockOrgId,
                course_id: mockCourseId,
                original_name: "sample-questions.pdf",
                mime_type: "application/pdf",
                size_bytes: 4096,
                status: "ready",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
            ],
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request_id: "req-fallback", items: [] }),
      });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CourseDocumentsView
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      // The single pack title is displayed
      expect(screen.getByText("پک ۳ فایلی فارماکولوژی")).toBeDefined();
    });

    // Resource counter displays exactly 1 resource ("۱ منبع")
    expect(screen.getByText("۱ منبع")).toBeDefined();

    // The files are visible inside the pack card (role badges exist)
    expect(screen.getByText("جزوه اصلی")).toBeDefined();
    expect(screen.getByText("رفرنس تکمیلی")).toBeDefined();
    expect(screen.getByText("قالب سؤالات")).toBeDefined();

    // But no standalone DocumentStatusCard checkbox/actions are rendered
    // Standalone cards have checkboxes with input type="checkbox", while packs do not
    const checkboxes = screen.queryAllByRole("checkbox");
    expect(checkboxes.length).toBe(0);

    // Standalone cards render "حذف سند", whereas pack card renders "حذف پک"
    expect(screen.queryByTitle("حذف سند")).toBeNull();
    expect(screen.getByTitle("حذف پک")).toBeDefined();
  });

  it("maintains single pack display after page reload with same backend data", async () => {
    const queryClient = createTestQueryClient();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/source-packs")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-packs-reload",
            source_packs: [
              {
                id: "pack-1",
                organization_id: mockOrgId,
                course_id: mockCourseId,
                title: "پک بعد از ریلود",
                documents: [
                  { document_id: "doc-a", role: "primary_notes", order_index: 0, original_name: "a.pdf", status: "ready" },
                  { document_id: "doc-b", role: "supplementary_reference", order_index: 1, original_name: "b.pdf", status: "ready" },
                ],
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-docs-reload",
          items: [
            { id: "doc-a", organization_id: mockOrgId, course_id: mockCourseId, original_name: "a.pdf", status: "ready" },
            { id: "doc-b", organization_id: mockOrgId, course_id: mockCourseId, original_name: "b.pdf", status: "ready" },
          ],
        }),
      });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CourseDocumentsView
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("پک بعد از ریلود")).toBeDefined();
    });

    expect(screen.getByText("۱ منبع")).toBeDefined();
    expect(screen.queryByTitle("حذف سند")).toBeNull();
  });

  it("renders a standalone file independently when not part of any pack", async () => {
    const queryClient = createTestQueryClient();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/source-packs")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-packs-empty",
            source_packs: [],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-docs-standalone",
          items: [
            {
              id: "doc-standalone-1",
              organization_id: mockOrgId,
              course_id: mockCourseId,
              original_name: "single-handout.pdf",
              mime_type: "application/pdf",
              size_bytes: 2048,
              status: "ready",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        }),
      });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CourseDocumentsView
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("single-handout.pdf")).toBeDefined();
    });

    expect(screen.getByText("۱ منبع")).toBeDefined();
    expect(screen.getByTitle("حذف سند")).toBeDefined();
    expect(screen.queryByTitle("حذف پک")).toBeNull();
  });

  it("renders two distinct packs each once with no constituent files as standalone cards", async () => {
    const queryClient = createTestQueryClient();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/source-packs")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-two-packs",
            source_packs: [
              {
                id: "pack-1",
                organization_id: mockOrgId,
                course_id: mockCourseId,
                title: "پک اول فیزیولوژی",
                documents: [
                  { document_id: "doc-1", role: "primary_notes", order_index: 0, original_name: "p1-doc1.pdf", status: "ready" },
                  { document_id: "doc-2", role: "supplementary_reference", order_index: 1, original_name: "p1-doc2.pdf", status: "ready" },
                ],
              },
              {
                id: "pack-2",
                organization_id: mockOrgId,
                course_id: mockCourseId,
                title: "پک دوم بیوشیمی",
                documents: [
                  { document_id: "doc-3", role: "primary_notes", order_index: 0, original_name: "p2-doc3.pdf", status: "ready" },
                  { document_id: "doc-4", role: "supplementary_reference", order_index: 1, original_name: "p2-doc4.pdf", status: "ready" },
                ],
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-docs",
          items: [
            { id: "doc-1", organization_id: mockOrgId, course_id: mockCourseId, original_name: "p1-doc1.pdf", status: "ready" },
            { id: "doc-2", organization_id: mockOrgId, course_id: mockCourseId, original_name: "p1-doc2.pdf", status: "ready" },
            { id: "doc-3", organization_id: mockOrgId, course_id: mockCourseId, original_name: "p2-doc3.pdf", status: "ready" },
            { id: "doc-4", organization_id: mockOrgId, course_id: mockCourseId, original_name: "p2-doc4.pdf", status: "ready" },
          ],
        }),
      });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CourseDocumentsView
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("پک اول فیزیولوژی")).toBeDefined();
      expect(screen.getByText("پک دوم بیوشیمی")).toBeDefined();
    });

    expect(screen.getByText("۲ منبع")).toBeDefined();
    expect(screen.queryByTitle("حذف سند")).toBeNull();
  });

  it("does not render shared document as standalone when referenced in multiple packs", async () => {
    const queryClient = createTestQueryClient();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/source-packs")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-shared-doc",
            source_packs: [
              {
                id: "pack-alpha",
                organization_id: mockOrgId,
                course_id: mockCourseId,
                title: "پک آلفا",
                documents: [
                  { document_id: "shared-doc", role: "primary_notes", order_index: 0, original_name: "shared.pdf", status: "ready" },
                  { document_id: "doc-x", role: "supplementary_reference", order_index: 1, original_name: "x.pdf", status: "ready" },
                ],
              },
              {
                id: "pack-beta",
                organization_id: mockOrgId,
                course_id: mockCourseId,
                title: "پک بتا",
                documents: [
                  { document_id: "shared-doc", role: "primary_reference", order_index: 0, original_name: "shared.pdf", status: "ready" },
                  { document_id: "doc-y", role: "primary_notes", order_index: 1, original_name: "y.pdf", status: "ready" },
                ],
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-docs",
          items: [
            { id: "shared-doc", organization_id: mockOrgId, course_id: mockCourseId, original_name: "shared.pdf", status: "ready" },
            { id: "doc-x", organization_id: mockOrgId, course_id: mockCourseId, original_name: "x.pdf", status: "ready" },
            { id: "doc-y", organization_id: mockOrgId, course_id: mockCourseId, original_name: "y.pdf", status: "ready" },
          ],
        }),
      });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CourseDocumentsView
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("پک آلفا")).toBeDefined();
      expect(screen.getByText("پک بتا")).toBeDefined();
    });

    expect(screen.getByText("۲ منبع")).toBeDefined();
    expect(screen.queryByTitle("حذف سند")).toBeNull();
  });

  it("correctly displays 1 standalone file and 1 pack together with count '۲ منبع'", async () => {
    const queryClient = createTestQueryClient();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/source-packs")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-combo",
            source_packs: [
              {
                id: "pack-1",
                organization_id: mockOrgId,
                course_id: mockCourseId,
                title: "پک جامع آزمون",
                documents: [
                  { document_id: "pack-doc-1", role: "primary_notes", order_index: 0, original_name: "pd1.pdf", status: "ready" },
                  { document_id: "pack-doc-2", role: "question_template", order_index: 1, original_name: "pd2.pdf", status: "ready" },
                ],
              },
            ],
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-docs",
          items: [
            { id: "pack-doc-1", organization_id: mockOrgId, course_id: mockCourseId, original_name: "pd1.pdf", status: "ready" },
            { id: "pack-doc-2", organization_id: mockOrgId, course_id: mockCourseId, original_name: "pd2.pdf", status: "ready" },
            { id: "standalone-doc-1", organization_id: mockOrgId, course_id: mockCourseId, original_name: "extra-notes.pdf", status: "ready" },
          ],
        }),
      });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <CourseDocumentsView
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("پک جامع آزمون")).toBeDefined();
      expect(screen.getByText("extra-notes.pdf")).toBeDefined();
    });

    // 1 pack + 1 standalone document = 2 sources
    expect(screen.getByText("۲ منبع")).toBeDefined();

    // 1 pack delete button and 1 file delete button
    expect(screen.getByTitle("حذف پک")).toBeDefined();
    expect(screen.getByTitle("حذف سند")).toBeDefined();
  });
});
