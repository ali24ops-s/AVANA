import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import fs from "fs";
import path from "path";
import { Button, Badge, Alert, Switch, AvanaSelect } from "@avana/ui";
import { semanticColors } from "@avana/ui";

describe("Contrast & Readability Foundation Validation", () => {
  describe("1. Button Primitive Success Variant", () => {
    it("renders Button success variant with high contrast #2a624b background", () => {
      render(<Button variant="success">ذخیره موفق</Button>);
      const button = screen.getByRole("button", { name: /ذخیره موفق/i });
      expect(button.className).toContain("bg-[#2a624b]");
      expect(button.className).toContain("text-white");
      expect(button.className).toContain("hover:bg-[#224e3c]");
    });
  });

  describe("2. Badge & Chip Semantic Contrast", () => {
    it("renders Badge variants with dedicated high-contrast text colors", () => {
      const { rerender } = render(<Badge variant="success">فعال</Badge>);
      const badgeSuccess = screen.getByText("فعال").parentElement;
      expect(badgeSuccess?.className).toContain("text-[#2a624b]");

      rerender(<Badge variant="warning">در انتظار</Badge>);
      const badgeWarning = screen.getByText("در انتظار").parentElement;
      expect(badgeWarning?.className).toContain("text-[#8f5e27]");

      rerender(<Badge variant="error">خطا</Badge>);
      const badgeError = screen.getByText("خطا").parentElement;
      expect(badgeError?.className).toContain("text-[#7f3131]");

      rerender(<Badge variant="info">اطلاعات</Badge>);
      const badgeInfo = screen.getByText("اطلاعات").parentElement;
      expect(badgeInfo?.className).toContain("text-[#2b6d8f]");
    });
  });

  describe("3. Alert Semantic Contrast", () => {
    it("renders Alert variants with high-contrast text and full opacity", () => {
      render(
        <Alert variant="warning" title="هشدار مهم">
          متن پیام هشدار
        </Alert>
      );
      const title = screen.getByText("هشدار مهم");
      const alertContainer = title.closest("div[class*='border']");
      expect(alertContainer?.className).toContain("text-[#8f5e27]");
      const body = screen.getByText("متن پیام هشدار");
      expect(body.className).not.toContain("opacity-90");
    });
  });

  describe("4. Switch Unchecked Track Contrast", () => {
    it("renders Switch with high-contrast slate-300 track for clear boundary against white/light surface", () => {
      render(<Switch checked={false} onChange={() => {}} aria-label="تغییر وضعیت" />);
      const switchEl = screen.getByRole("switch");
      expect(switchEl.className).toContain("bg-slate-300");
      expect(switchEl.className).toContain("dark:bg-slate-600");
    });
  });

  describe("5. AvanaSelect Option Highlighting", () => {
    it("renders highlighted option with visible contrast bg and text color", () => {
      const options = [
        { value: "1", label: "گزینه اول" },
        { value: "2", label: "گزینه دوم" },
      ];
      render(
        <AvanaSelect
          options={options}
          value="1"
          onChange={() => {}}
        />
      );
      const trigger = screen.getByRole("combobox");
      fireEvent.click(trigger);

      const option1 = screen.getByRole("option", { name: /گزینه اول/i });
      expect(option1.className).toContain("text-[#006666]");
      expect(option1.className).toContain("bg-[#008080]/15");
    });
  });

  describe("6. Design Tokens & CSS Compatibility Mappings", () => {
    it("exports high-contrast text tokens in colors.ts", () => {
      expect(semanticColors.feedback.success.text).toBe("#2a624b");
      expect(semanticColors.feedback.warning.text).toBe("#8f5e27");
      expect(semanticColors.feedback.error.text).toBe("#7f3131");
      expect(semanticColors.feedback.info.text).toBe("#2b6d8f");
    });

    it("ensures canonical compatibility mappings exist in index.css for primary tokens", () => {
      const cssPath = path.resolve(__dirname, "../index.css");
      const cssContent = fs.readFileSync(cssPath, "utf8");

      expect(cssContent).toContain("--color-primary-default: var(--color-primary);");
      expect(cssContent).toContain("--color-primary-contrast: #ffffff;");
      expect(cssContent).toContain("--color-primary-foreground: #ffffff;");
      expect(cssContent).toContain("--avana-success-text: #2a624b;");
      expect(cssContent).toContain("--avana-warning-text: #8f5e27;");
      expect(cssContent).toContain("--avana-error-text: #7f3131;");
      expect(cssContent).toContain("--avana-info-text: #2b6d8f;");
    });
  });
});
