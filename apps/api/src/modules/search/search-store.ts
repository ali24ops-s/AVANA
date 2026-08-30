/**
 * Search Store Interface.
 *
 * Provides repository operations for user-scoped search across
 * accessible courses and published shared content.
 */

import type { CourseId, OrganizationId, UserId } from "@avana/domain";

export interface CourseSearchItem {
  id: CourseId;
  name: string;
  subject: string | null;
  organizationId: OrganizationId;
  createdAt: string;
}

export interface SharedContentSearchItem {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  publishedAt: string;
  usageCount: number;
}

export interface SearchStore {
  /**
   * Search courses accessible to the authenticated user.
   * Follows canonical Course access control: courses in organizations where the user
   * holds membership, or shared system courses (systemOrganizationId).
   */
  searchCourses(
    userId: UserId,
    query: string,
    systemOrganizationId?: OrganizationId,
    limit?: number,
  ): Promise<CourseSearchItem[]>;

  /**
   * Search published shared content (Public Library Content Packs).
   * Follows canonical Library access control: status === 'published' AND deletedAt IS NULL.
   */
  searchSharedContent(
    query: string,
    limit?: number,
  ): Promise<SharedContentSearchItem[]>;
}
