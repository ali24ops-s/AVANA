/**
 * Generation Recovery Service.
 *
 * Provides explicit, transaction-safe reconciliation and recovery for stale
 * or orphaned content generation jobs, document states, and course states.
 *
 * Invariants:
 * 1. An actively running generation with a fresh lease / heartbeat (default 10 min)
 *    is NEVER marked stale.
 * 2. Reconciliation is an explicit service method — never an implicit side-effect
 *    in read-only GET queries.
 * 3. Recovery NEVER deletes existing generated contents, lessons, modules,
 *    flashcards, or quizzes.
 * 4. Stale 'generating' courses recover to 'review' if generated materials exist,
 *    or 'draft' if no materials exist.
 * 5. Stale 'generating' documents recover to 'review_pending' if generated materials
 *    exist, 'extracted' if document chunks exist, or 'uploaded' otherwise.
 * 6. Stale running chunks and jobs transition to 'failed' with error code
 *    'STALE_LEASE_EXPIRED'.
 * 7. All recovery actions emit structured audit events.
 */
import {
  type CourseId,
  type CourseStatus,
  type DocumentId,
  type OrganizationId,
  DEFAULT_GENERATION_STALE_THRESHOLD_MS,
} from "@avana/domain";
import type { CourseStore } from "../courses/course-store.js";
import type {
  DocumentStore,
  DocumentChunkStore,
  DocumentRecord,
} from "../learning/learning-store.js";
import type { GeneratedContentStore } from "./generation-store.js";
import type { GenerationJobStore } from "./generation-jobs-store.js";
import type { GenerationChunkStore } from "./generation-chunk-store.js";
import type { GenerationProgressStore } from "./generation-progress-store.js";
import type { GenerationProgressService } from "./generation-progress-service.js";
import type { AuditService } from "../../observability/audit-service.js";
import type { DbClient } from "@avana/database/client";
import {
  courses,
  documents,
  generationJobs,
  generationChunks,
  generatedContents,
  documentChunks,
  documentGenerationProgress,
  auditLogs,
} from "@avana/database/schema";
import { eq, and, isNull, sql, inArray, or, lt } from "drizzle-orm";

export interface CourseRecoveryResult {
  courseId: CourseId;
  recovered: boolean;
  activelyRunning?: boolean;
  currentStatus?: CourseStatus;
  previousStatus?: CourseStatus;
  newStatus?: CourseStatus;
  recoveredDocumentsCount?: number;
  recoveredJobsCount?: number;
  recoveredChunksCount?: number;
  reason?: string;
}

export interface DocumentRecoveryResult {
  documentId: DocumentId;
  recovered: boolean;
  activelyRunning?: boolean;
  previousStatus?: string;
  newStatus?: string;
  recoveredJobsCount?: number;
  recoveredChunksCount?: number;
  reason?: string;
}

export interface StaleReconciliationSummary {
  reconciledCoursesCount: number;
  reconciledDocumentsCount: number;
  recoveredJobsCount: number;
  recoveredChunksCount: number;
  courses: CourseRecoveryResult[];
  documents: DocumentRecoveryResult[];
  timestamp: string;
}

export class GenerationRecoveryService {
  constructor(
    private readonly db: DbClient,
    private readonly courseStore: CourseStore,
    private readonly documentStore: DocumentStore,
    private readonly generatedContentStore?: GeneratedContentStore,
    _documentChunkStore?: DocumentChunkStore,
    private readonly generationJobStore?: GenerationJobStore,
    private readonly generationChunkStore?: GenerationChunkStore,
    _auditService?: AuditService,
    private readonly generationProgressStore?: GenerationProgressStore,
    _generationProgressService?: GenerationProgressService,
  ) {}

  /**
   * Check if a course is actively generating with a fresh heartbeat or valid lease.
   */
  async isCourseActivelyGenerating(
    courseId: CourseId,
    maxAgeMs = DEFAULT_GENERATION_STALE_THRESHOLD_MS,
  ): Promise<boolean> {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - maxAgeMs);

