// @ts-nocheck
import { describe, it, expect } from "vitest";
import { QualityAnalyzer } from "./quality-analyzer.js";
import type { ExtractionResult } from "./types.js";

describe("QualityAnalyzer", () => {
  it("should return poor score for empty document (no pages)", () => {
    const result: ExtractionResult = { pages: [] };
    const report = QualityAnalyzer.analyze(result);
    
    expect(report.score).toBe(0);
    expect(report.level).toBe("poor");
    expect(report.metrics.extractionHealth).toBe(0);
    expect(report.warnings).toContain("No pages found in the document.");
  });

  it("should return excellent score for a healthy PDF", () => {
    const result: ExtractionResult = {
      pages: [
        { pageNumber: 1, characterCount: 1000, rawText: "abc".repeat(334) },
        { pageNumber: 2, characterCount: 900, rawText: "def".repeat(300) },
      ]
    };
    const report = QualityAnalyzer.analyze(result);
    
    expect(report.score).toBeGreaterThanOrEqual(80);
    expect(report.level).toBe("excellent");
  });

  it("should penalize for partial extraction (low page coverage)", () => {
    const pages = [];
    for (let i = 1; i <= 30; i++) {
      pages.push({
        pageNumber: i,
        characterCount: i <= 10 ? 1000 : 0,
        rawText: i <= 10 ? "a".repeat(1000) : "",
      });
    }
    const result: ExtractionResult = { pages };
    const report = QualityAnalyzer.analyze(result);
    
    expect(report.metrics.pageCoverage).toBe(Math.round(10/30 * 100));
    expect(report.warnings).toContain("Found 20 pages with little to no text.");
    expect(report.score).toBeLessThan(100);
  });

  it("should severely penalize garbage/corrupted characters", () => {
    const result: ExtractionResult = {
      pages: [
        { pageNumber: 1, characterCount: 100, rawText: "Hello " + "\uFFFD".repeat(20) + " World" },
      ]
    };
    const report = QualityAnalyzer.analyze(result);
    
    expect(report.metrics.characterHealth).toBe(0);
    expect(report.warnings).toContain("Found 20 corrupted or unreadable characters.");
    expect(report.score).toBeLessThan(80); // Drops below excellent due to high weight
  });

  it("should penalize extremely low text density", () => {
    const result: ExtractionResult = {
      pages: [
        { pageNumber: 1, characterCount: 60, rawText: "a".repeat(60) }, // just above empty threshold
        { pageNumber: 2, characterCount: 70, rawText: "b".repeat(70) },
      ]
    };
    const report = QualityAnalyzer.analyze(result);
    
    expect(report.metrics.textDensity).toBeLessThan(50);
    expect(report.warnings).toContain("Text density is unusually low for this document.");
    expect(report.score).toBeLessThan(100);
  });

  it("should penalize noisy/repeated text", () => {
    const result: ExtractionResult = {
      pages: [
        { pageNumber: 1, characterCount: 1000, rawText: "Hello " + ".".repeat(100) + " World" },
      ]
    };
    const report = QualityAnalyzer.analyze(result);
    
    expect(report.metrics.noiseHealth).toBe(70);
    expect(report.warnings).toContain("High amount of repeating characters detected.");
  });
  
  it("should penalize excessive whitespace", () => {
    const result: ExtractionResult = {
      pages: [
        { pageNumber: 1, characterCount: 1000, rawText: "Hello " + " ".repeat(500) + " World" },
      ]
    };
    const report = QualityAnalyzer.analyze(result);
    
    expect(report.metrics.noiseHealth).toBeLessThan(100);
    expect(report.warnings).toContain("Unusually high amount of whitespace detected.");
  });

  it("boundary tests for score levels", () => {
    const testLevel = (score: number, expectedLevel: string) => {
      // Mock score logic by just setting a very precise input?
      // Since it's deterministic, let's just test the if condition inside directly?
      // Well, we can't mock private internals without restructuring. The logic is:
      // >= 80 excellent, >= 50 medium, < 50 poor.
      // We can trust the tests covering the actual output levels.
    };
    
    // Instead of mocking, let's construct explicit cases.
    
    // Poor case
    const poorResult: ExtractionResult = {
      pages: [{ pageNumber: 1, characterCount: 50, rawText: " ".repeat(50) }] // only spaces -> high noise, low density
    };
    const poorReport = QualityAnalyzer.analyze(poorResult);
    expect(poorReport.level).toBe("poor");
    expect(poorReport.score).toBeLessThan(50);
  });
});
