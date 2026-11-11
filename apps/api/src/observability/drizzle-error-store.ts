/**
 * Drizzle implementation of ErrorMonitoringStore.
 */

import { eq, and, or, desc, ilike, gte, lte, sql, count } from "drizzle-orm";
import type { DbClient } from "@avana/database/client";
import {
  errorGroups,
  errorGroupUsers,
  errorEvents,
  errorAdminNotes,
  users,
} from "@avana/database/schema";
import type {
  ErrorMonitoringStore,
  RecordOccurrenceInput,
  RecordOccurrenceResult,
} from "./error-monitoring-store.js";
import type {
  ErrorGroupRecord,
  ErrorEventRecord,
  ErrorAdminNoteRecord,
  ErrorGroupStatus,
  ListErrorGroupsParams,
  ListErrorGroupsResult,
  ListErrorEventsParams,
  ListErrorEventsResult,
} from "./error-monitoring-types.js";

function toGroupRecord(row: typeof errorGroups.$inferSelect): ErrorGroupRecord {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    fingerprintVersion: row.fingerprintVersion,
    environment: row.environment,
    source: row.source as ErrorGroupRecord["source"],
    severity: row.severity as ErrorGroupRecord["severity"],
    feature: row.feature,
    errorCode: row.errorCode,
    title: row.title,
    status: row.status as ErrorGroupStatus,
    appVersion: row.appVersion,
    totalOccurrences: row.totalOccurrences,
    affectedUsersCount: row.affectedUsersCount,
    firstSeenAt: row.firstSeenAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    resolvedByUserId: row.resolvedByUserId,
  };
}

function toEventRecord(row: typeof errorEvents.$inferSelect): ErrorEventRecord {
  return {
    id: row.id,
    groupId: row.groupId,
    fingerprint: row.fingerprint,
    requestId: row.requestId,
    correlationId: row.correlationId,
    operation: row.operation,
    failureStage: row.failureStage,
    userId: row.userId,
    organizationId: row.organizationId,
    courseId: row.courseId,
    endpoint: row.endpoint,
    httpMethod: row.httpMethod,
    httpStatus: row.httpStatus,
    stackTrace: row.stackTrace,
    sanitizedContext: (row.sanitizedContext as Record<string, unknown>) ?? {},
    occurredAt: row.occurredAt.toISOString(),
  };
}

export class DrizzleErrorStore implements ErrorMonitoringStore {
  constructor(private readonly db: DbClient) {}

