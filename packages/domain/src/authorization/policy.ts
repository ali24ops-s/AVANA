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
import { isRole, resolveEffectiveRole, Roles, type Role } from "../roles.js";
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
  | "study:read"
  | "content:export";

// ---------------------------------------------------------------------------
// Actor & Membership
// ---------------------------------------------------------------------------

export type OrganizationMembership = {
  organizationId: OrganizationId | string;
  role: Role;
};

/**
 * The actor requesting an authorization decision.
 * Supports rich multi-organization memberships and global functional roles.
 */
export type Actor = {
  userId: UserId;
  /** Effective role for backwards compatibility with single-role callers. */
  role: Role;
  /** Global platform role (e.g. platform_admin or content_worker). */
  globalRole?: Role | null;
  /** Organization memberships held by the actor. */
  memberships?: readonly OrganizationMembership[];
};

export interface BuildActorInput {
  userId: UserId;
  globalRole?: Role | string | null;
  memberships?: readonly OrganizationMembership[];
  role?: Role | string;
}

/**
 * Factory to build a strongly-typed Actor from identity data.
 */
export function buildActor(input: BuildActorInput): Actor {
  const globalRole =
    input.globalRole && isRole(input.globalRole)
      ? (input.globalRole as Role)
      : null;
  const memberships = input.memberships
    ? input.memberships.map((m) => ({ ...m }))
    : undefined;
  const role =
    input.role && isRole(input.role)
      ? (input.role as Role)
      : resolveEffectiveRole(
          globalRole,
          memberships ? memberships.map((m) => m.role) : [],
        );

  return {
    userId: input.userId,
    role,
    globalRole,
    memberships,
  };
}

// ---------------------------------------------------------------------------
// Context & ResourceContext
// ---------------------------------------------------------------------------

/**
 * Legacy AuthContext for organization-scoped route handlers.
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

export type ResourceType =
  | "organization"
  | "course"
  | "module"
  | "lesson"
  | "document"
  | "generated_content"
  | "prompt"
  | "content_repair"
  | "content_export"
  | "content_import"
  | "support_ticket"
  | "commerce_order";

/**
 * Rich resource context for context-aware policy evaluation (Phase 3).
 */
export type ResourceContext = {
  /** The organization the resource belongs to. */
  organizationId?: OrganizationId | string;
  /** The specific type of the resource. */
  resourceType?: ResourceType;
  /** The unique identifier of the target resource. */
  resourceId?: string;
  /** Whether the target resource is a platform-wide system / official resource. */
  isSystemResource?: boolean;
  /** The owner user ID of the resource, if user-owned. */
  ownerId?: UserId;
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

  /**
   * Context-aware evaluation (Phase 3).
   */
  can(actor: Actor, action: AuthAction, context?: ResourceContext): boolean;

  /**
   * Context-aware requirement asserting permission or throwing DomainError (Phase 3).
   */
  assertCan(actor: Actor, action: AuthAction, context?: ResourceContext): void;
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

    // Teacher permissions
    this.rolePermissions.set(
      "teacher",
      new Set([
        "org:read",
        "course:read",
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

    // Content worker permissions (content creation, generation, review, approve & export)
    this.rolePermissions.set(
      "content_worker",
      new Set([
        "org:read",
        "course:create",
        "course:read",
        "course:update",
        "course:archive",
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
        "content:export",
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
        "content:export",
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
        "content:export",
      ]),
    );

    // Reserved support role
    this.rolePermissions.set("support_agent", new Set());
  }

  can(actor: Actor, action: AuthAction, context?: ResourceContext): boolean {
    // 1. Superuser Platform Admin bypass
    if (
      actor.globalRole === Roles.platform_admin ||
      actor.role === Roles.platform_admin
    ) {
      return true;
    }

    // 2. System / Official Resource Evaluation
    if (context?.isSystemResource === true) {
      const activeRole = actor.globalRole ?? actor.role;
      const permissions = this.rolePermissions.get(activeRole);
      return permissions?.has(action) ?? false;
    }

    // 3. Tenant-Scoped Resource Evaluation
    if (context?.organizationId) {
      if (actor.memberships !== undefined) {
        const matchingMembership = actor.memberships.find(
          (m) => m.organizationId === context.organizationId,
        );

        // If actor has NO membership in this tenant organization:
        if (!matchingMembership) {
          return false;
        }

        // Check permissions in target organization based strictly on membership role
        const tenantRolePermissions = this.rolePermissions.get(
          matchingMembership.role,
        );
        return tenantRolePermissions?.has(action) ?? false;
      }

      // If actor has no memberships list attached, evaluate against scalar role
      const permissions = this.rolePermissions.get(actor.role);
      return permissions?.has(action) ?? false;
    }

    // 4. Default / Global Action Evaluation without specific tenant org
    const effectiveRole = actor.globalRole ?? actor.role;
    const permissions = this.rolePermissions.get(effectiveRole);
    return permissions?.has(action) ?? false;
  }

  assertCan(actor: Actor, action: AuthAction, context?: ResourceContext): void {
    if (!this.can(actor, action, context)) {
      throw new DomainError(
        "forbidden",
        `Action '${action}' not permitted for actor '${actor.userId}' in the requested context`,
      );
    }
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
    return this.can(actor, action, {
      organizationId: _context.organizationId,
      courseId: _context.courseId,
      moduleId: _context.moduleId,
      lessonId: _context.lessonId,
    });
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

/** Shared policy instance. */
export const defaultPolicy = new RoleBasedPolicy();
