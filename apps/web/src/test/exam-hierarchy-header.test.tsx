import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExamHierarchyHeader } from "../components/quiz/ExamHierarchyHeader.js";
import type { ExamCoverageCourse } from "@avana/domain";

describe("ExamHierarchyHeader Component", () => {
  const mockSingleCourseCoverage: ExamCoverageCourse[] = [
    {
      id: "course-pharma-2",
      title: "فارماکولوژی ۲",
      questionCount: 10,
      modules: [
        {
          id: "mod-corticosteroids",
          title: "داروهای کورتیکواستروئیدی",
          questionCount: 6,
        },
        {
          id: "mod-nsaids",
          title: "داروهای ضدالتهابی",
          questionCount: 4,
        },
      ],
    },
  ];

  const mockMultiCourseCoverage: ExamCoverageCourse[] = [
    {
      id: "course-pharma-2",
      title: "فارماکولوژی ۲",
      questionCount: 8,
      modules: [
        {
          id: "mod-corticosteroids",
          title: "داروهای کورتیکواستروئیدی",
          questionCount: 8,
        },
      ],
    },
    {
      id: "course-physiology",
      title: "فیزیولوژی غدد",
      questionCount: 4,
      modules: [
        {
          id: "mod-adrenal-axis",
          title: "محور هیپوتالاموس هیپوفیز آدرنال",
          questionCount: 4,
        },
      ],
    },
  ];

  it("1. is collapsed by default: Course title visible, modules and lessons hidden", () => {
    render(<ExamHierarchyHeader coverage={mockSingleCourseCoverage} />);

    // Course title is visible
    expect(screen.getByText("فارماکولوژی ۲")).toBeDefined();

    // Modules are NOT visible initially
    expect(screen.queryByText("داروهای کورتیکواستروئیدی")).toBeNull();
    expect(screen.queryByText("داروهای ضدالتهابی")).toBeNull();

    // Never renders lesson titles
    expect(screen.queryByText(/جلسه/)).toBeNull();
  });

  it("2. click expands course to show modules, click again collapses it", () => {
    render(<ExamHierarchyHeader coverage={mockSingleCourseCoverage} />);

    const courseBtn = screen.getByRole("button", { name: /نمایش فصل‌های دوره فارماکولوژی ۲/ });
    expect(courseBtn.getAttribute("aria-expanded")).toBe("false");

    // Click -> Expand
    fireEvent.click(courseBtn);
    expect(courseBtn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("داروهای کورتیکواستروئیدی")).toBeDefined();
    expect(screen.getByText("داروهای ضدالتهابی")).toBeDefined();

    // Click again -> Collapse
    fireEvent.click(courseBtn);
    expect(courseBtn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("داروهای کورتیکواستروئیدی")).toBeNull();
  });

  it("3. supports multiple courses with independent expand/collapse", () => {
    render(<ExamHierarchyHeader coverage={mockMultiCourseCoverage} />);

    expect(screen.getByText("فارماکولوژی ۲")).toBeDefined();
    expect(screen.getByText("فیزیولوژی غدد")).toBeDefined();

    const pharmaBtn = screen.getByRole("button", { name: /نمایش فصل‌های دوره فارماکولوژی ۲/ });
    const physioBtn = screen.getByRole("button", { name: /نمایش فصل‌های دوره فیزیولوژی غدد/ });

    // Expand pharma
    fireEvent.click(pharmaBtn);
    expect(screen.getByText("داروهای کورتیکواستروئیدی")).toBeDefined();
    expect(screen.queryByText("محور هیپوتالاموس هیپوفیز آدرنال")).toBeNull();

    // Expand physio
    fireEvent.click(physioBtn);
    expect(screen.getByText("محور هیپوتالاموس هیپوفیز آدرنال")).toBeDefined();
  });

  it("4. single module course preserves Course -> Module hierarchy", () => {
    const singleModuleCourse: ExamCoverageCourse[] = [
      {
        id: "course-single",
        title: "فارماکولوژی قلب",
        questionCount: 5,
        modules: [
          {
            id: "mod-hypertension",
            title: "داروهای ضدفشار خون",
            questionCount: 5,
          },
        ],
      },
    ];

    render(<ExamHierarchyHeader coverage={singleModuleCourse} />);
    const btn = screen.getByRole("button", { name: /نمایش فصل‌های دوره فارماکولوژی قلب/ });
    expect(screen.queryByText("داروهای ضدفشار خون")).toBeNull();

    fireEvent.click(btn);
    expect(screen.getByText("داروهای ضدفشار خون")).toBeDefined();
  });

  it("5. strictly hides any UUIDs, internal IDs, or Lesson titles", () => {
    const pollutedCoverage: ExamCoverageCourse[] = [
      {
        id: "93b501bf-dc27-4056-9c95-6d6639cc630a",
        title: "فارماکولوژی بالینی",
        questionCount: 5,
        modules: [
          {
            id: "4326da85-03c2-4ade-bc56-d4da7f304e9a",
            title: "داروهای بیهوشی",
            questionCount: 5,
          },
        ],
      },
    ];

    const { container } = render(<ExamHierarchyHeader coverage={pollutedCoverage} />);
    const btn = screen.getByRole("button", { name: /نمایش فصل‌های دوره فارماکولوژی بالینی/ });
    fireEvent.click(btn);

    // Verify neither UUID appears anywhere in the rendered HTML
    expect(screen.queryByText(/93b501bf/)).toBeNull();
    expect(screen.queryByText(/4326da85/)).toBeNull();
    expect(container.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    expect(container.textContent).not.toContain("جلسه");
  });

  it("6. handles empty or undefined coverage safely without crashing", () => {
    const { rerender } = render(<ExamHierarchyHeader coverage={undefined} fallbackTopic="فارماکولوژی" />);
    expect(screen.getByText("فارماکولوژی")).toBeDefined();

    rerender(<ExamHierarchyHeader coverage={[]} fallbackTopic="آزمون جامع" />);
    expect(screen.getByText("آزمون جامع")).toBeDefined();

    rerender(<ExamHierarchyHeader coverage={[]} fallbackTopic="93b501bf-dc27-4056-9c95-6d6639cc630a" />);
    // Lone UUID fallback must not leak
    expect(screen.queryByText(/93b501bf/)).toBeNull();
    expect(screen.getByText("آزمون جامع")).toBeDefined();
  });

  it("7. dropdown is wider, responsive for mobile, and caps chapter titles to at most 2 lines", () => {
    const longTitleCoverage: ExamCoverageCourse[] = [
      {
        id: "course-cardio",
        title: "فارماکولوژی قلب و عروق پیشرفته",
        questionCount: 15,
        modules: [
          {
            id: "mod-very-long-title",
            title: "مکانیسم‌های فارماکودینامیک و عوارض جانبی داروهای مهارکننده بتا و آنتاگونیست‌های گیرنده آنژیوتانسین در نارسایی قلبی و بیماران پرخطر",
            questionCount: 8,
          },
        ],
      },
    ];

    render(<ExamHierarchyHeader coverage={longTitleCoverage} />);
    const btn = screen.getByRole("button", { name: /نمایش فصل‌های دوره فارماکولوژی قلب و عروق پیشرفته/ });
    fireEvent.click(btn);

    // Dropdown container should have wide, responsive, and mobile-safe classes
    const dropdown = screen.getByRole("region", { name: /فصل‌های دوره فارماکولوژی قلب و عروق پیشرفته/ });
    expect(dropdown.className).toContain("sm:w-max");
    expect(dropdown.className).toContain("min-w-[280px]");
    expect(dropdown.className).toContain("sm:min-w-[360px]");
    expect(dropdown.className).toContain("max-sm:fixed");
    expect(dropdown.className).toContain("max-sm:inset-x-3");
    expect(dropdown.className).toContain("max-w-[calc(100vw-1.5rem)]");

    // Chapter title span should have line-clamp-2, break-words, and title attribute
    const moduleTitleSpan = screen.getByText(/مکانیسم‌های فارماکودینامیک/);
    expect(moduleTitleSpan.className).toContain("line-clamp-2");
    expect(moduleTitleSpan.className).toContain("break-words");
    expect(moduleTitleSpan.getAttribute("title")).toBe(
      "مکانیسم‌های فارماکودینامیک و عوارض جانبی داروهای مهارکننده بتا و آنتاگونیست‌های گیرنده آنژیوتانسین در نارسایی قلبی و بیماران پرخطر"
    );
  });
});
