import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExamTakingView } from "../components/quiz/ExamTakingView";

describe("Phase 2G — Canonical Typography Migration", () => {
  it("renders canonical heading hierarchy elements properly", () => {
    const { container } = render(
      <div>
        <h1 className="text-h1 text-[var(--color-text)]">عنوان اصلی صفحه</h1>
        <h2 className="text-h2 text-[var(--color-text)]">عنوان بخش</h2>
        <h3 className="text-h3 text-[var(--color-text)]">عنوان کارت</h3>
        <h4 className="text-h4 text-[var(--color-text)]">عنوان فرعی</h4>
        <p className="text-body text-[var(--color-text)]">متن بدنه پیش‌فرض</p>
        <p className="text-body-sm text-[var(--color-text-muted)]">متن توضیحات کوچک</p>
        <span className="text-label text-[var(--color-text)]">برچسب فرم</span>
        <span className="text-caption text-[var(--color-text-muted)]">کپشن</span>
      </div>
    );

    const h1 = container.querySelector("h1");
    expect(h1).toHaveClass("text-h1");
    expect(h1?.tagName.toLowerCase()).toBe("h1");

    const h2 = container.querySelector("h2");
    expect(h2).toHaveClass("text-h2");
    expect(h2?.tagName.toLowerCase()).toBe("h2");

    const h3 = container.querySelector("h3");
    expect(h3).toHaveClass("text-h3");
    expect(h3?.tagName.toLowerCase()).toBe("h3");

    const h4 = container.querySelector("h4");
    expect(h4).toHaveClass("text-h4");
    expect(h4?.tagName.toLowerCase()).toBe("h4");
  });

  it("verifies ExamTakingView headings use canonical text-h3 and text-h4 without legacy font-title-md", () => {
    const mockQuestion = {
      id: "q-1",
      stem: "سوال تستی داروشناسی",
      options: [
        { id: "opt-1", text: "گزینه ۱" },
        { id: "opt-2", text: "گزینه ۲" },
      ],
      correct_option_id: "opt-1",
    };

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ExamTakingView
            examTitle="آزمون آزمایشی فارماکولوژی"
            questions={[mockQuestion as any]}
            onComplete={vi.fn()}
            onExit={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Click to open confirm finish modal
    const endExamBtn = screen.getByText("ثبت و پایان آزمون");
    fireEvent.click(endExamBtn);

    // The modal heading should have text-h3 and NOT font-title-md
    const modalHeading = screen.getByRole("heading", { name: "پایان آزمون", level: 2 });
    expect(modalHeading).toBeInTheDocument();
    expect(modalHeading).toHaveClass("text-h3");
    expect(modalHeading.className).not.toContain("font-title-md");

    // Click mentor button to open AI mentor overlay
    const mentorBtn = screen.getByText("راهنمایی از منتور هوشمند");
    fireEvent.click(mentorBtn);

    const mentorHeading = screen.getByRole("heading", { name: "تحلیل هوشمند آوانا", level: 2 });
    expect(mentorHeading).toBeInTheDocument();
    expect(mentorHeading).toHaveClass("text-h3");
    expect(mentorHeading.className).not.toContain("font-title-md");

    const sectionSubheading = screen.getByRole("heading", { name: /راهنمای مفهومی سوال/i, level: 3 });
    expect(sectionSubheading).toBeInTheDocument();
    expect(sectionSubheading).toHaveClass("text-h4");
    expect(sectionSubheading.className).not.toContain("font-title-md");
  });
});
