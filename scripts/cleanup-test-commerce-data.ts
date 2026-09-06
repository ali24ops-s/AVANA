/**
 * Cleanup script for Isolated Test Commerce Dataset.
 *
 * Safe & Targeted:
 * - Targets ONLY records created under the test namespace:
 *   - Users: email LIKE 'commerce-test-%'
 *   - Products: code LIKE 'test_prod_%'
 *   - Orders: order_number LIKE 'TEST-%'
 *   - Payments: authority LIKE 'TEST-%'
 *   - Subscriptions & Entitlements for test users
 * - Never modifies or deletes real/production data.
 * - Supports Dry Run mode by default. Pass '--execute' to perform actual deletion.
 */

import { createDbClient } from "../database/client.js";
import * as schema from "../database/schema/index.js";
import { like, inArray, eq } from "drizzle-orm";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

export async function cleanupTestCommerceData(options: { dryRun?: boolean } = {}) {
  const dryRun = options.dryRun !== false && !process.argv.includes("--execute");

  const { db, close } = createDbClient(connectionString);

  console.log("\n=======================================================");
  console.log(`🧹 TEST COMMERCE DATASET CLEANUP ${dryRun ? "(DRY RUN MODE)" : "(EXECUTION MODE)"}`);
  console.log("=======================================================\n");

  try {
    // 1. Identify Test Users
    const testUsers = await db.query.users.findMany({
      where: like(schema.users.email, "commerce-test-%"),
    });
    const testUserIds = testUsers.map((u) => u.id);

    // 2. Identify Test Products
    const testProducts = await db.query.products.findMany({
      where: like(schema.products.code, "test_prod_%"),
    });
    const testProductIds = testProducts.map((p) => p.id);

    // 3. Identify Test Orders
    const testOrders = await db.query.orders.findMany({
      where: like(schema.orders.orderNumber, "TEST-%"),
    });
    const testOrderIds = testOrders.map((o) => o.id);

    // 4. Identify Test Payments
    const testPayments = await db.query.payments.findMany({
      where: like(schema.payments.authority, "TEST-%"),
    });
    const testPaymentIds = testPayments.map((p) => p.id);

    // 5. Identify Test Subscriptions
    const testSubs = testUserIds.length > 0
      ? await db.query.userSubscriptions.findMany({
          where: inArray(schema.userSubscriptions.userId, testUserIds),
        })
      : [];

    // 6. Identify Test Entitlements
    const testEnts = testUserIds.length > 0
      ? await db.query.userEntitlements.findMany({
          where: inArray(schema.userEntitlements.userId, testUserIds),
        })
      : [];

    console.log("📊 IDENTIFIED TEST COMMERCE RECORDS TO BE CLEANED:");
    console.log(`   - Test Users:         ${testUsers.length}`);
    console.log(`   - Test Orders:        ${testOrders.length}`);
    console.log(`   - Test Payments:      ${testPayments.length}`);
    console.log(`   - Test Subscriptions: ${testSubs.length}`);
    console.log(`   - Test Entitlements:  ${testEnts.length}`);
    console.log(`   - Test Products:      ${testProducts.length}`);

    if (dryRun) {
      console.log("\n🔒 DRY RUN MODE COMPLETE: No records were deleted.");
      console.log("   To perform actual deletion, run with '--execute'.\n");
      return {
        dryRun: true,
        counts: {
          users: testUsers.length,
          orders: testOrders.length,
          payments: testPayments.length,
          subscriptions: testSubs.length,
          entitlements: testEnts.length,
          products: testProducts.length,
        },
      };
    }

    // Actual Execution
    console.log("\n🗑️  Executing deletion of test records...");

    if (testUserIds.length > 0) {
      await db.delete(schema.userEntitlements).where(inArray(schema.userEntitlements.userId, testUserIds));
      await db.delete(schema.userSubscriptions).where(inArray(schema.userSubscriptions.userId, testUserIds));
      await db.delete(schema.payments).where(inArray(schema.payments.userId, testUserIds));
      await db.delete(schema.orders).where(inArray(schema.orders.userId, testUserIds));
      await db.delete(schema.users).where(inArray(schema.users.id, testUserIds));
    }

    if (testProductIds.length > 0) {
      await db.delete(schema.products).where(inArray(schema.products.id, testProductIds));
    }

    // Cleanup isolated test course, pack, org if created for test fixtures
    await db.delete(schema.courses).where(eq(schema.courses.name, "دوره تستی فارماکولوژی"));
    await db.delete(schema.contentPacks).where(eq(schema.contentPacks.title, "بسته تستی فارماکوکینتیک"));
    await db.delete(schema.organizations).where(eq(schema.organizations.slug, "test-commerce-fixtures-org"));

    console.log("✅ CLEANUP EXECUTED SUCCESSFULLY: All test commerce records removed.\n");

    return {
      dryRun: false,
      deleted: {
        users: testUsers.length,
        orders: testOrders.length,
        payments: testPayments.length,
        subscriptions: testSubs.length,
        entitlements: testEnts.length,
        products: testProducts.length,
      },
    };
  } finally {
    await close();
  }
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanupTestCommerceData().catch((err) => {
    console.error("❌ Cleanup failed:", err);
    process.exit(1);
  });
}
