/**
 * Core types for AVANA Stateful Migration Tracking and Recovery System.
 */

export type MigrationStatus =
  | "pending"
  | "applied"
  | "baselined"
  | "manual_verified"
  | "not_applicable"
  | "failed";

export type AttemptStatus =
  | "in_progress"
  | "success"
  | "failed"
  | "indeterminate"
  | "indeterminate_rolled_back";

export type EvidenceStatus =
  | "proven"
  | "insufficient_evidence"
  | "missing"
  | "conflicting";

export interface MigrationDefinition {
  id: string;
  sequence: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  up: (db: any) => Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  down?: (db: any) => Promise<void>;
  sourceFile?: string;
}

export interface MigrationManifestEntry {
  id: string;
  sequence: number;
  source_file: string;
  dist_file: string;
  source_sha256: string;
  dist_sha256?: string;
}

export interface BuildManifest {
  build_timestamp: string;
  git_commit?: string;
  migrations: MigrationManifestEntry[];
}

export interface EvidenceCriteria {
  id: string;
  description: string;
  query: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  verify: (rows: any[]) => EvidenceStatus;
}

export interface MigrationRecord {
  migration_id: string;
  sequence_number: number;
  status: MigrationStatus;
  checksum: string;
  applied_at: Date | null;
  last_attempt_id: number | null;
  commit_ticket: string | null;
  execution_time_ms: number | null;
  error_message: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AttemptRecord {
  id: number;
  migration_id: string;
  attempt_number: number;
  status: AttemptStatus;
  commit_ticket: string;
  started_at: Date;
  finished_at: Date | null;
  execution_time_ms: number | null;
  error_message: string | null;
  error_stack: string | null;
  runner_pid: number;
  hostname: string;
  git_commit_hash: string | null;
}
