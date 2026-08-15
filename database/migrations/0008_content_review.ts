import { sql } from "drizzle-orm";

/**
 * PR6-6 — Human review & acceptance workflow (additive).
 *
 * Adds review and materialization metadata columns to `generated_contents`:
 *
 *   - reviewed_by / reviewed_at / review_reason  — who reviewed and why
 *   - edited_by / edited_at / previous_payload  — editor modification tracking
 *     (previous_payload is the immediately-preceding payload, NOT a full
 *     version history; future multi-version editing may require a separate
 *     generated_content_versions table)
 *   - materialized_lesson_id — the Learning Core lesson created when an
 *     accepted AI lesson is materialized (nullable FK, set null on lesson
 *     delete). Materialization is explicitly idempotent at the service layer;
 *     no implicit duplicate-detection logic is added here.
 *
 * All columns are nullable/additive so existing rows are unaffected. The
 * migration is idempotent (IF NOT EXISTS) and reversible.
 *
 * No new tables are introduced: audit_logs already provides the immutable
 * review history, so a separate generated_content_reviews table is not
 * needed at this stage.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- Reviewer identity + decision context
    ALTER TABLE generated_contents
      ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id);
    ALTER TABLE generated_contents
      ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
    ALTER TABLE generated_contents
      ADD COLUMN IF NOT EXISTS review_reason text;

    -- Editor modification tracking (previous payload, not full history)
    ALTER TABLE generated_contents
      ADD COLUMN IF NOT EXISTS edited_by uuid REFERENCES users(id);
    ALTER TABLE generated_contents
      ADD COLUMN IF NOT EXISTS edited_at timestamptz;
    ALTER TABLE generated_contents
      ADD COLUMN IF NOT EXISTS previous_payload jsonb;

    -- Materialized Learning Core lesson (idempotent at service layer)
    ALTER TABLE generated_contents
      ADD COLUMN IF NOT EXISTS materialized_lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE generated_contents
      DROP COLUMN IF EXISTS materialized_lesson_id;
    ALTER TABLE generated_contents
      DROP COLUMN IF EXISTS previous_payload;
    ALTER TABLE generated_contents
      DROP COLUMN IF EXISTS edited_at;
    ALTER TABLE generated_contents
      DROP COLUMN IF EXISTS edited_by;
    ALTER TABLE generated_contents
      DROP COLUMN IF EXISTS review_reason;
    ALTER TABLE generated_contents
      DROP COLUMN IF EXISTS reviewed_at;
    ALTER TABLE generated_contents
      DROP COLUMN IF EXISTS reviewed_by;
  `);
}
