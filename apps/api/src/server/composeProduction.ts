/**
 * Production Composition Root.
 *
 * Wires Drizzle-backed stores for production runtime.
 * This module is the default composition root for both development
 * and production environments.
 *
 * PR5-B1: Database Runtime Foundation.
 * - Creates Drizzle DB client from config.database.url
 * - Wires all stores with Drizzle implementations
 * - Seeds demo data in development mode only
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDbClient } from "@avana/database/client";
import { modules, lessons } from "@avana/database/schema";
import type { DbClient } from "@avana/database/client";
import { DrizzleSessionStore } from "../modules/identity/drizzle-stores.js";
import { DrizzleUserStore } from "../modules/identity/drizzle-stores.js";
import { DrizzleOrganizationStore } from "../modules/organizations/drizzle-stores.js";
import { DrizzleCourseStore } from "../modules/courses/drizzle-stores.js";
import {
  DrizzleModuleStore,
  DrizzleLessonStore,
  DrizzleProgressStore,
  DrizzleDocumentStore,
  DrizzleDocumentChunkStore,
} from "../modules/learning/drizzle-stores.js";
import {
  DrizzleGeneratedContentStore,
  DrizzleGeneratedContentCitationStore,
  DrizzleGenerationJobStore,
} from "../modules/generation/drizzle-stores.js";
import {
  DrizzleFlashcardStore,
  DrizzleFlashcardReviewStore,
  DrizzleQuizStore,
  DrizzleQuizQuestionStore,
  DrizzleQuizAttemptStore,
} from "../modules/study/drizzle-stores.js";
import {
  createModelGateway,
  BullMqGenerationQueue,
} from "../modules/generation/index.js";
import { DrizzleAuditStore } from "../observability/drizzle-stores.js";
import { AuditService } from "../observability/audit-service.js";
import { LocalStorageProvider } from "../modules/storage/index.js";
import { seedLocalDevData } from "../dev/seed.js";
import type { V1RouteOptions } from "../routes/v1.js";
import type { ApiConfig } from "../config.js";
import type { CourseId } from "@avana/domain";

export interface ProductionDependencies {
  v1Options: V1RouteOptions;
  auditService: AuditService;
  close: () => Promise<void>;
}

/**
 * Seed module and lesson data directly via Drizzle.
 *
 * Per PR5-B1 guidance, the ModuleStore/LessonStore interfaces are not
 * extended for seed convenience. Instead, we seed at the composition
 * root level using the Drizzle client directly.
 */
