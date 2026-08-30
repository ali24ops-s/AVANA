/**
 * Domain role abstractions.
 */

export type Role =
  | "student"
  | "teacher"
  | "course_editor"
  | "organization_admin"
  | "support_agent"
  | "platform_admin";

export const Roles = {
  student: "student" as const,
  teacher: "teacher" as const,
  course_editor: "course_editor" as const,
  organization_admin: "organization_admin" as const,
  support_agent: "support_agent" as const,
  platform_admin: "platform_admin" as const,
};

export function isRole(value: string): value is Role {
  return (
    value === Roles.student ||
    value === Roles.teacher ||
    value === Roles.course_editor ||
    value === Roles.organization_admin ||
    value === Roles.support_agent ||
    value === Roles.platform_admin
  );
}

// ---------------------------------------------------------------------------
// Effective role resolution
// ---------------------------------------------------------------------------

/**
 * Precedence ordering for Organization-scoped roles.
 * Higher precedence (earlier in the array) wins when resolving organization memberships.
 *
 * NOTE: platform_admin is strictly EXCLUDED from organization roles because it is a
 * Global Platform Role and must only be granted via users.global_role.
 */
export const ORGANIZATION_ROLE_PRECEDENCE: readonly Role[] = [
  Roles.support_agent,
  Roles.organization_admin,
  Roles.course_editor,
  Roles.teacher,
  Roles.student,
];

/**
 * Resolves a user's effective role by combining their Global Platform Role and
 * their organization membership roles.
 *
 * Enforcement Rules:
 * 1. Global Role: If globalRole === "platform_admin", the effective role is ALWAYS "platform_admin".
 * 2. Organization Roles: When globalRole is NULL (or not platform_admin), only valid
 *    organization-scoped roles (organization_admin, course_editor, teacher, student)
 *    are considered according to ORGANIZATION_ROLE_PRECEDENCE.
 *    Any "platform_admin" value in membership roles is strictly IGNORED and cannot grant
 *    platform admin privileges.
 * 3. Fallback: If no valid organization roles exist and globalRole is NULL, returns "student".
 */
export function resolveEffectiveRole(
  globalRoleOrRoles:
    | Role
    | string
    | null
    | undefined
    | readonly (Role | string | null | undefined)[],
  membershipRoles?: readonly (Role | string | null | undefined)[],
): Role {
  let globalRole: string | null | undefined = null;
  let orgRoles: readonly (Role | string | null | undefined)[] = [];

  if (Array.isArray(globalRoleOrRoles)) {
    // Calling convention: resolveEffectiveRole([globalRole, ...membershipRoles])
    globalRole = globalRoleOrRoles[0];
    orgRoles = globalRoleOrRoles.slice(1);
  } else {
    // Calling convention: resolveEffectiveRole(globalRole, membershipRoles)
    globalRole = globalRoleOrRoles as Role | string | null | undefined;
    orgRoles = membershipRoles ?? [];
  }

  // 1. If globalRole === platform_admin, effective role is platform_admin
  if (globalRole === Roles.platform_admin) {
    return Roles.platform_admin;
  }

  // 2. Resolve organization-scoped roles (strictly excluding platform_admin)
  for (const candidate of ORGANIZATION_ROLE_PRECEDENCE) {
    if (orgRoles.includes(candidate)) {
      return candidate;
    }
  }

  // 3. Fallback to student default
  return Roles.student;
}
