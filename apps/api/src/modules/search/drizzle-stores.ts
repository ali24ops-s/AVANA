/**
 * Drizzle-backed implementation of SearchStore.
 */

import { and, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  courses,
  organizationMemberships,
  contentPacks,
  modules,
  lessons,
  flashcards,
  quizzes,
  generatedContents,
} from "@avana/database/schema";
import type {
  SearchStore,
  CourseSearchItem,
  SharedContentSearchItem,
  EducationalPackSearchItem,
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

    const sysOrg = systemOrganizationId || "00000000-0000-0000-0000-000000000001";
    const orgFilter = or(
      inArray(courses.organizationId, userOrgIdsSubquery),
      eq(courses.isOfficial, true),
      eq(courses.organizationId, sysOrg),
    );

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
          eq(courses.status, "published"),
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
    systemOrganizationId?: OrganizationId,
  ): Promise<SharedContentSearchItem[]> {
    const pattern = `%${query.trim()}%`;

    // 1. Standalone published Content Packs
    const packRows = await this.db
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

    // 2. Educational Chapter Packages from Modules of Published/Official Courses
    // Visibility rule: Course must be active, published, and (official or system organization)
    // AND the module must contain at least one published/previewable asset
    const sysOrg = systemOrganizationId || "00000000-0000-0000-0000-000000000001";
    const courseVisibilityCondition = and(
      isNull(courses.deletedAt),
      eq(courses.status, "published"),
      or(
        eq(courses.isOfficial, true),
        eq(courses.organizationId, sysOrg),
      ),
    );

    const moduleRows = await this.db
      .select({
        id: modules.id,
        title: modules.title,
        description: modules.description,
        subject: courses.subject,
        publishedAt: modules.createdAt,
      })
      .from(modules)
      .innerJoin(courses, eq(modules.courseId, courses.id))
      .where(
        and(
          isNull(modules.deletedAt),
          courseVisibilityCondition,
          or(
            ilike(modules.title, pattern),
            ilike(modules.description, pattern),
            ilike(courses.subject, pattern),
            sql`EXISTS (
              SELECT 1 FROM ${lessons} l
              WHERE l.module_id = ${modules.id}
              AND l.deleted_at IS NULL
              AND l.publication_status = 'published'
              AND l.title ILIKE ${pattern}
            )`,
          ),
          or(
            sql`EXISTS (
              SELECT 1 FROM ${lessons} l
              WHERE l.module_id = ${modules.id}
              AND l.deleted_at IS NULL
              AND l.publication_status = 'published'
            )`,
            sql`EXISTS (
              SELECT 1 FROM ${contentPacks} cp
              WHERE ${modules.documentId} IS NOT NULL
              AND cp.source_document_id = ${modules.documentId}
              AND cp.status = 'published'
              AND cp.deleted_at IS NULL
            )`,
            sql`EXISTS (
              SELECT 1 FROM ${generatedContents} gc
              WHERE ${modules.documentId} IS NOT NULL
              AND gc.document_id = ${modules.documentId}
              AND gc.type = 'review_summary'
              AND (gc.status = 'accepted' OR gc.status = 'published')
              AND gc.deleted_at IS NULL
            )`,
            sql`EXISTS (
              SELECT 1 FROM ${flashcards} f
              WHERE f.deleted_at IS NULL
              AND (
                (${modules.documentId} IS NOT NULL AND f.document_id = ${modules.documentId})
                OR EXISTS (
                  SELECT 1 FROM ${lessons} l
                  WHERE l.id = f.lesson_id
                  AND l.module_id = ${modules.id}
                  AND l.deleted_at IS NULL
                  AND l.publication_status = 'published'
                )
              )
            )`,
            sql`EXISTS (
              SELECT 1 FROM ${quizzes} q
              WHERE q.deleted_at IS NULL
              AND ${modules.documentId} IS NOT NULL
              AND q.document_id = ${modules.documentId}
            )`,
          ),
        ),
      )
      .limit(limit);

    const seenIds = new Set<string>();
    const results: SharedContentSearchItem[] = [];

    for (const p of packRows) {
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        results.push({
          id: p.id,
          title: p.title,
          description: p.description,
          subject: p.subject,
          publishedAt:
            p.publishedAt instanceof Date
              ? p.publishedAt.toISOString()
              : new Date(p.publishedAt).toISOString(),
          usageCount: p.usageCount,
        });
      }
    }

    for (const m of moduleRows) {
      if (!seenIds.has(m.id)) {
        seenIds.add(m.id);
        results.push({
          id: m.id,
          title: m.title,
          description: m.description,
          subject: m.subject,
          publishedAt:
            m.publishedAt instanceof Date
              ? m.publishedAt.toISOString()
              : new Date(m.publishedAt).toISOString(),
          usageCount: 0,
        });
      }
    }

    return results.slice(0, limit);
  }

  async searchEducationalPacks(
    query: string,
    limit = 20,
    systemOrganizationId?: OrganizationId,
  ): Promise<EducationalPackSearchItem[]> {
    return this.searchSharedContent(query, limit, systemOrganizationId);
  }
}
