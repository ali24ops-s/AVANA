import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@avana/ui";

describe("Canonical Button Primitive — Single Row & Layout Hardening", () => {
  it("renders button with leftIcon and text with whitespace-nowrap and shrink-0 icon wrapper", () => {
    render(
      <Button
        leftIcon={<svg data-testid="left-icon" className="w-4 h-4" />}
        size="sm"
      >
        بسته‌های آموزشی آماده
      </Button>
    );

    const button = screen.getByRole("button", { name: /بسته‌های آموزشی آماده/i });
    expect(button).toBeInTheDocument();
    expect(button.className).toContain("whitespace-nowrap");
    expect(button.className).toContain("inline-flex");
    expect(button.className).toContain("gap-1.5");

    // Icon should be inside a shrink-0 wrapper
    const icon = screen.getByTestId("left-icon");
    const iconWrapper = icon.parentElement;
    expect(iconWrapper).toBeInTheDocument();
    expect(iconWrapper?.className).toContain("shrink-0");
    expect(iconWrapper?.className).toContain("inline-flex");

    // Text should be inside a whitespace-nowrap span
    const textSpan = screen.getByText("بسته‌های آموزشی آماده");
    expect(textSpan.tagName.toLowerCase()).toBe("span");
    expect(textSpan.className).toContain("whitespace-nowrap");
  });

  it("renders button with rightIcon and text", () => {
    render(
      <Button
        rightIcon={<svg data-testid="right-icon" className="w-4 h-4" />}
        size="md"
      >
        درس بعدی
      </Button>
    );

    const button = screen.getByRole("button", { name: /درس بعدی/i });
    expect(button.className).toContain("gap-2");

    const rightIcon = screen.getByTestId("right-icon");
    const iconWrapper = rightIcon.parentElement;
    expect(iconWrapper?.className).toContain("shrink-0");
    expect(iconWrapper?.className).toContain("inline-flex");
  });

  it("renders icon-only button without an empty span element", () => {
    render(
      <Button
        aria-label="منو"
        leftIcon={<svg data-testid="menu-icon" className="w-5 h-5" />}
        size="sm"
      />
    );

    const button = screen.getByRole("button", { name: "منو" });
    expect(button).toBeInTheDocument();

    // The icon wrapper is a span, but there should NOT be an extra empty span for children!
    const spans = button.querySelectorAll("span");
    expect(spans.length).toBe(1); // Exactly 1 span for the icon wrapper
    expect(spans[0].textContent).toBe(""); // It only contains the SVG
  });

  it("handles loading state properly: spinner wrapped in shrink-0, button disabled, leftIcon suppressed", () => {
    render(
      <Button
        isLoading={true}
        leftIcon={<svg data-testid="left-icon" />}
        size="md"
      >
        در حال ارسال...
      </Button>
    );

    const button = screen.getByRole("button", { name: /در حال ارسال.../i });
    expect(button).toBeDisabled();

    // Left icon should not be rendered
    expect(screen.queryByTestId("left-icon")).not.toBeInTheDocument();

    // Spinner SVG should be present inside a shrink-0 wrapper
    const spinner = button.querySelector("svg.animate-spin");
    expect(spinner).toBeInTheDocument();
    expect(spinner?.parentElement?.className).toContain("shrink-0");
  });

  it("supports fullWidth prop", () => {
    render(
      <Button fullWidth size="lg">
        تکمیل خرید
      </Button>
    );

    const button = screen.getByRole("button", { name: /تکمیل خرید/i });
    expect(button.className).toContain("w-full");
  });

  it("preserves size tokens sm, md, lg", () => {
    const { rerender } = render(<Button size="sm">دکمه</Button>);
    let button = screen.getByRole("button", { name: "دکمه" });
    expect(button.className).toContain("h-8");
    expect(button.className).toContain("gap-1.5");

    rerender(<Button size="md">دکمه</Button>);
    button = screen.getByRole("button", { name: "دکمه" });
    expect(button.className).toContain("h-9");
    expect(button.className).toContain("gap-2");

    rerender(<Button size="lg">دکمه</Button>);
    button = screen.getByRole("button", { name: "دکمه" });
    expect(button.className).toContain("h-11");
    expect(button.className).toContain("gap-2.5");
  });

  it("preserves variant tokens", () => {
    const { rerender } = render(<Button variant="primary">دکمه</Button>);
    let button = screen.getByRole("button", { name: "دکمه" });
    expect(button.className).toContain("bg-[#008080]");

    rerender(<Button variant="secondary">دکمه</Button>);
    button = screen.getByRole("button", { name: "دکمه" });
    expect(button.className).toContain("bg-[#e0f2f2]");

    rerender(<Button variant="ghost">دکمه</Button>);
    button = screen.getByRole("button", { name: "دکمه" });
    expect(button.className).toContain("bg-transparent");
  });
});
