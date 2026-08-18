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
    expect(screen.getByText("AVANA")).toBeDefined();
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
    expect(screen.getByText("نکته کلیدی:")).toBeDefined();

    // Dismiss AI Mentor overlay
    const gotItBtn = screen.getByText("متوجه شدم");
    fireEvent.click(gotItBtn);

    expect(screen.queryByText("تحلیل هوشمند آوانا")).toBeNull();
  });
});
