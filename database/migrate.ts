/* eslint-disable no-console */
import { createDbClient } from "./client.js";
import { up as up0001 } from "./migrations/0001_init.js";
import { up as up0002 } from "./migrations/0002_auth.js";
import { up as up0003 } from "./migrations/0003_learning_core.js";
import { up as up0004 } from "./migrations/0004_lesson_publication.js";
import { up as up0005 } from "./migrations/0005_ai_learning_engine.js";
import { up as up0006 } from "./migrations/0006_generation_idempotency.js";
import { up as up0007 } from "./migrations/0007_generation_jobs.js";
import { up as up0008 } from "./migrations/0008_content_review.js";
import { up as up0009 } from "./migrations/0009_study_consumption.js";
import { up as up0010 } from "./migrations/0010_user_flashcard_schedules.js";
import { up as up0011 } from "./migrations/0011_exams_configuration.js";
import { up as up0012 } from "./migrations/0012_taxonomy_lesson_relations.js";
import { up as up0013 } from "./migrations/0013_document_module_invariant.js";
import { up as up0014 } from "./migrations/0014_email_verification.js";
import { up as up0015 } from "./migrations/0015_study_conversations.js";
import { up as up0016 } from "./migrations/0016_study_sessions.js";
import { up as up0017 } from "./migrations/0017_flashcard_study_sessions.js";
import { up as up0018 } from "./migrations/0018_flashcard_session_reaction_ms.js";
import { up as up0019 } from "./migrations/0019_user_global_role.js";
import { up as up0020 } from "./migrations/0020_document_quality.js";
import { up as up0021 } from "./migrations/0021_content_packs.js";
import { up as up0022 } from "./migrations/0022_decouple_document_content.js";

function localConnectionString(): string {
  const user = "avana";
  const password = "avana";
  const host = "127.0.0.1";
  const port = "5432";
  const db = "avana";
  return `postgres://${user}:${password}@${host}:${port}/${db}`;
}

const connectionString = process.env.DATABASE_URL ?? localConnectionString();

async function runMigrations() {
  console.log("Running AVANA database migrations...");
  const { db, close } = createDbClient(connectionString);

  try {
    console.log("Applying 0001_init...");
    await up0001(db);
    console.log("Applying 0002_auth...");
    await up0002(db);
    console.log("Applying 0003_learning_core...");
    await up0003(db);
    console.log("Applying 0004_lesson_publication...");
    await up0004(db);
    console.log("Applying 0005_ai_learning_engine...");
    await up0005(db);
    console.log("Applying 0006_generation_idempotency...");
    await up0006(db);
    console.log("Applying 0007_generation_jobs...");
    await up0007(db);
    console.log("Applying 0008_content_review...");
    await up0008(db);
    console.log("Applying 0009_study_consumption...");
    await up0009(db);
    console.log("Applying 0010_user_flashcard_schedules...");
    await up0010(db);
    console.log("Applying 0011_exams_configuration...");
    await up0011(db);
    console.log("Applying 0012_taxonomy_lesson_relations...");
    await up0012(db);
    console.log("Applying 0013_document_module_invariant...");
    await up0013(db);
    console.log("Applying 0014_email_verification...");
    await up0014(db);
    console.log("Applying 0015_study_conversations...");
    await up0015(db);
    console.log("Applying 0016_study_sessions...");
    await up0016(db);
    console.log("Applying 0017_flashcard_study_sessions...");
    await up0017(db);
    console.log("Applying 0018_flashcard_session_reaction_ms...");
    await up0018(db);
    console.log("Applying 0019_user_global_role...");
    await up0019(db);
    console.log("Applying 0020_document_quality...");
    await up0020(db);
    console.log("Applying 0021_content_packs...");
    await up0021(db);
    console.log("Applying 0022_decouple_document_content...");
    await up0022(db);

    console.log("All database migrations applied successfully.");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await close();
  }
}

runMigrations();
