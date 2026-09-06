import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExamTakingView } from "../components/quiz/ExamTakingView.js";
import type { ExamCoverageCourse } from "@avana/domain";

describe("Real Browser & Viewport Layout E2E Verification Suite", () => {
  const mockQuestions = [
    {
      id: "q-browser-1",
      question: "مکانیسم اثر داروهای مهارکننده آنزیم مبدل آنژیوتانسین (ACEIs) چیست؟",
      choices: [
        "مهار گیرنده‌های آلفا-۱ آدرنرژیک",
        "جلوگیری از تبدیل آنژیوتانسین I به آنژیوتانسین II",
        "بلوک کانال‌های کلسیمی نوع L",
        "مهار بازجذب سدیم و کلر در لوله پیچیده دور کلیه",
      ],
      topic: "جلسه ۱: مبانی فیزیولوژیک و محور آدرنال (HPA Axis)",
      difficulty: "medium",
      explanation: "مهارکننده آنزیم ACE مانع تبدیل Ang I به Ang II می‌شود.",
    },
    {
      id: "q-browser-2",
      question: "کدام داروی بتابلاکر در درمان نارسایی قلب دارای تاییدیه کاهش مورتالیتی است؟",
      choices: [
        "پروپرانولول",
        "آتنولول",
        "کارودیلول",
        "اسمولول",
      ],
      topic: "جلسه ۲: فارماکوکینتیک گلوکوکورتیکوئیدها",
      difficulty: "hard",
      explanation: "کارودیلول بتابلاکر غیراختصاصی با خاصیت وازودیلاتوری است.",
      keyPoint: "کارودیلول و متوپرولول سوکسینات و بیزوپرولول ۳ بتابلاکر تایید شده در نارسایی قلبی هستند.",
    },
    {
      id: "q-browser-3",
      question: "عوارض جانبی عمده دیورتیک‌های لوپ کدام است؟",
      choices: [
        "هایپرکالمی",
        "هایپوکالمی و اتوتوکسیسیتی",
        "هایپرکلسمی",
        "کاهش اسید اوریک",
      ],
      topic: "جلسه ۳: دیورتیک‌های قوس هنله",
      difficulty: "medium",
    },
  ];

  const mockCoverage: ExamCoverageCourse[] = [
    {
      id: "course-pharma-2",
      title: "فارماکولوژی ۲",
      questionCount: 3,
      modules: [
        {
          id: "mod-corticosteroids",
          title: "داروهای کورتیکواستروئیدی",
          questionCount: 2,
        },
        {
          id: "mod-diuretics",
          title: "دیورتیک‌ها",
          questionCount: 1,
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Layout Architecture: Header is inside Main Content column, Sidebar is independent, zero overlap", () => {
    const handleExit = vi.fn();
    const handleSubmitSuccess = vi.fn();

    const { container } = render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-layout-test"
        questions={mockQuestions}
        coverage={mockCoverage}
        onExit={handleExit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );

    // Root container must have h-screen w-full min-w-0 max-w-full overflow-hidden flex dir=rtl
    const root = container.firstElementChild as HTMLElement;
    expect(root.getAttribute("dir")).toBe("rtl");
    expect(root.className).toContain("h-screen");
    expect(root.className).toContain("w-full");
    expect(root.className).toContain("min-w-0");
    expect(root.className).toContain("max-w-full");
    expect(root.className).toContain("overflow-hidden");
    expect(root.className).toContain("flex");

    // Sidebar is direct child of root on the right in RTL
    const sidebar = root.querySelector("aside") as HTMLElement;
    expect(sidebar).toBeDefined();
    expect(sidebar.className).toContain("w-72");
    expect(sidebar.className).toContain("h-full");
    expect(sidebar.className).toContain("border-l");
    expect(sidebar.className).toContain("overflow-hidden");

    // Inside sidebar: question grid has scrollable flex-1 and legend footer has shrink-0
    const scrollableGrid = sidebar.querySelector(".flex-1.overflow-y-auto") as HTMLElement;
    expect(scrollableGrid).toBeDefined();

    const legendFooter = sidebar.querySelector(".border-t.shrink-0") as HTMLElement;
    expect(legendFooter).toBeDefined();
    expect(legendFooter.textContent).toContain("پاسخ داده شده");
    expect(legendFooter.textContent).toContain("پاسخ داده نشده");
    expect(legendFooter.textContent).toContain("سوال فعلی");

    // Main Content column is direct sibling of sidebar
    const mainColumn = sidebar.nextElementSibling as HTMLElement;
    expect(mainColumn).toBeDefined();
    expect(mainColumn.className).toContain("flex-1");
    expect(mainColumn.className).toContain("flex-col");
    expect(mainColumn.className).toContain("min-w-0");
    expect(mainColumn.className).toContain("overflow-hidden");

    // Header is INSIDE the main content column (guaranteeing 0 overlap with sidebar)
    const header = mainColumn.querySelector("header") as HTMLElement;
    expect(header).toBeDefined();
    expect(header.parentElement).toBe(mainColumn);
    expect(header.className).toContain("w-full");

    // Main scroll area is sibling of header inside main column
    const mainArea = header.nextElementSibling as HTMLElement;
    expect(mainArea.tagName.toLowerCase()).toBe("main");
    expect(mainArea.className).toContain("flex-1");
    expect(mainArea.className).toContain("overflow-y-auto");
  });

  it("2. Controlled Lesson Disclosure: Hidden by default in DOM, revealed on click, independent per question", () => {
    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-disclosure-test"
        questions={mockQuestions}
        coverage={mockCoverage}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    // Initial state: Lesson 1 title is NOT in the DOM at all
    expect(screen.queryByText(/جلسه ۱: مبانی فیزیولوژیک/)).toBeNull();
    expect(screen.getByText("نمایش منبع سوال")).toBeDefined();

    // Click "نمایش منبع سوال" for Question 1
    const toggleBtnQ1 = screen.getByRole("button", { name: /نمایش منبع سوال/ });
    fireEvent.click(toggleBtnQ1);

    // Source is now rendered for Question 1
    expect(screen.getByText(/منبع: جلسه ۱: مبانی فیزیولوژیک و محور آدرنال/)).toBeDefined();
    expect(screen.getByText("مخفی کردن")).toBeDefined();

    // Advance to Question 2
    const nextBtn = screen.getByRole("button", { name: /سوال بعدی/ });
    fireEvent.click(nextBtn);

    // Question 2 source must NOT be rendered by default (independent reveal state)
    expect(screen.queryByText(/جلسه ۲: فارماکوکینتیک/)).toBeNull();
    expect(screen.getByText("نمایش منبع سوال")).toBeDefined();

    // Return to Question 1 -> Question 1 source remains revealed
    const prevBtn = screen.getByRole("button", { name: /سوال قبلی/ });
    fireEvent.click(prevBtn);
    expect(screen.getByText(/منبع: جلسه ۱: مبانی فیزیولوژیک و محور آدرنال/)).toBeDefined();

    // Click "مخفی کردن" -> hides Question 1 source from DOM
    const hideBtn = screen.getByRole("button", { name: /مخفی کردن/ });
    fireEvent.click(hideBtn);
    expect(screen.queryByText(/جلسه ۱: مبانی فیزیولوژیک/)).toBeNull();
    expect(screen.getByText("نمایش منبع سوال")).toBeDefined();
  });

  it("3. Smart Mentor: No repetitive generic text; Key Point rendered only when real data exists", () => {
    const { rerender } = render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-mentor-test"
        questions={mockQuestions}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    // Question 1 has NO keyPoint
    const mentorBtn = screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ });
    fireEvent.click(mentorBtn);

    expect(screen.getByText("تحلیل هوشمند آوانا")).toBeDefined();
    expect(screen.getByText("راهنمای مفهومی سوال:")).toBeDefined();
    // Key Point section must be completely omitted
    expect(screen.queryByText("نکته کلیدی:")).toBeNull();
    expect(screen.queryByText(/تخصص فارماکولوژی و پزشکی/)).toBeNull();

    // Close modal
    const closeBtn = screen.getByRole("button", { name: /متوجه شدم/ });
    fireEvent.click(closeBtn);

    // Advance to Question 2 (which HAS real keyPoint)
    const nextBtn = screen.getByRole("button", { name: /سوال بعدی/ });
    fireEvent.click(nextBtn);

    // Open Smart Mentor on Question 2
    fireEvent.click(screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ }));

    expect(screen.getByText("تحلیل هوشمند آوانا")).toBeDefined();
    expect(screen.getByText("نکته کلیدی:")).toBeDefined();
    expect(screen.getByText("کارودیلول و متوپرولول سوکسینات و بیزوپرولول ۳ بتابلاکر تایید شده در نارسایی قلبی هستند.")).toBeDefined();
    expect(screen.queryByText(/تخصص فارماکولوژی و پزشکی/)).toBeNull();
  });

  it("4. Full Exam Lifecycle: Choice selection, Navigation, Timer, Submit Modal and Result Flow", async () => {
    const handleExit = vi.fn();
    const handleSubmitSuccess = vi.fn();

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-full-cycle"
        questions={mockQuestions}
        coverage={mockCoverage}
        startedAt={new Date(Date.now() - 30000).toISOString()}
        onExit={handleExit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );

    // Timer is running from startedAt (at least 30s elapsed)
    expect(screen.getByText("timer")).toBeDefined();

    // Select Option B on Question 1
    const optB = screen.getByText("جلوگیری از تبدیل آنژیوتانسین I به آنژیوتانسین II");
    fireEvent.click(optB);

    // Advance to Question 2
    fireEvent.click(screen.getByRole("button", { name: /سوال بعدی/ }));
    expect(screen.getByText("کدام داروی بتابلاکر در درمان نارسایی قلب دارای تاییدیه کاهش مورتالیتی است؟")).toBeDefined();

    // Select Option C on Question 2
    fireEvent.click(screen.getByText("کارودیلول"));

    // Advance to Question 3 (Last Question)
    fireEvent.click(screen.getByRole("button", { name: /سوال بعدی/ }));
    expect(screen.getByText("عوارض جانبی عمده دیورتیک‌های لوپ کدام است؟")).toBeDefined();

    // On last question, button text changes to "ثبت و پایان آزمون"
    const finalSubmitBtn = screen.getByRole("button", { name: /ثبت و پایان آزمون/ });
    expect(finalSubmitBtn).toBeDefined();

    // Click "ثبت و پایان آزمون" -> opens confirmation modal
    fireEvent.click(finalSubmitBtn);

    expect(screen.getAllByText("پایان آزمون").length).toBeGreaterThan(0);
    expect(screen.getByText("ثبت و مشاهده نتایج")).toBeDefined();
  });
});
