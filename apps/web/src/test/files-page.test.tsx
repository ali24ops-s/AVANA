// @ts-nocheck
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { FilesPage } from "../pages/FilesPage.js";
import { FileStatsCards } from "../components/files/FileStatsCards.js";
import { FileTable } from "../components/files/FileTable.js";
import { FileFilterToolbar } from "../components/files/FileFilterToolbar.js";
import { FileDetailsDrawer } from "../components/files/FileDetailsDrawer.js";
import { FileUploadModal } from "../components/files/FileUploadModal.js";
import { FileDeleteModal } from "../components/files/FileDeleteModal.js";
import type {
  DocumentResource,
  DocumentDetailResource,
  DocumentStatsResource,
} from "@avana/contracts";

// Mock AuthProvider
vi.mock("../providers/AuthProvider.js", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "user@avana.ir", role: "organization_admin" },
    memberships: [{ organization_id: "org-123", role: "organization_admin" }],
    isAuthenticated: true,
  }),
}));

// Mock APIs
const mockDocs: DocumentResource[] = [
  {
    id: "doc-1",
    organization_id: "org-123",
    course_id: "course-1",
    owner_user_id: "user-1",
    original_name: "pharmacology_ch1.pdf",
    mime_type: "application/pdf",
    size_bytes: 1048576, // 1 MB
    sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    status: "extracted",
    error_code: null,
    retry_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: "doc-2",
    organization_id: "org-123",
    course_id: null,
    owner_user_id: "user-1",
    original_name: "unassigned_notes.docx",
    mime_type:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size_bytes: 524288, // 512 KB
    sha256: "a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0",
    status: "uploaded",
    error_code: null,
    retry_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const mockStats: DocumentStatsResource = {
  total_count: 2,
  total_size_bytes: 1572864,
  status_counts: { extracted: 1, uploaded: 1 },
  used_count: 1,
  unused_count: 1,
};

const mockDetailDoc: DocumentDetailResource = {
  ...mockDocs[0],
  storage_key: "uploads/doc-1.pdf",
  page_count: 12,
  usage: {
    course: { id: "course-1", name: "داروشناسی پایه" },
    modules: [{ id: "mod-1", title: "فصل اول: مقدمات" }],
    lessons_count: 3,
    flashcards_count: 24,
    quizzes_count: 2,
    chunks_count: 18,
    generated_contents_count: 4,
  },
};

vi.mock("../lib/api/documents.js", () => ({
  createDocumentsApi: () => ({
    getDocumentStats: vi.fn().mockResolvedValue({
      request_id: "req-1",
      stats: mockStats,
    }),
    listDocuments: vi.fn().mockResolvedValue({
      request_id: "req-2",
      items: mockDocs,
      pagination: {
        total: 2,
        page: 1,
        limit: 25,
        total_pages: 1,
        next_cursor: null,
      },
    }),
    getDocument: vi.fn().mockResolvedValue({
      request_id: "req-3",
      document: mockDetailDoc,
    }),
    uploadDocument: vi.fn().mockResolvedValue({
      request_id: "req-4",
      duplicate: false,
      document: mockDocs[0],
    }),
    updateDocument: vi.fn().mockResolvedValue({
      request_id: "req-5",
      document: mockDocs[0],
    }),
    deleteDocument: vi.fn().mockResolvedValue(undefined),
    bulkDeleteDocuments: vi.fn().mockResolvedValue({
      request_id: "req-6",
      total: 1,
      succeeded: 1,
      failed: 0,
      results: [{ document_id: "doc-1", success: true }],
    }),
    reprocessDocument: vi.fn().mockResolvedValue({
      request_id: "req-7",
      status: { status: "extracted" },
    }),
    getDownloadUrl: vi.fn().mockReturnValue("/download-url"),
  }),
}));

vi.mock("../lib/api/courses.js", () => ({
  createCourseApi: () => ({
    listCourses: vi.fn().mockResolvedValue({
      request_id: "req-8",
      items: [{ id: "course-1", title: "داروشناسی پایه" }],
      pagination: { total: 1, limit: 10, next_cursor: null },
    }),
  }),
}));

vi.mock("../lib/api/organizations.js", () => ({
  createOrganizationApi: () => ({
    listOrganizations: vi.fn().mockResolvedValue({
      request_id: "req-9",
      items: [{ id: "org-123", name: "سازمان آزمایشی" }],
    }),
  }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("File Management Center (/files)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the main files page with title, upload button, and stats", async () => {
    renderWithClient(<FilesPage />);

    expect(
      screen.getByText("فایل‌ها و منابع آموزشی"),
    ).toBeInTheDocument();
    expect(screen.getByText("+ آپلود فایل جدید")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("pharmacology_ch1.pdf").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("unassigned_notes.docx").length).toBeGreaterThanOrEqual(1);
    });
  });

  it("renders statistics cards with formatted values", () => {
    render(<FileStatsCards stats={mockStats} />);

    expect(screen.getByText("کل فایل‌ها")).toBeInTheDocument();
    expect(screen.getByText("حجم کل منابع")).toBeInTheDocument();
    expect(screen.getByText("آماده استفاده")).toBeInTheDocument();
    expect(screen.getByText("متصل به دوره")).toBeInTheDocument();
  });

  it("handles filter changes in toolbar", () => {
    const handleChange = vi.fn();
    render(
      <FileFilterToolbar
        filters={{ sort: "newest", page: 1, limit: 25 }}
        onChange={handleChange}
      />,
    );

    const searchInput = screen.getByPlaceholderText(
      "جستجوی نام فایل، دوره، درس یا نوع فایل...",
    );
    fireEvent.change(searchInput, { target: { value: "فارماکولوژی" } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ search: "فارماکولوژی" }),
    );
  });

  it("renders file table with MIME icons and status badges", () => {
    render(
      <FileTable
        documents={mockDocs}
        selectedIds={[]}
        onSelectAll={vi.fn()}
        onSelectOne={vi.fn()}
        onViewDetails={vi.fn()}
        onPreview={vi.fn()}
        onDownload={vi.fn()}
        onRename={vi.fn()}
        onAttachCourse={vi.fn()}
        onReprocess={vi.fn()}
        onDelete={vi.fn()}
        onCopyLink={vi.fn()}
        coursesMap={{ "course-1": "داروشناسی پایه" }}
      />,
    );

    expect(screen.getAllByText("pharmacology_ch1.pdf").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("داروشناسی پایه").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("بدون اتصال").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("آماده استفاده").length).toBeGreaterThanOrEqual(1);
  });

  it("renders FileDetailsDrawer with technical and educational metadata", () => {
    render(
      <FileDetailsDrawer
        document={mockDetailDoc}
        isOpen={true}
        onClose={vi.fn()}
        onPreview={vi.fn()}
        onDownload={vi.fn()}
        onRename={vi.fn()}
        onAttachCourse={vi.fn()}
        onReprocess={vi.fn()}
        onDelete={vi.fn()}
        getDownloadUrl={vi.fn().mockReturnValue("/url")}
      />,
    );

    expect(
      screen.getByText("اطلاعات عمومی و فنی"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("جریان آموزشی و AI"),
    ).toBeInTheDocument();
    expect(screen.getByText("پیش‌نمایش فایل")).toBeInTheDocument();
    expect(screen.getByText("شناسه سند (Document ID)")).toBeInTheDocument();

    // Switch to educational tab
    fireEvent.click(screen.getByText("جریان آموزشی و AI"));
    expect(screen.getAllByText("داروشناسی پایه").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("فصل اول: مقدمات")).toBeInTheDocument();
  });

  it("renders FileDeleteModal with dependency warning", () => {
    render(
      <FileDeleteModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        document={mockDetailDoc}
      />,
    );

    expect(
      screen.getByText("هشدار وابستگی‌های آموزشی:"),
    ).toBeInTheDocument();
    expect(screen.getByText("متصل به دوره: داروشناسی پایه")).toBeInTheDocument();
    expect(screen.getByText("تأیید و حذف نهایی")).toBeInTheDocument();
  });

  it("renders FileUploadModal and allows course selection", () => {
    render(
      <FileUploadModal
        isOpen={true}
        onClose={vi.fn()}
        onUploadFile={vi.fn().mockResolvedValue({ success: true })}
        courses={[{ id: "course-1", title: "داروشناسی پایه" } as any]}
      />,
    );

    expect(
      screen.getByText("آپلود فایل‌ها و منابع آموزشی"),
    ).toBeInTheDocument();
    expect(screen.getByText("انتخاب دوره (اختیاری)")).toBeInTheDocument();
    expect(screen.getAllByText("داروشناسی پایه").length).toBeGreaterThanOrEqual(1);
  });
});
