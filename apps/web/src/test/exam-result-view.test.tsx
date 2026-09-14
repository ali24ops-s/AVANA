import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ExamResultView, type ExamResultViewProps } from "../components/quiz/ExamResultView.js";

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("ExamResultView Component", () => {
  const mockQuestions = [
    {
      id: "q-1",
      question: "مکانیسم اثر انالاپریل چیست؟",
      choices: ["مهار ACE", "بلوک بتا", "دیورتیک", "بلوک کلسیم"],
      correctAnswer: "مهار ACE",
      explanation: "انالاپریل مانع تبدیل آنژیوتانسین ۱ به ۲ می‌شود.",
      topic: "داروشناسی",
      course: { id: "crs-pharma", title: "دوره جامع داروشناسی" },
      lesson: { id: "les-ace", title: "مهارکننده‌های ACE" },
      chapter: { id: "chap-cvs", title: "قلب و عروق" },
    },
    {
      id: "q-2",
      question: "کدام دارو استاتین است؟",
      choices: ["آتورواستاتین", "لوزارتان", "متفورمین", "وارفارین"],
      correctAnswer: "آتورواستاتین",
      explanation: "آتورواستاتین مهارکننده HMG-CoA ردوکتاز است.",
      topic: "قلب و عروق",
      course: { id: "crs-pharma", title: "دوره جامع داروشناسی" },
      lesson: { id: "les-lipids", title: "داروهای چربی خون" },
      chapter: { id: "chap-cvs", title: "قلب و عروق" },
    },
    {
      id: "q-3",
      question: "داروی انتخابی در آسم حاد چیست؟",
      choices: ["سالبوتامول", "پروپرانولول", "آسپرین", "مورفین"],
      correctAnswer: "سالبوتامول",
      explanation: "سالبوتامول آگونیست بتا-۲ سریع‌الاثر است.",
      topic: "ریه",
      // No course/lesson ID to test fallback without fake link
    },
    {
      id: "q-4",
      question: "کدام موارد جزو بتابلاکرها هستند؟",
      choices: ["متوپرولول", "آتنولول", "آملودیپین", "کاپتوپریل"],
      correctAnswer: ["متوپرولول", "آتنولول"],
      explanation: "متوپرولول و آتنولول بتابلاکر هستند.",
      topic: "داروشناسی",
      course: { id: "crs-pharma", title: "دوره جامع داروشناسی" },
      lesson: { id: "les-beta", title: "مسدودکننده‌های بتا" },
      chapter: { id: "chap-cvs", title: "قلب و عروق" },
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
      "q-1": "مهار ACE", // correct (داروشناسی)
      "q-2": "متفورمین", // incorrect (قلب و عروق)
      // q-3: unanswered (ریه)
      "q-4": ["متوپرولول", "آتنولول"], // multi-select correct (داروشناسی)
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
    renderWithRouter(
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
    renderWithRouter(
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
    renderWithRouter(
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

    renderWithRouter(
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

    const { rerender } = renderWithRouter(
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
      <MemoryRouter>
        <ExamResultView
          result={mockResult}
          onRetry={handleRetry}
          onReturnToConfig={handleReturnToConfig}
          isRetrying={true}
        />
      </MemoryRouter>
    );

    const disabledRetakeBtn = screen.getByRole("button", { name: /شرکت مجدد در آزمون/ });
    expect(disabledRetakeBtn.getAttribute("disabled")).not.toBeNull();
  });

  it("renders weaknesses and strengths in separate structured rows with canonical study links", () => {
    renderWithRouter(
      <ExamResultView
        result={mockResult}
        onRetry={vi.fn()}
        onReturnToConfig={vi.fn()}
      />
    );

    // Weaknesses header
    expect(screen.getByText(/مباحث نیازمند مرور و تقویت:/)).toBeDefined();

    // Weakness topic: "قلب و عروق" (0% score) should be in weaknesses list
    const weaknessLinks = screen.getAllByRole("link", { name: /قلب و عروق/ });
    expect(weaknessLinks.length).toBeGreaterThanOrEqual(1);
    expect(weaknessLinks[0].getAttribute("href")).toBe("/courses/crs-pharma?lessonId=les-lipids");

    // Weakness topic "ریه" (0% score) has no course/lesson metadata, should display text without fake link
    expect(screen.getAllByText("ریه").length).toBeGreaterThanOrEqual(1);

    // Strengths header
    expect(screen.getByText(/نقاط قوت و تسلط بالا:/)).toBeDefined();

    // Strength topic "داروشناسی" (100% score)
    const strengthLinks = screen.getAllByRole("link", { name: /داروشناسی/ });
    expect(strengthLinks.length).toBeGreaterThanOrEqual(1);
    expect(strengthLinks[0].getAttribute("href")).toBe("/courses/crs-pharma?lessonId=les-beta");
  });

  it("renders unanswered questions with distinct warning style and help icon badge", () => {
    renderWithRouter(
      <ExamResultView
        result={mockResult}
        onRetry={vi.fn()}
        onReturnToConfig={vi.fn()}
      />
    );

    // Unanswered badge on Q3 review card
    const unansweredBadges = screen.getAllByText("بدون پاسخ");
    expect(unansweredBadges.length).toBeGreaterThanOrEqual(2);

    // Informational alert for unanswered question is rendered
    expect(
      screen.getByText(/شما در زمان برگزاری آزمون به این سوال پاسخ نداده‌اید/)
    ).toBeDefined();
  });

  it("renders redesigned topic breakdown sorted ascending (weakest to strongest) with granular stats", () => {
    renderWithRouter(
      <ExamResultView
        result={mockResult}
        onRetry={vi.fn()}
        onReturnToConfig={vi.fn()}
      />
    );

    // Section title
    expect(screen.getByText("عملکرد به تفکیک مباحث آزمون")).toBeDefined();

    // Breakdown should show granular counters
    expect(screen.getByText("۲ درست")).toBeDefined(); // داروشناسی has 2 correct
    expect(screen.getByText("۱ غلط")).toBeDefined(); // قلب و عروق has 1 incorrect
    expect(screen.getByText("۱ بدون پاسخ")).toBeDefined(); // ریه has 1 unanswered

    // Status badges in topic cards
    expect(screen.getByText("تسلط مطلوب")).toBeDefined(); // داروشناسی (100%)
    expect(screen.getAllByText("نیازمند تمرکز").length).toBe(2); // قلب و عروق (0%) & ریه (0%)

    // Quick study link in topic card
    const studySessionLinks = screen.getAllByRole("link", { name: /مطالعه جلسه/ });
    expect(studySessionLinks.length).toBeGreaterThanOrEqual(1);
  });

  it("sanitizes internal identifiers from topic breakdown and falls back to clean lesson/chapter title", () => {
    const resultWithRawIds: ExamResultViewProps["result"] = {
      score: 50,
      total: 2,
      correct: 1,
      passed: false,
      questions: [
        {
          id: "q-id-1",
          question: "سوال تست با شناسه داخلی",
          choices: ["گزینه ۱", "گزینه ۲"],
          correctAnswer: "گزینه ۱",
          topic: "les-99887766-5544-3322-1100-aabbccddeeff", // Internal ID / UUID
          lesson: { id: "les-real", title: "متابولیسم کبدی" },
          chapter: { id: "chap-real", title: "فارماکوکینتیک بالینی" },
          course: { id: "crs-real", title: "فارماکولوژی" },
        },
        {
          id: "q-id-2",
          question: "سوال دوم بدون نام درس",
          choices: ["گزینه الف", "گزینه ب"],
          correctAnswer: "گزینه الف",
          topic: "course-12345678", // Internal ID prefix
        },
      ],
      answers: {
        "q-id-1": "گزینه ۱", // correct
        "q-id-2": "گزینه ب", // incorrect
      },
      questionResults: {
        "q-id-1": { status: "correct", scoreRatio: 1, selectedValues: ["گزینه ۱"], correctValues: ["گزینه ۱"] },
        "q-id-2": { status: "incorrect", scoreRatio: 0, selectedValues: ["گزینه ب"], correctValues: ["گزینه الف"] },
      },
    };

    renderWithRouter(
      <ExamResultView
        result={resultWithRawIds}
        onRetry={vi.fn()}
        onReturnToConfig={vi.fn()}
      />
    );

    // Should NOT show internal IDs in UI
    expect(screen.queryByText("les-99887766-5544-3322-1100-aabbccddeeff")).toBeNull();
    expect(screen.queryByText("course-12345678")).toBeNull();

    // Should fall back to clean lesson title "متابولیسم کبدی" and "مباحث جامع"
    expect(screen.getAllByText("متابولیسم کبدی").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("مباحث جامع").length).toBeGreaterThanOrEqual(1);
  });
});
