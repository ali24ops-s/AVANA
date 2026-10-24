import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useCardSwipeFlip, type UseCardSwipeFlipOptions } from "../hooks/useCardSwipeFlip.js";
import { useState } from "react";

function TestFlashcard(props: Partial<UseCardSwipeFlipOptions> & { onEditClick?: () => void }) {
  const [isFlipped, setIsFlipped] = useState(false);
  const { onEditClick, ...options } = props;

  const handleFlip = () => {
    setIsFlipped((prev) => !prev);
    options.onFlip?.();
  };

  const { swipeProps } = useCardSwipeFlip({
    onFlip: handleFlip,
    threshold: options.threshold ?? 40,
    dragDetectionThreshold: options.dragDetectionThreshold ?? 8,
    enabled: options.enabled ?? true,
  });

  return (
    <div
      id="flashcard"
      data-testid="flashcard-card"
      data-flipped={String(isFlipped)}
      onClick={handleFlip}
      onKeyDown={(e) => {
        if (e.code === "Space" || e.key === " ") {
          e.preventDefault();
          handleFlip();
        }
      }}
      tabIndex={0}
      role="button"
      {...swipeProps}
    >
      <div className="top-bar">
        <button
          data-testid="edit-card-btn"
          onClick={(e) => {
            e.stopPropagation();
            onEditClick?.();
          }}
        >
          ویرایش
        </button>
      </div>

      <div className="card-body">
        {isFlipped ? (
          <span data-testid="answer-text">پاسخ تست فلش‌کارت</span>
        ) : (
          <span data-testid="question-text">سوال تست فلش‌کارت</span>
        )}
      </div>

      <div className="bottom-bar">
        <button
          data-testid="prev-card-btn"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          قبلی
        </button>
      </div>
    </div>
  );
}

