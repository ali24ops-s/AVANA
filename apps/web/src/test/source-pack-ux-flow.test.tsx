import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CreateSourcePackModal } from "../components/documents/CreateSourcePackModal.js";
import type { DocumentResource } from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

describe("Source Addition & Source Pack UX Flow", () => {
  const mockOrgId = "00000000-0000-0000-0000-000000000001";
  const mockCourseId = "00000000-0000-0000-0000-000000000002";

  const existingDoc1: DocumentResource = {
    id: "doc-111",
    organization_id: mockOrgId,
    course_id: mockCourseId,
    original_name: "lecture-slides.pdf",
    mime_type: "application/pdf",
    size_bytes: 1024 * 1024 * 2,
    status: "extracted",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const existingDoc2: DocumentResource = {
    id: "doc-222",
    organization_id: mockOrgId,
    course_id: mockCourseId,
    original_name: "reference-book.pdf",
    mime_type: "application/pdf",
    size_bytes: 1024 * 1024 * 5,
    status: "extracted",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  let uploadCounter = 0;
  beforeEach(() => {
    vi.restoreAllMocks();
    uploadCounter = 0;
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      // Mock upload
      if (url.includes("/documents") && init?.method === "POST" && !url.includes("/extract")) {
        uploadCounter++;
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-upload",
            document: {
              id: `doc-uploaded-${uploadCounter}`,
              organization_id: mockOrgId,
              course_id: mockCourseId,
              original_name: "test.pdf",
              mime_type: "application/pdf",
              size_bytes: 1000,
              status: "uploaded",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        });
      }
      // Mock extract
      if (url.includes("/extract")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            request_id: "req-extract",
            status: {
              document_id: "doc-uploaded-1",
              status: "extracting",
            },
          }),
        });
      }
      // Mock source pack creation
      if (url.includes("/source-packs") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: async () => ({
            request_id: "req-pack",
            source_pack: {
              id: "pack-1",
              organization_id: mockOrgId,
              course_id: mockCourseId,
              title: "پک منابع درس",
              documents: [],
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ request_id: "req-def", items: [] }),
      });
    });
  });

  it("Scenario A: single file shows single-source mode without role selector or pack title", async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <CreateSourcePackModal
          isOpen={true}
          onClose={vi.fn()}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    // Initial state: 0 files
    expect(screen.getByText("افزودن منبع به درس")).toBeDefined();
    expect(screen.queryByText("عنوان پک منابع")).toBeNull();

    // Select 1 file
    const file = new File(["notes"], "lecture1.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    // Scenario A assertions:
    await waitFor(() => {
      expect(screen.getByText("lecture1.pdf")).toBeDefined();
      expect(screen.getByText("جزوه اصلی")).toBeDefined();
      // No role selector dropdown
      expect(screen.queryByRole("combobox")).toBeNull();
      // Title input still hidden
      expect(screen.queryByText("عنوان پک منابع")).toBeNull();
      // + Add another source button visible
      expect(screen.getByText("+ افزودن منبع دیگر")).toBeDefined();
      // Primary button is single source
      expect(screen.getByText("بارگذاری و ثبت منبع")).toBeDefined();
    });
  });

  it("Scenario B: adding 2nd file enters multi-source mode seamlessly", async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <CreateSourcePackModal
          isOpen={true}
          onClose={vi.fn()}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file1 = new File(["notes"], "lecture1.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file1] } });

    await waitFor(() => {
      expect(screen.getByText("lecture1.pdf")).toBeDefined();
    });

    // Add 2nd file
    const file2 = new File(["slides"], "slides.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file2] } });

    await waitFor(() => {
      // Header switches to multi-source
      expect(screen.getByText("پک منابع یکپارچه")).toBeDefined();
      expect(screen.getByText("منابع را برای تولید یکپارچه محتوا کنار هم قرار دهید.")).toBeDefined();
      // Title input is shown
      expect(screen.getByText("عنوان پک منابع")).toBeDefined();
      // Role selectors are displayed
      const selects = screen.getAllByRole("combobox");
      expect(selects.length).toBe(2);
      // File 1 is primary_notes, File 2 is supplementary_reference
      expect((selects[0] as HTMLSelectElement).value).toBe("primary_notes");
      expect((selects[1] as HTMLSelectElement).value).toBe("supplementary_reference");
      // Button is multi-source
      expect(screen.getByText("ایجاد پک منابع یکپارچه")).toBeDefined();
    });
  });

  it("Scenario C & D: role uniqueness enforcement and automatic fallback", async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <CreateSourcePackModal
          isOpen={true}
          onClose={vi.fn()}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file1 = new File(["f1"], "file1.pdf", { type: "application/pdf" });
    const file2 = new File(["f2"], "file2.pdf", { type: "application/pdf" });
    const file3 = new File(["f3"], "file3.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file1, file2, file3] } });

    await waitFor(() => {
      expect(screen.getAllByRole("combobox").length).toBe(3);
    });

    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];

    // Scenario C: Make file 3 question_template
    fireEvent.change(selects[2], { target: { value: "question_template" } });

    await waitFor(() => {
      expect(selects[0].value).toBe("primary_notes");
      expect(selects[1].value).toBe("supplementary_reference");
      expect(selects[2].value).toBe("question_template");
    });

    // Scenario D: Make file 2 primary_notes
    fireEvent.change(selects[1], { target: { value: "primary_notes" } });

    await waitFor(() => {
      // File 2 is now primary_notes
      expect(selects[1].value).toBe("primary_notes");
      // File 1 falls back to supplementary_reference
      expect(selects[0].value).toBe("supplementary_reference");
      // File 3 remains question_template
      expect(selects[2].value).toBe("question_template");
    });
  });

  it("Scenario E: deleting files back to 1 returns smoothly to single-source mode", async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <CreateSourcePackModal
          isOpen={true}
          onClose={vi.fn()}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file1 = new File(["f1"], "file1.pdf", { type: "application/pdf" });
    const file2 = new File(["f2"], "file2.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file1, file2] } });

    await waitFor(() => {
      expect(screen.getByText("پک منابع یکپارچه")).toBeDefined();
    });

    // Delete second file
    const deleteButtons = screen.getAllByTitle("حذف فایل");
    expect(deleteButtons.length).toBe(2);
    fireEvent.click(deleteButtons[1]);

    await waitFor(() => {
      // Returned to single source
      expect(screen.getByText("افزودن منبع به درس")).toBeDefined();
      expect(screen.queryByText("عنوان پک منابع")).toBeNull();
      expect(screen.queryByRole("combobox")).toBeNull();
      expect(screen.getByText("جزوه اصلی")).toBeDefined();
      expect(screen.getByText("بارگذاری و ثبت منبع")).toBeDefined();
    });
  });

  it("Scenario F: selecting multiple files at once enters multi-source directly", async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <CreateSourcePackModal
          isOpen={true}
          onClose={vi.fn()}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file1 = new File(["f1"], "first.pdf", { type: "application/pdf" });
    const file2 = new File(["f2"], "second.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file1, file2] } });

    await waitFor(() => {
      expect(screen.getByText("پک منابع یکپارچه")).toBeDefined();
      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      expect(selects[0].value).toBe("primary_notes");
      expect(selects[1].value).toBe("supplementary_reference");
    });
  });

  it("Scenario G: selecting existing documents transitions to multi-source", async () => {
    const queryClient = createTestQueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <CreateSourcePackModal
          isOpen={true}
          onClose={vi.fn()}
          organizationId={mockOrgId}
          courseId={mockCourseId}
          existingDocuments={[existingDoc1, existingDoc2]}
        />
      </QueryClientProvider>,
    );

    // Open existing picker
    const openPickerBtn = screen.getByText(/انتخاب از میان فایل‌های قبلاً آپلودشده/);
    fireEvent.click(openPickerBtn);

    // Add first existing doc
    const addButtons = screen.getAllByRole("button", { name: "افزودن" });
    fireEvent.click(addButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("lecture-slides.pdf")).toBeDefined();
      expect(screen.getByText("افزودن منبع به درس")).toBeDefined();
    });

    // Add second existing doc
    fireEvent.click(screen.getByText(/انتخاب از میان فایل‌های قبلاً آپلودشده/));
    const addButtons2 = screen.getAllByRole("button", { name: "افزودن" });
    fireEvent.click(addButtons2[0]);

    await waitFor(() => {
      expect(screen.getByText("reference-book.pdf")).toBeDefined();
      expect(screen.getByText("پک منابع یکپارچه")).toBeDefined();
      const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
      expect(selects.length).toBe(2);
      expect(selects[0].value).toBe("primary_notes");
      expect(selects[1].value).toBe("supplementary_reference");
    });
  });

  it("Scenario H: submitting 1 file uploads & extracts without creating a 1-file source pack", async () => {
    const queryClient = createTestQueryClient();
    const onClose = vi.fn();
    const onCreated = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <CreateSourcePackModal
          isOpen={true}
          onClose={onClose}
          onCreated={onCreated}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["notes"], "lecture.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("بارگذاری و ثبت منبع")).toBeDefined();
    });

    fireEvent.click(screen.getByText("بارگذاری و ثبت منبع"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(onCreated).toHaveBeenCalled();
    });

    // Verify upload and extract were called, but source pack creation was NEVER called
    const fetchCalls = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    const uploadCall = fetchCalls.find(([url]) => url.includes("/documents") && !url.includes("/extract"));
    const extractCall = fetchCalls.find(([url]) => url.includes("/extract"));
    const packCall = fetchCalls.find(([url]) => url.includes("/source-packs"));

    expect(uploadCall).toBeDefined();
    expect(extractCall).toBeDefined();
    expect(packCall).toBeUndefined(); // Crucial: No 1-document source pack!
  });

  it("Scenario I: submitting multiple files creates source pack with roles and order", async () => {
    const queryClient = createTestQueryClient();
    const onClose = vi.fn();
    const onCreated = vi.fn();

    render(
      <QueryClientProvider client={queryClient}>
        <CreateSourcePackModal
          isOpen={true}
          onClose={onClose}
          onCreated={onCreated}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </QueryClientProvider>,
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file1 = new File(["f1"], "notes.pdf", { type: "application/pdf" });
    const file2 = new File(["f2"], "exam.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file1, file2] } });

    await waitFor(() => {
      expect(screen.getByText("ایجاد پک منابع یکپارچه")).toBeDefined();
    });

    fireEvent.click(screen.getByText("ایجاد پک منابع یکپارچه"));

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(onCreated).toHaveBeenCalled();
    });

    const fetchCalls = (global.fetch as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    const packCall = fetchCalls.find(([url, init]) => url.includes("/source-packs") && init?.method === "POST");
    expect(packCall).toBeDefined();

    const body = JSON.parse(packCall![1].body as string);
    expect(body.documents).toHaveLength(2);
    expect(body.documents[0].role).toBe("primary_notes");
    expect(body.documents[0].order_index).toBe(0);
    expect(body.documents[1].role).toBe("supplementary_reference");
    expect(body.documents[1].order_index).toBe(1);
  });
});
