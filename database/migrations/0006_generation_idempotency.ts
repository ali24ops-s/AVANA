import { sql } from "drizzle-orm";

/**
 * PR6-4 — Optional additive generation idempotency migration.
 *
 * Adds a nullable `generation_key` column to `generated_contents` and a
 * partial unique index to make AI generation idempotent and worker-safe.
 *
 * Design intent (see docs/PR6_4_MODEL_GATEWAY_PROPOSAL.md §3.2):
 *
 * - The uniqueness constraint is NOT coupled to a single scenario
 *   (`document_id + type`). Instead, the caller computes a `generation_key`
 *   that encodes the broader scenario (e.g. course-level regeneration).
 * - `generation_key` is nullable, so existing rows (and drafts created
 *   without a key) are unaffected.
 * - The partial unique index only applies where `generation_key IS NOT NULL`,
 *   preventing duplicate drafts on worker redelivery for the same
 *   document/type/scenario.
 *
 * This is additive and reversible. The index can be broadened later (e.g. to
 * `course_id`-scoped or regeneration-batch keys) by dropping and recreating
 * the partial index as generation scenarios formalize.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- Add the caller-supplied scenario key (nullable, additive).
    ALTER TABLE generated_contents
      ADD COLUMN IF NOT EXISTS generation_key varchar(64);

    -- Partial unique index: scope is expressed by document_id + type + key.
    -- Dedupes drafts on worker redelivery. Only applies where key is set.
    CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_contents_dedup
      ON generated_contents (document_id, type, generation_key)
      WHERE generation_key IS NOT NULL;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP INDEX IF EXISTS idx_generated_contents_dedup;
    ALTER TABLE generated_contents
      DROP COLUMN IF EXISTS generation_key;
  `);
}
