import { sql } from "drizzle-orm";

/**
 * Migration 0044: Lesson Annotations (Highlights/Notes) & Content Reports.
 *
 * Creates:
 * 1. `lesson_annotations` table to store persistent user highlights & notes with
 *    canonical offset and prefix/suffix text anchoring.
 * 2. `content_reports` table to store student-reported issue categories and comments
 *    anchored to specific lesson excerpts.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS lesson_annotations (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      type varchar(20) NOT NULL,
      selected_text text NOT NULL,
      prefix text,
      suffix text,
      start_offset integer,
      end_offset integer,
      color varchar(30) NOT NULL DEFAULT 'default',
      note_text text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_lesson_annotations_user_lesson
      ON lesson_annotations (user_id, lesson_id);

    CREATE TABLE IF NOT EXISTS content_reports (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id uuid NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
      course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
      selected_text text NOT NULL,
      category varchar(50) NOT NULL,
      comment text,
      status varchar(20) NOT NULL DEFAULT 'pending',
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_content_reports_lesson
      ON content_reports (lesson_id);

    CREATE INDEX IF NOT EXISTS idx_content_reports_user
      ON content_reports (user_id);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS content_reports CASCADE;
    DROP TABLE IF EXISTS lesson_annotations CASCADE;
  `);
}
