/**
 * Generation permission utilities.
 *
 * Coordinates administrative checks and feature flags to govern
 * access to content generation flows.
 */

import type { Role, UserMembership, UserResource } from "@avana/contracts";
import { isUserAdmin } from "./adminPermissions.js";
import { canManageCourseContent } from "./coursePermissions.js";
import { CONTENT_GENERATION_ENABLED } from "../config/features.js";

/**
 * Checks whether the user has administrative or course-manager privileges.
 *
 * Covers:
 * - platform_admin
 * - organization_admin
 * - content_worker
 * - course_editor
 */
export function isContentManagerOrAdmin(
  user?: Pick<UserResource, "role"> | { role?: Role | string } | null,
  memberships?: Pick<UserMembership, "role">[] | { role?: Role | string }[] | null,
): boolean {
  return isUserAdmin(user, memberships) || canManageCourseContent(memberships as UserMembership[]);
}

/**
 * Determines whether content generation is enabled for the given user.
 *
 * - Privileged users (platform_admin, organization_admin, content_worker, course_editor)
 *   always retain access regardless of the feature flag.
 * - Regular users (e.g. students) are controlled by the CONTENT_GENERATION_ENABLED feature flag.
 */
export function canUserGenerateContent(
  user?: Pick<UserResource, "role"> | { role?: Role | string } | null,
  memberships?: Pick<UserMembership, "role">[] | { role?: Role | string }[] | null,
): boolean {
  if (isContentManagerOrAdmin(user, memberships)) {
    return true;
  }
  return CONTENT_GENERATION_ENABLED;
}
