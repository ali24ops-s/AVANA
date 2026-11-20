import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { PresentationPdfExportModal } from "../components/presentation/PresentationPdfExportModal.js";
import { presentationApi, createPresentationApiClient } from "../lib/api/presentation.js";
import * as exportUtils from "../components/presentation/presentation-pdf-export-utils.js";
import type { PresentationSlideResource } from "@avana/contracts";

describe("PresentationPdfExportModal Component", () => {
  const mockSlides: PresentationSlideResource[] = [
    {
      id: "slide-1",
      projectId: "proj-101",
      slideIndex: 1,
      title: "مکانیسم بتالاکتام‌ها",
      rawText: "اتصال به ترانس‌پپتیداز",
      slideType: "content",
      speakerNotes: "متن سخنرانی ذخیره‌شده",
      suggestedDurationSeconds: 120,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "slide-2",
      projectId: "proj-101",
      slideIndex: 2,
      title: "فارماکوکینتیک",
      rawText: "جذب و توزیع",
      slideType: "content",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders export modal with standard options and informs user when PDF is not ready", () => {
    const onClose = vi.fn();
    render(
      <PresentationPdfExportModal
        isOpen={true}
        onClose={onClose}
        projectId="proj-101"
        projectTitle="فارماکولوژی آنتی‌بیوتیک‌ها"
        slides={mockSlides}
        isPdfReady={false}
      />
    );

    // Modal title & subtitle
    expect(screen.getByText("تنظیمات خروجی PDF ارائه")).toBeInTheDocument();
    expect(screen.getByText(/فارماکولوژی آنتی‌بیوتیک‌ها/)).toBeInTheDocument();

    // Fallback notice
    expect(screen.getByText(/فایل تصویری مستقیم پاورپوینت در سرور در دسترس نیست/)).toBeInTheDocument();

    // Options rendered
    expect(screen.getByText("تصویر اسلایدها")).toBeInTheDocument();
    expect(screen.getByText("متن اصلی سخنرانی")).toBeInTheDocument();
    expect(screen.getByText("نکات کلیدی برای ارائه")).toBeInTheDocument();
    expect(screen.getByText("توضیحات تکمیلی")).toBeInTheDocument();
    expect(screen.getByText("مثال و سناریوی بالینی")).toBeInTheDocument();
    expect(screen.getByText("جمله انتقال به اسلاید بعدی")).toBeInTheDocument();
    expect(screen.getByText("مدت زمان تخمینی ارائه هر اسلاید")).toBeInTheDocument();

    // Mandatory option has lock notice
    expect(screen.getByText("(اجباری)")).toBeInTheDocument();

    // Action buttons
    expect(screen.getByText("انصراف")).toBeInTheDocument();
    expect(screen.getByText("دریافت فایل PDF")).toBeInTheDocument();
  });

  it("allows toggling optional sections and triggers exportPdf without image extraction when isPdfReady=false", async () => {
    const exportPdfSpy = vi.spyOn(presentationApi, "exportPdf").mockResolvedValue(undefined as any);
    const extractImagesSpy = vi.spyOn(exportUtils, "extractSlideImagesFromPdf");
    const onClose = vi.fn();

    render(
      <PresentationPdfExportModal
        isOpen={true}
        onClose={onClose}
        projectId="proj-101"
        projectTitle="فارماکولوژی آنتی‌بیوتیک‌ها"
        slides={mockSlides}
        isPdfReady={false}
      />
    );

    // Toggle off clinical example and transition sentence
    const clinicalCheckbox = screen.getByText("مثال و سناریوی بالینی");
    fireEvent.click(clinicalCheckbox);

    const transitionCheckbox = screen.getByText("جمله انتقال به اسلاید بعدی");
    fireEvent.click(transitionCheckbox);

    // Click export button
    const exportButton = screen.getByText("دریافت فایل PDF");
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(exportPdfSpy).toHaveBeenCalledTimes(1);
    });

    // Image extraction from PDF must NOT be called since isPdfReady is false
    expect(extractImagesSpy).not.toHaveBeenCalled();

    // Verify sent payload
    const [projectId, requestBody] = exportPdfSpy.mock.calls[0];
    expect(projectId).toBe("proj-101");
    expect(requestBody.options).toEqual({
      includeSlideImages: true,
      includeSpeechText: true,
      includeKeyPoints: true,
      includeSupplementary: true,
      includeClinicalExample: false,
      includeTransitionSentence: false,
      includeEstimatedDuration: true,
    });
    expect(requestBody.slideImages).toEqual({});

    expect(onClose).toHaveBeenCalled();
  });

  it("extracts images when isPdfReady=true and passes them with client sessionStorage drafts", async () => {
    // Put draft in sessionStorage
    sessionStorage.setItem(
      "avana_speech_draft_proj-101_slide-1",
      JSON.stringify({ text: "پیش‌نویس جدید برای اسلاید ۱" })
    );

    const mockExtractedImages = {
      1: "data:image/jpeg;base64,mockslide1",
      2: "data:image/jpeg;base64,mockslide2",
    };
    const extractImagesSpy = vi
      .spyOn(exportUtils, "extractSlideImagesFromPdf")
      .mockResolvedValue(mockExtractedImages);
    const exportPdfSpy = vi.spyOn(presentationApi, "exportPdf").mockResolvedValue(undefined as any);
    const onClose = vi.fn();

    render(
      <PresentationPdfExportModal
        isOpen={true}
        onClose={onClose}
        projectId="proj-101"
        projectTitle="فارماکولوژی آنتی‌بیوتیک‌ها"
        slides={mockSlides}
        isPdfReady={true}
        pdfUrl="https://storage.avana.ir/projects/proj-101/slides.pdf"
      />
    );

    // Click download
    const exportButton = screen.getByText("دریافت فایل PDF");
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(extractImagesSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          pdfUrl: "https://storage.avana.ir/projects/proj-101/slides.pdf",
          totalSlides: 2,
        })
      );
    });

    await waitFor(() => {
      expect(exportPdfSpy).toHaveBeenCalledTimes(1);
    });

    const [, requestBody] = exportPdfSpy.mock.calls[0];
    expect(requestBody.slideImages).toEqual(mockExtractedImages);
    expect(requestBody.draftNotesBySlideId).toEqual({
      "slide-1": "پیش‌نویس جدید برای اسلاید ۱",
    });

    expect(onClose).toHaveBeenCalled();
  });

  it("displays error message if PDF generation fails", async () => {
    vi.spyOn(presentationApi, "exportPdf").mockRejectedValue(
      new Error("خطای سرور در تولید پی‌دی‌اف")
    );

    render(
      <PresentationPdfExportModal
        isOpen={true}
        onClose={vi.fn()}
        projectId="proj-101"
        projectTitle="ارائه تستی"
        slides={mockSlides}
        isPdfReady={false}
      />
    );

    fireEvent.click(screen.getByText("دریافت فایل PDF"));

    await waitFor(() => {
      expect(screen.getByText("خطای سرور در تولید پی‌دی‌اف")).toBeInTheDocument();
    });
  });
});

