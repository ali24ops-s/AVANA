/**
 * PR6-5: Asynchronous generation job domain primitives.
 *
 * Tests the generation job lifecycle:
 * - GenerationJobStatus union + validation helper
 * - Job/content status separation (two independent axes)
 * - GenerationJobId branded ID + parse helpers
 */

import { describe, expect, it } from "vitest";
import {
  type GenerationJobStatus,
  GENERATION_JOB_STATUSES,
  isGenerationJobStatus,
  type GeneratedContentStatus,
} from "../generation.js";
import {
  type GenerationJobId,
  isGenerationJobId,
  parseGenerationJobId,
  asGenerationJobId,
} from "../ids.js";

describe("PR6-5 generation job lifecycle", () => {
  it("defines the GenerationJobStatus union", () => {
    const statuses: readonly GenerationJobStatus[] = [
      "queued",
      "running",
      "succeeded",
      "failed",
    ];
    expect(statuses).toEqual(GENERATION_JOB_STATUSES);
  });

  it("validates generation job status values", () => {
    expect(isGenerationJobStatus("queued")).toBe(true);
    expect(isGenerationJobStatus("running")).toBe(true);
    expect(isGenerationJobStatus("succeeded")).toBe(true);
    expect(isGenerationJobStatus("failed")).toBe(true);
    expect(isGenerationJobStatus("draft")).toBe(false);
    expect(isGenerationJobStatus("accepted")).toBe(false);
    expect(isGenerationJobStatus("")).toBe(false);
  });

  it("keeps job lifecycle separate from generated-content lifecycle", () => {
    // A job can be "succeeded" while the generated content is still "draft".
    const jobStatus: GenerationJobStatus = "succeeded";
    const contentStatus: GeneratedContentStatus = "draft";
    expect(jobStatus).not.toBe(contentStatus);
    expect(isGenerationJobStatus(contentStatus)).toBe(false);
  });

  it("defines a distinct GeneratedContentStatus union separately", () => {
    const contentStatuses: readonly GeneratedContentStatus[] = [
      "draft",
      "accepted",
      "rejected",
      "edited",
      "regenerating",
    ];
    expect(contentStatuses).toContain("draft");
    expect(contentStatuses).toContain("regenerating");
  });
});

describe("PR6-5 GenerationJobId", () => {
  const valid = "00000000-0000-0000-0000-0000000000ab";
  const invalid = "not-a-uuid";

  it("parses a valid generation job id", () => {
    const id = parseGenerationJobId(valid);
    expect(isGenerationJobId(id)).toBe(true);
  });

  it("throws for an invalid generation job id", () => {
    expect(() => parseGenerationJobId(invalid)).toThrow(/Invalid UUID/);
  });

  it("casts a uuid to a GenerationJobId", () => {
    const id = asGenerationJobId(valid as GenerationJobId);
    expect(isGenerationJobId(id)).toBe(true);
  });
});