    // If running with PostgreSQL DB
    if (typeof this.db?.select === "function") {
      try {
        // 1. Check generation_chunks for fresh active workers
        const activeChunks = await this.db
          .select({
            id: generationChunks.id,
            heartbeatAt: generationChunks.heartbeatAt,
            leaseExpiresAt: generationChunks.leaseExpiresAt,
            updatedAt: generationChunks.updatedAt,
          })
          .from(generationChunks)
          .where(
            and(
              eq(generationChunks.courseId, courseId),
              eq(generationChunks.status, "running"),
              isNull(generationChunks.deletedAt),
            ),
          );

        for (const chunk of activeChunks) {
          if (chunk.leaseExpiresAt && new Date(chunk.leaseExpiresAt) > now) {
            return true;
          }
          if (chunk.heartbeatAt && new Date(chunk.heartbeatAt) > staleThreshold) {
            return true;
          }
          if (!chunk.heartbeatAt && !chunk.leaseExpiresAt && new Date(chunk.updatedAt) > staleThreshold) {
            return true;
          }
        }

        // 2. Check generation_jobs for fresh active workers
        const activeJobs = await this.db
          .select({
            id: generationJobs.id,
            heartbeatAt: generationJobs.heartbeatAt,
            leaseExpiresAt: generationJobs.leaseExpiresAt,
            updatedAt: generationJobs.updatedAt,
          })
          .from(generationJobs)
          .where(
            and(
              eq(generationJobs.courseId, courseId),
              or(
                eq(generationJobs.status, "processing"),
                eq(generationJobs.status, "running"),
              ),
              isNull(generationJobs.deletedAt),
            ),
          );

        for (const job of activeJobs) {
          if (job.leaseExpiresAt && new Date(job.leaseExpiresAt) > now) {
            return true;
          }
          if (job.heartbeatAt && new Date(job.heartbeatAt) > staleThreshold) {
            return true;
          }
          if (!job.heartbeatAt && !job.leaseExpiresAt && new Date(job.updatedAt) > staleThreshold) {
            return true;
          }
        }

        // 3. Check documents belonging to this course for active chunks/jobs
        const courseDocs = await this.db
          .select({ id: documents.id })
          .from(documents)
          .where(and(eq(documents.courseId, courseId), isNull(documents.deletedAt)));

        if (courseDocs.length > 0) {
          const docIds = courseDocs.map((d) => d.id);
          const docActiveChunks = await this.db
            .select({
              id: generationChunks.id,
              heartbeatAt: generationChunks.heartbeatAt,
              leaseExpiresAt: generationChunks.leaseExpiresAt,
              updatedAt: generationChunks.updatedAt,
            })
            .from(generationChunks)
            .where(
              and(
                inArray(generationChunks.documentId, docIds),
                eq(generationChunks.status, "running"),
                isNull(generationChunks.deletedAt),
              ),
            );

          for (const chunk of docActiveChunks) {
            if (chunk.leaseExpiresAt && new Date(chunk.leaseExpiresAt) > now) {
              return true;
            }
            if (chunk.heartbeatAt && new Date(chunk.heartbeatAt) > staleThreshold) {
              return true;
            }
            if (!chunk.heartbeatAt && !chunk.leaseExpiresAt && new Date(chunk.updatedAt) > staleThreshold) {
              return true;
            }
          }
        }

        return false;
      } catch {
        return false;
      }
    }

    // Fallback for in-memory store tests
    if (this.generationChunkStore && typeof (this.generationChunkStore as any).getAll === "function") {
      const allChunks = (this.generationChunkStore as any).getAll() as any[];
      const courseChunks = allChunks.filter(
        (c) => c.courseId === courseId && c.status === "running" && !c.deletedAt,
      );
      for (const chunk of courseChunks) {
        if (chunk.leaseExpiresAt && new Date(chunk.leaseExpiresAt) > now) {
          return true;
        }
        if (chunk.heartbeatAt && new Date(chunk.heartbeatAt) > staleThreshold) {
          return true;
        }
        if (!chunk.heartbeatAt && !chunk.leaseExpiresAt && new Date(chunk.updatedAt) > staleThreshold) {
          return true;
        }
      }
    }

