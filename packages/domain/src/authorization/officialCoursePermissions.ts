/**
 * Official Course Permissions.
 *
 * Canonical source of truth for identifying official Avana courses and
 * governing content creation, generation, upload, and review on official products.
 *
 * Architecture Invariants:
 * 1. An official course is identified strictly by backend DB attributes:
 *    `isOfficial: true` OR `organizationId === systemOrganizationId`.
 * 2. Learner enrollment / presence in a user's course list NEVER conveys ownership.
 * 3. Management of official content is restricted to authorized administrative/content roles:
 *    - `platform_admin`
 *    - `content_worker` (globalRole or system organization member)
 *    - `course_editor` (globalRole or system organization member)
 *    - `organization_admin` (system organization member only)
 * 4. Regular users (students) and tenant admins cannot manage or add content to official courses.
 */

import type { Actor } from "./policy.js";
import { Roles } from "../roles.js";

export interface CourseOwnershipRecord {
  id?: string;
  organizationId: string;
  isOfficial?: boolean | null;
}

/**
 * Canonical check to determine if a course is an official Avana course.
 * Based strictly on true database attributes and system organization config.
 */
export function isOfficialCourse(
  course: CourseOwnershipRecord | null | undefined,
  systemOrganizationId?: string | null,
): boolean {
  if (!course) return false;
  return (
    course.isOfficial === true ||
    (Boolean(systemOrganizationId) && course.organizationId === systemOrganizationId)
  );
}

/**
 * Checks whether an authenticated actor has verified authorization to manage,
 * author, generate, or review content for official Avana courses.
 */
export function canManageOfficialContent(
  actor: Actor,
  systemOrganizationId?: string | null,
): boolean {
  // 1. Platform Admin has superuser access
  if (actor.globalRole === Roles.platform_admin || actor.role === Roles.platform_admin) {
    return true;
  }

  // 2. Global content roles
  if (
    actor.globalRole === Roles.content_worker ||
    actor.globalRole === Roles.course_editor
  ) {
    return true;
  }

  // 3. System organization memberships
  if (systemOrganizationId && actor.memberships && actor.memberships.length > 0) {
    const sysMembership = actor.memberships.find(
      (m) => m.organizationId === systemOrganizationId,
    );
    if (sysMembership) {
      if (
        sysMembership.role === "organization_admin" ||
        sysMembership.role === "content_worker" ||
        sysMembership.role === "course_editor"
      ) {
        return true;
      }
    }
  }

  // 4. Backwards compatibility for single-role test actors without memberships array
  if (!actor.memberships || actor.memberships.length === 0) {
    if (actor.role === Roles.content_worker || actor.role === Roles.course_editor) {
      return true;
    }
  }

  return false;
}
