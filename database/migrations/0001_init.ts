import { sql } from "drizzle-orm";

/**
 * PR-6 baseline migration.
 *
 * Creates the Identity, Tenancy, Courses, and Audit Log tables
 * as defined in database/schema/index.ts.
 *
 * This is a generated-SQL-equivalent migration reviewed as a production artifact
 * per ADR 0003. It is idempotent (IF NOT EXISTS) for safe re-application
 * during development.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function up(db: any) {
  await db.execute(sql`
    -- ============================================================
    -- Identity
    -- ============================================================

    CREATE TABLE IF NOT EXISTS users (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      email varchar(320) NOT NULL,
      name varchar(255) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);

    -- ============================================================
    -- Tenancy
    -- ============================================================

    CREATE TABLE IF NOT EXISTS organizations (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      name varchar(255) NOT NULL,
      slug varchar(100) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_slug ON organizations (slug);

    CREATE TABLE IF NOT EXISTS organization_memberships (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role varchar(50) NOT NULL DEFAULT 'student',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_org_memberships_org_user
      ON organization_memberships (organization_id, user_id);

    CREATE INDEX IF NOT EXISTS idx_org_memberships_org
      ON organization_memberships (organization_id);

    CREATE INDEX IF NOT EXISTS idx_org_memberships_user
      ON organization_memberships (user_id);

    -- ============================================================
    -- Courses
    -- ============================================================

    CREATE TABLE IF NOT EXISTS courses (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      name varchar(255) NOT NULL,
      subject varchar(255),
      exam_date timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    );

    CREATE INDEX IF NOT EXISTS idx_courses_org ON courses (organization_id);

    CREATE TABLE IF NOT EXISTS course_memberships (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role varchar(50) NOT NULL DEFAULT 'student',
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_course_memberships_course_user
      ON course_memberships (course_id, user_id);

    CREATE INDEX IF NOT EXISTS idx_course_memberships_course
      ON course_memberships (course_id);

    CREATE INDEX IF NOT EXISTS idx_course_memberships_user
      ON course_memberships (user_id);

    -- ============================================================
    -- Operations / Audit
    -- ============================================================

    CREATE TABLE IF NOT EXISTS audit_logs (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      actor_id uuid REFERENCES users(id),
      organization_id uuid REFERENCES organizations(id),
      action varchar(100) NOT NULL,
      entity_type varchar(100) NOT NULL,
      entity_id uuid NOT NULL,
      details jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
      ON audit_logs (entity_type, entity_id);

    CREATE INDEX IF NOT EXISTS idx_audit_logs_action
      ON audit_logs (action);

    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
      ON audit_logs (created_at);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes `any` db instance
export async function down(db: any) {
  await db.execute(sql`
    DROP TABLE IF EXISTS audit_logs CASCADE;
    DROP TABLE IF EXISTS course_memberships CASCADE;
    DROP TABLE IF EXISTS courses CASCADE;
    DROP TABLE IF EXISTS organization_memberships CASCADE;
    DROP TABLE IF EXISTS organizations CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
  `);
}
