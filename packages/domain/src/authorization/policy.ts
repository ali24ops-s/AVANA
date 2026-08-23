/**
 * Framework-independent authorization policy.
 *
 * Centralizes authorization decisions so that route handlers never
 * duplicate permission logic. Policy is role-based with organization
 * and course scoping.
 *
 * Per PR-8 acceptance criteria:
 * - Defines actions: create_org, read_org, update_org, delete_org,
 *   manage_memberships, create_course, read_course, update_course,
 *   archive_course, delete_course, manage_course_memberships
 * - Roles: student, course_editor, organization_admin
 * - Higher roles (support_agent, platform_admin) are reserved.
 * - No tenant-owned resource may be resolved by ID alone.
 */

import type {
  UserId,
  OrganizationId,
  CourseId,
  ModuleId,
  LessonId,
} from "../ids.js";
import type { Role } from "../roles.js";
import { DomainError } from "../errors.js";

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

/**
 * Authorization actions relevant to Sprint 1 and Sprint 2 (Learning Core).
 *
 * Sprint 2 adds:
 * - learning:read — view course learning structure and lesson content
 * - progress:write — mark a lesson as complete/incomplete (self only)
 * - progress:read — view own progress
 *
 * PR6-4 (AI generation) adds:
 * - content:generate — propose AI-generated content drafts
 * - content:review — list/read generated content drafts
 * - content:accept — accept a draft (future PR)
 * - content:reject — reject a draft (future PR)
 * - content:regenerate — regenerate a draft (future PR)
 */
export type AuthAction =
  | "org:create"
  | "org:read"
  | "org:update"
  | "org:delete"
  | "org:list_members"
  | "org:manage_memberships"
  | "course:create"
  | "course:read"
  | "course:update"
  | "course:archive"
  | "course:delete"
  | "course:manage_memberships"
  | "learning:read"
  | "progress:write"
  | "progress:read"
  | "content:write"
  | "content:publish"
  | "document:upload"
  | "document:read"
  | "content:generate"
  | "content:review"
  | "content:accept"
  | "content:reject"
  | "content:regenerate"
  | "content:edit"
  | "flashcard:review"
  | "quiz:attempt"
  | "study:read";

// ---------------------------------------------------------------------------
// Actor
// ---------------------------------------------------------------------------

/**
 * The actor requesting an authorization decision.
 */
