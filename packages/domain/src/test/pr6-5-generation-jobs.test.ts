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
  isValidJobStatusTransition,
  isJobActive,
  isJobTerminal,
  isJobCancelledOrDeleting,
  type GeneratedContentStatus,
} from "../generation.js";
import {
  type GenerationJobId,
  isGenerationJobId,
  parseGenerationJobId,
  asGenerationJobId,
} from "../ids.js";

describe("PR6-5 generation job lifecycle", () => {
  it("defines the GenerationJobStatus union with stopping, stopped, deleting, deleted", () => {
    const statuses: readonly GenerationJobStatus[] = [
      "queued",
      "running",
      "stopping",
      "stopped",
      "succeeded",
      "failed",
      "deleting",
      "deleted",
    ];
    expect(statuses).toEqual(GENERATION_JOB_STATUSES);
  });

  it("validates generation job status values", () => {
    expect(isGenerationJobStatus("queued")).toBe(true);
    expect(isGenerationJobStatus("running")).toBe(true);
    expect(isGenerationJobStatus("stopping")).toBe(true);
    expect(isGenerationJobStatus("stopped")).toBe(true);
    expect(isGenerationJobStatus("succeeded")).toBe(true);
    expect(isGenerationJobStatus("failed")).toBe(true);
    expect(isGenerationJobStatus("deleting")).toBe(true);
    expect(isGenerationJobStatus("deleted")).toBe(true);
    expect(isGenerationJobStatus("draft")).toBe(false);
    expect(isGenerationJobStatus("accepted")).toBe(false);
    expect(isGenerationJobStatus("")).toBe(false);
  });

  it("enforces valid and illegal lifecycle transitions", () => {
    // Valid transitions
    expect(isValidJobStatusTransition("queued", "running")).toBe(true);
    expect(isValidJobStatusTransition("queued", "stopping")).toBe(true);
    expect(isValidJobStatusTransition("queued", "stopped")).toBe(true);
    expect(isValidJobStatusTransition("queued", "deleting")).toBe(true);
    expect(isValidJobStatusTransition("queued", "deleted")).toBe(true);

    expect(isValidJobStatusTransition("running", "stopping")).toBe(true);
    expect(isValidJobStatusTransition("running", "deleting")).toBe(true);
    expect(isValidJobStatusTransition("running", "succeeded")).toBe(true);
    expect(isValidJobStatusTransition("running", "failed")).toBe(true);

    expect(isValidJobStatusTransition("stopping", "stopped")).toBe(true);
    expect(isValidJobStatusTransition("stopping", "deleting")).toBe(true);
    expect(isValidJobStatusTransition("stopping", "deleted")).toBe(true);

    expect(isValidJobStatusTransition("stopped", "deleting")).toBe(true);
    expect(isValidJobStatusTransition("stopped", "deleted")).toBe(true);

    expect(isValidJobStatusTransition("succeeded", "deleting")).toBe(true);
    expect(isValidJobStatusTransition("failed", "deleting")).toBe(true);
    expect(isValidJobStatusTransition("deleting", "deleted")).toBe(true);

    // Idempotent transitions
    expect(isValidJobStatusTransition("stopped", "stopped")).toBe(true);
    expect(isValidJobStatusTransition("deleted", "deleted")).toBe(true);
    expect(isValidJobStatusTransition("stopping", "stopping")).toBe(true);

    // Prohibited transitions (anti-resurrection invariants)
    expect(isValidJobStatusTransition("stopped", "running")).toBe(false);
    expect(isValidJobStatusTransition("stopped", "queued")).toBe(false);
    expect(isValidJobStatusTransition("stopped", "succeeded")).toBe(false);
    expect(isValidJobStatusTransition("deleted", "running")).toBe(false);
    expect(isValidJobStatusTransition("deleted", "queued")).toBe(false);
    expect(isValidJobStatusTransition("deleted", "stopped")).toBe(false);
    expect(isValidJobStatusTransition("succeeded", "running")).toBe(false);
    expect(isValidJobStatusTransition("failed", "running")).toBe(false);
  });

  it("classifies active, terminal, and cancelling job states correctly", () => {
    expect(isJobActive("queued")).toBe(true);
    expect(isJobActive("running")).toBe(true);
    expect(isJobActive("stopping")).toBe(true);
    expect(isJobActive("deleting")).toBe(true);
    expect(isJobActive("stopped")).toBe(false);
    expect(isJobActive("succeeded")).toBe(false);
    expect(isJobActive("failed")).toBe(false);
    expect(isJobActive("deleted")).toBe(false);

    expect(isJobTerminal("succeeded")).toBe(true);
    expect(isJobTerminal("failed")).toBe(true);
    expect(isJobTerminal("stopped")).toBe(true);
    expect(isJobTerminal("deleted")).toBe(true);
    expect(isJobTerminal("running")).toBe(false);
    expect(isJobTerminal("queued")).toBe(false);

    expect(isJobCancelledOrDeleting("stopping")).toBe(true);
    expect(isJobCancelledOrDeleting("stopped")).toBe(true);
    expect(isJobCancelledOrDeleting("deleting")).toBe(true);
    expect(isJobCancelledOrDeleting("deleted")).toBe(true);
    expect(isJobCancelledOrDeleting("running")).toBe(false);
    expect(isJobCancelledOrDeleting("queued")).toBe(false);
  });

  it("keeps job lifecycle separate from generated-content lifecycle", () => {
    // A job can be "succeeded" or "stopped" while the generated content is still "draft".
    const jobStatus: GenerationJobStatus = "stopped";
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
