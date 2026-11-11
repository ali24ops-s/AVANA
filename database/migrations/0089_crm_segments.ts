import { sql } from "drizzle-orm";

/**
 * Migration 0089: CRM Dynamic Customer Segmentation Tables.
 *
 * Implements:
 * 1. crm_segments table:
 *    - Allows admins to define and store dynamic customer segments
 *    - Unique ID, name, optional description, active status
 *    - match_operator: 'and' | 'or'
 *    - filter_rules: jsonb payload storing validated domain rule specifications
 *    - created_by: foreign key referencing users(id) with ON DELETE RESTRICT
 *    - Timestamps: created_at, updated_at
 *    - Targeted query indexes on is_active, created_by, and created_at
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS crm_segments (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      name varchar(150) NOT NULL,
      description text,
      is_active boolean NOT NULL DEFAULT true,
      match_operator varchar(10) NOT NULL DEFAULT 'and',
      filter_rules jsonb NOT NULL DEFAULT '[]'::jsonb,
      created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_crm_segments_active
      ON crm_segments (is_active);

    CREATE INDEX IF NOT EXISTS idx_crm_segments_created_by
      ON crm_segments (created_by);

    CREATE INDEX IF NOT EXISTS idx_crm_segments_created_at
      ON crm_segments (created_at DESC);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS crm_segments CASCADE;
  `);
}
