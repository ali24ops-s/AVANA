/**
 * Store interface for Error Monitoring & Observability.
 */

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

export interface RecordOccurrenceInput {
  group: {
    fingerprint: string;
    fingerprintVersion: number;
    environment: string;
    source: ErrorGroupRecord["source"];
    severity: ErrorGroupRecord["severity"];
    feature: string;
    errorCode?: string | null;
    title: string;
    status?: ErrorGroupStatus;
    appVersion?: string | null;
  };
  event: {
    fingerprint: string;
    requestId?: string | null;
    correlationId?: string | null;
    operation?: string | null;
    failureStage?: string | null;
    userId?: string | null;
    organizationId?: string | null;
    courseId?: string | null;
    endpoint?: string | null;
    httpMethod?: string | null;
    httpStatus?: number | null;
    stackTrace?: string | null;
    sanitizedContext: Record<string, unknown>;
    occurredAt: Date;
  };
  shouldSampleEvent?: boolean;
  userId?: string | null;
}

export interface RecordOccurrenceResult {
  group: ErrorGroupRecord;
  event?: ErrorEventRecord;
  isNewGroup: boolean;
  isNewUser: boolean;
  isSampled: boolean;
}

export interface ErrorMonitoringStore {
  /**
   * Atomically upserts the error group (incrementing totalOccurrences),
   * tracks unique affected user (incrementing affectedUsersCount if new),
   * and conditionally persists the individual error event if shouldSampleEvent is true.
   */
  recordOccurrence(input: RecordOccurrenceInput): Promise<RecordOccurrenceResult>;

  findGroupById(id: string): Promise<ErrorGroupRecord | null>;

  listGroups(params: ListErrorGroupsParams): Promise<ListErrorGroupsResult>;

  listEvents(params: ListErrorEventsParams): Promise<ListErrorEventsResult>;

  updateGroupStatus(
    id: string,
    status: ErrorGroupStatus,
    resolvedByUserId?: string,
  ): Promise<ErrorGroupRecord | null>;

  addAdminNote(params: {
    groupId: string;
    adminUserId: string;
    action: string;
    note: string;
  }): Promise<ErrorAdminNoteRecord>;

  listAdminNotes(groupId: string): Promise<ErrorAdminNoteRecord[]>;

  /**
   * Provides adapter output for the existing /admin/system/logs endpoint.
   */
  listRecentLogs(params: {
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
  }>;
}
