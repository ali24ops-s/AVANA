import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PresentationListPage } from "../pages/presentation/PresentationListPage.js";
import { PresentationWorkspacePage } from "../pages/presentation/PresentationWorkspacePage.js";
import { SlideRenderer } from "../components/presentation/SlideRenderer.js";
import { SlideNavigator } from "../components/presentation/SlideNavigator.js";
import { SlideInspector } from "../components/presentation/SlideInspector.js";
import { SlideSpeechCard } from "../components/presentation/SlideSpeechCard.js";
import { CreatePresentationModal } from "../components/presentation/CreatePresentationModal.js";
import { PresentationPreviewModal } from "../components/presentation/PresentationPreviewModal.js";
import type {
  PresentationProjectResource,
  PresentationSlideResource,
} from "@avana/contracts";
import type { SlideLayoutAssembly } from "@avana/domain";

// Mock the API client
vi.mock("../lib/api/presentation.js", () => ({
  presentationApi: {
    listProjects: vi.fn(),
    getProject: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    importPptx: vi.fn(),
    createSlide: vi.fn(),
    updateSlide: vi.fn(),
    generateSlide: vi.fn(),
    listReferences: vi.fn(),
    createReference: vi.fn(),
    updateReference: vi.fn(),
    deleteReference: vi.fn(),
    generateAllSlides: vi.fn(),
    getGenerationStatus: vi.fn(),
    getBatchCostPreview: vi.fn().mockResolvedValue({
      project_id: "proj-101",
      total_slides: 2,
      unprocessed_slides: 2,
      already_processed_slides: 0,
      unpaid_slides: 0,
      previously_paid_slides: 0,
      cost_per_slide_toman: 0,
      total_cost_toman: 0,
      wallet_balance_toman: 50000,
      has_sufficient_balance: true,
      is_all_free: true,
    }),
    getPdfStatus: vi.fn().mockResolvedValue({ status: "unavailable" }),
    getPdfUrl: vi.fn().mockReturnValue("/v1/presentation/projects/test-proj/slides-pdf"),
  },
}));

import { presentationApi } from "../lib/api/presentation.js";

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

const renderWithProviders = (
  ui: React.ReactElement,
  { queryClient = createTestQueryClient(), initialEntries = ["/"] } = {},
) => {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
};

const mockProject: PresentationProjectResource = {
  id: "proj-101",
  organization_id: "org-1",
  owner_user_id: "user-1",
  title: "درمان‌های نوین در نارسایی قلبی",
  pptx_document_id: null,
  target_duration_minutes: 15,
  academic_level: "advanced",
  tone: "formal_scientific",
  elaboration_depth: "balanced",
  status: "completed",
  current_stage: null,
  total_slides: 2,
  overall_introduction: null,
  overall_conclusion: null,
  total_estimated_seconds: 900,
  created_at: "2026-11-16T10:00:00Z",
  updated_at: "2026-11-16T12:00:00Z",
};

const mockLayoutAssembly: SlideLayoutAssembly = {
  slideId: "slide-1" as any,
  projectId: "proj-101" as any,
  slideIndex: 1,
  layoutType: "bullet_list",
  direction: "rtl",
  density: "normal",
  header: {
    title: "مهارکننده‌های SGLT2 در نارسایی قلبی",
    subtitle: "شواهد بالینی در کاهش بستری و مرگ‌ومیر",
    slideNumber: 1,
    totalSlides: 2,
  },
  body: {
    layoutType: "bullet_list",
    direction: "rtl",
    density: "normal",
    blocks: [
      {
        sourceIndex: 0,
        sourceType: "bullet_list",
        kind: "bullet_list",
        rawContent: "کاهش ۳۸ درصدی مورتالیتی قلبی عروقی",
        items: [
          "کاهش ۳۸ درصدی مورتالیتی قلبی عروقی",
          "کاهش فشار پرشدگی بطن چپ",
          "بهبود عملکرد کلیوی",
        ],
        layoutDensity: "normal",
        claims: [
          {
            text: "کاهش ۳۸ درصدی مورتالیتی",
            chunkIds: ["chunk-1"],
            evidenceStatus: "supported",
            citationLabels: ["[۱]"],
          },
        ],
      },
    ],
  },
  footer: {
    speakerNotes: "روی کارآزمایی DAPA-HF تأکید شود.",
    hasNotes: true,
    citations: [
      {
        chunkId: "chunk-1",
        citationLabel: "[۱]",
        sourceTitle: "DAPA-HF Trial Investigators, NEJM 2019",
        sourceType: "doi",
        rank: 1,
      },
    ],
  },
  metadata: {
    totalClaims: 1,
    supportedClaimsCount: 1,
    insufficientEvidenceCount: 0,
    totalCitations: 1,
    assembledAt: "2026-11-16T12:00:00Z",
    assemblerVersion: "1.0.0",
  },
};