describe("Flashcard Swipe to Flip Interaction", () => {
  it("flips card from Question to Answer with horizontal swipe left beyond threshold", () => {
    const onFlip = vi.fn();
    render(<TestFlashcard onFlip={onFlip} threshold={40} />);
    const card = screen.getByTestId("flashcard-card");

    expect(screen.getByTestId("question-text")).toBeInTheDocument();
    expect(screen.queryByTestId("answer-text")).toBeNull();

    // Swipe left (dx = -50)
    fireEvent.pointerDown(card, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerMove(card, { clientX: 50, clientY: 100, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerUp(card, { clientX: 50, clientY: 100, pointerId: 1, pointerType: "touch" });

    expect(onFlip).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("answer-text")).toBeInTheDocument();
  });

  it("flips card from Question to Answer with horizontal swipe right beyond threshold", () => {
    const onFlip = vi.fn();
    render(<TestFlashcard onFlip={onFlip} threshold={40} />);
    const card = screen.getByTestId("flashcard-card");

    // Swipe right (dx = +55)
    fireEvent.pointerDown(card, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerMove(card, { clientX: 155, clientY: 100, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerUp(card, { clientX: 155, clientY: 100, pointerId: 1, pointerType: "touch" });

    expect(onFlip).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("answer-text")).toBeInTheDocument();
  });

  it("flips card from Answer back to Question with swipe", () => {
    const onFlip = vi.fn();
    render(<TestFlashcard onFlip={onFlip} threshold={40} />);
    const card = screen.getByTestId("flashcard-card");

    // First flip to answer
    fireEvent.pointerDown(card, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerMove(card, { clientX: 50, clientY: 100, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerUp(card, { clientX: 50, clientY: 100, pointerId: 1, pointerType: "touch" });
    expect(screen.getByTestId("answer-text")).toBeInTheDocument();

    // Second swipe flips back to question
    fireEvent.pointerDown(card, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerMove(card, { clientX: 160, clientY: 100, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerUp(card, { clientX: 160, clientY: 100, pointerId: 1, pointerType: "touch" });

    expect(onFlip).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("question-text")).toBeInTheDocument();
  });

  it("does not flip card when swipe distance is below threshold", () => {
    const onFlip = vi.fn();
    render(<TestFlashcard onFlip={onFlip} threshold={40} />);
    const card = screen.getByTestId("flashcard-card");

    // Move only 20px (less than threshold 40)
    fireEvent.pointerDown(card, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerMove(card, { clientX: 80, clientY: 100, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerUp(card, { clientX: 80, clientY: 100, pointerId: 1, pointerType: "touch" });

    expect(onFlip).not.toHaveBeenCalled();
    expect(screen.getByTestId("question-text")).toBeInTheDocument();
  });

  it("does not flip card on vertical movement to allow normal page scrolling", () => {
    const onFlip = vi.fn();
    render(<TestFlashcard onFlip={onFlip} threshold={40} />);
    const card = screen.getByTestId("flashcard-card");

    // Move vertically 60px down with 4px horizontal movement
    fireEvent.pointerDown(card, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerMove(card, { clientX: 104, clientY: 160, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerUp(card, { clientX: 104, clientY: 160, pointerId: 1, pointerType: "touch" });

    expect(onFlip).not.toHaveBeenCalled();
    expect(screen.getByTestId("question-text")).toBeInTheDocument();
  });

  it("preserves click to flip the card", () => {
    const onFlip = vi.fn();
    render(<TestFlashcard onFlip={onFlip} />);
    const card = screen.getByTestId("flashcard-card");

    // Normal tap / click
    fireEvent.pointerDown(card, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "mouse", button: 0 });
    fireEvent.pointerUp(card, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "mouse" });
    fireEvent.click(card);

    expect(onFlip).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("answer-text")).toBeInTheDocument();
  });

  it("preserves Space key to flip the card", () => {
    const onFlip = vi.fn();
    render(<TestFlashcard onFlip={onFlip} />);
    const card = screen.getByTestId("flashcard-card");

    fireEvent.keyDown(card, { code: "Space", key: " " });

    expect(onFlip).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("answer-text")).toBeInTheDocument();
  });

  it("does not trigger card flip when clicking internal buttons like edit or previous", () => {
    const onFlip = vi.fn();
    const onEditClick = vi.fn();
    render(<TestFlashcard onFlip={onFlip} onEditClick={onEditClick} />);

    const editBtn = screen.getByTestId("edit-card-btn");
    fireEvent.pointerDown(editBtn, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "mouse", button: 0 });
    fireEvent.pointerUp(editBtn, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "mouse" });
    fireEvent.click(editBtn);

    expect(onEditClick).toHaveBeenCalledTimes(1);
    expect(onFlip).not.toHaveBeenCalled();
    expect(screen.getByTestId("question-text")).toBeInTheDocument();
  });

  it("resets swipe without flipping when pointercancel occurs", () => {
    const onFlip = vi.fn();
    render(<TestFlashcard onFlip={onFlip} threshold={40} />);
    const card = screen.getByTestId("flashcard-card");

    fireEvent.pointerDown(card, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerMove(card, { clientX: 40, clientY: 100, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerCancel(card, { pointerId: 1 });

    expect(onFlip).not.toHaveBeenCalled();
    expect(screen.getByTestId("question-text")).toBeInTheDocument();
  });

  it("flips only once per gesture and suppresses subsequent synthetic click", () => {
    const onFlip = vi.fn();
    render(<TestFlashcard onFlip={onFlip} threshold={40} />);
    const card = screen.getByTestId("flashcard-card");

    // Perform swipe
    fireEvent.pointerDown(card, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "mouse", button: 0 });
    fireEvent.pointerMove(card, { clientX: 40, clientY: 100, pointerId: 1, pointerType: "mouse" });
    fireEvent.pointerUp(card, { clientX: 40, clientY: 100, pointerId: 1, pointerType: "mouse" });

    // Browser fires synthetic click right after pointerup
    fireEvent.click(card);

    // Flip must have been called EXACTLY ONCE, not twice!
    expect(onFlip).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("answer-text")).toBeInTheDocument();
  });
});