describe("presentationApi.exportPdf client integration", () => {
  it("calls client.postBlob and downloads blob with server-provided filename", async () => {
    const mockBlob = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    const mockPostBlob = vi.fn().mockResolvedValue({
      blob: mockBlob,
      filename: "ارائه-فارماکولوژی.pdf",
      contentType: "application/pdf",
    });
    const mockClient = {
      get: vi.fn(),
      post: vi.fn(),
      postFormData: vi.fn(),
      put: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      postBlob: mockPostBlob,
      getBlob: vi.fn(),
    } as any;

    const api = createPresentationApiClient(mockClient);

    const mockAnchor = { href: "", download: "", click: vi.fn() };
    const createElementSpy = vi.spyOn(window.document, "createElement").mockReturnValue(mockAnchor as any);
    const appendChildSpy = vi.spyOn(window.document.body, "appendChild").mockImplementation(() => mockAnchor as any);
    const removeChildSpy = vi.spyOn(window.document.body, "removeChild").mockImplementation(() => mockAnchor as any);
    const createObjectURLMock = vi.fn().mockReturnValue("blob:mock-url");
    const revokeObjectURLMock = vi.fn();
    window.URL.createObjectURL = createObjectURLMock;
    window.URL.revokeObjectURL = revokeObjectURLMock;

    await api.exportPdf("proj-101", {
      options: { includeSpeechText: true },
      slideImages: {},
    });

    expect(mockPostBlob).toHaveBeenCalledWith(
      "/v1/presentation/projects/proj-101/export-pdf",
      {
        options: { includeSpeechText: true },
        slideImages: {},
      },
    );
    expect(createObjectURLMock).toHaveBeenCalledWith(mockBlob);
    expect(mockAnchor.download).toBe("ارائه-فارماکولوژی.pdf");
    expect(mockAnchor.click).toHaveBeenCalled();

    createElementSpy.mockRestore();
    appendChildSpy.mockRestore();
    removeChildSpy.mockRestore();
  });
});
