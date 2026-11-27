/* eslint-disable no-secrets/no-secrets */
import { describe, expect, test } from "vitest";
import { getTableColumns } from "drizzle-orm";
import * as schema from "../schema/index.js";
import { up as up0107, down as down0107 } from "../migrations/0107_pocket_core.js";
import { ALL_MIGRATIONS } from "../tracker/registry.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../migrations-manifest.json"), "utf-8")
);

describe("AVANA Pocket Phase 1: Database Foundation", () => {
  // -----------------------------------------------------------------------
  // 1. Table definitions - verify all 33 tables are exported
  // -----------------------------------------------------------------------
  describe("33 Pocket Tables Export Verification", () => {
    const pocketTables = [
      { name: "pocketSources", table: schema.pocketSources },
      { name: "pocketEntityVersionRegistry", table: schema.pocketEntityVersionRegistry },
      { name: "pocketStandardUnitConversions", table: schema.pocketStandardUnitConversions },
      { name: "pocketOutbox", table: schema.pocketOutbox },
      { name: "pocketClinicalReviewerCredentials", table: schema.pocketClinicalReviewerCredentials },
      { name: "pocketDrugs", table: schema.pocketDrugs },
      { name: "pocketDiseases", table: schema.pocketDiseases },
      { name: "pocketTreatments", table: schema.pocketTreatments },
      { name: "pocketEmergencies", table: schema.pocketEmergencies },
      { name: "pocketDraftSessions", table: schema.pocketDraftSessions },
      { name: "pocketDraftChanges", table: schema.pocketDraftChanges },
      { name: "pocketReleases", table: schema.pocketReleases },
      { name: "pocketScientificAssertions", table: schema.pocketScientificAssertions },
      { name: "pocketAssertionCitations", table: schema.pocketAssertionCitations },
      { name: "pocketAssertionVerifications", table: schema.pocketAssertionVerifications },
      { name: "pocketClinicalConflicts", table: schema.pocketClinicalConflicts },
      { name: "pocketAssertionAuditLog", table: schema.pocketAssertionAuditLog },
      { name: "pocketDrugDosingRules", table: schema.pocketDrugDosingRules },
      { name: "pocketDrugRenalAdjustments", table: schema.pocketDrugRenalAdjustments },
      { name: "pocketDrugHepaticAdjustments", table: schema.pocketDrugHepaticAdjustments },
      { name: "pocketDrugSafetyProfiles", table: schema.pocketDrugSafetyProfiles },
      { name: "pocketEmergencySteps", table: schema.pocketEmergencySteps },
      { name: "pocketEmergencyMedications", table: schema.pocketEmergencyMedications },
      { name: "pocketDrugInteractions", table: schema.pocketDrugInteractions },
      { name: "pocketDrugDiseaseLinks", table: schema.pocketDrugDiseaseLinks },
      { name: "pocketDiseaseTreatmentLinks", table: schema.pocketDiseaseTreatmentLinks },
      { name: "pocketTreatmentDrugs", table: schema.pocketTreatmentDrugs },
      { name: "pocketSearchAliases", table: schema.pocketSearchAliases },
      { name: "pocketUserNotes", table: schema.pocketUserNotes },
      { name: "pocketUserFavorites", table: schema.pocketUserFavorites },
      { name: "pocketUserHistory", table: schema.pocketUserHistory },
      { name: "pocketSafetyOverrides", table: schema.pocketSafetyOverrides },
      { name: "pocketSafetyOverrideEvents", table: schema.pocketSafetyOverrideEvents },
    ];

    test("All 33 tables are defined and exported", () => {
      expect(pocketTables).toHaveLength(33);
      for (const { name, table } of pocketTables) {
        expect(table, `Table ${name} must be defined`).toBeDefined();
      }
    });
  });

  // -----------------------------------------------------------------------
  // 2. Column Presence and Specific Types
  // -----------------------------------------------------------------------
  describe("Column Presence & Integrity", () => {
    test("pocketScientificAssertions has versioning and root columns", () => {
      const cols = getTableColumns(schema.pocketScientificAssertions);
      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("assertionRootId");
      expect(cols).toHaveProperty("versionNumber");
      expect(cols).toHaveProperty("previousVersionId");
      expect(cols).toHaveProperty("drugId");
      expect(cols).toHaveProperty("diseaseId");
      expect(cols).toHaveProperty("treatmentId");
      expect(cols).toHaveProperty("emergencyId");
      expect(cols).toHaveProperty("assertionType");
      expect(cols).toHaveProperty("assertionKey");
      expect(cols).toHaveProperty("statementText");
      expect(cols).toHaveProperty("status");
      expect(cols).toHaveProperty("releaseId");
      expect(cols).toHaveProperty("createdAt");
      expect(cols).toHaveProperty("updatedAt");
    });

    test("pocketDrugInteractions has canonical ordered drug pair and details", () => {
      const cols = getTableColumns(schema.pocketDrugInteractions);
      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("drugAId");
      expect(cols).toHaveProperty("drugBId");
      expect(cols).toHaveProperty("assertionId");
      expect(cols).toHaveProperty("precipitantDrugId");
      expect(cols).toHaveProperty("objectDrugId");
      expect(cols).toHaveProperty("severity");
      expect(cols).toHaveProperty("clinicalConsequencePersian");
      expect(cols).toHaveProperty("managementActionPersian");
      expect(cols).toHaveProperty("status");
    });

    test("pocketDrugDosingRules has compound FK anchor and dosing bounds", () => {
      const cols = getTableColumns(schema.pocketDrugDosingRules);
      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("drugId");
      expect(cols).toHaveProperty("assertionId");
      expect(cols).toHaveProperty("diseaseId");
      expect(cols).toHaveProperty("regimenStage");
      expect(cols).toHaveProperty("administrationModality");
      expect(cols).toHaveProperty("doseAmountMin");
      expect(cols).toHaveProperty("doseAmountMax");
      expect(cols).toHaveProperty("doseUnit");
      expect(cols).toHaveProperty("instructionsPersian");
      expect(cols).toHaveProperty("status");
    });

    test("pocketClinicalReviewerCredentials has user ID and active status", () => {
      const cols = getTableColumns(schema.pocketClinicalReviewerCredentials);
      expect(cols).toHaveProperty("id");
      expect(cols).toHaveProperty("userId");
      expect(cols).toHaveProperty("medicalLicenseNumber");
      expect(cols).toHaveProperty("specialty");
      expect(cols).toHaveProperty("licensingAuthority");
      expect(cols).toHaveProperty("isActive");
      expect(cols).toHaveProperty("suspendedAt");
      expect(cols).toHaveProperty("licenseExpiresAt");
    });

    test("pocketSafetyOverrides and events have state audit fields", () => {
      const overrideCols = getTableColumns(schema.pocketSafetyOverrides);
      expect(overrideCols).toHaveProperty("id");
      expect(overrideCols).toHaveProperty("targetEntityType");
      expect(overrideCols).toHaveProperty("targetEntityId");
      expect(overrideCols).toHaveProperty("actionState");
      expect(overrideCols).toHaveProperty("isActive");
      expect(overrideCols).toHaveProperty("currentEventId");

      const eventCols = getTableColumns(schema.pocketSafetyOverrideEvents);
      expect(eventCols).toHaveProperty("id");
      expect(eventCols).toHaveProperty("overrideId");
      expect(eventCols).toHaveProperty("eventType");
      expect(eventCols).toHaveProperty("actorUserId");
      expect(eventCols).toHaveProperty("reason");
      expect(eventCols).toHaveProperty("previousState");
      expect(eventCols).toHaveProperty("newState");
      expect(eventCols).toHaveProperty("eventTimestamp");
    });

    test("pocketStandardUnitConversions has factor and unit codes", () => {
      const cols = getTableColumns(schema.pocketStandardUnitConversions);
      expect(cols).toHaveProperty("sourceUnit");
      expect(cols).toHaveProperty("targetUnit");
      expect(cols).toHaveProperty("factor");
      expect(cols).toHaveProperty("isReversible");
      expect(cols).toHaveProperty("dimension");
    });
  });

  // -----------------------------------------------------------------------
  // 3. Migration 0107 DDL Contracts
  // -----------------------------------------------------------------------
  describe("Migration 0107 DDL Contract Verification", () => {
    test("up and down functions are exported", () => {
      expect(typeof up0107).toBe("function");
      expect(typeof down0107).toBe("function");
    });

    const migrationSource = fs.readFileSync(
      path.join(__dirname, "../migrations/0107_pocket_core.ts"),
      "utf-8"
    );

    test("Migration enables btree_gist extension", () => {
      expect(migrationSource).toContain("CREATE EXTENSION IF NOT EXISTS btree_gist;");
    });

    test("Migration implements pre-flight drift detection for all 33 tables", () => {
      expect(migrationSource).toContain("MIGRATION_DRIFT_DETECTED");
      expect(migrationSource).toContain("ERRCODE = '55000'");
      expect(migrationSource).toContain("SELECT 'pocket_sources'");
      expect(migrationSource).toContain("SELECT 'pocket_safety_override_events'");
    });

    test("Compound foreign key anchors and checks exist in migration SQL", () => {
      expect(migrationSource).toContain("uq_assertion_root_version");
      expect(migrationSource).toContain("uq_assertion_drug");
      expect(migrationSource).toContain("uq_assertion_emergency");
      expect(migrationSource).toContain("uq_pocket_dosing_rule_triad");
      expect(migrationSource).toContain("uq_assertion_verification_node");
      expect(migrationSource).toContain("fk_dosing_rule_assertion_drug_match");
      expect(migrationSource).toContain("fk_renal_adj_parent_triad");
      expect(migrationSource).toContain("fk_hepatic_adj_parent_triad");
      expect(migrationSource).toContain("fk_safety_assertion_drug");
      expect(migrationSource).toContain("fk_emergency_step_assertion");
      expect(migrationSource).toContain("fk_emergency_med_assertion");
    });

    test("Arc constraints use PostgreSQL 16 num_nonnulls", () => {
      // Assertion arc
      expect(migrationSource).toContain("num_nonnulls(drug_id, disease_id, treatment_id, emergency_id) = 1");
      // Search alias arc
      expect(migrationSource).toContain("num_nonnulls(drug_id, disease_id, emergency_id) = 1");
      // User notes arc allows <= 1 (attached or standalone)
      expect(migrationSource).toContain("num_nonnulls(drug_id, disease_id, treatment_id, emergency_id) <= 1");
      // User favorites arc
      expect(migrationSource).toContain("num_nonnulls(drug_id, disease_id, treatment_id, emergency_id) = 1");
      // User history arc
      expect(migrationSource).toContain("num_nonnulls(drug_id, disease_id, treatment_id, emergency_id) = 1");
    });

    test("Clinical reviewer partial unique index preserves revoked credentials", () => {
      expect(migrationSource).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_pocket_active_reviewer");
      expect(migrationSource).toContain("WHERE is_active = TRUE;");
    });

    test("Safety override partial unique index enforces single active override per entity", () => {
      expect(migrationSource).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_single_active_override");
      expect(migrationSource).toContain("WHERE is_active = TRUE;");
    });

    test("Interaction canonical order constraint prevents duplicate reversed pairs", () => {
      expect(migrationSource).toContain("chk_interaction_canonical_order CHECK (drug_a_id < drug_b_id)");
    });

    test("Conversion factor positive multiplier constraint", () => {
      expect(migrationSource).toContain("chk_pocket_factor_positive CHECK (factor > 0)");
    });

    test("Dosing magnitude validation check constraints", () => {
      expect(migrationSource).toContain("chk_pocket_dose_magnitudes CHECK");
      expect(migrationSource).toContain("dose_amount_min > 0");
    });

    test("down() function drops tables in reverse order and contains NO CASCADE", () => {
      // Find the down function body in migrationSource
      const downStart = migrationSource.indexOf("export async function down(");
      expect(downStart).toBeGreaterThan(0);
      const downBody = migrationSource.slice(downStart);

      // Strict safety: no CASCADE in rollback!
      expect(downBody).not.toMatch(/DROP\s+TABLE[^\n;]+CASCADE/i);

      // Verify leaf tables are dropped first (e.g. override events before sources)
      const dropSafetyOverride = downBody.indexOf("DROP TABLE IF EXISTS pocket_safety_override_events");
      const dropSources = downBody.indexOf("DROP TABLE IF EXISTS pocket_sources");
      expect(dropSafetyOverride).toBeGreaterThan(0);
      expect(dropSources).toBeGreaterThan(0);
      expect(dropSafetyOverride).toBeLessThan(dropSources);
    });
  });

  // -----------------------------------------------------------------------
  // 4. Tracker Registry and Manifest Verification
  // -----------------------------------------------------------------------
  describe("Tracker Registry & Manifest Sync", () => {
    test("0107_pocket_core is registered in ALL_MIGRATIONS", () => {
      const regEntry = ALL_MIGRATIONS.find((m) => m.id === "0107_pocket_core");
      expect(regEntry).toBeDefined();
      expect(regEntry?.sequence).toBe(107);
      expect(regEntry?.sourceFile).toBe("0107_pocket_core.ts");
      expect(regEntry?.up).toBe(up0107);
    });

    test("0107_pocket_core exists in migrations-manifest.json", () => {
      const manifestEntry = manifest.migrations.find(
        (m: { id: string; sequence: number; source_file: string; dist_file: string; source_sha256: string; dist_sha256: string }) => m.id === "0107_pocket_core"
      );
      expect(manifestEntry).toBeDefined();
      expect(manifestEntry?.sequence).toBe(107);
      expect(manifestEntry?.source_file).toBe("0107_pocket_core.ts");
      expect(manifestEntry?.dist_file).toBe("0107_pocket_core.js");
      expect(manifestEntry?.source_sha256).toHaveLength(64);
      expect(manifestEntry?.dist_sha256).toHaveLength(64);
    });
  });
});
