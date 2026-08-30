import { describe, expect, it } from "vitest";
import { isRole, Roles, resolveEffectiveRole } from "../roles.js";

describe("domain roles", () => {
  it("validates known roles", () => {
    expect(isRole(Roles.student)).toBe(true);
    expect(isRole(Roles.course_editor)).toBe(true);
    expect(isRole("unknown")).toBe(false);
  });

  describe("resolveEffectiveRole", () => {
    it("Test A: globalRole is null, membership has platform_admin -> DOES NOT grant platform_admin, falls back to student", () => {
      // Direct call
      expect(resolveEffectiveRole(null, ["platform_admin"])).toBe(Roles.student);
      // Array calling convention
      expect(resolveEffectiveRole([null, "platform_admin"])).toBe(Roles.student);
    });

    it("Test A2: globalRole is null, memberships have platform_admin and teacher -> resolves to teacher", () => {
      expect(resolveEffectiveRole(null, ["platform_admin", "teacher"])).toBe(Roles.teacher);
      expect(resolveEffectiveRole([null, "platform_admin", "teacher"])).toBe(Roles.teacher);
    });

    it("Test B: globalRole is platform_admin, membership is student -> resolves to platform_admin", () => {
      expect(resolveEffectiveRole("platform_admin", ["student"])).toBe(Roles.platform_admin);
      expect(resolveEffectiveRole(["platform_admin", "student"])).toBe(Roles.platform_admin);
    });

    it("Test C: globalRole is platform_admin, memberships is empty -> resolves to platform_admin", () => {
      expect(resolveEffectiveRole("platform_admin", [])).toBe(Roles.platform_admin);
      expect(resolveEffectiveRole(["platform_admin"])).toBe(Roles.platform_admin);
    });

    it("Test D: globalRole is null, memberships is empty -> resolves to student fallback", () => {
      expect(resolveEffectiveRole(null, [])).toBe(Roles.student);
      expect(resolveEffectiveRole([null])).toBe(Roles.student);
    });

    it("Resolves organization role precedence correctly (org_admin > course_editor > teacher > student)", () => {
      expect(resolveEffectiveRole(null, ["student", "teacher"])).toBe(Roles.teacher);
      expect(resolveEffectiveRole(null, ["teacher", "course_editor"])).toBe(Roles.course_editor);
      expect(resolveEffectiveRole(null, ["course_editor", "organization_admin"])).toBe(Roles.organization_admin);
      expect(resolveEffectiveRole(null, ["student", "organization_admin", "teacher"])).toBe(Roles.organization_admin);
    });
  });
});
