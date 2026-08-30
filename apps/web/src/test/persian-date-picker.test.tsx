import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PersianDatePicker } from "../components/ui/PersianDatePicker.js";

describe("PersianDatePicker Component", () => {
  afterEach(() => {
    cleanup();
  });
  it("renders with placeholder and calendar icon when empty", () => {
    render(
      <PersianDatePicker
        id="test-picker"
        label="تاریخ آزمون"
        value=""
        onChange={() => {}}
        placeholder="انتخاب تاریخ..."
      />,
    );

    expect(screen.getByText("تاریخ آزمون")).toBeInTheDocument();
    expect(screen.getByText("انتخاب تاریخ...")).toBeInTheDocument();
  });

  it("renders formatted Persian date when valid ISO string is provided", () => {
    // 2026-08-20 -> 29 Mordad 1405
    render(
      <PersianDatePicker
        id="test-picker"
        value="2026-08-20"
        onChange={() => {}}
      />,
    );

    expect(screen.getByText(/مرداد/)).toBeInTheDocument();
    expect(screen.getByText(/۱۴۰۵/)).toBeInTheDocument();
    expect(screen.getByText("شمسی")).toBeInTheDocument();
  });

  it("opens calendar dialog on click and closes on escape", () => {
    render(
      <PersianDatePicker
        id="test-picker"
        value="2026-08-20"
        onChange={() => {}}
      />,
    );

    const trigger = screen.getByRole("button", { name: /تاریخ برگزاری امتحان/i });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "تقویم انتخاب تاریخ شمسی" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("navigates next and previous months in Jalali calendar", () => {
    render(
      <PersianDatePicker
        id="test-picker"
        value="2026-08-20" // 29 Mordad (Month 5) 1405
        onChange={() => {}}
      />,
    );

    const trigger = screen.getByRole("button", { name: /تاریخ برگزاری امتحان/i });
    fireEvent.click(trigger);

    const monthSelect = screen.getByLabelText("انتخاب ماه") as HTMLSelectElement;
    expect(monthSelect.value).toBe("5"); // Mordad

    // Click next month
    const nextBtn = screen.getByRole("button", { name: "ماه بعد" });
    fireEvent.click(nextBtn);
    expect(monthSelect.value).toBe("6"); // Shahrivar

    // Click prev month
    const prevBtn = screen.getByRole("button", { name: "ماه قبل" });
    fireEvent.click(prevBtn);
    expect(monthSelect.value).toBe("5"); // Mordad
  });

  it("allows selecting a future day and calls onChange with Gregorian ISO date", () => {
    const handleChange = vi.fn();
    render(
      <PersianDatePicker
        id="test-picker"
        value="2026-08-20" // 1405-05-29
        onChange={handleChange}
        minDate="2026-08-20"
      />,
    );

    const trigger = screen.getByRole("button", { name: /تاریخ برگزاری امتحان/i });
    fireEvent.click(trigger);

    // Click 30 Mordad (day 30)
    const day30Btn = screen.getByRole("button", { name: /۳۰ مرداد ۱۴۰۵/i });
    fireEvent.click(day30Btn);

    expect(handleChange).toHaveBeenCalledWith("2026-08-21");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("disables dates before minDate", () => {
    render(
      <PersianDatePicker
        id="test-picker"
        value="2026-08-20" // 1405-05-29
        onChange={() => {}}
        minDate="2026-08-20" // 29 Mordad is minDate
      />,
    );

    const trigger = screen.getByRole("button", { name: /تاریخ برگزاری امتحان/i });
    fireEvent.click(trigger);

    // Day 28 Mordad should be disabled
    const day28Btn = screen.getByRole("button", { name: /۲۸ مرداد ۱۴۰۵/i });
    expect(day28Btn).toBeDisabled();

    // Day 29 Mordad should be enabled
    const day29Btn = screen.getByRole("button", { name: /۲۹ مرداد ۱۴۰۵/i });
    expect(day29Btn).not.toBeDisabled();
  });

  it("renders popup via React Portal into document.body to break out of overflow:hidden containers", () => {
    const { container } = render(
      <div style={{ overflow: "hidden", height: "50px", width: "200px" }}>
        <PersianDatePicker
          id="overflow-picker"
          value="2026-08-20"
          onChange={() => {}}
        />
      </div>,
    );

    const trigger = screen.getByRole("button", { name: /تاریخ برگزاری امتحان/i });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "تقویم انتخاب تاریخ شمسی" });
    // The dialog should be rendered into document.body, not inside the overflow:hidden wrapper
    expect(dialog.parentElement).toBe(document.body);
    expect(container.contains(dialog)).toBe(false);
  });
});
