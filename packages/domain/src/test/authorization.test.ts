/**
 * PR-8: Authorization policy unit tests.
 *
 * Tests the RoleBasedPolicy against the permission matrix:
 * - Each role has expected allowed/denied actions
 * - Cross-tenant isolation concept (org-scoping)
 * - Higher roles are reserved (support_agent, platform_admin)
 */

import { describe, expect, it } from "vitest";
import { RoleBasedPolicy, defaultPolicy } from "../authorization/policy.js";
import type {
  Actor,
  AuthAction,
  AuthContext,
} from "../authorization/policy.js";
import type { UserId, OrganizationId } from "../ids.js";

const mockUserId = "00000000-0000-0000-0000-000000000001" as UserId;
const mockOrgId = "00000000-0000-0000-0000-000000000010" as OrganizationId;

function makeActor(role: string): Actor {
  return {
    userId: mockUserId,
    role: role as Actor["role"],
  };
}

const defaultContext: AuthContext = {
  organizationId: mockOrgId,
};

const allActions: AuthAction[] = [
  "org:create",
  "org:read",
  "org:update",
  "org:delete",
  "org:list_members",
  "org:manage_memberships",
  "course:create",
  "course:read",
  "course:update",
  "course:archive",
  "course:delete",
  "course:manage_memberships",
  "learning:read",
  "progress:write",
  "progress:read",
  "content:write",
  "content:publish",
  "document:upload",
  "document:read",
  "content:generate",
  "content:review",
  "content:accept",
  "content:reject",
  "content:regenerate",
  "content:edit",
  "flashcard:review",
  "quiz:attempt",
  "study:read",
];

describe("RoleBasedPolicy", () => {
  const policy = new RoleBasedPolicy();

  describe("student role", () => {
    const actor = makeActor("student");

    it("allows org:create, org:read, course:create, course:read", () => {
      expect(policy.check("org:create", actor, defaultContext)).toBe(true);
      expect(policy.check("org:read", actor, defaultContext)).toBe(true);
      expect(policy.check("course:create", actor, defaultContext)).toBe(true);
      expect(policy.check("course:read", actor, defaultContext)).toBe(true);
    });

    it("denies org management actions", () => {
      expect(policy.check("org:update", actor, defaultContext)).toBe(false);
      expect(policy.check("org:delete", actor, defaultContext)).toBe(false);
      expect(policy.check("org:list_members", actor, defaultContext)).toBe(
        false,
      );
      expect(
        policy.check("org:manage_memberships", actor, defaultContext),
      ).toBe(false);
    });

    it("denies course update, archive, delete, and membership management", () => {
      expect(policy.check("course:update", actor, defaultContext)).toBe(false);
      expect(policy.check("course:archive", actor, defaultContext)).toBe(false);
      expect(policy.check("course:delete", actor, defaultContext)).toBe(false);
      expect(
        policy.check("course:manage_memberships", actor, defaultContext),
      ).toBe(false);
    });

    it("denies content authoring actions", () => {
      expect(policy.check("content:write", actor, defaultContext)).toBe(false);
      expect(policy.check("content:publish", actor, defaultContext)).toBe(
        false,
      );
    });

    it("require() throws DomainError for denied actions", () => {
      expect(() =>
        policy.require("org:delete", actor, defaultContext),
      ).toThrow();
      expect(() => policy.require("org:delete", actor, defaultContext)).toThrow(
        /not permitted/i,
      );
    });
  });

  describe("course_editor role", () => {
    const actor = makeActor("course_editor");

    it("allows org:read, course:create/read/update", () => {
      expect(policy.check("org:read", actor, defaultContext)).toBe(true);
      expect(policy.check("course:create", actor, defaultContext)).toBe(true);
      expect(policy.check("course:read", actor, defaultContext)).toBe(true);
      expect(policy.check("course:update", actor, defaultContext)).toBe(true);
    });

    it("allows content writing and publishing", () => {
      expect(policy.check("content:write", actor, defaultContext)).toBe(true);
      expect(policy.check("content:publish", actor, defaultContext)).toBe(true);
    });

    it("denies org admin actions", () => {
      expect(policy.check("org:update", actor, defaultContext)).toBe(false);
      expect(policy.check("org:delete", actor, defaultContext)).toBe(false);
      expect(policy.check("org:list_members", actor, defaultContext)).toBe(
        false,
      );
      expect(
        policy.check("org:manage_memberships", actor, defaultContext),
      ).toBe(false);
    });

    it("denies course archive and course delete", () => {
      expect(policy.check("course:archive", actor, defaultContext)).toBe(false);
      expect(policy.check("course:delete", actor, defaultContext)).toBe(false);
    });
  });

  describe("organization_admin role", () => {
    const actor = makeActor("organization_admin");

    it("allows org:read, update, list_members, manage_memberships", () => {
      expect(policy.check("org:read", actor, defaultContext)).toBe(true);
      expect(policy.check("org:update", actor, defaultContext)).toBe(true);
      expect(policy.check("org:list_members", actor, defaultContext)).toBe(
        true,
      );
      expect(
        policy.check("org:manage_memberships", actor, defaultContext),
      ).toBe(true);
    });

    it("denies org:delete", () => {
      expect(policy.check("org:delete", actor, defaultContext)).toBe(false);
    });

    it("allows course:create, read, update, archive, manage_memberships", () => {
      expect(policy.check("course:create", actor, defaultContext)).toBe(true);
      expect(policy.check("course:read", actor, defaultContext)).toBe(true);
      expect(policy.check("course:update", actor, defaultContext)).toBe(true);
      expect(policy.check("course:archive", actor, defaultContext)).toBe(true);
      expect(
        policy.check("course:manage_memberships", actor, defaultContext),
      ).toBe(true);
    });

    it("allows content writing and publishing", () => {
      expect(policy.check("content:write", actor, defaultContext)).toBe(true);
      expect(policy.check("content:publish", actor, defaultContext)).toBe(true);
    });

    it("denies course:delete", () => {
      expect(policy.check("course:delete", actor, defaultContext)).toBe(false);
    });
  });

  describe("platform_admin role", () => {
    const actor = makeActor("platform_admin");

    it("allows all platform actions (course, document, learning, content, study, org)", () => {
      for (const action of allActions) {
        expect(
          policy.check(action, actor, defaultContext),
          `platform_admin should be permitted for action: ${action}`,
        ).toBe(true);
      }
    });

    it("require() succeeds for all platform actions without throwing", () => {
      for (const action of allActions) {
        expect(() =>
          policy.require(action, actor, defaultContext),
        ).not.toThrow();
      }
    });
  });

  describe("reserved higher roles", () => {
    it.each(["support_agent"])(
      "does not grant Sprint 1 permissions to %s",
      (role) => {
        const actor = makeActor(role);
        for (const action of allActions) {
          expect(policy.check(action, actor, defaultContext)).toBe(false);
        }
      },
    );
  });

  describe("unknown role", () => {
    const actor = makeActor("unknown_role" as Actor["role"]);

    it("denies all actions", () => {
      for (const action of allActions) {
        expect(policy.check(action, actor, defaultContext)).toBe(false);
      }
    });
  });

  describe("default policy singleton", () => {
    it("is an instance of RoleBasedPolicy", () => {
      expect(defaultPolicy).toBeInstanceOf(RoleBasedPolicy);
    });

    it("works correctly for standard checks", () => {
      const student = makeActor("student");
      expect(defaultPolicy.check("course:read", student, defaultContext)).toBe(
        true,
      );
      expect(defaultPolicy.check("org:delete", student, defaultContext)).toBe(
        false,
      );
    });
  });
});