async function seedModulesAndLessons(
  db: DbClient,
  pharmacologyCourseId: CourseId,
): Promise<{ modules: boolean; lessons: boolean }> {
  const now = new Date();

  // Check if modules already exist for this course
  const existingModules = await db
    .select({ id: modules.id })
    .from(modules)
    .where(eq(modules.courseId, pharmacologyCourseId))
    .limit(1);

  if (existingModules.length > 0) {
    return { modules: false, lessons: false };
  }

  // Seed "Drug Classification & Nomenclature" module
  const module1Id = randomUUID();
  await db.insert(modules).values({
    id: module1Id,
    courseId: pharmacologyCourseId,
    title: "Drug Classification & Nomenclature",
    description:
      "Understanding how drugs are classified, named, and categorized by therapeutic use and chemical structure.",
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
  });

  // Seed lessons for module 1
  await db.insert(lessons).values([
    {
      id: randomUUID(),
      moduleId: module1Id,
      title: "Introduction to Drug Classifications",
      contentType: "markdown",
      contentMarkdown:
        "# Drug Classifications\n\nDrugs are classified in several ways:\n\n## 1. Therapeutic Classification\nBased on the condition they treat:\n- Antihypertensives (treat high blood pressure)\n- Antidiabetics (treat diabetes)\n- Antidepressants (treat depression)\n\n## 2. Pharmacologic Classification\nBased on mechanism of action:\n- Beta-blockers\n- ACE inhibitors\n- Calcium channel blockers\n\n## 3. Chemical Classification\nBased on chemical structure:\n- Benzodiazepines\n- Opioids\n- Statins",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      moduleId: module1Id,
      title: "Generic vs Brand Names",
      contentType: "markdown",
      contentMarkdown:
        "# Generic vs Brand Names\n\nEvery drug has at least three names:\n\n## Chemical Name\nDescribes the molecular structure (e.g., N-acetyl-para-aminophenol).\n\n## Generic Name\nThe official medical name (e.g., acetaminophen).\n\n## Brand Name\nThe proprietary name given by the manufacturer (e.g., Tylenol).\n\n## Key Points\n- Generic drugs are bioequivalent to brand-name drugs\n- Generic names are not capitalized\n- Multiple brands may exist for the same generic drug",
      sortOrder: 2,
      estimatedMinutes: 8,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      moduleId: module1Id,
      title: "Controlled Substances & Schedules",
      contentType: "markdown",
      contentMarkdown:
        "# Controlled Substances & Schedules\n\nThe Controlled Substances Act (CSA) categorizes drugs into schedules based on medical use and abuse potential:\n\n## Schedule I\n- High abuse potential, no accepted medical use\n- Examples: Heroin, LSD, Marijuana (federal classification)\n\n## Schedule II\n- High abuse potential, accepted medical use\n- Examples: Morphine, Oxycodone, Adderall\n\n## Schedule III\n- Moderate abuse potential\n- Examples: Tylenol with Codeine, Ketamine\n\n## Schedule IV\n- Low abuse potential\n- Examples: Xanax, Valium, Ambien\n\n## Schedule V\n- Lowest abuse potential\n- Examples: Cough suppressants with codeine",
      sortOrder: 3,
      estimatedMinutes: 12,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
    },
  ]);

  // Seed "Pharmacokinetics (ADME)" module
  const module2Id = randomUUID();
  await db.insert(modules).values({
    id: module2Id,
    courseId: pharmacologyCourseId,
    title: "Pharmacokinetics (ADME)",
    description:
      "The study of how the body absorbs, distributes, metabolizes, and excretes drugs — the foundation of rational drug therapy.",
    sortOrder: 2,
    createdAt: now,
    updatedAt: now,
  });

  // Seed lessons for module 2
  await db.insert(lessons).values([
    {
      id: randomUUID(),
      moduleId: module2Id,
      title: "Absorption",
      contentType: "markdown",
      contentMarkdown:
        "# Absorption\n\nAbsorption is the process by which a drug enters the bloodstream from its site of administration.\n\n## Routes of Administration\n- **Oral**: Most common, undergoes first-pass metabolism\n- **Intravenous**: 100% bioavailability, rapid onset\n- **Intramuscular**: Moderate absorption rate\n- **Subcutaneous**: Slow, sustained absorption\n- **Transdermal**: Steady absorption over time\n\n## Factors Affecting Absorption\n- Blood flow to the absorption site\n- Solubility of the drug (lipophilic vs hydrophilic)\n- pH of the environment\n- Drug formulation (tablet, liquid, injection)",
      sortOrder: 1,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      moduleId: module2Id,
      title: "Distribution & Metabolism",
      contentType: "markdown",
      contentMarkdown:
        "# Distribution & Metabolism\n\n## Distribution\nDistribution refers to how a drug spreads throughout the body:\n- **Volume of distribution (Vd)**: Theoretical volume needed to contain the drug at the measured plasma concentration\n- **Protein binding**: Many drugs bind to albumin; only unbound drug is pharmacologically active\n- **Blood-brain barrier**: Limits CNS penetration of many drugs\n\n## Metabolism (Biotransformation)\nThe liver is the primary site of drug metabolism:\n\n### Phase I Reactions\n- Oxidation, reduction, hydrolysis\n- Cytochrome P450 enzymes (CYP3A4, CYP2D6, etc.)\n- Often produces active metabolites\n\n### Phase II Reactions\n- Conjugation reactions\n- Glucuronidation, sulfation, acetylation\n- Produces water-soluble compounds for excretion\n\n## Key Concept: First-Pass Effect\nOral drugs absorbed from the GI tract pass through the liver before reaching systemic circulation, reducing bioavailability.",
      sortOrder: 2,
      estimatedMinutes: 15,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: randomUUID(),
      moduleId: module2Id,
      title: "Excretion",
      contentType: "markdown",
      contentMarkdown:
        "# Excretion\n\nExcretion is the process by which drugs and their metabolites are removed from the body.\n\n## Renal Excretion\n- **Glomerular filtration**: Free drug is filtered\n- **Tubular secretion**: Active transport into urine\n- **Tubular reabsorption**: Passive diffusion back into blood\n\n## Other Routes of Excretion\n- **Biliary excretion**: Drugs excreted in bile may be reabsorbed (enterohepatic recirculation)\n- **Pulmonary excretion**: Volatile substances (alcohol, anesthetics)\n- **Mammary excretion**: Drugs excreted in breast milk\n\n## Half-Life (t½)\nThe time required for the drug concentration to decrease by 50%.\n- Determines dosing frequency\n- Affected by organ function (liver, kidney)\n- 5 half-lives to reach steady state",
      sortOrder: 3,
      estimatedMinutes: 10,
      publicationStatus: "published",
      createdAt: now,
      updatedAt: now,
    },
  ]);

  return { modules: true, lessons: true };
}

