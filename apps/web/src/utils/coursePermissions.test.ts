/**
 * Course content permission helper tests.
 *
 * Verifies that only membership roles with content management permissions
 * (organization_admin, course_editor) can manage course content.
 */

import { describe, expect, it } from "vitest";
import { canManageCourseContent } from "./coursePermissions.js";
import type { UserMembership } from "@avana/contracts";

function membershipsOf(role: string): UserMembership[] {
  return [
    {
      organization_id: "org-1",
      role: role as UserMembership["role"],
    },
  ];
}

describe("canManageCourseContent", () => {
  it("returns true when a membership is organization_admin", () => {
    expect(canManageCourseContent(membershipsOf("organization_admin"))).toBe(
      true,
    );
  });

  it("returns true when a membership is course_editor", () => {
    expect(canManageCourseContent(membershipsOf("course_editor"))).toBe(true);
  });

  it("returns false when the only membership is student", () => {
    expect(canManageCourseContent(membershipsOf("student"))).toBe(false);
  });

  it("returns false when the only membership is teacher", () => {
    expect(canManageCourseContent(membershipsOf("teacher"))).toBe(false);
  });

  it("returns false when the only membership is support_agent", () => {
    expect(canManageCourseContent(membershipsOf("support_agent"))).toBe(false);
  });

  it("returns false when the only membership is platform_admin", () => {
    expect(canManageCourseContent(membershipsOf("platform_admin"))).toBe(false);
  });

  it("returns true when any membership has a content-management role", () => {
    const memberships: UserMembership[] = [
      { organization_id: "org-1", role: "student" },
      { organization_id: "org-2", role: "course_editor" },
    ];
    expect(canManageCourseContent(memberships)).toBe(true);
  });

  it("returns false when memberships is undefined", () => {
    expect(canManageCourseContent(undefined)).toBe(false);
  });

  it("returns false when memberships is empty", () => {
    expect(canManageCourseContent([])).toBe(false);
  });
});
