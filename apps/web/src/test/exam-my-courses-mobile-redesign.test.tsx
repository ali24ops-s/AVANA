import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaxonomySelector, type TaxonomyCourse } from "../components/study/TaxonomySelector.js";

describe("Exam My Courses (دوره‌های من) Mobile Redesign & Desktop Invariants", () => {
  const sampleCourses: TaxonomyCourse[] = [
    {
      id: "course-short",
      title: "فارماکولوژی",
      hasAccess: true,
      itemCount: 24,
      modules: [
        {
          id: "mod-1",
          title: "مقدمات فارماکولوژی",
          itemCount: 12,
        },
        {
          id: "mod-2",
          title: "فارماکوکینتیک",
          itemCount: 12,
        },
      ],
    },
    {
      id: "course-long",
      title: "اصول و مبانی فارماکولوژی بالینی و کاربردهای درمانی داروها",
      hasAccess: true,
      itemCount: 50,
      modules: [
        {
          id: "mod-3",
          title: "فصل اول: ساختار و پیوند در ترکیبات آلی دارویی",
          itemCount: 25,
        },
        {
          id: "mod-4",
          title: "فصل دوم: سنتز و فارماکودینامیک بالینی",
          itemCount: 25,
        },
      ],
    },
    {
      id: "course-custom",
      title: "نورولوژی بالینی",
      hasAccess: false,
      itemCount: 30,
      modules: [
        {
          id: "mod-5",
          title: "بیماری‌های عروقی مغز",
          itemCount: 30,
        },
      ],
    },
  ];

  it("renders short and long course titles clearly with correct metadata badges and question counts", () => {
    const handleSelectionChange = vi.fn();
    render(
      <TaxonomySelector
        courses={sampleCourses}
        selectedCourseIds={new Set()}
        selectedModuleIds={new Set()}
        onSelectionChange={handleSelectionChange}
        itemLabelSingular="سؤال"
      />
    );

    // 1. Short title is rendered
    expect(screen.getByText("فارماکولوژی")).toBeInTheDocument();

    // 2. Full long title is rendered in the DOM without missing or truncated text
    expect(
      screen.getByText("اصول و مبانی فارماکولوژی بالینی و کاربردهای درمانی داروها")
    ).toBeInTheDocument();

    // 3. Question counts are rendered
    expect(screen.getByText("۲۴ سؤال")).toBeInTheDocument();
    expect(screen.getByText("۵۰ سؤال")).toBeInTheDocument();
    expect(screen.getByText("۳۰ سؤال")).toBeInTheDocument();

    // 4. Access badges are rendered
    const accessibleBadges = screen.getAllByText("در دسترس");
    expect(accessibleBadges.length).toBeGreaterThan(0);
    const customBadges = screen.getAllByText("آزمون سفارشی");
    expect(customBadges.length).toBeGreaterThan(0);
  });

  it("handles course selection and deselection accurately", () => {
    const handleSelectionChange = vi.fn();
    const { rerender } = render(
      <TaxonomySelector
        courses={sampleCourses}
        selectedCourseIds={new Set()}
        selectedModuleIds={new Set()}
        onSelectionChange={handleSelectionChange}
        itemLabelSingular="سؤال"
      />
    );

    // Select the long course
    const selectLongCourseBtn = screen.getByRole("button", {
      name: "انتخاب کل دوره اصول و مبانی فارماکولوژی بالینی و کاربردهای درمانی داروها",
    });
    fireEvent.click(selectLongCourseBtn);

    expect(handleSelectionChange).toHaveBeenCalledTimes(1);
    const firstCallArgs = handleSelectionChange.mock.calls[0][0];
    expect(firstCallArgs.courseIds.has("course-long")).toBe(true);
    expect(firstCallArgs.moduleIds.has("mod-3")).toBe(true);
    expect(firstCallArgs.moduleIds.has("mod-4")).toBe(true);

    // Re-render as selected
    rerender(
      <TaxonomySelector
        courses={sampleCourses}
        selectedCourseIds={new Set(["course-long"])}
        selectedModuleIds={new Set(["mod-3", "mod-4"])}
        onSelectionChange={handleSelectionChange}
        itemLabelSingular="سؤال"
      />
    );

    // Deselect
    fireEvent.click(selectLongCourseBtn);
    expect(handleSelectionChange).toHaveBeenCalledTimes(2);
    const secondCallArgs = handleSelectionChange.mock.calls[1][0];
    expect(secondCallArgs.courseIds.has("course-long")).toBe(false);
  });

  it("expands course and renders module items with full multi-line title wrapping capability", () => {
    const handleSelectionChange = vi.fn();
    render(
      <TaxonomySelector
        courses={sampleCourses}
        selectedCourseIds={new Set()}
        selectedModuleIds={new Set()}
        onSelectionChange={handleSelectionChange}
        itemLabelSingular="سؤال"
      />
    );

    // Expand the long course modules
    const expandBtn = screen.getByRole("button", {
      name: "نمایش سرفصل‌های اصول و مبانی فارماکولوژی بالینی و کاربردهای درمانی داروها",
    });
    fireEvent.click(expandBtn);

    // Modules should now be visible
    expect(
      screen.getByText("فصل اول: ساختار و پیوند در ترکیبات آلی دارویی")
    ).toBeInTheDocument();
    expect(
      screen.getByText("فصل دوم: سنتز و فارماکودینامیک بالینی")
    ).toBeInTheDocument();

    // Module question counts should be rendered
    const moduleQuestionCounts = screen.getAllByText("۲۵ سؤال");
    expect(moduleQuestionCounts.length).toBe(2);
  });

  it("selects individual module within expanded course without breaking other module states", () => {
    const handleSelectionChange = vi.fn();
    render(
      <TaxonomySelector
        courses={sampleCourses}
        selectedCourseIds={new Set()}
        selectedModuleIds={new Set()}
        onSelectionChange={handleSelectionChange}
        itemLabelSingular="سؤال"
      />
    );

    // Expand course
    const expandBtn = screen.getByRole("button", {
      name: "نمایش سرفصل‌های اصول و مبانی فارماکولوژی بالینی و کاربردهای درمانی داروها",
    });
    fireEvent.click(expandBtn);

    // Click on module 1
    const module1Title = screen.getByText("فصل اول: ساختار و پیوند در ترکیبات آلی دارویی");
    fireEvent.click(module1Title);

    expect(handleSelectionChange).toHaveBeenCalledTimes(1);
    const selectionArg = handleSelectionChange.mock.calls[0][0];
    expect(selectionArg.moduleIds.has("mod-3")).toBe(true);
    expect(selectionArg.moduleIds.has("mod-4")).toBe(false);
  });
});
