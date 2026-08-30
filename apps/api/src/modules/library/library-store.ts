/**
 * Storage abstractions for the Library & Content Pack domain.
 *
 * Follows the standard AVANA store pattern: pure TypeScript interfaces
 * decoupled from database or HTTP details, implemented by both Drizzle and
 * in-memory stores.
 */

import type {
  ContentPackId,
  ContentPackItemRecord,
  ContentPackRecord,
  ContentPackUsageRecord,
  CourseId,
  DocumentId,
  ModuleId,
  OrganizationId,
  UserId,
} from "@avana/domain";

export type ListPublishedPacksOptions = {
  q?: string;
  subject?: string;
  sort?: "popular" | "newest";
  page?: number;
  limit?: number;
};

export type ListPublishedPacksResult = {
  items: ContentPackRecord[];
  totalCount: number;
};

export type MaterializeToCourseInput = {
  pack: ContentPackRecord;
  items: ContentPackItemRecord[];
  userId: UserId;
  organizationId: OrganizationId;
  targetCourseId: CourseId;
};

export type MaterializationResult = {
  alreadyInstalled: boolean;
  moduleId: ModuleId;
  moduleTitle: string;
  lessonsCreated: number;
  flashcardsCreated: number;
  quizzesCreated: number;
  quizQuestionsCreated: number;
  reviewSummaryCreated: boolean;
};

export interface ContentPackStore {
  /**
   * Atomically creates a content pack and its 4 snapshot items in a single transaction.
   */
  create(
    pack: ContentPackRecord,
    items: ContentPackItemRecord[],
  ): Promise<ContentPackRecord>;

  /**
   * Find a content pack by its ID.
   */
  findById(id: ContentPackId): Promise<ContentPackRecord | undefined>;

  /**
   * Find an active published content pack by its source document ID.
   */
  findActiveByDocument(
    documentId: DocumentId,
    organizationId?: OrganizationId,
  ): Promise<ContentPackRecord | undefined>;

  /**
   * List published content packs with optional keyword search, subject filtering,
   * sorting, and pagination.
   */
  listPublished(
    options: ListPublishedPacksOptions,
  ): Promise<ListPublishedPacksResult>;

  /**
   * Find all 4 snapshot items belonging to a content pack.
   */
  findItemsByPackId(packId: ContentPackId): Promise<ContentPackItemRecord[]>;

  /**
   * Retrieve minimal sanitized public creator information (id and name only).
   */
  getCreatorPublicInfo(
    userId: UserId | null,
  ): Promise<{ id: string; name: string } | undefined>;

  /**
   * Find existing usage for a user in a target course.
   */
  findUsage(
    packId: ContentPackId,
    userId: UserId,
    targetCourseId: CourseId,
  ): Promise<ContentPackUsageRecord | undefined>;

  /**
   * Materialize all 4 snapshot contents into a target user course atomically in a single DB transaction.
   */
  materializeToCourse(
    input: MaterializeToCourseInput,
  ): Promise<MaterializationResult>;
}

export interface ContentPackUsageStore {
  /**
   * Records an installation/usage of a content pack by a user in a target course.
   */
  recordUsage(usage: ContentPackUsageRecord): Promise<void>;

  /**
   * Checks whether a user has already installed/added this content pack in any course.
   */
  hasUserAdded(
    contentPackId: ContentPackId,
    userId: UserId,
  ): Promise<boolean>;

  /**
   * Checks whether a user has already installed/added this content pack in a specific course.
   */
  findUsage(
    contentPackId: ContentPackId,
    userId: UserId,
    targetCourseId: CourseId,
  ): Promise<ContentPackUsageRecord | undefined>;

  /**
   * Get the number of unique users who have installed this pack.
   */
  getUniqueUserCount(contentPackId: ContentPackId): Promise<number>;
}

