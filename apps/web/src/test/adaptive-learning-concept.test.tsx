import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  AdaptiveLearningConcept,
  AboutTurningPointSection,
  DRUGS_DATA,
  CHAIN_STAGES,
} from "../components/future/AdaptiveLearningConcept.js";

describe("AdaptiveLearningConcept (Future Product Concept Suite)", () => {
  it("1. Renders headline, badge, and default initial state for Propranolol", () => {
    render(<AdaptiveLearningConcept />);

    // Headline & Badges
    expect(screen.getByText("لحظه تغییر و کشف ارتباط")).toBeInTheDocument();
    expect(screen.getByText("اگر یادگیری می‌توانست خودش را")).toBeInTheDocument();
    expect(screen.getByText("با تو هماهنگ کند چه؟")).toBeInTheDocument();

    // Default Drug Header
    expect(screen.getByRole("tab", { name: /پروپرانولول/ })).toBeInTheDocument();
    expect(screen.getByText(/\[Propranolol\]/)).toBeInTheDocument();
    expect(screen.getByText("بتا بلاکر غیرانتخابی (Non-selective β-blocker)")).toBeInTheDocument();

    // Default Step 1 (Molecule)
    expect(screen.getByText("مرحله 1 از ۶")).toBeInTheDocument();
    expect(screen.getByText("مولکول پروپرانولول")).toBeInTheDocument();
    expect(
      screen.getByText("یک آنتاگونیست بتا آدرنرژیک با ماهیت چربی‌دوست (Lipophilic) بالا.")
    ).toBeInTheDocument();
    expect(screen.getByText("ارتباط شناختی در آوانا:")).toBeInTheDocument();
  });

  it("2. Verifies all 6 chain stages are present in the stepper navigation bar", () => {
    render(<AdaptiveLearningConcept />);

    expect(CHAIN_STAGES).toHaveLength(6);
    CHAIN_STAGES.forEach((stage) => {
      expect(screen.getByLabelText(`${stage.label} (${stage.enLabel})`)).toBeInTheDocument();
    });
  });

  it("3. Handles drug switching seamlessly (Propranolol -> Metformin -> Atropine)", async () => {
    render(<AdaptiveLearningConcept />);

    // Switch to Metformin
    const metforminTab = screen.getByRole("tab", { name: /متفورمین/ });
    fireEvent.click(metforminTab);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /متفورمین/ })).toBeInTheDocument();
      expect(screen.getByText(/\[Metformin\]/)).toBeInTheDocument();
      expect(screen.getByText("بیگوانید ضددیابت (Biguanide Antidiabetic)")).toBeInTheDocument();
      expect(screen.getByText("مولکول متفورمین هیدروکلراید")).toBeInTheDocument();
    });

    // Switch to Atropine
    const atropineTab = screen.getByRole("tab", { name: /آتروپین/ });
    fireEvent.click(atropineTab);

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /آتروپین/ })).toBeInTheDocument();
      expect(screen.getByText(/\[Atropine\]/)).toBeInTheDocument();
      expect(screen.getByText("آنتی‌کولینرژیک / آنتاگونیست موسکارینی")).toBeInTheDocument();
      expect(screen.getByText("آلکالوئید طبیعی بلادونا")).toBeInTheDocument();
    });
  });

  it("4. Supports sequential forward and backward step traversal via navigation buttons", async () => {
    render(<AdaptiveLearningConcept />);

    // Initial state: Step 1 -> Previous button is disabled
    expect(screen.getByRole("button", { name: /گام قبلی/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /گام بعدی/ })).not.toBeDisabled();

    // Step to 2: Mechanism
    fireEvent.click(screen.getByRole("button", { name: /گام بعدی/ }));
    await waitFor(() => {
      expect(screen.getByText("مرحله 2 از ۶")).toBeInTheDocument();
      expect(screen.getByText("مهار رقابتی کاتکول‌آمین‌ها")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /گام قبلی/ })).not.toBeDisabled();
    });

    // Step to 3: Target Receptor
    fireEvent.click(screen.getByRole("button", { name: /گام بعدی/ }));
    await waitFor(() => {
      expect(screen.getByText("مرحله 3 از ۶")).toBeInTheDocument();
      expect(screen.getByText("آنتاگونیست گیرنده‌های β1 و β2")).toBeInTheDocument();
    });

    // Step backwards to 2
    fireEvent.click(screen.getByRole("button", { name: /گام قبلی/ }));
    await waitFor(() => {
      expect(screen.getByText("مرحله 2 از ۶")).toBeInTheDocument();
      expect(screen.getByText("مهار رقابتی کاتکول‌آمین‌ها")).toBeInTheDocument();
    });
  });

  it("5. Allows jumping directly to any chain node by clicking stepper node buttons", async () => {
    render(<AdaptiveLearningConcept />);

    // Click on Step 6: Adverse Effects directly
    const sideEffectsNode = screen.getByRole("button", { name: /عوارض جانبی/ });
    fireEvent.click(sideEffectsNode);

    await waitFor(() => {
      expect(screen.getByText("مرحله 6 از ۶")).toBeInTheDocument();
      expect(screen.getByText("برادی‌کاردی و برونکواسپاسم")).toBeInTheDocument();
      expect(screen.getByText("زنجیره ارتباطی کامل شد ✔")).toBeInTheDocument();
    });

    // Next button is disabled on last step
    expect(screen.getByRole("button", { name: /گام بعدی/ })).toBeDisabled();
  });

  it("6. Verifies backward compatibility alias AboutTurningPointSection is exported and renders identical component", () => {
    expect(AboutTurningPointSection).toBe(AdaptiveLearningConcept);

    const { getByRole, getByText } = render(<AboutTurningPointSection />);
    expect(getByText("اگر یادگیری می‌توانست خودش را")).toBeInTheDocument();
    expect(getByRole("tab", { name: /پروپرانولول/ })).toBeInTheDocument();
  });
});
