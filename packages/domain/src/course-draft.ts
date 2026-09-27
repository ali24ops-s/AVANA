import type {
  CourseId,
  UserId,
  CourseDraftSessionId,
  CourseDraftChangeId,
  CourseReleaseId,
} from "./ids.js";

export type DraftSessionStatus =
  | "draft"
  | "validating"
  | "ready"
  | "publishing"
  | "published"
  | "discarded"
  | "failed";

export type DraftSessionSource =
  | "manual"
  | "ai_regeneration"
  | "content_repair";

export type DraftEntityType =
  | "module"
  | "lesson"
  | "flashcard"
  | "quiz"
  | "quiz_question"
  | "sub_course_group"
  | "course_metadata";

export type DraftAction = "create" | "update" | "delete" | "reorder";

export type IdentityOperation =
  | "created"
  | "updated"
  | "soft_deleted"
  | "restored";

export interface DraftChangePayload<
  TBefore = Record<string, unknown>,
  TAfter = Record<string, unknown>,
> {
  before: TBefore | null;
  after: TAfter | null;
  patch?: Record<string, unknown>;
  needsReview?: boolean;
  reviewReason?: string | null;
}

export interface ReleaseManifestEntry {
  entityType: DraftEntityType;
  entityId: string;
  action: DraftAction;
  identityOperation: IdentityOperation;
  parentId: string | null;
  sortOrderBefore: number | null;
  sortOrderAfter: number | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

export type ReleaseManifest = ReleaseManifestEntry[];

export interface CourseDraftSessionRecord {
  id: CourseDraftSessionId;
  courseId: CourseId;
  baseCourseVersion: number;
  source: DraftSessionSource;
  status: DraftSessionStatus;
  title: string | null;
  createdBy: UserId | null;
  createdAt: string;
  updatedAt: string;
}

export interface CourseDraftChangeRecord {
  id: CourseDraftChangeId;
  draftSessionId: CourseDraftSessionId;
  courseId: CourseId;
  entityType: DraftEntityType;
  entityId: string;
  action: DraftAction;
  parentId: string | null;
  sortOrder: number | null;
  payload: DraftChangePayload;
  createdAt: string;
  updatedAt: string;
}

export interface CourseReleaseRecord {
  id: CourseReleaseId;
  courseId: CourseId;
  versionNumber: number;
  baseVersion: number;
  draftSessionId: CourseDraftSessionId | null;
  changesSummary: {
    modulesCreated?: number;
    modulesUpdated?: number;
    modulesDeleted?: number;
    lessonsCreated?: number;
    lessonsUpdated?: number;
    lessonsDeleted?: number;
    flashcardsCreated?: number;
    flashcardsUpdated?: number;
    flashcardsDeleted?: number;
    quizzesCreated?: number;
    quizzesUpdated?: number;
    quizzesDeleted?: number;
    questionsCreated?: number;
    questionsUpdated?: number;
    questionsDeleted?: number;
    totalOperations: number;
  };
  manifest: ReleaseManifest;
  publishedBy: UserId;
  publishedAt: string;
}

export interface DraftSessionValidationReport {
  valid: boolean;
  errors: string[];
  warnings: string[];
  changesCount: number;
  unresolvedCount: number;
  hasParentChildConflict?: boolean;
}

export interface CourseHierarchyPreviewLesson {
  id: string;
  moduleId: string;
  title: string;
  publicationStatus: string;
  flashcardCount: number;
  quizCount: number;
  hasContent: boolean;
  createdAt: string;
  draftAction?: DraftAction | null;
}

export interface CourseHierarchyPreviewModule {
  id: string;
  title: string;
  sortOrder: number;
  subCourseGroupId?: string | null;
  draftAction?: DraftAction | null;
  lessons: CourseHierarchyPreviewLesson[];
}

export interface AdminCourseHierarchyPreview {
  id: string;
  name: string;
  subject: string | null;
  version: number;
  isDraftPreview: boolean;
  draftSessionId?: string | null;
  draftStatus?: DraftSessionStatus | null;
  pendingChangesCount: number;
  groups?: Array<{ id: string; title: string; sortOrder: number }>;
  modules: CourseHierarchyPreviewModule[];
  courseFlashcardCount?: number;
  courseQuizCount?: number;
}

export interface IncomingDraftChange {
  entityType: DraftEntityType;
  entityId: string;
  action: DraftAction;
  parentId?: string | null;
  sortOrder?: number | null;
  payload: DraftChangePayload;
}

export type DraftChangeMergeDecision =
  | {
      type: "upsert";
      action: DraftAction;
      parentId: string | null;
      sortOrder: number | null;
      payload: DraftChangePayload;
    }
  | {
      type: "delete"; // delete from course_draft_changes
    };

/**
 * Pure state machine transition function for merging intended changes.
 *
 * Rules:
 * 1. create -> update: stays 'create', merges `after`, keeps `before = null`.
 * 2. create -> delete: row is removed entirely from draft (never existed live).
 * 3. update -> update: stays 'update', preserves original `before`, replaces `after`.
 * 4. update -> revert: if `after` matches original live state, change is discarded.
 * 5. update -> delete: action becomes 'delete', preserves `before`, `after = null`.
 * 6. delete -> restore: draft deletion removed (restores live existence).
 * 7. reorder + update: merged into a single intended state update.
 */
export function mergeDraftChange(
  existingChange: CourseDraftChangeRecord | null,
  incoming: IncomingDraftChange,
  liveState: Record<string, unknown> | null,
): DraftChangeMergeDecision {
  if (!existingChange) {
    // No prior change in this session
    if (incoming.action === "delete" && !liveState) {
      // Trying to delete something that does not exist in live or draft
      return { type: "delete" };
    }

    return {
      type: "upsert",
      action: incoming.action,
      parentId: incoming.parentId ?? null,
      sortOrder: incoming.sortOrder ?? null,
      payload: {
        before: liveState ?? incoming.payload.before ?? null,
        after: incoming.payload.after ?? null,
        patch: incoming.payload.patch,
        needsReview: incoming.payload.needsReview,
        reviewReason: incoming.payload.reviewReason,
      },
    };
  }

  // 1. Existing was 'create'
  if (existingChange.action === "create") {
    if (incoming.action === "delete") {
      // create -> delete: Remove row entirely from draft
      return { type: "delete" };
    }

    // create -> update or reorder: stays 'create', update `after`
    return {
      type: "upsert",
      action: "create",
      parentId: incoming.parentId !== undefined ? incoming.parentId : existingChange.parentId,
      sortOrder: incoming.sortOrder !== undefined ? incoming.sortOrder : existingChange.sortOrder,
      payload: {
        before: null,
        after: incoming.payload.after ?? existingChange.payload.after,
        patch: incoming.payload.patch ?? existingChange.payload.patch,
        needsReview: incoming.payload.needsReview ?? existingChange.payload.needsReview,
        reviewReason: incoming.payload.reviewReason ?? existingChange.payload.reviewReason,
      },
    };
  }

  // 2. Existing was 'update' or 'reorder'
  if (existingChange.action === "update" || existingChange.action === "reorder") {
    if (incoming.action === "delete") {
      // update -> delete: action becomes 'delete', preserves original before
      return {
        type: "upsert",
        action: "delete",
        parentId: existingChange.parentId,
        sortOrder: existingChange.sortOrder,
        payload: {
          before: existingChange.payload.before,
          after: null,
        },
      };
    }

    // Check if new after matches original live state (revert)
    const originalBefore = existingChange.payload.before;
    const newAfter = incoming.payload.after;
    const incomingSortOrder = incoming.sortOrder !== undefined ? incoming.sortOrder : existingChange.sortOrder;
    const liveSortOrder = (liveState as { sortOrder?: number } | null)?.sortOrder ?? existingChange.sortOrder;
    if (
      originalBefore &&
      newAfter &&
      JSON.stringify(originalBefore) === JSON.stringify(newAfter) &&
      incomingSortOrder === liveSortOrder
    ) {
      // update -> revert: Change is no longer different from live
      return { type: "delete" };
    }

    // update -> update / reorder: Merge sortOrder and content
    return {
      type: "upsert",
      action: "update",
      parentId: incoming.parentId !== undefined ? incoming.parentId : existingChange.parentId,
      sortOrder: incoming.sortOrder !== undefined ? incoming.sortOrder : existingChange.sortOrder,
      payload: {
        before: existingChange.payload.before, // preserve initial before!
        after: incoming.payload.after !== undefined ? incoming.payload.after : existingChange.payload.after,
        patch: incoming.payload.patch ?? existingChange.payload.patch,
        needsReview: incoming.payload.needsReview ?? existingChange.payload.needsReview,
        reviewReason: incoming.payload.reviewReason ?? existingChange.payload.reviewReason,
      },
    };
  }

  // 3. Existing was 'delete'
  if (existingChange.action === "delete") {
    if (incoming.action === "update" || (incoming.action as string) === "restore") {
      // delete -> restore: revert back to live state or apply update
      if (!incoming.payload.after || JSON.stringify(incoming.payload.after) === JSON.stringify(existingChange.payload.before)) {
        return { type: "delete" }; // restores live state!
      }

      return {
        type: "upsert",
        action: "update",
        parentId: incoming.parentId ?? existingChange.parentId,
        sortOrder: incoming.sortOrder ?? existingChange.sortOrder,
        payload: {
          before: existingChange.payload.before,
          after: incoming.payload.after,
          patch: incoming.payload.patch,
        },
      };
    }
  }

  // Fallback default
  return {
    type: "upsert",
    action: incoming.action,
    parentId: incoming.parentId ?? existingChange.parentId,
    sortOrder: incoming.sortOrder ?? existingChange.sortOrder,
    payload: {
      before: existingChange.payload.before,
      after: incoming.payload.after,
      patch: incoming.payload.patch,
    },
  };
}
