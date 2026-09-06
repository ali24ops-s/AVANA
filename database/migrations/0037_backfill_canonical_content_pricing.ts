import { sql } from "drizzle-orm";

/**
 * Migration 0037: Backfill Canonical Content Pricing & Fix Accidental Zero-Prices.
 *
 * Guarantees & Invariants:
 * 1. Deterministic Canonical Pricing:
 *    price = 1000 + ceil(flashcards / 100) * 500 + ceil(questions / 100) * 300 + (has_review_summary ? 2000 : 0)
 * 2. Fail-Closed & Explicit Free Separation:
 *    - Preserves all explicit Admin pricing (adminPriced: true or price > 0).
 *    - Preserves all explicit Admin Free decisions (explicitlyFree: true).
 *    - Backfills all legacy unpriced products (price = 0 with no admin flag) with canonical suggested price.
 *    - Creates products for lessons lacking a product with canonical suggested price.
 * 3. Complete Idempotency:
 *    - Running up() multiple times causes zero unexpected changes and never overwrites admin prices.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function up(db: any) {
  // Step 1: Update existing products with price=0 that were NOT explicitly made free by Admin
  await db.execute(sql`
    WITH lesson_metrics AS (
      SELECT 
        l.id AS lesson_id,
        l.title AS lesson_title,
        l.module_id,
        (
          SELECT COUNT(*)::int 
          FROM flashcards f 
          WHERE f.lesson_id = l.id AND f.deleted_at IS NULL
        ) AS flashcard_count,
        (
          SELECT COUNT(*)::int 
          FROM quiz_questions qq 
          WHERE qq.lesson_id = l.id
        ) AS question_count,
        EXISTS (
          SELECT 1 
          FROM modules m
          JOIN generated_contents gc ON gc.document_id = m.document_id
          WHERE m.id = l.module_id 
            AND gc.type = 'review_summary' 
            AND gc.status != 'rejected' 
            AND gc.deleted_at IS NULL
        ) AS has_review_summary
      FROM lessons l
      WHERE l.deleted_at IS NULL
    ),
    calculated_prices AS (
      SELECT
        lm.lesson_id,
        lm.lesson_title,
        lm.flashcard_count,
        lm.question_count,
        lm.has_review_summary,
        (
          1000 + 
          CEIL(lm.flashcard_count / 100.0)::int * 500 + 
          CEIL(lm.question_count / 100.0)::int * 300 + 
          CASE WHEN lm.has_review_summary THEN 2000 ELSE 0 END
        ) AS suggested_price,
        1000 AS lesson_base_price,
        (CEIL(lm.flashcard_count / 100.0)::int * 500) AS flashcard_price,
        (CEIL(lm.question_count / 100.0)::int * 300) AS question_price,
        (CASE WHEN lm.has_review_summary THEN 2000 ELSE 0 END) AS review_summary_price
      FROM lesson_metrics lm
    )
    UPDATE products p
    SET 
      price = cp.suggested_price,
      metadata = jsonb_build_object(
        'suggestedPrice', cp.suggested_price,
        'defaultPriced', true,
        'explicitlyFree', false,
        'pricingBreakdown', jsonb_build_object(
          'lessonBasePrice', cp.lesson_base_price,
          'flashcardPrice', cp.flashcard_price,
          'questionPrice', cp.question_price,
          'reviewSummaryPrice', cp.review_summary_price,
          'totalSuggestedPrice', cp.suggested_price,
          'lessonCount', 1,
          'flashcardCount', cp.flashcard_count,
          'questionCount', cp.question_count,
          'hasReviewSummary', cp.has_review_summary
        )
      ),
      updated_at = now()
    FROM calculated_prices cp
    WHERE (p.target_id = cp.lesson_id OR p.code = 'content_' || cp.lesson_id::text)
      AND p.type = 'content'
      AND p.deleted_at IS NULL
      AND p.price = 0
      AND COALESCE((p.metadata->>'adminPriced')::boolean, false) = false
      AND COALESCE((p.metadata->>'explicitlyFree')::boolean, false) = false;
  `);

  // Step 2: Insert missing products for lessons that do not have a product yet
  await db.execute(sql`
    WITH lesson_metrics AS (
      SELECT 
        l.id AS lesson_id,
        l.title AS lesson_title,
        l.module_id,
        (
          SELECT COUNT(*)::int 
          FROM flashcards f 
          WHERE f.lesson_id = l.id AND f.deleted_at IS NULL
        ) AS flashcard_count,
        (
          SELECT COUNT(*)::int 
          FROM quiz_questions qq 
          WHERE qq.lesson_id = l.id
        ) AS question_count,
        EXISTS (
          SELECT 1 
          FROM modules m
          JOIN generated_contents gc ON gc.document_id = m.document_id
          WHERE m.id = l.module_id 
            AND gc.type = 'review_summary' 
            AND gc.status != 'rejected' 
            AND gc.deleted_at IS NULL
        ) AS has_review_summary
      FROM lessons l
      WHERE l.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM products p
          WHERE (p.target_id = l.id OR p.code = 'content_' || l.id::text)
            AND p.deleted_at IS NULL
        )
    ),
    calculated_prices AS (
      SELECT
        lm.lesson_id,
        lm.lesson_title,
        lm.flashcard_count,
        lm.question_count,
        lm.has_review_summary,
        (
          1000 + 
          CEIL(lm.flashcard_count / 100.0)::int * 500 + 
          CEIL(lm.question_count / 100.0)::int * 300 + 
          CASE WHEN lm.has_review_summary THEN 2000 ELSE 0 END
        ) AS suggested_price,
        1000 AS lesson_base_price,
        (CEIL(lm.flashcard_count / 100.0)::int * 500) AS flashcard_price,
        (CEIL(lm.question_count / 100.0)::int * 300) AS question_price,
        (CASE WHEN lm.has_review_summary THEN 2000 ELSE 0 END) AS review_summary_price
      FROM lesson_metrics lm
    )
    INSERT INTO products (
      id,
      code,
      type,
      title,
      description,
      price,
      currency,
      target_type,
      target_id,
      duration_days,
      active,
      metadata,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid(),
      'content_' || cp.lesson_id::text,
      'content',
      cp.lesson_title,
      COALESCE(cp.lesson_title, ''),
      cp.suggested_price,
      'toman',
      'content',
      cp.lesson_id,
      NULL,
      false,
      jsonb_build_object(
        'suggestedPrice', cp.suggested_price,
        'defaultPriced', true,
        'explicitlyFree', false,
        'pricingBreakdown', jsonb_build_object(
          'lessonBasePrice', cp.lesson_base_price,
          'flashcardPrice', cp.flashcard_price,
          'questionPrice', cp.question_price,
          'reviewSummaryPrice', cp.review_summary_price,
          'totalSuggestedPrice', cp.suggested_price,
          'lessonCount', 1,
          'flashcardCount', cp.flashcard_count,
          'questionCount', cp.question_count,
          'hasReviewSummary', cp.has_review_summary
        )
      ),
      now(),
      now()
    FROM calculated_prices cp
    ON CONFLICT (code) DO NOTHING;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function down(db: any) {
  await db.execute(sql`
    UPDATE products
    SET 
      price = 0,
      metadata = '{}'::jsonb,
      updated_at = now()
    WHERE type = 'content'
      AND COALESCE((metadata->>'defaultPriced')::boolean, false) = true
      AND COALESCE((metadata->>'adminPriced')::boolean, false) = false
      AND COALESCE((metadata->>'explicitlyFree')::boolean, false) = false;
  `);
}
