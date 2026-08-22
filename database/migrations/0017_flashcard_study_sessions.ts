import { sql } from "drizzle-orm";

/**
 * Migration 0017: Flashcard Study Sessions (Persistence & Resume capability).
 *
 * Adds flashcard_study_sessions and flashcard_study_session_cards tables
 * to store persistent snapshots of study sessions and their exact card order,
 * enabling users to resume unfinished flashcard studies.
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- Create flashcard_study_sessions table
    CREATE TABLE IF NOT EXISTS flashcard_study_sessions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
      title varchar(255) NOT NULL,
      mode varchar(50) NOT NULL DEFAULT 'daily',
      custom_mode varchar(50),
      status varchar(30) NOT NULL DEFAULT 'in_progress',
      total_cards integer NOT NULL DEFAULT 0,
      completed_cards integer NOT NULL DEFAULT 0,
      current_index integer NOT NULL DEFAULT 0,
      current_card_id uuid,
      started_at timestamptz NOT NULL DEFAULT now(),
      last_activity_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz,
      metadata jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    -- Create flashcard_study_session_cards table (Ordered Snapshot)
    CREATE TABLE IF NOT EXISTS flashcard_study_session_cards (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      session_id uuid NOT NULL REFERENCES flashcard_study_sessions(id) ON DELETE CASCADE,
      flashcard_id uuid REFERENCES flashcards(id) ON DELETE SET NULL,
      sort_order integer NOT NULL DEFAULT 0,
      status varchar(30) NOT NULL DEFAULT 'unseen',
      rating varchar(20),
      reviewed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_fss_user_status
      ON flashcard_study_sessions (user_id, status);

    CREATE INDEX IF NOT EXISTS idx_fss_user_last_activity
      ON flashcard_study_sessions (user_id, last_activity_at DESC);

    CREATE INDEX IF NOT EXISTS idx_fss_org_user
      ON flashcard_study_sessions (organization_id, user_id);

    CREATE INDEX IF NOT EXISTS idx_fss_cards_session_order
      ON flashcard_study_session_cards (session_id, sort_order);

    CREATE INDEX IF NOT EXISTS idx_fss_cards_flashcard
      ON flashcard_study_session_cards (flashcard_id);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS flashcard_study_session_cards CASCADE;
    DROP TABLE IF EXISTS flashcard_study_sessions CASCADE;
  `);
}
