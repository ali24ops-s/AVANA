import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReviewDocumentGroup } from "../components/review/ReviewDocumentGroup";
import { EvidenceSummary } from "../components/review/EvidenceSummary";
import { AdminGenerationDetailPage } from "../pages/admin/AdminGenerationDetailPage";
import * as useAdminModule from "../hooks/useAdmin";
import { api } from "../lib/api/admin";
import type { ReviewDocumentGroupResource } from "@avana/contracts";

vi.mock("../hooks/useAdmin", () => ({
  useAdmin: vi.fn(),
}));

vi.mock("../lib/api/admin", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../lib/api/admin.js")>();
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
    },
  };
});

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return { queryClient };
}

describe("Original Document Download Enhancements", () => {
  const downloadDocumentMock = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    vi.mocked(useAdminModule.useAdmin).mockReturnValue({
      downloadDocument: downloadDocumentMock,
    } as unknown as ReturnType<typeof useAdminModule.useAdmin>);
  });

  describe("ReviewDocumentGroup", () => {
    it("renders download button for valid document and triggers download", async () => {
      const mockGroup: ReviewDocumentGroupResource = {
        document: {
          id: "doc-uuid-1",
          filename: "chapter-1-biochem.pdf",
          title: "بیوشیمی پزشکی",
          created_at: new Date().toISOString(),
        },
        stats: { total: 2, pending: 1, approved: 1, rejected: 0, needsRevision: 0 },
        items: [],
      };

      render(
        <ReviewDocumentGroup
          group={mockGroup}
          onSelectItem={vi.fn()}
        />
      );

      const downloadBtn = screen.getByRole("button", { name: "دانلود فایل اصلی" });
      expect(downloadBtn).toBeInTheDocument();

      fireEvent.click(downloadBtn);

      expect(downloadDocumentMock).toHaveBeenCalledTimes(1);
      expect(downloadDocumentMock).toHaveBeenCalledWith("doc-uuid-1", "chapter-1-biochem.pdf");
    });

    it("does not render download button when document is unknown", () => {
      const mockGroup: ReviewDocumentGroupResource = {
        document: {
          id: "__unknown__",
          filename: "منبع نامشخص",
          title: "منبع نامشخص",
        },
        stats: { total: 1, pending: 1, approved: 0, rejected: 0, needsRevision: 0 },
        items: [],
      };

      render(
        <ReviewDocumentGroup
          group={mockGroup}
          onSelectItem={vi.fn()}
        />
      );

      expect(screen.queryByRole("button", { name: "دانلود فایل اصلی" })).not.toBeInTheDocument();
    });
  });

  describe("EvidenceSummary", () => {
    it("renders source document name, size, and triggers onDownload", () => {
      const onDownload = vi.fn();
      render(
        <EvidenceSummary
          sourceChunks={[
            {
              id: "chunk-1",
              chunk_index: 0,
              document_id: "doc-1",
              similarity_score: 0.9,
              metadata: { title: "بخش ۱" },
              content: "متن نمونه برای بررسی کلمات",
            },
          ]}
          document={{
            id: "doc-1",
            originalName: "cardiology-guide.pdf",
            sizeBytes: 1024 * 1024 * 2.5, // 2.5 MB
          }}
          onDownload={onDownload}
        />
      );

      expect(screen.getByText("cardiology-guide.pdf")).toBeInTheDocument();
      expect(screen.getByText(/فایل سند منبع/)).toBeInTheDocument();
      expect(screen.getByText(/حجم فایل/)).toBeInTheDocument();

      const downloadBtn = screen.getByRole("button", { name: /دانلود فایل اصلی/i });
      fireEvent.click(downloadBtn);
      expect(onDownload).toHaveBeenCalledTimes(1);
    });

    it("does not render document section when document id is __unknown__", () => {
      render(
        <EvidenceSummary
          sourceChunks={[]}
          document={{
            id: "__unknown__",
            originalName: "Unknown",
          }}
          onDownload={vi.fn()}
        />
      );

      expect(screen.queryByText(/فایل سند منبع/)).not.toBeInTheDocument();
    });
  });

  describe("AdminGenerationDetailPage", () => {
    it("renders document download button and source pack list with semantic roles", async () => {
      const mockJob = {
        id: "job-pack-10",
        type: "lesson",
        status: "completed",
        createdAt: new Date().toISOString(),
        document: {
          id: "doc-primary-1",
          originalName: "primary-lecture-notes.pdf",
          sizeBytes: 1048576, // 1 MB
        },
        sources: [
          {
            documentId: "doc-primary-1",
            originalName: "primary-lecture-notes.pdf",
            role: "primary_notes",
            orderIndex: 0,
            sizeBytes: 1048576,
          },
          {
            documentId: "doc-questions-2",
            originalName: "sample-exam-template.docx",
            role: "question_template",
            orderIndex: 1,
            sizeBytes: 524288,
          },
        ],
      };

      vi.mocked(api.get).mockResolvedValue(mockJob);

      const { queryClient } = setup();

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={["/admin/generation/job-pack-10"]}>
            <Routes>
              <Route path="/admin/generation/:id" element={<AdminGenerationDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByText("منابع ورودی پکیج (Source Pack Documents)")).toBeInTheDocument();
      });

      // Role badges check
      expect(screen.getByText("جزوه اصلی (مسیر تدریس)")).toBeInTheDocument();
      expect(screen.getByText("قالب نمونه سؤال")).toBeInTheDocument();

      // Download buttons
      const downloadButtons = screen.getAllByRole("button", { name: /دانلود/i });
      expect(downloadButtons.length).toBeGreaterThanOrEqual(3); // 1 in Doc card + 2 in Sources

      // Click the first source pack download button
      fireEvent.click(downloadButtons[1]);
      await waitFor(() => {
        expect(downloadDocumentMock).toHaveBeenCalledWith("doc-primary-1", "primary-lecture-notes.pdf");
      });
    });
  });
});
