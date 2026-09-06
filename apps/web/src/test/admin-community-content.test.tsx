import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { AdminCommunityContentPage, type AdminContentPackListItem, type AdminContentPackDetailResponse } from "../pages/admin/AdminCommunityContentPage";
import { api } from "../lib/api/admin";
import React from "react";

// Mock the API client
vi.mock("../lib/api/admin", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockPacks: AdminContentPackListItem[] = [
  {
    id: "pack-1",
    title: "بسته فارماکولوژی قلب و عروق",
    description: "شامل ۴ بخش آموزشی استاندارد",
    subject: "فارماکولوژی",
    status: "pending_review",
    usageCount: 0,
    creator: {
      id: "user-1",
      name: "دکتر مریم رضایی",
    },
    stats: {
      sessionCount: 2,
      flashcardCount: 5,
      quizQuestionCount: 3,
      estimatedReadingMinutes: 25,
    },
    accessType: "free",
    rejectionReason: null,
    reviewedAt: null,
    publishedAt: null,
    createdAt: "2026-08-20T10:00:00Z",
    updatedAt: "2026-08-20T10:00:00Z",
  },
  {
    id: "pack-2",
    title: "بسته فیزیولوژی اعصاب",
    description: null,
    subject: "فیزیولوژی",
    status: "published",
    usageCount: 14,
    creator: {
      id: "user-2",
      name: "علی محمدی",
    },
    stats: {
      sessionCount: 1,
      flashcardCount: 2,
      quizQuestionCount: 1,
      estimatedReadingMinutes: 10,
    },
    accessType: "paid",
    rejectionReason: null,
    reviewedAt: "2026-08-21T10:00:00Z",
    publishedAt: "2026-08-21T10:00:00Z",
    pricing: {
      is_free: false,
      price: 75000,
      currency: "toman",
      product_id: "prod-2",
    },
    createdAt: "2026-08-21T09:00:00Z",
    updatedAt: "2026-08-21T10:00:00Z",
  },
];

const mockDetailData: AdminContentPackDetailResponse = {
  pack: mockPacks[0],
  preview: {
    lesson: {
      title: "درسنامه جامع فارماکولوژی قلب",
      sessionCount: 2,
      estimatedMinutes: 25,
      sessions: [
        {
          title: "جلسه اول: داروهای ضد فشار خون",
          contentMarkdown: "## مهارکننده‌های ACE\nکاپتوپریل و انالاپریل",
          estimatedMinutes: 12,
        },
        {
          title: "جلسه دوم: بتابلاکرها",
          contentMarkdown: "## مسدودکننده‌های گیرنده بتا\nپروپرانولول و آتنولول",
          estimatedMinutes: 13,
        },
      ],
    },
    flashcard: {
      title: "فلش‌کارت‌های قلب و عروق",
      totalCards: 2,
      cards: [
        {
          front: "کاپتوپریل چیست؟",
          back: "مهارکننده اختصاصی ACE",
          explanation: "از تبدیل آنژیوتانسین ۱ به ۲ جلوگیری می‌کند.",
        },
        {
          front: "پروپرانولول چیست؟",
          back: "بتابلاکر غیراختصاصی",
          explanation: null,
        },
      ],
    },
    quiz: {
      title: "آزمون تستی قلب و عروق",
      totalQuestions: 2,
      questions: [
        {
          question: "کدام دارو مهارکننده ACE است؟",
          choices: ["کاپتوپریل", "پروپرانولول", "لوزارتان", "آملودیپین"],
          correctAnswer: "کاپتوپریل",
          explanation: "کاپتوپریل نمونه بارز مهارکننده‌های ACE است.",
        },
        {
          question: "عوارض شایع کاپتوپریل چیست؟",
          choices: ["سرفه خشک", "تاری دید", "ریزش مو", "افزایش قند خون"],
          correctAnswer: "سرفه خشک",
          explanation: "به دلیل تجمع برادی‌کینین سرفه خشک ایجاد می‌شود.",
        },
      ],
    },
    review_summary: {
      title: "خلاصه مروری قلب و عروق",
      summary: "مرور سریع داروهای قلبی و نکات کنکوری و بالینی",
      overview: "مرور سریع داروهای قلبی و نکات کنکوری و بالینی",
      sections: [
        {
          title: "نکات مهم داروها",
          keyPoints: ["کاپتوپریل باعث سرفه خشک می‌شود", "پروپرانولول در آسم منع مصرف دارد"],
        },
      ],
    },
  },
  itemsCount: 4,
  product: null,
};

describe("AdminCommunityContentPage Component Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.alert = vi.fn();
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/content-packs") {
        return {
          items: mockPacks,
          totalCount: mockPacks.length,
        };
      }
      if (url.startsWith("/admin/content-packs/pack-1")) {
        return mockDetailData;
      }
      if (url.startsWith("/admin/content-packs/pack-2")) {
        return {
          ...mockDetailData,
          pack: mockPacks[1],
          product: {
            id: "prod-2",
            code: "content_pack_pack-2",
            price: 75000,
            currency: "toman",
            active: true,
          },
        };
      }
      throw new Error("Not found");
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("1. Renders submissions list, filter tabs, search bar, and creator info", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/community-content"]}>
        <Routes>
          <Route path="/admin/community-content" element={<AdminCommunityContentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("بسته فارماکولوژی قلب و عروق")).toBeInTheDocument();
      expect(screen.getByText("دکتر مریم رضایی")).toBeInTheDocument();
    });

    expect(screen.getByText("در انتظار بررسی")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/جستجو در عنوان/i)).toBeInTheDocument();

    // Switch to "همه بسته‌ها" tab
    const allTab = screen.getByRole("button", { name: /همه بسته‌ها/i });
    fireEvent.click(allTab);

    await waitFor(() => {
      expect(screen.getByText("بسته فیزیولوژی اعصاب")).toBeInTheDocument();
    });
  });

  it("2. Click on item opens review detail modal without crashing and renders complete preview", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/community-content"]}>
        <Routes>
          <Route path="/admin/community-content" element={<AdminCommunityContentPage />} />
          <Route path="/admin/community-content/:id" element={<AdminCommunityContentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("بسته فارماکولوژی قلب و عروق")).toBeInTheDocument();
    });

    // Click "بررسی و تصمیم‌گیری"
    const reviewButtons = screen.getAllByText("بررسی و تصمیم‌گیری");
    fireEvent.click(reviewButtons[0]);

    // Modal should open
    await waitFor(() => {
      expect(screen.getByText("درسنامه جامع فارماکولوژی قلب")).toBeInTheDocument();
    });

    // Verify Lesson Sessions rendered with Markdown
    expect(screen.getAllByText(/جلسه اول: داروهای ضد فشار خون/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/کاپتوپریل و انالاپریل/i)).toBeInTheDocument();
    expect(screen.getAllByText(/جلسه دوم: بتابلاکرها/i).length).toBeGreaterThan(0);
  });

  it("3. Tab switching between Lesson, Flashcards, Quiz, and Summary works without crash", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/community-content/pack-1"]}>
        <Routes>
          <Route path="/admin/community-content/:id" element={<AdminCommunityContentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("درسنامه جامع فارماکولوژی قلب")).toBeInTheDocument();
    });

    // 1. Switch to Flashcards tab
    const flashcardTab = screen.getByRole("button", { name: /فلش‌کارت‌ها/i });
    fireEvent.click(flashcardTab);

    await waitFor(() => {
      expect(screen.getByText("کاپتوپریل چیست؟")).toBeInTheDocument();
      expect(screen.getByText("مهارکننده اختصاصی ACE")).toBeInTheDocument();
      expect(screen.getByText(/از تبدیل آنژیوتانسین ۱ به ۲/i)).toBeInTheDocument();
    });

    // 2. Switch to Quiz tab
    const quizTab = screen.getByRole("button", { name: /آزمون تستی/i });
    fireEvent.click(quizTab);

    await waitFor(() => {
      expect(screen.getByText(/کدام دارو مهارکننده ACE است؟/)).toBeInTheDocument();
      expect(screen.getByText(/کاپتوپریل نمونه بارز مهارکننده‌های ACE است/)).toBeInTheDocument();
    });

    // 3. Switch to Summary tab
    const summaryTab = screen.getByRole("button", { name: /خلاصه مروری/i });
    fireEvent.click(summaryTab);

    await waitFor(() => {
      expect(screen.getByText(/مرور سریع داروهای قلبی و نکات کنکوری/i)).toBeInTheDocument();
      expect(screen.getByText("نکات مهم داروها")).toBeInTheDocument();
    });
  });

  it("4. Resilient to empty / missing sessions, cards, or questions arrays", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith("/admin/content-packs/pack-empty")) {
        return {
          pack: {
            ...mockPacks[0],
            id: "pack-empty",
            title: "بسته خالی",
          },
          preview: {
            lesson: {
              title: "درس بدون جلسه",
              sessionCount: 0,
              estimatedMinutes: 0,
              sessions: [],
            },
            flashcard: {
              title: "فلش بدون کارت",
              totalCards: 0,
              cards: [],
            },
            quiz: {
              title: "آزمون بدون سوال",
              totalQuestions: 0,
              questions: [],
            },
            review_summary: {
              title: "خلاصه خالی",
              summary: "",
            },
          },
          itemsCount: 0,
          product: null,
        };
      }
      return { items: mockPacks, totalCount: mockPacks.length };
    });

    render(
      <MemoryRouter initialEntries={["/admin/community-content/pack-empty"]}>
        <Routes>
          <Route path="/admin/community-content/:id" element={<AdminCommunityContentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("درس بدون جلسه")).toBeInTheDocument();
    });

    expect(screen.getByText("جلسه‌ای برای این درسنامه ثبت نشده است.")).toBeInTheDocument();

    // Flashcards empty state
    fireEvent.click(screen.getByRole("button", { name: /فلش‌کارت‌ها/i }));
    await waitFor(() => {
      expect(screen.getByText("کارت فلش‌کارتی برای این بسته ثبت نشده است.")).toBeInTheDocument();
    });

    // Quiz empty state
    fireEvent.click(screen.getByRole("button", { name: /آزمون تستی/i }));
    await waitFor(() => {
      expect(screen.getByText("سوالی برای این آزمون ثبت نشده است.")).toBeInTheDocument();
    });
  });

  it("4b. Displays unified master markdown content when no sessions array exists (NO empty state)", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith("/admin/content-packs/pack-unified")) {
        return {
          pack: {
            ...mockPacks[0],
            id: "pack-unified",
            title: "بسته با محتوای یکپارچه",
          },
          preview: {
            lesson: {
              title: "درسنامه یکپارچه بدون جلسات مجزا",
              sessionCount: 1,
              estimatedMinutes: 15,
              sessions: [
                {
                  title: "درسنامه یکپارچه بدون جلسات مجزا",
                  contentMarkdown: "این متن کامل درسنامه است و نباید پیام خالی نمایش داده شود.",
                  estimatedMinutes: 15,
                },
              ],
              contentMarkdown: "این متن کامل درسنامه است و نباید پیام خالی نمایش داده شود.",
              hasCanonicalSessions: false,
            },
          },
          sourceDocument: {
            id: "doc-123",
            originalName: "medical_handbook.pdf",
            mimeType: "application/pdf",
            sizeBytes: 204800,
            status: "ready",
            downloadUrl: "/v1/admin/documents/doc-123/download",
          },
          itemsCount: 1,
          product: null,
        };
      }
      return { items: mockPacks, totalCount: mockPacks.length };
    });

    render(
      <MemoryRouter initialEntries={["/admin/community-content/pack-unified"]}>
        <Routes>
          <Route path="/admin/community-content/:id" element={<AdminCommunityContentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText("درسنامه یکپارچه بدون جلسات مجزا").length).toBeGreaterThan(0);
    });

    // Verify unified badge is shown
    expect(screen.getByText("محتوای یکپارچه درسنامه")).toBeInTheDocument();
    // Verify markdown text is visible
    expect(screen.getByText(/این متن کامل درسنامه است/)).toBeInTheDocument();
    // Verify empty state is NOT present
    expect(screen.queryByText("جلسه‌ای برای این درسنامه ثبت نشده است.")).not.toBeInTheDocument();
    // Verify source document reference is visible
    expect(screen.getByText("medical_handbook.pdf")).toBeInTheDocument();
    expect(screen.getByText(/دانلود \/ مشاهده فایل مرجع/)).toBeInTheDocument();
  });

  it("5. Approve as Free submission successfully calls approve API and closes modal", async () => {
    vi.mocked(api.post).mockResolvedValue({ success: true });

    render(
      <MemoryRouter initialEntries={["/admin/community-content/pack-1"]}>
        <Routes>
          <Route path="/admin/community-content/:id" element={<AdminCommunityContentPage />} />
          <Route path="/admin/community-content" element={<AdminCommunityContentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("درسنامه جامع فارماکولوژی قلب")).toBeInTheDocument();
    });

    // Select Free radio
    const freeRadio = screen.getByLabelText(/بسته رایگان \(Free\)/i);
    fireEvent.click(freeRadio);

    // Click Approve button
    const approveBtn = screen.getByRole("button", { name: /تأیید و انتشار بسته/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/admin/content-packs/pack-1/approve", {
        accessType: "free",
        price: undefined,
      });
      expect(screen.getByText(/بسته آموزشی با موفقیت تأیید/i)).toBeInTheDocument();
    });
  });

  it("6. Approve as Paid submission with price validates and calls approve API", async () => {
    vi.mocked(api.post).mockResolvedValue({ success: true });

    render(
      <MemoryRouter initialEntries={["/admin/community-content/pack-1"]}>
        <Routes>
          <Route path="/admin/community-content/:id" element={<AdminCommunityContentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("درسنامه جامع فارماکولوژی قلب")).toBeInTheDocument();
    });

    // Select Paid radio
    const paidRadio = screen.getByLabelText(/بسته پولی \(Paid\)/i);
    fireEvent.click(paidRadio);

    // Enter price
    const priceInput = screen.getByPlaceholderText(/مثال: ۱۰۰,۰۰۰/i);
    fireEvent.change(priceInput, { target: { value: "150000" } });

    // Click Approve button
    const approveBtn = screen.getByRole("button", { name: /تأیید و انتشار بسته/i });
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/admin/content-packs/pack-1/approve", {
        accessType: "paid",
        price: 150000,
      });
    });
  });

  it("7. Reject flow requires reason and calls reject API", async () => {
    vi.mocked(api.post).mockResolvedValue({ success: true });

    render(
      <MemoryRouter initialEntries={["/admin/community-content/pack-1"]}>
        <Routes>
          <Route path="/admin/community-content/:id" element={<AdminCommunityContentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("درسنامه جامع فارماکولوژی قلب")).toBeInTheDocument();
    });

    // Click "رد بسته" button in footer
    const rejectBtn = screen.getByRole("button", { name: /رد بسته/i });
    fireEvent.click(rejectBtn);

    // Rejection form opens
    expect(screen.getByPlaceholderText(/علت رد بسته را بنویسید/i)).toBeInTheDocument();

    // Type reason
    const reasonInput = screen.getByPlaceholderText(/علت رد بسته را بنویسید/i);
    fireEvent.change(reasonInput, { target: { value: "کیفیت پاسخ‌ها نیاز به بازبینی دارد." } });

    // Confirm reject
    const confirmRejectBtn = screen.getByRole("button", { name: /تأیید رد بسته/i });
    fireEvent.click(confirmRejectBtn);

    await waitFor(() => {
      expect(api.post).toHaveBeenCalledWith("/admin/content-packs/pack-1/reject", {
        reason: "کیفیت پاسخ‌ها نیاز به بازبینی دارد.",
      });
      expect(screen.getByText(/بسته آموزشی با موفقیت رد شد/i)).toBeInTheDocument();
    });
  });

  it("8. Gracefully displays error on failed detail fetch with retry action", async () => {
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url === "/admin/content-packs") {
        return { items: mockPacks, totalCount: mockPacks.length };
      }
      throw new Error("خطای ارتباط با سرور");
    });

    render(
      <MemoryRouter initialEntries={["/admin/community-content/pack-1"]}>
        <Routes>
          <Route path="/admin/community-content/:id" element={<AdminCommunityContentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("خطای ارتباط با سرور")).toBeInTheDocument();
      expect(screen.getByText("تلاش مجدد")).toBeInTheDocument();
    });
  });

  it("9. Renders very long Persian and English titles in course header cleanly without squishing", async () => {
    const longTitle = "فارماکولوژی و بالین‌شناسی داروهای تیروئید و ضدتیروئید در بیماران مبتلا به نارسایی حاد کلیوی و اختلالات متابولیک (Endocrine Pharmacology)";
    
    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith("/admin/content-packs/pack-long-title")) {
        return {
          pack: {
            ...mockPacks[0],
            id: "pack-long-title",
            title: longTitle,
          },
          preview: {
            lesson: {
              title: longTitle,
              sessionCount: 1,
              estimatedMinutes: 45,
              sessions: [
                {
                  title: "جلسه اول: مکانیسم‌های فارماکوکینتیک لووتیروکسین و متی‌مازول در اختلالات حاد",
                  contentMarkdown: "### متن بررسی داروها\nتوضیحات کامل داروشناسی بالینی تیروئید.",
                  estimatedMinutes: 45,
                },
              ],
            },
          },
          itemsCount: 1,
          product: null,
        };
      }
      return { items: mockPacks, totalCount: mockPacks.length };
    });

    render(
      <MemoryRouter initialEntries={["/admin/community-content/pack-long-title"]}>
        <Routes>
          <Route path="/admin/community-content/:id" element={<AdminCommunityContentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText(longTitle).length).toBeGreaterThan(0);
    });

    // Check metadata section is distinct and uncompressed
    expect(screen.getByText(/۱ جلسه درسنامه/)).toBeInTheDocument();
    expect(screen.getByText(/زمان تخمینی مطالعه: ۴۵ دقیقه/)).toBeInTheDocument();
    // Check session card title and markdown content
    expect(screen.getByText("جلسه ۱")).toBeInTheDocument();
    expect(screen.getByText("جلسه اول: مکانیسم‌های فارماکوکینتیک لووتیروکسین و متی‌مازول در اختلالات حاد")).toBeInTheDocument();
    expect(screen.getByText("توضیحات کامل داروشناسی بالینی تیروئید.")).toBeInTheDocument();
  });

  it("10. Smart Default: 10 sessions -> only first session expanded, other 9 collapsed as compact Curriculum outline", async () => {
    const tenSessions = Array.from({ length: 10 }, (_, idx) => ({
      title: `مبحث تخصصی شماره ${idx + 1}`,
      contentMarkdown: `متن کامل و تفصیلی جلسه ${idx + 1}`,
      estimatedMinutes: 10,
    }));

    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith("/admin/content-packs/pack-10-sessions")) {
        return {
          pack: {
            ...mockPacks[0],
            id: "pack-10-sessions",
            title: "دوره جامع ۱۰ جلسه‌ای فارماکولوژی",
          },
          preview: {
            lesson: {
              title: "دوره جامع ۱۰ جلسه‌ای فارماکولوژی",
              sessionCount: 10,
              estimatedMinutes: 100,
              sessions: tenSessions,
            },
          },
          itemsCount: 10,
          product: null,
        };
      }
      return { items: mockPacks, totalCount: mockPacks.length };
    });

    render(
      <MemoryRouter initialEntries={["/admin/community-content/pack-10-sessions"]}>
        <Routes>
          <Route path="/admin/community-content/:id" element={<AdminCommunityContentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText("دوره جامع ۱۰ جلسه‌ای فارماکولوژی").length).toBeGreaterThan(0);
    });

    // Check metadata
    expect(screen.getByText(/۱۰ جلسه درسنامه/)).toBeInTheDocument();
    expect(screen.getByText(/زمان تخمینی مطالعه: ۱۰۰ دقیقه/)).toBeInTheDocument();

    // Verify all 10 session headers are visible as compact Curriculum Outline
    expect(screen.getByText("جلسه ۱")).toBeInTheDocument();
    expect(screen.getByText("جلسه ۲")).toBeInTheDocument();
    expect(screen.getByText("جلسه ۱۰")).toBeInTheDocument();
    expect(screen.getByText("مبحث تخصصی شماره 10")).toBeInTheDocument();

    // Verify Session 1 is expanded (its markdown is in document)
    expect(screen.getByText("متن کامل و تفصیلی جلسه 1")).toBeInTheDocument();
    // Verify Session 2 & Session 10 are collapsed (their markdowns are NOT in document)
    expect(screen.queryByText("متن کامل و تفصیلی جلسه 2")).not.toBeInTheDocument();
    expect(screen.queryByText("متن کامل و تفصیلی جلسه 10")).not.toBeInTheDocument();

    // Toggle session 2 -> multi-expand (both session 1 and session 2 are now open)
    const session2Btn = screen.getByRole("button", { name: /جلسه ۲.*مبحث تخصصی شماره 2/i });
    fireEvent.click(session2Btn);

    expect(screen.getByText("متن کامل و تفصیلی جلسه 1")).toBeInTheDocument();
    expect(screen.getByText("متن کامل و تفصیلی جلسه 2")).toBeInTheDocument();
    expect(screen.queryByText("متن کامل و تفصیلی جلسه 10")).not.toBeInTheDocument();

    // Toggle All: Click "باز کردن همه"
    const toggleAllBtn = screen.getByRole("button", { name: /باز کردن همه/i });
    fireEvent.click(toggleAllBtn);

    // Now all 10 sessions markdown are visible
    expect(screen.getByText("متن کامل و تفصیلی جلسه 10")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /بستن همه/i })).toBeInTheDocument();

    // Toggle All: Click "بستن همه"
    const closeAllBtn = screen.getByRole("button", { name: /بستن همه/i });
    fireEvent.click(closeAllBtn);

    // All markdown content should now be collapsed
    expect(screen.queryByText("متن کامل و تفصیلی جلسه 1")).not.toBeInTheDocument();
    expect(screen.queryByText("متن کامل و تفصیلی جلسه 2")).not.toBeInTheDocument();
    expect(screen.queryByText("متن کامل و تفصیلی جلسه 10")).not.toBeInTheDocument();
  });

  it("11. Smart Default: 2 sessions -> both expanded by default", async () => {
    render(
      <MemoryRouter initialEntries={["/admin/community-content/pack-1"]}>
        <Routes>
          <Route path="/admin/community-content/:id" element={<AdminCommunityContentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("درسنامه جامع فارماکولوژی قلب")).toBeInTheDocument();
    });

    // 2 sessions -> both sessions should be expanded by default without clicking
    expect(screen.getByText(/کاپتوپریل و انالاپریل/i)).toBeInTheDocument();
    expect(screen.getByText(/پروپرانولول و آتنولول/i)).toBeInTheDocument();
  });

  it("12. Smart Default: 3 sessions -> only first expanded by default", async () => {
    const threeSessions = [
      { title: "جلسه اول", contentMarkdown: "محتوای جلسه اول", estimatedMinutes: 10 },
      { title: "جلسه دوم", contentMarkdown: "محتوای جلسه دوم", estimatedMinutes: 12 },
      { title: "جلسه سوم", contentMarkdown: "محتوای جلسه سوم", estimatedMinutes: 15 },
    ];

    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith("/admin/content-packs/pack-3-sessions")) {
        return {
          pack: {
            ...mockPacks[0],
            id: "pack-3-sessions",
            title: "بسته ۳ جلسه‌ای",
          },
          preview: {
            lesson: {
              title: "بسته ۳ جلسه‌ای",
              sessionCount: 3,
              estimatedMinutes: 37,
              sessions: threeSessions,
            },
          },
          itemsCount: 3,
          product: null,
        };
      }
      return { items: mockPacks, totalCount: mockPacks.length };
    });

    render(
      <MemoryRouter initialEntries={["/admin/community-content/pack-3-sessions"]}>
        <Routes>
          <Route path="/admin/community-content/:id" element={<AdminCommunityContentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText("بسته ۳ جلسه‌ای").length).toBeGreaterThan(0);
    });

    // Only session 1 expanded
    expect(screen.getByText("محتوای جلسه اول")).toBeInTheDocument();
    expect(screen.queryByText("محتوای جلسه دوم")).not.toBeInTheDocument();
    expect(screen.queryByText("محتوای جلسه سوم")).not.toBeInTheDocument();
  });

  it("13. State Reset: Switching between packs resets the expanded session state", async () => {
    const packA = {
      ...mockPacks[0],
      id: "pack-A",
      title: "بسته A با ۵ جلسه",
    };
    const packB = {
      ...mockPacks[0],
      id: "pack-B",
      title: "بسته B با ۱ جلسه",
    };

    vi.mocked(api.get).mockImplementation(async (url: string) => {
      if (url.startsWith("/admin/content-packs/pack-A")) {
        return {
          pack: packA,
          preview: {
            lesson: {
              title: "بسته A با ۵ جلسه",
              sessionCount: 5,
              estimatedMinutes: 50,
              sessions: Array.from({ length: 5 }, (_, i) => ({
                title: `جلسه A-${i + 1}`,
                contentMarkdown: `متن جلسه A-${i + 1}`,
                estimatedMinutes: 10,
              })),
            },
          },
          itemsCount: 5,
          product: null,
        };
      }
      if (url.startsWith("/admin/content-packs/pack-B")) {
        return {
          pack: packB,
          preview: {
            lesson: {
              title: "بسته B با ۱ جلسه",
              sessionCount: 1,
              estimatedMinutes: 10,
              sessions: [
                {
                  title: "جلسه B-1",
                  contentMarkdown: "متن اختصاصی جلسه B-1",
                  estimatedMinutes: 10,
                },
              ],
            },
          },
          itemsCount: 1,
          product: null,
        };
      }
      return { items: [packA, packB], totalCount: 2 };
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={["/admin/community-content/pack-A"]}>
        <Routes>
          <Route path="/admin/community-content/:id" element={<AdminCommunityContentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText("بسته A با ۵ جلسه").length).toBeGreaterThan(0);
    });

    // Expand all in Pack A
    fireEvent.click(screen.getByRole("button", { name: /باز کردن همه/i }));
    expect(screen.getByText("متن جلسه A-5")).toBeInTheDocument();

    unmount();

    // Render Pack B
    render(
      <MemoryRouter initialEntries={["/admin/community-content/pack-B"]}>
        <Routes>
          <Route path="/admin/community-content/:id" element={<AdminCommunityContentPage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getAllByText("بسته B با ۱ جلسه").length).toBeGreaterThan(0);
    });

    // Pack B has 1 session -> automatically expanded by smart default
    expect(screen.getByText("متن اختصاصی جلسه B-1")).toBeInTheDocument();
  });
});
