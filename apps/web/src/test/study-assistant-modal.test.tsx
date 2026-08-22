import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { StudyAssistantModal } from "../components/ai/StudyAssistantModal.js";

describe("StudyAssistantModal Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.style.overflow = "";
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("does not render in DOM when isOpen is false", () => {
    render(
      <StudyAssistantModal
        isOpen={false}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders via portal with dialog role, aria-modal, and locks body scroll when isOpen is true", () => {
    const { unmount } = render(
      <StudyAssistantModal
        isOpen={true}
        onClose={vi.fn()}
        contextType="dashboard"
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("از آوانا بپرس")).toBeInTheDocument();

    // Body scroll locked
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    // Body scroll restored on unmount
    expect(document.body.style.overflow).toBe("");
  });

  it("calls onClose when clicking close button (X)", () => {
    const onClose = vi.fn();
    render(
      <StudyAssistantModal
        isOpen={true}
        onClose={onClose}
      />,
    );

    const closeBtn = screen.getByRole("button", { name: /بستن دستیار/i });
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when pressing Escape key", () => {
    const onClose = vi.fn();
    render(
      <StudyAssistantModal
        isOpen={true}
        onClose={onClose}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking the backdrop overlay, but not when clicking modal content", () => {
    const onClose = vi.fn();
    render(
      <StudyAssistantModal
        isOpen={true}
        onClose={onClose}
      />,
    );

    // Click inside modal
    const chatTitle = screen.getByText("از آوانا بپرس");
    fireEvent.click(chatTitle);
    expect(onClose).not.toHaveBeenCalled();

    // Click on backdrop overlay (div with aria-hidden="true")
    const backdrop = document.querySelector(".bg-slate-950\\/65");
    expect(backdrop).toBeInTheDocument();
    if (backdrop) {
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    }
  });
});
