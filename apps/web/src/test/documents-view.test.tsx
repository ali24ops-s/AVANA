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
});
