/**
 * Seed script for Isolated Standard Test Commerce Dataset.
 *
 * Implements the 12 mandatory test scenarios for the AVANA Commerce & Monetization Admin Panel:
 * 1. Active Monthly
 * 2. Active Quarterly
 * 3. Active Yearly
 * 4. Expired Subscription
 * 5. No Subscription
 * 6. Failed Payment
 * 7. Pending Order
 * 8. Cancelled Order
 * 9. Lifetime Course Purchase
 * 10. Content Pack Purchase
 * 11. Admin Grant
 * 12. Multiple Purchases
 *
 * Safe & Idempotent:
 * - Operates strictly within the 'commerce-test-*' and 'TEST-*' namespace.
 * - Never modifies or deletes real users, orders, payments, or subscriptions.
 * - Conforms to schema foreign keys and check constraints.
 */

import { createDbClient } from "../database/client.js";
import * as schema from "../database/schema/index.js";
import { eq, sql, inArray } from "drizzle-orm";

const connectionString =
  process.env.DATABASE_URL ||
  "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

export async function seedTestCommerceData(dbClient?: ReturnType<typeof createDbClient>["db"]) {
  let internalClient: ReturnType<typeof createDbClient> | null = null;
  let db = dbClient;
  if (!db) {
    internalClient = createDbClient(connectionString);
    db = internalClient.db;
  }

  console.log("\n=======================================================");
  console.log("🌱 STARTING ISOLATED COMMERCE TEST DATASET SEEDING");
  console.log("=======================================================\n");

  try {
    const now = new Date();

    // -------------------------------------------------------------------------
    // 1. Resolve or Create Standard & Test Products
    // -------------------------------------------------------------------------
    console.log("📦 1. Verifying standard and test products...");

    // Standard subscription products check
    const subMonthly = await db.query.products.findFirst({
      where: eq(schema.products.code, "sub_monthly"),
    });
    const subQuarterly = await db.query.products.findFirst({
      where: eq(schema.products.code, "sub_quarterly"),
    });
    const subYearly = await db.query.products.findFirst({
      where: eq(schema.products.code, "sub_yearly"),
    });

    if (!subMonthly || !subQuarterly || !subYearly) {
      throw new Error("Standard subscription products (sub_monthly, sub_quarterly, sub_yearly) must exist in DB.");
    }

    // Resolve an existing course & content pack, or create isolated test entities
    let targetCourse = await db.query.courses.findFirst();
    if (!targetCourse) {
      let org = await db.query.organizations.findFirst();
      if (!org) {
        const [newOrg] = await db
          .insert(schema.organizations)
          .values({
            name: "Test Commerce Fixtures Org",
            slug: "test-commerce-fixtures-org",
          })
          .returning();
        org = newOrg;
      }

      const [newCourse] = await db
        .insert(schema.courses)
        .values({
          organizationId: org.id,
          name: "دوره تستی فارماکولوژی",
          subject: "فارماکولوژی",
          status: "published",
        })
        .returning();
      targetCourse = newCourse;
    }

    let targetPack = await db.query.contentPacks.findFirst();
    if (!targetPack) {
      const [newPack] = await db
        .insert(schema.contentPacks)
        .values({
          title: "بسته تستی فارماکوکینتیک",
          subject: "فارماسیوتیکس",
          status: "published",
        })
        .returning();
      targetPack = newPack;
    }

    console.log(`   - Selected Course for test: "${targetCourse.name}" (${targetCourse.id})`);
    console.log(`   - Selected Content Pack for test: "${targetPack.title}" (${targetPack.id})`);

    // Insert or update course test product
    const [courseProduct] = await db
      .insert(schema.products)
      .values({
        code: "test_prod_course_pharmacology",
        type: "course",
        title: `خرید دائمی ${targetCourse.name}`,
        description: "دسترسی مادام‌العمر به محتوا و مباحث دوره تستی",
        price: 350000,
        currency: "toman",
        targetType: "course",
        targetId: targetCourse.id,
        durationDays: null,
        active: true,
        metadata: { isTest: true },
      })
      .onConflictDoUpdate({
        target: schema.products.code,
        set: {
          title: `خرید دائمی ${targetCourse.name}`,
          targetId: targetCourse.id,
          price: 350000,
          active: true,
          updatedAt: now,
        },
      })
      .returning();

    // Insert or update content pack test product
    const [packProduct] = await db
      .insert(schema.products)
      .values({
        code: "test_prod_pack_pharmacokinetics",
        type: "content_pack",
        title: `بسته آموزشی ${targetPack.title}`,
        description: "خرید دائمی بسته محتوایی تستی",
        price: 149000,
        currency: "toman",
        targetType: "content_pack",
        targetId: targetPack.id,
        durationDays: null,
        active: true,
        metadata: { isTest: true },
      })
      .onConflictDoUpdate({
        target: schema.products.code,
        set: {
          title: `بسته آموزشی ${targetPack.title}`,
          targetId: targetPack.id,
          price: 149000,
          active: true,
          updatedAt: now,
        },
      })
      .returning();

    console.log(`   - Test Course Product: ${courseProduct.code} (${courseProduct.id})`);
    console.log(`   - Test Pack Product: ${packProduct.code} (${packProduct.id})`);

    // -------------------------------------------------------------------------
    // 2. Define 12 Test Users
    // -------------------------------------------------------------------------
    console.log("\n👥 2. Upserting 12 test users...");

    const testUsersDef = [
      { email: "commerce-test-01-active-monthly@test.avana.dev", name: "کاربر تست ۰۱ (اشتراک فعال ماهانه)" },
      { email: "commerce-test-02-active-quarterly@test.avana.dev", name: "کاربر تست ۰۲ (اشتراک فعال سه‌ماهه)" },
      { email: "commerce-test-03-active-yearly@test.avana.dev", name: "کاربر تست ۰۳ (اشتراک فعال سالانه)" },
      { email: "commerce-test-04-expired-subscription@test.avana.dev", name: "کاربر تست ۰۴ (اشتراک منقضی)" },
      { email: "commerce-test-05-no-subscription@test.avana.dev", name: "کاربر تست ۰۵ (بدون اشتراک و خرید)" },
      { email: "commerce-test-06-failed-payment@test.avana.dev", name: "کاربر تست ۰۶ (پرداخت ناموفق)" },
      { email: "commerce-test-07-pending-order@test.avana.dev", name: "کاربر تست ۰۷ (سفارش در انتظار پرداخت)" },
      { email: "commerce-test-08-cancelled-order@test.avana.dev", name: "کاربر تست ۰۸ (سفارش لغو شده)" },
      { email: "commerce-test-09-lifetime-course@test.avana.dev", name: "کاربر تست ۰۹ (خرید دائمی دوره)" },
      { email: "commerce-test-10-content-pack@test.avana.dev", name: "کاربر تست ۱۰ (خرید بسته محتوایی)" },
      { email: "commerce-test-11-admin-grant@test.avana.dev", name: "کاربر تست ۱۱ (اعطای دسترسی ادمین)" },
      { email: "commerce-test-12-multiple-purchases@test.avana.dev", name: "کاربر تست ۱۲ (خریدهای متعدد و تاریخچه کامل)" },
    ];

    const testUserMap = new Map<string, { id: string; email: string; name: string }>();

    for (const u of testUsersDef) {
      const [userRecord] = await db
        .insert(schema.users)
        .values({
          email: u.email,
          name: u.name,
          globalRole: null,
          emailVerifiedAt: now,
        })
        .onConflictDoUpdate({
          target: schema.users.email,
          set: {
            name: u.name,
            updatedAt: now,
          },
        })
        .returning();

      testUserMap.set(u.email, userRecord);
    }

    const testUserIds = Array.from(testUserMap.values()).map((u) => u.id);
    console.log(`   ✓ 12 Test users created/updated with IDs.`);

    // -------------------------------------------------------------------------
    // 3. Clear Previous Test Orders / Payments / Subs / Entitlements for Idempotency
    // -------------------------------------------------------------------------
    console.log("\n🧹 3. Resetting previous test commerce records for test users...");
    if (testUserIds.length > 0) {
      await db.delete(schema.userEntitlements).where(inArray(schema.userEntitlements.userId, testUserIds));
      await db.delete(schema.userSubscriptions).where(inArray(schema.userSubscriptions.userId, testUserIds));
      await db.delete(schema.payments).where(inArray(schema.payments.userId, testUserIds));
      await db.delete(schema.orders).where(inArray(schema.orders.userId, testUserIds));
    }
    console.log("   ✓ Cleaned previous test records for test users.");

    // Helper functions for relative dates
    const daysAgo = (d: number) => new Date(now.getTime() - d * 86400000);
    const daysFromNow = (d: number) => new Date(now.getTime() + d * 86400000);

    // -------------------------------------------------------------------------
    // 4. Seed Scenarios
    // -------------------------------------------------------------------------
    console.log("\n🏗️  4. Seeding 12 mandatory scenarios...");

    // Helper to insert Order + Payment
    async function createOrderAndPayment(params: {
      userId: string;
      productId: string;
      orderNumber: string;
      amount: number;
      orderStatus: "pending" | "paid" | "failed" | "cancelled" | "expired";
      paymentStatus: "pending" | "paid" | "failed" | "cancelled";
      authority: string;
      transactionId?: string | null;
      createdAt: Date;
      paidAt?: Date | null;
      metadata?: Record<string, unknown>;
    }) {
      const [order] = await db
        .insert(schema.orders)
        .values({
          userId: params.userId,
          productId: params.productId,
          orderNumber: params.orderNumber,
          amount: params.amount,
          currency: "toman",
          status: params.orderStatus,
          metadata: params.metadata ?? {},
          createdAt: params.createdAt,
          updatedAt: params.paidAt ?? params.createdAt,
        })
        .returning();

      const [payment] = await db
        .insert(schema.payments)
        .values({
          orderId: order.id,
          userId: params.userId,
          amount: params.amount,
          currency: "toman",
          gateway: "mock",
          authority: params.authority,
          transactionId: params.transactionId ?? null,
          status: params.paymentStatus,
          idempotencyKey: `pay_${order.id}`,
          rawCallbackMetadata: params.paymentStatus === "paid" ? { code: 100, ref_id: params.transactionId } : null,
          paidAt: params.paidAt ?? null,
          createdAt: params.createdAt,
          updatedAt: params.paidAt ?? params.createdAt,
        })
        .returning();

      return { order, payment };
    }

    // --- Scenario 01: Active Monthly ---
    {
      const user = testUserMap.get("commerce-test-01-active-monthly@test.avana.dev")!;
      const started = daysAgo(5);
      const expires = daysFromNow(25);
      const { order } = await createOrderAndPayment({
        userId: user.id,
        productId: subMonthly.id,
        orderNumber: "TEST-ORD-01-MONTHLY",
        amount: subMonthly.price,
        orderStatus: "paid",
        paymentStatus: "paid",
        authority: "TEST-AUTH-01-MONTHLY",
        transactionId: "TEST-TXN-01-MONTHLY",
        createdAt: started,
        paidAt: started,
        metadata: { scenario: "01_active_monthly" },
      });

      await db.insert(schema.userSubscriptions).values({
        userId: user.id,
        productId: subMonthly.id,
        orderId: order.id,
        status: "active",
        startedAt: started,
        expiresAt: expires,
        createdAt: started,
        updatedAt: started,
      });

      await db.insert(schema.userEntitlements).values({
        userId: user.id,
        resourceType: "subscription",
        resourceId: null,
        sourceType: "purchase",
        orderId: order.id,
        startsAt: started,
        expiresAt: expires,
        createdAt: started,
        updatedAt: started,
      });
      console.log("   ✓ Scenario 01: Active Monthly seeded.");
    }

    // --- Scenario 02: Active Quarterly ---
    {
      const user = testUserMap.get("commerce-test-02-active-quarterly@test.avana.dev")!;
      const started = daysAgo(10);
      const expires = daysFromNow(80);
      const { order } = await createOrderAndPayment({
        userId: user.id,
        productId: subQuarterly.id,
        orderNumber: "TEST-ORD-02-QUARTERLY",
        amount: subQuarterly.price,
        orderStatus: "paid",
        paymentStatus: "paid",
        authority: "TEST-AUTH-02-QUARTERLY",
        transactionId: "TEST-TXN-02-QUARTERLY",
        createdAt: started,
        paidAt: started,
        metadata: { scenario: "02_active_quarterly" },
      });

      await db.insert(schema.userSubscriptions).values({
        userId: user.id,
        productId: subQuarterly.id,
        orderId: order.id,
        status: "active",
        startedAt: started,
        expiresAt: expires,
        createdAt: started,
        updatedAt: started,
      });

      await db.insert(schema.userEntitlements).values({
        userId: user.id,
        resourceType: "subscription",
        resourceId: null,
        sourceType: "purchase",
        orderId: order.id,
        startsAt: started,
        expiresAt: expires,
        createdAt: started,
        updatedAt: started,
      });
      console.log("   ✓ Scenario 02: Active Quarterly seeded.");
    }

    // --- Scenario 03: Active Yearly ---
    {
      const user = testUserMap.get("commerce-test-03-active-yearly@test.avana.dev")!;
      const started = daysAgo(30);
      const expires = daysFromNow(335);
      const { order } = await createOrderAndPayment({
        userId: user.id,
        productId: subYearly.id,
        orderNumber: "TEST-ORD-03-YEARLY",
        amount: subYearly.price,
        orderStatus: "paid",
        paymentStatus: "paid",
        authority: "TEST-AUTH-03-YEARLY",
        transactionId: "TEST-TXN-03-YEARLY",
        createdAt: started,
        paidAt: started,
        metadata: { scenario: "03_active_yearly" },
      });

      await db.insert(schema.userSubscriptions).values({
        userId: user.id,
        productId: subYearly.id,
        orderId: order.id,
        status: "active",
        startedAt: started,
        expiresAt: expires,
        createdAt: started,
        updatedAt: started,
      });

      await db.insert(schema.userEntitlements).values({
        userId: user.id,
        resourceType: "subscription",
        resourceId: null,
        sourceType: "purchase",
        orderId: order.id,
        startsAt: started,
        expiresAt: expires,
        createdAt: started,
        updatedAt: started,
      });
      console.log("   ✓ Scenario 03: Active Yearly seeded.");
    }

    // --- Scenario 04: Expired Subscription ---
    {
      const user = testUserMap.get("commerce-test-04-expired-subscription@test.avana.dev")!;
      const started = daysAgo(60);
      const expires = daysAgo(30);
      const { order } = await createOrderAndPayment({
        userId: user.id,
        productId: subMonthly.id,
        orderNumber: "TEST-ORD-04-EXPIRED",
        amount: subMonthly.price,
        orderStatus: "paid",
        paymentStatus: "paid",
        authority: "TEST-AUTH-04-EXPIRED",
        transactionId: "TEST-TXN-04-EXPIRED",
        createdAt: started,
        paidAt: started,
        metadata: { scenario: "04_expired_subscription" },
      });

      await db.insert(schema.userSubscriptions).values({
        userId: user.id,
        productId: subMonthly.id,
        orderId: order.id,
        status: "expired",
        startedAt: started,
        expiresAt: expires,
        createdAt: started,
        updatedAt: started,
      });

      await db.insert(schema.userEntitlements).values({
        userId: user.id,
        resourceType: "subscription",
        resourceId: null,
        sourceType: "purchase",
        orderId: order.id,
        startsAt: started,
        expiresAt: expires,
        createdAt: started,
        updatedAt: started,
      });
      console.log("   ✓ Scenario 04: Expired Subscription seeded.");
    }

    // --- Scenario 05: No Subscription (Empty State) ---
    {
      console.log("   ✓ Scenario 05: No Subscription (Empty State) verified.");
    }

    // --- Scenario 06: Failed Payment ---
    {
      const user = testUserMap.get("commerce-test-06-failed-payment@test.avana.dev")!;
      const createdAt = daysAgo(2);
      await createOrderAndPayment({
        userId: user.id,
        productId: subMonthly.id,
        orderNumber: "TEST-ORD-06-FAILED",
        amount: subMonthly.price,
        orderStatus: "failed",
        paymentStatus: "failed",
        authority: "TEST-AUTH-06-FAILED",
        transactionId: null,
        createdAt,
        paidAt: null,
        metadata: { scenario: "06_failed_payment" },
      });
      console.log("   ✓ Scenario 06: Failed Payment seeded.");
    }

    // --- Scenario 07: Pending Order ---
    {
      const user = testUserMap.get("commerce-test-07-pending-order@test.avana.dev")!;
      const createdAt = daysAgo(1);
      await createOrderAndPayment({
        userId: user.id,
        productId: subMonthly.id,
        orderNumber: "TEST-ORD-07-PENDING",
        amount: subMonthly.price,
        orderStatus: "pending",
        paymentStatus: "pending",
        authority: "TEST-AUTH-07-PENDING",
        transactionId: null,
        createdAt,
        paidAt: null,
        metadata: { scenario: "07_pending_order" },
      });
      console.log("   ✓ Scenario 07: Pending Order seeded.");
    }

    // --- Scenario 08: Cancelled Order ---
    {
      const user = testUserMap.get("commerce-test-08-cancelled-order@test.avana.dev")!;
      const createdAt = daysAgo(3);
      await createOrderAndPayment({
        userId: user.id,
        productId: subMonthly.id,
        orderNumber: "TEST-ORD-08-CANCELLED",
        amount: subMonthly.price,
        orderStatus: "cancelled",
        paymentStatus: "cancelled",
        authority: "TEST-AUTH-08-CANCELLED",
        transactionId: null,
        createdAt,
        paidAt: null,
        metadata: { scenario: "08_cancelled_order" },
      });
      console.log("   ✓ Scenario 08: Cancelled Order seeded.");
    }

    // --- Scenario 09: Lifetime Course Purchase ---
    {
      const user = testUserMap.get("commerce-test-09-lifetime-course@test.avana.dev")!;
      const createdAt = daysAgo(3);
      const { order } = await createOrderAndPayment({
        userId: user.id,
        productId: courseProduct.id,
        orderNumber: "TEST-ORD-09-COURSE",
        amount: courseProduct.price,
        orderStatus: "paid",
        paymentStatus: "paid",
        authority: "TEST-AUTH-09-COURSE",
        transactionId: "TEST-TXN-09-COURSE",
        createdAt,
        paidAt: createdAt,
        metadata: { scenario: "09_lifetime_course" },
      });

      await db.insert(schema.userEntitlements).values({
        userId: user.id,
        resourceType: "course",
        resourceId: targetCourse.id,
        sourceType: "purchase",
        orderId: order.id,
        startsAt: createdAt,
        expiresAt: null, // Lifetime ownership
        createdAt,
        updatedAt: createdAt,
      });
      console.log("   ✓ Scenario 09: Lifetime Course Purchase seeded.");
    }

    // --- Scenario 10: Content Pack Purchase ---
    {
      const user = testUserMap.get("commerce-test-10-content-pack@test.avana.dev")!;
      const createdAt = daysAgo(4);
      const { order } = await createOrderAndPayment({
        userId: user.id,
        productId: packProduct.id,
        orderNumber: "TEST-ORD-10-PACK",
        amount: packProduct.price,
        orderStatus: "paid",
        paymentStatus: "paid",
        authority: "TEST-AUTH-10-PACK",
        transactionId: "TEST-TXN-10-PACK",
        createdAt,
        paidAt: createdAt,
        metadata: { scenario: "10_content_pack" },
      });

      await db.insert(schema.userEntitlements).values({
        userId: user.id,
        resourceType: "content_pack",
        resourceId: targetPack.id,
        sourceType: "purchase",
        orderId: order.id,
        startsAt: createdAt,
        expiresAt: null, // Lifetime ownership
        createdAt,
        updatedAt: createdAt,
      });
      console.log("   ✓ Scenario 10: Content Pack Purchase seeded.");
    }

    // --- Scenario 11: Admin Grant ---
    {
      const user = testUserMap.get("commerce-test-11-admin-grant@test.avana.dev")!;
      const started = daysAgo(1);
      const expires = daysFromNow(60);

      // Admin grant has no order/payment, only entitlement with source_type = 'admin_grant'
      await db.insert(schema.userEntitlements).values({
        userId: user.id,
        resourceType: "subscription",
        resourceId: null,
        sourceType: "admin_grant",
        orderId: null,
        startsAt: started,
        expiresAt: expires,
        createdAt: started,
        updatedAt: started,
      });
      console.log("   ✓ Scenario 11: Admin Grant seeded.");
    }

    // --- Scenario 12: Multiple Purchases ---
    {
      const user = testUserMap.get("commerce-test-12-multiple-purchases@test.avana.dev")!;

      // 1. Active Monthly Subscription
      const subStarted = daysAgo(5);
      const subExpires = daysFromNow(25);
      const subRes = await createOrderAndPayment({
        userId: user.id,
        productId: subMonthly.id,
        orderNumber: "TEST-ORD-12-01-SUB",
        amount: subMonthly.price,
        orderStatus: "paid",
        paymentStatus: "paid",
        authority: "TEST-AUTH-12-01",
        transactionId: "TEST-TXN-12-01",
        createdAt: subStarted,
        paidAt: subStarted,
        metadata: { scenario: "12_multiple_active_sub" },
      });
      await db.insert(schema.userSubscriptions).values({
        userId: user.id,
        productId: subMonthly.id,
        orderId: subRes.order.id,
        status: "active",
        startedAt: subStarted,
        expiresAt: subExpires,
        createdAt: subStarted,
        updatedAt: subStarted,
      });
      await db.insert(schema.userEntitlements).values({
        userId: user.id,
        resourceType: "subscription",
        resourceId: null,
        sourceType: "purchase",
        orderId: subRes.order.id,
        startsAt: subStarted,
        expiresAt: subExpires,
        createdAt: subStarted,
        updatedAt: subStarted,
      });

      // 2. Lifetime Course Purchase
      const courseStarted = daysAgo(15);
      const courseRes = await createOrderAndPayment({
        userId: user.id,
        productId: courseProduct.id,
        orderNumber: "TEST-ORD-12-02-COURSE",
        amount: courseProduct.price,
        orderStatus: "paid",
        paymentStatus: "paid",
        authority: "TEST-AUTH-12-02",
        transactionId: "TEST-TXN-12-02",
        createdAt: courseStarted,
        paidAt: courseStarted,
        metadata: { scenario: "12_multiple_course" },
      });
      await db.insert(schema.userEntitlements).values({
        userId: user.id,
        resourceType: "course",
        resourceId: targetCourse.id,
        sourceType: "purchase",
        orderId: courseRes.order.id,
        startsAt: courseStarted,
        expiresAt: null, // Lifetime
        createdAt: courseStarted,
        updatedAt: courseStarted,
      });

      // 3. Lifetime Content Pack Purchase
      const packStarted = daysAgo(20);
      const packRes = await createOrderAndPayment({
        userId: user.id,
        productId: packProduct.id,
        orderNumber: "TEST-ORD-12-03-PACK",
        amount: packProduct.price,
        orderStatus: "paid",
        paymentStatus: "paid",
        authority: "TEST-AUTH-12-03",
        transactionId: "TEST-TXN-12-03",
        createdAt: packStarted,
        paidAt: packStarted,
        metadata: { scenario: "12_multiple_pack" },
      });
      await db.insert(schema.userEntitlements).values({
        userId: user.id,
        resourceType: "content_pack",
        resourceId: targetPack.id,
        sourceType: "purchase",
        orderId: packRes.order.id,
        startsAt: packStarted,
        expiresAt: null, // Lifetime
        createdAt: packStarted,
        updatedAt: packStarted,
      });

      // 4. Failed Order
      const failedDate = daysAgo(25);
      await createOrderAndPayment({
        userId: user.id,
        productId: subYearly.id,
        orderNumber: "TEST-ORD-12-04-FAILED",
        amount: subYearly.price,
        orderStatus: "failed",
        paymentStatus: "failed",
        authority: "TEST-AUTH-12-04",
        transactionId: null,
        createdAt: failedDate,
        paidAt: null,
        metadata: { scenario: "12_multiple_failed" },
      });

      // 5. Historical Expired Subscription
      const histStarted = daysAgo(150);
      const histExpires = daysAgo(60);
      const histRes = await createOrderAndPayment({
        userId: user.id,
        productId: subQuarterly.id,
        orderNumber: "TEST-ORD-12-05-HIST",
        amount: subQuarterly.price,
        orderStatus: "paid",
        paymentStatus: "paid",
        authority: "TEST-AUTH-12-05",
        transactionId: "TEST-TXN-12-05",
        createdAt: histStarted,
        paidAt: histStarted,
        metadata: { scenario: "12_multiple_hist_sub" },
      });
      await db.insert(schema.userSubscriptions).values({
        userId: user.id,
        productId: subQuarterly.id,
        orderId: histRes.order.id,
        status: "expired",
        startedAt: histStarted,
        expiresAt: histExpires,
        createdAt: histStarted,
        updatedAt: histStarted,
      });
      await db.insert(schema.userEntitlements).values({
        userId: user.id,
        resourceType: "subscription",
        resourceId: null,
        sourceType: "purchase",
        orderId: histRes.order.id,
        startsAt: histStarted,
        expiresAt: histExpires,
        createdAt: histStarted,
        updatedAt: histStarted,
      });

      console.log("   ✓ Scenario 12: Multiple Purchases seeded.");
    }

    console.log("\n=======================================================");
    console.log("✅ ALL 12 TEST COMMERCE SCENARIOS SEEDED SUCCESSFULLY");
    console.log("=======================================================\n");
  } finally {
    if (internalClient) {
      await internalClient.close();
    }
  }
}

// Allow direct execution
if (import.meta.url === `file://${process.argv[1]}`) {
  seedTestCommerceData().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
}
