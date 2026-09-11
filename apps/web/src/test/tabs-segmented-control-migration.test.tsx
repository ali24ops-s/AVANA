import { describe, it, expect, vi } from "vitest";
import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Tabs, SegmentedControl } from "@avana/ui";
import { FileDetailsDrawer } from "../components/files/FileDetailsDrawer";
import { UserDevicesDrawer } from "../components/admin/devices/UserDevicesDrawer";
import { ProductExperienceSection } from "../components/landing/ProductExperienceSection";
import { AdminBlogEditor } from "../components/admin/blog/AdminBlogEditor";

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Phase 2F — Canonical Tabs & SegmentedControl (@avana/ui)", () => {
  it("renders canonical Tabs (underline) with active state, icons and badges", () => {
    const handleChange = vi.fn();
    const items = [
      { id: "tab1", label: "تب اول", badge: 5 },
      { id: "tab2", label: "تب دوم", badge: "جدید" },
    ];

    render(
      <Tabs
        items={items}
        activeTabId="tab1"
        onChange={handleChange}
        variant="underline"
      />
    );

    expect(screen.getByText("تب اول")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("تب دوم")).toBeInTheDocument();
    expect(screen.getByText("جدید")).toBeInTheDocument();

    fireEvent.click(screen.getByText("تب دوم"));
    expect(handleChange).toHaveBeenCalledWith("tab2");
  });

  it("renders canonical Tabs (pill variant) properly", () => {
    const handleChange = vi.fn();
    const items = [
      { id: "p1", label: "گزینه ۱" },
      { id: "p2", label: "گزینه ۲" },
    ];

    render(
      <Tabs
        items={items}
        activeTabId="p2"
        onChange={handleChange}
        variant="pill"
      />
    );

    expect(screen.getByText("گزینه ۱")).toBeInTheDocument();
    expect(screen.getByText("گزینه ۲")).toBeInTheDocument();

    fireEvent.click(screen.getByText("گزینه ۱"));
    expect(handleChange).toHaveBeenCalledWith("p1");
  });

  it("renders canonical SegmentedControl and toggles values", () => {
    const handleChange = vi.fn();
    render(
      <SegmentedControl
        options={[
          { value: "edit", label: "ویرایش" },
          { value: "preview", label: "پیش‌نمایش" },
        ]}
        value="edit"
        onChange={handleChange}
      />
    );

    expect(screen.getByText("ویرایش")).toBeInTheDocument();
    expect(screen.getByText("پیش‌نمایش")).toBeInTheDocument();

    fireEvent.click(screen.getByText("پیش‌نمایش"));
    expect(handleChange).toHaveBeenCalledWith("preview");
  });

  it("integrates canonical Tabs in FileDetailsDrawer", () => {
    const mockDoc = {
      id: "doc-1",
      user_id: "u1",
      filename: "test.pdf",
      original_name: "راهنمای بالینی.pdf",
      mime_type: "application/pdf",
      size_bytes: 2048,
      status: "ready" as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      course_id: "c1",
      course_title: "فارماکولوژی",
    };

    renderWithQuery(
      <FileDetailsDrawer
        document={mockDoc}
        isOpen={true}
        onClose={vi.fn()}
        onPreview={vi.fn()}
        onDownload={vi.fn()}
        onRename={vi.fn()}
        onAttachCourse={vi.fn()}
        onReprocess={vi.fn()}
        onDelete={vi.fn()}
        getDownloadUrl={vi.fn().mockReturnValue("/url")}
      />
    );

    expect(screen.getByText("اطلاعات عمومی و فنی")).toBeInTheDocument();
    expect(screen.getByText("جریان آموزشی و AI")).toBeInTheDocument();
    expect(screen.getByText("پیش‌نمایش فایل")).toBeInTheDocument();

    // Click on educational tab
    fireEvent.click(screen.getByText("جریان آموزشی و AI"));
    expect(screen.getByText(/دروس تولیدشده/i)).toBeInTheDocument();
  });

  it("integrates canonical SegmentedControl in AdminBlogEditor", () => {
    renderWithQuery(
      <AdminBlogEditor
        categories={[]}
        isSaving={false}
        onSave={vi.fn()}
        onPublish={vi.fn()}
      />
    );

    expect(screen.getByText("فقط ویرایش")).toBeInTheDocument();
    expect(screen.getByText("نمای دوطرفه")).toBeInTheDocument();
    expect(screen.getByText("فقط پیش‌نمایش")).toBeInTheDocument();

    // Click "فقط پیش‌نمایش"
    fireEvent.click(screen.getByText("فقط پیش‌نمایش"));
  });

  it("integrates canonical Tabs in ProductExperienceSection", async () => {
    renderWithQuery(<ProductExperienceSection />);

    expect(screen.getByText("فلش‌کارت SRS")).toBeInTheDocument();
    expect(screen.getByText("دستیار هوشمند AI")).toBeInTheDocument();
    expect(screen.getByText("مسیر یادگیری")).toBeInTheDocument();
    expect(screen.getByText("آزمون خودسنجی")).toBeInTheDocument();

    // Switch to AI tab
    fireEvent.click(screen.getByText("دستیار هوشمند AI"));
    expect(
      await screen.findByText(/مراحل استدلال شناختی دستیار هوشمند/i)
    ).toBeInTheDocument();
  });

  it("integrates canonical Tabs with icons and badges in UserDevicesDrawer", () => {
    renderWithQuery(
      <UserDevicesDrawer
        isOpen={true}
        userId="user-123"
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("دستگاه‌های ثبت‌شده")).toBeInTheDocument();
    expect(screen.getByText("تلاش‌های ورود و رویدادها")).toBeInTheDocument();

    // Click attempts tab
    fireEvent.click(screen.getByText("تلاش‌های ورود و رویدادها"));
  });
});
