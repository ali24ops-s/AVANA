import { sql } from "drizzle-orm";

/**
 * Migration 0084: Add nullable read_at column to support_messages table.
 *
 * Rationale:
 * Allows tracking the timestamp when the ticket owner (user) actually views
 * an admin support reply. Null values indicate unread messages. Existing legacy
 * messages remain null (unread) without artificial backfill.
 *
 * Idempotent (ADD COLUMN IF NOT EXISTS).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE support_messages
      ADD COLUMN IF NOT EXISTS read_at timestamptz;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE support_messages
      DROP COLUMN IF EXISTS read_at;
  `);
}
