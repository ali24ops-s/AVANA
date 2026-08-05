/**
 * Development seed data.
 *
 * Populates stores with demo data when NODE_ENV=development.
 * This module is ONLY imported by composeLocalDev.ts and composeProduction.ts
 * and is excluded from production builds via tsconfig.build.json.
 *
 * Idempotent: checks for existing records before creating to prevent
 * duplicates on server restart.
 *
 * Sprint 2 (PR2): Added learning seed data (modules, lessons, progress)
 * for the "Pharmacology Basics" course with realistic pharmacy content.
 *
 * PR5-B1: Refactored to use store interfaces instead of concrete InMemory types.
 */

import { randomUUID } from "node:crypto";
import type { UserId, OrganizationId, CourseId } from "@avana/domain";
import {
  auditOrgCreated,
  auditMembershipCreated,
  auditCourseCreated,
} from "@avana/domain";
import type { UserStore } from "../modules/identity/user-store.js";
import type { OrganizationStore } from "../modules/organizations/organization-store.js";
import type { CourseStore } from "../modules/courses/course-store.js";
import type {
  ModuleStore,
  LessonStore,
} from "../modules/learning/learning-store.js";
import type { AuditService } from "../observability/audit-service.js";

export interface SeedStores {
  userStore: UserStore;
  organizationStore: OrganizationStore;
  courseStore: CourseStore;
  moduleStore?: ModuleStore;
  lessonStore?: LessonStore;
  auditService: AuditService;
}

const DEMO_USER_EMAIL = "alice@example.com";
const DEMO_ORG_NAME = "AVANA Demo Organization";
const DEMO_COURSES = [
  "Pharmacology Basics",
  "Medicinal Chemistry Introduction",
];

/**
 * Generate a slug from an organization name.
 * Mirrors the logic in organization-service.ts without importing it.
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

/**
 * Seed dev bootstrap data into stores.
 *
 * Safe to call multiple times — checks for existing records
 * before creating any new ones.
 *
 * @returns A summary of what was seeded.
 */
export async function seedLocalDevData(stores: SeedStores): Promise<{
  userId: UserId;
  organizationId: OrganizationId;
  seeded: {
    user: boolean;
    organization: boolean;
    courses: string[];
    modules: boolean;
    lessons: boolean;
  };
}> {
  const {
    userStore,
    organizationStore,
    courseStore,
    moduleStore,
    lessonStore,
  } = stores;

  const seeded = {
    user: false,
    organization: false,
    courses: [] as string[],
    modules: false,
    lessons: false,
  };

  // ---------------------------------------------------------------------------
  // 1. Create demo user: alice@example.com
  // ---------------------------------------------------------------------------
  let user = await userStore.findByEmail(DEMO_USER_EMAIL);

  if (!user) {
    user = await userStore.createFromVerifiedIdentity({
      email: DEMO_USER_EMAIL,
      name: "Alice",
      provider: "local",
      providerSubject: `local|${DEMO_USER_EMAIL}`,
    });
    seeded.user = true;
  }

  const aliceId = user.id as UserId;

  // ---------------------------------------------------------------------------
  // 2. Create demo organization: AVANA Demo Organization
  // ---------------------------------------------------------------------------
  const orgSlug = generateSlug(DEMO_ORG_NAME);
  let organization = await organizationStore.findBySlug(orgSlug);

  if (!organization) {
    const organizationId = randomUUID() as OrganizationId;
    const membershipId = randomUUID();
    const createdAt = new Date().toISOString();

    organization = {
      id: organizationId,
      name: DEMO_ORG_NAME,
      slug: orgSlug,
      createdAt,
      updatedAt: createdAt,
      deletedAt: null,
    };

    const membership = {
      id: membershipId,
      organizationId,
      userId: aliceId,
      role: "organization_admin" as const,
      createdAt,
      updatedAt: createdAt,
    };

    const auditEvents = [
      auditOrgCreated(aliceId, organizationId, DEMO_ORG_NAME),
      auditMembershipCreated(
        aliceId,
        organizationId,
        membershipId,
        aliceId,
        membership.role,
      ),
    ] as const;

    // The store atomically persists the organization, its membership, and the
    // audit events in a single transaction. Do NOT emit via AuditService here
    // first: with real foreign keys the audit_logs.organization_id reference
    // would point at a row that does not exist yet, causing an FK violation.
    await organizationStore.createWithAdminMembership({
      organization,
      membership,
      auditEvents,
    });

    seeded.organization = true;
  }

  const orgId = organization.id as OrganizationId;

  // ---------------------------------------------------------------------------
  // 3. Create demo courses
  // ---------------------------------------------------------------------------
  const existingCourses = await courseStore.listByOrganization(orgId, aliceId);
  const existingNames = new Set(existingCourses.map((c) => c.name));

  let pharmacologyCourseId: CourseId | null = null;

  for (const courseName of DEMO_COURSES) {
    if (existingNames.has(courseName)) {
      // Find existing course ID for pharmacology
      const existing = existingCourses.find((c) => c.name === courseName);
      if (existing && courseName === "Pharmacology Basics") {
        pharmacologyCourseId = existing.id as CourseId;
      }
      continue; // idempotent: skip if already exists
    }

    const courseId = randomUUID() as CourseId;
    const now = new Date().toISOString();

    const course = {
      id: courseId,
      organizationId: orgId,
      name: courseName,
      subject: courseName === "Pharmacology Basics" ? "Pharmacy" : null,
      examDate: null as string | null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null as string | null,
    };

    const auditEvents = [
      auditCourseCreated(aliceId, orgId, courseId, courseName, null, null),
    ] as const;

    // courseStore.create atomically persists the course and its audit event
    // in a single transaction, so there is no separate AuditService emit here.
    await courseStore.create({ course, auditEvents });
    seeded.courses.push(courseName);

    if (courseName === "Pharmacology Basics") {
      pharmacologyCourseId = courseId;
    }
  }

  // ---------------------------------------------------------------------------
  // 4. Seed modules and lessons for "Pharmacology Basics"
  // ---------------------------------------------------------------------------
  // NOTE: Module/Lesson seeding via the store interface is handled differently
  // depending on the store implementation. In-memory stores support direct
  // insert() (a test-only method), while Drizzle stores require a proper
  // creation flow. Module/lesson seeding will be fully implemented once the
  // content management endpoints are in place.
  //
  // For now, module and lesson seeding is skipped. Existing in-memory test
  // stores can pre-populate data via their test-specific insert() methods.
  if (pharmacologyCourseId && moduleStore && lessonStore) {
    // Check if modules exist already
    const existingModules =
      await moduleStore.listByCourse(pharmacologyCourseId);

    if (existingModules.length === 0) {
      // Module creation via store interface not yet available.
      // Will be added with content management endpoints.
      seeded.modules = false;
      seeded.lessons = false;
    }
  }

  return {
    userId: aliceId,
    organizationId: orgId,
    seeded,
  };
}
