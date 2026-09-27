/**
 * Content Repair Audit Service (AVANA Admin Content Repair Audit).
 *
 * Provides strictly read-only, non-mutating corruption scanning and aggregation
 * across lessons stored in the database.
 */

import {
  ContentRepairEngine,
  type AuditLessonInput,
  type ContentCorruptionAuditReport,
} from "@avana/domain";
import type { AdminStore } from "./admin-store.js";
import type { LessonStore } from "../learning/learning-store.js";

export interface ContentRepairAuditServiceDeps {
  adminStore: AdminStore;
  lessonStore?: LessonStore;
}

export interface ContentRepairAuditOptions {
  batchSize?: number;
  maxLessons?: number;
  search?: string;
}

export class ContentRepairAuditService {
  constructor(private readonly deps: ContentRepairAuditServiceDeps) {}

  /**
   * Performs a comprehensive, read-only corruption audit across lessons in storage.
   * Strictly non-mutating: zero updates, inserts, deletes, AI calls, or repairs.
   */
  async runAudit(options?: ContentRepairAuditOptions): Promise<ContentCorruptionAuditReport> {
    const batchSize = Math.max(1, Math.min(options?.batchSize ?? 50, 100));
    const maxLessons = options?.maxLessons ?? 5000;

    const collectedLessons: AuditLessonInput[] = [];

    // Mode A: If lessonStore with getAll is available (e.g. testing / in-memory), read directly
    if (this.deps.lessonStore && typeof (this.deps.lessonStore as any).getAll === "function") {
      const allLessons = (this.deps.lessonStore as any).getAll() as any[];
      for (const l of allLessons) {
        if (collectedLessons.length >= maxLessons) break;
        collectedLessons.push({
          id: l.id,
          title: l.title,
          courseId: l.moduleId,
          contentMarkdown: l.contentMarkdown || "",
        });
      }
    } else {
      // Mode B: Paginated batch traversal from adminStore
      let page = 1;
      let hasMore = true;

      while (hasMore && collectedLessons.length < maxLessons) {
        const result = await this.deps.adminStore.listLessons({
          page,
          pageSize: batchSize,
          search: options?.search,
        });

        if (!result.lessons || result.lessons.length === 0) {
          break;
        }

        for (const meta of result.lessons) {
          if (collectedLessons.length >= maxLessons) break;

          if (typeof this.deps.adminStore.getLesson === "function") {
            const fullLesson = await this.deps.adminStore.getLesson(meta.id);
            if (fullLesson) {
              collectedLessons.push({
                id: fullLesson.id,
                title: fullLesson.title,
                courseId: fullLesson.moduleId,
                contentMarkdown: fullLesson.contentMarkdown || "",
              });
            }
          }
        }

        if (page * batchSize >= result.totalCount || result.lessons.length < batchSize) {
          hasMore = false;
        } else {
          page++;
        }
      }
    }

    // Execute purely deterministic detection and aggregation
    return ContentRepairEngine.audit(collectedLessons);
  }
}