const mockSlides: PresentationSlideResource[] = [
  {
    id: "slide-1",
    project_id: "proj-101",
    slide_index: 1,
    title: "مهارکننده‌های SGLT2 در نارسایی قلبی",
    raw_text: "کاهش مورتالیتی و بستری بیماران نارسایی قلبی",
    extracted_tables: [],
    speaker_notes: "روی کارآزمایی DAPA-HF تأکید شود.",
    has_visuals: false,
    visual_summary: null,
    media_storage_keys: [],
    extraction_metadata: {
      generationStatus: "accepted",
      model: "gemini-3.5-flash-lite",
      layoutAssembly: mockLayoutAssembly,
      claims: [
        {
          text: "کاهش ۳۸ درصدی مورتالیتی",
          chunkIds: ["chunk-1"],
          evidenceStatus: "supported",
        },
      ],
      citations: mockLayoutAssembly.footer.citations,
    },
    created_at: "2026-11-16T10:00:00Z",
    updated_at: "2026-11-16T12:00:00Z",
  },
  {
    id: "slide-2",
    project_id: "proj-101",
    slide_index: 2,
    title: "اندیکاسیون‌ها و کنترااندیکاسیون‌ها",
    raw_text: "بررسی موارد مصرف و تداخلات دارویی در نارسایی قلبی پیشرفته",
    extracted_tables: [],
    speaker_notes: null,
    has_visuals: false,
    visual_summary: null,
    media_storage_keys: [],
    extraction_metadata: {
      generationStatus: "draft",
    },
    created_at: "2026-11-16T10:05:00Z",
    updated_at: "2026-11-16T10:05:00Z",
  },
];

