/**
 * PR-8: Authorization policy unit tests.
 *
 * Tests the RoleBasedPolicy against the permission matrix:
 * - Each role has expected allowed/denied actions
 * - Cross-tenant isolation concept (org-scoping)
 * - Higher roles are reserved (support_agent, platform_admin)
 */

import { describe, expect, it } from "vitest";
import {
  RoleBasedPolicy,
  defaultPolicy,
  buildActor,
} from "../authorization/policy.js";
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

  describe("teacher role", () => {
    const actor = makeActor("teacher");

    it("allows org:read and course:read", () => {
      expect(policy.check("org:read", actor, defaultContext)).toBe(true);
      expect(policy.check("course:read", actor, defaultContext)).toBe(true);
    });

    it("allows learning, progress, document and study capabilities", () => {
      expect(policy.check("learning:read", actor, defaultContext)).toBe(true);
      expect(policy.check("progress:write", actor, defaultContext)).toBe(true);
      expect(policy.check("progress:read", actor, defaultContext)).toBe(true);
      expect(policy.check("document:upload", actor, defaultContext)).toBe(true);
      expect(policy.check("document:read", actor, defaultContext)).toBe(true);
      expect(policy.check("content:generate", actor, defaultContext)).toBe(true);
      expect(policy.check("content:review", actor, defaultContext)).toBe(true);
      expect(policy.check("flashcard:review", actor, defaultContext)).toBe(true);
      expect(policy.check("quiz:attempt", actor, defaultContext)).toBe(true);
      expect(policy.check("study:read", actor, defaultContext)).toBe(true);
    });

    it("denies org creation and org management actions", () => {
      expect(policy.check("org:create", actor, defaultContext)).toBe(false);
      expect(policy.check("org:update", actor, defaultContext)).toBe(false);
      expect(policy.check("org:delete", actor, defaultContext)).toBe(false);
      expect(policy.check("org:list_members", actor, defaultContext)).toBe(false);
      expect(policy.check("org:manage_memberships", actor, defaultContext)).toBe(false);
    });

    it("denies course creation, update, archive, delete, and membership management", () => {
      expect(policy.check("course:create", actor, defaultContext)).toBe(false);
      expect(policy.check("course:update", actor, defaultContext)).toBe(false);
      expect(policy.check("course:archive", actor, defaultContext)).toBe(false);
      expect(policy.check("course:delete", actor, defaultContext)).toBe(false);
      expect(policy.check("course:manage_memberships", actor, defaultContext)).toBe(false);
    });

    it("denies content authoring and editorial mutations", () => {
      expect(policy.check("content:write", actor, defaultContext)).toBe(false);
      expect(policy.check("content:publish", actor, defaultContext)).toBe(false);
      expect(policy.check("content:accept", actor, defaultContext)).toBe(false);
      expect(policy.check("content:reject", actor, defaultContext)).toBe(false);
      expect(policy.check("content:regenerate", actor, defaultContext)).toBe(false);
      expect(policy.check("content:edit", actor, defaultContext)).toBe(false);
      expect(policy.check("content:export", actor, defaultContext)).toBe(false);
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

  describe("Phase 3: Context-Aware Actor & ResourceContext Evaluation", () => {
    const orgA = "11111111-1111-1111-1111-111111111111" as OrganizationId;
    const orgB = "22222222-2222-2222-2222-222222222222" as OrganizationId;
    const systemOrg = "00000000-0000-0000-0000-000000000001" as OrganizationId;

    it("1. Global content_worker on official / system content is allowed", () => {
      const globalWorker = {
        userId: mockUserId,
        role: "content_worker" as const,
        globalRole: "content_worker" as const,
        memberships: [],
      };

      const systemContext = {
        organizationId: systemOrg,
        isSystemResource: true,
        resourceType: "course" as const,
      };

      expect(policy.can(globalWorker, "content:generate", systemContext)).toBe(true);
      expect(policy.can(globalWorker, "content:review", systemContext)).toBe(true);
      expect(policy.can(globalWorker, "content:accept", systemContext)).toBe(true);
      expect(policy.can(globalWorker, "content:export", systemContext)).toBe(true);
      expect(policy.can(globalWorker, "course:update", systemContext)).toBe(true);
      expect(() => policy.assertCan(globalWorker, "content:generate", systemContext)).not.toThrow();
    });

    it("2. Tenant content_worker without membership in target tenant is denied", () => {
      const workerNoOrg = {
        userId: mockUserId,
        role: "content_worker" as const,
        globalRole: "content_worker" as const,
        memberships: [{ organizationId: orgA, role: "content_worker" as const }],
      };

      const foreignOrgContext = {
        organizationId: orgB,
        isSystemResource: false,
        resourceType: "content_export" as const,
      };

      expect(policy.can(workerNoOrg, "content:export", foreignOrgContext)).toBe(false);
      expect(() => policy.assertCan(workerNoOrg, "content:export", foreignOrgContext)).toThrowError();
    });

    it("3. Tenant content_worker with matching membership is evaluated against permissions", () => {
      const workerInOrgA = {
        userId: mockUserId,
        role: "content_worker" as const,
        globalRole: "content_worker" as const,
        memberships: [{ organizationId: orgA, role: "content_worker" as const }],
      };

      const orgAContext = {
        organizationId: orgA,
        isSystemResource: false,
        resourceType: "content_export" as const,
      };

      expect(policy.can(workerInOrgA, "content:export", orgAContext)).toBe(true);
      expect(policy.can(workerInOrgA, "content:generate", orgAContext)).toBe(true);
    });

    it("4. Multiple organizations: evaluated against target organization membership", () => {
      const multiOrgUser = {
        userId: mockUserId,
        role: "course_editor" as const,
        globalRole: null,
        memberships: [
          { organizationId: orgA, role: "course_editor" as const },
          { organizationId: orgB, role: "student" as const },
        ],
      };

      // In Org A, user is course_editor -> course:update allowed
      expect(
        policy.can(multiOrgUser, "course:update", {
          organizationId: orgA,
          resourceType: "course",
        }),
      ).toBe(true);

      // In Org B, user is student -> course:update denied
      expect(
        policy.can(multiOrgUser, "course:update", {
          organizationId: orgB,
          resourceType: "course",
        }),
      ).toBe(false);
    });

    it("5. Teacher does not receive content_worker permissions", () => {
      const teacherActor = {
        userId: mockUserId,
        role: "teacher" as const,
        globalRole: null,
        memberships: [{ organizationId: orgA, role: "teacher" as const }],
      };

      const orgContext = { organizationId: orgA, resourceType: "course" as const };

      expect(policy.can(teacherActor, "content:accept", orgContext)).toBe(false);
      expect(policy.can(teacherActor, "content:reject", orgContext)).toBe(false);
      expect(policy.can(teacherActor, "content:regenerate", orgContext)).toBe(false);
      expect(policy.can(teacherActor, "content:edit", orgContext)).toBe(false);
      expect(policy.can(teacherActor, "content:export", orgContext)).toBe(false);
    });

    it("6. Support agent does not receive content_worker permissions", () => {
      const supportActor = {
        userId: mockUserId,
        role: "support_agent" as const,
        globalRole: null,
        memberships: [{ organizationId: orgA, role: "support_agent" as const }],
      };

      const orgContext = { organizationId: orgA, resourceType: "course" as const };

      expect(policy.can(supportActor, "content:generate", orgContext)).toBe(false);
      expect(policy.can(supportActor, "content:review", orgContext)).toBe(false);
      expect(policy.can(supportActor, "content:export", orgContext)).toBe(false);
    });

    it("7. Platform admin retains superuser capabilities across all system and tenant contexts", () => {
      const platformAdmin = {
        userId: mockUserId,
        role: "platform_admin" as const,
        globalRole: "platform_admin" as const,
        memberships: [],
      };

      expect(
        policy.can(platformAdmin, "course:delete", {
          organizationId: orgA,
          resourceType: "course",
        }),
      ).toBe(true);
      expect(
        policy.can(platformAdmin, "content:export", {
          organizationId: orgB,
          resourceType: "content_export",
        }),
      ).toBe(true);
      expect(
        policy.can(platformAdmin, "org:delete", {
          isSystemResource: true,
          resourceType: "organization",
        }),
      ).toBe(true);
    });

    it("8. Multi-org worker matrix: globalRole = content_worker, orgA = teacher, orgB = course_editor", () => {
      const complexWorker = buildActor({
        userId: mockUserId,
        globalRole: "content_worker",
        memberships: [
          { organizationId: orgA, role: "teacher" },
          { organizationId: orgB, role: "course_editor" },
        ],
      });

      const orgC = "33333333-3333-3333-3333-333333333333" as OrganizationId;

      // In Org A (where user is teacher):
      // Teacher role in tenant org lacks content:export and content:write
      expect(policy.can(complexWorker, "content:export", { organizationId: orgA })).toBe(false);
      expect(policy.can(complexWorker, "content:write", { organizationId: orgA })).toBe(false);
      expect(policy.can(complexWorker, "content:generate", { organizationId: orgA })).toBe(true);

      // In Org B (where user is course_editor):
      expect(policy.can(complexWorker, "course:update", { organizationId: orgB })).toBe(true);
      expect(policy.can(complexWorker, "content:accept", { organizationId: orgB })).toBe(true);
      expect(policy.can(complexWorker, "content:write", { organizationId: orgB })).toBe(true);

      // In Org C (unrelated tenant where user has NO membership):
      expect(policy.can(complexWorker, "content:export", { organizationId: orgC })).toBe(false);
      expect(policy.can(complexWorker, "course:update", { organizationId: orgC })).toBe(false);

      // On System Resource (evaluated against globalRole content_worker):
      expect(
        policy.can(complexWorker, "content:generate", { isSystemResource: true }),
      ).toBe(true);
      expect(
        policy.can(complexWorker, "content:write", { isSystemResource: true }),
      ).toBe(true);
    });

    it("9. Student cannot perform admin actions even if claiming isSystemResource", () => {
      const studentActor = buildActor({
        userId: mockUserId,
        globalRole: null,
        memberships: [{ organizationId: orgA, role: "student" }],
      });

      // Claiming isSystemResource does NOT grant course:delete or org:delete to a student
      expect(
        policy.can(studentActor, "course:delete", { isSystemResource: true }),
      ).toBe(false);
      expect(
        policy.can(studentActor, "org:delete", { isSystemResource: true }),
      ).toBe(false);
      expect(
        policy.can(studentActor, "content:accept", { isSystemResource: true }),
      ).toBe(false);
    });

    it("10. buildActor correctly derives effective role while preserving memberships and globalRole", () => {
      const actor = buildActor({
        userId: mockUserId,
        globalRole: "content_worker",
        memberships: [{ organizationId: orgA, role: "course_editor" }],
      });

      expect(actor.userId).toBe(mockUserId);
      expect(actor.globalRole).toBe("content_worker");
      expect(actor.role).toBe("content_worker");
      expect(actor.memberships).toHaveLength(1);
      expect(actor.memberships?.[0].organizationId).toBe(orgA);
      expect(actor.memberships?.[0].role).toBe("course_editor");
    });

    it("11. buildActor without memberships leaves memberships === undefined and allows policy fallback to actor.role", () => {
      const teacherActor = buildActor({
        userId: mockUserId,
        role: "teacher",
      });

      expect(teacherActor.memberships).toBeUndefined();
      expect(teacherActor.role).toBe("teacher");

      // In organization context without explicit memberships:
      // Policy falls back to scalar actor.role (teacher)
      expect(
        policy.can(teacherActor, "content:generate", { organizationId: orgA }),
      ).toBe(true);
      expect(
        policy.can(teacherActor, "course:read", { organizationId: orgA }),
      ).toBe(true);
      // Teacher role does not have course:delete
      expect(
        policy.can(teacherActor, "course:delete", { organizationId: orgA }),
      ).toBe(false);
    });

    it("12. buildActor with explicit memberships restricts authorization to membership roles", () => {
      const actorWithMemberships = buildActor({
        userId: mockUserId,
        role: "course_editor",
        memberships: [{ organizationId: orgA, role: "student" }],
      });

      expect(actorWithMemberships.memberships).toBeDefined();
      expect(actorWithMemberships.memberships).toHaveLength(1);

      // In Org A, actor has explicit student membership -> evaluated as student (no content:write or course:update), NOT course_editor
      expect(
        policy.can(actorWithMemberships, "content:write", { organizationId: orgA }),
      ).toBe(false);
      expect(
        policy.can(actorWithMemberships, "course:update", { organizationId: orgA }),
      ).toBe(false);
      expect(
        policy.can(actorWithMemberships, "course:read", { organizationId: orgA }),
      ).toBe(true);

      // In Org B where actor has no membership in array -> returns false (cross-tenant isolation)
      const orgB = "22222222-2222-2222-2222-222222222222" as OrganizationId;
      expect(
        policy.can(actorWithMemberships, "course:read", { organizationId: orgB }),
      ).toBe(false);
    });

    it("13. buildActor with explicit empty memberships restricts tenant actions", () => {
      const actorWithEmptyMemberships = buildActor({
        userId: mockUserId,
        role: "teacher",
        memberships: [],
      });

      expect(actorWithEmptyMemberships.memberships).toEqual([]);

      // Explicit empty array signals known zero memberships in any org
      expect(
        policy.can(actorWithEmptyMemberships, "course:read", { organizationId: orgA }),
      ).toBe(false);
    });
  });
});