/**
 * Create all Drizzle-backed stores and wire them into V1RouteOptions.
 *
 * This is the default composition root for all environments.
 * In-memory composition (composeLocalDev) is preserved for test use only.
 */
export async function composeProduction(
  config: ApiConfig,
): Promise<ProductionDependencies> {
  // Create database client
  const { db, close } = createDbClient(config.database.url);

  // Drizzle-backed stores
  const sessionStore = new DrizzleSessionStore(db);
  const userStore = new DrizzleUserStore(db);
  const organizationStore = new DrizzleOrganizationStore(db);
  const courseStore = new DrizzleCourseStore(db);
  const moduleStore = new DrizzleModuleStore(db);
  const lessonStore = new DrizzleLessonStore(db);
  const progressStore = new DrizzleProgressStore(db);
  const documentStore = new DrizzleDocumentStore(db);
  const documentChunkStore = new DrizzleDocumentChunkStore(db);

  // AI generation stores + gateway (mock provider in this PR).
  const generatedContentStore = new DrizzleGeneratedContentStore(db);
  const generatedContentCitationStore =
    new DrizzleGeneratedContentCitationStore(db);
  const generationJobStore = new DrizzleGenerationJobStore(db);
  const gateway = createModelGateway({
    provider: config.generation.aiProvider,
    geminiApiKey: config.generation.geminiApiKey,
    geminiModel: config.generation.geminiModel,
    cloudflareAccountId: config.generation.cloudflareAccountId,
    cloudflareApiToken: config.generation.cloudflareApiToken,
    cloudflareAiModel: config.generation.cloudflareAiModel,
  });

  // BullMQ generation queue (Redis-backed producer).
  const queue = new BullMqGenerationQueue({
    jobStore: generationJobStore,
    connection: { url: config.redis.url },
    queueName: config.generation.queueName,
  });

  // Local filesystem storage for document uploads (dev/single-node).
  const storageProvider = new LocalStorageProvider(
    config.storage.local.directory,
  );

  // Study stores (PR6-7)
  const flashcardStore = new DrizzleFlashcardStore(db);
  const flashcardReviewStore = new DrizzleFlashcardReviewStore(db);
  const quizStore = new DrizzleQuizStore(db);
  const quizQuestionStore = new DrizzleQuizQuestionStore(db);
  const quizAttemptStore = new DrizzleQuizAttemptStore(db);

  const auditStore = new DrizzleAuditStore(db);
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
    documentStore,
    documentChunkStore,
    storageProvider,
    generatedContentStore,
    generatedContentCitationStore,
    generationJobStore,
    queue,
    gateway,
    flashcardStore,
    flashcardReviewStore,
    quizStore,
    quizQuestionStore,
    quizAttemptStore,
    auditService,
  };

  // Seed demo data for development only — not in production
  if (config.nodeEnv === "development") {
    process.stdout.write("[seed] Seed started...\n");
    const seedResult = await seedLocalDevData({
      userStore,
      organizationStore,
      courseStore,
      auditService,
    });

    // After base seed completes, seed modules and lessons directly via Drizzle
    // (not through store interfaces, which don't expose create methods)
    const lastCourse = seedResult.seeded.courses.at(-1);
    const pharmacologyCourseId = lastCourse
      ? ((
          await courseStore.listByOrganization(
            seedResult.organizationId,
            seedResult.userId,
          )
        ).find((c) => c.name === "Pharmacology Basics")?.id ?? null)
      : null;

    let learningSeeded = { modules: false, lessons: false };
    if (pharmacologyCourseId) {
      learningSeeded = await seedModulesAndLessons(
        db,
        pharmacologyCourseId as CourseId,
      );
    }

    process.stdout.write(
      `[seed] User count: ${seedResult.seeded.user ? 1 : 0}, ` +
        `Organization count: ${seedResult.seeded.organization ? 1 : 0}, ` +
        `Course count: ${seedResult.seeded.courses.length}, ` +
        `Modules: ${learningSeeded.modules ? 2 : 0}, ` +
        `Lessons: ${learningSeeded.lessons ? 6 : 0}\n`,
    );
  }

  return { v1Options, auditService, close };
}
