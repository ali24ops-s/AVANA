import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { XCircle, X, ArrowLeft, ChevronDown, AlertCircle } from "lucide-react";
import { ExamHierarchyHeader } from "../components/quiz/ExamHierarchyHeader";

describe("Phase 2H — Canonical Icon System Migration", () => {
  it("renders canonical Lucide icons as valid SVG elements with standard attributes", () => {
    render(
      <div>
        <XCircle className="w-4 h-4 text-red-500" data-testid="x-circle-icon" />
        <X className="w-5 h-5" aria-hidden="true" data-testid="x-icon" />
        <ArrowLeft className="w-4 h-4" aria-hidden="true" data-testid="arrow-left-icon" />
        <ChevronDown className="w-4 h-4" aria-hidden="true" data-testid="chevron-down-icon" />
        <AlertCircle className="w-12 h-12 text-red-600" aria-hidden="true" data-testid="alert-circle-icon" />
      </div>
    );

    const xCircle = screen.getByTestId("x-circle-icon");
    expect(xCircle.tagName.toLowerCase()).toBe("svg");
    expect(xCircle).toHaveClass("w-4", "h-4", "text-red-500");

    const xIcon = screen.getByTestId("x-icon");
    expect(xIcon.tagName.toLowerCase()).toBe("svg");
    expect(xIcon.getAttribute("aria-hidden")).toBe("true");

    const arrowLeft = screen.getByTestId("arrow-left-icon");
    expect(arrowLeft.tagName.toLowerCase()).toBe("svg");

    const chevronDown = screen.getByTestId("chevron-down-icon");
    expect(chevronDown.tagName.toLowerCase()).toBe("svg");

    const alertCircle = screen.getByTestId("alert-circle-icon");
    expect(alertCircle.tagName.toLowerCase()).toBe("svg");
  });

  it("verifies ExamHierarchyHeader renders canonical ChevronDown for expand/collapse", () => {
    const coverage = [
      {
        id: "course-1",
        title: "فارماکولوژی پایه",
        modules: [
          {
            id: "mod-1",
            title: "فصل اول: داروشناسی عمومی",
            questionCount: 5,
          },
        ],
      },
    ];

    render(
      <MemoryRouter>
        <ExamHierarchyHeader coverage={coverage} />
      </MemoryRouter>
    );

    // Should have an accordion button with aria-expanded
    const button = screen.getByRole("button", { name: /نمایش فصل‌های دوره فارماکولوژی پایه/i });
    expect(button).toBeDefined();

    // The ChevronDown icon should be rendered inside the button as an SVG
    const svgIcon = button.querySelector("svg");
    expect(svgIcon).not.toBeNull();
    expect(svgIcon?.getAttribute("aria-hidden")).toBe("true");

    // Must NOT contain material-symbols-outlined for expand_more
    expect(button.querySelector(".material-symbols-outlined")).toBeNull();
  });
});
