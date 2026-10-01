import { sql } from "drizzle-orm";

/**
 * Migration 0063: Classroom Assignments and Submissions.
 *
 * Creates:
 * 1. classroom_assignments
 * 2. classroom_assignment_submissions
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Classroom Assignments
    CREATE TABLE IF NOT EXISTS classroom_assignments (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      teacher_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title varchar(255) NOT NULL,
      description text,
      starts_at timestamptz NOT NULL,
      due_at timestamptz NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'draft',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      archived_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_classroom_assignments_classroom_id ON classroom_assignments (classroom_id);
    CREATE INDEX IF NOT EXISTS idx_classroom_assignments_teacher_id ON classroom_assignments (teacher_id);
    CREATE INDEX IF NOT EXISTS idx_classroom_assignments_status_timing ON classroom_assignments (status, starts_at, due_at);

    -- 2. Classroom Assignment Submissions
    CREATE TABLE IF NOT EXISTS classroom_assignment_submissions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      assignment_id uuid NOT NULL REFERENCES classroom_assignments(id) ON DELETE CASCADE,
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      answer_text text NOT NULL DEFAULT '',
      status varchar(20) NOT NULL DEFAULT 'submitted',
      submitted_at timestamptz NOT NULL DEFAULT now(),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_assignment_submissions_single_student ON classroom_assignment_submissions (assignment_id, student_id);
    CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_id ON classroom_assignment_submissions (assignment_id);
    CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student_id ON classroom_assignment_submissions (student_id);
  `);
}
