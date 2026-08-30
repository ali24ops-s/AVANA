/**
 * In-memory implementation of SearchStore for test environments.
 */

import type {
  SearchStore,
  CourseSearchItem,
  SharedContentSearchItem,
} from "./search-store.js";
import type { OrganizationId, UserId } from "@avana/domain";
import type { CourseStore } from "../courses/course-store.js";
import type { OrganizationStore } from "../organizations/organization-store.js";
import type { ContentPackStore } from "../library/library-store.js";

export class InMemorySearchStore implements SearchStore {
  constructor(
    private readonly courseStore?: CourseStore,
    private readonly organizationStore?: OrganizationStore,
    private readonly contentPackStore?: ContentPackStore,
  ) {}

  private inMemoryCourses: CourseSearchItem[] = [];
  private inMemoryMemberships: Array<{ userId: string; organizationId: string }> = [];
  private inMemorySharedContent: SharedContentSearchItem[] = [];

  setCourses(coursesList: CourseSearchItem[]) {
    this.inMemoryCourses = [...coursesList];
  }

  setMemberships(memberships: Array<{ userId: string; organizationId: string }>) {
    this.inMemoryMemberships = [...memberships];
  }

  setSharedContent(contentList: SharedContentSearchItem[]) {
    this.inMemorySharedContent = [...contentList];
  }

  async searchCourses(
    userId: UserId,
    query: string,
    systemOrganizationId?: OrganizationId,
    limit = 20,
  ): Promise<CourseSearchItem[]> {
    const trimmed = query.trim().toLowerCase();

    // 1. If courseStore and organizationStore are injected
    if (this.courseStore && this.organizationStore) {
      const userOrgs = await this.organizationStore.listByUserId(userId);
      const userOrgIds = new Set(userOrgs.map((o) => o.id));
      if (systemOrganizationId) {
        userOrgIds.add(systemOrganizationId);
      }

      const allCourses: CourseSearchItem[] = [];
      const seenCourseIds = new Set<string>();

      for (const orgId of userOrgIds) {
        const list = await this.courseStore.listByOrganization(
          orgId as OrganizationId,
          userId,
          systemOrganizationId,
        );
        for (const c of list) {
          if (!seenCourseIds.has(c.id) && c.deletedAt === null) {
            seenCourseIds.add(c.id);
            allCourses.push({
              id: c.id,
              name: c.name,
              subject: c.subject,
              organizationId: c.organizationId,
              createdAt: c.createdAt,
            });
          }
        }
      }

      return allCourses
        .filter(
          (c) =>
            c.name.toLowerCase().includes(trimmed) ||
            (c.subject && c.subject.toLowerCase().includes(trimmed)),
        )
        .slice(0, limit);
    }

    // 2. Direct in-memory lists fallback
    const userOrgIds = new Set(
      this.inMemoryMemberships
        .filter((m) => m.userId === userId)
        .map((m) => m.organizationId),
    );
    if (systemOrganizationId) {
      userOrgIds.add(systemOrganizationId);
    }

    return this.inMemoryCourses
      .filter((c) => {
        const hasOrgAccess = userOrgIds.has(c.organizationId);
        if (!hasOrgAccess) return false;
        return (
          c.name.toLowerCase().includes(trimmed) ||
          (c.subject && c.subject.toLowerCase().includes(trimmed))
        );
      })
      .slice(0, limit);
  }

  async searchSharedContent(
    query: string,
    limit = 20,
  ): Promise<SharedContentSearchItem[]> {
    const trimmed = query.trim().toLowerCase();

    if (this.contentPackStore) {
      const res = await this.contentPackStore.listPublished({
        q: trimmed,
        limit,
      });
      return res.items.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        subject: p.subject,
        publishedAt: p.publishedAt,
        usageCount: p.usageCount,
      }));
    }

    return this.inMemorySharedContent
      .filter(
        (p) =>
          p.title.toLowerCase().includes(trimmed) ||
          (p.description && p.description.toLowerCase().includes(trimmed)) ||
          (p.subject && p.subject.toLowerCase().includes(trimmed)),
      )
      .slice(0, limit);
  }
}
