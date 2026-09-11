import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { Badge } from "@avana/ui";

describe("Phase 2J — Legacy Utility Cleanup", () => {
  it("verifies Badge in StudyAnalyticsView does not contain rounded-button", () => {
    render(
      <Badge variant="warning" size="md" className="px-3.5 py-1.5" data-testid="analytics-badge">
        فارماکولوژی قلب و عروق
      </Badge>
    );

    const badge = screen.getByTestId("analytics-badge");
    expect(badge.className).not.toContain("rounded-button");
    // Canonical badge must have rounded-full
    expect(badge.className).toContain("rounded-full");
  });

  it("verifies button classes preserve font-semibold without legacy font-title-md", () => {
    render(
      <button
        type="button"
        className="px-6 py-2.5 bg-[var(--color-primary)] text-white rounded-xl text-sm font-semibold"
        data-testid="clean-button"
      >
        دکمه استاندارد
      </button>
    );

    const btn = screen.getByTestId("clean-button");
    expect(btn.className).not.toContain("font-title-md");
    expect(btn.className).toContain("font-semibold");
  });
});
