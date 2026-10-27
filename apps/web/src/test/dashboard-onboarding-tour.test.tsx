import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DashboardOnboardingModal } from "../components/onboarding/DashboardOnboardingModal.js";
import { createOnboardingTourApi } from "../lib/api/onboarding.js";

// Mock jsdom missing scrollTo
if (typeof window !== "undefined") {
  window.scrollTo = vi.fn();
}

describe("DashboardOnboardingModal Spotlight Guided Tour Component", () => {
  it("renders step 1 with title, description, step counter, and controls", () => {
    const handleClose = vi.fn();

    render(
      <DashboardOnboardingModal
        isOpen={true}
        onClose={handleClose}
      />
    );

    // Header & Step Counter
    expect(screen.getByText(/مرحله ۱ از ۹/)).toBeInTheDocument();

    // Step 1 content
    expect(screen.getByText("دوره‌های من")).toBeInTheDocument();
    expect(
      screen.getByText(/مسیر یادگیری شما از اینجا آغاز می‌شود/)
    ).toBeInTheDocument();

    // Controls
    expect(screen.getByRole("button", { name: "رد کردن آموزش" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /بعدی/ })).toBeInTheDocument();
    // Step 1 does not have "قبلی" button
    expect(screen.queryByRole("button", { name: /قبلی/ })).not.toBeInTheDocument();
  });

  it("navigates forward and backward correctly across all 9 steps", () => {
    const handleClose = vi.fn();

    render(
      <DashboardOnboardingModal
        isOpen={true}
        onClose={handleClose}
      />
    );

    // Step 1: دوره‌های من
    expect(screen.getByText(/مرحله ۱ از ۹/)).toBeInTheDocument();
    expect(screen.getByText("دوره‌های من")).toBeInTheDocument();

    // 1. Advance to step 2: دوره‌ها (هدر)
    fireEvent.click(screen.getByRole("button", { name: /بعدی/ }));
    expect(screen.getByText(/مرحله ۲ از ۹/)).toBeInTheDocument();
    expect(screen.getByText("دوره‌ها")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /قبلی/ })).toBeInTheDocument();

    // 2. Click "قبلی" to return to step 1
    fireEvent.click(screen.getByRole("button", { name: /قبلی/ }));
    expect(screen.getByText(/مرحله ۱ از ۹/)).toBeInTheDocument();
    expect(screen.getByText("دوره‌های من")).toBeInTheDocument();

    // 3. Advance to step 2: دوره‌ها
    fireEvent.click(screen.getByRole("button", { name: /بعدی/ }));
    expect(screen.getByText(/مرحله ۲ از ۹/)).toBeInTheDocument();

    // 4. Advance to step 3: کلاس‌های من
    fireEvent.click(screen.getByRole("button", { name: /بعدی/ }));
    expect(screen.getByText(/مرحله ۳ از ۹/)).toBeInTheDocument();
    expect(screen.getByText("کلاس‌های من")).toBeInTheDocument();

    // 5. Advance to step 4: آزمون‌ها
    fireEvent.click(screen.getByRole("button", { name: /بعدی/ }));
    expect(screen.getByText(/مرحله ۴ از ۹/)).toBeInTheDocument();
    expect(screen.getByText("آزمون‌ها")).toBeInTheDocument();

    // 6. Advance to step 5: کتابخانه
    fireEvent.click(screen.getByRole("button", { name: /بعدی/ }));
    expect(screen.getByText(/مرحله ۵ از ۹/)).toBeInTheDocument();
    expect(screen.getByText("کتابخانه")).toBeInTheDocument();

    // 7. Advance to step 6: فلش‌کارت‌ها
    fireEvent.click(screen.getByRole("button", { name: /بعدی/ }));
    expect(screen.getByText(/مرحله ۶ از ۹/)).toBeInTheDocument();
    expect(screen.getByText("فلش‌کارت‌ها")).toBeInTheDocument();

    // 8. Advance to step 7: امتحاناتت رو فراموش نکن
    fireEvent.click(screen.getByRole("button", { name: /بعدی/ }));
    expect(screen.getByText(/مرحله ۷ از ۹/)).toBeInTheDocument();
    expect(screen.getByText("امتحاناتت رو فراموش نکن")).toBeInTheDocument();

    // 9. Advance to step 8: هر جای آوانا سوال داشتی، بپرس
    fireEvent.click(screen.getByRole("button", { name: /بعدی/ }));
    expect(screen.getByText(/مرحله ۸ از ۹/)).toBeInTheDocument();
    expect(screen.getByText("هر جای آوانا سوال داشتی، بپرس")).toBeInTheDocument();

    // 10. Advance to step 9: برنامه مطالعه‌ات آماده‌ست!
    fireEvent.click(screen.getByRole("button", { name: /بعدی/ }));
    expect(screen.getByText(/مرحله ۹ از ۹/)).toBeInTheDocument();
    expect(screen.getByText("برنامه مطالعه‌ات آماده‌ست!")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "شروع یادگیری" })).toBeInTheDocument();
  });

  it("highlights real header targets using spotlight highlight frame across header steps", () => {
    // Setup mock DOM elements for header buttons
    const header = document.createElement("header");
    const coursesBtn = document.createElement("a");
    coursesBtn.setAttribute("data-tour", "nav-courses");
    coursesBtn.getBoundingClientRect = () => ({
      top: 16,
      left: 100,
      width: 80,
      height: 36,
      bottom: 52,
      right: 180,
    } as DOMRect);

    const flashcardsBtn = document.createElement("a");
    flashcardsBtn.setAttribute("data-tour", "nav-flashcards");
    flashcardsBtn.getBoundingClientRect = () => ({
      top: 16,
      left: 200,
      width: 90,
      height: 36,
      bottom: 52,
      right: 290,
    } as DOMRect);

    header.appendChild(coursesBtn);
    header.appendChild(flashcardsBtn);
    document.body.appendChild(header);

    const { unmount } = render(
      <DashboardOnboardingModal
        isOpen={true}
        onClose={vi.fn()}
      />
    );

    // Advance to step 2 (دوره‌ها)
    fireEvent.click(screen.getByRole("button", { name: /بعدی/ }));
    expect(screen.getByText("دوره‌ها")).toBeInTheDocument();

    // Frame should exist and frame the target
    const frame = screen.getByTestId("spotlight-highlight-frame");
    expect(frame).toBeInTheDocument();

    // Advance to step 6 (فلش‌کارت‌ها)
    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByRole("button", { name: /بعدی/ }));
    }
    expect(screen.getByText("فلش‌کارت‌ها")).toBeInTheDocument();
    expect(screen.getByTestId("spotlight-highlight-frame")).toBeInTheDocument();

    unmount();
    document.body.removeChild(header);
  });

  it("calls onClose with action 'complete' when finishing on the final step (step 9)", () => {
    const handleClose = vi.fn();

    render(
      <DashboardOnboardingModal
        isOpen={true}
        onClose={handleClose}
      />
    );

    // Advance 8 times to step 9
    for (let i = 0; i < 8; i++) {
      fireEvent.click(screen.getByRole("button", { name: /بعدی/ }));
    }

    // Click "شروع یادگیری"
    const startButton = screen.getByRole("button", { name: "شروع یادگیری" });
    fireEvent.click(startButton);

    expect(handleClose).toHaveBeenCalledWith("complete", 9);
  });

  it("calls onClose with action 'skip' and current step when clicking 'رد کردن آموزش'", () => {
    const handleClose = vi.fn();

    render(
      <DashboardOnboardingModal
        isOpen={true}
        onClose={handleClose}
      />
    );

    // Advance to step 3
    fireEvent.click(screen.getByRole("button", { name: /بعدی/ }));
    fireEvent.click(screen.getByRole("button", { name: /بعدی/ }));

    // Click "رد کردن آموزش" on step 3
    fireEvent.click(screen.getByRole("button", { name: "رد کردن آموزش" }));
    expect(handleClose).toHaveBeenCalledWith("skip", 3);
  });

  it("calls onClose with action 'skip' on Escape key press", () => {
    const handleClose = vi.fn();

    render(
      <DashboardOnboardingModal
        isOpen={true}
        onClose={handleClose}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(handleClose).toHaveBeenCalledWith("skip", 1);
  });

  it("supports keyboard navigation with ArrowLeft and ArrowRight for RTL", () => {
    const handleClose = vi.fn();

    render(
      <DashboardOnboardingModal
        isOpen={true}
        onClose={handleClose}
      />
    );

    // In RTL, ArrowLeft advances forward
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByText(/مرحله ۲ از ۹/)).toBeInTheDocument();

    // In RTL, ArrowRight moves backward
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByText(/مرحله ۱ از ۹/)).toBeInTheDocument();
  });

  it("does not render contents when isOpen is false", () => {
    render(
      <DashboardOnboardingModal
        isOpen={false}
        onClose={vi.fn()}
      />
    );

    expect(screen.queryByText("دوره‌های من")).not.toBeInTheDocument();
  });
});

describe("createOnboardingTourApi client", () => {
  it("interacts with GET and POST /v1/onboarding/tour correctly", async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({ eligible: true, status: "unseen", step: 1 }),
      post: vi.fn().mockResolvedValue({ success: true, status: "skipped", updated_at: "2026-10-25T00:00:00.000Z" }),
    };

    const api = createOnboardingTourApi(mockClient);

    const status = await api.getStatus();
    expect(mockClient.get).toHaveBeenCalledWith("/v1/onboarding/tour");
    expect(status.eligible).toBe(true);

    const update = await api.updateStatus("skip", 2);
    expect(mockClient.post).toHaveBeenCalledWith("/v1/onboarding/tour", { action: "skip", step: 2 });
    expect(update.status).toBe("skipped");
  });
});
