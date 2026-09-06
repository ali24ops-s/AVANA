import { sql } from "drizzle-orm";

/**
 * Migration 0031: Widen generation_key and type columns.
 *
 * Ensures generation_key is varchar(255) on both generated_contents and generation_jobs,
 * and generation_jobs.type is varchar(100) to support composite job types (e.g. "flashcard,quiz")
 * and deterministic scenario keys (doc:{id}:async:{uuid}).
 *
 * Safe and idempotent on both fresh and pre-existing databases.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function up(db: any) {
  await db.execute(sql`
    ALTER TABLE IF EXISTS generated_contents 
      ALTER COLUMN generation_key TYPE varchar(255);

    ALTER TABLE IF EXISTS generation_jobs 
      ALTER COLUMN generation_key TYPE varchar(255);

    ALTER TABLE IF EXISTS generation_jobs 
      ALTER COLUMN type TYPE varchar(100);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE IF EXISTS generated_contents 
      ALTER COLUMN generation_key TYPE varchar(64);

    ALTER TABLE IF EXISTS generation_jobs 
      ALTER COLUMN generation_key TYPE varchar(64);

    ALTER TABLE IF EXISTS generation_jobs 
      ALTER COLUMN type TYPE varchar(30);
  `);
}
