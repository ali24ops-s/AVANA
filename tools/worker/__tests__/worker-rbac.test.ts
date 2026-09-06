import { describe, expect, it } from "vitest";
import { Roles, isRole, resolveEffectiveRole, RoleBasedPolicy } from "@avana/domain";

describe("Worker RBAC & Permission Tests", () => {
  describe("content_worker role definition", () => {
    it("is recognized as a valid domain Role", () => {
      expect(isRole(Roles.content_worker)).toBe(true);
      expect(Roles.content_worker).toBe("content_worker");
    });

    it("resolves effective role to content_worker, NEVER platform_admin", () => {
      // Global role content_worker
      expect(resolveEffectiveRole(Roles.content_worker, [])).toBe("content_worker");
      expect(resolveEffectiveRole(Roles.content_worker, ["student"])).toBe("content_worker");

      // Organization membership role content_worker
      expect(resolveEffectiveRole(null, ["content_worker"])).toBe("content_worker");
      expect(resolveEffectiveRole(null, ["student", "content_worker"])).toBe("content_worker");

      // Cannot escalate to platform_admin through organization role
      expect(resolveEffectiveRole(null, ["content_worker", "platform_admin"])).toBe("content_worker");
    });
  });

  describe("RoleBasedPolicy for content_worker", () => {
    const policy = new RoleBasedPolicy();
    const mockContext = {
      organizationId: "org-1",
      courseId: "course-1",
    };

    const workerActor = {
      userId: "worker-user-1",
      role: Roles.content_worker,
    };

    const studentActor = {
      userId: "student-user-1",
      role: Roles.student,
    };

    const adminActor = {
      userId: "admin-user-1",
      role: Roles.platform_admin,
    };

    it("grants content_worker full content generation, editing, and approval permissions", () => {
      expect(policy.check("content:generate", workerActor, mockContext)).toBe(true);
      expect(policy.check("content:review", workerActor, mockContext)).toBe(true);
      expect(policy.check("content:accept", workerActor, mockContext)).toBe(true);
      expect(policy.check("content:reject", workerActor, mockContext)).toBe(true);
      expect(policy.check("content:regenerate", workerActor, mockContext)).toBe(true);
      expect(policy.check("content:edit", workerActor, mockContext)).toBe(true);
      expect(policy.check("course:read", workerActor, mockContext)).toBe(true);
      expect(policy.check("course:update", workerActor, mockContext)).toBe(true);
      expect(policy.check("document:upload", workerActor, mockContext)).toBe(true);
      expect(policy.check("document:read", workerActor, mockContext)).toBe(true);
    });

    it("grants content:export to content_worker and platform_admin", () => {
      expect(policy.check("content:export", workerActor, mockContext)).toBe(true);
      expect(policy.check("content:export", adminActor, mockContext)).toBe(true);
    });

    it("DENIES content:export to student", () => {
      expect(policy.check("content:export", studentActor, mockContext)).toBe(false);
    });

    it("DENIES administrative and destructive actions to content_worker", () => {
      // Destructive actions
      expect(policy.check("course:delete", workerActor, mockContext)).toBe(false);
      expect(policy.check("org:delete", workerActor, mockContext)).toBe(false);

      // User & membership management
      expect(policy.check("org:manage_memberships", workerActor, mockContext)).toBe(false);
      expect(policy.check("course:manage_memberships", workerActor, mockContext)).toBe(false);
      expect(policy.check("org:list_members", workerActor, mockContext)).toBe(false);
    });
  });
});
