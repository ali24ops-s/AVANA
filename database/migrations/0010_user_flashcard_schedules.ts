import { sql } from "drizzle-orm";
import { nextReviewInterval, nextDueAt, type FlashcardRating } from "@avana/domain";

/**
 * Migration 0010: Add per-user flashcard schedules table and backfill historical schedules.
 *
 * 1. Creates `user_flashcard_schedules` table with UNIQUE(user_id, flashcard_id).
 * 2. Backfills per-user SRS schedules by replaying `flashcard_reviews` in chronological order
 *    using pure domain SRS logic (nextReviewInterval, nextDueAt).
 * 3. Does NOT drop legacy columns on `flashcards` to ensure safe, zero-downtime migration.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_flashcard_schedules (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      flashcard_id uuid NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
      due_at timestamptz NOT NULL,
      interval_days integer NOT NULL DEFAULT 0,
      ease_factor numeric(5, 2) NOT NULL DEFAULT '2.5',
      last_reviewed_at timestamptz,
      review_count integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_flashcard_schedules_user_card
      ON user_flashcard_schedules (user_id, flashcard_id);

    CREATE INDEX IF NOT EXISTS idx_user_flashcard_schedules_user_due
      ON user_flashcard_schedules (user_id, due_at);

    CREATE INDEX IF NOT EXISTS idx_user_flashcard_schedules_card
      ON user_flashcard_schedules (flashcard_id);
  `);

  // Backfill per-user schedules from historical flashcard_reviews
  const rawReviews = await db.execute(sql`
    SELECT id, flashcard_id, user_id, rating, reviewed_at
    FROM flashcard_reviews
    ORDER BY reviewed_at ASC
  `);

  const rows = rawReviews.rows ?? rawReviews;
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  type ReviewRow = {
    id: string;
    flashcard_id: string;
    user_id: string;
    rating: string;
    reviewed_at: Date | string;
  };

  const grouped = new Map<string, ReviewRow[]>();
  for (const r of rows as ReviewRow[]) {
    const key = `${r.user_id}:${r.flashcard_id}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(r);
  }

  for (const [key, reviews] of grouped.entries()) {
    const [userId, flashcardId] = key.split(":");
    let currentState = { intervalDays: 0, easeFactor: 2.5 };
    let lastReviewedAt: Date = new Date();
    let lastDueAtIso: string = new Date().toISOString();

    for (const r of reviews) {
      const reviewDate = new Date(r.reviewed_at);
      lastReviewedAt = reviewDate;
      const rating = r.rating as FlashcardRating;
      currentState = nextReviewInterval(rating, currentState);
      lastDueAtIso = nextDueAt(rating, currentState, reviewDate);
    }

    await db.execute(sql`
      INSERT INTO user_flashcard_schedules (
        user_id, flashcard_id, due_at, interval_days, ease_factor, last_reviewed_at, review_count, updated_at
      )
      VALUES (
        ${userId}, ${flashcardId}, ${new Date(lastDueAtIso)}, ${currentState.intervalDays}, ${currentState.easeFactor.toString()}, ${lastReviewedAt}, ${reviews.length}, ${lastReviewedAt}
      )
      ON CONFLICT (user_id, flashcard_id) DO UPDATE SET
        due_at = EXCLUDED.due_at,
        interval_days = EXCLUDED.interval_days,
        ease_factor = EXCLUDED.ease_factor,
        last_reviewed_at = EXCLUDED.last_reviewed_at,
        review_count = EXCLUDED.review_count,
        updated_at = EXCLUDED.updated_at
    `);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_user_flashcard_schedules_card;
    DROP INDEX IF EXISTS idx_user_flashcard_schedules_user_due;
    DROP INDEX IF EXISTS idx_user_flashcard_schedules_user_card;
    DROP TABLE IF EXISTS user_flashcard_schedules;
  `);
}
