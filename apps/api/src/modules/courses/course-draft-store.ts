import type {
  CourseId,
  CourseDraftSessionId,
  CourseDraftChangeId,
  CourseReleaseId,
  CourseDraftSessionRecord,
  CourseDraftChangeRecord,
  CourseReleaseRecord,
  DraftSessionStatus,
  DraftEntityType,
} from "@avana/domain";

export interface CourseDraftSessionStore {
  create(
    record: Omit<CourseDraftSessionRecord, "createdAt" | "updatedAt">,
  ): Promise<CourseDraftSessionRecord>;
  findById(id: CourseDraftSessionId): Promise<CourseDraftSessionRecord | undefined>;
  findActiveByCourse(courseId: CourseId): Promise<CourseDraftSessionRecord | undefined>;
  listByCourse(courseId: CourseId): Promise<CourseDraftSessionRecord[]>;
  updateStatus(id: CourseDraftSessionId, status: DraftSessionStatus): Promise<void>;
  update(record: CourseDraftSessionRecord): Promise<void>;
}

export interface CourseDraftChangeStore {
  upsert(
    record: Omit<CourseDraftChangeRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<CourseDraftChangeRecord>;
  delete(id: CourseDraftChangeId): Promise<void>;
  deleteBySessionAndEntity(
    sessionId: CourseDraftSessionId,
    entityType: DraftEntityType,
    entityId: string,
  ): Promise<void>;
  findBySessionAndEntity(
    sessionId: CourseDraftSessionId,
    entityType: DraftEntityType,
    entityId: string,
  ): Promise<CourseDraftChangeRecord | undefined>;
  listBySession(sessionId: CourseDraftSessionId): Promise<CourseDraftChangeRecord[]>;
  deleteBySession(sessionId: CourseDraftSessionId): Promise<void>;
}

export interface CourseReleaseStore {
  create(
    record: Omit<CourseReleaseRecord, "publishedAt">,
  ): Promise<CourseReleaseRecord>;
  findById(id: CourseReleaseId): Promise<CourseReleaseRecord | undefined>;
  findByCourseAndVersion(
    courseId: CourseId,
    versionNumber: number,
  ): Promise<CourseReleaseRecord | undefined>;
  listByCourse(courseId: CourseId): Promise<CourseReleaseRecord[]>;
  findLatestByCourse(courseId: CourseId): Promise<CourseReleaseRecord | undefined>;
}
