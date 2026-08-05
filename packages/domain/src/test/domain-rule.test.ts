import { describe, expect, it } from "vitest";
import { isNonBlank } from "./example-domain-rule.js";

describe("domain rule example", () => {
  it("accepts a non-blank value", () => {
    expect(isNonBlank("course title")).toBe(true);
    expect(isNonBlank("   ")).toBe(false);
  });
});
