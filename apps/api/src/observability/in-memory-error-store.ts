/**
 * In-memory implementation of ErrorMonitoringStore for tests and development.
 */

import { randomUUID } from "node:crypto";
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

export class InMemoryErrorStore implements ErrorMonitoringStore {
  public readonly groups = new Map<string, ErrorGroupRecord>();
  public readonly groupUsers = new Set<string>(); // key: `${groupId}:${userId}`
  public readonly events = new Map<string, ErrorEventRecord>();
  public readonly adminNotes = new Map<string, ErrorAdminNoteRecord[]>();

  async recordOccurrence(input: RecordOccurrenceInput): Promise<RecordOccurrenceResult> {
    const { group: groupData, event: eventData, shouldSampleEvent, userId } = input;
    const nowIso = eventData.occurredAt.toISOString();

    let existingGroup = Array.from(this.groups.values()).find(
      (g) => g.fingerprint === groupData.fingerprint,
    );

    let isNewGroup = false;
    let isNewUser = false;

    if (!existingGroup) {
      isNewGroup = true;
      const newGroup: ErrorGroupRecord = {
        id: randomUUID(),
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
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        resolvedAt: null,
        resolvedByUserId: null,
      };
      this.groups.set(newGroup.id, newGroup);
      existingGroup = newGroup;
    } else {
      // Atomic increment
      existingGroup.totalOccurrences += 1;
      existingGroup.lastSeenAt = nowIso;
      if (groupData.appVersion) {
        existingGroup.appVersion = groupData.appVersion;
      }
      // If group was resolved, receiving new occurrence reopens it
      if (existingGroup.status === "resolved") {
        existingGroup.status = "unresolved";
        existingGroup.resolvedAt = null;
        existingGroup.resolvedByUserId = null;
      }
    }

    // Check unique affected user
    if (userId && typeof userId === "string" && userId.trim().length > 0) {
      const userKey = `${existingGroup.id}:${userId}`;
      if (!this.groupUsers.has(userKey)) {
        this.groupUsers.add(userKey);
        existingGroup.affectedUsersCount += 1;
        isNewUser = true;
      }
    }

    // Determine sampling: first 10 occurrences always sampled, then 1 in 10
    const isSampled =
      shouldSampleEvent !== undefined
        ? shouldSampleEvent
        : existingGroup.totalOccurrences <= 10 || existingGroup.totalOccurrences % 10 === 0;

    // Persist event if sampled
    let recordedEvent: ErrorEventRecord | undefined;
    if (isSampled) {
      recordedEvent = {
        id: randomUUID(),
        groupId: existingGroup.id,
        fingerprint: existingGroup.fingerprint,
        requestId: eventData.requestId ?? null,
        correlationId: eventData.correlationId ?? null,
        operation: eventData.operation ?? null,
        failureStage: eventData.failureStage ?? null,
        userId: eventData.userId ?? null,
        organizationId: eventData.organizationId ?? null,
        courseId: eventData.courseId ?? null,
        endpoint: eventData.endpoint ?? null,
        httpMethod: eventData.httpMethod ?? null,
        httpStatus: eventData.httpStatus ?? null,
        stackTrace: eventData.stackTrace ?? null,
        sanitizedContext: eventData.sanitizedContext,
        occurredAt: nowIso,
      };
      this.events.set(recordedEvent.id, recordedEvent);
    }

    return {
      group: { ...existingGroup },
      event: recordedEvent ? { ...recordedEvent } : undefined,
      isNewGroup,
      isNewUser,
      isSampled,
    };
  }

  async findGroupById(id: string): Promise<ErrorGroupRecord | null> {
    const group = this.groups.get(id);
    return group ? { ...group } : null;
  }

