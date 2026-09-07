/**
 * Admin permission resolution utilities.
 *
 * Centralizes administrative role checks for UI elements and hooks,
 * ensuring privileged components (like GlobalGenerationIndicator) are
 * only mounted and queried for administrative users.
 */

import type { Role, UserMembership, UserResource } from "@avana/contracts";

/**
 * Roles considered administrative in the AVANA platform.
 */
export const ADMIN_ROLES: ReadonlySet<Role> = new Set<Role>([
  "platform_admin",
  "organization_admin",
  "content_worker",
]);

/**
 * Checks whether the given user or their organization memberships carry administrative privileges.
 *
 * @param user The current authenticated UserResource, or null/undefined.
 * @param memberships The user's list of UserMembership records, or null/undefined.
 * @returns `true` if the user has an administrative role, `false` otherwise.
 */
export function isUserAdmin(
  user?: Pick<UserResource, "role"> | { role?: Role | string } | null,
  memberships?: Pick<UserMembership, "role">[] | { role?: Role | string }[] | null,
): boolean {
  if (!user) {
    return false;
  }

  // 1. Check direct user role
  if (user.role && ADMIN_ROLES.has(user.role as Role)) {
    return true;
  }

  // 2. Check organization memberships
  if (memberships && Array.isArray(memberships)) {
    return memberships.some((m) => Boolean(m.role && ADMIN_ROLES.has(m.role as Role)));
  }

  return false;
}
