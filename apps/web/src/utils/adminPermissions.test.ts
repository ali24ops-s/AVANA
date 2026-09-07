import { describe, it, expect } from "vitest";
import { isUserAdmin } from "./adminPermissions.js";
import type { Role, UserMembership } from "@avana/contracts";

describe("adminPermissions - isUserAdmin", () => {
  it("returns false for null or undefined user", () => {
    expect(isUserAdmin(null)).toBe(false);
    expect(isUserAdmin(undefined)).toBe(false);
  });

  it("returns true for user with role platform_admin", () => {
    expect(isUserAdmin({ role: "platform_admin" as Role })).toBe(true);
  });

  it("returns true for user with role organization_admin", () => {
    expect(isUserAdmin({ role: "organization_admin" as Role })).toBe(true);
  });

  it("returns true for user with role content_worker", () => {
    expect(isUserAdmin({ role: "content_worker" as Role })).toBe(true);
  });

  it("returns false for user with role student and no admin memberships", () => {
    expect(isUserAdmin({ role: "student" as Role })).toBe(false);
    expect(isUserAdmin({ role: "student" as Role }, [])).toBe(false);
    expect(
      isUserAdmin({ role: "student" as Role }, [
        { role: "student" as Role, organization_id: "org-1" as any },
      ]),
    ).toBe(false);
  });

  it("returns false for user with role teacher and no admin memberships", () => {
    expect(isUserAdmin({ role: "teacher" as Role })).toBe(false);
  });

  it("returns true if user is student but has an organization_admin membership", () => {
    const memberships: UserMembership[] = [
      { organization_id: "org-1" as any, role: "organization_admin" as Role },
    ];
    expect(isUserAdmin({ role: "student" as Role }, memberships)).toBe(true);
  });

  it("returns true if user is student but has a platform_admin membership", () => {
    const memberships: UserMembership[] = [
      { organization_id: "org-1" as any, role: "platform_admin" as Role },
    ];
    expect(isUserAdmin({ role: "student" as Role }, memberships)).toBe(true);
  });
});
