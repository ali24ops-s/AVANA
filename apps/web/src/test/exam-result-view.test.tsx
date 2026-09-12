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

  it("renders Lesson and Chapter hierarchy badges and fallback on question review cards", () => {
    const resultWithHierarchy: ExamResultViewProps["result"] = {
      score: 100,
      total: 3,
      correct: 3,
      passed: true,
      questions: [
        {
          id: "q-hier-1",
          question: "سوال اول با سرفصل و درس؟",
          choices: ["الف", "ب"],
          correctAnswer: "الف",
          lesson: {
            id: "les-1",
            title: "جذب داروها",
          },
          chapter: {
            id: "chap-1",
            title: "فارماکوکینتیک",
          },
        },
        {
          id: "q-hier-2",
          question: "سوال دوم فقط با درس؟",
          choices: ["ج", "د"],
          correctAnswer: "ج",
          lesson: {
            id: "les-2",
            title: "مکانیسم‌های گیرنده‌ای",
          },
        },
        {
          id: "q-hier-3",
          question: "سوال سوم بدون درس؟",
          choices: ["هـ", "و"],
          correctAnswer: "هـ",
        },
      ],
      answers: {
        "q-hier-1": "الف",
        "q-hier-2": "ج",
        "q-hier-3": "هـ",
      },
    };

    render(
      <ExamResultView
        result={resultWithHierarchy}
        onRetry={vi.fn()}
        onReturnToConfig={vi.fn()}
      />
    );

    // Q1: shows Chapter — Lesson
    expect(screen.getByText("درس: فارماکوکینتیک — جذب داروها")).toBeDefined();

    // Q2: shows Lesson only
    expect(screen.getByText("درس: مکانیسم‌های گیرنده‌ای")).toBeDefined();

    // Q3: shows fallback
    expect(screen.getByText("درس: نامشخص")).toBeDefined();
  });

  it("handles retake (شرکت مجدد در آزمون) and return to config actions correctly", () => {
    const handleRetry = vi.fn();
    const handleReturnToConfig = vi.fn();

    const { rerender } = render(
      <ExamResultView
        result={mockResult}
        onRetry={handleRetry}
        onReturnToConfig={handleReturnToConfig}
        isRetrying={false}
      />
    );

    const retakeBtn = screen.getByRole("button", { name: /شرکت مجدد در آزمون/ });
    const returnBtn = screen.getByRole("button", { name: /بازگشت به تنظیمات آزمون/ });

    fireEvent.click(retakeBtn);
    expect(handleRetry).toHaveBeenCalledTimes(1);

    fireEvent.click(returnBtn);
    expect(handleReturnToConfig).toHaveBeenCalledTimes(1);

    // Verify isRetrying disabled/loading state
    rerender(
      <ExamResultView
        result={mockResult}
        onRetry={handleRetry}
        onReturnToConfig={handleReturnToConfig}
        isRetrying={true}
      />
    );

    const disabledRetakeBtn = screen.getByRole("button", { name: /شرکت مجدد در آزمون/ });
    expect(disabledRetakeBtn.getAttribute("disabled")).not.toBeNull();
  });
});
