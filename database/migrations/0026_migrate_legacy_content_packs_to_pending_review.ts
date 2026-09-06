import { sql } from "drizzle-orm";

/**
 * Migration 0026: Migrate Legacy Content Packs to Pending Review.
 *
 * Enforces the authoritative business invariant:
 * "No Content Pack may remain publicly available unless an authorized admin
 * has explicitly reviewed it and explicitly chosen Free or Paid + Price."
 *
 * 1. Sets status = 'pending_review' for all legacy content packs where:
 *    status = 'published' AND (
 *      metadata->>'accessType' IS NULL
 *      OR metadata->>'accessType' NOT IN ('free', 'paid')
 *      OR metadata->>'reviewedAt' IS NULL
 *    ).
 *
 * 2. Deactivates any active commerce product linked to these unreviewed packs (active = false),
 *    preventing purchases while awaiting admin review, while preserving 100% of product,
 *    order, transaction, and entitlement history.
 *
 * Deterministic, idempotent, and transaction-safe.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  // 1. Deactivate active products linked to unreviewed content packs
  await db.execute(sql`
    UPDATE products
    SET 
      active = false,
      updated_at = NOW()
    WHERE target_type = 'content_pack'
      AND target_id IN (
        SELECT id FROM content_packs
        WHERE (
          metadata->>'accessType' IS NULL
          OR metadata->>'accessType' NOT IN ('free', 'paid')
          OR metadata->>'reviewedAt' IS NULL
        )
      )
      AND active = true;
  `);

  // 2. Move unreviewed legacy content packs to 'pending_review'
  await db.execute(sql`
    UPDATE content_packs
    SET 
      status = 'pending_review',
      updated_at = NOW()
    WHERE status = 'published'
      AND (
        metadata->>'accessType' IS NULL
        OR metadata->>'accessType' NOT IN ('free', 'paid')
        OR metadata->>'reviewedAt' IS NULL
      );
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    UPDATE content_packs
    SET 
      status = 'published',
      updated_at = NOW()
    WHERE status = 'pending_review'
      AND (
        metadata->>'accessType' IS NULL
        OR metadata->>'accessType' NOT IN ('free', 'paid')
        OR metadata->>'reviewedAt' IS NULL
      );
  `);
}
