/**
 * In-memory implementations of learning stores for testing.
 *
 * Follows the PR-8/PR-9 in-memory store pattern.
 * Supports pre-loading seed data for integration tests.
 */

import type { CourseId, LessonId, ModuleId, UserId } from "@avana/domain";
import type {
  ModuleRecord,
  LessonRecord,
  LessonProgressRecord,
  ModuleStore,
  LessonStore,
  ProgressStore,
} from "../learning-store.js";

export class InMemoryModuleStore implements ModuleStore {
  private modules: Map<string, ModuleRecord> = new Map();

  async listByCourse(courseId: CourseId): Promise<ModuleRecord[]> {
    return Array.from(this.modules.values())
      .filter((m) => m.courseId === courseId)
      .map((m) => ({ ...m }));
  }

  async findById(moduleId: ModuleId): Promise<ModuleRecord | undefined> {
    const record = this.modules.get(moduleId);
    return record ? { ...record } : undefined;
  }

  /** Directly insert a module record (used for seeding). */
  insert(module: ModuleRecord): void {
    this.modules.set(module.id, { ...module });
  }

  async create(module: ModuleRecord): Promise<ModuleRecord> {
    this.modules.set(module.id, { ...module });
    return { ...module };
  }

  async update(module: ModuleRecord): Promise<ModuleRecord> {
    this.modules.set(module.id, { ...module });
    return { ...module };
  }

  async delete(moduleId: ModuleId): Promise<void> {
    const existing = this.modules.get(moduleId);
    if (existing) {
      existing.deletedAt = new Date().toISOString();
      this.modules.set(moduleId, { ...existing });
    }
  }
}

export class InMemoryLessonStore implements LessonStore {
  private lessons: Map<string, LessonRecord> = new Map();

  async listByModule(moduleId: ModuleId): Promise<LessonRecord[]> {
    return Array.from(this.lessons.values())
      .filter((l) => l.moduleId === moduleId)
      .map((l) => ({ ...l }));
  }

  async listByModules(moduleIds: ModuleId[]): Promise<LessonRecord[]> {
    const moduleIdSet = new Set(moduleIds);
    return Array.from(this.lessons.values())
      .filter((l) => moduleIdSet.has(l.moduleId))
      .map((l) => ({ ...l }));
  }

  async findById(lessonId: LessonId): Promise<LessonRecord | undefined> {
    const record = this.lessons.get(lessonId);
    return record ? { ...record } : undefined;
  }

  /** Directly insert a lesson record (used for seeding). */
  insert(lesson: LessonRecord): void {
    this.lessons.set(lesson.id, { ...lesson });
  }

  /** Get all stored lessons (for test assertions). */
  getAll(): LessonRecord[] {
    return Array.from(this.lessons.values()).map((l) => ({ ...l }));
  }

  async create(lesson: LessonRecord): Promise<LessonRecord> {
    this.lessons.set(lesson.id, { ...lesson });
    return { ...lesson };
  }

  async update(lesson: LessonRecord): Promise<LessonRecord> {
    this.lessons.set(lesson.id, { ...lesson });
    return { ...lesson };
  }

  async delete(lessonId: LessonId): Promise<void> {
    const existing = this.lessons.get(lessonId);
    if (existing) {
      existing.deletedAt = new Date().toISOString();
      this.lessons.set(lessonId, { ...existing });
    }
  }
}

export class InMemoryProgressStore implements ProgressStore {
  private progressRecords: Map<string, LessonProgressRecord> = new Map();

  async listByUserAndCourse(
    userId: UserId,
    _courseId: CourseId,
  ): Promise<LessonProgressRecord[]> {
    // Note: courseId is used for scoping. Since progress records
    // don't directly reference courseId, we'd need a join in a real
    // DB. For in-memory, we assume the caller passes the right course.
    return Array.from(this.progressRecords.values())
      .filter((p) => p.userId === userId)
      .map((p) => ({ ...p }));
  }

  async findByUserAndLesson(
    userId: UserId,
    lessonId: LessonId,
  ): Promise<LessonProgressRecord | undefined> {
    for (const p of this.progressRecords.values()) {
      if (p.userId === userId && p.lessonId === lessonId) {
        return { ...p };
      }
    }
    return undefined;
  }

  /** Directly insert a progress record (used for seeding). */
  insert(record: LessonProgressRecord): void {
    this.progressRecords.set(record.id, { ...record });
  }

  /** Upsert a progress record. Creates or updates by user+lesson pair. */
  async upsert(record: LessonProgressRecord): Promise<LessonProgressRecord> {
    // Check if a record already exists for this user+lesson pair
    for (const [, existing] of this.progressRecords) {
      if (
        existing.userId === record.userId &&
        existing.lessonId === record.lessonId
      ) {
        const updated = {
          ...existing,
          completed: record.completed,
          completedAt: record.completedAt,
          updatedAt: record.updatedAt,
        };
        this.progressRecords.set(existing.id, { ...updated });
        return { ...updated };
      }
    }
    // No existing record — insert new
    this.progressRecords.set(record.id, { ...record });
    return { ...record };
  }

  /** Clear all progress records (for test isolation). */
  clear(): void {
    this.progressRecords.clear();
  }
}
