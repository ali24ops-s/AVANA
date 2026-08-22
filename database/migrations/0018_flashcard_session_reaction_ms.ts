import { sql } from "drizzle-orm";

/**
 * Migration 0018: Add reaction_ms to flashcard_study_session_cards
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE flashcard_study_session_cards
    ADD COLUMN IF NOT EXISTS reaction_ms integer;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE flashcard_study_session_cards
    DROP COLUMN IF EXISTS reaction_ms;
  `);
}
