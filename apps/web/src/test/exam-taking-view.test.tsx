import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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

  it("opens AI Mentor overlay modal when clicking راهنمایی از منتور هوشمند", () => {
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

    const mentorBtn = screen.getAllByText("راهنمایی از منتور هوشمند")[0];
    fireEvent.click(mentorBtn);

    // AI Mentor overlay should render
    expect(screen.getByText("تحلیل هوشمند آوانا")).toBeDefined();
    expect(screen.getByText("راهنمای مفهومی سوال:")).toBeDefined();
    // When question has no keyPoint, "نکته کلیدی" is NOT rendered
    expect(screen.queryByText("نکته کلیدی:")).toBeNull();
    expect(screen.queryByText(/تخصص فارماکولوژی و پزشکی/)).toBeNull();

    // Dismiss AI Mentor overlay
    const gotItBtn = screen.getByText("متوجه شدم");
    fireEvent.click(gotItBtn);

    expect(screen.queryByText("تحلیل هوشمند آوانا")).toBeNull();
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
});
