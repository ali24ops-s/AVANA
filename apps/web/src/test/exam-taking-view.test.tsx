import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExamTakingView } from "../components/quiz/ExamTakingView.js";

describe("ExamTakingView Component", () => {
  const mockQuestions = [
    {
      id: "q-1",
      question: "مکانیسم اثر داروهای مهارکننده آنزیم مبدل آنژیوتانسین (ACEIs) چیست؟",
      choices: [
        "مهار گیرنده‌های آلفا-۱ آدرنرژیک",
        "جلوگیری از تبدیل آنژیوتانسین I به آنژیوتانسین II",
        "بلوک کانال‌های کلسیمی نوع L",
        "مهار بازجذب سدیم و کلر در لوله پیچیده دور کلیه",
      ],
      topic: "فارماکولوژی",
      difficulty: "medium",
    },
    {
      id: "q-2",
      question: "کدام داروی بتابلاکر در درمان نارسایی قلب دارای تاییدیه کاهش مورتالیتی است؟",
      choices: [
        "پروپرانولول",
        "آتنولول",
        "کارودیلول",
        "اسمولول",
      ],
      topic: "کاردیولوژی",
      difficulty: "hard",
    },
  ];

  it("renders question text, choices, question navigator map, and badges", () => {
    const handleExit = vi.fn();
    const handleSubmitSuccess = vi.fn();

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-123"
        questions={mockQuestions}
        topicName="فارماکولوژی قلب و عروق"
        onExit={handleExit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );

    // Verify Brand Logo & Header
    expect(screen.getByAltText("لوگوی آوانا")).toBeDefined();
    expect(screen.getByText("فارماکولوژی قلب و عروق")).toBeDefined();

    // Verify Question Card
    expect(
      screen.getAllByText("مکانیسم اثر داروهای مهارکننده آنزیم مبدل آنژیوتانسین (ACEIs) چیست؟")[0]
    ).toBeDefined();

    // Verify Choices
    expect(
      screen.getAllByText("جلوگیری از تبدیل آنژیوتانسین I به آنژیوتانسین II")[0]
    ).toBeDefined();
    expect(screen.getByText("مهار گیرنده‌های آلفا-۱ آدرنرژیک")).toBeDefined();

    // Verify Question Navigator (Exam Map) buttons
    expect(screen.getByText("نقشه آزمون")).toBeDefined();
    expect(screen.getByText("پایان آزمون")).toBeDefined();
  });

  it("allows selecting choices and navigating between questions", () => {
    const handleExit = vi.fn();
    const handleSubmitSuccess = vi.fn();

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-123"
        questions={mockQuestions}
        onExit={handleExit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );

    // Select choice B for Question 1
    const choiceB = screen.getAllByText("جلوگیری از تبدیل آنژیوتانسین I به آنژیوتانسین II")[0];
    fireEvent.click(choiceB);

    // Click "سوال بعدی"
    const nextBtn = screen.getAllByText("سوال بعدی")[0];
    fireEvent.click(nextBtn);

    // Should display Question 2
    expect(
      screen.getByText("کدام داروی بتابلاکر در درمان نارسایی قلب دارای تاییدیه کاهش مورتالیتی است؟")
    ).toBeDefined();

    // Click "سوال قبلی"
    const prevBtn = screen.getAllByText("سوال قبلی")[0];
    fireEvent.click(prevBtn);

    // Should return to Question 1
    expect(
      screen.getAllByText("مکانیسم اثر داروهای مهارکننده آنزیم مبدل آنژیوتانسین (ACEIs) چیست؟")[0]
    ).toBeDefined();
  });

  it("opens confirmation modal when clicking پایان آزمون and supports submission", () => {
    const handleExit = vi.fn();
    const handleSubmitSuccess = vi.fn();

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-123"
        questions={mockQuestions}
        onExit={handleExit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );

    // Click "پایان آزمون" in top header
    const finishBtn = screen.getAllByRole("button", { name: /پایان آزمون/ })[0];
    fireEvent.click(finishBtn);

    // Confirmation Modal should appear
    expect(screen.getAllByText("پایان آزمون").length).toBeGreaterThan(0);
    expect(screen.getByText("ثبت و مشاهده نتایج")).toBeDefined();
    expect(screen.getByText("بازگشت به آزمون")).toBeDefined();

    // Click "بازگشت به آزمون" -> dismiss modal
    const backBtn = screen.getByText("بازگشت به آزمون");
    fireEvent.click(backBtn);

    expect(screen.queryByText("ثبت و مشاهده نتایج")).toBeNull();
  });

  it("opens AI Mentor inline within Question Card without modal overlay and toggles CTA", () => {
    const handleExit = vi.fn();
    const handleSubmitSuccess = vi.fn();

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-123"
        questions={mockQuestions}
        onExit={handleExit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );

    // Initial state: mentor is closed, CTA says "راهنمایی از منتور هوشمند"
    const mentorBtn = screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ });
    expect(mentorBtn).toBeInTheDocument();
    expect(document.getElementById("ai-mentor-overlay")).toBeNull();
    expect(screen.queryByText("تحلیل هوشمند آوانا")).toBeNull();

    // Click CTA to open Popover mentor
    fireEvent.click(mentorBtn);

    // AI Mentor renders as an anchored Popover dialog with a gentle backdrop blur
    expect(document.getElementById("ai-mentor-overlay")).toBeNull();
    const popoverDialog = screen.getByRole("dialog", { name: "راهنمای منتور هوشمند" });
    expect(popoverDialog).toBeInTheDocument();
    expect(popoverDialog).toHaveClass("sm:w-[560px]");
    expect(popoverDialog).toHaveClass("sm:h-[650px]");
    expect(screen.getByText("تحلیل هوشمند آوانا")).toBeDefined();
    expect(screen.getByText("راهنمای مفهومی سوال:")).toBeDefined();
    expect(screen.queryByText(/راهنمای آموزشی سوال/)).toBeNull();

    // Verify gentle backdrop blur overlay exists behind popup
    const backdrop = document.querySelector(".backdrop-blur-sm");
    expect(backdrop).toBeInTheDocument();
    expect(backdrop).toHaveClass("fixed");
    expect(backdrop).toHaveClass("inset-0");

    // Verify static unwanted sentence is completely absent
    expect(
      screen.queryByText(/به تعاریف پایه، مکانیسم‌های دارویی\/پاتوفیزیولوژی و تفاوت‌های اختصاصی هر گزینه با سایرین دقت فرمایید/),
    ).toBeNull();

    // Question Card and choices remain intact in the document in the background
    expect(screen.getAllByText("مهار گیرنده‌های آلفا-۱ آدرنرژیک")[0]).toBeInTheDocument();

    // CTA flips to "بستن راهنمایی"
    expect(screen.getByRole("button", { name: /بستن راهنمایی/ })).toBeInTheDocument();

    // When question has no keyPoint, "نکته کلیدی" is NOT rendered
    expect(screen.queryByText("نکته کلیدی:")).toBeNull();
    expect(screen.queryByText(/تخصص فارماکولوژی و پزشکی/)).toBeNull();

    // Clicking the backdrop dismisses the popup
    fireEvent.click(backdrop!);
    expect(screen.queryByRole("dialog", { name: "راهنمای منتور هوشمند" })).toBeNull();

    // Clicking CTA again toggles it open
    fireEvent.click(screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ }));
    expect(screen.getByRole("dialog", { name: "راهنمای منتور هوشمند" })).toBeInTheDocument();

    // Dismiss AI Mentor using the "متوجه شدم" button
    const gotItBtn = screen.getByText("متوجه شدم");
    fireEvent.click(gotItBtn);

    expect(screen.queryByText("تحلیل هوشمند آوانا")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "راهنمای منتور هوشمند" })).toBeNull();
    // CTA reverts back to "راهنمایی از منتور هوشمند"
    expect(screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ })).toBeInTheDocument();

    // Clicking CTA again toggles it open and clicking outside closes it
    fireEvent.click(screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ }));
    expect(screen.getByRole("dialog", { name: "راهنمای منتور هوشمند" })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog", { name: "راهنمای منتور هوشمند" })).toBeNull();

    // Opening and pressing Escape key closes it
    fireEvent.click(screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ }));
    expect(screen.getByRole("dialog", { name: "راهنمای منتور هوشمند" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "راهنمای منتور هوشمند" })).toBeNull();
  });

  it("renders keyPoint in Smart Mentor only when question explicitly provides keyPoint data", () => {
    const questionsWithKeyPoint = [
      {
        ...mockQuestions[0],
        keyPoint: "مهار ACE باعث افزایش برادی‌کینین و کاهش بازسازی قلبی می‌شود.",
      },
    ];

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-123"
        questions={questionsWithKeyPoint}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    const mentorBtn = screen.getAllByText("راهنمایی از منتور هوشمند")[0];
    fireEvent.click(mentorBtn);

    expect(screen.getByText("تحلیل هوشمند آوانا")).toBeDefined();
    expect(screen.getByText("نکته کلیدی:")).toBeDefined();
    expect(screen.getByText("مهار ACE باعث افزایش برادی‌کینین و کاهش بازسازی قلبی می‌شود.")).toBeDefined();
    // Generic text must NOT be present
    expect(screen.queryByText(/تخصص فارماکولوژی و پزشکی/)).toBeNull();
  });

  it("provides independent controlled disclosure for question source without rendering lesson title by default", () => {
    const questionsWithSources = [
      {
        id: "q-src-1",
        question: "سوال اول تست منبع؟",
        choices: ["الف", "ب"],
        topic: "جلسه ۱: فیزیولوژی آدرنال",
      },
      {
        id: "q-src-2",
        question: "سوال دوم تست منبع؟",
        choices: ["ج", "د"],
        topic: "جلسه ۲: فارماکولوژی کورتیکواستروئیدها",
      },
    ];

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-123"
        questions={questionsWithSources}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    // 1. Initially, lesson titles must NOT be in the DOM
    expect(screen.queryByText("منبع: جلسه ۱: فیزیولوژی آدرنال")).toBeNull();
    expect(screen.queryByText("منبع: جلسه ۲: فارماکوکینتیک")).toBeNull();
    expect(screen.getByText("نمایش منبع سوال")).toBeDefined();

    // 2. Click "نمایش منبع سوال" for Question 1
    const toggleBtn = screen.getByRole("button", { name: /نمایش منبع سوال/ });
    fireEvent.click(toggleBtn);

    // 3. Source for Question 1 is now rendered
    expect(screen.getByText(/منبع: جلسه ۱: فیزیولوژی آدرنال/)).toBeDefined();
    expect(screen.getByText("مخفی کردن")).toBeDefined();

    // 4. Click "سوال بعدی" -> Question 2
    const nextBtn = screen.getByRole("button", { name: /سوال بعدی/ });
    fireEvent.click(nextBtn);

    // 5. Question 2's source must be independent and NOT revealed by default
    expect(screen.queryByText(/منبع: جلسه ۲/)).toBeNull();
    expect(screen.getByText("نمایش منبع سوال")).toBeDefined();

    // 6. Click "سوال قبلی" -> returns to Question 1, its revealed state is preserved
    const prevBtn = screen.getByRole("button", { name: /سوال قبلی/ });
    fireEvent.click(prevBtn);
    expect(screen.getByText(/منبع: جلسه ۱: فیزیولوژی آدرنال/)).toBeDefined();

    // 7. Click "مخفی کردن" -> hides Question 1 source
    const hideBtn = screen.getByRole("button", { name: /مخفی کردن/ });
    fireEvent.click(hideBtn);
    expect(screen.queryByText(/منبع: جلسه ۱: فیزیولوژی آدرنال/)).toBeNull();
    expect(screen.getByText("نمایش منبع سوال")).toBeDefined();
  });

  it("renders Course -> Module hierarchy via coverage and suppresses lesson titles and UUIDs", () => {
    const handleExit = vi.fn();
    const handleSubmitSuccess = vi.fn();

    const mockCoverage = [
      {
        id: "course-pharma-2",
        title: "فارماکولوژی ۲",
        questionCount: 2,
        modules: [
          {
            id: "mod-corticosteroids",
            title: "داروهای کورتیکواستروئیدی",
            questionCount: 2,
          },
        ],
      },
    ];

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-123"
        questions={mockQuestions}
        coverage={mockCoverage}
        onExit={handleExit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );

    // 1. Assert Course is rendered and collapsed by default
    expect(screen.getByText("فارماکولوژی ۲")).toBeDefined();
    expect(screen.queryByText("داروهای کورتیکواستروئیدی")).toBeNull();

    // 2. Click Course toggle button to expand
    const courseBtn = screen.getByRole("button", { name: /نمایش فصل‌های دوره فارماکولوژی ۲/ });
    fireEvent.click(courseBtn);

    // 3. Module title is now displayed
    expect(screen.getByText("داروهای کورتیکواستروئیدی")).toBeDefined();

    // 4. Strictly assert that NO Lesson title or "جلسه" appears anywhere
    expect(screen.queryByText(/جلسه/)).toBeNull();
  });

  it("filters out UUIDs and lesson titles from polluted backend topic string and renders clean fallback", () => {
    const handleExit = vi.fn();
    const handleSubmitSuccess = vi.fn();

    const pollutedTopicString =
      "93b501bf-dc27-4056-9c95-6d6639cc630a, جلسه ۱: مبانی فیزیولوژیک و محور آدرنال (HPA Axis), 4326da85-03c2-4ade-bc56-d4da7f304e9a, جلسه ۲: فارماکوکینتیک و مکانیسم سلولی و مولکولی گلوکوکورتیکوئیدها, 13fffea7-a743-4786-91ed-45b36671eca4";

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-123"
        questions={mockQuestions}
        topicName={pollutedTopicString}
        onExit={handleExit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );

    // 1. Assert that NO UUID appears anywhere in the rendered HTML
    expect(screen.queryByText(/93b501bf/)).toBeNull();
    expect(screen.queryByText(/4326da85/)).toBeNull();
    expect(screen.queryByText(/13fffea7/)).toBeNull();

    // 2. Assert breadcrumb root and arrow are present
    expect(screen.getByText("آزمون")).toBeDefined();
    expect(screen.getByText("←")).toBeDefined();

    // 3. Assert clean safe fallback is rendered and lesson names are strictly suppressed
    expect(screen.getByText("آزمون جامع")).toBeDefined();
    expect(screen.queryByText(/جلسه/)).toBeNull();
  });

  it("handles a lone UUID by not leaking it and falling back to clean default", () => {
    const handleExit = vi.fn();
    const handleSubmitSuccess = vi.fn();

    const loneUuid = "93b501bf-dc27-4056-9c95-6d6639cc630a";

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-123"
        questions={mockQuestions}
        topicName={loneUuid}
        onExit={handleExit}
        onSubmitSuccess={handleSubmitSuccess}
      />
    );

    // Assert that the UUID is never rendered in the document
    expect(screen.queryByText(/93b501bf/)).toBeNull();

    // Assert clean fallback is displayed
    expect(screen.getByText("آزمون جامع")).toBeDefined();
  });

  it("renders Lesson and Chapter in question source disclosure when question provides hierarchy", () => {
    const questionWithHierarchy = [
      {
        id: "q-hier-1",
        question: "داروی انتخابی در جذب سریع چیست؟",
        choices: ["گزینه الف", "گزینه ب"],
        lesson: {
          id: "les-101",
          title: "جذب داروها",
        },
        chapter: {
          id: "mod-201",
          title: "فارماکوکینتیک",
        },
      },
    ];

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-123"
        questions={questionWithHierarchy}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    // Initial state: hidden
    expect(screen.queryByText(/منبع:/)).toBeNull();
    const toggleBtn = screen.getByRole("button", { name: /نمایش منبع سوال/ });
    fireEvent.click(toggleBtn);

    // Source revealed with Chapter — Lesson
    expect(screen.getByText("منبع: فارماکوکینتیک — جذب داروها")).toBeDefined();
  });

  it("renders fallback درس: نامشخص when question has neither lesson nor topic", () => {
    const questionWithoutSource = [
      {
        id: "q-no-src-1",
        question: "سوال بدون منبع مشخص؟",
        choices: ["الف", "ب"],
      },
    ];

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-123"
        questions={questionWithoutSource}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    const toggleBtn = screen.getByRole("button", { name: /نمایش منبع سوال/ });
    fireEvent.click(toggleBtn);

    expect(screen.getByText("منبع: درس نامشخص")).toBeDefined();
  });

  it("mentor popup in single-chapter exam displays only lesson title without chapter name", () => {
    const singleChapterQuestions = [
      {
        id: "q-single-ch-1",
        question: "آیا این سوال تک‌فصلی است؟",
        choices: ["بله", "خیر"],
        lesson: {
          id: "les-hpa-1",
          title: "جلسه ۲: اثرات ارگانی هیستامین و مسمومیت ماهی اسکومبرید",
        },
        chapter: {
          id: "chap-antihistamine",
          title: "فصل ۲: آنتی‌هیستامین‌ها",
        },
      },
    ];

    const singleChapterCoverage = [
      {
        id: "crs-1",
        title: "فارماکولوژی",
        questionCount: 1,
        modules: [
          {
            id: "chap-antihistamine",
            title: "فصل ۲: آنتی‌هیستامین‌ها",
            questionCount: 1,
          },
        ],
      },
    ];

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-123"
        questions={singleChapterQuestions}
        coverage={singleChapterCoverage}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    // Open mentor popup
    const mentorBtn = screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ });
    fireEvent.click(mentorBtn);

    // Assert subtitle under header is NOT rendered
    expect(screen.queryByText(/راهنمای آموزشی سوال/)).toBeNull();

    // Assert single-chapter format: only lesson title is rendered
    expect(
      screen.getByText("جلسه ۲: اثرات ارگانی هیستامین و مسمومیت ماهی اسکومبرید"),
    ).toBeInTheDocument();
    expect(screen.getByText(/مستند به محتوای آموزشی درسنامه/)).toBeInTheDocument();

    // Chapter name must NOT be rendered in conceptual guidance
    expect(screen.queryByText("فصل ۲: آنتی‌هیستامین‌ها")).toBeNull();
  });

  it("mentor popup in multi-chapter exam displays chapter and lesson title in compact format", () => {
    const multiChapterQuestions = [
      {
        id: "q-multi-ch-1",
        question: "سوال فصل اول؟",
        choices: ["الف", "ب"],
        lesson: {
          id: "les-1",
          title: "جلسه ۱: مبانی هیستامین",
        },
        chapter: {
          id: "chap-1",
          title: "فصل ۱: مبانی اتوکوییدها",
        },
      },
      {
        id: "q-multi-ch-2",
        question: "سوال فصل دوم؟",
        choices: ["ج", "د"],
        lesson: {
          id: "les-2",
          title: "جلسه ۲: اثرات ارگانی هیستامین و مسمومیت ماهی اسکومبرید",
        },
        chapter: {
          id: "chap-2",
          title: "فصل ۲: آنتی‌هیستامین‌ها",
        },
      },
    ];

    const multiChapterCoverage = [
      {
        id: "crs-1",
        title: "فارماکولوژی",
        questionCount: 2,
        modules: [
          { id: "chap-1", title: "فصل ۱: مبانی اتوکوییدها", questionCount: 1 },
          { id: "chap-2", title: "فصل ۲: آنتی‌هیستامین‌ها", questionCount: 1 },
        ],
      },
    ];

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-123"
        questions={multiChapterQuestions}
        coverage={multiChapterCoverage}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    // Open mentor popup for question 1
    const mentorBtn = screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ });
    fireEvent.click(mentorBtn);

    // Assert subtitle under header is NOT rendered
    expect(screen.queryByText(/راهنمای آموزشی سوال/)).toBeNull();

    // Assert multi-chapter format: chapter • lesson is rendered
    const guidanceP = screen.getByText(/این سوال مربوط به/);
    expect(guidanceP).toHaveTextContent(
      "این سوال مربوط به فصل ۱: مبانی اتوکوییدها • درس: جلسه ۱: مبانی هیستامین (مستند به محتوای آموزشی درسنامه) است."
    );
    expect(screen.getByText("فصل ۱: مبانی اتوکوییدها")).toBeInTheDocument();
    expect(screen.getByText(/• درس:/)).toBeInTheDocument();
    expect(screen.getByText("جلسه ۱: مبانی هیستامین")).toBeInTheDocument();
    expect(screen.getByText(/مستند به محتوای آموزشی درسنامه/)).toBeInTheDocument();
  });

  it("persists mentor conversation across popup close/open and does not trigger duplicate generation", async () => {
    let askCallCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/v1/ai/ask")) {
        askCallCount++;
        return {
          ok: true,
          status: 200,
          text: () =>
            Promise.resolve(
              JSON.stringify({
                request_id: "req-persist-1",
                answer: "پاسخ ذخیره‌شده منتور برای سوال اول",
                conversationId: "conv-persist-1",
              })
            ),
        } as Response;
      }
      return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
    });

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-123"
        questions={mockQuestions}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    // 1. First open: triggers initial guidance generation
    const mentorBtn = screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ });
    fireEvent.click(mentorBtn);

    await waitFor(() => {
      expect(screen.getByText("پاسخ ذخیره‌شده منتور برای سوال اول")).toBeInTheDocument();
    });
    expect(askCallCount).toBe(1);

    // 2. Close popup
    const closeBtn = screen.getByRole("button", { name: /بستن راهنمایی/ });
    fireEvent.click(closeBtn);
    expect(screen.queryByRole("dialog", { name: "راهنمای منتور هوشمند" })).toBeNull();

    // 3. Re-open popup on the same question: immediately restores message, does NOT call /v1/ai/ask again
    fireEvent.click(screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ }));
    expect(screen.getByRole("dialog", { name: "راهنمای منتور هوشمند" })).toBeInTheDocument();
    expect(screen.getByText("پاسخ ذخیره‌شده منتور برای سوال اول")).toBeInTheDocument();
    expect(askCallCount).toBe(1);

    // 4. Toggle open and closed 3 more times: call count remains strictly 1
    const gotItBtn = screen.getByText("متوجه شدم");
    fireEvent.click(gotItBtn);
    expect(screen.queryByRole("dialog", { name: "راهنمای منتور هوشمند" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ }));
    expect(screen.getByText("پاسخ ذخیره‌شده منتور برای سوال اول")).toBeInTheDocument();
    expect(askCallCount).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: /بستن راهنمایی/ }));
    fireEvent.click(screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ }));
    expect(screen.getByText("پاسخ ذخیره‌شده منتور برای سوال اول")).toBeInTheDocument();
    expect(askCallCount).toBe(1);
  });

  it("isolates mentor conversations per question.id and restores history when navigating back", async () => {
    let askCallCount = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
      if (!String(url).includes("/v1/ai/ask")) {
        return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
      }
      askCallCount++;
      const body = options?.body ? JSON.parse(options.body as string) : {};
      const isQ2 = body.message?.includes("بتابلاکر");
      return {
        ok: true,
        status: 200,
        text: () =>
          Promise.resolve(
            JSON.stringify({
              request_id: isQ2 ? "req-q2" : "req-q1",
              answer: isQ2 ? "پاسخ منتور برای سوال دوم بتابلاکرها" : "پاسخ منتور برای سوال اول آنژیوتانسین",
              conversationId: isQ2 ? "conv-q2" : "conv-q1",
            })
          ),
      } as Response;
    });

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-123"
        questions={mockQuestions}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    // 1. Open mentor on Question 1 (ACEIs)
    const mentorBtn1 = screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ });
    fireEvent.click(mentorBtn1);

    await waitFor(() => {
      expect(screen.getByText("پاسخ منتور برای سوال اول آنژیوتانسین")).toBeInTheDocument();
    });
    expect(askCallCount).toBe(1);

    // Close mentor
    fireEvent.click(screen.getByRole("button", { name: /بستن راهنمایی/ }));

    // 2. Navigate to Question 2 (Beta blockers)
    const nextBtn = screen.getByRole("button", { name: /سوال بعدی/ });
    fireEvent.click(nextBtn);

    // 3. Open mentor on Question 2
    const mentorBtn2 = screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ });
    fireEvent.click(mentorBtn2);

    // Assert Question 2 does NOT have Question 1's answer
    expect(screen.queryByText("پاسخ منتور برای سوال اول آنژیوتانسین")).toBeNull();

    await waitFor(() => {
      expect(screen.getByText("پاسخ منتور برای سوال دوم بتابلاکرها")).toBeInTheDocument();
    });
    expect(askCallCount).toBe(2);

    // Close mentor on Question 2
    fireEvent.click(screen.getByRole("button", { name: /بستن راهنمایی/ }));

    // 4. Navigate back to Question 1
    const prevBtn = screen.getByRole("button", { name: /سوال قبلی/ });
    fireEvent.click(prevBtn);

    // 5. Open mentor on Question 1 -> immediately restores Question 1's conversation with NO new request!
    fireEvent.click(screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ }));
    expect(screen.getByText("پاسخ منتور برای سوال اول آنژیوتانسین")).toBeInTheDocument();
    expect(screen.queryByText("پاسخ منتور برای سوال دوم بتابلاکرها")).toBeNull();
    // Fetch count must remain strictly 2!
    expect(askCallCount).toBe(2);
  });

  it("handles closing popup while request is in-flight and preserves completed response upon reopening without duplicate request", async () => {
    let resolveAskPromise: (val: Response) => void;
    let askCallCount = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/v1/ai/ask")) {
        askCallCount++;
        return new Promise<Response>((resolve) => {
          resolveAskPromise = resolve;
        });
      }
      return { ok: true, status: 200, text: () => Promise.resolve("{}") } as Response;
    });

    render(
      <ExamTakingView
        organizationId="test-org"
        attemptId="att-123"
        questions={mockQuestions}
        onExit={vi.fn()}
        onSubmitSuccess={vi.fn()}
      />
    );

    // 1. Open mentor: request starts in background
    fireEvent.click(screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ }));
    expect(screen.getByText(/آوانا در حال اندیشیدن/i)).toBeInTheDocument();
    expect(askCallCount).toBe(1);

    // 2. Close popup while request is still pending
    fireEvent.click(screen.getByRole("button", { name: /بستن راهنمایی/ }));
    expect(screen.queryByRole("dialog")).toBeNull();

    // 3. Request finishes in background
    resolveAskPromise!({
      ok: true,
      status: 200,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            request_id: "req-async-1",
            answer: "پاسخ کامل‌شده بعد از بسته بودن پاپ‌آپ",
            conversationId: "conv-async-1",
          })
        ),
    } as Response);

    // 4. Reopen popup: completed answer is immediately rendered with NO new request
    fireEvent.click(screen.getByRole("button", { name: /راهنمایی از منتور هوشمند/ }));
    await waitFor(() => {
      expect(screen.getByText("پاسخ کامل‌شده بعد از بسته بودن پاپ‌آپ")).toBeInTheDocument();
    });
    expect(askCallCount).toBe(1);
  });
});
