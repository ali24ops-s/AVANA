/**
 * Worker Database Seed Script.
 *
 * Seeds the local Worker environment with:
 * 1. A dedicated local organization for the worker
 * 2. A restricted Worker user with role="content_worker" (NEVER "platform_admin")
 * 3. Verified email status so no email challenge blocks the worker
 * 4. Scrypt-hashed password (passed dynamically, never hardcoded in source)
 * 5. Membership in the System Organization as "content_worker" to access standard courses
 *
 * Idempotent: can be run repeatedly without duplicating records or corrupting data.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDbClient } from "../../database/client.js";
import * as schema from "../../database/schema/index.js";
import { validateDatabaseUrlForWorker } from "./worker-env.js";

export interface SeedWorkerOptions {
  workerId: string;
  workerName?: string;
  workerEmail?: string;
  passwordHash: string;
  databaseUrl?: string;
}

export async function seedWorkerData(options: SeedWorkerOptions): Promise<{
  userId: string;
  email: string;
  organizationId: string;
}> {
  const dbUrl =
    options.databaseUrl ||
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

  // Safety first: strictly ensure database is local
  validateDatabaseUrlForWorker(dbUrl);

  const { db, close } = createDbClient(dbUrl);

  const workerId = options.workerId.trim().toLowerCase();
  const workerEmail = (
    options.workerEmail || `worker-${workerId}@avana.local`
  ).trim().toLowerCase();
  const workerName = options.workerName || `Content Worker ${workerId}`;
  const orgSlug = `worker-${workerId}-workspace`;
  const orgName = `محیط کاری ${workerName}`;
  const systemOrgId =
    process.env.SYSTEM_ORGANIZATION_ID ||
    "b4a0b464-16db-4087-92b7-163a1e6f6776";

  const now = new Date();

  try {
    // -------------------------------------------------------------------------
    // 1. Create / Update Local Worker Organization
    // -------------------------------------------------------------------------
    let [org] = await db
      .select({ id: schema.organizations.id })
      .from(schema.organizations)
      .where(eq(schema.organizations.slug, orgSlug))
      .limit(1);

    if (!org) {
      const [insertedOrg] = await db
        .insert(schema.organizations)
        .values({
          id: randomUUID(),
          name: orgName,
          slug: orgSlug,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: schema.organizations.id });
      org = insertedOrg;
    }

    // -------------------------------------------------------------------------
    // 2. Create / Update Worker User with content_worker role (NEVER platform_admin)
    // -------------------------------------------------------------------------
    let [user] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, workerEmail))
      .limit(1);

    if (user) {
      // Update existing worker credentials and ensure restricted role
      await db
        .update(schema.users)
        .set({
          name: workerName,
          passwordHash: options.passwordHash,
          globalRole: "content_worker", // Strictly content_worker, NOT platform_admin
          emailVerifiedAt: now,
          updatedAt: now,
        })
        .where(eq(schema.users.id, user.id));
    } else {
      const [insertedUser] = await db
        .insert(schema.users)
        .values({
          id: randomUUID(),
          email: workerEmail,
          name: workerName,
          passwordHash: options.passwordHash,
          globalRole: "content_worker", // Strictly content_worker, NOT platform_admin
          emailVerifiedAt: now,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: schema.users.id });
      user = insertedUser;
    }

    // -------------------------------------------------------------------------
    // 3. Organization Membership in Local Worker Org
    // -------------------------------------------------------------------------
    if (org && user) {
      await db
        .insert(schema.organizationMemberships)
        .values({
          id: randomUUID(),
          organizationId: org.id,
          userId: user.id,
          role: "content_worker",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
    }

    // -------------------------------------------------------------------------
    // 4. Organization Membership in all existing organizations (Demo Org, System Org)
    // -------------------------------------------------------------------------
    if (user) {
      const allOrgs = await db
        .select({ id: schema.organizations.id })
        .from(schema.organizations);

      for (const targetOrg of allOrgs) {
        await db
          .insert(schema.organizationMemberships)
          .values({
            id: randomUUID(),
            organizationId: targetOrg.id,
            userId: user.id,
            role: "content_worker",
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing();
      }
    }

    return {
      userId: user.id,
      email: workerEmail,
      organizationId: org.id,
    };
  } finally {
    await close();
  }
}
