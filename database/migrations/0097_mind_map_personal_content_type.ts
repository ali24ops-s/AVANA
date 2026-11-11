import { sql } from "drizzle-orm";

/**
 * Migration 0097: Mind Map Personal Content Type.
 *
 * Expands `chk_personal_content_type` constraint on `user_personal_contents`
 * to include 'mind_map', enabling completely isolated lifecycle, independent
 * versioning, and failure isolation for Interactive AI Mind Maps.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE user_personal_contents
      DROP CONSTRAINT IF EXISTS chk_personal_content_type;

    ALTER TABLE user_personal_contents
      ADD CONSTRAINT chk_personal_content_type
      CHECK (content_type IN ('review_summary', 'flashcard', 'quiz', 'mind_map'));
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE user_personal_contents
      DROP CONSTRAINT IF EXISTS chk_personal_content_type;

    ALTER TABLE user_personal_contents
      ADD CONSTRAINT chk_personal_content_type
      CHECK (content_type IN ('review_summary', 'flashcard', 'quiz'));
  `);
}
