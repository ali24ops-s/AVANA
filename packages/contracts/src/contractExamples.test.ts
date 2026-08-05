import { describe, expect, it } from "vitest";
import type { ErrorEnvelope, Pagination } from "./generated/index.js";

describe("contracts (Sprint 1 PR 4) - type examples", () => {
  it("models error envelope shape", () => {
    const envelope: ErrorEnvelope = {
      request_id: "550e8400-e29b-41d4-a716-446655440000",
      error: {
        code: "unauthorized",
        message: "Not signed in",
      },
    };

    expect(envelope.error.code).toBe("unauthorized");
  });

  it("models pagination shape", () => {
    const pagination: Pagination = { limit: 25, next_cursor: null };
    expect(pagination.limit).toBe(25);
    expect(pagination.next_cursor).toBeNull();
  });
});
