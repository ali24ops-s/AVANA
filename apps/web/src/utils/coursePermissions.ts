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

import type { Role, UserMembership } from "@avana/contracts";

/**
 * Roles that are permitted to manage course content.
 */
const CONTENT_MANAGER_ROLES: ReadonlySet<Role> = new Set<Role>([
  "platform_admin",
  "organization_admin",
  "course_editor",
]);

/**
 * Returns true when the given membership roles permit managing course content.
 *
 * A user may manage course content if any of their organization memberships
 * carries a content-management role.
 *
 * @param memberships - The authenticated user's organization memberships, or
 *                      undefined when unauthenticated.
 */
export function canManageCourseContent(
  memberships: UserMembership[] | undefined,
): boolean {
  if (!memberships || memberships.length === 0) {
    return false;
  }
  return memberships.some((membership) =>
    CONTENT_MANAGER_ROLES.has(membership.role),
  );
}
