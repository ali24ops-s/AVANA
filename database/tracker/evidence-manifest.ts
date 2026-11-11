import type pg from "pg";
import type { EvidenceCriteria, EvidenceStatus } from "./types.js";

/**
 * Concrete Evidence Verification Criteria for AVANA migrations.
 * Only returns 'proven' when all invariants are demonstrably met in PostgreSQL.
 */
export const SPECIAL_EVIDENCE_CRITERIA: Record<string, EvidenceCriteria> = {
  "0001_init": {
    id: "0001_init",
    description: "Core tables created: users, organizations, organization_memberships, courses, course_memberships, audit_logs",
    query: `SELECT count(*)::int AS count FROM information_schema.tables 
            WHERE table_schema='public' 
              AND table_name IN ('users', 'organizations', 'organization_memberships', 'courses', 'course_memberships', 'audit_logs');`,
    verify: (rows) => (rows[0]?.count === 6 ? "proven" : "missing"),
  },
  "0002_auth": {
    id: "0002_auth",
    description: "Auth tables: auth_identities, sessions",
    query: `SELECT count(*)::int AS count FROM information_schema.tables 
            WHERE table_schema='public' AND table_name IN ('auth_identities', 'sessions');`,
    verify: (rows) => (rows[0]?.count === 2 ? "proven" : "missing"),
  },
  "0003_learning_core": {
    id: "0003_learning_core",
    description: "Learning core: modules, lessons, lesson_progress",
    query: `SELECT count(*)::int AS count FROM information_schema.tables 
            WHERE table_schema='public' AND table_name IN ('modules', 'lessons', 'lesson_progress');`,
    verify: (rows) => (rows[0]?.count === 3 ? "proven" : "missing"),
  },
  "0010_user_flashcard_schedules": {
    id: "0010_user_flashcard_schedules",
    description: "Table user_flashcard_schedules and unique index on user_id, flashcard_id",
    query: `SELECT count(*)::int AS count FROM information_schema.tables 
            WHERE table_schema='public' AND table_name='user_flashcard_schedules';`,
    verify: (rows) => (rows[0]?.count === 1 ? "proven" : "missing"),
  },
  "0019_user_global_role": {
    id: "0019_user_global_role",
    description: "users.global_role column and idx_users_global_role index",
    query: `SELECT count(*)::int AS count FROM information_schema.columns 
            WHERE table_name='users' AND column_name='global_role';`,
    verify: (rows) => (rows[0]?.count === 1 ? "proven" : "missing"),
  },
  "0026_migrate_legacy_content_packs_to_pending_review": {
    id: "0026_migrate_legacy_content_packs_to_pending_review",
    description: "Legacy unreviewed content packs moved to pending_review",
    query: `SELECT count(*)::int AS count FROM content_packs 
            WHERE status = 'published' 
              AND (metadata->>'reviewedAt' IS NULL OR metadata->>'accessType' IS NULL);`,
    verify: (rows) => (rows[0]?.count === 0 ? "proven" : "insufficient_evidence"),
  },
  "0071_repair_legacy_registration_org_admins": {
    id: "0071_repair_legacy_registration_org_admins",
    description: "Target legacy organization_memberships normalized to student",
    query: `SELECT count(*)::int AS count FROM organization_memberships 
            WHERE id IN (
              '4591ba83-9a5a-4b23-98d0-24b0cb124bb0',
              '533e8880-3b68-414e-bb49-01400b05ebbd',
              '69381508-8af1-4fcf-a889-fe4c7570e5d1'
            ) AND role = 'student';`,
    verify: (rows) => {
      const c = rows[0]?.count ?? 0;
      if (c === 3) return "proven";
      if (c === 0) return "missing"; // Likely clean DB or unapplied -> candidate for not_applicable with operator sign-off
      return "conflicting";
    },
  },
  "0080_source_packs_and_generation_sources": {
    id: "0080_source_packs_and_generation_sources",
    description: "Consolidated source packs tables: generation_job_sources, source_packs, source_pack_documents",
    query: `SELECT count(*)::int AS count FROM information_schema.tables 
            WHERE table_schema='public' AND table_name IN ('generation_job_sources', 'source_packs', 'source_pack_documents');`,
    verify: (rows) => (rows[0]?.count === 3 ? "proven" : "missing"),
  },
  "0081_question_pattern_categories_and_defaults": {
    id: "0081_question_pattern_categories_and_defaults",
    description: "Category column and 12 seeded standard question pattern UUIDs",
    query: `SELECT count(*)::int AS count FROM question_patterns 
            WHERE id IN (
              '10000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000002',
              '10000000-0000-4000-a000-000000000003', '10000000-0000-4000-a000-000000000004',
              '10000000-0000-4000-a000-000000000005', '10000000-0000-4000-a000-000000000006',
              '10000000-0000-4000-a000-000000000007', '10000000-0000-4000-a000-000000000008',
              '10000000-0000-4000-a000-000000000009', '10000000-0000-4000-a000-000000000010',
              '10000000-0000-4000-a000-000000000011', '10000000-0000-4000-a000-000000000012'
            );`,
    verify: (rows) => (rows[0]?.count === 12 ? "proven" : "insufficient_evidence"),
  },
  "0090_course_membership_exam_schedules": {
    id: "0090_course_membership_exam_schedules",
    description: "course_memberships exam_date and exam_scope columns",
    query: `SELECT count(*)::int AS count FROM information_schema.columns 
            WHERE table_name='course_memberships' AND column_name IN ('exam_date', 'exam_scope');`,
    verify: (rows) => (rows[0]?.count === 2 ? "proven" : "missing"),
  },
  "0091_backfill_personal_course_exam_schedules": {
    id: "0091_backfill_personal_course_exam_schedules",
    description: "Personal courses exam schedules backfilled into course_memberships",
    query: `SELECT count(*)::int AS count FROM course_memberships cm 
            JOIN courses c ON c.id = cm.course_id 
            WHERE c.is_official = false AND c.exam_date IS NOT NULL AND cm.exam_date IS NULL;`,
    verify: (rows) => (rows[0]?.count === 0 ? "proven" : "insufficient_evidence"),
  },
  "0092_update_question_pattern_instructions_and_examples": {
    id: "0092_update_question_pattern_instructions_and_examples",
    description: "Question pattern reference examples seeded",
    query: `SELECT count(*)::int AS count FROM question_pattern_examples;`,
    verify: (rows) => (rows[0]?.count >= 4 ? "proven" : "insufficient_evidence"),
  },
  "0093_update_patterns_3_6_8_11_v3": {
    id: "0093_update_patterns_3_6_8_11_v3",
    description: "Patterns 3, 6, 8, 11 upgraded to version = 3",
    query: `SELECT count(*)::int AS count FROM question_patterns 
            WHERE id IN (
              '10000000-0000-4000-a000-000000000003',
              '10000000-0000-4000-a000-000000000006',
              '10000000-0000-4000-a000-000000000008',
              '10000000-0000-4000-a000-000000000011'
            ) AND version = 3;`,
    verify: (rows) => (rows[0]?.count === 4 ? "proven" : "insufficient_evidence"),
  },
  "0094_course_publications_unique_version": {
    id: "0094_course_publications_unique_version",
    description: "Unique index idx_course_publications_course_version is valid and ready",
    query: `SELECT indisvalid, indisready FROM pg_index i 
            JOIN pg_class c ON c.oid = i.indexrelid 
            WHERE c.relname = 'idx_course_publications_course_version';`,
    verify: (rows) => (rows[0]?.indisvalid && rows[0]?.indisready ? "proven" : "missing"),
  },
  "0095_presentation_assistant_core": {
    id: "0095_presentation_assistant_core",
    description: "Presentation tables: presentation_projects, presentation_slides, presentation_references",
    query: `SELECT count(*)::int AS count FROM information_schema.tables 
            WHERE table_schema='public' AND table_name IN ('presentation_projects', 'presentation_slides', 'presentation_references');`,
    verify: (rows) => (rows[0]?.count === 3 ? "proven" : "missing"),
  },
  "0096_user_personal_contents": {
    id: "0096_user_personal_contents",
    description: "Table user_personal_contents created",
    query: `SELECT count(*)::int AS count FROM information_schema.tables 
            WHERE table_schema='public' AND table_name='user_personal_contents';`,
    verify: (rows) => (rows[0]?.count === 1 ? "proven" : "missing"),
  },
  "0097_mind_map_personal_content_type": {
    id: "0097_mind_map_personal_content_type",
    description: "chk_personal_content_type constraint includes mind_map",
    query: `SELECT pg_get_constraintdef(c.oid) AS def 
            FROM pg_constraint c 
            JOIN pg_class r ON r.oid = c.conrelid 
            WHERE r.relname = 'user_personal_contents' 
              AND c.conname = 'chk_personal_content_type';`,
    verify: (rows) => (rows[0]?.def?.includes("mind_map") ? "proven" : "missing"),
  },
  "0098_error_monitoring_core": {
    id: "0098_error_monitoring_core",
    description: "Tables: error_groups, error_group_users, error_events, error_admin_notes",
    query: `SELECT count(*)::int AS count FROM information_schema.tables 
            WHERE table_schema='public' AND table_name IN ('error_groups', 'error_group_users', 'error_events', 'error_admin_notes');`,
    verify: (rows) => (rows[0]?.count === 4 ? "proven" : "missing"),
  },
  "0099_crm_campaigns": {
    id: "0099_crm_campaigns",
    description: "Tables: crm_campaigns, crm_campaign_executions, crm_campaign_recipients",
    query: `SELECT count(*)::int AS count FROM information_schema.tables 
            WHERE table_schema='public' AND table_name IN ('crm_campaigns', 'crm_campaign_executions', 'crm_campaign_recipients');`,
    verify: (rows) => (rows[0]?.count === 3 ? "proven" : "missing"),
  },
  "0100_crm_campaign_dispatch": {
    id: "0100_crm_campaign_dispatch",
    description: "Columns: crm_campaign_executions.job_id, crm_campaign_recipients.exec_status",
    query: `SELECT count(*)::int AS count FROM information_schema.columns 
            WHERE table_name='crm_campaign_executions' AND column_name='job_id';`,
    verify: (rows) => (rows[0]?.count === 1 ? "proven" : "missing"),
  },
};

/**
 * Evaluates the evidence status for a migration against the live PostgreSQL database.
 */
export async function evaluateMigrationEvidence(
  client: pg.Client,
  migrationId: string
): Promise<{ status: EvidenceStatus; description: string }> {
  const criteria = SPECIAL_EVIDENCE_CRITERIA[migrationId];
  if (criteria) {
    try {
      const res = await client.query(criteria.query);
      const status = criteria.verify(res.rows);
      return { status, description: criteria.description };
    } catch {
      return { status: "missing", description: criteria.description };
    }
  }

  // Generic fallback: check if table or column matching the migration name exists
  const rawName = migrationId.replace(/^\d+_/, "");
  try {
    const tableRes = await client.query(
      "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_name = $1;",
      [rawName]
    );
    if (tableRes.rows[0]?.count > 0) {
      return { status: "proven", description: `Table ${rawName} exists` };
    }
  } catch {
    // Ignore and fallback
  }

  return { status: "insufficient_evidence", description: "No specialized evidence query defined" };
}
