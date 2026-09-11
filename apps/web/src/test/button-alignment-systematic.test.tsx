import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button, Badge, Chip, Tabs } from "@avana/ui";

describe("Systematic Button Alignment & Typography Hardening", () => {
  describe("1. Dashboard Reference Buttons Verification", () => {
    it("renders «افزودن امتحان» button with icon + text as children in a single aligned flex row", () => {
      render(
        <Button variant="secondary" size="sm">
          <svg data-testid="plus-icon" className="w-3.5 h-3.5" viewBox="0 0 24 24" />
          <span>افزودن امتحان</span>
        </Button>
      );

      const button = screen.getByRole("button", { name: /افزودن امتحان/i });
      expect(button).toBeInTheDocument();
      // Button container has flex, alignment, size, and typography hardening
      expect(button.className).toContain("inline-flex");
      expect(button.className).toContain("items-center");
      expect(button.className).toContain("justify-center");
      expect(button.className).toContain("h-8");
      expect(button.className).toContain("px-3.5");
      expect(button.className).toContain("text-xs");
      expect(button.className).toContain("gap-1.5");
      expect(button.className).toContain("leading-none");
      expect(button.className).toContain("[&_svg]:shrink-0");
      expect(button.className).toContain("[&_svg]:block");

      // Wrapper span around children must be inline-flex items-center with gap-1.5 and leading-none
      const icon = screen.getByTestId("plus-icon");
      const wrapper = icon.parentElement;
      expect(wrapper).toBeInTheDocument();
      expect(wrapper?.tagName.toLowerCase()).toBe("span");
      expect(wrapper?.className).toContain("inline-flex");
      expect(wrapper?.className).toContain("items-center");
      expect(wrapper?.className).toContain("justify-center");
      expect(wrapper?.className).toContain("gap-1.5");
      expect(wrapper?.className).toContain("leading-none");
      expect(wrapper?.className).toContain("whitespace-nowrap");

      // No hacks used
      expect(button.className).not.toContain("translate-y");
      expect(button.className).not.toContain("-mt-");
      expect(icon.className).not.toContain("translate-y");
    });

    it("renders «از آوانا بپرس» button with icon + text as children and flex-1", () => {
      render(
        <Button variant="primary" size="sm" className="flex-1">
          <svg data-testid="sparkles-icon" className="w-4 h-4" viewBox="0 0 24 24" />
          <span>از آوانا بپرس</span>
        </Button>
      );

      const button = screen.getByRole("button", { name: /از آوانا بپرس/i });
      expect(button).toBeInTheDocument();
      expect(button.className).toContain("flex-1");
      expect(button.className).toContain("inline-flex");
      expect(button.className).toContain("items-center");
      expect(button.className).toContain("leading-none");
      expect(button.className).toContain("[&_svg]:shrink-0");
      expect(button.className).toContain("[&_svg]:block");

      const icon = screen.getByTestId("sparkles-icon");
      const wrapper = icon.parentElement;
      expect(wrapper?.className).toContain("inline-flex");
      expect(wrapper?.className).toContain("items-center");
      expect(wrapper?.className).toContain("gap-1.5");
      expect(wrapper?.className).toContain("leading-none");
    });
  });

  describe("2. Canonical Button Props (leftIcon, rightIcon, children)", () => {
    it("renders button with leftIcon prop and text with hardened leading-none and gap", () => {
      render(
        <Button
          leftIcon={<svg data-testid="left-icon" className="w-4 h-4" />}
          size="md"
        >
          شروع آزمون
        </Button>
      );

      const button = screen.getByRole("button", { name: /شروع آزمون/i });
      expect(button.className).toContain("gap-2");
      expect(button.className).toContain("leading-none");

      const icon = screen.getByTestId("left-icon");
      const iconWrapper = icon.parentElement;
      expect(iconWrapper?.className).toContain("shrink-0");
      expect(iconWrapper?.className).toContain("inline-flex");
      expect(iconWrapper?.className).toContain("leading-none");

      const textWrapper = screen.getByText("شروع آزمون");
      expect(textWrapper.className).toContain("leading-none");
      expect(textWrapper.className).toContain("inline-flex");
      expect(textWrapper.className).toContain("items-center");
    });

    it("renders button with rightIcon prop and text with correct DOM order for RTL flow", () => {
      render(
        <Button
          rightIcon={<svg data-testid="arrow-icon" className="w-4 h-4" />}
          size="lg"
        >
          درس بعدی
        </Button>
      );

      const button = screen.getByRole("button", { name: /درس بعدی/i });
      expect(button.className).toContain("h-11");
      expect(button.className).toContain("gap-2.5");
      expect(button.className).toContain("leading-none");

      const textSpan = screen.getByText("درس بعدی");
      const icon = screen.getByTestId("arrow-icon");
      const iconWrapper = icon.parentElement;

      // In DOM order: children span comes first, then rightIcon wrapper
      // In RTL (direction: rtl), the first DOM child appears on the right (text), and the second on the left (arrow)
      expect(textSpan.compareDocumentPosition(iconWrapper!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it("renders icon-only button without redundant empty span", () => {
      render(
        <Button
          aria-label="بستن"
          leftIcon={<svg data-testid="close-icon" className="w-4 h-4" />}
          size="sm"
        />
      );

      const button = screen.getByRole("button", { name: "بستن" });
      const spans = button.querySelectorAll("span");
      expect(spans.length).toBe(1);
      expect(spans[0].textContent).toBe("");
    });

    it("renders text-only button cleanly", () => {
      render(<Button size="md">انصراف</Button>);

      const button = screen.getByRole("button", { name: "انصراف" });
      expect(button.className).toContain("inline-flex");
      expect(button.className).toContain("leading-none");

      const textSpan = screen.getByText("انصراف");
      expect(textSpan.className).toContain("whitespace-nowrap");
      expect(textSpan.className).toContain("leading-none");
    });
  });

  describe("3. Size & Gap Token Consistency", () => {
    it("applies matching gap to button container and children wrapper across all sizes", () => {
      const { rerender } = render(
        <Button size="sm">
          <svg data-testid="icon" />
          <span>متن</span>
        </Button>
      );
      let button = screen.getByRole("button");
      let wrapper = screen.getByTestId("icon").parentElement;
      expect(button.className).toContain("h-8");
      expect(button.className).toContain("gap-1.5");
      expect(wrapper?.className).toContain("gap-1.5");

      rerender(
        <Button size="md">
          <svg data-testid="icon" />
          <span>متن</span>
        </Button>
      );
      button = screen.getByRole("button");
      wrapper = screen.getByTestId("icon").parentElement;
      expect(button.className).toContain("h-9");
      expect(button.className).toContain("gap-2");
      expect(wrapper?.className).toContain("gap-2");

      rerender(
        <Button size="lg">
          <svg data-testid="icon" />
          <span>متن</span>
        </Button>
      );
      button = screen.getByRole("button");
      wrapper = screen.getByTestId("icon").parentElement;
      expect(button.className).toContain("h-11");
      expect(button.className).toContain("gap-2.5");
      expect(wrapper?.className).toContain("gap-2.5");
    });
  });

  describe("4. Variants Integrity", () => {
    const variants = [
      "primary",
      "secondary",
      "tertiary",
      "outline",
      "ghost",
      "danger",
      "destructive",
      "success",
      "link",
      "secondary-purple",
    ] as const;

    variants.forEach((variant) => {
      it(`supports variant="${variant}" with consistent alignment tokens`, () => {
        render(
          <Button variant={variant} size="md">
            <span>دکمه {variant}</span>
          </Button>
        );
        const button = screen.getByRole("button", { name: new RegExp(`دکمه ${variant}`) });
        expect(button.className).toContain("inline-flex");
        expect(button.className).toContain("items-center");
        expect(button.className).toContain("leading-none");
      });
    });
  });

  describe("5. Related Primitive Consistency (Badge, Chip, Tabs)", () => {
    it("Badge renders with leading-none and shrink-0 SVG", () => {
      render(
        <Badge icon={<svg data-testid="badge-icon" />}>
          نشان
        </Badge>
      );
      const text = screen.getByText("نشان");
      const badge = text.parentElement;
      expect(badge?.className).toContain("leading-none");
      expect(badge?.className).toContain("[&_svg]:shrink-0");
      expect(badge?.className).toContain("[&_svg]:block");
    });

    it("Chip renders with leading-none and shrink-0 SVG", () => {
      render(
        <Chip onRemove={() => {}}>
          برچسب
        </Chip>
      );
      const chip = screen.getByText("برچسب");
      expect(chip.className).toContain("leading-none");
      expect(chip.className).toContain("[&_svg]:shrink-0");
    });

    it("Tabs render items with leading-none and shrink-0 SVG", () => {
      render(
        <Tabs
          items={[
            { id: "1", label: "تب ۱", icon: <svg data-testid="tab-icon" /> },
          ]}
        />
      );
      const tabButton = screen.getByRole("button", { name: /تب ۱/i });
      expect(tabButton.className).toContain("leading-none");
      expect(tabButton.className).toContain("[&_svg]:shrink-0");
    });
  });
});
