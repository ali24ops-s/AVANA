import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Checkbox, Radio, Switch } from "@avana/ui";
import { AdminCourseDeleteModal } from "../components/admin/courses/AdminCourseDeleteModal";
import { FileTable } from "../components/files/FileTable";

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("Phase 2E — Canonical Toggle Primitives (@avana/ui)", () => {
  it("renders Checkbox with label and description correctly", () => {
    const handleChange = vi.fn();
    render(
      <Checkbox
        label="گزینه نمونه"
        description="توضیحات تکمیلی"
        checked={true}
        onChange={handleChange}
      />
    );

    const input = screen.getByRole("checkbox");
    expect(input).toBeInTheDocument();
    expect(input).toBeChecked();
    expect(screen.getByText("گزینه نمونه")).toBeInTheDocument();
    expect(screen.getByText("توضیحات تکمیلی")).toBeInTheDocument();

    fireEvent.click(input);
    expect(handleChange).toHaveBeenCalled();
  });

  it("renders Radio with label correctly and manages selection", () => {
    const handleChange = vi.fn();
    render(
      <div>
        <Radio
          name="testGroup"
          value="val1"
          label="انتخاب اول"
          checked={true}
          onChange={handleChange}
        />
        <Radio
          name="testGroup"
          value="val2"
          label="انتخاب دوم"
          checked={false}
          onChange={handleChange}
        />
      </div>
    );

    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(2);
    expect(radios[0]).toBeChecked();
    expect(radios[1]).not.toBeChecked();

    fireEvent.click(radios[1]);
    expect(handleChange).toHaveBeenCalled();
  });

  it("renders Switch primitive and toggles correctly", () => {
    const handleChange = vi.fn();
    render(
      <Switch
        label="حالت آزمایشی"
        checked={false}
        onChange={handleChange}
      />
    );

    const button = screen.getByRole("switch");
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("حالت آزمایشی")).toBeInTheDocument();

    fireEvent.click(button);
    expect(handleChange).toHaveBeenCalledWith(true);
  });

  it("renders FileTable select-all and item checkboxes with proper accessibility and state across desktop/mobile", () => {
    const onSelectAll = vi.fn();
    const onSelectOne = vi.fn();
    const mockDoc = {
      id: "doc-1",
      user_id: "u1",
      filename: "test.pdf",
      original_name: "سند تستی.pdf",
      mime_type: "application/pdf",
      size_bytes: 1024,
      status: "ready" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    render(
      <FileTable
        documents={[mockDoc]}
        selectedIds={[]}
        onSelectAll={onSelectAll}
        onSelectOne={onSelectOne}
        onDelete={vi.fn()}
        onBulkDelete={vi.fn()}
        onAttachToCourse={vi.fn()}
        onViewDetails={vi.fn()}
      />
    );

    // Select all checkbox in table header
    const selectAllCheckbox = screen.getByRole("checkbox", { name: "انتخاب همه فایل‌ها" });
    expect(selectAllCheckbox).toBeInTheDocument();
    expect(selectAllCheckbox).not.toBeChecked();

    fireEvent.click(selectAllCheckbox);
    expect(onSelectAll).toHaveBeenCalled();

    // Desktop and mobile row checkboxes
    const rowCheckboxes = screen.getAllByRole("checkbox", { name: `انتخاب ${mockDoc.original_name}` });
    expect(rowCheckboxes.length).toBe(2); // One in desktop <tr>, one in mobile card
    expect(rowCheckboxes[0]).not.toBeChecked();

    fireEvent.click(rowCheckboxes[0]);
    expect(onSelectOne).toHaveBeenCalledWith("doc-1", true);
  });

  it("renders AdminCourseDeleteModal delete-sources canonical Checkbox correctly", () => {
    renderWithQueryClient(
      <AdminCourseDeleteModal
        isOpen={true}
        onClose={vi.fn()}
        course={{
          id: "course-1",
          name: "دوره جامع تستی",
          title: "دوره جامع تستی",
          slug: "test-course",
          status: "published",
          price_irr: 0,
        } as any}
        onSuccess={vi.fn()}
      />
    );

    const checkbox = screen.getByRole("checkbox", {
      name: /حذف اسناد و فایل‌های منبع اختصاصی/i,
    });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});
