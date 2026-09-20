import { sql } from "drizzle-orm";

/**
 * Migration 0046: System configurations table & Reference Pricing seed.
 *
 * Creates:
 * 1. `system_configurations` table for platform and financial settings.
 * 2. Seeds initial `generation_reference_pricing` baseline configuration:
 *    - referenceDocumentId: "19313b37-8baf-47bb-a80d-3a70e5ed910e"
 *    - referenceFileName: "40.pdf"
 *    - referenceUsableTokens: 35572
 *    - lessonBaselinePriceToman: 15000
 *    - flashcardBaselinePriceToman: 7000
 *    - examBaselinePriceToman: 9000
 *    - summaryFixedPriceToman: 4000
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS system_configurations (
      key varchar(100) PRIMARY KEY,
      value jsonb NOT NULL,
      description text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by uuid REFERENCES users(id) ON DELETE SET NULL
    );

    INSERT INTO system_configurations (key, value, description, updated_at)
    VALUES (
      'generation_reference_pricing',
      jsonb_build_object(
        'referenceDocumentId', '19313b37-8baf-47bb-a80d-3a70e5ed910e',
        'referenceFileName', '40.pdf',
        'referenceUsableTokens', 35572,
        'lessonBaselinePriceToman', 15000,
        'flashcardBaselinePriceToman', 7000,
        'examBaselinePriceToman', 9000,
        'summaryFixedPriceToman', 4000
      ),
      'Baseline reference pricing for AI content generation calibrated on Katzung Chapter 40',
      now()
    )
    ON CONFLICT (key) DO NOTHING;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS system_configurations CASCADE;
  `);
}
