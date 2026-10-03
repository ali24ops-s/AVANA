import { sql } from "drizzle-orm";

/**
 * Migration 0070: Teacher Student Messaging.
 *
 * Creates:
 * 1. teacher_student_conversations
 * 2. teacher_conversation_messages
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS teacher_student_conversations (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      teacher_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      category varchar(50) NOT NULL,
      subject varchar(255) NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'new',
      last_activity_at timestamptz NOT NULL DEFAULT now(),
      last_sender_role varchar(20) NOT NULL DEFAULT 'student',
      teacher_read_at timestamptz,
      student_read_at timestamptz,
      answered_at timestamptz,
      closed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_teacher_conversations_teacher_status ON teacher_student_conversations (teacher_id, status);
    CREATE INDEX IF NOT EXISTS idx_teacher_conversations_teacher_category ON teacher_student_conversations (teacher_id, category);
    CREATE INDEX IF NOT EXISTS idx_teacher_conversations_student_id ON teacher_student_conversations (student_id);
    CREATE INDEX IF NOT EXISTS idx_teacher_conversations_classroom_id ON teacher_student_conversations (classroom_id);
    CREATE INDEX IF NOT EXISTS idx_teacher_conversations_last_activity ON teacher_student_conversations (last_activity_at);

    CREATE TABLE IF NOT EXISTS teacher_conversation_messages (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      conversation_id uuid NOT NULL REFERENCES teacher_student_conversations(id) ON DELETE CASCADE,
      sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_role varchar(20) NOT NULL DEFAULT 'student',
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_teacher_conv_messages_conv_id ON teacher_conversation_messages (conversation_id);
    CREATE INDEX IF NOT EXISTS idx_teacher_conv_messages_created_at ON teacher_conversation_messages (created_at);
  `);
}
