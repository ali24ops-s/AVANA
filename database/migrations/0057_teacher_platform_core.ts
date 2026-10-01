import { sql } from "drizzle-orm";

/**
 * Migration 0057: Teacher Platform Core Schemas.
 *
 * Creates:
 * 1. classrooms
 * 2. classroom_members
 * 3. teacher_exams
 * 4. teacher_exam_questions
 * 5. teacher_exam_attempts
 * 6. teacher_exam_attempt_answers
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle migration runner passes db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Classrooms
    CREATE TABLE IF NOT EXISTS classrooms (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      teacher_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
      title varchar(255) NOT NULL,
      description text,
      invite_code varchar(16) NOT NULL UNIQUE,
      status varchar(20) NOT NULL DEFAULT 'active',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      archived_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_classrooms_org_id ON classrooms (organization_id);
    CREATE INDEX IF NOT EXISTS idx_classrooms_teacher_id ON classrooms (teacher_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_classrooms_invite_code ON classrooms (invite_code);

    -- 2. Classroom Members
    CREATE TABLE IF NOT EXISTS classroom_members (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status varchar(20) NOT NULL DEFAULT 'active',
      first_joined_at timestamptz NOT NULL DEFAULT now(),
      last_joined_at timestamptz NOT NULL DEFAULT now(),
      left_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_classroom_members_lookup ON classroom_members (classroom_id, student_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_classroom_members_active_unique
      ON classroom_members (classroom_id, student_id)
      WHERE status = 'active';

    -- 3. Teacher Exams
    CREATE TABLE IF NOT EXISTS teacher_exams (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      classroom_id uuid NOT NULL REFERENCES classrooms(id) ON DELETE RESTRICT,
      title varchar(255) NOT NULL,
      description text,
      duration_minutes integer NOT NULL,
      starts_at timestamptz NOT NULL,
      ends_at timestamptz NOT NULL,
      passing_score_percentage numeric(5, 2) NOT NULL DEFAULT '60.00',
      shuffle_questions boolean NOT NULL DEFAULT true,
      shuffle_options boolean NOT NULL DEFAULT true,
      show_results_immediately boolean NOT NULL DEFAULT false,
      status varchar(20) NOT NULL DEFAULT 'draft',
      closed_at timestamptz,
      results_released_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      archived_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_teacher_exams_classroom_id ON teacher_exams (classroom_id);
    CREATE INDEX IF NOT EXISTS idx_teacher_exams_status_timing ON teacher_exams (status, starts_at, ends_at);

    -- 4. Teacher Exam Questions
    CREATE TABLE IF NOT EXISTS teacher_exam_questions (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      exam_id uuid NOT NULL REFERENCES teacher_exams(id) ON DELETE CASCADE,
      order_index integer NOT NULL,
      prompt text NOT NULL,
      options jsonb NOT NULL,
      correct_option_id varchar(64) NOT NULL,
      points numeric(5, 2) NOT NULL DEFAULT '1.00',
      explanation text,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_teacher_exam_questions_order ON teacher_exam_questions (exam_id, order_index);

    -- 5. Teacher Exam Attempts
    CREATE TABLE IF NOT EXISTS teacher_exam_attempts (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      exam_id uuid NOT NULL REFERENCES teacher_exams(id) ON DELETE RESTRICT,
      student_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status varchar(20) NOT NULL DEFAULT 'in_progress',
      started_at timestamptz NOT NULL DEFAULT now(),
      deadline_at timestamptz NOT NULL,
      submitted_at timestamptz,
      completed_at timestamptz,
      score numeric(6, 2),
      max_score numeric(6, 2),
      percentage numeric(5, 2),
      passed boolean,
      question_snapshot jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_exam_attempts_single_student ON teacher_exam_attempts (exam_id, student_id);
    CREATE INDEX IF NOT EXISTS idx_exam_attempts_student_id ON teacher_exam_attempts (student_id);
    CREATE INDEX IF NOT EXISTS idx_exam_attempts_exam_status ON teacher_exam_attempts (exam_id, status);

    -- 6. Teacher Exam Attempt Answers
    CREATE TABLE IF NOT EXISTS teacher_exam_attempt_answers (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      attempt_id uuid NOT NULL REFERENCES teacher_exam_attempts(id) ON DELETE CASCADE,
      question_id uuid NOT NULL,
      selected_option_id varchar(64),
      is_correct boolean,
      points_earned numeric(5, 2),
      answered_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_attempt_answers_unique ON teacher_exam_attempt_answers (attempt_id, question_id);
  `);
}
