import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MarkdownRenderer } from "../components/markdown/MarkdownRenderer.js";
import {
  PHARMACOLOGY_CANONICAL_CHARTS,
  formatChartCodeFence,
} from "@avana/domain";

describe("Pharmacology 4 Canonical Charts Web Rendering", () => {
  it("renders Chart 1 (Dose-Response) end-to-end to SVG via MarkdownRenderer", async () => {
    const md = `# مقدمه\n\n${formatChartCodeFence(PHARMACOLOGY_CANONICAL_CHARTS.doseResponse)}\n\nپایان.`;
    const { container } = render(<MarkdownRenderer content={md} />);

    await waitFor(() => {
      expect(screen.getByText("منحنی غلظت-پاسخ و مفاهیم Emax و EC50")).toBeDefined();
    });

    const svg = container.querySelector("svg[role='img']");
    expect(svg).not.toBeNull();
    expect(screen.getByText("نمایش مفهومی / شماتیک")).toBeDefined();
    expect(container.querySelector('[data-testid="chart-curve-0"]')).not.toBeNull();
  });

  it("renders Chart 2 (Competitive Antagonist) end-to-end to SVG with 3 curves", async () => {
    const md = `# مقدمه\n\n${formatChartCodeFence(PHARMACOLOGY_CANONICAL_CHARTS.competitiveAntagonist)}\n\nپایان.`;
    const { container } = render(<MarkdownRenderer content={md} />);

    await waitFor(() => {
      expect(screen.getByText("آنتاگونیسم رقابتی برگشت‌پذیر و شیفت موازی به راست")).toBeDefined();
    });

    const svg = container.querySelector("svg[role='img']");
    expect(svg).not.toBeNull();
    expect(container.querySelector('[data-testid="chart-curve-0"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="chart-curve-1"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="chart-curve-2"]')).not.toBeNull();
  });

  it("renders Chart 3 (Full vs Partial Agonist) end-to-end to SVG with 2 curves", async () => {
    const md = `# مقدمه\n\n${formatChartCodeFence(PHARMACOLOGY_CANONICAL_CHARTS.fullVsPartialAgonist)}\n\nپایان.`;
    const { container } = render(<MarkdownRenderer content={md} />);

    await waitFor(() => {
      expect(screen.getByText("مقایسه آگونیست کامل و آگونیست جزئی")).toBeDefined();
    });

    const svg = container.querySelector("svg[role='img']");
    expect(svg).not.toBeNull();
    expect(container.querySelector('[data-testid="chart-curve-0"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="chart-curve-1"]')).not.toBeNull();
  });

  it("renders Chart 4 (Inverse Agonist) end-to-end to SVG with 3 curves", async () => {
    const md = `# مقدمه\n\n${formatChartCodeFence(PHARMACOLOGY_CANONICAL_CHARTS.inverseAgonist)}\n\nپایان.`;
    const { container } = render(<MarkdownRenderer content={md} />);

    await waitFor(() => {
      expect(
        screen.getByText("اثر آگونیست کامل، آنتاگونیست خنثی و آگونیست معکوس بر فعالیت گیرنده"),
      ).toBeDefined();
    });

    const path0 = container.querySelector('[data-testid="chart-curve-0"] path');
    const path1 = container.querySelector('[data-testid="chart-curve-1"] path');
    const path2 = container.querySelector('[data-testid="chart-curve-2"] path');

    expect(path0).not.toBeNull();
    expect(path1).not.toBeNull();
    expect(path2).not.toBeNull();

    // Helper to extract first and last Y coordinate from SVG path "M x1 y1 L x2 y2 ... L xN yN"
    const getFirstAndLastY = (d: string) => {
      const commands = d.trim().split(/[ML]\s+/).filter(Boolean);
      const firstCoord = commands[0].trim().split(/\s+/).map(Number);
      const lastCoord = commands[commands.length - 1].trim().split(/\s+/).map(Number);
      return { startY: firstCoord[1], endY: lastCoord[1] };
    };

    const d0 = getFirstAndLastY(path0!.getAttribute("d")!);
    const d1 = getFirstAndLastY(path1!.getAttribute("d")!);
    const d2 = getFirstAndLastY(path2!.getAttribute("d")!);

    // In SVG, smaller Y means higher on screen (higher biological activity)
    // 1. Full Agonist (d0): Starts at baseline (25%), ends at Emax=100% (top of plot, endY < startY)
    expect(d0.endY).toBeLessThan(d0.startY);

    // 2. Neutral Antagonist (d1): Flat line across all points maintaining baseline 25% (startY === endY)
    expect(Math.abs(d1.startY - d1.endY)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(d1.startY - d0.startY)).toBeLessThanOrEqual(0.5); // Starts at same baseline

    // 3. Inverse Agonist (d2): Starts at baseline (25%), ends below baseline at Emax=0% (bottom of plot, endY > startY)
    expect(d2.endY).toBeGreaterThan(d2.startY);
    expect(d2.endY).toBeGreaterThan(d1.endY); // Reaches lower activity than neutral antagonist baseline
  });
});
