import { describe, expect, it } from "vitest";
import { isUtcIsoDateTimeString, parseUtcIsoDateTimeString } from "../time.js";

describe("domain time", () => {
  it("validates strict utc iso datetime strings", () => {
    expect(isUtcIsoDateTimeString("2026-01-31T23:59:59Z")).toBe(true);
    expect(isUtcIsoDateTimeString("2026-01-31T23:59:59.123Z")).toBe(true);
    expect(isUtcIsoDateTimeString("2026-01-31 23:59:59Z")).toBe(false);
    expect(isUtcIsoDateTimeString("2026-01-31T23:59:59+00:00")).toBe(false);
    expect(isUtcIsoDateTimeString("not-a-date")).toBe(false);
  });

  it("parses and throws on invalid values", () => {
    expect(parseUtcIsoDateTimeString("2026-01-31T23:59:59Z")).toBe(
      "2026-01-31T23:59:59Z",
    );

    expect(() => parseUtcIsoDateTimeString("bad", "created_at")).toThrow(
      "Invalid UTC ISO timestamp for created_at",
    );
  });
});
