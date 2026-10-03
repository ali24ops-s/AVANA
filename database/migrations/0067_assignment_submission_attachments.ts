import { sql } from "drizzle-orm";

/**
 * Migration 0067: Assignment Submission Attachments.
 *
 * Adds optional attachment_url, attachment_name, and attachment_size_bytes
 * to classroom_assignment_submissions.
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE classroom_assignment_submissions
      ADD COLUMN IF NOT EXISTS attachment_url varchar(512),
      ADD COLUMN IF NOT EXISTS attachment_name varchar(255),
      ADD COLUMN IF NOT EXISTS attachment_size_bytes integer;
  `);
}
