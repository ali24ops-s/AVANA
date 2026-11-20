import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SlideRenderer } from "../components/presentation/SlideRenderer.js";
import { PresentationPreviewModal } from "../components/presentation/PresentationPreviewModal.js";
import type { PresentationSlideResource } from "@avana/contracts";

vi.mock("../lib/api/presentation.js", () => ({
  presentationApi: {
    getPdfStatus: vi.fn(),
    getPdfUrl: vi.fn((projectId: string) => `/v1/presentation/projects/${projectId}/slides-pdf`),
  },
}));

vi.mock("../components/presentation/PdfSlideViewer.js", () => ({
  PdfSlideViewer: ({
    slideIndex,
    pdfUrl,
    isFullscreen,
  }: {
    slideIndex: number;
    pdfUrl: string;
    isFullscreen?: boolean;
  }) => (
    <div data-testid="mock-pdf-slide-viewer" data-fullscreen={Boolean(isFullscreen)}>
      PDF Viewer Page {slideIndex} from {pdfUrl}
    </div>
  ),
}));

import { presentationApi } from "../lib/api/presentation.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

const renderWithClient = (ui: React.ReactElement) => {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
};

describe("PDF Slide Rendering & Fallbacks", () => {
  const mockSlide: PresentationSlideResource = {
    id: "slide-1",
    project_id: "project-123",
    slide_index: 2,
    title: "Pharmacokinetics of Penicillin",
    raw_text: "Absorption, Distribution, Metabolism, Excretion",
    extracted_tables: [],
    speaker_notes: "Focus on renal clearance.",
    has_visuals: true,
    visual_summary: "1 chart: Clearance Graph",
    media_storage_keys: ["media/clearance.png"],
    extraction_metadata: {
      importedFromPptx: true,
      textBlocks: [
        { type: "title", text: "Pharmacokinetics of Penicillin", order: 0 },
        { type: "bullet", text: "Absorption is rapid orally", order: 1 },
      ],
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders PdfSlideViewer when PDF status is ready", async () => {
    vi.mocked(presentationApi.getPdfStatus).mockResolvedValue({
      project_id: "project-123",
      status: "ready",
      pdf_url: "/v1/presentation/projects/project-123/slides-pdf",
    });

    renderWithClient(<SlideRenderer slide={mockSlide} totalSlides={5} />);

    await waitFor(() => {
      expect(screen.getByTestId("mock-pdf-slide-viewer")).toBeDefined();
    });

    expect(screen.getByText(/PDF Viewer Page 2 from/)).toBeDefined();
  });

  it("falls back to structured text renderer with processing indicator while converting", async () => {
    vi.mocked(presentationApi.getPdfStatus).mockResolvedValue({
      project_id: "project-123",
      status: "processing",
    });

    renderWithClient(<SlideRenderer slide={mockSlide} totalSlides={5} />);

    // Should show the processing badge once query resolves
    await waitFor(() => {
      expect(screen.getByText(/در حال آماده‌سازی نسخه باکیفیت اسلاید/)).toBeDefined();
    });

    // Should render the fallback title and bullets
    expect(screen.getAllByText("Pharmacokinetics of Penicillin").length).toBeGreaterThan(0);
    expect(screen.getByText("Absorption is rapid orally")).toBeDefined();
  });

  it("falls back to structured text renderer without error or spinner when PDF is unavailable", async () => {
    vi.mocked(presentationApi.getPdfStatus).mockResolvedValue({
      project_id: "project-123",
      status: "unavailable",
      error: "LibreOffice is not installed on server.",
    });

    renderWithClient(<SlideRenderer slide={mockSlide} totalSlides={5} />);

    // Mock PDF viewer should not render
    expect(screen.queryByTestId("mock-pdf-slide-viewer")).toBeNull();
    // No processing spinner/badge
    expect(screen.queryByText(/در حال آماده‌سازی نسخه باکیفیت اسلاید/)).toBeNull();
    // No failure notice
    expect(screen.queryByText(/در حال نمایش نسخه متنی اسلاید/)).toBeNull();

    // Text content should be gracefully rendered
    expect(screen.getAllByText("Pharmacokinetics of Penicillin").length).toBeGreaterThan(0);
    expect(screen.getByText("Absorption is rapid orally")).toBeDefined();
  });

  it("falls back to structured text renderer with informative hint when PDF conversion failed", async () => {
    vi.mocked(presentationApi.getPdfStatus).mockResolvedValue({
      project_id: "project-123",
      status: "failed",
      error: "Conversion timed out",
    });

    renderWithClient(<SlideRenderer slide={mockSlide} totalSlides={5} />);

    await waitFor(() => {
      expect(screen.getByText(/در حال نمایش نسخه متنی اسلاید/)).toBeDefined();
    });

    // Mock PDF viewer should not render
    expect(screen.queryByTestId("mock-pdf-slide-viewer")).toBeNull();
    // No processing spinner/badge
    expect(screen.queryByText(/در حال آماده‌سازی نسخه باکیفیت اسلاید/)).toBeNull();

    // Text content should be gracefully rendered
    expect(screen.getAllByText("Pharmacokinetics of Penicillin").length).toBeGreaterThan(0);
  });

  it("PresentationPreviewModal renders with isFullscreen in modal stage", async () => {
    vi.mocked(presentationApi.getPdfStatus).mockResolvedValue({
      project_id: "project-123",
      status: "ready",
      pdf_url: "/v1/presentation/projects/project-123/slides-pdf",
    });

    renderWithClient(
      <PresentationPreviewModal
        slides={[mockSlide]}
        initialSlideIndex={2}
        isOpen={true}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      const viewer = screen.getByTestId("mock-pdf-slide-viewer");
      expect(viewer).toBeDefined();
      expect(viewer.getAttribute("data-fullscreen")).toBe("true");
    });
  });
});
