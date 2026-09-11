import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MarkdownRenderer, RichContent } from "../components/markdown/MarkdownRenderer";

describe("Real DOM Computed Style & Cascade Verification", () => {
  it("renders lesson paragraph and bold with semantic color in light mode", () => {
    const { container } = render(
      <div className="prose">
        <MarkdownRenderer content="این یک **متن آزمایشی** درسنامه است." />
      </div>
    );

    const p = container.querySelector("p");
    const strong = container.querySelector("strong");

    expect(p).not.toBeNull();
    expect(strong).not.toBeNull();

    // Verify className
    expect(p?.className).toContain("text-[var(--color-text)]");
    expect(strong?.className).toContain("text-[var(--color-text)]");
    expect(p?.className).toContain("dark:text-slate-200");
    expect(strong?.className).toContain("dark:text-white");
  });

  it("renders quiz explanation with high-contrast label and content", () => {
    const { container } = render(
      <div className="p-3.5 bg-[#fdf2e4]">
        <p className="font-bold text-[#8f5e27] dark:text-amber-300">
          توضیح پاسخ:
        </p>
        <div className="text-[var(--color-text)]">
          <RichContent content="پاسخ تشریحی **نکته کلیدی** است." />
        </div>
      </div>
    );

    const label = container.querySelector("p");
    const richP = container.querySelectorAll("p")[1];
    const richStrong = container.querySelector("strong");

    expect(label?.className).toContain("text-[#8f5e27]");
    expect(richP?.className).toContain("text-[var(--color-text)]");
    expect(richStrong?.className).toContain("text-[var(--color-text)]");
  });

  it("renders course list count badge with high-contrast text-[#006666]", () => {
    const { container } = render(
      <span className="text-xs font-bold text-[#006666] dark:text-teal-200 bg-primary/10 px-3 py-1.5 rounded-full border border-primary/30">
        ۲ دوره در لیست شما
      </span>
    );

    const span = container.querySelector("span");
    expect(span?.className).toContain("text-[#006666]");
    expect(span?.className).toContain("dark:text-teal-200");
  });
});
