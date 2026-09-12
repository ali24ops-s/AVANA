import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SpecialExamLibraryCard } from "../components/library/SpecialExamLibraryCard.js";
import type { LibrarySpecialExamItem } from "../lib/api/library.js";

describe("SpecialExamLibraryCard Component UI & Behavior", () => {
  const chapterName = "هورمون‌های جنسی و مهارکننده‌ها (Gonadal Hormones & Inhibitors)";

  const mockChapterExamWithDuplicatePrefix: LibrarySpecialExamItem = {
    id: "exam-special-1",
    productId: "prod-special-1",
    code: "special-exam-chapter-mod-1-25",
    title: `آزمون فصل: فصل: ${chapterName}`,
    description: `آزمون شبیه‌ساز و تخصصی ۲۵ سؤالی از مباحث فصل فصل: ${chapterName}`,
    question_count: 25,
    difficulty: "medium",
    scope: {
      courseId: "course-1",
      moduleId: "mod-1",
      topics: [`فصل: ${chapterName}`],
    },
    blueprint: [{ name: chapterName, count: 25 }],
    price: 12500,
    currency: "toman",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it("normalizes 'فصل: فصل:' so it never appears anywhere in the card", () => {
    render(<SpecialExamLibraryCard exam={mockChapterExamWithDuplicatePrefix} />);

    // 1. "فصل: فصل:" must not exist in any part of the DOM
    expect(screen.queryByText(/فصل:\s*فصل:/)).toBeNull();
    const cardContent = document.body.textContent || "";
    expect(cardContent.includes("فصل: فصل:")).toBe(false);
  });

  it("displays the full chapter name EXACTLY ONCE in the entire card (in the title only)", () => {
    render(<SpecialExamLibraryCard exam={mockChapterExamWithDuplicatePrefix} />);

    // Title should have the normalized chapter name once
    const titleEl = screen.getByTestId("special-exam-title");
    expect(titleEl).toHaveTextContent(`آزمون فصل: ${chapterName}`);

    // Description should NOT repeat the chapter name
    const descEl = screen.getByTestId("special-exam-description");
    expect(descEl).toHaveTextContent("آزمون شبیه‌ساز و تخصصی ۲۵ سؤالی از مباحث این فصل");
    expect(descEl.textContent?.includes(chapterName)).toBe(false);

    // Topic badge duplicating chapter name should be omitted
    const allMatchingChapterName = screen.getAllByText((content) => content.includes(chapterName));
    expect(allMatchingChapterName).toHaveLength(1);
  });

  it("normalizes raw chapter title starting with 'فصل:' cleanly", () => {
    const rawChapterExam: LibrarySpecialExamItem = {
      ...mockChapterExamWithDuplicatePrefix,
      title: `فصل: ${chapterName}`,
    };

    render(<SpecialExamLibraryCard exam={rawChapterExam} />);

    const titleEl = screen.getByTestId("special-exam-title");
    expect(titleEl).toHaveTextContent(`آزمون فصل: ${chapterName}`);
    expect(screen.queryByText(/فصل:\s*فصل:/)).toBeNull();
  });

  it("renders the prominent 'آزمون پویا و اختصاصی' guarantee card with all 3 clear points", () => {
    render(<SpecialExamLibraryCard exam={mockChapterExamWithDuplicatePrefix} />);

    const guaranteeCard = screen.getByTestId("special-exam-dynamic-guarantee");
    expect(guaranteeCard).toBeInTheDocument();

    // Section title & badge
    expect(screen.getByText("آزمون پویا و اختصاصی")).toBeInTheDocument();
    expect(screen.getByText("تولید هوشمند")).toBeInTheDocument();

    // 3 Clear bullets as requested by UX specifications
    expect(
      screen.getByText("انتخاب تصادفی و فریز شدن سؤال‌ها برای هر خرید"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("خرید مجدد = آزمون جدید با سؤال‌های تصادفی جدید"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("حفظ نتایج و سوابق آزمون‌های قبلی"),
    ).toBeInTheDocument();
  });

  it("renders comprehensive course exams properly with distinct topic tags", () => {
    const mockCourseExam: LibrarySpecialExamItem = {
      id: "exam-course-1",
      productId: "prod-course-1",
      code: "special-exam-course-pharma-80",
      title: "آزمون ویژه جامع فارماکولوژی ۱",
      description: "آزمون شبیه‌ساز و تخصصی ۸۰ سؤالی از کلیه مباحث دوره فارماکولوژی ۱",
      question_count: 80,
      difficulty: "hard",
      scope: {
        courseId: "course-1",
        topics: ["قلب و عروق", "سیستم عصبی"],
      },
      price: 40000,
      currency: "toman",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    render(<SpecialExamLibraryCard exam={mockCourseExam} />);

    expect(screen.getByTestId("special-exam-title")).toHaveTextContent(
      "آزمون ویژه جامع فارماکولوژی ۱",
    );
    expect(screen.getByTestId("special-exam-description")).toHaveTextContent(
      "آزمون شبیه‌ساز و تخصصی ۸۰ سؤالی از کلیه مباحث این دوره",
    );

    // Non-redundant topics should be displayed
    expect(screen.getByText("قلب و عروق")).toBeInTheDocument();
    expect(screen.getByText("سیستم عصبی")).toBeInTheDocument();
  });

  it("triggers onBuy callback when user clicks 'خرید آزمون'", () => {
    const onBuyMock = vi.fn();
    render(
      <SpecialExamLibraryCard
        exam={mockChapterExamWithDuplicatePrefix}
        onBuy={onBuyMock}
      />,
    );

    const buyBtn = screen.getByTestId(`buy-special-exam-${mockChapterExamWithDuplicatePrefix.id}`);
    fireEvent.click(buyBtn);

    expect(onBuyMock).toHaveBeenCalledTimes(1);
    expect(onBuyMock).toHaveBeenCalledWith(mockChapterExamWithDuplicatePrefix);
  });
});
