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
import type { ModuleStore, LessonStore } from "../learning/learning-store.js";

export class InMemorySearchStore implements SearchStore {
  constructor(
    private readonly courseStore?: CourseStore,
    private readonly organizationStore?: OrganizationStore,
    private readonly contentPackStore?: ContentPackStore,
    private readonly moduleStore?: ModuleStore,
    private readonly lessonStore?: LessonStore,
    private readonly systemOrganizationId?: OrganizationId,
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

  setEducationalPacks(contentList: SharedContentSearchItem[]) {
    this.setSharedContent(contentList);
  }

  async searchCourses(
    userId: UserId,
    query: string,
    systemOrganizationId?: OrganizationId,
    limit = 20,
  ): Promise<CourseSearchItem[]> {
    const trimmed = query.trim().toLowerCase();

    // 1. If courseStore is injected
    if (this.courseStore) {
      let candidateCourses: any[] = [];
      if (typeof (this.courseStore as any).getAll === "function") {
        candidateCourses = (this.courseStore as any).getAll();
      } else if (this.organizationStore) {
        const userOrgs = await this.organizationStore.listByUserId(userId);
        const userOrgIds = new Set(userOrgs.map((o) => o.id));
        if (systemOrganizationId) {
          userOrgIds.add(systemOrganizationId);
        }
        for (const orgId of userOrgIds) {
          const list = await this.courseStore.listByOrganization(
            orgId as OrganizationId,
            userId,
            systemOrganizationId,
          );
          candidateCourses.push(...list);
        }
      }

      const sysOrg = systemOrganizationId || this.systemOrganizationId || "00000000-0000-0000-0000-000000000001";
      const userOrgIds = this.organizationStore
        ? new Set((await this.organizationStore.listByUserId(userId)).map((o) => o.id))
        : new Set<string>();

      const allCourses: CourseSearchItem[] = [];
      const seenCourseIds = new Set<string>();

      for (const c of candidateCourses) {
        if (!c || seenCourseIds.has(c.id) || c.deletedAt !== null) {
          continue;
        }
        const isPublished = c.status === "published" || !c.status;
        if (!isPublished) {
          continue;
        }
        const hasAccess =
          userOrgIds.has(c.organizationId) ||
          c.isOfficial === true ||
          c.organizationId === sysOrg;

        if (hasAccess) {
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

      return allCourses
        .filter(
          (c) =>
            c.name.toLowerCase().includes(trimmed) ||
            (c.subject && c.subject.toLowerCase().includes(trimmed)),
        )
        .slice(0, limit);
    }

    // 2. Direct in-memory lists fallback
    const sysOrg = systemOrganizationId || this.systemOrganizationId || "00000000-0000-0000-0000-000000000001";
    const userOrgIds = new Set(
      this.inMemoryMemberships
        .filter((m) => m.userId === userId)
        .map((m) => m.organizationId),
    );
    if (systemOrganizationId) {
      userOrgIds.add(systemOrganizationId);
    }

    return this.inMemoryCourses
      .filter((c: any) => {
        const hasOrgAccess = userOrgIds.has(c.organizationId) || c.isOfficial === true || c.organizationId === sysOrg;
        if (!hasOrgAccess) return false;
        if (c.deletedAt !== null && c.deletedAt !== undefined) return false;
        if (c.status && c.status !== "published") return false;
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
    systemOrganizationId?: OrganizationId,
  ): Promise<SharedContentSearchItem[]> {
    const trimmed = query.trim().toLowerCase();
    const seenIds = new Set<string>();
    const results: SharedContentSearchItem[] = [];

    // 1. Standalone Content Packs
    if (this.contentPackStore) {
      const res = await this.contentPackStore.listPublished({
        q: trimmed,
        limit,
      });
      for (const p of res.items) {
        if (!seenIds.has(p.id)) {
          seenIds.add(p.id);
          results.push({
            id: p.id,
            title: p.title,
            description: p.description,
            subject: p.subject,
            publishedAt: p.publishedAt,
            usageCount: p.usageCount,
          });
        }
      }
    }

    // 2. Course Chapter Packages from moduleStore
    if (this.moduleStore && this.courseStore) {
      const allModules = typeof (this.moduleStore as any).getAllModulesInternal === "function"
        ? (this.moduleStore as any).getAllModulesInternal().filter((m: any) => m.deletedAt === null)
        : typeof (this.moduleStore as any).getAll === "function"
          ? (this.moduleStore as any).getAll().filter((m: any) => m.deletedAt === null)
          : [];
      const allCourses = typeof (this.courseStore as any).getAll === "function"
        ? (this.courseStore as any).getAll().filter((c: any) => c.deletedAt === null)
        : [];
      const courseMap = new Map(allCourses.map((c: any) => [c.id, c]));

      for (const m of allModules) {
        const c: any = courseMap.get(m.courseId);
        const sysOrg = systemOrganizationId || this.systemOrganizationId || "00000000-0000-0000-0000-000000000001";
        const isCourseVisible =
          c &&
          c.deletedAt === null &&
          (c.status === "published" || !c.status) &&
          (c.isOfficial === true || c.organizationId === sysOrg);
        if (!c || !isCourseVisible || seenIds.has(m.id)) {
          continue;
        }

        // Check if module has published lessons or published pack attached
        let hasPublishedContent = false;
        let modLessons: any[] = [];

        if (this.lessonStore && typeof (this.lessonStore as any).getAll === "function") {
          modLessons = (this.lessonStore as any).getAll().filter(
            (l: any) => l.moduleId === m.id && l.deletedAt === null && l.publicationStatus === "published",
          );
          if (modLessons.length > 0) {
            hasPublishedContent = true;
          }
        } else if (!this.lessonStore) {
          hasPublishedContent = true;
        }

        if (m.documentId && this.contentPackStore) {
          if (typeof (this.contentPackStore as any).getById === "function") {
            const pack = (this.contentPackStore as any).getById(m.documentId);
            if (pack && pack.status === "published" && pack.deletedAt === null) {
              hasPublishedContent = true;
            }
          }
        }

        if (!hasPublishedContent) {
          continue;
        }

        const matches =
          m.title.toLowerCase().includes(trimmed) ||
          (m.description && m.description.toLowerCase().includes(trimmed)) ||
          (c.subject && c.subject.toLowerCase().includes(trimmed)) ||
          modLessons.some((l: any) => l.title.toLowerCase().includes(trimmed));

        if (matches) {
          seenIds.add(m.id);
          results.push({
            id: m.id,
            title: m.title,
            description: m.description,
            subject: c.subject,
            publishedAt: m.createdAt,
            usageCount: 0,
          });
        }
      }
    }

    if (results.length > 0) {
      return results.slice(0, limit);
    }

    // 3. Fallback direct inMemorySharedContent
    return this.inMemorySharedContent
      .filter(
        (p) =>
          p.title.toLowerCase().includes(trimmed) ||
          (p.description && p.description.toLowerCase().includes(trimmed)) ||
          (p.subject && p.subject.toLowerCase().includes(trimmed)),
      )
      .slice(0, limit);
  }

  async searchEducationalPacks(
    query: string,
    limit = 20,
    systemOrganizationId?: OrganizationId,
  ): Promise<SharedContentSearchItem[]> {
    return this.searchSharedContent(query, limit, systemOrganizationId);
  }
}
