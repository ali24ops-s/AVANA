import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TaxonomySelector, type TaxonomyCourse } from "../components/study/TaxonomySelector.js";

describe("Exam My Courses (دوره‌های من) UX Enhancements - Flashcard Scroll Pattern", () => {
  const sampleCourses: TaxonomyCourse[] = [
    {
      id: "c-1",
      title: "بیوشیمی پزشکی",
      hasAccess: true,
      itemCount: 40,
      modules: [
        { id: "m-1-1", title: "مقدمه بیوشیمی", itemCount: 10 },
        { id: "m-1-2", title: "ساختار پروتئین", itemCount: 10 },
        { id: "m-1-3", title: "آنزیم‌ها", itemCount: 10 },
        { id: "m-1-4", title: "کربوهیدرات‌ها", itemCount: 5 },
        { id: "m-1-5", title: "لیپیدها", itemCount: 5 },
        { id: "m-1-6", title: "متابولیسم انرژی", itemCount: 5 },
        { id: "m-1-7", title: "ژنتیک مولکولی", itemCount: 5 },
      ],
    },
    {
      id: "c-2",
      title: "فیزیولوژی اعصاب و سیستم حرکتی بدن انسان",
      hasAccess: true,
      itemCount: 20,
      modules: [
        { id: "m-2-1", title: "نورون و سیناپس", itemCount: 10 },
        { id: "m-2-2", title: "سیستم حسی", itemCount: 10 },
      ],
    },
    {
      id: "c-3",
      title: "فارماکولوژی عمومی",
      hasAccess: true,
      itemCount: 30,
      modules: [{ id: "m-3-1", title: "فارماکوکینتیک", itemCount: 30 }],
    },
    {
      id: "c-4",
      title: "پاتولوژی عمومی",
      hasAccess: true,
      itemCount: 25,
      modules: [{ id: "m-4-1", title: "التهاب و ترمیم", itemCount: 25 }],
    },
    {
      id: "c-5",
      title: "میکروب‌شناسی بالینی",
      hasAccess: true,
      itemCount: 15,
      modules: [{ id: "m-5-1", title: "باکتری‌شناسی", itemCount: 15 }],
    },
  ];

  it("renders all courses without any 'نمایش همه دوره‌ها' or 'نمایش کمتر' buttons", () => {
    const handleSelectionChange = vi.fn();
    const { container } = render(
      <div className="overflow-y-auto pe-1 max-h-[300px] sm:max-h-[340px] overscroll-contain">
        <TaxonomySelector
          courses={sampleCourses}
          selectedCourseIds={new Set()}
          selectedModuleIds={new Set()}
          onSelectionChange={handleSelectionChange}
        />
      </div>
    );

    // All 5 courses must be in the DOM
    expect(screen.getByText("بیوشیمی پزشکی")).toBeInTheDocument();
    expect(screen.getByText("فیزیولوژی اعصاب و سیستم حرکتی بدن انسان")).toBeInTheDocument();
    expect(screen.getByText("فارماکولوژی عمومی")).toBeInTheDocument();
    expect(screen.getByText("پاتولوژی عمومی")).toBeInTheDocument();
    expect(screen.getByText("میکروب‌شناسی بالینی")).toBeInTheDocument();

    // Verify absolutely NO 'نمایش بیشتر' / 'نمایش همه دوره‌ها' buttons exist
    expect(screen.queryByRole("button", { name: /نمایش همه/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /نمایش کمتر/i })).not.toBeInTheDocument();

    // Verify outer scroll container uses flashcard-matching classes
    const scrollContainer = container.firstChild as HTMLElement;
    expect(scrollContainer.className).toContain("overflow-y-auto");
    expect(scrollContainer.className).toContain("pe-1");
    expect(scrollContainer.className).toContain("max-h-[300px]");
  });

  it("renders all chapters inside an internal scroll container with max-h and overscroll-contain when course is expanded", () => {
    const handleSelectionChange = vi.fn();
    render(
      <TaxonomySelector
        courses={[sampleCourses[0]]}
        selectedCourseIds={new Set()}
        selectedModuleIds={new Set()}
        onSelectionChange={handleSelectionChange}
      />
    );

    // Open first course accordion
    const courseHeader = screen.getByText("بیوشیمی پزشکی");
    fireEvent.click(courseHeader);

    // All 7 chapters must be rendered directly without truncation
    expect(screen.getByText("مقدمه بیوشیمی")).toBeInTheDocument();
    expect(screen.getByText("ساختار پروتئین")).toBeInTheDocument();
    expect(screen.getByText("آنزیم‌ها")).toBeInTheDocument();
    expect(screen.getByText("کربوهیدرات‌ها")).toBeInTheDocument();
    expect(screen.getByText("لیپیدها")).toBeInTheDocument();
    expect(screen.getByText("متابولیسم انرژی")).toBeInTheDocument();
    expect(screen.getByText("ژنتیک مولکولی")).toBeInTheDocument();

    // Verify NO chapter expand/collapse buttons exist
    expect(screen.queryByRole("button", { name: /نمایش همه فصل‌ها/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /نمایش کمتر فصل‌ها/i })).not.toBeInTheDocument();

    // Verify the modules container has internal scroll styling
    const modulesContainer = screen.getByText("مقدمه بیوشیمی").closest(".overflow-y-auto");
    expect(modulesContainer).toBeInTheDocument();
    expect(modulesContainer?.className).toContain("max-h-[240px]");
    expect(modulesContainer?.className).toContain("overflow-y-auto");
    expect(modulesContainer?.className).toContain("overscroll-contain");
  });

  it("preserves selection state and indeterminate indicators correctly", () => {
    const handleSelectionChange = vi.fn();
    // Partial selection: only 1 module of course c-1 selected
    const { rerender } = render(
      <TaxonomySelector
        courses={sampleCourses}
        selectedCourseIds={new Set()}
        selectedModuleIds={new Set(["m-1-1"])}
        onSelectionChange={handleSelectionChange}
      />
    );

    // c-1 should have indeterminate indicator (Minus icon)
    const c1Btn = screen.getByLabelText("انتخاب کل دوره بیوشیمی پزشکی");
    expect(c1Btn.querySelector(".lucide-minus")).toBeInTheDocument();

    // Selecting c-1 should call handler with all its modules
    fireEvent.click(c1Btn);
    expect(handleSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({
        courseIds: expect.any(Set),
        moduleIds: expect.any(Set),
      })
    );

    // Re-render with full selection of c-1
    rerender(
      <TaxonomySelector
        courses={sampleCourses}
        selectedCourseIds={new Set(["c-1"])}
        selectedModuleIds={new Set([
          "m-1-1",
          "m-1-2",
          "m-1-3",
          "m-1-4",
          "m-1-5",
          "m-1-6",
          "m-1-7",
        ])}
        onSelectionChange={handleSelectionChange}
      />
    );

    // Now c-1 should have checked indicator (Check icon)
    const c1BtnChecked = screen.getByLabelText("انتخاب کل دوره بیوشیمی پزشکی");
    expect(c1BtnChecked.querySelector(".lucide-check")).toBeInTheDocument();
  });

  it("filters courses with search without clearing selections, and allows clearing search", () => {
    const handleSelectionChange = vi.fn();
    render(
      <TaxonomySelector
        courses={sampleCourses}
        selectedCourseIds={new Set(["c-5"])}
        selectedModuleIds={new Set(["m-5-1"])}
        onSelectionChange={handleSelectionChange}
        enableCourseSearch={true}
        courseSearchPlaceholder="جستجو در دوره‌ها..."
      />
    );

    const searchInput = screen.getByPlaceholderText("جستجو در دوره‌ها...");
    expect(searchInput).toBeInTheDocument();

    // Search for "اعصاب"
    fireEvent.change(searchInput, { target: { value: "اعصاب" } });
    expect(screen.getByText("فیزیولوژی اعصاب و سیستم حرکتی بدن انسان")).toBeInTheDocument();
    expect(screen.queryByText("بیوشیمی پزشکی")).not.toBeInTheDocument();
    expect(screen.queryByText("فارماکولوژی عمومی")).not.toBeInTheDocument();

    // Clear search with button
    const clearBtn = screen.getByLabelText("پاک کردن جست‌وجو");
    fireEvent.click(clearBtn);

    // All courses reappear
    expect(screen.getByText("بیوشیمی پزشکی")).toBeInTheDocument();
    expect(screen.getByText("میکروب‌شناسی بالینی")).toBeInTheDocument();
  });

  it("ensures long course and chapter titles have break-words class for clean mobile wrapping", () => {
    const handleSelectionChange = vi.fn();
    render(
      <TaxonomySelector
        courses={[sampleCourses[1]]}
        selectedCourseIds={new Set()}
        selectedModuleIds={new Set()}
        onSelectionChange={handleSelectionChange}
      />
    );

    const longTitle = screen.getByText("فیزیولوژی اعصاب و سیستم حرکتی بدن انسان");
    expect(longTitle.className).toContain("break-words");
  });
});
