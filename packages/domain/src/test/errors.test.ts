import { describe, expect, it } from "vitest";
import { DomainError } from "../errors.js";

describe("domain errors", () => {
  it("constructs DomainError with code and details", () => {
    const err = new DomainError("bad_request", "Invalid input", {
      field: "title",
      reason: "blank",
    });

    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("DomainError");
    expect(err.code).toBe("bad_request");
    expect(err.message).toBe("Invalid input");
    expect(err.details).toEqual({ field: "title", reason: "blank" });
  });
});
