/**
 * Types and interfaces for AVANA Error Monitoring & Observability (Phase 1).
 */

export type ErrorSeverity = "critical" | "error" | "warning" | "info";
export type ErrorSource = "backend" | "worker" | "external" | "frontend";
export type ErrorGroupStatus = "unresolved" | "investigating" | "resolved" | "ignored";

export interface FingerprintComponents {
  fingerprintVersion: number;
  environment: string;
  source: string;
  feature: string;
  errorCode?: string;
  normalizedMessage: string;
  topStackFrame?: string;
}

export interface IngestErrorInput {
  error?: unknown;
  message?: string;
  source?: ErrorSource;
  severity?: ErrorSeverity;
  feature?: string;
  errorCode?: string;
  operation?: string;
  failureStage?: string;
  userId?: string;
  organizationId?: string;
  courseId?: string;
  requestId?: string;
  correlationId?: string;
  endpoint?: string;
  httpMethod?: string;
  httpStatus?: number;
  context?: Record<string, unknown>;
  occurredAt?: Date | string;
  environment?: string;
  appVersion?: string;
  stackTrace?: string;
}

export interface ErrorGroupRecord {
  id: string;
  fingerprint: string;
  fingerprintVersion: number;
  environment: string;
  source: ErrorSource;
  severity: ErrorSeverity;
  feature: string;
  errorCode?: string | null;
  title: string;
  status: ErrorGroupStatus;
  appVersion?: string | null;
  totalOccurrences: number;
  affectedUsersCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt?: string | null;
  resolvedByUserId?: string | null;
}

export interface ErrorEventRecord {
  id: string;
  groupId: string;
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
  occurredAt: string;
}

export interface ErrorAdminNoteRecord {
  id: string;
  groupId: string;
  adminUserId: string;
  adminEmail?: string;
  action: string;
  note: string;
  createdAt: string;
}

export interface ListErrorGroupsParams {
  page: number;
  pageSize: number;
  status?: ErrorGroupStatus;
  severity?: ErrorSeverity;
  source?: ErrorSource;
  feature?: string;
  search?: string;
  from?: string;
  to?: string;
}

export interface ListErrorGroupsResult {
  items: ErrorGroupRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
}

export interface ListErrorEventsParams {
  groupId: string;
  page: number;
  pageSize: number;
}

export interface ListErrorEventsResult {
  items: ErrorEventRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
}
