import { sql } from "drizzle-orm";

/**
 * Migration 0077: Question Pattern Skills & Cognitive Levels Refactor.
 *
 * 1. Adds \`skills\` JSONB column with NOT NULL DEFAULT '[]'::jsonb.
 * 2. Safely maps legacy / domain-specific values in \`cognitive_level\`
 *    (e.g. clinical_reasoning, differential_diagnosis, pharmacotherapy_management, factual_recall)
 *    to pure Bloom taxonomy cognitive levels ('recall', 'understand', 'apply', 'analyze', 'evaluate')
 *    and migrates corresponding skills into the \`skills\` column.
 * 3. Updates default of \`cognitive_level\` to 'recall'.
 * 4. Safe and idempotent.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes \`any\` db instance
export async function up(db: any) {
  await db.execute(sql`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'question_patterns' AND column_name = 'skills'
      ) THEN
        ALTER TABLE question_patterns
          ADD COLUMN skills JSONB NOT NULL DEFAULT '[]'::jsonb;
      END IF;
    END $$;

    -- Legacy backfills:
    -- clinical_reasoning / استدلال بالینی -> analyze + skills: clinical_reasoning, scenario_analysis
    UPDATE question_patterns
    SET
      cognitive_level = 'analyze',
      skills = '["clinical_reasoning", "scenario_analysis"]'::jsonb
    WHERE cognitive_level IN ('clinical_reasoning', 'استدلال بالینی')
      AND (skills IS NULL OR skills = '[]'::jsonb);

    -- differential_diagnosis / تشخیص افتراقی -> analyze + skills: differential_diagnosis
    UPDATE question_patterns
    SET
      cognitive_level = 'analyze',
      skills = '["differential_diagnosis"]'::jsonb
    WHERE cognitive_level IN ('differential_diagnosis', 'تشخیص افتراقی')
      AND (skills IS NULL OR skills = '[]'::jsonb);

    -- pharmacotherapy_management / مدیریت دارودرمانی -> apply + skills: treatment_management
    UPDATE question_patterns
    SET
      cognitive_level = 'apply',
      skills = '["treatment_management"]'::jsonb
    WHERE cognitive_level IN ('pharmacotherapy_management', 'مدیریت دارودرمانی')
      AND (skills IS NULL OR skills = '[]'::jsonb);

    -- factual_recall / یادآوری نکات مستقیم -> recall + skills: direct_recall
    UPDATE question_patterns
    SET
      cognitive_level = 'recall',
      skills = '["direct_recall"]'::jsonb
    WHERE cognitive_level IN ('factual_recall', 'یادآوری نکات مستقیم')
      AND (skills IS NULL OR skills = '[]'::jsonb);

    -- Normalize common Persian labels or variants if present
    UPDATE question_patterns
    SET cognitive_level = 'recall'
    WHERE cognitive_level IN ('یادآوری', 'factual');

    UPDATE question_patterns
    SET cognitive_level = 'understand'
    WHERE cognitive_level IN ('درک', 'درک و تفسیر', 'comprehension');

    UPDATE question_patterns
    SET cognitive_level = 'apply'
    WHERE cognitive_level IN ('کاربرد', 'application');

    UPDATE question_patterns
    SET cognitive_level = 'analyze'
    WHERE cognitive_level IN ('تحلیل', 'analysis');

    UPDATE question_patterns
    SET cognitive_level = 'evaluate'
    WHERE cognitive_level IN ('ارزیابی', 'ارزیابی و قضاوت', 'evaluation');

    -- Update column default from 'clinical_reasoning' to 'recall'
    ALTER TABLE question_patterns
      ALTER COLUMN cognitive_level SET DEFAULT 'recall';
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    ALTER TABLE question_patterns
      ALTER COLUMN cognitive_level SET DEFAULT 'clinical_reasoning';

    ALTER TABLE question_patterns
      DROP COLUMN IF EXISTS skills;
  `);
}
