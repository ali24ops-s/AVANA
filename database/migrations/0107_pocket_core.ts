import { sql } from "drizzle-orm";

/**
 * Migration 0107: AVANA Pocket Core Database Foundation.
 *
 * Implements the 33 approved tables for AVANA Pocket based on:
 * - AVANA Pocket Architecture Revision v2.0 (Final Freeze)
 * - TDD v1.3 & Architecture Resolution Specification
 *
 * Guarantees:
 * 1. Pre-flight Catalog Check: Detects structural drift on any pre-existing pocket_% tables.
 * 2. Immutable Scientific Assertion Versioning under stable conceptual roots.
 * 3. PostgreSQL 16 num_nonnulls() Arc Checks for exclusive pillar linkage.
 * 4. Partial Unique Index on clinical reviewer credentials for historical credential retention.
 * 5. Compound foreign keys ensuring strict clinical triad invariants (dosing rule, drug, assertion).
 * 6. Non-cascading strict reverse-dependency rollback.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit / custom runner passes any db instance
export async function up(db: any) {
  await db.execute(sql`
    -- -------------------------------------------------------------------------
    -- 0. Pre-Flight Catalog Drift Detection (All 33 Pocket Tables)
    -- -------------------------------------------------------------------------
    DO $$
    DECLARE
      rec RECORD;
    BEGIN
      FOR rec IN (
        SELECT 'pocket_sources' AS t, 'code' AS c UNION ALL
        SELECT 'pocket_sources', 'title' UNION ALL
        SELECT 'pocket_entity_version_registry', 'current_version' UNION ALL
        SELECT 'pocket_standard_unit_conversions', 'factor' UNION ALL
        SELECT 'pocket_outbox', 'lease_token' UNION ALL
        SELECT 'pocket_clinical_reviewer_credentials', 'medical_license_number' UNION ALL
        SELECT 'pocket_drugs', 'slug' UNION ALL
        SELECT 'pocket_diseases', 'slug' UNION ALL
        SELECT 'pocket_treatments', 'slug' UNION ALL
        SELECT 'pocket_emergencies', 'slug' UNION ALL
        SELECT 'pocket_draft_sessions', 'base_release_version' UNION ALL
        SELECT 'pocket_draft_changes', 'payload' UNION ALL
        SELECT 'pocket_releases', 'manifest_checksum' UNION ALL
        SELECT 'pocket_scientific_assertions', 'assertion_root_id' UNION ALL
        SELECT 'pocket_assertion_citations', 'location_reference' UNION ALL
        SELECT 'pocket_assertion_verifications', 'reviewer_user_id' UNION ALL
        SELECT 'pocket_clinical_conflicts', 'conflict_subject' UNION ALL
        SELECT 'pocket_assertion_audit_log', 'actor_user_id' UNION ALL
        SELECT 'pocket_drug_dosing_rules', 'dose_amount_min' UNION ALL
        SELECT 'pocket_drug_renal_adjustments', 'tier_min_ml_min' UNION ALL
        SELECT 'pocket_drug_hepatic_adjustments', 'child_pugh_class' UNION ALL
        SELECT 'pocket_drug_safety_profiles', 'clinical_term' UNION ALL
        SELECT 'pocket_emergency_steps', 'step_order' UNION ALL
        SELECT 'pocket_emergency_medications', 'dose_amount' UNION ALL
        SELECT 'pocket_drug_interactions', 'drug_a_id' UNION ALL
        SELECT 'pocket_drug_disease_links', 'relationship_type' UNION ALL
        SELECT 'pocket_disease_treatment_links', 'line_of_therapy' UNION ALL
        SELECT 'pocket_treatment_drugs', 'dosing_summary' UNION ALL
        SELECT 'pocket_search_aliases', 'normalized_alias' UNION ALL
        SELECT 'pocket_user_notes', 'content_markdown' UNION ALL
        SELECT 'pocket_user_favorites', 'user_id' UNION ALL
        SELECT 'pocket_user_history', 'viewed_at' UNION ALL
        SELECT 'pocket_safety_overrides', 'action_state' UNION ALL
        SELECT 'pocket_safety_override_events', 'actor_user_id'
      ) LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = rec.t) THEN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = rec.t AND column_name = rec.c) THEN
            RAISE EXCEPTION 'MIGRATION_DRIFT_DETECTED: Table % exists but lacks expected column %', rec.t, rec.c USING ERRCODE = '55000';
          END IF;
        END IF;
      END LOOP;
    END $$;

    -- Extension required for btree_gist compound exclusion indexing if needed
    CREATE EXTENSION IF NOT EXISTS btree_gist;

    -- -------------------------------------------------------------------------
    -- 1. pocket_sources
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_sources (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      code VARCHAR(100) NOT NULL UNIQUE,
      title VARCHAR(500) NOT NULL,
      publisher VARCHAR(255) NOT NULL,
      source_type VARCHAR(50) NOT NULL,
      edition_or_version VARCHAR(50) NOT NULL,
      publication_date DATE,
      valid_until_date DATE,
      doi VARCHAR(255),
      canonical_url TEXT,
      license_type VARCHAR(50) NOT NULL DEFAULT 'pending_legal_review',
      reproduction_allowed BOOLEAN NOT NULL DEFAULT FALSE,
      display_scope VARCHAR(50) NOT NULL DEFAULT 'citation_pointer_only',
      storage_scope VARCHAR(50) NOT NULL DEFAULT 'metadata_only',
      last_audited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      audit_status VARCHAR(30) NOT NULL DEFAULT 'pending_legal_review',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pocket_sources_code ON pocket_sources (code);
    CREATE INDEX IF NOT EXISTS idx_pocket_sources_type ON pocket_sources (source_type);
    CREATE INDEX IF NOT EXISTS idx_pocket_sources_status ON pocket_sources (audit_status);

    -- -------------------------------------------------------------------------
    -- 2. pocket_entity_version_registry
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_entity_version_registry (
      aggregate_type VARCHAR(32) NOT NULL,
      aggregate_id VARCHAR(64) NOT NULL,
      current_version BIGINT NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT pk_pocket_version_reg PRIMARY KEY (aggregate_type, aggregate_id)
    );

    -- -------------------------------------------------------------------------
    -- 3. pocket_standard_unit_conversions
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_standard_unit_conversions (
      source_unit VARCHAR(16) NOT NULL,
      target_unit VARCHAR(16) NOT NULL,
      factor NUMERIC(18, 8) NOT NULL,
      is_reversible BOOLEAN NOT NULL DEFAULT TRUE,
      dimension VARCHAR(16) NOT NULL,
      CONSTRAINT pk_pocket_std_unit_conv PRIMARY KEY (source_unit, target_unit),
      CONSTRAINT chk_pocket_factor_positive CHECK (factor > 0)
    );

    -- -------------------------------------------------------------------------
    -- 4. pocket_outbox
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_outbox (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      aggregate_type VARCHAR(32) NOT NULL,
      aggregate_id VARCHAR(64) NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      payload JSONB NOT NULL,
      status VARCHAR(32) NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      lease_expires_at TIMESTAMPTZ,
      lease_token VARCHAR(64),
      last_error VARCHAR(1000),
      global_epoch BIGINT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMPTZ
    );

    CREATE INDEX IF NOT EXISTS idx_pocket_outbox_poll
      ON pocket_outbox (status, next_attempt_at);
    CREATE INDEX IF NOT EXISTS idx_pocket_outbox_expired_leases
      ON pocket_outbox (lease_expires_at);

    -- -------------------------------------------------------------------------
    -- 5. pocket_clinical_reviewer_credentials
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_clinical_reviewer_credentials (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      medical_license_number VARCHAR(64) NOT NULL,
      specialty VARCHAR(128) NOT NULL,
      licensing_authority VARCHAR(128) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      suspended_at TIMESTAMPTZ,
      suspension_reason TEXT,
      granted_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      license_expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_pocket_active_reviewer
      ON pocket_clinical_reviewer_credentials (user_id)
      WHERE is_active = TRUE;
    CREATE INDEX IF NOT EXISTS idx_pocket_reviewer_lookup
      ON pocket_clinical_reviewer_credentials (user_id, is_active);

    -- -------------------------------------------------------------------------
    -- 6. pocket_drugs
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_drugs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(255) NOT NULL UNIQUE,
      generic_name_en VARCHAR(255) NOT NULL,
      generic_name_fa VARCHAR(255) NOT NULL,
      brand_names JSONB NOT NULL DEFAULT '[]'::jsonb,
      drug_class VARCHAR(255) NOT NULL,
      mechanism_of_action TEXT NOT NULL,
      standard_adult_dose_text TEXT,
      pediatric_dose_text TEXT,
      therapeutic_monitoring_text TEXT,
      counseling_points TEXT,
      toxicity_and_overdose_text TEXT,
      organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      version_number INTEGER NOT NULL DEFAULT 1,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pocket_drugs_slug ON pocket_drugs (slug);
    CREATE INDEX IF NOT EXISTS idx_pocket_drugs_name_en ON pocket_drugs (generic_name_en);
    CREATE INDEX IF NOT EXISTS idx_pocket_drugs_status ON pocket_drugs (status);

    -- -------------------------------------------------------------------------
    -- 7. pocket_diseases
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_diseases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(255) NOT NULL UNIQUE,
      title_en VARCHAR(255) NOT NULL,
      title_fa VARCHAR(255) NOT NULL,
      icd10_code VARCHAR(30),
      definition TEXT NOT NULL,
      etiology TEXT,
      pathophysiology TEXT,
      prognosis TEXT,
      clinical_pearls TEXT,
      organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      version_number INTEGER NOT NULL DEFAULT 1,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pocket_diseases_slug ON pocket_diseases (slug);
    CREATE INDEX IF NOT EXISTS idx_pocket_diseases_title_en ON pocket_diseases (title_en);
    CREATE INDEX IF NOT EXISTS idx_pocket_diseases_status ON pocket_diseases (status);

    -- -------------------------------------------------------------------------
    -- 8. pocket_treatments
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_treatments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(255) NOT NULL UNIQUE,
      title_en VARCHAR(255) NOT NULL,
      title_fa VARCHAR(255) NOT NULL,
      treatment_type VARCHAR(50) NOT NULL DEFAULT 'pharmacological',
      non_pharmacological_approach TEXT,
      pharmacological_strategy TEXT NOT NULL,
      efficacy_monitoring TEXT NOT NULL,
      safety_monitoring TEXT NOT NULL,
      guideline_summary TEXT,
      organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      version_number INTEGER NOT NULL DEFAULT 1,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pocket_treatments_slug ON pocket_treatments (slug);
    CREATE INDEX IF NOT EXISTS idx_pocket_treatments_status ON pocket_treatments (status);

    -- -------------------------------------------------------------------------
    -- 9. pocket_emergencies
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_emergencies (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug VARCHAR(255) NOT NULL UNIQUE,
      title_en VARCHAR(255) NOT NULL,
      title_fa VARCHAR(255) NOT NULL,
      condition_type VARCHAR(50) NOT NULL,
      immediate_triage_guidance TEXT NOT NULL,
      referral_and_escalation_criteria TEXT NOT NULL,
      organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      version_number INTEGER NOT NULL DEFAULT 1,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pocket_emergencies_slug ON pocket_emergencies (slug);
    CREATE INDEX IF NOT EXISTS idx_pocket_emergencies_cond ON pocket_emergencies (condition_type);
    CREATE INDEX IF NOT EXISTS idx_pocket_emergencies_status ON pocket_emergencies (status);

    -- -------------------------------------------------------------------------
    -- 10. pocket_draft_sessions
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_draft_sessions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title VARCHAR(255) NOT NULL,
      base_release_version INTEGER NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TIMESTAMPTZ,
      review_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_pocket_draft_status ON pocket_draft_sessions (status);

    -- -------------------------------------------------------------------------
    -- 11. pocket_draft_changes
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_draft_changes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      session_id UUID NOT NULL REFERENCES pocket_draft_sessions(id) ON DELETE CASCADE,
      target_table VARCHAR(100) NOT NULL,
      target_record_id UUID NOT NULL,
      action VARCHAR(20) NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pocket_draft_change_record
      ON pocket_draft_changes (session_id, target_table, target_record_id);

    -- -------------------------------------------------------------------------
    -- 12. pocket_releases
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_releases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      version_number INTEGER NOT NULL UNIQUE,
      parent_release_id UUID REFERENCES pocket_releases(id) ON DELETE RESTRICT,
      draft_session_id UUID REFERENCES pocket_draft_sessions(id) ON DELETE SET NULL,
      schema_version INTEGER NOT NULL DEFAULT 1,
      manifest_checksum VARCHAR(64) NOT NULL,
      manifest JSONB NOT NULL,
      changes_summary JSONB NOT NULL,
      is_rollback BOOLEAN NOT NULL DEFAULT FALSE,
      restored_from_version INTEGER,
      published_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pocket_releases_version ON pocket_releases (version_number);

    -- -------------------------------------------------------------------------
    -- 13. pocket_scientific_assertions (Core Immutable Assertion Versioning)
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_scientific_assertions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assertion_root_id UUID NOT NULL,
      version_number INTEGER NOT NULL DEFAULT 1,
      previous_version_id UUID REFERENCES pocket_scientific_assertions(id) ON DELETE SET NULL,
      drug_id UUID REFERENCES pocket_drugs(id) ON DELETE CASCADE,
      disease_id UUID REFERENCES pocket_diseases(id) ON DELETE CASCADE,
      treatment_id UUID REFERENCES pocket_treatments(id) ON DELETE CASCADE,
      emergency_id UUID REFERENCES pocket_emergencies(id) ON DELETE CASCADE,
      assertion_type VARCHAR(50) NOT NULL,
      assertion_key VARCHAR(150) NOT NULL,
      statement_text TEXT NOT NULL,
      jurisdiction VARCHAR(50) NOT NULL DEFAULT 'global',
      target_population VARCHAR(100) NOT NULL DEFAULT 'general_adult',
      clinical_setting VARCHAR(100) NOT NULL DEFAULT 'all',
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      release_id UUID REFERENCES pocket_releases(id) ON DELETE RESTRICT,
      valid_until_date DATE,
      superseded_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_pocket_assertion_arc CHECK (
        num_nonnulls(drug_id, disease_id, treatment_id, emergency_id) = 1
      )
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_assertion_root_version
      ON pocket_scientific_assertions (assertion_root_id, version_number);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_assertion_drug
      ON pocket_scientific_assertions (id, drug_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_assertion_disease
      ON pocket_scientific_assertions (id, disease_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_assertion_treatment
      ON pocket_scientific_assertions (id, treatment_id);
    CREATE UNIQUE INDEX IF NOT EXISTS uq_assertion_emergency
      ON pocket_scientific_assertions (id, emergency_id);
    CREATE INDEX IF NOT EXISTS idx_pocket_assertion_status
      ON pocket_scientific_assertions (status);
    CREATE INDEX IF NOT EXISTS idx_pocket_assertion_release
      ON pocket_scientific_assertions (release_id);

    -- -------------------------------------------------------------------------
    -- 14. pocket_assertion_citations
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_assertion_citations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assertion_id UUID NOT NULL REFERENCES pocket_scientific_assertions(id) ON DELETE CASCADE,
      source_id UUID NOT NULL REFERENCES pocket_sources(id) ON DELETE RESTRICT,
      location_reference TEXT NOT NULL,
      source_snapshot_url TEXT,
      source_content_hash VARCHAR(64),
      accessed_at DATE NOT NULL,
      evidence_grade VARCHAR(50),
      verified_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_pocket_cit_assertion_source
      ON pocket_assertion_citations (assertion_id, source_id);
    CREATE INDEX IF NOT EXISTS idx_pocket_cit_status
      ON pocket_assertion_citations (status);

    -- -------------------------------------------------------------------------
    -- 15. pocket_assertion_verifications
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_assertion_verifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assertion_id UUID NOT NULL REFERENCES pocket_scientific_assertions(id) ON DELETE RESTRICT,
      reviewer_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      verification_action VARCHAR(50) NOT NULL,
      clinical_review_notes TEXT NOT NULL,
      parent_verification_id UUID,
      verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_assertion_verification_node
      ON pocket_assertion_verifications (id, assertion_id);

    -- -------------------------------------------------------------------------
    -- 16. pocket_clinical_conflicts
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_clinical_conflicts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conflict_subject VARCHAR(255) NOT NULL,
      assertion_a_id UUID NOT NULL REFERENCES pocket_scientific_assertions(id) ON DELETE CASCADE,
      assertion_b_id UUID NOT NULL REFERENCES pocket_scientific_assertions(id) ON DELETE CASCADE,
      discrepancy_description TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active_discrepancy',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_pocket_conflict_pair
      ON pocket_clinical_conflicts (assertion_a_id, assertion_b_id);

    -- -------------------------------------------------------------------------
    -- 17. pocket_assertion_audit_log
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_assertion_audit_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assertion_id UUID NOT NULL REFERENCES pocket_scientific_assertions(id) ON DELETE RESTRICT,
      actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      action VARCHAR(32) NOT NULL,
      previous_status VARCHAR(32),
      new_status VARCHAR(32) NOT NULL,
      clinical_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_pocket_assertion_audit_assertion
      ON pocket_assertion_audit_log (assertion_id, created_at);

    -- -------------------------------------------------------------------------
    -- 18. pocket_drug_dosing_rules
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_drug_dosing_rules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      drug_id UUID NOT NULL REFERENCES pocket_drugs(id) ON DELETE CASCADE,
      assertion_id UUID NOT NULL,
      disease_id UUID REFERENCES pocket_diseases(id) ON DELETE RESTRICT,
      regimen_stage VARCHAR(50) NOT NULL,
      administration_modality VARCHAR(50) NOT NULL,
      dosing_basis VARCHAR(30) NOT NULL DEFAULT 'fixed',
      dose_amount_min NUMERIC(12, 4) NOT NULL,
      dose_amount_max NUMERIC(12, 4),
      dose_unit VARCHAR(30) NOT NULL,
      per_weight_unit VARCHAR(20),
      per_bsa_unit VARCHAR(20),
      target_auc_value NUMERIC(6, 2),
      gfr_cap_ml_min NUMERIC(6, 2),
      infusion_rate_value_min NUMERIC(10, 4),
      infusion_rate_value_max NUMERIC(10, 4),
      infusion_rate_unit VARCHAR(50),
      dilution_min_conc_mg_ml NUMERIC(10, 4),
      dilution_max_conc_mg_ml NUMERIC(10, 4),
      compatible_diluents JSONB DEFAULT '["D5W", "NS"]'::jsonb,
      route VARCHAR(50) NOT NULL,
      frequency VARCHAR(50) NOT NULL,
      schedule_type VARCHAR(30) NOT NULL DEFAULT 'standard',
      cycle_days_on INTEGER,
      cycle_days_off INTEGER,
      prn_min_interval_hours NUMERIC(5, 2),
      prn_max_doses_per_24h INTEGER,
      prn_max_daily_amount NUMERIC(12, 4),
      max_single_dose_amount NUMERIC(12, 4),
      max_daily_dose_amount NUMERIC(12, 4),
      titration_step_amount NUMERIC(12, 4),
      titration_interval_days INTEGER,
      titration_target_dose NUMERIC(12, 4),
      treatment_duration_days_min INTEGER,
      treatment_duration_days_max INTEGER,
      population_tier VARCHAR(50) NOT NULL DEFAULT 'adult',
      pregnancy_trimester VARCHAR(50) NOT NULL DEFAULT 'all',
      lactation_compatibility VARCHAR(50) NOT NULL DEFAULT 'compatible',
      age_months_min INTEGER,
      age_years_max INTEGER,
      weight_kg_min NUMERIC(6, 2),
      weight_kg_max NUMERIC(6, 2),
      instructions_persian TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uq_pocket_dosing_rule_triad UNIQUE (id, drug_id, assertion_id),
      CONSTRAINT fk_dosing_rule_assertion_drug_match FOREIGN KEY (assertion_id, drug_id)
        REFERENCES pocket_scientific_assertions(id, drug_id) ON DELETE RESTRICT,
      CONSTRAINT chk_pocket_dose_magnitudes CHECK (
        dose_amount_min > 0 AND
        (dose_amount_max IS NULL OR dose_amount_max >= dose_amount_min) AND
        (max_single_dose_amount IS NULL OR max_single_dose_amount >= dose_amount_min) AND
        (max_daily_dose_amount IS NULL OR (
          max_single_dose_amount IS NOT NULL AND
          max_daily_dose_amount >= max_single_dose_amount
        ))
      )
    );

    CREATE INDEX IF NOT EXISTS idx_pocket_dosing_drug ON pocket_drug_dosing_rules (drug_id);
    CREATE INDEX IF NOT EXISTS idx_pocket_dosing_status ON pocket_drug_dosing_rules (status);

    -- -------------------------------------------------------------------------
    -- 19. pocket_drug_renal_adjustments
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_drug_renal_adjustments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dosing_rule_id UUID NOT NULL,
      drug_id UUID NOT NULL,
      assertion_id UUID NOT NULL,
      metric_type VARCHAR(30) NOT NULL DEFAULT 'crcl',
      tier_min_ml_min NUMERIC(6, 2) NOT NULL,
      tier_max_ml_min NUMERIC(6, 2) NOT NULL,
      dialysis_setting VARCHAR(30) NOT NULL DEFAULT 'none',
      adjustment_type VARCHAR(50) NOT NULL,
      adjusted_dose_amount NUMERIC(12, 4),
      adjusted_dose_unit VARCHAR(30),
      adjusted_frequency VARCHAR(50),
      percentage_of_normal_dose NUMERIC(5, 2),
      dialysis_supplement_notes TEXT,
      clinical_guidance_persian TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_renal_adj_parent_triad FOREIGN KEY (dosing_rule_id, drug_id, assertion_id)
        REFERENCES pocket_drug_dosing_rules(id, drug_id, assertion_id) ON DELETE CASCADE,
      CONSTRAINT chk_renal_range_valid CHECK (
        tier_min_ml_min < tier_max_ml_min AND tier_min_ml_min >= 0
      )
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_renal_rule_metric_tier
      ON pocket_drug_renal_adjustments (dosing_rule_id, metric_type, tier_min_ml_min, tier_max_ml_min, dialysis_setting);
    CREATE INDEX IF NOT EXISTS idx_pocket_renal_status
      ON pocket_drug_renal_adjustments (status);

    -- -------------------------------------------------------------------------
    -- 20. pocket_drug_hepatic_adjustments
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_drug_hepatic_adjustments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      dosing_rule_id UUID NOT NULL,
      drug_id UUID NOT NULL,
      assertion_id UUID NOT NULL,
      child_pugh_class VARCHAR(20) NOT NULL,
      adjustment_action VARCHAR(50) NOT NULL,
      percentage_dose_reduction NUMERIC(5, 2),
      clinical_guidance_persian TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_hepatic_adj_parent_triad FOREIGN KEY (dosing_rule_id, drug_id, assertion_id)
        REFERENCES pocket_drug_dosing_rules(id, drug_id, assertion_id) ON DELETE CASCADE,
      CONSTRAINT chk_pocket_hepatic_reduction CHECK (
        percentage_dose_reduction >= 0.00 AND percentage_dose_reduction <= 100.00
      )
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_hepatic_rule_child_pugh
      ON pocket_drug_hepatic_adjustments (dosing_rule_id, child_pugh_class);
    CREATE INDEX IF NOT EXISTS idx_pocket_hepatic_status
      ON pocket_drug_hepatic_adjustments (status);

    -- -------------------------------------------------------------------------
    -- 21. pocket_drug_safety_profiles
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_drug_safety_profiles (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      drug_id UUID NOT NULL REFERENCES pocket_drugs(id) ON DELETE CASCADE,
      assertion_id UUID NOT NULL,
      profile_type VARCHAR(50) NOT NULL,
      clinical_term VARCHAR(255) NOT NULL,
      meddra_code VARCHAR(50),
      severity VARCHAR(30),
      incidence_pct_min NUMERIC(5, 2),
      incidence_pct_max NUMERIC(5, 2),
      clinical_management_notes TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_safety_assertion_drug FOREIGN KEY (assertion_id, drug_id)
        REFERENCES pocket_scientific_assertions(id, drug_id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_pocket_safety_drug_type
      ON pocket_drug_safety_profiles (drug_id, profile_type);
    CREATE INDEX IF NOT EXISTS idx_pocket_safety_status
      ON pocket_drug_safety_profiles (status);

    -- -------------------------------------------------------------------------
    -- 22. pocket_emergency_steps
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_emergency_steps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      emergency_id UUID NOT NULL REFERENCES pocket_emergencies(id) ON DELETE CASCADE,
      assertion_id UUID NOT NULL,
      step_order INTEGER NOT NULL,
      action_title VARCHAR(255) NOT NULL,
      action_details TEXT NOT NULL,
      target_time_window_minutes INTEGER,
      is_critical_immediate BOOLEAN NOT NULL DEFAULT FALSE,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_emergency_step_assertion FOREIGN KEY (assertion_id, emergency_id)
        REFERENCES pocket_scientific_assertions(id, emergency_id) ON DELETE RESTRICT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pocket_em_steps_order
      ON pocket_emergency_steps (emergency_id, step_order);
    CREATE INDEX IF NOT EXISTS idx_pocket_em_steps_status
      ON pocket_emergency_steps (status);

    -- -------------------------------------------------------------------------
    -- 23. pocket_emergency_medications
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_emergency_medications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      emergency_id UUID NOT NULL REFERENCES pocket_emergencies(id) ON DELETE CASCADE,
      drug_id UUID NOT NULL REFERENCES pocket_drugs(id) ON DELETE CASCADE,
      assertion_id UUID NOT NULL,
      step_order INTEGER NOT NULL DEFAULT 1,
      dose_amount NUMERIC(10, 2) NOT NULL,
      dose_unit VARCHAR(30) NOT NULL,
      route VARCHAR(50) NOT NULL,
      administration_rate VARCHAR(100),
      dilution_instructions TEXT,
      max_emergency_dose TEXT,
      critical_precautions TEXT,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT fk_emergency_med_assertion FOREIGN KEY (assertion_id, emergency_id)
        REFERENCES pocket_scientific_assertions(id, emergency_id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_pocket_em_meds
      ON pocket_emergency_medications (emergency_id, drug_id);
    CREATE INDEX IF NOT EXISTS idx_pocket_em_meds_status
      ON pocket_emergency_medications (status);

    -- -------------------------------------------------------------------------
    -- 24. pocket_drug_interactions
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_drug_interactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      drug_a_id UUID NOT NULL REFERENCES pocket_drugs(id) ON DELETE CASCADE,
      drug_b_id UUID NOT NULL REFERENCES pocket_drugs(id) ON DELETE CASCADE,
      assertion_id UUID NOT NULL REFERENCES pocket_scientific_assertions(id) ON DELETE RESTRICT,
      precipitant_drug_id UUID REFERENCES pocket_drugs(id) ON DELETE CASCADE,
      object_drug_id UUID REFERENCES pocket_drugs(id) ON DELETE CASCADE,
      severity VARCHAR(30) NOT NULL,
      mechanism_type VARCHAR(50),
      clinical_consequence_persian TEXT NOT NULL,
      management_action_persian TEXT NOT NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'draft',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_interaction_canonical_order CHECK (drug_a_id < drug_b_id),
      CONSTRAINT chk_distinct_precipitant_object CHECK (
        precipitant_drug_id IS NULL OR object_drug_id IS NULL OR precipitant_drug_id <> object_drug_id
      )
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pocket_interaction_ordered_pair
      ON pocket_drug_interactions (drug_a_id, drug_b_id, assertion_id);
    CREATE INDEX IF NOT EXISTS idx_pocket_interaction_status
      ON pocket_drug_interactions (status);

    -- -------------------------------------------------------------------------
    -- 25. pocket_drug_disease_links
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_drug_disease_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      drug_id UUID NOT NULL REFERENCES pocket_drugs(id) ON DELETE CASCADE,
      disease_id UUID NOT NULL REFERENCES pocket_diseases(id) ON DELETE CASCADE,
      assertion_id UUID REFERENCES pocket_scientific_assertions(id) ON DELETE RESTRICT,
      relationship_type VARCHAR(30) NOT NULL,
      clinical_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pocket_dd_link_unique
      ON pocket_drug_disease_links (drug_id, disease_id, relationship_type);
    CREATE INDEX IF NOT EXISTS idx_pocket_dd_drug ON pocket_drug_disease_links (drug_id);
    CREATE INDEX IF NOT EXISTS idx_pocket_dd_disease ON pocket_drug_disease_links (disease_id);

    -- -------------------------------------------------------------------------
    -- 26. pocket_disease_treatment_links
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_disease_treatment_links (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      disease_id UUID NOT NULL REFERENCES pocket_diseases(id) ON DELETE CASCADE,
      treatment_id UUID NOT NULL REFERENCES pocket_treatments(id) ON DELETE CASCADE,
      line_of_therapy VARCHAR(30) NOT NULL,
      is_standard_of_care BOOLEAN NOT NULL DEFAULT TRUE,
      clinical_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_pocket_dt_link_unique
      ON pocket_disease_treatment_links (disease_id, treatment_id);

    -- -------------------------------------------------------------------------
    -- 27. pocket_treatment_drugs
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_treatment_drugs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      treatment_id UUID NOT NULL REFERENCES pocket_treatments(id) ON DELETE CASCADE,
      drug_id UUID NOT NULL REFERENCES pocket_drugs(id) ON DELETE CASCADE,
      assertion_id UUID REFERENCES pocket_scientific_assertions(id) ON DELETE RESTRICT,
      line_of_therapy VARCHAR(30) NOT NULL,
      priority_order INTEGER NOT NULL DEFAULT 1,
      dosing_summary TEXT NOT NULL,
      clinical_notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_pocket_td_pair
      ON pocket_treatment_drugs (treatment_id, drug_id);

    -- -------------------------------------------------------------------------
    -- 28. pocket_search_aliases
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_search_aliases (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      drug_id UUID REFERENCES pocket_drugs(id) ON DELETE CASCADE,
      disease_id UUID REFERENCES pocket_diseases(id) ON DELETE CASCADE,
      emergency_id UUID REFERENCES pocket_emergencies(id) ON DELETE CASCADE,
      raw_alias VARCHAR(255) NOT NULL,
      normalized_alias VARCHAR(255) NOT NULL,
      alias_type VARCHAR(50) NOT NULL,
      language VARCHAR(10) NOT NULL DEFAULT 'en',
      priority_weight INTEGER NOT NULL DEFAULT 100,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_pocket_alias_arc CHECK (
        num_nonnulls(drug_id, disease_id, emergency_id) = 1
      )
    );

    CREATE INDEX IF NOT EXISTS idx_pocket_alias_norm
      ON pocket_search_aliases (normalized_alias);

    -- -------------------------------------------------------------------------
    -- 29. pocket_user_notes
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_user_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      drug_id UUID REFERENCES pocket_drugs(id) ON DELETE CASCADE,
      disease_id UUID REFERENCES pocket_diseases(id) ON DELETE CASCADE,
      treatment_id UUID REFERENCES pocket_treatments(id) ON DELETE CASCADE,
      emergency_id UUID REFERENCES pocket_emergencies(id) ON DELETE CASCADE,
      title VARCHAR(255),
      content_markdown TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_pocket_notes_arc CHECK (
        num_nonnulls(drug_id, disease_id, treatment_id, emergency_id) <= 1
      )
    );

    CREATE INDEX IF NOT EXISTS idx_pocket_notes_user_created
      ON pocket_user_notes (user_id, created_at);

    -- -------------------------------------------------------------------------
    -- 30. pocket_user_favorites
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_user_favorites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      drug_id UUID REFERENCES pocket_drugs(id) ON DELETE CASCADE,
      disease_id UUID REFERENCES pocket_diseases(id) ON DELETE CASCADE,
      treatment_id UUID REFERENCES pocket_treatments(id) ON DELETE CASCADE,
      emergency_id UUID REFERENCES pocket_emergencies(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_pocket_fav_arc CHECK (
        num_nonnulls(drug_id, disease_id, treatment_id, emergency_id) = 1
      )
    );

    CREATE INDEX IF NOT EXISTS idx_pocket_fav_user
      ON pocket_user_favorites (user_id);

    -- -------------------------------------------------------------------------
    -- 31. pocket_user_history
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_user_history (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      drug_id UUID REFERENCES pocket_drugs(id) ON DELETE CASCADE,
      disease_id UUID REFERENCES pocket_diseases(id) ON DELETE CASCADE,
      treatment_id UUID REFERENCES pocket_treatments(id) ON DELETE CASCADE,
      emergency_id UUID REFERENCES pocket_emergencies(id) ON DELETE CASCADE,
      viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_pocket_history_arc CHECK (
        num_nonnulls(drug_id, disease_id, treatment_id, emergency_id) = 1
      )
    );

    CREATE INDEX IF NOT EXISTS idx_pocket_history_user_time
      ON pocket_user_history (user_id, viewed_at);

    -- -------------------------------------------------------------------------
    -- 32. pocket_safety_overrides
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_safety_overrides (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      target_entity_type VARCHAR(50) NOT NULL,
      target_entity_id UUID NOT NULL,
      action_state VARCHAR(50) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      current_event_id UUID,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_single_active_override
      ON pocket_safety_overrides (target_entity_type, target_entity_id)
      WHERE is_active = TRUE;
    CREATE INDEX IF NOT EXISTS idx_safety_override_lookup
      ON pocket_safety_overrides (target_entity_type, target_entity_id, is_active);

    -- -------------------------------------------------------------------------
    -- 33. pocket_safety_override_events
    -- -------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS pocket_safety_override_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      override_id UUID NOT NULL REFERENCES pocket_safety_overrides(id) ON DELETE CASCADE,
      event_type VARCHAR(50) NOT NULL,
      target_entity_type VARCHAR(50) NOT NULL,
      target_entity_id UUID NOT NULL,
      actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      reason TEXT NOT NULL,
      previous_state VARCHAR(50),
      new_state VARCHAR(50) NOT NULL,
      event_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_override_events_override_id
      ON pocket_safety_override_events (override_id, event_timestamp);
  `);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit / custom runner passes any db instance
export async function down(db: any) {
  await db.execute(sql`
    -- Strict reverse dependency ordering without CASCADE to prevent dropping non-pocket objects
    DROP TABLE IF EXISTS pocket_safety_override_events;
    DROP TABLE IF EXISTS pocket_safety_overrides;
    DROP TABLE IF EXISTS pocket_user_history;
    DROP TABLE IF EXISTS pocket_user_favorites;
    DROP TABLE IF EXISTS pocket_user_notes;
    DROP TABLE IF EXISTS pocket_search_aliases;
    DROP TABLE IF EXISTS pocket_treatment_drugs;
    DROP TABLE IF EXISTS pocket_disease_treatment_links;
    DROP TABLE IF EXISTS pocket_drug_disease_links;
    DROP TABLE IF EXISTS pocket_drug_interactions;
    DROP TABLE IF EXISTS pocket_emergency_medications;
    DROP TABLE IF EXISTS pocket_emergency_steps;
    DROP TABLE IF EXISTS pocket_drug_safety_profiles;
    DROP TABLE IF EXISTS pocket_drug_hepatic_adjustments;
    DROP TABLE IF EXISTS pocket_drug_renal_adjustments;
    DROP TABLE IF EXISTS pocket_drug_dosing_rules;
    DROP TABLE IF EXISTS pocket_assertion_audit_log;
    DROP TABLE IF EXISTS pocket_clinical_conflicts;
    DROP TABLE IF EXISTS pocket_assertion_verifications;
    DROP TABLE IF EXISTS pocket_assertion_citations;
    DROP TABLE IF EXISTS pocket_scientific_assertions;
    DROP TABLE IF EXISTS pocket_releases;
    DROP TABLE IF EXISTS pocket_draft_changes;
    DROP TABLE IF EXISTS pocket_draft_sessions;
    DROP TABLE IF EXISTS pocket_emergencies;
    DROP TABLE IF EXISTS pocket_treatments;
    DROP TABLE IF EXISTS pocket_diseases;
    DROP TABLE IF EXISTS pocket_drugs;
    DROP TABLE IF EXISTS pocket_clinical_reviewer_credentials;
    DROP TABLE IF EXISTS pocket_outbox;
    DROP TABLE IF EXISTS pocket_standard_unit_conversions;
    DROP TABLE IF EXISTS pocket_entity_version_registry;
    DROP TABLE IF EXISTS pocket_sources;
  `);
}
