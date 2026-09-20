import { sql } from "drizzle-orm";

/**
 * Migration 0053: Daily Study Planner V1.
 *
 * Implements:
 * 1. daily_study_plans table (Unique per-user calendar date study plans)
 * 2. study_tasks table (Individual actionable study items belonging to a daily plan)
 *
 * Idempotent (IF NOT EXISTS) for safe re-application.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- 1. Daily Study Plans table
    CREATE TABLE IF NOT EXISTS daily_study_plans (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      plan_date date NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'in_progress',
      target_duration_minutes integer NOT NULL DEFAULT 45,
      completed_duration_minutes integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_study_plans_user_date
      ON daily_study_plans (user_id, plan_date);

    CREATE INDEX IF NOT EXISTS idx_daily_study_plans_user_status
      ON daily_study_plans (user_id, status);

    CREATE INDEX IF NOT EXISTS idx_daily_study_plans_date
      ON daily_study_plans (plan_date);

    -- 2. Study Tasks table
    CREATE TABLE IF NOT EXISTS study_tasks (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      plan_id uuid NOT NULL REFERENCES daily_study_plans(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      task_type varchar(50) NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'pending',
      title varchar(255) NOT NULL,
      description text,
      course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
      module_id uuid REFERENCES modules(id) ON DELETE SET NULL,
      lesson_id uuid REFERENCES lessons(id) ON DELETE SET NULL,
      quiz_id uuid REFERENCES quizzes(id) ON DELETE SET NULL,
      priority integer NOT NULL DEFAULT 0,
      estimated_minutes integer NOT NULL DEFAULT 15,
      completed_at timestamptz,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_study_tasks_plan_priority
      ON study_tasks (plan_id, priority);

    CREATE INDEX IF NOT EXISTS idx_study_tasks_user_status
      ON study_tasks (user_id, status);

    CREATE INDEX IF NOT EXISTS idx_study_tasks_lesson
      ON study_tasks (lesson_id);

    CREATE INDEX IF NOT EXISTS idx_study_tasks_quiz
      ON study_tasks (quiz_id);

    CREATE INDEX IF NOT EXISTS idx_study_tasks_course
      ON study_tasks (course_id);
  `);
}
