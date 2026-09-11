/**
 * Canonical script to create a real test student account for AVANA.
 *
 * Requirements:
 * - Email: student@avana.test
 * - Role: student (global_role: null, organization_membership: student)
 * - Non-admin, no platform_admin or content_worker privileges
 * - Verified email & phone so ProtectedRoute allows full platform navigation
 * - Idempotent & non-destructive: never overwrites existing real accounts
 */

import { randomUUID } from "node:crypto";
import { createDbClient } from "../database/client.js";
import * as schema from "../database/schema/index.js";
import { hashPassword } from "../apps/api/src/modules/identity/password-hasher.js";
import { eq } from "drizzle-orm";

const connectionString =
  process.env.DATABASE_URL ??
  "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

const STUDENT_EMAIL = "student@avana.test";
const STUDENT_PASSWORD = "AvanaStudent2026!";
const STUDENT_NAME = "دانشجوی داروسازی";
const STUDENT_PHONE = "09120000001";
const SYSTEM_ORG_ID = "b4a0b464-16db-4087-92b7-163a1e6f6776";

async function main() {
  const { db, close } = createDbClient(connectionString);

  try {
    console.log("Checking if student account already exists...");
    const existing = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, STUDENT_EMAIL))
      .limit(1);

    if (existing.length > 0) {
      console.log("Account already exists with ID:", existing[0].id);
      return;
    }

    console.log("Hashing password using standard scrypt hasher...");
    const passwordHash = await hashPassword(STUDENT_PASSWORD);

    const now = new Date();
    const userId = randomUUID();

    // 1. Create User
    console.log("Creating user record in users table...");
    const [user] = await db
      .insert(schema.users)
      .values({
        id: userId,
        email: STUDENT_EMAIL,
        name: STUDENT_NAME,
        globalRole: null, // Strictly non-admin
        passwordHash,
        phoneNumber: STUDENT_PHONE,
        emailVerifiedAt: now, // Verified so ProtectedRoute does not force /verify-email
        phoneVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    console.log("User created:", user.id, user.email);

    // 2. Create Personal Organization / Workspace
    const orgId = randomUUID();
    const orgSlug = `student-workspace-${userId.slice(0, 8)}`;
    console.log("Creating personal student organization...");
    const [org] = await db
      .insert(schema.organizations)
      .values({
        id: orgId,
        name: `فضای یادگیری ${STUDENT_NAME}`,
        slug: orgSlug,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    console.log("Organization created:", org.id, org.name);

    // 3. Create Organization Membership with role 'student'
    console.log("Assigning organization membership with role: 'student'...");
    await db.insert(schema.organizationMemberships).values({
      id: randomUUID(),
      organizationId: org.id,
      userId: user.id,
      role: "student",
      createdAt: now,
      updatedAt: now,
    });

    // 4. Enroll in canonical official pharmacy courses so Dashboard and Learning hub are populated
    const officialCourseIds = [
      "18a9cccc-7e89-40ac-a793-716c74bdc330", // فارماکولوژی ۲
      "44533cc4-1302-4f0f-8633-2e571e21f079", // دارو درمانی
    ];

    for (const courseId of officialCourseIds) {
      const courseExists = await db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, courseId))
        .limit(1);

      if (courseExists.length > 0) {
        console.log(`Enrolling student into course: ${courseExists[0].name} (${courseId})...`);
        await db
          .insert(schema.courseMemberships)
          .values({
            id: randomUUID(),
            courseId,
            userId: user.id,
            role: "student",
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing();
      }
    }

    console.log("\nTest Student Account successfully created!");
    console.log("------------------------------------------");
    console.log(`Email:    ${STUDENT_EMAIL}`);
    console.log(`Password: ${STUDENT_PASSWORD}`);
    console.log(`Role:     student`);
    console.log(`Org ID:   ${org.id}`);
    console.log("------------------------------------------");
  } catch (err) {
    console.error("Error creating student account:", err);
    process.exit(1);
  } finally {
    await close();
  }
}

main();
