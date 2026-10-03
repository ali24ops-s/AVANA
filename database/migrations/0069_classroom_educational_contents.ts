import { sql } from "drizzle-orm";

/**
 * Migration 0069: Classroom Educational Contents.
 *
 * Creates:
 * 1. classroom_contents
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS classroom_contents (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      teacher_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title varchar(255) NOT NULL,
      description text,
      content_type varchar(30) NOT NULL,
      text_content text,
      file_url varchar(512),
      file_name varchar(255),
      file_size_bytes integer,
      mime_type varchar(128),
      external_url varchar(2048),
      video_provider varchar(50),
      video_embed_url varchar(2048),
      status varchar(20) NOT NULL DEFAULT 'draft',
      published_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      archived_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_classroom_contents_classroom_id ON classroom_contents (classroom_id);
    CREATE INDEX IF NOT EXISTS idx_classroom_contents_teacher_id ON classroom_contents (teacher_id);
    CREATE INDEX IF NOT EXISTS idx_classroom_contents_status_created_at ON classroom_contents (status, created_at);
  `);
}
