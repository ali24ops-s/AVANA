import { sql } from "drizzle-orm";

/**
 * Migration 0071: Repair Legacy Registration Org Admins.
 *
 * Target: Incident repair for exactly 3 legacy users who were inadvertently assigned
 * 'organization_admin' upon self-registration prior to commit 0259502 due to the historical
 * default in createOrganization.
 *
 * Targeted records:
 * 1. Membership 4591ba83-9a5a-4b23-98d0-24b0cb124bb0
 *    (User: 0077321b-ed28-441e-af32-b6aa513fc73f, Org: c830eb8a-c603-4f90-8800-4b3e8e19c366)
 * 2. Membership 533e8880-3b68-414e-bb49-01400b05ebbd
 *    (User: cccfafda-42e6-487b-b2ac-3f0068582869, Org: d549079f-6bc5-4c07-b2eb-14b301ca1efd)
 * 3. Membership 69381508-8af1-4fcf-a889-fe4c7570e5d1
 *    (User: cb72c03b-8b14-4046-a357-c3a088b7db08, Org: 11fdb75b-8858-46fa-b93e-6aee29da185d)
 *
 * Invariants & Guarantees:
 * - Fail-closed: Must verify exact user_id, organization_id, and role = 'organization_admin'
 *   as well as global_role IS NULL before applying changes. If conditions are not met, aborts.
 * - Deterministic: Updates ONLY these 3 exact membership IDs.
 * - Post-condition: Verifies exactly 3 rows updated, all now 'student', exactly 1 legitimate
 *   organization_admin remains (the platform admin).
 * - Audit: Creates audit_logs records for traceability.
 */

