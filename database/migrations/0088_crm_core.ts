import { sql } from "drizzle-orm";

/**
 * Migration 0088: CRM Core Tables (Tags, Customer Tags, Customer Notes).
 *
 * Implements:
 * 1. crm_tags table:
 *    - Custom manual tags for categorizing customers (e.g. VIP, Needs Follow-up, Payment Issue)
 *    - Unique name, hex color, description
 * 2. crm_customer_tags table:
 *    - Junction table assigning tags to users
 *    - Composite primary key (user_id, tag_id) prevents duplicate assignment
 *    - Cascade delete on user or tag deletion without removing the user
 * 3. crm_customer_notes table:
 *    - Internal team notes attached to a customer profile
 *    - Tracks author_id, content, is_pinned flag, created_at, updated_at
 *    - Cascade delete on user deletion
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS crm_tags (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      name varchar(100) NOT NULL UNIQUE,
      color varchar(20) NOT NULL DEFAULT '#3b82f6',
      description text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS crm_customer_tags (
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tag_id uuid NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
      assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS idx_crm_customer_tags_tag
      ON crm_customer_tags (tag_id);

    CREATE INDEX IF NOT EXISTS idx_crm_customer_tags_user
      ON crm_customer_tags (user_id);

    CREATE TABLE IF NOT EXISTS crm_customer_notes (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content text NOT NULL,
      is_pinned boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_crm_customer_notes_user
      ON crm_customer_notes (user_id);

    CREATE INDEX IF NOT EXISTS idx_crm_customer_notes_user_pinned
      ON crm_customer_notes (user_id, is_pinned DESC, created_at DESC);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS crm_customer_notes CASCADE;
    DROP TABLE IF EXISTS crm_customer_tags CASCADE;
    DROP TABLE IF EXISTS crm_tags CASCADE;
  `);
}
