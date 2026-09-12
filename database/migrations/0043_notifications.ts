import { sql } from "drizzle-orm";

/**
 * Migration 0043: Notifications System.
 *
 * Creates `notifications` table to store real in-app notifications
 * for users with type safety, unread tracking, deep link actions,
 * and idempotency deduplication.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notifications (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type varchar(64) NOT NULL,
      title varchar(255) NOT NULL,
      message text NOT NULL,
      is_read boolean NOT NULL DEFAULT false,
      read_at timestamptz,
      metadata jsonb,
      action_url varchar(512),
      idempotency_key varchar(255) UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_user_created
      ON notifications (user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
      ON notifications (user_id, is_read)
      WHERE is_read = false;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotency
      ON notifications (idempotency_key)
      WHERE idempotency_key IS NOT NULL;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS notifications CASCADE;
  `);
}
