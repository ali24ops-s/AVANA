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
 * Precedence ordering used to resolve a single "effective" role when a user
 * holds multiple roles (e.g. across multiple organization memberships).
 *
 * Higher precedence (earlier in the array) wins. This follows the existing
 * authorization policy: `organization_admin` and `course_editor` are the
 * content-management roles, with `organization_admin` strictly more
 * privileged than `course_editor`. `platform_admin`/`support_agent` are
 * reserved and given the highest precedence so they are never masked by a
 * lower org membership role.
 *
 * No new roles are introduced — this only ranks the existing `Role` values.
 */
const ROLE_PRECEDENCE: readonly Role[] = [
  Roles.platform_admin,
  Roles.support_agent,
  Roles.organization_admin,
  Roles.course_editor,
  Roles.teacher,
  Roles.student,
];

/**
 * Return the most-privileged role among the provided roles.
 *
 * Used to expose a single effective role to the frontend. If `roles` is empty
 * or contains no recognized roles, returns `"student"` as a safe default.
 */
export function resolveEffectiveRole(roles: readonly Role[]): Role {
  for (const candidate of ROLE_PRECEDENCE) {
    if (roles.includes(candidate)) {
      return candidate;
    }
  }
  return Roles.student;
}
