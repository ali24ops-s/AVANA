import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../providers/AuthProvider.js";
import { SourceProductionPanel } from "../components/admin/studio/SourceProductionPanel.js";
import type { OfficialCourse } from "../lib/api/admin.js";
import type { DocumentResource } from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const mockCourse: OfficialCourse = {
  id: "target-course-123",
  name: "فارماکولوژی جامع",
  description: "دوره جامع داروشناسی",
  level: "intermediate",
  subject: "پزشکی",
  organizationId: "org-test-uuid",
  status: "draft",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-01T00:00:00Z",
  modules_count: 0,
  lessons_count: 0,
  flashcards_count: 0,
  quizzes_count: 0,
};

function createMockDoc(
  id: string,
  courseId: string | null,
  name: string,
  status: DocumentResource["status"] = "extracted",
): DocumentResource {
  return {
    id,
    organization_id: "org-test-uuid",
    course_id: courseId,
    owner_user_id: "user-1",
    original_name: name,
    mime_type: "application/pdf",
    size_bytes: 1024 * 1024,
    sha256: `sha-${id}`,
    status,
    error_code: null,
    retry_count: 0,
    created_at: new Date(2026, 0, 1, 0, 0, 0).toISOString(),
    updated_at: new Date(2026, 0, 1, 0, 0, 0).toISOString(),
  };
}

describe("SourceProductionPanel Document Scoping & Scenarios", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = createTestQueryClient();
  });

  it("Scenario 1: Org has 29 files (14 other courses + 15 target course) -> All 15 files are displayed", async () => {
    const targetCourseDocs = Array.from({ length: 15 }, (_, i) =>
      createMockDoc(`target-doc-${i + 1}`, mockCourse.id, `target_file_${i + 1}.pdf`),
    );

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes(`/documents`)) {
        if (urlStr.includes(`course_id=${mockCourse.id}`)) {
          return new Response(
            JSON.stringify({
              request_id: "r1",
              items: targetCourseDocs,
              pagination: { total: 15, page: 1, limit: 100, total_pages: 1 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (urlStr.includes(`used=unused`)) {
          return new Response(
            JSON.stringify({
              request_id: "r2",
              items: [],
              pagination: { total: 0, page: 1, limit: 100, total_pages: 1 },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SourceProductionPanel
            course={mockCourse}
            organizationId="org-test-uuid"
          />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("15 سند")).toBeInTheDocument();
    });

    for (let i = 1; i <= 15; i++) {
      expect(screen.getByText(`target_file_${i}.pdf`)).toBeInTheDocument();
    }
  });

  it("Scenario 2: Course has > 25 files (e.g. 28 files) -> All 28 files are rendered without org pagination truncation", async () => {
    const courseDocs28 = Array.from({ length: 28 }, (_, i) =>
      createMockDoc(`course-doc-${i + 1}`, mockCourse.id, `chapter_resource_${i + 1}.pdf`),
    );

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes(`course_id=${mockCourse.id}`)) {
        return new Response(
          JSON.stringify({
            request_id: "r1",
            items: courseDocs28,
            pagination: { total: 28, page: 1, limit: 100, total_pages: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr.includes(`used=unused`)) {
        return new Response(
          JSON.stringify({
            request_id: "r2",
            items: [],
            pagination: { total: 0, page: 1, limit: 100, total_pages: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SourceProductionPanel
            course={mockCourse}
            organizationId="org-test-uuid"
          />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("28 سند")).toBeInTheDocument();
    });

    expect(screen.getByText("chapter_resource_1.pdf")).toBeInTheDocument();
    expect(screen.getByText("chapter_resource_26.pdf")).toBeInTheDocument();
    expect(screen.getByText("chapter_resource_28.pdf")).toBeInTheDocument();
  });

  it("Scenario 3: Unassigned general resources (course_id === null) are preserved and displayed alongside course files", async () => {
    const courseDoc = createMockDoc("doc-c1", mockCourse.id, "course_specific.pdf");
    const unassignedDoc = createMockDoc("doc-u1", null, "general_reference.pdf");

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes(`course_id=${mockCourse.id}`)) {
        return new Response(
          JSON.stringify({
            request_id: "r1",
            items: [courseDoc],
            pagination: { total: 1, page: 1, limit: 100, total_pages: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr.includes(`used=unused`)) {
        return new Response(
          JSON.stringify({
            request_id: "r2",
            items: [unassignedDoc],
            pagination: { total: 1, page: 1, limit: 100, total_pages: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SourceProductionPanel
            course={mockCourse}
            organizationId="org-test-uuid"
          />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("2 سند")).toBeInTheDocument();
    });

    expect(screen.getByText("course_specific.pdf")).toBeInTheDocument();
    expect(screen.getByText("general_reference.pdf")).toBeInTheDocument();
  });

  it("Scenario 4: Documents belonging to other courses are excluded", async () => {
    const targetDoc = createMockDoc("doc-t1", mockCourse.id, "target_allowed.pdf");

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes(`course_id=${mockCourse.id}`)) {
        return new Response(
          JSON.stringify({
            request_id: "r1",
            items: [targetDoc],
            pagination: { total: 1, page: 1, limit: 100, total_pages: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr.includes(`used=unused`)) {
        return new Response(
          JSON.stringify({
            request_id: "r2",
            items: [],
            pagination: { total: 0, page: 1, limit: 100, total_pages: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SourceProductionPanel
            course={mockCourse}
            organizationId="org-test-uuid"
          />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("target_allowed.pdf")).toBeInTheDocument();
    });

    expect(screen.queryByText("other_course_secret.pdf")).not.toBeInTheDocument();
  });

  it("Scenario 5: Card actions, specifically «تولید هوشمند محتوای آموزشی», work without behavioral change", async () => {
    const doc = createMockDoc("doc-gen", mockCourse.id, "extracted_book.pdf", "extracted");

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const urlStr = String(url);
      if (urlStr.includes(`course_id=${mockCourse.id}`)) {
        return new Response(
          JSON.stringify({
            request_id: "r1",
            items: [doc],
            pagination: { total: 1, page: 1, limit: 100, total_pages: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (urlStr.includes(`used=unused`)) {
        return new Response(
          JSON.stringify({
            request_id: "r2",
            items: [],
            pagination: { total: 0, page: 1, limit: 100, total_pages: 1 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SourceProductionPanel
            course={mockCourse}
            organizationId="org-test-uuid"
          />
        </AuthProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("extracted_book.pdf")).toBeInTheDocument();
    });

    const genButton = screen.getByRole("button", {
      name: /تولید هوشمند محتوای آموزشی/i,
    });
    expect(genButton).toBeInTheDocument();
    expect(genButton).not.toBeDisabled();

    fireEvent.click(genButton);

    await waitFor(() => {
      expect(screen.getByText(/درس \(Lesson\)/i)).toBeInTheDocument();
    });
  });
});