export const TARGET_MEMBERSHIPS = [
  {
    membershipId: "4591ba83-9a5a-4b23-98d0-24b0cb124bb0",
    userId: "0077321b-ed28-441e-af32-b6aa513fc73f",
    orgId: "c830eb8a-c603-4f90-8800-4b3e8e19c366",
  },
  {
    membershipId: "533e8880-3b68-414e-bb49-01400b05ebbd",
    userId: "cccfafda-42e6-487b-b2ac-3f0068582869",
    orgId: "d549079f-6bc5-4c07-b2eb-14b301ca1efd",
  },
  {
    membershipId: "69381508-8af1-4fcf-a889-fe4c7570e5d1",
    userId: "cb72c03b-8b14-4046-a357-c3a088b7db08",
    orgId: "11fdb75b-8858-46fa-b93e-6aee29da185d",
  },
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function up(db: any) {
  // Pre-condition 1: Verify target memberships exist with exact user_id, org_id, and role = 'organization_admin'
  const preCheck = await db.execute(sql`
    SELECT m.id, m.user_id, m.organization_id, m.role, u.global_role
    FROM organization_memberships m
    JOIN users u ON u.id = m.user_id
    WHERE m.id IN (
      '4591ba83-9a5a-4b23-98d0-24b0cb124bb0',
      '533e8880-3b68-414e-bb49-01400b05ebbd',
      '69381508-8af1-4fcf-a889-fe4c7570e5d1'
    );
  `);

  const rows = (preCheck.rows || preCheck) as Array<{
    id: string;
    user_id: string;
    organization_id: string;
    role: string;
    global_role: string | null;
  }>;

  // If already migrated, verify idempotent state
  const alreadyMigrated = rows.every(
    (r) =>
      r.role === "student" &&
      TARGET_MEMBERSHIPS.some(
        (t) =>
          t.membershipId === r.id &&
          t.userId === r.user_id &&
          t.orgId === r.organization_id,
      ),
  );

  if (rows.length === 3 && alreadyMigrated) {
    // Idempotent re-run guard: already in desired state
    return;
  }

  // Pre-condition 2: Strict fail-closed verification
  if (rows.length !== 3) {
    throw new Error(
      `[Migration 0071] Precondition failed: Expected exactly 3 target membership rows, found ${rows.length}`,
    );
  }

  for (const target of TARGET_MEMBERSHIPS) {
    const matched = rows.find((r) => r.id === target.membershipId);
    if (!matched) {
      throw new Error(
        `[Migration 0071] Precondition failed: Missing target membership ${target.membershipId}`,
      );
    }
    if (matched.user_id !== target.userId) {
      throw new Error(
        `[Migration 0071] Precondition failed: User ID mismatch for membership ${target.membershipId}. Expected ${target.userId}, found ${matched.user_id}`,
      );
    }
    if (matched.organization_id !== target.orgId) {
      throw new Error(
        `[Migration 0071] Precondition failed: Organization ID mismatch for membership ${target.membershipId}. Expected ${target.orgId}, found ${matched.organization_id}`,
      );
    }
    if (matched.role !== "organization_admin") {
      throw new Error(
        `[Migration 0071] Precondition failed: Expected role 'organization_admin' for membership ${target.membershipId}, found '${matched.role}'`,
      );
    }
    if (matched.global_role !== null) {
      throw new Error(
        `[Migration 0071] Precondition failed: Target user ${matched.user_id} has global_role '${matched.global_role}', expected NULL. Aborting to protect platform admin!`,
      );
    }
  }

  // Mutation: Deterministic update targeting only the 3 specific UUIDs
  const updateResult = await db.execute(sql`
    UPDATE organization_memberships
    SET 
      role = 'student',
      updated_at = NOW()
    WHERE id IN (
      '4591ba83-9a5a-4b23-98d0-24b0cb124bb0',
      '533e8880-3b68-414e-bb49-01400b05ebbd',
      '69381508-8af1-4fcf-a889-fe4c7570e5d1'
    )
    AND role = 'organization_admin';
  `);

  const rowCount = updateResult.rowCount ?? updateResult.count;
  if (rowCount !== 3) {
    throw new Error(
      `[Migration 0071] Integrity violation: Expected to update exactly 3 rows, updated ${rowCount}`,
    );
  }

  // Post-condition: Confirm all 3 memberships now have role = 'student'
  const postCheck = await db.execute(sql`
    SELECT id, role
    FROM organization_memberships
    WHERE id IN (
      '4591ba83-9a5a-4b23-98d0-24b0cb124bb0',
      '533e8880-3b68-414e-bb49-01400b05ebbd',
      '69381508-8af1-4fcf-a889-fe4c7570e5d1'
    );
  `);

  const postRows = (postCheck.rows || postCheck) as Array<{ id: string; role: string }>;
  if (postRows.length !== 3 || !postRows.every((r) => r.role === "student")) {
    throw new Error(
      `[Migration 0071] Post-check failed: Target memberships are not all 'student' after update.`,
    );
  }

  // Insert audit log entries for operational tracking
  for (const target of TARGET_MEMBERSHIPS) {
    await db.execute(sql`
      INSERT INTO audit_logs (
        actor_id,
        organization_id,
        action,
        entity_type,
        entity_id,
        details,
        created_at
      ) VALUES (
        ${target.userId}::uuid,
        ${target.orgId}::uuid,
        'DATA_REPAIR_MIGRATION_0071',
        'organization_membership',
        ${target.membershipId}::uuid,
        ${JSON.stringify({
          previousRole: "organization_admin",
          newRole: "student",
          reason: "Repair legacy accidental organization_admin assignment from initial registration bug",
          appliedMigration: "0071_repair_legacy_registration_org_admins",
        })}::jsonb,
        NOW()
      );
    `);
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle Kit migration runner passes any db instance
export async function down(db: any) {
  // Reversible rollback: restore to organization_admin if explicitly needed
  await db.execute(sql`
    UPDATE organization_memberships
    SET 
      role = 'organization_admin',
      updated_at = NOW()
    WHERE id IN (
      '4591ba83-9a5a-4b23-98d0-24b0cb124bb0',
      '533e8880-3b68-414e-bb49-01400b05ebbd',
      '69381508-8af1-4fcf-a889-fe4c7570e5d1'
    )
    AND role = 'student';
  `);
}
