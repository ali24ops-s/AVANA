import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExamResultView, type ExamResultViewProps } from "../components/quiz/ExamResultView.js";

describe("ExamResultView Component", () => {
  const mockQuestions = [
    {
      id: "q-1",
      question: "مکانیسم اثر انالاپریل چیست؟",
      choices: ["مهار ACE", "بلوک بتا", "دیورتیک", "بلوک کلسیم"],
      correctAnswer: "مهار ACE",
      explanation: "انالاپریل مانع تبدیل آنژیوتانسین ۱ به ۲ می‌شود.",
      topic: "داروشناسی",
    },
    {
      id: "q-2",
      question: "کدام دارو استاتین است؟",
      choices: ["آتورواستاتین", "لوزارتان", "متفورمین", "وارفارین"],
      correctAnswer: "آتورواستاتین",
      explanation: "آتورواستاتین مهارکننده HMG-CoA ردوکتاز است.",
      topic: "قلب و عروق",
    },
    {
      id: "q-3",
      question: "داروی انتخابی در آسم حاد چیست؟",
      choices: ["سالبوتامول", "پروپرانولول", "آسپرین", "مورفین"],
      correctAnswer: "سالبوتامول",
      explanation: "سالبوتامول آگونیست بتا-۲ سریع‌الاثر است.",
      topic: "ریه",
    },
    {
      id: "q-4",
      question: "کدام موارد جزو بتابلاکرها هستند؟",
      choices: ["متوپرولول", "آتنولول", "آملودیپین", "کاپتوپریل"],
      correctAnswer: ["متوپرولول", "آتنولول"],
      explanation: "متوپرولول و آتنولول بتابلاکر هستند.",
      topic: "داروشناسی",
    },
  ];

  const mockResult: ExamResultViewProps["result"] = {
    attemptId: "att-test-1",
    score: 62.5,
    total: 4,
    correct: 2,
    incorrect: 1,
    unanswered: 1,
    partial: 0,
    passed: true,
    completedAt: "2026-09-11T12:00:00.000Z",
    answers: {
      "q-1": "مهار ACE", // correct
      "q-2": "متفورمین", // incorrect
      // q-3: unanswered
      "q-4": ["متوپرولول", "آتنولول"], // multi-select correct
    },
    questionResults: {
      "q-1": {
        status: "correct",
        scoreRatio: 1,
        selectedValues: ["مهار ACE"],
        correctValues: ["مهار ACE"],
      },
      "q-2": {
        status: "incorrect",
        scoreRatio: 0,
        selectedValues: ["متفورمین"],
        correctValues: ["آتورواستاتین"],
      },
      "q-3": {
        status: "unanswered",
        scoreRatio: 0,
        selectedValues: [],
        correctValues: ["سالبوتامول"],
      },
      "q-4": {
        status: "correct",
        scoreRatio: 1,
        selectedValues: ["متوپرولول", "آتنولول"],
        correctValues: ["متوپرولول", "آتنولول"],
      },
    },
    questions: mockQuestions,
  };

  it("renders 4-metric score overview and canonical status badges", () => {
    render(
      <ExamResultView
        result={mockResult}
        onRetry={vi.fn()}
        onReturnToConfig={vi.fn()}
      />
    );

    // Question status badges & metric tiles
    expect(screen.getAllByText("پاسخ صحیح").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("پاسخ نادرست").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("بدون پاسخ").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("کل سوالات")).toBeDefined();
  });

  it("renders distinct choice labels: پاسخ صحیح شما, پاسخ شما (نادرست), and پاسخ صحیح", () => {
    render(
      <ExamResultView
        result={mockResult}
        onRetry={vi.fn()}
        onReturnToConfig={vi.fn()}
      />
    );

    // Q1 (correct selection)
    expect(screen.getAllByText("پاسخ صحیح شما").length).toBeGreaterThanOrEqual(1);

    // Q2 (wrong selection)
    expect(screen.getByText("پاسخ شما (نادرست)")).toBeDefined();

    // Q2 (revealed correct answer)
    expect(screen.getAllByText("پاسخ صحیح").length).toBeGreaterThanOrEqual(1);

    // Explanations are shown
    expect(screen.getByText(/انالاپریل مانع تبدیل آنژیوتانسین ۱ به ۲ می‌شود/)).toBeDefined();
    expect(screen.getByText(/آتورواستاتین مهارکننده HMG-CoA ردوکتاز است/)).toBeDefined();
  });

  it("filters questions when clicking review filter tab", () => {
    render(
      <ExamResultView
        result={mockResult}
        onRetry={vi.fn()}
        onReturnToConfig={vi.fn()}
      />
    );

    // Click filter button for "نیازمند مرور (2)"
    const needsReviewBtn = screen.getByRole("button", { name: /نیازمند مرور/ });
    fireEvent.click(needsReviewBtn);

    // Q2 (incorrect) should be visible
    expect(screen.getByText("کدام دارو استاتین است؟")).toBeDefined();
  });
});
