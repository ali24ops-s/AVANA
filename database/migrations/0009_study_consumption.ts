import { sql } from "drizzle-orm";

/**
 * PR6-7 — Study consumption SPRINT 7 spaced repetition scheduling columns (additive).
 *
 * Adds FSRS-inspired scheduling columns to `flashcards`:
 *   - due_at       — when the flashcard is next due for review
 *   - interval_days — interval produced by the last review
 *   - ease_factor   — ease factor multiplier
 *
 * It is idempotent (IF NOT EXISTS) and reversible.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE flashcards
      ADD COLUMN IF NOT EXISTS due_at timestamptz NOT NULL DEFAULT now();
    ALTER TABLE flashcards
      ADD COLUMN IF NOT EXISTS interval_days integer NOT NULL DEFAULT 0;
    ALTER TABLE flashcards
      ADD COLUMN IF NOT EXISTS ease_factor numeric(5, 2) NOT NULL DEFAULT '2.5';

    -- Index for due reviews retrieval
    CREATE INDEX IF NOT EXISTS idx_flashcards_due_at ON flashcards (due_at);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_flashcards_due_at;

    ALTER TABLE flashcards
      DROP COLUMN IF EXISTS ease_factor;
    ALTER TABLE flashcards
      DROP COLUMN IF EXISTS interval_days;
    ALTER TABLE flashcards
      DROP COLUMN IF EXISTS due_at;
  `);
}
