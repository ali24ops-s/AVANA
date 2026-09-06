import { sql } from "drizzle-orm";

/**
 * Migration 0033: Widen quiz_attempts topic column from varchar(255) to varchar(1024).
 *
 * Prevents character varying(255) overflow when Persian lesson/module titles are concatenated.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE IF EXISTS quiz_attempts 
      ALTER COLUMN topic TYPE varchar(1024);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE IF EXISTS quiz_attempts 
      ALTER COLUMN topic TYPE varchar(255);
  `);
}
