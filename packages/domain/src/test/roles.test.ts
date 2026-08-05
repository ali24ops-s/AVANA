import { describe, expect, it } from "vitest";
import { isRole, Roles } from "../roles.js";

describe("domain roles", () => {
  it("validates known roles", () => {
    expect(isRole(Roles.student)).toBe(true);
    expect(isRole(Roles.course_editor)).toBe(true);
    expect(isRole("unknown")).toBe(false);
  });
});
