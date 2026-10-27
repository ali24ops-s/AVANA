import { sql } from "drizzle-orm";

/**
 * Migration 0086: User Onboarding Tour status tracking.
 *
 * Implements:
 * 1. user_onboarding_tours table:
 *    - Strictly enforces at-most-once tour record per user via UNIQUE(user_id)
 *    - Records status ('unseen', 'skipped', 'completed')
 *    - Records step, completed_at, and dismissed_at timestamps
 *    - Indexes user_id and status for optimal querying
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_onboarding_tours (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tour_id varchar(50) NOT NULL DEFAULT 'dashboard_overview',
      status varchar(30) NOT NULL DEFAULT 'unseen',
      step integer NOT NULL DEFAULT 1,
      completed_at timestamptz,
      dismissed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_onboarding_tours_user_id
      ON user_onboarding_tours (user_id);

    CREATE INDEX IF NOT EXISTS idx_user_onboarding_tours_status
      ON user_onboarding_tours (status);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS user_onboarding_tours CASCADE;
  `);
}
