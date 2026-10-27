import { sql } from "drizzle-orm";

/**
 * Migration 0087: Add reference column to lessons table.
 *
 * Implements:
 * 1. reference column in lessons table:
 *    - Optional text column for storing educational reference (book, paper, pamphlet, citation)
 *    - Nullable, defaults to NULL
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE lessons ADD COLUMN IF NOT EXISTS reference text;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE lessons DROP COLUMN IF EXISTS reference;
  `);
}
