/**
 * Drizzle-backed implementation of SearchStore.
 */

import { and, eq, ilike, inArray, isNull, or } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  courses,
  organizationMemberships,
  contentPacks,
} from "@avana/database/schema";
import type {
  SearchStore,
  CourseSearchItem,
  SharedContentSearchItem,
} from "./search-store.js";
import type { CourseId, OrganizationId, UserId } from "@avana/domain";

export class DrizzleSearchStore implements SearchStore {
  constructor(private readonly db: DbClient) {}

  async searchCourses(
    userId: UserId,
    query: string,
    systemOrganizationId?: OrganizationId,
    limit = 20,
  ): Promise<CourseSearchItem[]> {
    const pattern = `%${query.trim()}%`;

    const userOrgIdsSubquery = this.db
      .select({ organizationId: organizationMemberships.organizationId })
      .from(organizationMemberships)
      .where(eq(organizationMemberships.userId, userId));

    const orgFilter = systemOrganizationId
      ? or(
          inArray(courses.organizationId, userOrgIdsSubquery),
          eq(courses.organizationId, systemOrganizationId),
        )
      : inArray(courses.organizationId, userOrgIdsSubquery);

    const rows = await this.db
      .select({
        id: courses.id,
        name: courses.name,
        subject: courses.subject,
        organizationId: courses.organizationId,
        createdAt: courses.createdAt,
      })
      .from(courses)
      .where(
        and(
          isNull(courses.deletedAt),
          orgFilter,
          or(
            ilike(courses.name, pattern),
            ilike(courses.subject, pattern),
          ),
        ),
      )
      .limit(limit);

    return rows.map((r) => ({
      id: r.id as CourseId,
      name: r.name,
      subject: r.subject,
      organizationId: r.organizationId as OrganizationId,
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : new Date(r.createdAt).toISOString(),
    }));
  }

  async searchSharedContent(
    query: string,
    limit = 20,
  ): Promise<SharedContentSearchItem[]> {
    const pattern = `%${query.trim()}%`;

    const rows = await this.db
      .select({
        id: contentPacks.id,
        title: contentPacks.title,
        description: contentPacks.description,
        subject: contentPacks.subject,
        publishedAt: contentPacks.publishedAt,
        usageCount: contentPacks.usageCount,
      })
      .from(contentPacks)
      .where(
        and(
          eq(contentPacks.status, "published"),
          isNull(contentPacks.deletedAt),
          or(
            ilike(contentPacks.title, pattern),
            ilike(contentPacks.description, pattern),
            ilike(contentPacks.subject, pattern),
          ),
        ),
      )
      .limit(limit);

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      subject: r.subject,
      publishedAt:
        r.publishedAt instanceof Date
          ? r.publishedAt.toISOString()
          : new Date(r.publishedAt).toISOString(),
      usageCount: r.usageCount,
    }));
  }
}