  async recordOccurrence(input: RecordOccurrenceInput): Promise<RecordOccurrenceResult> {
    const { group: groupData, event: eventData, userId } = input;
    const occurredAt = eventData.occurredAt;

    // Atomic upsert of error group
    const [groupRow] = await this.db
      .insert(errorGroups)
      .values({
        fingerprint: groupData.fingerprint,
        fingerprintVersion: groupData.fingerprintVersion,
        environment: groupData.environment,
        source: groupData.source,
        severity: groupData.severity,
        feature: groupData.feature,
        errorCode: groupData.errorCode ?? null,
        title: groupData.title,
        status: groupData.status ?? "unresolved",
        appVersion: groupData.appVersion ?? null,
        totalOccurrences: 1,
        affectedUsersCount: 0,
        firstSeenAt: occurredAt,
        lastSeenAt: occurredAt,
      })
      .onConflictDoUpdate({
        target: errorGroups.fingerprint,
        set: {
          totalOccurrences: sql`${errorGroups.totalOccurrences} + 1`,
          lastSeenAt: occurredAt,
          appVersion: groupData.appVersion ?? errorGroups.appVersion,
          status: sql`CASE WHEN ${errorGroups.status} = 'resolved' THEN 'unresolved' ELSE ${errorGroups.status} END`,
          resolvedAt: sql`CASE WHEN ${errorGroups.status} = 'resolved' THEN NULL ELSE ${errorGroups.resolvedAt} END`,
          resolvedByUserId: sql`CASE WHEN ${errorGroups.status} = 'resolved' THEN NULL ELSE ${errorGroups.resolvedByUserId} END`,
        },
      })
      .returning();

    // Atomic: If totalOccurrences is 1, this statement inserted a fresh group. If > 1, it was an update.
    const isNewGroup = groupRow.totalOccurrences === 1;

    // Check unique affected user
    let isNewUser = false;
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const validUserId = userId && UUID_REGEX.test(userId) ? userId : null;

    if (validUserId) {
      try {
        const insertUserResult = await this.db
          .insert(errorGroupUsers)
          .values({
            groupId: groupRow.id,
            userId: validUserId as any,
            firstSeenAt: occurredAt,
          })
          .onConflictDoNothing()
          .returning();

        if (insertUserResult.length > 0) {
          isNewUser = true;
          await this.db
            .update(errorGroups)
            .set({
              affectedUsersCount: sql`${errorGroups.affectedUsersCount} + 1`,
            })
            .where(eq(errorGroups.id, groupRow.id));
          groupRow.affectedUsersCount += 1;
        }
      } catch {
        // Suppress FK constraint error if synthetic/non-existent user
      }
    }

    // Determine sampling based on atomic database counter (10 first, then 1 in 10)
    const isSampled =
      input.shouldSampleEvent !== undefined
        ? input.shouldSampleEvent
        : groupRow.totalOccurrences <= 10 || groupRow.totalOccurrences % 10 === 0;

    // Insert sampled event if requested
    let recordedEvent: ErrorEventRecord | undefined;
    if (isSampled) {
      const safeRequestId = eventData.requestId ? eventData.requestId.slice(0, 64) : null;
      const baseValues = {
        groupId: groupRow.id,
        fingerprint: groupRow.fingerprint,
        requestId: safeRequestId,
        correlationId: eventData.correlationId ? eventData.correlationId.slice(0, 64) : null,
        operation: eventData.operation ? eventData.operation.slice(0, 80) : null,
        failureStage: eventData.failureStage ? eventData.failureStage.slice(0, 80) : null,
        organizationId: eventData.organizationId ? (eventData.organizationId as any) : null,
        courseId: eventData.courseId ? (eventData.courseId as any) : null,
        endpoint: eventData.endpoint ? eventData.endpoint.slice(0, 255) : null,
        httpMethod: eventData.httpMethod ? eventData.httpMethod.slice(0, 10) : null,
        httpStatus: eventData.httpStatus ?? null,
        stackTrace: eventData.stackTrace ?? null,
        sanitizedContext: eventData.sanitizedContext ?? {},
        occurredAt,
      };

      try {
        const [eventRow] = await this.db
          .insert(errorEvents)
          .values({
            ...baseValues,
            userId: validUserId as any,
          })
          .returning();

        if (eventRow) {
          recordedEvent = toEventRecord(eventRow);
        }
      } catch (primaryErr: any) {
        // Fallback ONLY when PostgreSQL code is 23503 and constraint is error_events.user_id FK
        const cause = primaryErr?.cause;
        const errCode = primaryErr?.code || cause?.code;
        const errConstraint = primaryErr?.constraint || cause?.constraint;
        const fullMsg = `${String(primaryErr?.message || "")} ${String(cause?.message || "")}`;
        const errDetail = String(primaryErr?.detail || cause?.detail || "");
        const errTable = primaryErr?.table || cause?.table;

        const isUserFkConstraint =
          errCode === "23503" &&
          (errConstraint === "fk_error_events_user" ||
            errConstraint === "error_events_user_id_fkey" ||
            fullMsg.includes("fk_error_events_user") ||
            fullMsg.includes("error_events_user_id_fkey") ||
            (errTable === "error_events" && errDetail.includes("(user_id)=")));

        if (isUserFkConstraint && validUserId !== null) {
          try {
            const [fallbackRow] = await this.db
              .insert(errorEvents)
              .values({
                ...baseValues,
                userId: null,
              })
              .returning();

            if (fallbackRow) {
              recordedEvent = toEventRecord(fallbackRow);
            }
          } catch {
            // Both primary and fallback attempts failed; safe fail-safe suppression
          }
        }
      }
    }

    return {
      group: toGroupRecord(groupRow),
      event: recordedEvent,
      isNewGroup,
      isNewUser,
      isSampled,
    };
  }

  async findGroupById(id: string): Promise<ErrorGroupRecord | null> {
    const rows = await this.db
      .select()
      .from(errorGroups)
      .where(eq(errorGroups.id, id as any))
      .limit(1);

    return rows.length > 0 ? toGroupRecord(rows[0]) : null;
  }

