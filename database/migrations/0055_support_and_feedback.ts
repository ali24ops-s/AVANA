import { sql } from "drizzle-orm";

/**
 * Migration 0055: Support and Feedback System.
 *
 * Creates:
 * 1. feedbacks table (user feedback, suggestions, complaints, bug reports, feature requests)
 * 2. support_tickets table (conversational support threads with category, priority, status)
 * 3. support_messages table (individual public and internal note messages inside a ticket)
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Feedbacks table
    CREATE TABLE IF NOT EXISTS feedbacks (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type varchar(50) NOT NULL,
      category varchar(50) NOT NULL,
      title varchar(255) NOT NULL,
      description text NOT NULL,
      attachment_url varchar(512),
      status varchar(30) NOT NULL DEFAULT 'new',
      admin_response text,
      responded_at timestamptz,
      responded_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_feedbacks_user_id
      ON feedbacks (user_id);

    CREATE INDEX IF NOT EXISTS idx_feedbacks_status
      ON feedbacks (status);

    CREATE INDEX IF NOT EXISTS idx_feedbacks_type
      ON feedbacks (type);

    CREATE INDEX IF NOT EXISTS idx_feedbacks_category
      ON feedbacks (category);

    CREATE INDEX IF NOT EXISTS idx_feedbacks_created_at
      ON feedbacks (created_at DESC);

    -- 2. Support Tickets table
    CREATE TABLE IF NOT EXISTS support_tickets (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      category varchar(50) NOT NULL,
      priority varchar(30) NOT NULL DEFAULT 'medium',
      status varchar(30) NOT NULL DEFAULT 'open',
      title varchar(255) NOT NULL,
      description text NOT NULL,
      attachment_url varchar(512),
      last_activity_at timestamptz NOT NULL DEFAULT now(),
      closed_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id
      ON support_tickets (user_id);

    CREATE INDEX IF NOT EXISTS idx_support_tickets_status
      ON support_tickets (status);

    CREATE INDEX IF NOT EXISTS idx_support_tickets_priority
      ON support_tickets (priority);

    CREATE INDEX IF NOT EXISTS idx_support_tickets_category
      ON support_tickets (category);

    CREATE INDEX IF NOT EXISTS idx_support_tickets_last_activity
      ON support_tickets (last_activity_at DESC);

    CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at
      ON support_tickets (created_at DESC);

    -- 3. Support Messages table
    CREATE TABLE IF NOT EXISTS support_messages (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_role varchar(30) NOT NULL DEFAULT 'user',
      body text NOT NULL,
      attachment_url varchar(512),
      is_internal_note boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_support_messages_ticket_id
      ON support_messages (ticket_id);

    CREATE INDEX IF NOT EXISTS idx_support_messages_sender_id
      ON support_messages (sender_id);

    CREATE INDEX IF NOT EXISTS idx_support_messages_internal_note
      ON support_messages (ticket_id, is_internal_note);

    CREATE INDEX IF NOT EXISTS idx_support_messages_created_at
      ON support_messages (created_at ASC);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS support_messages CASCADE;
    DROP TABLE IF EXISTS support_tickets CASCADE;
    DROP TABLE IF EXISTS feedbacks CASCADE;
  `);
}
