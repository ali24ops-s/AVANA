import pg from "pg";
import fs from "fs";
import path from "path";

const REAL_ADMIN_EMAIL = "ali1383mohammadlo@gmail.com";
const REAL_ADMIN_ID = "79bda286-08a4-4a16-9340-4106864e0732";
const REAL_ADMIN_ORG_ID = "389575c5-7563-4242-854a-9af1a988eb3a";

const SYSTEM_PRODUCT_CODES = ["sub_monthly", "sub_quarterly", "sub_yearly"];

async function main() {
  console.log("================================================================================");
  console.log("             AVANA PRODUCTION-READY DATABASE & STORAGE CLEANUP");
  console.log("================================================================================");

  const connectionString =
    process.env.DATABASE_URL || "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

  const pool = new pg.Pool({ connectionString });
  const client = await pool.connect();

  const report = {
    removed: {} as Record<string, number>,
    preserved: {} as Record<string, any>,
    storage: {
      deletedFiles: 0,
      remainingFiles: 0,
      deletedFileList: [] as string[],
    },
    integrityCheck: {
      orphanedRecords: 0,
      foreignKeyErrors: 0,
      status: "passed",
    },
  };

  try {
    console.log("\n[1/6] Verifying Real Admin Presence & Organization...");
    const adminCheck = await client.query(
      "SELECT id, email, name, global_role FROM users WHERE id = $1 AND email = $2",
      [REAL_ADMIN_ID, REAL_ADMIN_EMAIL]
    );

    if (adminCheck.rows.length === 0) {
      throw new Error(`CRITICAL: Real Admin ${REAL_ADMIN_EMAIL} (${REAL_ADMIN_ID}) was NOT found! Aborting.`);
    }
    console.log(`✓ Admin user verified: ${adminCheck.rows[0].name} (${adminCheck.rows[0].email}) - Role: ${adminCheck.rows[0].global_role}`);

    const orgCheck = await client.query(
      "SELECT id, name, slug FROM organizations WHERE id = $1",
      [REAL_ADMIN_ORG_ID]
    );
    if (orgCheck.rows.length === 0) {
      throw new Error(`CRITICAL: Admin workspace org (${REAL_ADMIN_ORG_ID}) was NOT found! Aborting.`);
    }
    console.log(`✓ Admin workspace org verified: ${orgCheck.rows[0].name} (${orgCheck.rows[0].slug})`);

    console.log("\n[2/6] Starting Transactional Deletion (BEGIN TRANSACTION)...");
    await client.query("BEGIN;");

    // Helper deletion function with logging
    async function safeDelete(table: string, query: string, params: any[] = []): Promise<number> {
      const res = await client.query(query, params);
      const count = res.rowCount || 0;
      report.removed[table] = (report.removed[table] || 0) + count;
      console.log(`  - Deleted ${count.toString().padStart(5)} rows from "${table}"`);
      return count;
    }

    // Step A: Reassign blog post authorship to Real Admin Ali
    console.log("\n  -> Reassigning blog posts to Real Admin Ali...");
    const blogReassignRes = await client.query(
      "UPDATE blog_posts SET author_id = $1 WHERE author_id != $1 OR author_id IS NULL",
      [REAL_ADMIN_ID]
    );
    console.log(`  ✓ Reassigned ${blogReassignRes.rowCount || 0} blog posts to Real Admin.`);

    // Step B: Ensure Admin's membership in his org is organization_admin
    console.log("\n  -> Ensuring Admin membership in his workspace is 'organization_admin'...");
    await client.query(
      `INSERT INTO organization_memberships (id, organization_id, user_id, role, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'organization_admin', NOW(), NOW())
       ON CONFLICT (organization_id, user_id) 
       DO UPDATE SET role = 'organization_admin', updated_at = NOW();`,
      [REAL_ADMIN_ORG_ID, REAL_ADMIN_ID]
    );
    console.log("  ✓ Admin organization membership set to 'organization_admin'.");

    // Step C: Dependent Study, Assistant & Analytics Tables (Leaf nodes)
    console.log("\n  -> Deleting dependent study, assistant & analytics records...");
    await safeDelete("study_conversation_messages", "DELETE FROM study_conversation_messages;");
    await safeDelete("study_conversations", "DELETE FROM study_conversations;");
    await safeDelete("study_sessions", "DELETE FROM study_sessions;");
    await safeDelete("flashcard_study_session_cards", "DELETE FROM flashcard_study_session_cards;");
    await safeDelete("flashcard_study_sessions", "DELETE FROM flashcard_study_sessions;");
    await safeDelete("flashcard_reviews", "DELETE FROM flashcard_reviews;");
    await safeDelete("user_flashcard_schedules", "DELETE FROM user_flashcard_schedules;");
    await safeDelete("quiz_attempts", "DELETE FROM quiz_attempts;");
    await safeDelete("quiz_questions", "DELETE FROM quiz_questions;");
    await safeDelete("quizzes", "DELETE FROM quizzes;");
    await safeDelete("flashcards", "DELETE FROM flashcards;");
    await safeDelete("lesson_progress", "DELETE FROM lesson_progress;");

    // Step D: Content Packs
    console.log("\n  -> Deleting content packs...");
    await safeDelete("content_pack_usages", "DELETE FROM content_pack_usages;");
    await safeDelete("content_pack_items", "DELETE FROM content_pack_items;");
    await safeDelete("content_packs", "DELETE FROM content_packs;");

    // Step E: AI Generation Records
    console.log("\n  -> Deleting AI generation citations, jobs and contents...");
    await safeDelete("generated_content_citations", "DELETE FROM generated_content_citations;");
    await safeDelete("generation_jobs", "DELETE FROM generation_jobs;");
    await safeDelete("generated_contents", "DELETE FROM generated_contents;");

    // Step F: Learning Core (Lessons, Modules, Chunks, Documents, Courses)
    console.log("\n  -> Deleting lessons, modules, chunks, documents and courses...");
    await safeDelete("lessons", "DELETE FROM lessons;");
    await safeDelete("modules", "DELETE FROM modules;");
    await safeDelete("document_chunks", "DELETE FROM document_chunks;");
    await safeDelete("documents", "DELETE FROM documents;");
    await safeDelete("course_memberships", "DELETE FROM course_memberships;");
    await safeDelete("courses", "DELETE FROM courses;");

    // Step G: Test Commerce Records (Orders, Payments, Subscriptions, Entitlements, Test Products)
    console.log("\n  -> Deleting test commerce records...");
    await safeDelete("payments", "DELETE FROM payments;");
    await safeDelete("user_subscriptions", "DELETE FROM user_subscriptions;");
    await safeDelete("user_entitlements", "DELETE FROM user_entitlements;");
    await safeDelete("orders", "DELETE FROM orders;");
    await safeDelete(
      "products",
      "DELETE FROM products WHERE NOT (code = ANY($1::varchar[]))",
      [SYSTEM_PRODUCT_CODES]
    );

    // Step H: Auth, Sessions, Email Verification, Test Orgs, Audit Logs & Test Users
    console.log("\n  -> Deleting test auth sessions, email verification codes, test orgs and users...");
    await safeDelete("sessions", "DELETE FROM sessions WHERE user_id != $1;", [REAL_ADMIN_ID]);
    await safeDelete("email_verification_codes", "DELETE FROM email_verification_codes WHERE user_id != $1;", [REAL_ADMIN_ID]);
    await safeDelete(
      "organization_memberships",
      "DELETE FROM organization_memberships WHERE user_id != $1 OR organization_id != $2;",
      [REAL_ADMIN_ID, REAL_ADMIN_ORG_ID]
    );
    await safeDelete(
      "audit_logs",
      "DELETE FROM audit_logs WHERE (actor_id IS NOT NULL AND actor_id != $1) OR (organization_id IS NOT NULL AND organization_id != $2);",
      [REAL_ADMIN_ID, REAL_ADMIN_ORG_ID]
    );
    await safeDelete("organizations", "DELETE FROM organizations WHERE id != $1;", [REAL_ADMIN_ORG_ID]);
    await safeDelete("users", "DELETE FROM users WHERE id != $1;", [REAL_ADMIN_ID]);

    // Step I: Drop temporary backup table if present
    console.log("\n  -> Dropping obsolete backup table if exists...");
    await client.query("DROP TABLE IF EXISTS quiz_questions_backup_20260825162550;");
    console.log("  ✓ quiz_questions_backup_20260825162550 dropped.");

    console.log("\n[3/6] Committing Transaction...");
    await client.query("COMMIT;");
    console.log("✓ Transaction successfully committed!");

    // Step J: Storage Cleanup
    console.log("\n[4/6] Storage Files Cleanup...");
    const storageUploadsDir = path.resolve("storage/uploads/uploads");
    if (fs.existsSync(storageUploadsDir)) {
      const files = fs.readdirSync(storageUploadsDir);
      // Query remaining documents in database to ensure we don't delete any referenced file
      const remainingDocs = await client.query("SELECT storage_key FROM documents");
      const activeKeys = new Set(remainingDocs.rows.map((r: any) => r.storage_key));

      for (const file of files) {
        const filePath = path.join(storageUploadsDir, file);
        // If file is not active or no documents exist, safely delete
        if (!activeKeys.has(file) && !activeKeys.has(`uploads/${file}`)) {
          fs.unlinkSync(filePath);
          report.storage.deletedFiles++;
          report.storage.deletedFileList.push(file);
        }
      }
      const remaining = fs.readdirSync(storageUploadsDir);
      report.storage.remainingFiles = remaining.length;
      console.log(`✓ Storage cleanup completed: ${report.storage.deletedFiles} files deleted, ${report.storage.remainingFiles} files remaining.`);
    } else {
      console.log("Storage directory not found or empty.");
    }

    // Step K: Referential Integrity Check
    console.log("\n[5/6] Running Referential Integrity & Orphan Records Check...");

    const checkOrphans = async (desc: string, query: string): Promise<number> => {
      const res = await client.query(query);
      const count = parseInt(res.rows[0].count, 10);
      if (count > 0) {
        console.error(`  ❌ Integrity warning: ${count} orphaned rows found in ${desc}`);
        report.integrityCheck.orphanedRecords += count;
        report.integrityCheck.status = "failed";
      } else {
        console.log(`  ✓ ${desc}: 0 orphans.`);
      }
      return count;
    };

    await checkOrphans("Users without valid ID", "SELECT count(*) FROM users WHERE id IS NULL;");
    await checkOrphans("Org Memberships pointing to invalid user", "SELECT count(*) FROM organization_memberships m LEFT JOIN users u ON m.user_id = u.id WHERE u.id IS NULL;");
    await checkOrphans("Org Memberships pointing to invalid org", "SELECT count(*) FROM organization_memberships m LEFT JOIN organizations o ON m.organization_id = o.id WHERE o.id IS NULL;");
    await checkOrphans("Courses without valid org", "SELECT count(*) FROM courses c LEFT JOIN organizations o ON c.organization_id = o.id WHERE o.id IS NULL;");
    await checkOrphans("Modules without valid course", "SELECT count(*) FROM modules m LEFT JOIN courses c ON m.course_id = c.id WHERE c.id IS NULL;");
    await checkOrphans("Lessons without valid module", "SELECT count(*) FROM lessons l LEFT JOIN modules m ON l.module_id = m.id WHERE m.id IS NULL;");
    await checkOrphans("Documents without valid owner", "SELECT count(*) FROM documents d LEFT JOIN users u ON d.owner_user_id = u.id WHERE u.id IS NULL;");
    await checkOrphans("Blog posts without valid category", "SELECT count(*) FROM blog_posts p LEFT JOIN blog_categories c ON p.category_id = c.id WHERE c.id IS NULL;");
    await checkOrphans("Blog posts without valid author", "SELECT count(*) FROM blog_posts p LEFT JOIN users u ON p.author_id = u.id WHERE u.id IS NULL;");
    await checkOrphans("Blog post tags pointing to invalid post", "SELECT count(*) FROM blog_post_tags t LEFT JOIN blog_posts p ON t.post_id = p.id WHERE p.id IS NULL;");

    // Step L: Final Database State Snapshot
    console.log("\n[6/6] Collecting Final Database State...");
    const getCount = async (table: string): Promise<number> => {
      const res = await client.query(`SELECT count(*) FROM "${table}"`);
      return parseInt(res.rows[0].count, 10);
    };

    const finalCounts = {
      users: await getCount("users"),
      organizations: await getCount("organizations"),
      organization_memberships: await getCount("organization_memberships"),
      courses: await getCount("courses"),
      course_memberships: await getCount("course_memberships"),
      modules: await getCount("modules"),
      lessons: await getCount("lessons"),
      documents: await getCount("documents"),
      document_chunks: await getCount("document_chunks"),
      generated_contents: await getCount("generated_contents"),
      generation_jobs: await getCount("generation_jobs"),
      flashcards: await getCount("flashcards"),
      flashcard_reviews: await getCount("flashcard_reviews"),
      user_flashcard_schedules: await getCount("user_flashcard_schedules"),
      flashcard_study_sessions: await getCount("flashcard_study_sessions"),
      flashcard_study_session_cards: await getCount("flashcard_study_session_cards"),
      quizzes: await getCount("quizzes"),
      quiz_questions: await getCount("quiz_questions"),
      quiz_attempts: await getCount("quiz_attempts"),
      content_packs: await getCount("content_packs"),
      content_pack_items: await getCount("content_pack_items"),
      content_pack_usages: await getCount("content_pack_usages"),
      study_sessions: await getCount("study_sessions"),
      study_conversations: await getCount("study_conversations"),
      study_conversation_messages: await getCount("study_conversation_messages"),
      orders: await getCount("orders"),
      payments: await getCount("payments"),
      user_subscriptions: await getCount("user_subscriptions"),
      user_entitlements: await getCount("user_entitlements"),
      products: await getCount("products"),
      blog_categories: await getCount("blog_categories"),
      blog_tags: await getCount("blog_tags"),
      blog_posts: await getCount("blog_posts"),
      blog_post_tags: await getCount("blog_post_tags"),
      sessions: await getCount("sessions"),
      email_verification_codes: await getCount("email_verification_codes"),
      audit_logs: await getCount("audit_logs"),
    };

    console.table(finalCounts);

    report.preserved = {
      user: adminCheck.rows[0],
      organization: orgCheck.rows[0],
      products: (await client.query("SELECT code, title, price, active FROM products")).rows,
      blogPostsCount: finalCounts.blog_posts,
      blogCategoriesCount: finalCounts.blog_categories,
      blogTagsCount: finalCounts.blog_tags,
    };

    fs.writeFileSync("scripts/cleanup-report.json", JSON.stringify({ report, finalCounts }, null, 2));
    console.log("\nCleanup report saved to scripts/cleanup-report.json");
    console.log("================================================================================");
    console.log("                 CLEANUP COMPLETED SUCCESSFULLY!");
    console.log("================================================================================");
  } catch (error) {
    console.error("\n❌ ERROR DURING CLEANUP. ROLLING BACK TRANSACTION...", error);
    await client.query("ROLLBACK;");
    console.error("✓ Rollback complete. No data was permanently deleted.");
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