  async listGroups(params: ListErrorGroupsParams): Promise<ListErrorGroupsResult> {
    const { page, pageSize, status, severity, source, feature, search, from, to } = params;
    const safePage = Math.max(1, page ?? 1);
    const safePageSize = Math.min(100, Math.max(1, pageSize ?? 20));
    const offset = (safePage - 1) * safePageSize;

    const conditions: Array<any> = [];

    if (status) conditions.push(eq(errorGroups.status, status));
    if (severity) conditions.push(eq(errorGroups.severity, severity));
    if (source) conditions.push(eq(errorGroups.source, source));
    if (feature) conditions.push(eq(errorGroups.feature, feature));
    if (search) {
      conditions.push(
        or(
          ilike(errorGroups.title, `%${search}%`),
          ilike(errorGroups.errorCode, `%${search}%`),
          eq(errorGroups.fingerprint, search),
        ),
      );
    }
    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) {
        conditions.push(gte(errorGroups.lastSeenAt, fromDate));
      }
    }
    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) {
        conditions.push(lte(errorGroups.lastSeenAt, toDate));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await this.db
      .select({ val: count() })
      .from(errorGroups)
      .where(whereClause);

    const totalCount = Number(countResult?.val ?? 0);

    const rows = await this.db
      .select()
      .from(errorGroups)
      .where(whereClause)
      .orderBy(desc(errorGroups.lastSeenAt))
      .limit(safePageSize)
      .offset(offset);

    return {
      items: rows.map(toGroupRecord),
      totalCount,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async listEvents(params: ListErrorEventsParams): Promise<ListErrorEventsResult> {
    const { groupId, page, pageSize } = params;
    const safePage = Math.max(1, page ?? 1);
    const safePageSize = Math.min(100, Math.max(1, pageSize ?? 20));
    const offset = (safePage - 1) * safePageSize;

    const [countResult] = await this.db
      .select({ val: count() })
      .from(errorEvents)
      .where(eq(errorEvents.groupId, groupId as any));

    const totalCount = Number(countResult?.val ?? 0);

    const rows = await this.db
      .select()
      .from(errorEvents)
      .where(eq(errorEvents.groupId, groupId as any))
      .orderBy(desc(errorEvents.occurredAt))
      .limit(safePageSize)
      .offset(offset);

    return {
      items: rows.map(toEventRecord),
      totalCount,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async updateGroupStatus(
    id: string,
    status: ErrorGroupStatus,
    resolvedByUserId?: string,
  ): Promise<ErrorGroupRecord | null> {
    const isResolved = status === "resolved";
    const [row] = await this.db
      .update(errorGroups)
      .set({
        status,
        resolvedAt: isResolved ? new Date() : null,
        resolvedByUserId: isResolved && resolvedByUserId ? (resolvedByUserId as any) : null,
      })
      .where(eq(errorGroups.id, id as any))
      .returning();

    return row ? toGroupRecord(row) : null;
  }

  async addAdminNote(params: {
    groupId: string;
    adminUserId: string;
    action: string;
    note: string;
  }): Promise<ErrorAdminNoteRecord> {
    const [row] = await this.db
      .insert(errorAdminNotes)
      .values({
        groupId: params.groupId as any,
        adminUserId: params.adminUserId as any,
        action: params.action,
        note: params.note,
      })
      .returning();

    return {
      id: row.id,
      groupId: row.groupId,
      adminUserId: row.adminUserId,
      action: row.action,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listAdminNotes(groupId: string): Promise<ErrorAdminNoteRecord[]> {
    const rows = await this.db
      .select({
        id: errorAdminNotes.id,
        groupId: errorAdminNotes.groupId,
        adminUserId: errorAdminNotes.adminUserId,
        adminEmail: users.email,
        action: errorAdminNotes.action,
        note: errorAdminNotes.note,
        createdAt: errorAdminNotes.createdAt,
      })
      .from(errorAdminNotes)
      .leftJoin(users, eq(errorAdminNotes.adminUserId, users.id))
      .where(eq(errorAdminNotes.groupId, groupId as any))
      .orderBy(desc(errorAdminNotes.createdAt));

    return rows.map((r) => ({
      id: r.id,
      groupId: r.groupId,
      adminUserId: r.adminUserId,
      adminEmail: r.adminEmail ?? undefined,
      action: r.action,
      note: r.note,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async listRecentLogs(params: {
    page: number;
    pageSize: number;
    level?: string;
  }): Promise<{
    logs: Array<{
      id: string;
      timestamp: string;
      level: string;
      service: string;
      message: string;
    }>;
    totalCount: number;
  }> {
    const safePage = Math.max(1, params.page);
    const safePageSize = Math.min(100, Math.max(1, params.pageSize));
    const offset = (safePage - 1) * safePageSize;

    const conditions: Array<any> = [];
    if (params.level) {
      const requestedLevel = params.level.toLowerCase();
      conditions.push(eq(errorGroups.severity, requestedLevel));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await this.db
      .select({ val: count() })
      .from(errorEvents)
      .innerJoin(errorGroups, eq(errorEvents.groupId, errorGroups.id))
      .where(whereClause);

    const totalCount = Number(countResult?.val ?? 0);

    const rows = await this.db
      .select({
        id: errorEvents.id,
        occurredAt: errorEvents.occurredAt,
        severity: errorGroups.severity,
        source: errorGroups.source,
        feature: errorGroups.feature,
        errorCode: errorGroups.errorCode,
        title: errorGroups.title,
      })
      .from(errorEvents)
      .innerJoin(errorGroups, eq(errorEvents.groupId, errorGroups.id))
      .where(whereClause)
      .orderBy(desc(errorEvents.occurredAt))
      .limit(safePageSize)
      .offset(offset);

    const logs = rows.map((r) => {
      const level =
        r.severity === "critical"
          ? "CRITICAL"
          : r.severity === "warning"
            ? "WARNING"
            : r.severity === "info"
              ? "INFO"
              : "ERROR";

      return {
        id: r.id,
        timestamp: r.occurredAt.toISOString(),
        level,
        service: `${r.source}:${r.feature}`,
        message: `[${r.errorCode || "ERROR"}] ${r.title}`,
      };
    });

    return {
      logs,
      totalCount,
    };
  }
}
