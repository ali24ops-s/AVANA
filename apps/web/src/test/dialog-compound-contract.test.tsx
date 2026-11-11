import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
} from "@avana/ui";
import { CourseDeleteConfirmModal } from "../components/courses/CourseDeleteConfirmModal.js";
import { ExamDeleteConfirmModal } from "../components/courses/ExamDeleteConfirmModal.js";
import { ContentRepairModal } from "../components/admin/repair/ContentRepairModal.js";

describe("Dialog — Compound Contract & Nested Box Hardening", () => {
  it("1. Simple Dialog with title and description renders auto DialogHeader with single close button and auto DialogContent", () => {
    const handleClose = vi.fn();
    render(
      <Dialog
        isOpen={true}
        onClose={handleClose}
        title="عنوان تستی دیالوگ ساده"
        description="توضیح کوتاه تستی"
      >
        <p>محتوای ساده بدون Compound</p>
      </Dialog>
    );

    // Title & description present
    expect(screen.getByText("عنوان تستی دیالوگ ساده")).toBeInTheDocument();
    expect(screen.getByText("توضیح کوتاه تستی")).toBeInTheDocument();
    expect(screen.getByText("محتوای ساده بدون Compound")).toBeInTheDocument();

    // Exactly one close button
    const closeButtons = screen.getAllByRole("button", { name: "بستن پنجره" });
    expect(closeButtons).toHaveLength(1);

    // Content is wrapped in DialogContent (has flex-1 overflow-y-auto)
    const contentEl = screen.getByText("محتوای ساده بدون Compound").parentElement;
    expect(contentEl?.className).toContain("overflow-y-auto");
  });

  it("2. Simple Dialog with hideHeader does not render any DialogHeader or close button", () => {
    const handleClose = vi.fn();
    render(
      <Dialog
        isOpen={true}
        onClose={handleClose}
        hideHeader={true}
      >
        <div data-testid="raw-content">محتوای دیالوگ بدون هدر</div>
      </Dialog>
    );

    expect(screen.queryByRole("button", { name: "بستن پنجره" })).not.toBeInTheDocument();
    expect(screen.getByTestId("raw-content")).toBeInTheDocument();
  });

  it("3. Compound Dialog with DialogHeader, DialogContent, and DialogFooter renders without duplicate header or extra wrappers", () => {
    const handleClose = vi.fn();
    render(
      <Dialog isOpen={true} onClose={handleClose} isCompound={true}>
        <DialogHeader onClose={handleClose}>
          <h2>هدر صریح کامپاند</h2>
        </DialogHeader>
        <DialogContent>
          <p>بدنه کامپاند</p>
        </DialogContent>
        <DialogFooter>
          <button type="button">تایید</button>
        </DialogFooter>
      </Dialog>
    );

    expect(screen.getByText("هدر صریح کامپاند")).toBeInTheDocument();
    expect(screen.getByText("بدنه کامپاند")).toBeInTheDocument();
    expect(screen.getByText("تایید")).toBeInTheDocument();

    // Only 1 close button from DialogHeader, no auto-injected duplicate header
    const closeButtons = screen.getAllByRole("button", { name: "بستن پنجره" });
    expect(closeButtons).toHaveLength(1);
  });

  it("4. Compound Dialog with Fragment unwraps cleanly and does not inject auto-header", () => {
    const handleClose = vi.fn();
    render(
      <Dialog isOpen={true} onClose={handleClose}>
        <>
          <DialogHeader onClose={handleClose}>
            <h2>هدر درون فرگمنت</h2>
          </DialogHeader>
          <DialogContent>
            <p>محتوای درون فرگمنت</p>
          </DialogContent>
        </>
      </Dialog>
    );

    expect(screen.getByText("هدر درون فرگمنت")).toBeInTheDocument();
    const closeButtons = screen.getAllByRole("button", { name: "بستن پنجره" });
    expect(closeButtons).toHaveLength(1);
  });

  it("5. Compound Dialog with <form> wrapper detects compound subcomponents at depth", () => {
    const handleClose = vi.fn();
    const handleSubmit = vi.fn((e) => e.preventDefault());

    render(
      <Dialog isOpen={true} onClose={handleClose}>
        <form onSubmit={handleSubmit}>
          <DialogHeader onClose={handleClose}>
            <h2>هدر درون فرم</h2>
          </DialogHeader>
          <DialogContent>
            <input placeholder="نام" />
          </DialogContent>
          <DialogFooter>
            <button type="submit">ارسال</button>
          </DialogFooter>
        </form>
      </Dialog>
    );

    expect(screen.getByText("هدر درون فرم")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("نام")).toBeInTheDocument();
    expect(screen.getByText("ارسال")).toBeInTheDocument();

    // No auto-injected header
    const closeButtons = screen.getAllByRole("button", { name: "بستن پنجره" });
    expect(closeButtons).toHaveLength(1);
  });

  it("6. isCompound={true} with custom component renders children directly without auto-injected DialogContent padding or headers", () => {
    const handleClose = vi.fn();
    function CustomChatView() {
      return (
        <div data-testid="custom-chat" className="h-full flex flex-col">
          <header data-testid="chat-header">چت اختصاصی</header>
          <main className="flex-1">پیام‌ها</main>
        </div>
      );
    }

    render(
      <Dialog isOpen={true} onClose={handleClose} isCompound={true}>
        <CustomChatView />
      </Dialog>
    );

    // No DialogHeader injected
    expect(screen.queryByRole("button", { name: "بستن پنجره" })).not.toBeInTheDocument();

    // The CustomChatView is rendered directly without being wrapped in DialogContent's "p-4 sm:p-6 text-start"
    const chatEl = screen.getByTestId("custom-chat");
    expect(chatEl.parentElement?.className).not.toContain("p-4 sm:p-6");
  });

  it("7. Stacked Dialogs handle Escape key in LIFO order (only top-most dialog closes on Escape)", () => {
    const handleCloseUnderlying = vi.fn();
    const handleCloseTop = vi.fn();

    // Render underlying dialog
    const { rerender } = render(
      <Dialog isOpen={true} onClose={handleCloseUnderlying} title="دیالوگ زیرین">
        <p>محتوای دیالوگ ۱</p>
      </Dialog>
    );

    // Render top dialog on top of it
    rerender(
      <>
        <Dialog isOpen={true} onClose={handleCloseUnderlying} title="دیالوگ زیرین">
          <p>محتوای دیالوگ ۱</p>
        </Dialog>
        <Dialog isOpen={true} onClose={handleCloseTop} title="دیالوگ بالایی">
          <p>محتوای دیالوگ ۲</p>
        </Dialog>
      </>
    );

    // Press Escape
    fireEvent.keyDown(window, { key: "Escape" });

    // ONLY the top dialog's onClose should have been called!
    expect(handleCloseTop).toHaveBeenCalledTimes(1);
    expect(handleCloseUnderlying).not.toHaveBeenCalled();
  });

  it("8. CourseDeleteConfirmModal renders with single padding, confirms, and cancels", () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn();

    const { rerender } = render(
      <CourseDeleteConfirmModal
        open={true}
        courseTitle="شیمی دهم"
        onClose={handleClose}
        onConfirm={handleConfirm}
        isDeleting={false}
      />
    );

    expect(screen.getByText("حذف از دوره‌های من")).toBeInTheDocument();
    expect(screen.getByText("«شیمی دهم»")).toBeInTheDocument();

    // Cancel click
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Confirm click
    fireEvent.click(screen.getByRole("button", { name: "حذف دوره" }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);

    // When deleting is true, show loader and disable buttons
    rerender(
      <CourseDeleteConfirmModal
        open={true}
        courseTitle="شیمی دهم"
        onClose={handleClose}
        onConfirm={handleConfirm}
        isDeleting={true}
      />
    );
    expect(screen.getByText("در حال حذف...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "در حال حذف..." })).toBeDisabled();
  });

  it("9. ExamDeleteConfirmModal renders with single padding, confirms, and cancels", async () => {
    const handleClose = vi.fn();
    const handleConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <ExamDeleteConfirmModal
        open={true}
        courseTitle="زیست‌شناسی یازدهم"
        onClose={handleClose}
        onConfirm={handleConfirm}
      />
    );

    expect(screen.getByText("لغو ثبت امتحان")).toBeInTheDocument();
    expect(screen.getByText("«زیست‌شناسی یازدهم»")).toBeInTheDocument();

    // Cancel click
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Confirm click
    fireEvent.click(screen.getByRole("button", { name: "حذف ثبت امتحان" }));
    expect(handleConfirm).toHaveBeenCalledTimes(1);
  });

  it("10. React StrictMode mount/unmount/remount does not leak openDialogStack callbacks and preserves nested Escape order", () => {
    const handleCloseParent = vi.fn();
    const handleCloseChild = vi.fn();

    interface StrictProps {
      isParentOpen: boolean;
      isChildOpen: boolean;
    }

    function StrictHarness({ isParentOpen, isChildOpen }: StrictProps) {
      return (
        <React.StrictMode>
          {isParentOpen && (
            <Dialog isOpen={isParentOpen} onClose={handleCloseParent} title="دیالوگ والد">
              <p>محتوای والد</p>
              {isChildOpen && (
                <Dialog isOpen={isChildOpen} onClose={handleCloseChild} title="دیالوگ فرزند">
                  <p>محتوای فرزند</p>
                </Dialog>
              )}
            </Dialog>
          )}
        </React.StrictMode>
      );
    }

    // Mount parent in StrictMode
    const { rerender } = render(<StrictHarness isParentOpen={true} isChildOpen={false} />);
    expect(screen.getByText("دیالوگ والد")).toBeInTheDocument();

    // Now open child dialog on top of parent in StrictMode
    rerender(<StrictHarness isParentOpen={true} isChildOpen={true} />);
    expect(screen.getByText("دیالوگ فرزند")).toBeInTheDocument();

    // 1st Escape: ONLY the child dialog must close!
    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleCloseChild).toHaveBeenCalledTimes(1);
    expect(handleCloseParent).not.toHaveBeenCalled();

    // Simulate child closing in parent state
    rerender(<StrictHarness isParentOpen={true} isChildOpen={false} />);
    expect(screen.queryByText("دیالوگ فرزند")).not.toBeInTheDocument();
    expect(screen.getByText("دیالوگ والد")).toBeInTheDocument();

    // 2nd Escape: Now the parent dialog must close!
    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleCloseParent).toHaveBeenCalledTimes(1);

    // Simulate parent closing in state
    rerender(<StrictHarness isParentOpen={false} isChildOpen={false} />);
    expect(screen.queryByText("دیالوگ والد")).not.toBeInTheDocument();

    // 3rd Escape: Both are closed; no callbacks should be called again
    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleCloseChild).toHaveBeenCalledTimes(1);
    expect(handleCloseParent).toHaveBeenCalledTimes(1);
  });

  it("11. ContentRepairModal renders via shared Dialog with isCompound={true}, Portal, and handles Escape and Cancel", () => {
    const handleClose = vi.fn();
    const handleApplySuccess = vi.fn();

    const mockPreviewData = {
      originalContent: "متن نمونه با خطا",
      originalHash: "hash-123",
      candidates: [
        {
          blockIndex: 0,
          ruleId: "broken-whitespace",
          ruleLabel: "شکستگی نامناسب سطرها",
          confidence: 0.95,
          before: "خطای سطر",
          after: "اصلاح سطر",
        },
      ],
    };

    render(
      <ContentRepairModal
        isOpen={true}
        onClose={handleClose}
        previewData={mockPreviewData}
        onApplySuccess={handleApplySuccess}
      />
    );

    // Title and subcomponents rendered
    expect(screen.getByText("اصلاح هوشمند و ساختاری محتوا")).toBeInTheDocument();
    expect(screen.getByText("قبل از اصلاح:")).toBeInTheDocument();
    expect(screen.getByText("بعد از اصلاح:")).toBeInTheDocument();

    // Exactly one close button in DialogHeader
    const closeButtons = screen.getAllByRole("button", { name: "بستن پنجره" });
    expect(closeButtons).toHaveLength(1);

    // Escape closes the modal
    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledTimes(1);

    // Cancel button in footer closes the modal
    fireEvent.click(screen.getByRole("button", { name: "انصراف" }));
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});