describe("Presentation Assistant Frontend Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("PresentationListPage", () => {
    it("renders page header and project card with correct title and attributes", async () => {
      vi.mocked(presentationApi.listProjects).mockResolvedValue({
        items: [mockProject],
        total: 1,
      });

      renderWithProviders(<PresentationListPage />);

      expect(screen.getByText("دستیار ارائه")).toBeInTheDocument();
      expect(
        screen.getByText("ارائه‌های علمی و آموزشی خود را با کمک هوش مصنوعی بسازید."),
      ).toBeInTheDocument();

      await waitFor(() => {
        expect(
          screen.getByText("درمان‌های نوین در نارسایی قلبی"),
        ).toBeInTheDocument();
      });

      expect(screen.getByText("آماده")).toBeInTheDocument();
      expect(screen.getByText(/۱۵ دقیقه/)).toBeInTheDocument();
      expect(screen.getByText(/پیشرفته و بالینی/)).toBeInTheDocument();
    });

    it("renders empty state when no presentation projects exist", async () => {
      vi.mocked(presentationApi.listProjects).mockResolvedValue({
        items: [],
        total: 0,
      });

      renderWithProviders(<PresentationListPage />);

      await waitFor(() => {
        expect(screen.getByText("هنوز ارائه‌ای نساخته‌اید")).toBeInTheDocument();
      });
      expect(screen.getByText("ساخت اولین ارائه")).toBeInTheDocument();
    });
  });

  describe("CreatePresentationModal", () => {
    it("validates empty title and submits with valid payload", async () => {
      vi.mocked(presentationApi.createProject).mockResolvedValue({
        project: mockProject,
        slides: [],
        references: [],
      });

      const handleClose = vi.fn();
      renderWithProviders(
        <CreatePresentationModal isOpen={true} onClose={handleClose} />,
      );

      expect(
        screen.getByText("ساخت ارائه جدید با دستیار هوشمند"),
      ).toBeInTheDocument();

      // Switch to manual mode: شروع با ارائه خالی
      const manualModeBtn = screen.getByRole("button", { name: /شروع با ارائه خالی/i });
      fireEvent.click(manualModeBtn);

      const submitButton = screen.getByRole("button", {
        name: /ایجاد ارائه و ورود به فضای کار/i,
      });

      // Submit with empty title
      fireEvent.click(submitButton);

      // Fill title
      const titleInput = screen.getByPlaceholderText(
        /مثال: رویکردهای تشخیصی در ایسکمی حاد میوکارد/i,
      );
      fireEvent.change(titleInput, {
        target: { value: "آناتومی عروق کرونر" },
      });

      // Click 15 minutes duration button
      const duration15Btn = screen.getByText("۱۵ دقیقه");
      fireEvent.click(duration15Btn);

      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(presentationApi.createProject).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "آناتومی عروق کرونر",
            target_duration_minutes: 15,
          }),
        );
      });
    });

    it("handles PPTX file upload and validates 50MB limit and .pptx extension", async () => {
      vi.mocked(presentationApi.importPptx).mockResolvedValue({
        project: mockProject,
        slides: mockSlides,
      });

      const handleClose = vi.fn();
      renderWithProviders(
        <CreatePresentationModal isOpen={true} onClose={handleClose} />,
      );

      // Verify drag & drop text
      expect(
        screen.getByText(/فایل پاورپوینت خود را به اینجا بکشید یا کلیک کنید/i),
      ).toBeInTheDocument();

      // Test invalid file extension (.pdf)
      const invalidFile = new File(["dummy pdf"], "sample.pdf", { type: "application/pdf" });
      const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;

      fireEvent.change(fileInput, { target: { files: [invalidFile] } });
      expect(
        screen.getByText(/فرمت فایل انتخاب‌شده معتبر نیست/i),
      ).toBeInTheDocument();

      // Test file larger than 50MB
      const largeContent = new Uint8Array(51 * 1024 * 1024);
      const largeFile = new File([largeContent], "huge.pptx", {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
      fireEvent.change(fileInput, { target: { files: [largeFile] } });
      expect(
        screen.getByText(/بیش از سقف مجاز ۵۰ مگابایت است/i),
      ).toBeInTheDocument();

      // Test valid PPTX file
      const validFile = new File(["valid pptx content"], "cardiology-lecture.pptx", {
        type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      });
      fireEvent.change(fileInput, { target: { files: [validFile] } });

      // Title auto-filled from filename
      expect(screen.getByDisplayValue("cardiology-lecture")).toBeInTheDocument();

      const uploadSubmitBtn = screen.getByRole("button", {
        name: /استخراج اسلایدها و ورود به فضای کار/i,
      });
      fireEvent.click(uploadSubmitBtn);

      await waitFor(() => {
        expect(presentationApi.importPptx).toHaveBeenCalledWith(
          validFile,
          expect.objectContaining({
            title: "cardiology-lecture",
          }),
        );
      });
    });
  });

  describe("SlideRenderer", () => {
    it("renders structured layout assembly with header, bullets, citations, and model attribution", () => {
      renderWithProviders(
        <SlideRenderer slide={mockSlides[0]} totalSlides={2} />,
      );

      // Header title and subtitle
      expect(
        screen.getByText("مهارکننده‌های SGLT2 در نارسایی قلبی"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("شواهد بالینی در کاهش بستری و مرگ‌ومیر"),
      ).toBeInTheDocument();

      // Bullets
      expect(
        screen.getByText("کاهش ۳۸ درصدی مورتالیتی قلبی عروقی"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("کاهش فشار پرشدگی بطن چپ"),
      ).toBeInTheDocument();

      // Citations
      expect(screen.getByText("DAPA-HF Trial Investigators, NEJM 2019")).toBeInTheDocument();
      expect(screen.getByText("Gemini 3.5 Flash-Lite")).toBeInTheDocument();
    });

    it("renders draft slide placeholder when no layout assembly is present", () => {
      renderWithProviders(
        <SlideRenderer slide={mockSlides[1]} totalSlides={2} />,
      );

      expect(
        screen.getByText("اندیکاسیون‌ها و کنترااندیکاسیون‌ها"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          "بررسی موارد مصرف و تداخلات دارویی در نارسایی قلبی پیشرفته",
        ),
      ).toBeInTheDocument();
    });

    it("renders faithful original PPTX slide with original title, textBlocks, tables, visuals, and speaker notes", () => {
      const pptxSlide: PresentationSlideResource = {
        id: "slide-pptx",
        project_id: "proj-101",
        slide_index: 3,
        title: "بررسی پاتوفیزیولوژی سیستم رنین-آنژیوتانسین",
        raw_text: "مسیر RAAS و مهار آن",
        extracted_tables: [
          {
            tableIndex: 0,
            rowCount: 2,
            colCount: 2,
            headers: ["گیرنده", "اثر بالینی"],
            rows: [["AT1", "انقباض عروقی و احتباس سدیم"]],
          },
        ],
        speaker_notes: "یادداشت اختصاصی مدرس: به اثرات مهار متقابل آلدوسترون اشاره شود.",
        has_visuals: true,
        visual_summary: "نمودار آبشاری مسیر سنتز آنژیوتانسین",
        media_storage_keys: ["image-1.png"],
        extraction_metadata: {
          importedFromPptx: true,
          textBlocks: [
            { text: "مقدمه بر مسیر هورمونی", type: "header", level: 2 },
            { text: "فعال‌سازی توسط افت پرفیوژن کلیوی", type: "bullet", level: 1 },
            { text: "توضیح تفصیلی مکانیسم بازخوردی منفی", type: "paragraph", level: 0 },
          ],
        },
        created_at: "2026-11-16T10:00:00Z",
        updated_at: "2026-11-16T12:00:00Z",
      };

      renderWithProviders(<SlideRenderer slide={pptxSlide} totalSlides={5} />);

      // Verify exact original title
      expect(screen.getByText("بررسی پاتوفیزیولوژی سیستم رنین-آنژیوتانسین")).toBeInTheDocument();

      // Verify original text blocks (header, bullet, paragraph)
      expect(screen.getByText("مقدمه بر مسیر هورمونی")).toBeInTheDocument();
      expect(screen.getByText("فعال‌سازی توسط افت پرفیوژن کلیوی")).toBeInTheDocument();
      expect(screen.getByText("توضیح تفصیلی مکانیسم بازخوردی منفی")).toBeInTheDocument();

      // Verify extracted table
      expect(screen.getByText("گیرنده")).toBeInTheDocument();
      expect(screen.getByText("اثر بالینی")).toBeInTheDocument();
      expect(screen.getByText("AT1")).toBeInTheDocument();
      expect(screen.getByText("انقباض عروقی و احتباس سدیم")).toBeInTheDocument();

      // Verify visual content indicator
      expect(screen.getByText("نمودار آبشاری مسیر سنتز آنژیوتانسین")).toBeInTheDocument();

      // Verify original speaker notes preserved in footer
      expect(screen.getByText(/یادداشت سخنران در پاورپوینت:/)).toBeInTheDocument();
      expect(screen.getByText(/به اثرات مهار متقابل آلدوسترون اشاره شود/)).toBeInTheDocument();
    });

    it("renders direct original slide image when slideImageUrl is provided", () => {
      const imageSlide: PresentationSlideResource = {
        id: "slide-img",
        project_id: "proj-101",
        slide_index: 4,
        title: "اسلاید تصویری دیاگرام اکوکاردیوگرافی",
        raw_text: "",
        extracted_tables: [],
        speaker_notes: null,
        has_visuals: true,
        visual_summary: null,
        media_storage_keys: [],
        extraction_metadata: {
          importedFromPptx: true,
          slideImageUrl: "https://storage.avana.test/slides/slide-4.png",
        },
        created_at: "2026-11-16T10:00:00Z",
        updated_at: "2026-11-16T12:00:00Z",
      };

      renderWithProviders(<SlideRenderer slide={imageSlide} totalSlides={5} />);

      const img = screen.getByRole("img", { name: "اسلاید تصویری دیاگرام اکوکاردیوگرافی" });
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute("src", "https://storage.avana.test/slides/slide-4.png");
    });
  });

  describe("SlideNavigator", () => {
    it("renders slide items cleanly without raw text or badges, and handles generate all click", () => {
      const handleSelect = vi.fn();
      const handleGenerateAll = vi.fn();

      renderWithProviders(
        <SlideNavigator
          slides={mockSlides}
          selectedSlideId="slide-1"
          onSelectSlide={handleSelect}
          onGenerateAll={handleGenerateAll}
        />,
      );

      expect(screen.getByText("فهرست اسلایدها")).toBeInTheDocument();
      expect(screen.getByText("۲ اسلاید")).toBeInTheDocument();

      // Check slides are rendered
      expect(screen.getByText("مهارکننده‌های SGLT2 در نارسایی قلبی")).toBeInTheDocument();
      expect(screen.getByText("اندیکاسیون‌ها و کنترااندیکاسیون‌ها")).toBeInTheDocument();

      // Ensure no raw text preview and no status badges exist
      expect(screen.queryByText(/بدون متن اولیه/i)).not.toBeInTheDocument();
      expect(screen.queryByText("متن سخنرانی")).not.toBeInTheDocument();
      expect(screen.queryByText("در انتظار تولید")).not.toBeInTheDocument();

      // Ensure "افزودن اسلاید جدید" button is completely removed
      expect(screen.queryByRole("button", { name: /افزودن اسلاید جدید/i })).not.toBeInTheDocument();

      // Check batch generate button
      const generateBtn = screen.getByRole("button", {
        name: /تولید متن تمام اسلایدها/i,
      });
      fireEvent.click(generateBtn);

      expect(handleGenerateAll).toHaveBeenCalledTimes(1);
    });
  });

  describe("SlideInspector", () => {
    it("has exactly 3 tabs (content, ai, citations) and no speech tab", () => {
      renderWithProviders(
        <SlideInspector projectId="proj-101" slide={mockSlides[0]} />,
      );

      // Verify no speech tab exists
      expect(screen.queryByRole("button", { name: /متن سخنرانی/i })).not.toBeInTheDocument();

      // Verify 3 tabs exist
      expect(screen.getByRole("button", { name: /محتوا و ویرایش/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /تنظیمات AI/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /استنادها/i })).toBeInTheDocument();
    });

    it("displays slide editable fields and saves changes without speaker notes in content tab", async () => {
      vi.mocked(presentationApi.updateSlide).mockResolvedValue({
        slide: {
          ...mockSlides[0],
          title: "عنوان جدید اسلاید",
        },
      });

      renderWithProviders(
        <SlideInspector projectId="proj-101" slide={mockSlides[0]} />,
      );

      expect(screen.getByText("تنظیمات و بازرسی اسلاید")).toBeInTheDocument();

      // Content tab is active by default
      const titleInput = screen.getByDisplayValue(
        "مهارکننده‌های SGLT2 در نارسایی قلبی",
      );
      fireEvent.change(titleInput, { target: { value: "عنوان ویرایش‌شده" } });

      // Speaker Notes textarea should NOT be in the content tab
      expect(
        screen.queryByText("یادداشت‌های سخنران (Speaker Notes)"),
      ).not.toBeInTheDocument();

      const saveBtn = screen.getByRole("button", { name: /ذخیره تغییرات/i });
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(presentationApi.updateSlide).toHaveBeenCalledWith(
          "proj-101",
          "slide-1",
          expect.objectContaining({
            title: "عنوان ویرایش‌شده",
            speaker_notes: mockSlides[0].speaker_notes,
          }),
        );
      });
    });

    it("displays AI generation tab without technical metadata (active model / run ID) or AVANA engine box", async () => {
      renderWithProviders(
        <SlideInspector projectId="proj-101" slide={mockSlides[0]} />,
      );

      const aiTabBtn = screen.getByRole("button", { name: /تنظیمات AI/i });
      fireEvent.click(aiTabBtn);

      // Banner box should be removed
      expect(screen.queryByText("موتور تولید استنادی AVANA")).not.toBeInTheDocument();

      // Technical metadata should NOT be displayed
      expect(screen.queryByText(/مدل فعال:/)).not.toBeInTheDocument();
      expect(screen.queryByText(/شناسه اجرا/)).not.toBeInTheDocument();

      expect(
        screen.getByRole("button", { name: /شروع تولید هوشمند این اسلاید/i }),
      ).toBeInTheDocument();
    });

    it("displays citations tab with 3-tier validation indicators", async () => {
      const slideWithClaims: PresentationSlideResource = {
        ...mockSlides[0],
        extraction_metadata: {
          claims: [
            {
              text: "وارفارین فاکتورهای وابسته به ویتامین K را مهار می‌کند.",
              chunkIds: ["chk:warfarin:001"],
              evidenceStatus: "supported",
            },
            {
              text: "شواهد ناکافی برای مصرف در بارداری",
              chunkIds: [],
              evidenceStatus: "insufficient_evidence",
            },
          ],
        },
      };

      renderWithProviders(
        <SlideInspector projectId="proj-101" slide={slideWithClaims} />,
      );

      const citationsTabBtn = screen.getByRole("button", { name: /استنادها/i });
      fireEvent.click(citationsTabBtn);

      expect(screen.getByText("وارفارین فاکتورهای وابسته به ویتامین K را مهار می‌کند.")).toBeInTheDocument();
      expect(screen.getByText("شواهد ناکافی برای مصرف در بارداری")).toBeInTheDocument();
      expect(screen.getAllByText(/۱\. وجود فیزیکی منبع/).length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText(/۲\. صحت متادیتا و DOI/).length).toBeGreaterThanOrEqual(2);
      expect(screen.getAllByText(/۳\. ارزیابی پشتیبانی ادعا/).length).toBe(2);
    });
  });

  describe("SlideSpeechCard", () => {
    const slideWithSpeech: PresentationSlideResource = {
      ...mockSlides[0],
      speaker_notes: null,
      extraction_metadata: {
        ...mockSlides[0].extraction_metadata,
        claims: [
          {
            text: "مهارکننده‌های SGLT2 خطر بستری را کاهش می‌دهند.",
            chunkIds: ["chk:sglt2:001"],
            evidenceStatus: "supported",
          },
        ],
      },
      speech_content: {
        speechText: "همکاران گرامی، در این اسلاید به بررسی مهارکننده‌های SGLT2 می‌پردازیم.\n\nاین دارو نقشی کلیدی در مهار بازجذب گلوکز دارد.",
        supplementaryExplanation: "این دسته دارویی با مهار بازجذب گلوکز در توبول پروگزیمال عمل می‌کند.",
        keyPoints: ["کاهش مورتالیتی قلبی", "بهبود کیفیت زندگی بیماران"],
        clinicalExample: {
          scenario: "بیمار ۶۲ ساله با نارسایی قلبی با کسر تخلیه‌ای کاهش‌یافته",
          clinicalPearl: "تجویز امپاگلیفلوزین حتی در بیماران غیردیابتی نیز اندیکاسیون دارد.",
        },
        transitionSentence: "اکنون به بررسی دقیق‌تر دوزاژ دارویی در اسلاید بعد می‌پردازیم.",
        suggestedDurationSeconds: 75,
        citations: [],
        claims: [
          {
            text: "مهارکننده‌های SGLT2 خطر بستری را کاهش می‌دهند.",
            chunkIds: ["chk:sglt2:001"],
            evidenceStatus: "supported",
          },
        ],
      },
    };

    it("displays oral presentation speech content with paragraphs and independent accordions", async () => {
      renderWithProviders(
        <SlideSpeechCard
          projectId="proj-101"
          slide={slideWithSpeech}
          onGenerate={vi.fn()}
          isGenerating={false}
        />,
      );

      // Verify title
      expect(screen.getByText("متن پیشنهادی برای ارائه شفاهی")).toBeInTheDocument();

      // Displays speechText in distinct paragraphs
      expect(
        screen.getByText("همکاران گرامی، در این اسلاید به بررسی مهارکننده‌های SGLT2 می‌پردازیم."),
      ).toBeInTheDocument();
      expect(
        screen.getByText("این دارو نقشی کلیدی در مهار بازجذب گلوکز دارد."),
      ).toBeInTheDocument();

      // Verify accordions exist and are closed by default (citations accordion removed to SlideInspector)
      const keyPointsAccordion = screen.getByRole("button", { name: /نکات کلیدی برای ارائه/i });
      const clinicalAccordion = screen.getByRole("button", { name: /سناریوی آموزشی و کاربردی/i });
      const transitionAccordion = screen.getByRole("button", { name: /جمله انتقال به اسلاید بعدی/i });
      const citationsAccordion = screen.queryByRole("button", { name: /استنادهای علمی و ادعاها/i });

      expect(keyPointsAccordion).toHaveAttribute("aria-expanded", "false");
      expect(clinicalAccordion).toHaveAttribute("aria-expanded", "false");
      expect(transitionAccordion).toHaveAttribute("aria-expanded", "false");
      expect(citationsAccordion).not.toBeInTheDocument();

      // Click to open key points accordion
      fireEvent.click(keyPointsAccordion);
      expect(keyPointsAccordion).toHaveAttribute("aria-expanded", "true");
      expect(screen.getByText("کاهش مورتالیتی قلبی")).toBeInTheDocument();
    });

    it("enables inline speech text editing and saving", async () => {
      sessionStorage.clear();
      vi.mocked(presentationApi.updateSlide).mockResolvedValue({
        slide: {
          ...slideWithSpeech,
          speaker_notes: "متن سخنرانی ویرایش‌شده من",
        },
      });

      renderWithProviders(
        <SlideSpeechCard
          projectId="proj-101"
          slide={slideWithSpeech}
          onGenerate={vi.fn()}
          isGenerating={false}
        />,
      );

      // Click edit button
      const editBtn = screen.getByRole("button", { name: /ویرایش متن/i });
      fireEvent.click(editBtn);

      const textarea = screen.getByPlaceholderText(/متن سخنرانی اسلاید را اینجا ویرایش فرمایید/i);
      fireEvent.change(textarea, { target: { value: "متن سخنرانی ویرایش‌شده من" } });

      expect(screen.getByText("تغییرات ذخیره‌نشده")).toBeInTheDocument();

      // Check draft persisted in sessionStorage
      const draftRaw = sessionStorage.getItem("avana_speech_draft_proj-101_slide-1");
      expect(draftRaw).toBeTruthy();
      expect(JSON.parse(draftRaw!).text).toBe("متن سخنرانی ویرایش‌شده من");

      // Click save button
      const saveBtn = screen.getAllByRole("button", { name: /ذخیره تغییرات/i })[0];
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(presentationApi.updateSlide).toHaveBeenCalledWith(
          "proj-101",
          "slide-1",
          expect.objectContaining({
            speaker_notes: "متن سخنرانی ویرایش‌شده من",
          }),
        );
      });

      // After save, draft should be removed from sessionStorage
      expect(sessionStorage.getItem("avana_speech_draft_proj-101_slide-1")).toBeNull();
    });

    it("displays direct retry button upon save error and allows retrying", async () => {
      sessionStorage.clear();
      vi.mocked(presentationApi.updateSlide).mockRejectedValueOnce(
        new Error("Network timeout"),
      ).mockResolvedValueOnce({
        slide: {
          ...slideWithSpeech,
          speaker_notes: "متن مجددا ذخیره شده",
        },
      });

      renderWithProviders(
        <SlideSpeechCard
          projectId="proj-101"
          slide={slideWithSpeech}
          onGenerate={vi.fn()}
          isGenerating={false}
        />,
      );

      const editBtn = screen.getByRole("button", { name: /ویرایش متن/i });
      fireEvent.click(editBtn);

      const textarea = screen.getByPlaceholderText(/متن سخنرانی اسلاید را اینجا ویرایش فرمایید/i);
      fireEvent.change(textarea, { target: { value: "متن مجددا ذخیره شده" } });

      const saveBtn = screen.getAllByRole("button", { name: /ذخیره تغییرات/i })[0];
      fireEvent.click(saveBtn);

      await waitFor(() => {
        expect(screen.getByText(/خطا در ذخیره متن سخنرانی/i)).toBeInTheDocument();
      });

      // Retry button exists inside error alert
      const retryBtn = screen.getByRole("button", { name: /تلاش مجدد/i });
      expect(retryBtn).toBeInTheDocument();

      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(presentationApi.updateSlide).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe("PresentationPreviewModal", () => {
    it("renders fullscreen preview with 16:9 slide and closes on escape", () => {
      const handleClose = vi.fn();
      renderWithProviders(
        <PresentationPreviewModal
          slides={mockSlides}
          initialSlideIndex={1}
          isOpen={true}
          onClose={handleClose}
        />,
      );

      expect(screen.getByRole("dialog", { name: /پیش‌نمایش تمام‌صفحه ارائه/i })).toBeInTheDocument();
      expect(screen.getByText(/اسلاید ۱ از ۲/)).toBeInTheDocument();

      // Trigger Escape key
      fireEvent.keyDown(document, { key: "Escape" });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("PresentationWorkspacePage", () => {
    it("renders full workspace with project title and slides", async () => {
      vi.mocked(presentationApi.getProject).mockResolvedValue({
        project: mockProject,
        slides: mockSlides,
        references: [],
      });
      vi.mocked(presentationApi.listReferences).mockResolvedValue({
        items: [],
        total: 0,
      });

      renderWithProviders(
        <Routes>
          <Route
            path="/presentations/:projectId"
            element={<PresentationWorkspacePage />}
          />
        </Routes>,
        {
          initialEntries: ["/presentations/proj-101"],
        },
      );

      await waitFor(() => {
        expect(
          screen.getByText("درمان‌های نوین در نارسایی قلبی"),
        ).toBeInTheDocument();
      });

      expect(screen.getByText("فهرست اسلایدها")).toBeInTheDocument();
      expect(screen.getByText("منابع علمی")).toBeInTheDocument();
    });

    it("renders error state when project is not found", async () => {
      vi.mocked(presentationApi.getProject).mockRejectedValue(
        new Error("Presentation project not found"),
      );

      renderWithProviders(
        <Routes>
          <Route
            path="/presentations/:projectId"
            element={<PresentationWorkspacePage />}
          />
        </Routes>,
        {
          initialEntries: ["/presentations/unknown-project"],
        },
      );

      await waitFor(() => {
        expect(
          screen.getByText("پروژه ارائه یافت نشد یا دسترسی غیرمجاز است"),
        ).toBeInTheDocument();
      });
    });

    it("renders prominent batch generation banner and triggers batch generation on click", async () => {
      vi.mocked(presentationApi.getProject).mockResolvedValue({
        project: mockProject,
        slides: mockSlides,
        references: [],
      });
      vi.mocked(presentationApi.listReferences).mockResolvedValue({
        items: [],
        total: 0,
      });
      vi.mocked(presentationApi.getGenerationStatus).mockResolvedValue({
        project_id: "proj-101",
        status: "idle",
        is_generating: false,
        total_slides: 2,
        completed_slides: 0,
        failed_slides: 0,
        pending_slides: 2,
        current_slide_index: null,
        slides_progress: [],
        last_updated_at: new Date().toISOString(),
      });
      vi.mocked(presentationApi.generateAllSlides).mockResolvedValue({
        project_id: "proj-101",
        message: "batch generation started",
        status: {
          project_id: "proj-101",
          status: "generating",
          is_generating: true,
          total_slides: 2,
          completed_slides: 0,
          failed_slides: 0,
          pending_slides: 2,
          current_slide_index: 1,
          slides_progress: [],
          last_updated_at: new Date().toISOString(),
        },
      });

      renderWithProviders(
        <Routes>
          <Route
            path="/presentations/:projectId"
            element={<PresentationWorkspacePage />}
          />
        </Routes>,
        {
          initialEntries: ["/presentations/proj-101"],
        },
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", {
            name: /تولید متن تمام اسلایدها/i,
          }),
        ).toBeInTheDocument();
      });

      // Verify old hero banner is completely removed
      expect(
        screen.queryByRole("heading", {
          name: "تولید متن ارائه برای تمام اسلایدها",
        }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText("با استفاده از محتوای اسلایدها و منابع علمی، متن گفتاری کامل و پیوسته ارائه را تولید کن."),
      ).not.toBeInTheDocument();

      const generateAllBtn = screen.getByRole("button", {
        name: /تولید متن تمام اسلایدها/i,
      });
      fireEvent.click(generateAllBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/تولید گروهی متن ارائه با هوش مصنوعی/i),
        ).toBeInTheDocument();
      });

      const checkbox = screen.getByLabelText(/فقط اسلایدهای بدون متن/i);
      fireEvent.click(checkbox);

      const confirmBtn = await screen.findByRole("button", {
        name: /تأیید و شروع تولید رایگان/i,
      });
      await waitFor(() => {
        expect(confirmBtn).toBeEnabled();
      });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(presentationApi.generateAllSlides).toHaveBeenCalledWith(
          "proj-101",
          { only_unprocessed: false },
        );
      });
    });

    it("displays active batch progress banner when generation is in progress", async () => {
      vi.mocked(presentationApi.getProject).mockResolvedValue({
        project: { ...mockProject, current_stage: "generating_all_slides" },
        slides: mockSlides,
        references: [],
      });
      vi.mocked(presentationApi.listReferences).mockResolvedValue({
        items: [],
        total: 0,
      });
      vi.mocked(presentationApi.getGenerationStatus).mockResolvedValue({
        project_id: "proj-101",
        status: "generating",
        is_generating: true,
        total_slides: 2,
        completed_slides: 1,
        failed_slides: 0,
        pending_slides: 0,
        current_slide_index: 2,
        slides_progress: [
          { slide_id: "slide-1", slide_index: 1, title: "اسلاید ۱", status: "completed" },
          { slide_id: "slide-2", slide_index: 2, title: "اسلاید ۲", status: "generating" },
        ],
        last_updated_at: new Date().toISOString(),
      });

      renderWithProviders(
        <Routes>
          <Route
            path="/presentations/:projectId"
            element={<PresentationWorkspacePage />}
          />
        </Routes>,
        {
          initialEntries: ["/presentations/proj-101"],
        },
      );

      await waitFor(() => {
        expect(
          screen.getByText("در حال آماده‌سازی متن ارائه شما…"),
        ).toBeInTheDocument();
      });

      expect(
        screen.getByText(/۱ اسلاید از ۲ اسلاید آماده شده است/),
      ).toBeInTheDocument();
      expect(screen.getByText(/اسلاید ۲/)).toBeInTheDocument();
    });

    it("displays failed slides retry alert and triggers generation with only_unprocessed: true", async () => {
      vi.mocked(presentationApi.getProject).mockResolvedValue({
        project: mockProject,
        slides: mockSlides,
        references: [],
      });
      vi.mocked(presentationApi.listReferences).mockResolvedValue({
        items: [],
        total: 0,
      });
      vi.mocked(presentationApi.getGenerationStatus).mockResolvedValue({
        project_id: "proj-101",
        status: "failed",
        is_generating: false,
        total_slides: 2,
        completed_slides: 1,
        failed_slides: 1,
        pending_slides: 0,
        current_slide_index: null,
        slides_progress: [
          { slide_id: "slide-1", slide_index: 1, title: "اسلاید ۱", status: "completed" },
          { slide_id: "slide-2", slide_index: 2, title: "اسلاید ۲", status: "failed", error: "Network timeout" },
        ],
        last_updated_at: new Date().toISOString(),
      });
      vi.mocked(presentationApi.generateAllSlides).mockResolvedValue({
        project_id: "proj-101",
        message: "batch generation started",
        status: {
          project_id: "proj-101",
          status: "generating",
          is_generating: true,
          total_slides: 2,
          completed_slides: 1,
          failed_slides: 0,
          pending_slides: 1,
          current_slide_index: 2,
          slides_progress: [],
          last_updated_at: new Date().toISOString(),
        },
      });

      renderWithProviders(
        <Routes>
          <Route
            path="/presentations/:projectId"
            element={<PresentationWorkspacePage />}
          />
        </Routes>,
        {
          initialEntries: ["/presentations/proj-101"],
        },
      );

      await waitFor(() => {
        expect(
          screen.getByText(/۱ اسلاید نیاز به تلاش مجدد دارند/),
        ).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole("button", {
        name: /تلاش مجدد برای اسلایدهای ناموفق/i,
      });
      fireEvent.click(retryBtn);

      const confirmBtn = await screen.findByRole("button", {
        name: /تأیید و شروع تولید رایگان/i,
      });
      await waitFor(() => {
        expect(confirmBtn).toBeEnabled();
      });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(presentationApi.generateAllSlides).toHaveBeenCalledWith(
          "proj-101",
          { only_unprocessed: true },
        );
      });
    });

    it("renders slide canvas as sole primary workspace with oral presentation speech card and without script view or header preview", async () => {
      vi.mocked(presentationApi.getProject).mockResolvedValue({
        project: mockProject,
        slides: mockSlides,
        references: [],
      });
      vi.mocked(presentationApi.listReferences).mockResolvedValue({
        items: [],
        total: 0,
      });
      vi.mocked(presentationApi.getGenerationStatus).mockResolvedValue({
        project_id: "proj-101",
        status: "idle",
        is_generating: false,
        total_slides: 2,
        completed_slides: 1,
        failed_slides: 0,
        pending_slides: 1,
        current_slide_index: null,
        slides_progress: [],
        last_updated_at: new Date().toISOString(),
      });

      renderWithProviders(
        <Routes>
          <Route
            path="/presentations/:projectId"
            element={<PresentationWorkspacePage />}
          />
        </Routes>,
        {
          initialEntries: ["/presentations/proj-101"],
        },
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", {
            name: "درمان‌های نوین در نارسایی قلبی",
          }),
        ).toBeInTheDocument();
      });

      // Slide canvas is sole view: oral speech card is present
      expect(screen.getByText("متن پیشنهادی برای ارائه شفاهی")).toBeInTheDocument();

      // Continuous script view buttons are completely removed
      expect(screen.queryByRole("button", { name: /متن پیوسته ارائه/i })).not.toBeInTheDocument();

      // Preview button in top header is completely removed
      expect(screen.queryByRole("button", { name: /^پیش‌نمایش$/i })).not.toBeInTheDocument();
    });

    it("keeps SlideInspector closed by default, expands canvas, and toggles via header and X close button", async () => {
      vi.mocked(presentationApi.getProject).mockResolvedValue({
        project: mockProject,
        slides: mockSlides,
        references: [],
      });
      vi.mocked(presentationApi.listReferences).mockResolvedValue({
        items: [],
        total: 0,
      });
      vi.mocked(presentationApi.getGenerationStatus).mockResolvedValue({
        project_id: "proj-101",
        status: "idle",
        is_generating: false,
        total_slides: 2,
        completed_slides: 1,
        failed_slides: 0,
        pending_slides: 1,
        current_slide_index: null,
        slides_progress: [],
        last_updated_at: new Date().toISOString(),
      });

      renderWithProviders(
        <Routes>
          <Route
            path="/presentations/:projectId"
            element={<PresentationWorkspacePage />}
          />
        </Routes>,
        {
          initialEntries: ["/presentations/proj-101"],
        },
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", {
            name: "درمان‌های نوین در نارسایی قلبی",
          }),
        ).toBeInTheDocument();
      });

      // 1. Inspector toggle button exists in header and has aria-expanded="false"
      const inspectorToggleBtn = screen.getByRole("button", {
        name: /تنظیمات اسلاید/i,
      });
      expect(inspectorToggleBtn).toHaveAttribute("aria-expanded", "false");

      // 2. Click button to open SlideInspector
      fireEvent.click(inspectorToggleBtn);
      expect(inspectorToggleBtn).toHaveAttribute("aria-expanded", "true");

      // 3. Close button inside SlideInspector header closes it
      const closeInspectorBtn = screen.getByRole("button", {
        name: "بستن سایدبار تنظیمات",
      });
      expect(closeInspectorBtn).toBeInTheDocument();
      fireEvent.click(closeInspectorBtn);

      expect(inspectorToggleBtn).toHaveAttribute("aria-expanded", "false");
    });

    it("renders AvanaSelect in SlideInspector AI tab and PresentationReferencesDrawer file upload", async () => {
      vi.mocked(presentationApi.getProject).mockResolvedValue({
        project: mockProject,
        slides: mockSlides,
        references: [],
      });
      vi.mocked(presentationApi.listReferences).mockResolvedValue({
        items: [],
        total: 0,
      });
      vi.mocked(presentationApi.getGenerationStatus).mockResolvedValue({
        project_id: "proj-101",
        status: "idle",
        is_generating: false,
        total_slides: 2,
        completed_slides: 0,
        failed_slides: 0,
        pending_slides: 2,
        current_slide_index: null,
        slides_progress: [],
        last_updated_at: new Date().toISOString(),
      });

      renderWithProviders(
        <Routes>
          <Route
            path="/presentations/:projectId"
            element={<PresentationWorkspacePage />}
          />
        </Routes>,
        {
          initialEntries: ["/presentations/proj-101"],
        },
      );

      await waitFor(() => {
        expect(
          screen.getByRole("heading", {
            name: "درمان‌های نوین در نارسایی قلبی",
          }),
        ).toBeInTheDocument();
      });

      // Open References Drawer
      const refBtn = screen.getByRole("button", { name: /منابع علمی/i });
      fireEvent.click(refBtn);

      await waitFor(() => {
        expect(
          screen.getByText("مدیریت مراجع و منابع علمی ارائه"),
        ).toBeInTheDocument();
      });

      // Click Add Reference button
      const addRefBtn = screen.getByRole("button", { name: /افزودن منبع علمی جدید/i });
      fireEvent.click(addRefBtn);

      // Verify AvanaSelect combobox for reference type is present
      const typeSelect = screen.getByRole("combobox");
      expect(typeSelect).toBeInTheDocument();

      // Verify Drag & Drop area for PDF is present by default
      expect(
        screen.getByText(/فایل PDF خود را به اینجا بکشید یا برای انتخاب کلیک کنید/),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/حداکثر ۵۰ مگابایت/),
      ).toBeInTheDocument();
    });
  });
});
