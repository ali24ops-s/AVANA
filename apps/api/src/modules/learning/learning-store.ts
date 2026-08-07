/**
 * Learning store abstractions.
 *
 * Decouples module, lesson, and progress data access from the database.
 * Follows the PR-8/PR-9 store pattern (CourseStore, OrganizationStore).
 *
 * Stores are read-only for learning consumption. No CRUD here —
 * module/lesson CRUD will be introduced with admin/content management.
 */

import type { CourseId, LessonId, ModuleId, UserId } from "@avana/domain";

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export type ModuleRecord = {
  id: ModuleId;
  courseId: CourseId;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type LessonRecord = {
  id: LessonId;
  moduleId: ModuleId;
  title: string;
  contentType: string;
  contentMarkdown: string;
  sortOrder: number;
  estimatedMinutes: number | null;
  publicationStatus: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type LessonProgressRecord = {
  id: string;
  userId: UserId;
  lessonId: LessonId;
  completed: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Store interfaces
// ---------------------------------------------------------------------------

export interface ModuleStore {
  /** List all active (non-deleted) modules for a course, ordered by sort_order. */
  listByCourse(courseId: CourseId): Promise<ModuleRecord[]>;

  /** Find a module by ID. */
  findById(moduleId: ModuleId): Promise<ModuleRecord | undefined>;

  /** Insert a new module record. */
  create(module: ModuleRecord): Promise<ModuleRecord>;

  /** Update an existing module record completely. */
  update(module: ModuleRecord): Promise<ModuleRecord>;

  /** Soft-delete (archive) a module. */
  delete(moduleId: ModuleId): Promise<void>;
}

export interface LessonStore {
  /** List all active (non-deleted) lessons for a module, ordered by sort_order. */
  listByModule(moduleId: ModuleId): Promise<LessonRecord[]>;

  /** Batch load lessons for multiple modules. */
  listByModules(moduleIds: ModuleId[]): Promise<LessonRecord[]>;

  /** Find a lesson by ID. */
  findById(lessonId: LessonId): Promise<LessonRecord | undefined>;

  /** Insert a new lesson record. */
  create(lesson: LessonRecord): Promise<LessonRecord>;

  /** Update an existing lesson record completely. */
  update(lesson: LessonRecord): Promise<LessonRecord>;

  /** Soft-delete a lesson. */
  delete(lessonId: LessonId): Promise<void>;
}

export interface ProgressStore {
  /** Get all lesson progress records for a user within a course. */
  listByUserAndCourse(
    userId: UserId,
    courseId: CourseId,
  ): Promise<LessonProgressRecord[]>;

  /** Get progress for a specific lesson for a user. */
  findByUserAndLesson(
    userId: UserId,
    lessonId: LessonId,
  ): Promise<LessonProgressRecord | undefined>;

  /**
   * Upsert a lesson progress record.
   * Creates a new record if one doesn't exist for the user+lesson pair,
   * otherwise updates the existing record.
   */
  upsert(record: LessonProgressRecord): Promise<LessonProgressRecord>;
}
