import { describe, expect, it } from "vitest";
import { isUUID, parseUUID, asUserId } from "../ids.js";

describe("domain ids", () => {
  it("validates uuid strings", () => {
    expect(isUUID("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(isUUID("not-a-uuid")).toBe(false);
  });

  it("parses uuid and brands it", () => {
    const id = parseUUID("550e8400-e29b-41d4-a716-446655440000", "user_id");
    expect(id).toBe("550e8400-e29b-41d4-a716-446655440000");

    const userId = asUserId(id);
    // runtime value remains string
    expect(userId).toBe(id);
  });
});
