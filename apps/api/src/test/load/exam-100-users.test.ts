import { describe, it, expect } from "vitest";
import { executeCompleteExamLoadTest } from "./run-exam-load-test.js";

describe("AVANA Exam 100-User Load & Stress Test Suite", () => {
  it("executes complete load testing suite across all profiles and verifies data integrity", async () => {
    const report = await executeCompleteExamLoadTest();
    expect(report.overallStatus).toBe("PASSED");
    expect(report.integrity["Profile A (Realistic 100)"]?.passed).toBe(true);
    expect(report.integrity["Profile B (Answer Burst 100)"]?.passed).toBe(true);
    expect(report.integrity["Profile C (Simultaneous Submit 100)"]?.passed).toBe(true);
  }, 180000);
});
