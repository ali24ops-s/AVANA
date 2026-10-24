import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useCarouselDrag, type UseCarouselDragOptions } from "../hooks/useCarouselDrag.js";

function TestCarousel(props: Partial<UseCarouselDragOptions> & { onCardClick?: () => void }) {
  const { onCardClick, ...dragOptions } = props;
  const { dragProps, cursorClass, isDragging } = useCarouselDrag({
    onNext: dragOptions.onNext || vi.fn(),
    onPrev: dragOptions.onPrev || vi.fn(),
    threshold: dragOptions.threshold ?? 40,
    dragDetectionThreshold: dragOptions.dragDetectionThreshold ?? 8,
    enabled: dragOptions.enabled ?? true,
    onDragStateChange: dragOptions.onDragStateChange,
  });

  return (
    <div
      data-testid="carousel-box"
      className={cursorClass}
      data-dragging={String(isDragging)}
      {...dragProps}
    >
      <a
        href="#course"
        data-testid="course-link"
        onClick={(e) => {
          e.preventDefault();
          onCardClick?.();
        }}
      >
        Course Link
      </a>
      <button data-testid="prev-btn">Prev</button>
    </div>
  );
}

describe("useCarouselDrag Hook", () => {
  it("triggers onNext when dragged to the left beyond threshold in RTL", () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const onDragStateChange = vi.fn();

    render(
      <TestCarousel
        onNext={onNext}
        onPrev={onPrev}
        threshold={40}
        onDragStateChange={onDragStateChange}
      />,
    );
    const box = screen.getByTestId("carousel-box");

    // 1. Pointer Down at (100, 100)
    fireEvent.pointerDown(box, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "mouse", button: 0 });

    // 2. Pointer Move to (80, 100) -> dx = -20 (horizontal detected, drag active)
    fireEvent.pointerMove(box, { clientX: 80, clientY: 100, pointerId: 1, pointerType: "mouse" });
    expect(onDragStateChange).toHaveBeenCalledWith(true);

    // 3. Pointer Move to (50, 100) -> dx = -50 (exceeds threshold 40)
    fireEvent.pointerMove(box, { clientX: 50, clientY: 100, pointerId: 1, pointerType: "mouse" });

    // 4. Pointer Up -> release drag
    fireEvent.pointerUp(box, { clientX: 50, clientY: 100, pointerId: 1, pointerType: "mouse" });

    // In RTL, dragging left (negative dx) means NEXT
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).not.toHaveBeenCalled();
    expect(onDragStateChange).toHaveBeenCalledWith(false);
  });

  it("triggers onPrev when dragged to the right beyond threshold in RTL", () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();

    render(<TestCarousel onNext={onNext} onPrev={onPrev} threshold={40} />);
    const box = screen.getByTestId("carousel-box");

    fireEvent.pointerDown(box, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerMove(box, { clientX: 155, clientY: 102, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerUp(box, { clientX: 155, clientY: 102, pointerId: 1, pointerType: "touch" });

    // In RTL, dragging right (positive dx) means PREV
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
  });

  it("does not trigger navigation on sub-threshold movement", () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();

    render(<TestCarousel onNext={onNext} onPrev={onPrev} threshold={40} />);
    const box = screen.getByTestId("carousel-box");

    fireEvent.pointerDown(box, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "mouse", button: 0 });
    // Move only 25px (less than threshold 40)
    fireEvent.pointerMove(box, { clientX: 75, clientY: 100, pointerId: 1, pointerType: "mouse" });
    fireEvent.pointerUp(box, { clientX: 75, clientY: 100, pointerId: 1, pointerType: "mouse" });

    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });

  it("allows vertical scrolling and does not trigger drag when vertical movement dominates", () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const onDragStateChange = vi.fn();

    render(
      <TestCarousel
        onNext={onNext}
        onPrev={onPrev}
        threshold={40}
        dragDetectionThreshold={8}
        onDragStateChange={onDragStateChange}
      />,
    );
    const box = screen.getByTestId("carousel-box");

    // Start gesture
    fireEvent.pointerDown(box, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "touch" });
    // User moves vertically down 50px with only 5px horizontal movement
    fireEvent.pointerMove(box, { clientX: 105, clientY: 150, pointerId: 1, pointerType: "touch" });
    fireEvent.pointerUp(box, { clientX: 105, clientY: 150, pointerId: 1, pointerType: "touch" });

    // Should NOT have triggered drag state change to true or any slide change
    expect(onDragStateChange).not.toHaveBeenCalledWith(true);
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });

  it("suppresses accidental click on child elements after a real drag", () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const onCardClick = vi.fn();

    render(
      <TestCarousel
        onNext={onNext}
        onPrev={onPrev}
        threshold={40}
        onCardClick={onCardClick}
      />,
    );
    const box = screen.getByTestId("carousel-box");
    const link = screen.getByTestId("course-link");

    // Perform a real drag
    fireEvent.pointerDown(box, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "mouse", button: 0 });
    fireEvent.pointerMove(box, { clientX: 40, clientY: 100, pointerId: 1, pointerType: "mouse" });
    fireEvent.pointerUp(box, { clientX: 40, clientY: 100, pointerId: 1, pointerType: "mouse" });

    // Simulate browser firing click on link right after pointerup
    fireEvent.click(link);

    // The click handler must have been suppressed!
    expect(onCardClick).not.toHaveBeenCalled();
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("allows normal click on child link when no dragging occurs", () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const onCardClick = vi.fn();

    render(
      <TestCarousel
        onNext={onNext}
        onPrev={onPrev}
        threshold={40}
        onCardClick={onCardClick}
      />,
    );
    const box = screen.getByTestId("carousel-box");
    const link = screen.getByTestId("course-link");

    // Normal mouse tap without moving
    fireEvent.pointerDown(box, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "mouse", button: 0 });
    fireEvent.pointerUp(box, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "mouse" });
    fireEvent.click(link);

    // Normal click should NOT be blocked
    expect(onCardClick).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });

  it("handles pointercancel and resets state without navigating", () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();
    const onDragStateChange = vi.fn();

    render(
      <TestCarousel
        onNext={onNext}
        onPrev={onPrev}
        threshold={40}
        onDragStateChange={onDragStateChange}
      />,
    );
    const box = screen.getByTestId("carousel-box");

    fireEvent.pointerDown(box, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "mouse", button: 0 });
    fireEvent.pointerMove(box, { clientX: 40, clientY: 100, pointerId: 1, pointerType: "mouse" });
    // System cancels pointer (e.g. alert, gesture interrupted)
    fireEvent.pointerCancel(box, { pointerId: 1 });

    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });

  it("ignores pointerdown when initiated directly on nested interactive buttons", () => {
    const onNext = vi.fn();
    const onPrev = vi.fn();

    render(<TestCarousel onNext={onNext} onPrev={onPrev} threshold={40} />);
    const prevBtn = screen.getByTestId("prev-btn");

    // Pointer down on button should not initiate drag
    fireEvent.pointerDown(prevBtn, { clientX: 100, clientY: 100, pointerId: 1, pointerType: "mouse", button: 0 });
    fireEvent.pointerMove(prevBtn, { clientX: 40, clientY: 100, pointerId: 1, pointerType: "mouse" });
    fireEvent.pointerUp(prevBtn, { clientX: 40, clientY: 100, pointerId: 1, pointerType: "mouse" });

    expect(onNext).not.toHaveBeenCalled();
    expect(onPrev).not.toHaveBeenCalled();
  });
});
