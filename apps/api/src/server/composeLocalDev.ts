/**
 * Local Development Composition Root.
 *
 * Wires in-memory stores for local development.
 * This module is ONLY imported when NODE_ENV=development.
 *
 * Sprint 1.5: Enables running the full API locally without a database.
 * Sprint 2: Added learning stores (ModuleStore, LessonStore, ProgressStore).
 */

import { InMemorySessionStore } from "../modules/identity/test/in-memory-stores.js";
import { InMemoryUserStore } from "../modules/identity/test/in-memory-stores.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryCourseStore } from "../modules/courses/test/in-memory-stores.js";
import {
  InMemoryModuleStore,
  InMemoryLessonStore,
  InMemoryProgressStore,
} from "../modules/learning/test/in-memory-stores.js";
import { InMemoryAuditStore } from "../observability/test/in-memory-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { seedLocalDevData } from "../dev/seed.js";
import type { V1RouteOptions } from "../routes/v1.js";
import type { ApiConfig } from "../config.js";

export interface LocalDevDependencies {
  v1Options: V1RouteOptions;
  auditService: AuditService;
}

/**
 * Create all in-memory stores and wire them into V1RouteOptions.
 *
 * This is the development-only composition root. In production,
 * a different composition root would wire Drizzle-backed stores.
 */
export async function composeLocalDev(
  config: ApiConfig,
): Promise<LocalDevDependencies> {
  // In-memory stores
  const sessionStore = new InMemorySessionStore();
  const userStore = new InMemoryUserStore();
  const organizationStore = new InMemoryOrganizationStore();
  const courseStore = new InMemoryCourseStore();
  const moduleStore = new InMemoryModuleStore();
  const lessonStore = new InMemoryLessonStore();
  const progressStore = new InMemoryProgressStore();
  const auditStore = new InMemoryAuditStore();
  const auditService = new AuditService(auditStore);

  const v1Options: V1RouteOptions = {
    config,
    sessionStore,
    userStore,
    organizationStore,
    courseStore,
    moduleStore,
    lessonStore,
    progressStore,
    auditService,
  };

  // Seed demo data for local development — awaited before routes register
  if (config.nodeEnv === "development") {
    process.stdout.write("[seed] Seed started...\n");
    const seedResult = await seedLocalDevData({
      userStore,
      organizationStore,
      courseStore,
      moduleStore,
      lessonStore,
      auditService,
    });
    process.stdout.write(
      `[seed] User count: ${seedResult.seeded.user ? 1 : 0}, ` +
        `Organization count: ${seedResult.seeded.organization ? 1 : 0}, ` +
        `Course count: ${seedResult.seeded.courses.length}\n`,
    );
  }

  return { v1Options, auditService };
}
