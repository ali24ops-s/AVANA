import { sql } from "drizzle-orm";

/**
 * PR5-A — lesson publication state.
 *
 * Existing lessons are already learner-visible, so they are backfilled as
 * published before the column becomes required. New lessons default to draft.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE lessons
      ADD COLUMN IF NOT EXISTS publication_status varchar(20);

    UPDATE lessons
      SET publication_status = 'published'
      WHERE publication_status IS NULL;

    ALTER TABLE lessons
      DROP CONSTRAINT IF EXISTS chk_lessons_publication_status;

    ALTER TABLE lessons
      ADD CONSTRAINT chk_lessons_publication_status
      CHECK (publication_status IN ('draft', 'published'));

    ALTER TABLE lessons
      ALTER COLUMN publication_status SET NOT NULL;

    ALTER TABLE lessons
      ALTER COLUMN publication_status SET DEFAULT 'draft';
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE lessons
      DROP CONSTRAINT IF EXISTS chk_lessons_publication_status;

    ALTER TABLE lessons
      DROP COLUMN IF EXISTS publication_status;
  `);
}
