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

import type { QuizStore, QuizQuestionStore } from "../modules/study/study-store.js";

export interface SeedStores {
  userStore: UserStore;
  organizationStore: OrganizationStore;
  courseStore: CourseStore;
  moduleStore?: ModuleStore;
  lessonStore?: LessonStore;
  quizStore?: QuizStore;
  quizQuestionStore?: QuizQuestionStore;
  auditService: AuditService;
}

const DEMO_USER_EMAIL = "alice@example.com";
const DEMO_ORG_NAME = "AVANA Demo Organization";
const DEMO_COURSES = [
  { name: "شیمی دارویی ۱", subject: "شیمی دارویی" },
  { name: "شیمی دارویی ۲", subject: "شیمی دارویی" },
  { name: "شیمی دارویی ۳", subject: "شیمی دارویی" },
  { name: "فارماسیوتیکس ۱", subject: "فارماسیوتیکس" },
  { name: "فارماسیوتیکس ۲", subject: "فارماسیوتیکس" },
  { name: "فارماسیوتیکس ۳", subject: "فارماسیوتیکس" },
  { name: "فارماسیوتیکس ۴", subject: "فارماسیوتیکس" },
  { name: "فارماسیوتیکس ۵", subject: "فارماسیوتیکس" },
  { name: "بافت شناسی", subject: "علوم پایه" },
  { name: "بیولوژی", subject: "علوم پایه" },
  { name: "سم شناسی", subject: "سم‌شناسی" },
];

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
}

export async function seedLocalDevData(stores: SeedStores): Promise<{
  userId: UserId;
  organizationId: OrganizationId;
  seeded: {
    user: boolean;
    organization: boolean;
    courses: string[];
    modules: boolean;
    lessons: boolean;
    quizzes: boolean;
  };
}> {
  const {
    userStore,
    organizationStore,
    courseStore,
  } = stores;

  const seeded = {
    user: false,
    organization: false,
    courses: [] as string[],
    modules: false,
    lessons: false,
    quizzes: false,
  };

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

    await organizationStore.createWithAdminMembership({
      organization,
      membership,
      auditEvents,
    });

    seeded.organization = true;
  }

  const orgId = organization.id as OrganizationId;

  const updatedCourses = await courseStore.listByOrganization(orgId, aliceId);
  const existingNames = new Set(updatedCourses.map((c) => c.name));

  for (const courseItem of DEMO_COURSES) {
    if (existingNames.has(courseItem.name)) {
      continue;
    }

    const courseId = randomUUID() as CourseId;
    const now = new Date().toISOString();

    const course = {
      id: courseId,
      organizationId: orgId,
      name: courseItem.name,
      subject: courseItem.subject,
      examDate: null as string | null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null as string | null,
    };

    const auditEvents = [
      auditCourseCreated(aliceId, orgId, courseId, courseItem.name, courseItem.subject, null),
    ] as const;

    await courseStore.create({ course, auditEvents });
    seeded.courses.push(courseItem.name);
  }

  return {
    userId: aliceId,
    organizationId: orgId,
    seeded,
  };
}