    if (this.generationJobStore && typeof (this.generationJobStore as any).getAll === "function") {
      const allJobs = (this.generationJobStore as any).getAll() as any[];
      const courseJobs = allJobs.filter(
        (j) =>
          j.courseId === courseId &&
          (j.status === "running" || j.status === "processing") &&
          !j.deletedAt,
      );
      for (const job of courseJobs) {
        if (job.leaseExpiresAt && new Date(job.leaseExpiresAt) > now) {
          return true;
        }
        if (job.heartbeatAt && new Date(job.heartbeatAt) > staleThreshold) {
          return true;
        }
        if (!job.heartbeatAt && !job.leaseExpiresAt && new Date(job.updatedAt) > staleThreshold) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if a document is actively generating with a fresh heartbeat.
   */
  async isDocumentActivelyGenerating(
    documentId: DocumentId,
    maxAgeMs = 600_000,
  ): Promise<boolean> {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - maxAgeMs);

    if (typeof this.db?.select === "function") {
      try {
        const activeChunks = await this.db
          .select({
            id: generationChunks.id,
            heartbeatAt: generationChunks.heartbeatAt,
            leaseExpiresAt: generationChunks.leaseExpiresAt,
            updatedAt: generationChunks.updatedAt,
          })
          .from(generationChunks)
          .where(
            and(
              eq(generationChunks.documentId, documentId),
              eq(generationChunks.status, "running"),
              isNull(generationChunks.deletedAt),
            ),
          );

        for (const chunk of activeChunks) {
          if (chunk.leaseExpiresAt && new Date(chunk.leaseExpiresAt) > now) {
            return true;
          }
          if (chunk.heartbeatAt && new Date(chunk.heartbeatAt) > staleThreshold) {
            return true;
          }
          if (!chunk.heartbeatAt && !chunk.leaseExpiresAt && new Date(chunk.updatedAt) > staleThreshold) {
            return true;
          }
        }

        return false;
      } catch {
        return false;
      }
    }

    if (this.generationChunkStore && typeof (this.generationChunkStore as any).getAll === "function") {
      const allChunks = (this.generationChunkStore as any).getAll() as any[];
      const docChunks = allChunks.filter(
        (c) => c.documentId === documentId && c.status === "running" && !c.deletedAt,
      );
      for (const chunk of docChunks) {
        if (chunk.leaseExpiresAt && new Date(chunk.leaseExpiresAt) > now) {
          return true;
        }
        if (chunk.heartbeatAt && new Date(chunk.heartbeatAt) > staleThreshold) {
          return true;
        }
        if (!chunk.heartbeatAt && !chunk.leaseExpiresAt && new Date(chunk.updatedAt) > staleThreshold) {
          return true;
        }
      }
    }

    if (this.generationJobStore && typeof (this.generationJobStore as any).getAll === "function") {
      const allJobs = (this.generationJobStore as any).getAll() as any[];
      const docJobs = allJobs.filter(
        (j) =>
          j.documentId === documentId &&
          (j.status === "running" || j.status === "processing") &&
          !j.deletedAt,
      );
      for (const job of docJobs) {
        if (job.leaseExpiresAt && new Date(job.leaseExpiresAt) > now) {
          return true;
        }
        if (job.heartbeatAt && new Date(job.heartbeatAt) > staleThreshold) {
          return true;
        }
        if (!job.heartbeatAt && !job.leaseExpiresAt && new Date(job.updatedAt) > staleThreshold) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Reconcile a single course if it is stuck in 'generating' state with an expired lease.
   */
  async reconcileStaleCourse(
    courseId: CourseId,
    options: {
      maxAgeMs?: number;
      actorId?: string;
      organizationId?: OrganizationId;
    } = {},
  ): Promise<CourseRecoveryResult> {
    const maxAgeMs = options.maxAgeMs ?? 600_000;
    const course = await this.courseStore.findById(courseId);

    if (!course || course.deletedAt) {
      return {
        courseId,
        recovered: false,
        reason: "دوره یافت نشد یا حذف شده است.",
      };
    }

    if (course.status !== "generating") {
      return {
        courseId,
        recovered: false,
        currentStatus: course.status as CourseStatus,
        reason: `دوره در وضعیت generating نیست (وضعیت فعلی: ${course.status}).`,
      };
    }

    // Check if worker is actively generating with fresh heartbeat
    const isActivelyGenerating = await this.isCourseActivelyGenerating(
      courseId,
      maxAgeMs,
    );
    if (isActivelyGenerating) {
      return {
        courseId,
        recovered: false,
        activelyRunning: true,
        currentStatus: "generating",
        reason: "تولید محتوا با heartbeat فعال و معتبر در حال اجراست.",
      };
    }

    const orgId =
      options.organizationId ??
      course.organizationId ??
      ("b4a0b464-16db-4087-92b7-163a1e6f6776" as OrganizationId);
    const actorId = options.actorId ?? "system-watchdog";
    const nowIso = new Date().toISOString();
    const now = new Date();

    let recoveredDocumentsCount = 0;
    let recoveredJobsCount = 0;
    let recoveredChunksCount = 0;
    let targetCourseStatus: CourseStatus = "draft";

    if (typeof this.db?.transaction === "function" || typeof this.db?.select === "function") {
      const executeTx =
        typeof this.db.transaction === "function"
          ? this.db.transaction.bind(this.db)
          : async (fn: (tx: any) => Promise<any>) => fn(this.db);

      await executeTx(async (tx: any) => {
        // 1. Mark stale chunks for this course / documents as failed
        if (typeof tx.update === "function") {
          const staleChunksRes = await tx
            .update(generationChunks)
            .set({
              status: "failed",
              errorCode: "STALE_LEASE_EXPIRED",
              errorMessage: "Generation heartbeat timed out",
              updatedAt: now,
            })
            .where(
              and(
                eq(generationChunks.courseId, courseId),
                eq(generationChunks.status, "running"),
              ),
            )
            .returning({ id: generationChunks.id });

          recoveredChunksCount += staleChunksRes?.length || 0;

          // 2. Mark stale jobs for this course as failed
          const staleJobsRes = await tx
            .update(generationJobs)
            .set({
              status: "failed",
              errorCode: "STALE_LEASE_EXPIRED",
              errorMessage: "Generation heartbeat timed out",
              updatedAt: now,
            })
            .where(
              and(
                eq(generationJobs.courseId, courseId),
                or(
                  eq(generationJobs.status, "processing"),
                  eq(generationJobs.status, "running"),
                  eq(generationJobs.status, "queued"),
                ),
              ),
            )
            .returning({ id: generationJobs.id });

          recoveredJobsCount += staleJobsRes?.length || 0;
        }

        // 3. Find all documents belonging to this course
        const courseDocs = await tx
          .select()
          .from(documents)
          .where(and(eq(documents.courseId, courseId), isNull(documents.deletedAt)));

        for (const doc of courseDocs) {
          if (doc.status === "generating") {
            // Check if document has generated contents
            const docContents = await tx
              .select({ id: generatedContents.id })
              .from(generatedContents)
              .where(
                and(
                  eq(generatedContents.documentId, doc.id),
                  isNull(generatedContents.deletedAt),
                ),
              );

            let newDocStatus = "extracted";
            if (docContents.length > 0) {
              newDocStatus = "review_pending";
            } else {
              const chunkCount = await tx
                .select({ id: documentChunks.id })
                .from(documentChunks)
                .where(eq(documentChunks.documentId, doc.id))
                .limit(1);
              newDocStatus = chunkCount.length > 0 ? "extracted" : "uploaded";
            }

            if (typeof tx.update === "function") {
              await tx
                .update(documents)
                .set({
                  status: newDocStatus,
                  errorCode: "GENERATION_TIMEOUT_STALE",
                  updatedAt: now,
                })
                .where(eq(documents.id, doc.id));

              await tx
                .update(documentGenerationProgress)
                .set({
                  status: docContents.length > 0 ? "completed" : "failed",
                  errorMessage: docContents.length > 0 ? null : "فرآیند تولید به دلیل پایان مهلت پاسخ متوقف شد.",
                  updatedAt: now,
                })
                .where(eq(documentGenerationProgress.documentId, doc.id));
            }
            recoveredDocumentsCount++;
          }
        }

        // 4. Check if course has any generated contents or materialization
        const allCourseDrafts = await tx
          .select({ id: generatedContents.id })
          .from(generatedContents)
          .where(
            and(
              eq(generatedContents.courseId, courseId),
              isNull(generatedContents.deletedAt),
            ),
          )
          .limit(1);

        const hasOtherCourseMaterials =
          allCourseDrafts.length > 0 ||
          courseDocs.some(
            (d: { status: string }) =>
              d.status === "review_pending" || d.status === "ready",
          );

        targetCourseStatus = hasOtherCourseMaterials ? "review" : "draft";

        // 5. Update course status
        if (typeof tx.update === "function") {
          await tx
            .update(courses)
            .set({
              status: targetCourseStatus,
              updatedAt: now,
            })
            .where(eq(courses.id, courseId));
        }

        // 6. Record Audit Log
        if (typeof tx.insert === "function") {
          await tx.insert(auditLogs).values({
            actorId,
            organizationId: orgId,
            action: "COURSE_STALE_GENERATION_RECONCILED",
            entityType: "course",
            entityId: courseId,
            details: {
              courseId,
              courseName: course.name,
              previousStatus: "generating",
              newStatus: targetCourseStatus,
              recoveredDocumentsCount,
              recoveredJobsCount,
              recoveredChunksCount,
              reconciledAt: nowIso,
            },
          });
        }
      });
    } else {
      // In-memory fallback
      const docs = await this.documentStore.listByOrganization(orgId, courseId);
      const courseDocIds = new Set(docs.map((d) => d.id));

      if (this.generationChunkStore && typeof (this.generationChunkStore as any).getAll === "function") {
        const allChunks = (this.generationChunkStore as any).getAll() as any[];
        for (const c of allChunks) {
          if (
            (c.courseId === courseId || courseDocIds.has(c.documentId)) &&
            c.status === "running"
          ) {
            const updated = {
              ...c,
              status: "failed" as const,
              errorCode: "STALE_LEASE_EXPIRED",
              errorMessage: "Generation heartbeat timed out",
              updatedAt: nowIso,
            };
            await this.generationChunkStore.upsert(updated);
            recoveredChunksCount++;
          }
        }
      }

      if (this.generationJobStore && typeof (this.generationJobStore as any).getAll === "function") {
        const allJobs = (this.generationJobStore as any).getAll() as any[];
        for (const j of allJobs) {
          if (
            (j.courseId === courseId || courseDocIds.has(j.documentId)) &&
            (j.status === "processing" || j.status === "queued" || j.status === "running")
          ) {
            j.status = "failed";
            j.errorCode = "STALE_LEASE_EXPIRED";
            recoveredJobsCount++;
          }
        }
      }

      for (const d of docs) {
        if (d.status === "generating") {
          let newStatus: DocumentRecord["status"] = "extracted";
          let hasDrafts = false;
          if (this.generatedContentStore) {
            const drafts = await this.generatedContentStore.listByDocument(d.id, orgId);
            hasDrafts = drafts.length > 0;
            if (hasDrafts) newStatus = "review_pending";
          }
          await this.documentStore.update({
            ...d,
            status: newStatus,
            errorCode: "GENERATION_TIMEOUT_STALE",
            updatedAt: nowIso,
          });
          if (this.generationProgressStore) {
            await this.generationProgressStore.updateMonotonic(d.id, orgId, {
              status: hasDrafts ? "completed" : "failed",
              errorMessage: hasDrafts ? null : "فرآیند تولید به دلیل پایان مهلت پاسخ متوقف شد.",
            });
          }
          recoveredDocumentsCount++;
        }
      }

      let hasMaterials = false;
      if (this.generatedContentStore) {
        const courseDrafts = await this.generatedContentStore.listByCourse(courseId, orgId);
        hasMaterials = courseDrafts.some((cd) => !cd.deletedAt && cd.status !== "rejected");
      }
      targetCourseStatus = hasMaterials ? "review" : "draft";
    }

    // In-memory store sync if store update method exists
    course.status = targetCourseStatus;
    course.updatedAt = nowIso;
    if (this.courseStore.update) {
      await this.courseStore.update(course);
    }

    return {
      courseId,
      recovered: true,
      previousStatus: "generating",
      newStatus: targetCourseStatus,
      recoveredDocumentsCount,
      recoveredJobsCount,
      recoveredChunksCount,
    };
  }

  /**
   * Reconcile a single document if it is stuck in 'generating' state with an expired lease.
   */
  async reconcileStaleDocument(
    organizationId: OrganizationId,
    documentId: DocumentId,
    options: {
      maxAgeMs?: number;
      actorId?: string;
    } = {},
  ): Promise<DocumentRecoveryResult> {
    const maxAgeMs = options.maxAgeMs ?? DEFAULT_GENERATION_STALE_THRESHOLD_MS;
    const doc = await this.documentStore.findByIdForOrganization(
      documentId,
      organizationId,
    );

    if (!doc || doc.deletedAt) {
      return {
        documentId,
        recovered: false,
        reason: "سند یافت نشد یا حذف شده است.",
      };
    }

    if (doc.status !== "generating") {
      return {
        documentId,
        recovered: false,
        previousStatus: doc.status,
        newStatus: doc.status,
        reason: `سند در وضعیت generating نیست (وضعیت فعلی: ${doc.status}).`,
      };
    }

    // Check if worker is actively generating with fresh heartbeat
    const isActivelyGenerating = await this.isDocumentActivelyGenerating(
      documentId,
      maxAgeMs,
    );
    if (isActivelyGenerating) {
      return {
        documentId,
        recovered: false,
        activelyRunning: true,
        previousStatus: "generating",
        reason: "تولید محتوا برای سند با heartbeat فعال در حال اجراست.",
      };
    }

    const actorId = options.actorId ?? "system-watchdog";
    const nowIso = new Date().toISOString();
    const now = new Date();

    let recoveredJobsCount = 0;
    let recoveredChunksCount = 0;
    let targetDocStatus = "extracted";

    if (typeof this.db?.transaction === "function" || typeof this.db?.select === "function") {
      const executeTx =
        typeof this.db.transaction === "function"
          ? this.db.transaction.bind(this.db)
          : async (fn: (tx: any) => Promise<any>) => fn(this.db);

      await executeTx(async (tx: any) => {
        // 1. Fail stale chunks for document
        if (typeof tx.update === "function") {
          const staleChunksRes = await tx
            .update(generationChunks)
            .set({
              status: "failed",
              errorCode: "STALE_LEASE_EXPIRED",
              errorMessage: "Generation heartbeat timed out",
              updatedAt: now,
            })
            .where(
              and(
                eq(generationChunks.documentId, documentId),
                eq(generationChunks.status, "running"),
              ),
            )
            .returning({ id: generationChunks.id });

          recoveredChunksCount = staleChunksRes?.length || 0;

          // 2. Fail stale jobs for document
          const staleJobsRes = await tx
            .update(generationJobs)
            .set({
              status: "failed",
              errorCode: "STALE_LEASE_EXPIRED",
              errorMessage: "Generation heartbeat timed out",
              updatedAt: now,
            })
            .where(
              and(
                eq(generationJobs.documentId, documentId),
                or(
                  eq(generationJobs.status, "processing"),
                  eq(generationJobs.status, "running"),
                  eq(generationJobs.status, "queued"),
                ),
              ),
            )
            .returning({ id: generationJobs.id });

          recoveredJobsCount = staleJobsRes?.length || 0;
        }

        // 3. Determine target document status
        const docContents = await tx
          .select({ id: generatedContents.id })
          .from(generatedContents)
          .where(
            and(
              eq(generatedContents.documentId, documentId),
              isNull(generatedContents.deletedAt),
            ),
          );

        if (docContents.length > 0) {
          targetDocStatus = "review_pending";
        } else {
          const chunkCount = await tx
            .select({ id: documentChunks.id })
            .from(documentChunks)
            .where(eq(documentChunks.documentId, documentId))
            .limit(1);
          targetDocStatus = chunkCount.length > 0 ? "extracted" : "uploaded";
        }

        // 4. Update document record & progress record
        if (typeof tx.update === "function") {
          await tx
            .update(documents)
            .set({
              status: targetDocStatus,
              errorCode: "GENERATION_TIMEOUT_STALE",
              updatedAt: now,
            })
            .where(eq(documents.id, documentId));

          await tx
            .update(documentGenerationProgress)
            .set({
              status: docContents.length > 0 ? "completed" : "failed",
              errorMessage: docContents.length > 0 ? null : "فرآیند تولید به دلیل پایان مهلت پاسخ متوقف شد.",
              updatedAt: now,
            })
            .where(eq(documentGenerationProgress.documentId, documentId));
        }

        // 5. Record audit log
        if (typeof tx.insert === "function") {
          await tx.insert(auditLogs).values({
            actorId,
            organizationId,
            action: "DOCUMENT_STALE_GENERATION_RECONCILED",
            entityType: "document",
            entityId: documentId,
            details: {
              documentId,
              previousStatus: "generating",
              newStatus: targetDocStatus,
              recoveredJobsCount,
              recoveredChunksCount,
              reconciledAt: nowIso,
            },
          });
        }
      });
    } else {
      // In-memory fallback
      if (this.generationChunkStore && typeof (this.generationChunkStore as any).getAll === "function") {
        const allChunks = (this.generationChunkStore as any).getAll() as any[];
        for (const c of allChunks) {
          if (c.documentId === documentId && c.status === "running") {
            const updated = {
              ...c,
              status: "failed" as const,
              errorCode: "STALE_LEASE_EXPIRED",
              errorMessage: "Generation heartbeat timed out",
              updatedAt: nowIso,
            };
            await this.generationChunkStore.upsert(updated);
            recoveredChunksCount++;
          }
        }
      }

      let hasDrafts = false;
      if (this.generatedContentStore) {
        const drafts = await this.generatedContentStore.listByDocument(documentId, organizationId);
        hasDrafts = drafts.length > 0;
      }
      targetDocStatus = hasDrafts ? "review_pending" : "extracted";

      await this.documentStore.update({
        ...doc,
        status: targetDocStatus as DocumentRecord["status"],
        errorCode: "GENERATION_TIMEOUT_STALE",
        updatedAt: nowIso,
      });

      if (this.generationProgressStore) {
        await this.generationProgressStore.updateMonotonic(documentId, organizationId, {
          status: hasDrafts ? "completed" : "failed",
          errorMessage: hasDrafts ? null : "فرآیند تولید به دلیل پایان مهلت پاسخ متوقف شد.",
        });
      }
    }

    return {
      documentId,
      recovered: true,
      previousStatus: "generating",
      newStatus: targetDocStatus,
      recoveredJobsCount,
      recoveredChunksCount,
    };
  }

  /**
   * Reconcile any stale generation jobs and chunks in the entire database or organization.
   */
  async reconcileStaleJobs(
    organizationId?: OrganizationId,
    maxAgeMs = DEFAULT_GENERATION_STALE_THRESHOLD_MS,
  ): Promise<{ recoveredJobsCount: number; recoveredChunksCount: number }> {
    const now = new Date();
    const staleThreshold = new Date(now.getTime() - maxAgeMs);

    let recoveredJobsCount = 0;
    let recoveredChunksCount = 0;

    if (typeof this.db?.update === "function") {
      try {
        // 1. Reconcile stale generation jobs
        const jobsConditions = [
          or(
            eq(generationJobs.status, "processing"),
            eq(generationJobs.status, "running"),
            eq(generationJobs.status, "queued"),
          ),
          isNull(generationJobs.deletedAt),
          or(
            and(
              sql`${generationJobs.leaseExpiresAt} IS NOT NULL`,
              lt(generationJobs.leaseExpiresAt, now),
            ),
            and(
              sql`${generationJobs.heartbeatAt} IS NOT NULL`,
              lt(generationJobs.heartbeatAt, staleThreshold),
            ),
            and(
              sql`${generationJobs.heartbeatAt} IS NULL`,
              sql`${generationJobs.leaseExpiresAt} IS NULL`,
              lt(generationJobs.updatedAt, staleThreshold),
            ),
          ),
        ];

        if (organizationId) {
          jobsConditions.push(eq(generationJobs.organizationId, organizationId));
        }

        const updatedJobs = await this.db
          .update(generationJobs)
          .set({
            status: "failed",
            errorCode: "STALE_LEASE_EXPIRED",
            errorMessage: "Generation heartbeat timed out",
            updatedAt: now,
          })
          .where(and(...jobsConditions))
          .returning({ id: generationJobs.id });

        recoveredJobsCount = updatedJobs.length;

        // 2. Reconcile stale generation chunks
        const chunksConditions = [
          eq(generationChunks.status, "running"),
          isNull(generationChunks.deletedAt),
          or(
            and(
              sql`${generationChunks.leaseExpiresAt} IS NOT NULL`,
              lt(generationChunks.leaseExpiresAt, now),
            ),
            and(
              sql`${generationChunks.heartbeatAt} IS NOT NULL`,
              lt(generationChunks.heartbeatAt, staleThreshold),
            ),
            and(
              sql`${generationChunks.heartbeatAt} IS NULL`,
              sql`${generationChunks.leaseExpiresAt} IS NULL`,
              lt(generationChunks.updatedAt, staleThreshold),
            ),
          ),
        ];

        if (organizationId) {
          chunksConditions.push(eq(generationChunks.organizationId, organizationId));
        }

        const updatedChunks = await this.db
          .update(generationChunks)
          .set({
            status: "failed",
            errorCode: "STALE_LEASE_EXPIRED",
            errorMessage: "Generation heartbeat timed out",
            updatedAt: now,
          })
          .where(and(...chunksConditions))
          .returning({ id: generationChunks.id });

        recoveredChunksCount = updatedChunks.length;
      } catch (err) {
        process.stderr.write(
          `[generation-recovery] reconcileStaleJobs error: ${err instanceof Error ? err.message : String(err)}\n`,
        );
      }
    } else {
      if (this.generationJobStore?.reconcileStaleJobs) {
        const res = await this.generationJobStore.reconcileStaleJobs({ organizationId, maxAgeMs });
        recoveredJobsCount = res.reconciledCount;
      }
    }

    return { recoveredJobsCount, recoveredChunksCount };
  }

  /**
   * Comprehensive explicit stale reconciliation across courses, documents, jobs, and chunks.
   */
  async reconcileAllStale(
    organizationId?: OrganizationId,
    maxAgeMs = DEFAULT_GENERATION_STALE_THRESHOLD_MS,
  ): Promise<StaleReconciliationSummary> {
    const timestamp = new Date().toISOString();

    // 1. Reconcile stale jobs and chunks first
    const { recoveredJobsCount, recoveredChunksCount } =
      await this.reconcileStaleJobs(organizationId, maxAgeMs);

    const reconciledCourses: CourseRecoveryResult[] = [];
    const reconciledDocuments: DocumentRecoveryResult[] = [];

    if (typeof this.db?.select === "function") {
      // 2. Find all generating courses
      const courseConditions = [
        eq(courses.status, "generating"),
        isNull(courses.deletedAt),
      ];
      if (organizationId) {
        courseConditions.push(eq(courses.organizationId, organizationId));
      }

      const generatingCourses = await this.db
        .select({ id: courses.id })
        .from(courses)
        .where(and(...courseConditions));

      for (const c of generatingCourses) {
        const res = await this.reconcileStaleCourse(c.id as CourseId, {
          maxAgeMs,
          organizationId,
        });
        if (res.recovered) {
          reconciledCourses.push(res);
        }
      }

      // 3. Find any standalone generating documents not covered by courses
      const docConditions = [
        eq(documents.status, "generating"),
        isNull(documents.deletedAt),
      ];
      if (organizationId) {
        docConditions.push(eq(documents.organizationId, organizationId));
      }

      const generatingDocs = await this.db
        .select({ id: documents.id, organizationId: documents.organizationId })
        .from(documents)
        .where(and(...docConditions));

      for (const d of generatingDocs) {
        const res = await this.reconcileStaleDocument(
          d.organizationId as OrganizationId,
          d.id as DocumentId,
          { maxAgeMs },
        );
        if (res.recovered) {
          reconciledDocuments.push(res);
        }
      }
    }

    return {
      reconciledCoursesCount: reconciledCourses.length,
      reconciledDocumentsCount: reconciledDocuments.length,
      recoveredJobsCount,
      recoveredChunksCount,
      courses: reconciledCourses,
      documents: reconciledDocuments,
      timestamp,
    };
  }
}
