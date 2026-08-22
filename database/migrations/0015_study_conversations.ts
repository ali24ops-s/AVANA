import { sql } from "drizzle-orm";

/**
 * Migration 0015: AI Study Assistant Conversations & Messages.
 *
 * Adds study_conversations and study_conversation_messages tables
 * for persistent multi-turn study assistant interactions.
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- Create study_conversations table
    CREATE TABLE IF NOT EXISTS study_conversations (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
      course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
      lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL,
      title varchar(255),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_study_conversations_user
      ON study_conversations (user_id);

    CREATE INDEX IF NOT EXISTS idx_study_conversations_lesson
      ON study_conversations (lesson_id);

    CREATE INDEX IF NOT EXISTS idx_study_conversations_user_updated
      ON study_conversations (user_id, updated_at);

    -- Create study_conversation_messages table
    CREATE TABLE IF NOT EXISTS study_conversation_messages (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      conversation_id uuid NOT NULL REFERENCES study_conversations(id) ON DELETE CASCADE,
      role varchar(20) NOT NULL,
      content text NOT NULL,
      token_usage jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_study_conv_messages_conv_order
      ON study_conversation_messages (conversation_id, created_at);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS study_conversation_messages CASCADE;
    DROP TABLE IF EXISTS study_conversations CASCADE;
  `);
}
