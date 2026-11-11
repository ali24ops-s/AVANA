import { sql } from "drizzle-orm";

/**
 * Migration 0091: Safe Forward-only Backfill of Personal Course Exam Schedules.
 *
 * Migrates legacy exam schedules stored on personal (non-official) courses
 * directly into the corresponding course_memberships records for the course creator/student.
 *
 * Safety & Isolation Rules:
 * 1. ONLY personal courses (is_official = false) are migrated. Official courses are preserved untouched.
 * 2. Only assigns to the verified creator (via audit_logs course:created actor_id)
 *    or sole enrolled member, strictly preventing cross-tenant / multi-user data leakage.
 * 3. Idempotent: Never overwrites existing course_memberships.exam_date (strictly WHERE cm.exam_date IS NULL).
 * 4. Non-destructive: No data or records are deleted or overwritten.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  // 1. Backfill for courses with verified creator from audit_logs
  await db.execute(sql`
    UPDATE course_memberships cm
    SET exam_date = c.exam_date,
        exam_scope = c.exam_scope,
        updated_at = NOW()
    FROM courses c
    JOIN audit_logs al
      ON al.entity_type = 'course'
     AND al.entity_id = c.id
     AND al.action IN ('course.created', 'course:created')
    WHERE cm.course_id = c.id
      AND cm.user_id = al.actor_id
      AND c.exam_date IS NOT NULL
      AND c.is_official = false
      AND cm.exam_date IS NULL;
  `);

  // 2. Backfill for personal courses without audit log where exactly one membership exists
  await db.execute(sql`
    UPDATE course_memberships cm
    SET exam_date = c.exam_date,
        exam_scope = c.exam_scope,
        updated_at = NOW()
    FROM courses c
    WHERE cm.course_id = c.id
      AND c.exam_date IS NOT NULL
      AND c.is_official = false
      AND cm.exam_date IS NULL
      AND (
        SELECT COUNT(*)
        FROM course_memberships cm_count
        WHERE cm_count.course_id = c.id
      ) = 1;
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(_db: any) {
  // Forward-only migration: Backfilled data belongs to users and should not be wiped.
}
