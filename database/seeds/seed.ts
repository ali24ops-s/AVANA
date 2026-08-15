/**
 * Synthetic seed data for local development only.
 *
 * Per ADR 0004 and ADR 0003:
 * - Seeds synthetic data only; never production data.
 * - Seeds are idempotent (ON CONFLICT DO NOTHING).
 * - Not used in CI — CI creates its own test data.
 */

import { createDbClient } from "../client.js";
import * as schema from "../schema/index.js";

function localConnectionString(): string {
  const user = "avana";
  const password = "avana";
  const host = "127.0.0.1";
  const port = "5432";
  const db = "avana";
  return `postgres://${user}:${password}@${host}:${port}/${db}`;
}

const connectionString = process.env.DATABASE_URL ?? localConnectionString();

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("ERROR: Development seed script must NOT be run in production.");
    process.exit(1);
  }

  const { db, close } = createDbClient(connectionString);

  try {
    // -----------------------------------------------------------------------
    // Users
    // -----------------------------------------------------------------------
    const [alice] = await db
      .insert(schema.users)
      .values({
        email: "alice@avana.dev",
        name: "Alice Avana",
      })
      .onConflictDoNothing()
      .returning();

    const [bob] = await db
      .insert(schema.users)
      .values({
        email: "bob@avana.dev",
        name: "Bob Builder",
      })
      .onConflictDoNothing()
      .returning();

    // -----------------------------------------------------------------------
    // Organizations
    // -----------------------------------------------------------------------
    const [org] = await db
      .insert(schema.organizations)
      .values({
        name: "Avana Demo University",
        slug: "avana-demo",
      })
      .onConflictDoNothing()
      .returning();

    // -----------------------------------------------------------------------
    // Organization Memberships
    // -----------------------------------------------------------------------
    if (alice && org) {
      await db
        .insert(schema.organizationMemberships)
        .values({
          organizationId: org.id,
          userId: alice.id,
          role: "organization_admin",
        })
        .onConflictDoNothing()
        .returning();
    }

    if (bob && org) {
      await db
        .insert(schema.organizationMemberships)
        .values({
          organizationId: org.id,
          userId: bob.id,
          role: "student",
        })
        .onConflictDoNothing()
        .returning();
    }

    // -----------------------------------------------------------------------
    // Courses
    // -----------------------------------------------------------------------
    if (org) {
      await db
        .insert(schema.courses)
        .values({
          organizationId: org.id,
          name: "Introduction to Biology 101",
          subject: "Biology",
        })
        .onConflictDoNothing()
        .returning();

      await db
        .insert(schema.courses)
        .values({
          organizationId: org.id,
          name: "Advanced Mathematics",
          subject: "Mathematics",
        })
        .onConflictDoNothing()
        .returning();
    }

    console.log("Seed complete \u2014 synthetic data inserted.");
  } catch (error) {
    console.error("Seed failed:", error);
    process.exit(1);
  } finally {
    await close();
  }
}

main();
