/**
 * Course content management permissions.
 *
 * Determines whether a user can manage course content based on their
 * organization membership roles.
 *
 * In a multi-organization system, a user's real permissions are stored in
 * `organization_memberships.role`, not in `user.role`. The `/v1/me` and
 * `/v1/auth/sign-in` responses expose these as a `memberships` array, and
 * this helper derives content-management permission from those membership
 * roles.
 *
 * The existing authorization model (packages/domain/src/authorization/policy.ts)
 * grants `content:write` and `content:publish` to:
 *   - platform_admin
 *   - organization_admin
 *   - course_editor
 *
 * Learners (student) have no content management permission, so the
 * "Manage Content" entry is hidden for them.
 */

import type { Role, UserMembership, UserResource } from "@avana/contracts";

/**
 * Roles that are permitted to manage course content.
 */
export const CONTENT_MANAGER_ROLES: ReadonlySet<Role> = new Set<Role>([
  "platform_admin",
  "organization_admin",
  "course_editor",
]);

/**
 * Returns true when the given membership roles or user role permit managing course content.
 *
 * A user may manage course content if any of their organization memberships
 * carries a content-management role, or if their effective user role is a content-management role.
 *
 * @param memberships - The authenticated user's organization memberships, or
 *                      undefined when unauthenticated.
 * @param user - The current authenticated user resource, or undefined.
 */
export function canManageCourseContent(
  memberships?: Pick<UserMembership, "role">[] | null,
  user?: Pick<UserResource, "role"> | { role?: Role | string } | null,
): boolean {
  if (user?.role && CONTENT_MANAGER_ROLES.has(user.role as Role)) {
    return true;
  }
  if (!memberships || memberships.length === 0) {
    return false;
  }
  return memberships.some((membership) =>
    Boolean(membership.role && CONTENT_MANAGER_ROLES.has(membership.role as Role)),
  );
}

/**
 * Resolves the natural post-login landing route for an authenticated user.
 *
 * When no explicit redirect target is specified:
 * - course_editor (who is not platform_admin) lands on their primary workspace: "/admin/courses"
 * - All other roles (student, teacher, platform_admin, content_worker) land on "/home"
 */
export function resolveDefaultLandingRoute(
  user?: Pick<UserResource, "role"> | { role?: Role | string } | null,
  memberships?: Pick<UserMembership, "role">[] | null,
): string {
  const role = user?.role;
  const isCourseEditor =
    role === "course_editor" ||
    (Boolean(memberships?.some((m) => m.role === "course_editor")) && role !== "platform_admin");

  if (isCourseEditor) {
    return "/admin/courses";
  }
  return "/home";
}