export type Actor = {
  userId: UserId;
  role: Role;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

/**
 * The resource context for an authorization decision.
 */
export type AuthContext = {
  /** The organization the actor is acting within. */
  organizationId: OrganizationId;
  /** Optional course context. */
  courseId?: CourseId;
  /** Optional module context. */
  moduleId?: ModuleId;
  /** Optional lesson context. */
  lessonId?: LessonId;
};

// ---------------------------------------------------------------------------
// Policy interface
// ---------------------------------------------------------------------------

/**
 * Authorization policy interface.
 *
 * Implementations evaluate whether an actor is allowed to perform
 * an action in a given context.
 */
export interface AuthorizationPolicy {
  /**
   * Check whether an action is permitted.
   *
   * @throws {DomainError} with code "forbidden" if not permitted.
   */
  require(action: AuthAction, actor: Actor, context: AuthContext): void;

  /**
   * Check whether an action is permitted (boolean form).
   */
  check(action: AuthAction, actor: Actor, context: AuthContext): boolean;
}

// ---------------------------------------------------------------------------
// Role-based policy
// ---------------------------------------------------------------------------

/**
 * Role-based authorization policy.
 *
 * Permission matrix:
 *
 * | Action                    | student | course_editor | org_admin | platform_admin |
 * |---------------------------|---------|---------------|-----------|----------------|
 * | org:read                  | ✓       | ✓             | ✓         | ✓              |
 * | org:update                | ✗       | ✗             | ✓         | ✓              |
 * | org:delete                | ✗       | ✗             | ✗         | ✓              |
 * | org:list_members          | ✗       | ✗             | ✓         | ✓              |
 * | org:manage_memberships    | ✗       | ✗             | ✓         | ✓              |
 * | course:create             | ✓       | ✓             | ✓         | ✓              |
 * | course:read               | ✓       | ✓             | ✓         | ✓              |
 * | course:update             | ✗       | ✓             | ✓         | ✓              |
 * | course:archive            | ✗       | ✗             | ✓         | ✓              |
 * | course:delete             | ✗       | ✗             | ✗         | ✓              |
 * | course:manage_memberships | ✗       | ✗             | ✓         | ✓              |
 * | learning:read             | ✓       | ✓             | ✓         | ✓              |
 * | progress:write            | ✓       | ✓             | ✓         | ✓              |
 * | progress:read             | ✓       | ✓             | ✓         | ✓              |
 * | content:write             | ✗       | ✓             | ✓         | ✓              |
 * | content:publish           | ✗       | ✓             | ✓         | ✓              |
 * | document:upload           | ✓       | ✓             | ✓         | ✓              |
 * | document:read             | ✓       | ✓             | ✓         | ✓              |
 * | content:generate          | ✓       | ✓             | ✓         | ✓              |
 * | content:review            | ✓       | ✓             | ✓         | ✓              |
 * | content:accept            | ✗       | ✓             | ✓         | ✓              |
 * | content:reject            | ✗       | ✓             | ✓         | ✓              |
 * | content:regenerate        | ✗       | ✓             | ✓         | ✓              |
 * | content:edit              | ✗       | ✓             | ✓         | ✓              |
 * | flashcard:review          | ✓       | ✓             | ✓         | ✓              |
 * | quiz:attempt              | ✓       | ✓             | ✓         | ✓              |
 * | study:read                | ✓       | ✓             | ✓         | ✓              |
 *
 * org:create is handled specially — any authenticated user can create
 * an organization (they become the admin).
 *
 * Sprint 2 note: progress:write and progress:read are always scoped to
 * the requesting user. One student cannot modify another student's progress.
 * This is enforced at the route/service layer, not the policy layer.
 *
 * PR6-4 note: ownership scoping for generated content is enforced at the
 * service layer (matching the existing findByIdForOwner pattern); the policy
 * layer only grants the action to the supported roles.
 */
export class RoleBasedPolicy implements AuthorizationPolicy {
  private readonly rolePermissions: Map<Role, Set<AuthAction>>;

  constructor() {
    this.rolePermissions = new Map();

    // Student permissions
    this.rolePermissions.set(
      "student",
      new Set([
        "org:read",
        "course:create",
        "course:read",
        "org:create",
        "learning:read",
        "progress:write",
        "progress:read",
        "document:upload",
        "document:read",
        "content:generate",
        "content:review",
        "flashcard:review",
        "quiz:attempt",
        "study:read",
      ]),
    );

    // Course editor permissions (extends student)
    this.rolePermissions.set(
      "course_editor",
      new Set([
        "org:read",
        "course:create",
        "course:read",
        "course:update",
        "org:create",
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
      ]),
    );

    // Organization admin permissions
    this.rolePermissions.set(
      "organization_admin",
      new Set([
        "org:read",
        "org:update",
        "org:list_members",
        "org:manage_memberships",
        "course:create",
        "course:read",
        "course:update",
        "course:archive",
        "course:manage_memberships",
        "org:create",
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
      ]),
    );

    // Platform admin permissions (top-level superuser role with full platform permissions)
    this.rolePermissions.set(
      "platform_admin",
      new Set([
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
      ]),
    );

    // Reserved support role
    this.rolePermissions.set("support_agent", new Set());
  }

  require(action: AuthAction, actor: Actor, _context: AuthContext): void {
    if (!this.check(action, actor, _context)) {
      throw new DomainError(
        "forbidden",
        `Action '${action}' not permitted for role '${actor.role}'`,
      );
    }
  }

  check(action: AuthAction, actor: Actor, _context: AuthContext): boolean {
    const permissions = this.rolePermissions.get(actor.role);
    if (!permissions) {
      return false;
    }
    return permissions.has(action);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/** Shared policy instance. */
export const defaultPolicy = new RoleBasedPolicy();
