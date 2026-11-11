import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AvanaSelect } from "@avana/ui";

describe("AvanaSelect Component Tests", () => {
  const options = [
    { value: "opt1", label: "گزینه ۱", group: "گروه الف" },
    { value: "opt2", label: "گزینه ۲", group: "گروه الف" },
    { value: "opt3", label: "گزینه ۳", group: "گروه ب" },
  ];

  it("renders trigger with default placeholder and size classes", () => {
    render(<AvanaSelect options={options} placeholder="انتخاب کنید..." />);
    const trigger = screen.getByRole("combobox");
    expect(trigger).toBeDefined();
    expect(screen.getByText("انتخاب کنید...")).toBeDefined();
    // Default size is md: min-h-[44px] sm:min-h-[38px]
    expect(trigger.className).toContain("min-h-[44px]");
    expect(trigger.className).toContain("sm:min-h-[38px]");
  });

  it("supports size='sm' with mobile touch target 40px and desktop 34px", () => {
    render(<AvanaSelect options={options} size="sm" placeholder="کوچک" />);
    const trigger = screen.getByRole("combobox");
    expect(trigger.className).toContain("min-h-[40px]");
    expect(trigger.className).toContain("sm:min-h-[34px]");
  });

  it("supports clearable and clears selection", () => {
    const handleChange = vi.fn();
    const handleClear = vi.fn();
    render(
      <AvanaSelect
        options={options}
        value="opt1"
        clearable={true}
        onChange={handleChange}
        onClear={handleClear}
      />
    );
    expect(screen.getByText("گزینه ۱")).toBeDefined();
    const clearBtn = screen.getByLabelText("پاک کردن انتخاب");
    expect(clearBtn).toBeDefined();
    fireEvent.click(clearBtn);
    expect(handleChange).toHaveBeenCalledWith("");
    expect(handleClear).toHaveBeenCalled();
  });

  it("renders group headers when options have groups", () => {
    render(<AvanaSelect options={options} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByText("گروه الف")).toBeDefined();
    expect(screen.getByText("گروه ب")).toBeDefined();
  });

  it("filters options when searchable", () => {
    render(<AvanaSelect options={options} isSearchable={true} />);
    fireEvent.click(screen.getByRole("combobox"));
    const searchInput = screen.getByPlaceholderText("جستجو در گزینه‌ها...");
    fireEvent.change(searchInput, { target: { value: "گزینه ۲" } });
    expect(screen.getByText("گزینه ۲")).toBeDefined();
    expect(screen.queryByText("گزینه ۳")).toBeNull();
  });

  it("renders through portal when usePortal is true", () => {
    render(<AvanaSelect options={options} usePortal={true} />);
    fireEvent.click(screen.getByRole("combobox"));
    const listbox = screen.getByRole("listbox");
    // Listbox is rendered in document.body
    expect(listbox.parentElement).toBe(document.body);
  });
});
