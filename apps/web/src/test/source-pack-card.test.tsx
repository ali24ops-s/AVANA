import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SourcePackCard } from "../components/documents/SourcePackCard.js";
import type { SourcePackResource, DocumentResource } from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("SourcePackCard UI", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockCourseId = "00000000-0000-0000-0000-000000000002";

  const mockPack: SourcePackResource = {
    id: "pack-1",
    organization_id: mockOrgId,
    course_id: mockCourseId,
    title: "مجموعه منابع هوش مصنوعی",
    description: null,
    created_by_user_id: "user-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    documents: [
      {
        document_id: "doc-1",
        role: "primary_notes",
        order_index: 0,
        original_name: "lecture-notes.pdf",
        status: "ready",
        mime_type: "application/pdf",
        size_bytes: 1024 * 1024,
      },
      {
        document_id: "doc-2",
        role: "primary_reference",
        order_index: 1,
        original_name: "reference-book.pdf",
        status: "ready",
        mime_type: "application/pdf",
        size_bytes: 2048 * 1024,
      },
    ],
  };

  it("does not render file count badge or sources count text or multi-pack badge", () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <SourcePackCard
          pack={mockPack}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    expect(screen.queryByText("پک چندفایلی")).toBeNull();
    expect(screen.queryByText("۲ فایل")).toBeNull();
    expect(screen.queryByText(/منبع در پک/i)).toBeNull();
    expect(screen.queryByText(/منبع آماده پردازش/i)).toBeNull();
    expect(screen.getByText("مجموعه منابع هوش مصنوعی")).toBeDefined();
  });

  it("renders the generate button with 'تولید هوشمند محتوای آموزشی' text", () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <SourcePackCard
          pack={mockPack}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const generateBtn = screen.getByRole("button", { name: /تولید هوشمند محتوای آموزشی/i });
    expect(generateBtn).toBeDefined();
    expect(generateBtn.className).toContain("bg-[#008080]");
  });

  it("renders document quality score as plain percentage directly in front of filename without extra labels", () => {
    const queryClient = createTestQueryClient();

    const cachedDocs: Partial<DocumentResource>[] = [
      {
        id: "doc-1",
        original_name: "lecture-notes.pdf",
        quality_score: 87,
      },
      {
        id: "doc-2",
        original_name: "reference-book.pdf",
        quality_score: 95,
      },
    ];
    queryClient.setQueryData(
      ["course-documents", mockOrgId, mockCourseId],
      cachedDocs,
    );

    render(
      <QueryClientProvider client={queryClient}>
        <SourcePackCard
          pack={mockPack}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("۸۷٪")).toBeDefined();
    expect(screen.getByText("۹۵٪")).toBeDefined();

    expect(screen.queryByText(/کیفیت فایل/i)).toBeNull();
    expect(screen.queryByText(/امتیاز کیفیت/i)).toBeNull();
    expect(screen.queryByText(/Quality/i)).toBeNull();
  });
});