  async listGroups(params: ListErrorGroupsParams): Promise<ListErrorGroupsResult> {
    const { page, pageSize, status, severity, source, feature, search, from, to } = params;
    const safePage = Math.max(1, page ?? 1);
    const safePageSize = Math.min(100, Math.max(1, pageSize ?? 20));

    let items = Array.from(this.groups.values());

    if (status) {
      items = items.filter((g) => g.status === status);
    }
    if (severity) {
      items = items.filter((g) => g.severity === severity);
    }
    if (source) {
      items = items.filter((g) => g.source === source);
    }
    if (feature) {
      items = items.filter((g) => g.feature === feature);
    }
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(
        (g) =>
          g.title.toLowerCase().includes(q) ||
          (g.errorCode && g.errorCode.toLowerCase().includes(q)) ||
          g.fingerprint.toLowerCase().includes(q),
      );
    }
    if (from) {
      const fromTime = new Date(from).getTime();
      if (!isNaN(fromTime)) {
        items = items.filter((g) => new Date(g.lastSeenAt).getTime() >= fromTime);
      }
    }
    if (to) {
      const toTime = new Date(to).getTime();
      if (!isNaN(toTime)) {
        items = items.filter((g) => new Date(g.lastSeenAt).getTime() <= toTime);
      }
    }

    // Sort by lastSeenAt DESC
    items.sort(
      (a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
    );

    const totalCount = items.length;
    const offset = (safePage - 1) * safePageSize;
    const paginated = items.slice(offset, offset + safePageSize);

    return {
      items: paginated.map((g) => ({ ...g })),
      totalCount,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async listEvents(params: ListErrorEventsParams): Promise<ListErrorEventsResult> {
    const { groupId, page, pageSize } = params;
    const safePage = Math.max(1, page ?? 1);
    const safePageSize = Math.min(100, Math.max(1, pageSize ?? 20));

    let items = Array.from(this.events.values()).filter((e) => e.groupId === groupId);

    // Sort by occurredAt DESC
    items.sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );

    const totalCount = items.length;
    const offset = (safePage - 1) * safePageSize;
    const paginated = items.slice(offset, offset + safePageSize);

    return {
      items: paginated.map((e) => ({ ...e })),
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
    const group = this.groups.get(id);
    if (!group) return null;

    group.status = status;
    if (status === "resolved") {
      group.resolvedAt = new Date().toISOString();
      group.resolvedByUserId = resolvedByUserId ?? null;
    } else {
      group.resolvedAt = null;
      group.resolvedByUserId = null;
    }

    return { ...group };
  }

  async addAdminNote(params: {
    groupId: string;
    adminUserId: string;
    action: string;
    note: string;
  }): Promise<ErrorAdminNoteRecord> {
    const noteRecord: ErrorAdminNoteRecord = {
      id: randomUUID(),
      groupId: params.groupId,
      adminUserId: params.adminUserId,
      action: params.action,
      note: params.note,
      createdAt: new Date().toISOString(),
    };

    const notes = this.adminNotes.get(params.groupId) ?? [];
    notes.unshift(noteRecord);
    this.adminNotes.set(params.groupId, notes);

    return { ...noteRecord };
  }

  async listAdminNotes(groupId: string): Promise<ErrorAdminNoteRecord[]> {
    const notes = this.adminNotes.get(groupId) ?? [];
    return notes.map((n) => ({ ...n }));
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

    // Map all recorded events to AdminLogRecord shape
    let allLogs = Array.from(this.events.values()).map((e) => {
      const group = this.groups.get(e.groupId);
      const level =
        group?.severity === "critical"
          ? "CRITICAL"
          : group?.severity === "warning"
            ? "WARNING"
            : group?.severity === "info"
              ? "INFO"
              : "ERROR";

      const service = group ? `${group.source}:${group.feature}` : "avana-api";
      const message = group ? `[${group.errorCode || "ERROR"}] ${group.title}` : "System error";

      return {
        id: e.id,
        timestamp: e.occurredAt,
        level,
        service,
        message,
      };
    });

    if (params.level) {
      allLogs = allLogs.filter(
        (l) => l.level.toUpperCase() === params.level?.toUpperCase(),
      );
    }

    allLogs.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    const totalCount = allLogs.length;
    const offset = (safePage - 1) * safePageSize;
    const paginated = allLogs.slice(offset, offset + safePageSize);

    return {
      logs: paginated,
      totalCount,
    };
  }
}
