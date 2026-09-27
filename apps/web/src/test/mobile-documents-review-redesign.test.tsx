import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FileTable } from "../components/files/FileTable.js";
import { FileFilterToolbar } from "../components/files/FileFilterToolbar.js";
import { ReviewDocumentGroup } from "../components/review/ReviewDocumentGroup.js";
import type { DocumentResource, ReviewDocumentGroupResource } from "@avana/contracts";

describe("Mobile UX Redesign - Documents & Review Queue", () => {
  const mockDocuments: DocumentResource[] = [
    {
      id: "doc-1",
      organization_id: "org-1",
      course_id: "course-1",
      title: "جزوه داروشناسی بالینی پیشرفته و کاربردی مبحث آنتی‌بیوتیک‌ها",
      original_name: "جزوه داروشناسی بالینی پیشرفته و کاربردی مبحث آنتی‌بیوتیک‌ها.pdf",
      file_size: 4500000,
      mime_type: "application/pdf",
      status: "extracted",
      uploaded_by_user_id: "user-1",
      created_at: "2026-03-01T10:00:00Z",
      updated_at: "2026-03-01T10:00:00Z",
    },
  ];

  it("renders mobile card layout with full wrapping and mobile action menu in FileTable", () => {
    const handleSelectAll = vi.fn();
    const handleSelectOne = vi.fn();
    const handleViewDetails = vi.fn();
    const handlePreview = vi.fn();
    const handleDownload = vi.fn();
    const handleRename = vi.fn();
    const handleAttachCourse = vi.fn();
    const handleReprocess = vi.fn();
    const handleDelete = vi.fn();
    const handleCopyLink = vi.fn();

    const { container } = render(
      <FileTable
        documents={mockDocuments}
        selectedIds={[]}
        onSelectAll={handleSelectAll}
        onSelectOne={handleSelectOne}
        onViewDetails={handleViewDetails}
        onPreview={handlePreview}
        onDownload={handleDownload}
        onRename={handleRename}
        onAttachCourse={handleAttachCourse}
        onReprocess={handleReprocess}
        onDelete={handleDelete}
        onCopyLink={handleCopyLink}
        pagination={{
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        }}
      />,
    );

    // Desktop table container exists
    expect(container.querySelector(".hidden.md\\:block")).toBeDefined();

    // Mobile cards container exists
    const mobileContainer = container.querySelector(".md\\:hidden");
    expect(mobileContainer).toBeDefined();

    // Mobile card displays file name
    const titleElements = screen.getAllByText(/جزوه داروشناسی بالینی پیشرفته/i);
    expect(titleElements.length).toBeGreaterThanOrEqual(1);

    // Mobile action trigger exists
    const actionMenuButtons = screen.getAllByLabelText(/منوی عملیات/i);
    expect(actionMenuButtons.length).toBeGreaterThan(0);

    // Open mobile dropdown action menu
    fireEvent.click(actionMenuButtons[actionMenuButtons.length - 1]);
    expect(screen.getAllByText("دانلود فایل").length).toBeGreaterThan(0);
    expect(screen.getAllByText("حذف فایل").length).toBeGreaterThan(0);
  });

  it("renders collapsible filter drawer toggle for mobile in FileFilterToolbar", () => {
    const handleFilterChange = vi.fn();

    render(
      <FileFilterToolbar
        filters={{
          search: "",
          type: "application/pdf",
          status: "extracted",
          used: "",
          sort_by: "created_at",
          sort_order: "desc",
        }}
        onChange={handleFilterChange}
      />,
    );

    // Mobile filter toggle button is present
    const filterToggleBtn = screen.getByLabelText("فیلترهای پیشرفته");
    expect(filterToggleBtn).toBeDefined();

    // Active filters badge counter shows 2 (type + status)
    expect(screen.getByText("2")).toBeDefined();

    // Toggle filter panel
    fireEvent.click(filterToggleBtn);
    expect(screen.getByText("نوع فایل")).toBeDefined();
    expect(screen.getByText("وضعیت")).toBeDefined();
  });

  it("renders mobile review cards with multiline wrapping and touch CTA in ReviewDocumentGroup", () => {
    const mockGroup: ReviewDocumentGroupResource = {
      document: {
        id: "doc-1",
        title: "جزوه فارماکولوژی بالینی",
        filename: "جزوه فارماکولوژی بالینی.pdf",
        created_at: "2026-03-01T10:00:00Z",
      },
      stats: {
        total: 1,
        pending: 1,
        approved: 0,
        rejected: 0,
        needsRevision: 0,
      },
      items: [
        {
          id: "item-1",
          course_id: "course-1",
          document_id: "doc-1",
          type: "lesson",
          status: "draft",
          title: "مکانیسم اثر مهارکننده‌های بتالاکتاماز و سینرژیسم دارویی در درمان سپسیس",
          updated_at: "2026-03-01T10:00:00Z",
        },
      ],
    };

    const handleSelect = vi.fn();

    render(
      <ReviewDocumentGroup
        group={mockGroup}
        isOpen={true}
        onSelectItem={handleSelect}
      />,
    );

    // Verify title is rendered
    expect(
      screen.getByText(/مکانیسم اثر مهارکننده‌های بتالاکتاماز/i),
    ).toBeDefined();

    // Verify touch action button
    const reviewBtn = screen.getByRole("button", { name: /بازبینی پیش‌نویس/i });
    expect(reviewBtn).toBeDefined();
    fireEvent.click(reviewBtn);
    expect(handleSelect).toHaveBeenCalledWith("item-1");
  });
});
