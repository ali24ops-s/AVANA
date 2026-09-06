import { sql } from "drizzle-orm";

/**
 * Migration 0038: Document Generation Progress Table.
 *
 * Persists granular AI Generation Pipeline status, stage, and numeric progress
 * per document for the Admin panel and live monitoring.
 *
 * Guarantees & Invariants:
 * 1. 1-to-1 canonical relationship with \`documents\` via document_id primary key.
 * 2. Independent from document processing lifecycle status (documents.status).
 * 3. Optimistic concurrency & monotonic progression via \`version\` and atomic updates.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS document_generation_progress (
      document_id uuid PRIMARY KEY REFERENCES documents(id) ON DELETE CASCADE,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      status varchar(30) NOT NULL DEFAULT 'idle',
      stage varchar(50),
      progress_current integer NOT NULL DEFAULT 0,
      progress_total integer NOT NULL DEFAULT 0,
      stage_started_at timestamptz,
      last_activity_at timestamptz,
      error_message text,
      version integer NOT NULL DEFAULT 1,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_doc_gen_progress_org
      ON document_generation_progress (organization_id);

    CREATE INDEX IF NOT EXISTS idx_doc_gen_progress_status
      ON document_generation_progress (status);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS document_generation_progress;
  `);
}
