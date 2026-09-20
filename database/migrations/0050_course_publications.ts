import { sql } from "drizzle-orm";

/**
 * Migration 0050: Course Publications & Library Publishing.
 *
 * Adds course_publications table for immutable course publishing snapshots,
 * creator-to-admin review workflow, and library catalog distribution.
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS course_publications (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      creator_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
      organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
      title varchar(255) NOT NULL,
      description text,
      subject varchar(255),
      version integer NOT NULL DEFAULT 1,
      status varchar(30) NOT NULL DEFAULT 'pending_review',
      published_at timestamptz,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_course_publications_course_status
      ON course_publications (course_id, status);

    CREATE INDEX IF NOT EXISTS idx_course_publications_status
      ON course_publications (status);

    CREATE INDEX IF NOT EXISTS idx_course_publications_creator
      ON course_publications (creator_user_id);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS course_publications;
  `);
}
