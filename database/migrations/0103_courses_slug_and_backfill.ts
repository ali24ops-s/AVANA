import { sql } from "drizzle-orm";

/**
 * Migration 0103: SEO-Friendly Course Slugs and Redirects Infrastructure.
 *
 * Implements:
 * 1. courses.slug column:
 *    - URL-friendly lowercase slug for SEO
 *    - Kept stable across course title updates
 * 2. idx_courses_slug partial unique index:
 *    - WHERE deleted_at IS NULL AND slug IS NOT NULL
 *    - Single partial unique index (no redundant inline unique)
 * 3. course_slug_redirects table:
 *    - Records historical slugs when an admin manually modifies a course's slug
 *    - Enables 301 permanent redirects from old slugs to new slugs
 *    - Anti-loop defense & single-hop resolution
 * 4. Deterministic Backfill:
 *    - Explicit slugs for known academic courses
 *    - Stable fallback course-<shortId> for unknown courses
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  // 1. Add slug column to courses table
  await db.execute(sql`
    ALTER TABLE courses ADD COLUMN IF NOT EXISTS slug varchar(255);
  `);

  // 2. Create course_slug_redirects table for preserving historical slugs
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS course_slug_redirects (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      slug varchar(255) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_course_slug_redirects_course
      ON course_slug_redirects (course_id);

    CREATE UNIQUE INDEX IF NOT EXISTS idx_course_slug_redirects_slug
      ON course_slug_redirects (slug);
  `);

  // 3. Authoritative Backfill: Assign clean English slugs to known academic courses.
  // Handles duplicate course names safely using window functions:
  // - Prioritizes official courses (is_official DESC), then earliest created (created_at ASC).
  // - Only the authoritative record (rn = 1) receives the primary clean slug.
  // - Secondary/duplicate courses or non-authoritative rows with the same name are deferred to step 4.
  // - Checks NOT EXISTS to prevent reassigning a slug on retries or when already taken.
  await db.execute(sql`
    WITH mapping(course_name, target_slug) AS (
      VALUES
        ('شیمی دارویی ۱', 'medicinal-chemistry-1'),
        ('شیمی دارویی ۲', 'medicinal-chemistry-2'),
        ('شیمی دارویی ۳', 'medicinal-chemistry-3'),
        ('شیمی دارویی', 'medicinal-chemistry'),
        ('فارماسیوتیکس ۱', 'pharmaceutics-1'),
        ('فارماسیوتیکس ۲', 'pharmaceutics-2'),
        ('فارماسیوتیکس ۳', 'pharmaceutics-3'),
        ('فارماسیوتیکس ۴', 'pharmaceutics-4'),
        ('فارماسیوتیکس ۵', 'pharmaceutics-5'),
        ('فارماسیوتیکس', 'pharmaceutics'),
        ('فارماکولوژی ۱', 'pharmacology-1'),
        ('فارماکولوژی ۲', 'pharmacology-2'),
        ('فارماکولوژی ۳', 'pharmacology-3'),
        ('فارماکولوژی', 'pharmacology'),
        ('بافت شناسی', 'histology'),
        ('بافت‌شناسی', 'histology'),
        ('بیولوژی', 'biology'),
        ('سم شناسی', 'toxicology'),
        ('سم‌شناسی', 'toxicology'),
        ('فیزیولوژی', 'physiology'),
        ('فیزیولوژی ۱', 'physiology-1'),
        ('فیزیولوژی ۲', 'physiology-2'),
        ('بیوشیمی', 'biochemistry'),
        ('آناتومی', 'anatomy'),
        ('آناتومی قلب', 'anatomy-heart'),
        ('ایمونولوژی', 'immunology'),
        ('میکروب شناسی', 'microbiology'),
        ('میکروب‌شناسی', 'microbiology'),
        ('تست نمودار', 'charts-test'),
        ('تست واکنش‌های شیمیایی', 'chemistry-reactions-test')
    ),
    candidates AS (
      SELECT
        c.id,
        m.target_slug,
        ROW_NUMBER() OVER (
          PARTITION BY m.target_slug
          ORDER BY c.is_official DESC, c.created_at ASC
        ) as rn
      FROM courses c
      JOIN mapping m ON c.name = m.course_name
      WHERE c.deleted_at IS NULL
        AND (c.slug IS NULL OR c.slug = '')
        AND NOT EXISTS (
          SELECT 1 FROM courses c2
          WHERE c2.slug = m.target_slug
            AND c2.deleted_at IS NULL
        )
    )
    UPDATE courses
    SET slug = candidates.target_slug
    FROM candidates
    WHERE courses.id = candidates.id
      AND candidates.rn = 1;
  `);

  // 4. Fallback Backfill: Assign deterministic unique slugs to all remaining courses.
  // Generates 'course-<shortId>' using the first 8 hex characters of the course UUID.
  // Collision-proof: If two courses ever share the same 8-char prefix, secondary rows append '-<rn>'.
  await db.execute(sql`
    WITH remaining AS (
      SELECT
        id,
        'course-' || substring(replace(id::text, '-', '') from 1 for 8) AS base_slug,
        ROW_NUMBER() OVER (
          PARTITION BY substring(replace(id::text, '-', '') from 1 for 8)
          ORDER BY created_at ASC
        ) AS rn
      FROM courses
      WHERE slug IS NULL OR slug = ''
    )
    UPDATE courses c
    SET slug = CASE
      WHEN r.rn = 1 THEN r.base_slug
      ELSE r.base_slug || '-' || r.rn
    END
    FROM remaining r
    WHERE c.id = r.id;
  `);

  // 5. Partial unique index on courses (slug) where deleted_at IS NULL AND slug IS NOT NULL.
  // Placed AFTER Backfill steps so all active courses are guaranteed unique, preventing index errors.
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_slug
      ON courses (slug)
      WHERE deleted_at IS NULL AND slug IS NOT NULL;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(_db: any) {
  /**
   * Forward-only migration policy:
   *
   * Following the architectural conventions established across AVANA migrations (e.g. 0091, 0098, 0100, 0102),
   * this migration is forward-only.
   *
   * Architectural Rationale:
   * 1. Dropping `courses.slug` or `course_slug_redirects` in a rollback would irreversibly delete valid slugs
   *    and historical 301 redirects created by administrators and students post-release.
   * 2. Deleting slugs in production would break live URLs indexed by search engines (Google),
   *    shared across social media (Telegram, WhatsApp, Bale), and bookmarked by users.
   * 3. Forward safety: The `up()` function is 100% idempotent and can be safely re-run without data alteration.
   */
}
