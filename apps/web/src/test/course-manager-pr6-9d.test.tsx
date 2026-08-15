/**
 * PR6-9D — Course Manager Experience Hardening tests.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DocumentUploader } from "../components/documents/DocumentUploader.js";
import { DocumentStatusCard } from "../components/documents/DocumentStatusCard.js";
import { ReviewQueueList } from "../components/review/ReviewQueueList.js";
import { ContentReviewDetail } from "../components/review/ContentReviewDetail.js";
import type { DocumentResource } from "@avana/contracts";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={createTestQueryClient()}>
    {children}
  </QueryClientProvider>
);

const mockOrgId = "00000000-0000-0000-0000-000000000001";
const mockCourseId = "00000000-0000-0000-0000-000000000002";
const mockContentId = "00000000-0000-0000-0000-000000000003";
const mockDocId = "00000000-0000-0000-0000-000000000004";

const makeDocument = (
  status: DocumentResource["status"] = "uploaded",
): DocumentResource => ({
  id: mockDocId,
  organization_id: mockOrgId,
  course_id: mockCourseId,
  owner_user_id: "00000000-0000-0000-0000-000000000099",
  original_name: "lecture1.pdf",
  mime_type: "application/pdf",
  size_bytes: 1024 * 1024,
  sha256: "abc123",
  status,
  error_code: null,
  retry_count: 0,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

const makeDetailFetch = (overrides = {}) =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: async () => ({
      request_id: "req-detail",
      content: {
        id: mockContentId,
        document_id: mockDocId,
        course_id: mockCourseId,
        type: "lesson",
        status: "draft",
        payload: {
          title: "Test Lesson Title",
          markdown: "# Heading\n\nBody text.",
        },
        prompt_version: "v1",
        model: "gemini-1.5-pro",
        token_usage: { input_tokens: 100, output_tokens: 200 },
        citations: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      source_chunks: [],
      generation: {
        model: "gemini-1.5-pro",
        prompt_version: "v1",
        token_usage: { input_tokens: 100, output_tokens: 200 },
      },
      ...overrides,
    }),
  });

describe("DocumentUploader", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows validation error with aria-live when unsupported file is selected", async () => {
    render(
      <Wrapper>
        <DocumentUploader organizationId={mockOrgId} courseId={mockCourseId} />
      </Wrapper>,
    );

    const input = document.querySelector(
      "input[type='file']",
    ) as HTMLInputElement;
    const badFile = new File(["data"], "virus.exe", {
      type: "application/x-msdownload",
    });
    fireEvent.change(input, { target: { files: [badFile] } });

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeDefined();
      expect(alert.getAttribute("aria-live")).toBe("polite");
      expect(alert.textContent).toMatch(/فرمت فایل پشتیبانی نمی‌شود/i);
    });
  });

  it("shows upload server error when API returns error", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null },
      text: async () => JSON.stringify({ error: { code: "internal_error", message: "Server blew up" } }),
      json: async () => ({ error: { code: "internal_error", message: "Server blew up" } }),
    });

    render(
      <Wrapper>
        <DocumentUploader organizationId={mockOrgId} courseId={mockCourseId} />
      </Wrapper>,
    );

    const input = document.querySelector(
      "input[type='file']",
    ) as HTMLInputElement;
    const file = new File(["pdf content"], "lecture.pdf", {
      type: "application/pdf",
    });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() =>
      expect(screen.getByText("lecture.pdf")).toBeDefined(),
    );

    fireEvent.click(screen.getByRole("button", { name: /آپلود و شروع پردازش/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/خطا در بارگذاری فایل|server blew up/i),
      ).toBeDefined();
    });
  });
});

describe("DocumentStatusCard", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows 'Queued' badge for uploaded status", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        request_id: "req-1",
        status: {
          document_id: mockDocId,
          organization_id: mockOrgId,
          status: "uploaded",
          page_count: null,
          chunk_count: null,
          error_code: null,
          retry_count: 0,
          updated_at: new Date().toISOString(),
        },
      }),
    });

    render(
      <Wrapper>
        <DocumentStatusCard
          document={makeDocument("uploaded")}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </Wrapper>,
    );

    await waitFor(() => {
      expect(screen.getAllByText("در صف انتظار").length).toBeGreaterThan(0);
    });
  });

  it("shows error banner when generation fails", async () => {
    global.fetch = vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
      if (typeof url === "string" && url.includes("/generate") && opts?.method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 409,
          headers: { get: () => null },
          text: async () => JSON.stringify({ error: { code: "conflict", message: "Document not in a generatable state" } }),
          json: async () => ({ error: { code: "conflict", message: "Document not in a generatable state" } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-status",
          status: {
            document_id: mockDocId,
            organization_id: mockOrgId,
            status: "extracted",
            page_count: 10,
            chunk_count: 20,
            error_code: null,
            retry_count: 0,
            updated_at: new Date().toISOString(),
          },
        }),
      });
    });

    render(
      <Wrapper>
        <DocumentStatusCard
          document={makeDocument("extracted")}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getByText("استخراج‌شده")).toBeDefined(),
    );

    fireEvent.click(screen.getByRole("button", { name: /تولید هوشمند محتوای آموزشی/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/not in a generatable state|خطا در شروع تولید هوشمند محتوا/i),
      ).toBeDefined();
    });
  });

  it("shows error banner when extraction retry fails", async () => {
    global.fetch = vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
      if (typeof url === "string" && url.includes("/extract") && opts?.method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 500,
          headers: { get: () => null },
          text: async () => JSON.stringify({ error: { code: "internal_error", message: "Extraction service unavailable" } }),
          json: async () => ({ error: { code: "internal_error", message: "Extraction service unavailable" } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          request_id: "req-status",
          status: {
            document_id: mockDocId,
            organization_id: mockOrgId,
            status: "failed",
            page_count: null,
            chunk_count: null,
            error_code: "extraction_failed",
            retry_count: 1,
            updated_at: new Date().toISOString(),
          },
        }),
      });
    });

    render(
      <Wrapper>
        <DocumentStatusCard
          document={makeDocument("failed")}
          organizationId={mockOrgId}
          courseId={mockCourseId}
        />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getByText("خطا در پردازش")).toBeDefined(),
    );

    fireEvent.click(screen.getByRole("button", { name: /تلاش مجدد استخراج/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/unavailable|خطا در پردازش مجدد سند/i),
      ).toBeDefined();
    });
  });
});

describe("ReviewQueueList filter buttons", () => {
  beforeEach(() => {
    cleanup();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ request_id: "req-1", pending: [] }),
    });
  });

  it("sets aria-pressed=true on the active filter and false on others", async () => {
    render(
      <Wrapper>
        <ReviewQueueList organizationId={mockOrgId} courseId={mockCourseId} />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getByText("موردی در انتظار بازبینی وجود ندارد")).toBeDefined(),
    );

    const allBtn = screen.getByRole("button", { name: /^همه$/i });
    const lessonBtn = screen.getByRole("button", { name: /^درس‌ها$/i });

    expect(allBtn.getAttribute("aria-pressed")).toBe("true");
    expect(lessonBtn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(lessonBtn);

    await waitFor(() => {
      expect(allBtn.getAttribute("aria-pressed")).toBe("false");
      expect(lessonBtn.getAttribute("aria-pressed")).toBe("true");
    });
  });
});

describe("ContentReviewDetail", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows accept error banner when accept API fails", async () => {
    global.fetch = vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
      if (typeof url === "string" && url.includes("/accept") && opts?.method === "POST") {
        return Promise.resolve({
          ok: false,
          status: 409,
          headers: { get: () => null },
          text: async () => JSON.stringify({ error: { code: "conflict", message: "Content already accepted" } }),
          json: async () => ({ error: { code: "conflict", message: "Content already accepted" } }),
        });
      }
      return makeDetailFetch();
    });

    render(
      <Wrapper>
        <ContentReviewDetail
          organizationId={mockOrgId}
          courseId={mockCourseId}
          contentId={mockContentId}
          onBack={vi.fn()}
        />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getAllByText("Test Lesson Title").length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByRole("button", { name: /تایید و انتشار/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/already accepted|خطا در تایید و انتشار محتوا/i),
      ).toBeDefined();
    });
  });

  it("disables Edit, Regenerate, and Reject buttons while accept is pending", async () => {
    global.fetch = vi.fn().mockImplementation((url: string, opts?: { method?: string }) => {
      if (typeof url === "string" && url.includes("/accept") && opts?.method === "POST") {
        return new Promise(() => {}); // hang forever
      }
      return makeDetailFetch();
    });

    render(
      <Wrapper>
        <ContentReviewDetail
          organizationId={mockOrgId}
          courseId={mockCourseId}
          contentId={mockContentId}
          onBack={vi.fn()}
        />
      </Wrapper>,
    );

    await waitFor(() =>
      expect(screen.getAllByText("Test Lesson Title").length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByRole("button", { name: /تایید و انتشار/i }));

    await waitFor(() => {
      const editBtn = screen.getByRole("button", { name: /ویرایش پیش‌نویس/i });
      const rejectBtn = screen.getByRole("button", { name: /رد کردن/i });
      const regenerateBtn = screen.getByRole("button", { name: /تولید مجدد/i });

      expect((editBtn as HTMLButtonElement).disabled).toBe(true);
      expect((rejectBtn as HTMLButtonElement).disabled).toBe(true);
      expect((regenerateBtn as HTMLButtonElement).disabled).toBe(true);
    });
  });
});
