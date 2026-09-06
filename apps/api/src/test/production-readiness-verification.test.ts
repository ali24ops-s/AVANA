import { describe, it, expect } from "vitest";
import { loadApiConfig } from "../config.js";
import { createDbClient } from "@avana/database/client";
import {
  users,
  products,
  orders,
  payments,
  userSubscriptions,
  userEntitlements,
} from "@avana/database/schema";
import { sql, desc, eq } from "drizzle-orm";
import { createApp } from "../server/createApp.js";
import { v1Routes } from "../routes/v1.js";
import { Roles, type Role, type UserId, type OrganizationId } from "@avana/domain";
import { randomUUID } from "node:crypto";
import {
  InMemorySessionStore,
  InMemoryUserStore,
} from "../modules/identity/test/in-memory-stores.js";
import { SessionService } from "../modules/identity/session-service.js";
import { InMemoryOrganizationStore } from "../modules/organizations/test/in-memory-stores.js";
import { InMemoryAdminStore } from "../modules/admin/in-memory-stores.js";
import { composeProduction } from "../server/composeProduction.js";
import { DrizzleAdminStore } from "../modules/admin/drizzle-stores.js";

describe("Production Readiness & Real Data Verification", () => {
  it("1. Verifies Production Store Composition Wiring", async () => {
    const config = loadApiConfig();
    
    // Test composeProduction returns DrizzleAdminStore bound to real DbClient
    const { v1Options, close } = await composeProduction(config);
    try {
      expect(v1Options.adminStore).toBeDefined();
      expect(v1Options.adminStore instanceof DrizzleAdminStore).toBe(true);
      expect(v1Options.commerceStore).toBeDefined();
    } finally {
      await close();
    }
  });

  it("2. Read-Only Query to Database for Exact Production Counts & Records", async (ctx) => {
    const config = loadApiConfig();
    let client: ReturnType<typeof createDbClient> | undefined;

    try {
      client = createDbClient(config.database.url);
      await client.db.execute(sql`SELECT 1;`);
    } catch {
      console.warn("Skipping real DB query test because DB is not reachable in current environment");
      ctx.skip();
      return;
    }

    const { db, close } = client;

    try {
      // 1. Total counts
      const [usersCount] = await db.select({ count: sql<number>`count(*)::int` }).from(users);
      const [productsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(products);
      const [ordersCount] = await db.select({ count: sql<number>`count(*)::int` }).from(orders);
      const [paidOrdersCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(eq(orders.status, "paid"));
      const [paymentsCount] = await db.select({ count: sql<number>`count(*)::int` }).from(payments);
      const [paidPaymentsCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(payments)
        .where(eq(payments.status, "paid"));
      const [subsCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(userSubscriptions);
      const [entitlementsCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(userEntitlements);

      console.log("\n================ PRODUCTION DATABASE STATS ================");
      console.log("Total users in DB:", usersCount?.count);
      console.log("Total products in catalog:", productsCount?.count);
      console.log("Total orders in DB:", ordersCount?.count);
      console.log("Total paid orders:", paidOrdersCount?.count);
      console.log("Total payments recorded:", paymentsCount?.count);
      console.log("Total successful payments:", paidPaymentsCount?.count);
      console.log("Total user subscriptions:", subsCount?.count);
      console.log("Total user entitlements:", entitlementsCount?.count);

      // 2. Fetch recent 5 orders
      const recentOrders = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          userId: orders.userId,
          productId: orders.productId,
          amount: orders.amount,
          currency: orders.currency,
          status: orders.status,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .orderBy(desc(orders.createdAt))
        .limit(5);

      console.log("\n================ RECENT 5 ORDERS ================");
      console.log(JSON.stringify(recentOrders, null, 2));

      // 3. Fetch recent 5 payments (sanitised, without secret hashes)
      const recentPayments = await db
        .select({
          id: payments.id,
          orderId: payments.orderId,
          userId: payments.userId,
          gateway: payments.gateway,
          transactionId: payments.transactionId,
          amount: payments.amount,
          currency: payments.currency,
          status: payments.status,
          createdAt: payments.createdAt,
        })
        .from(payments)
        .orderBy(desc(payments.createdAt))
        .limit(5);

      console.log("\n================ RECENT 5 PAYMENTS ================");
      console.log(JSON.stringify(recentPayments, null, 2));

      // 4. Fetch recent 5 subscriptions
      const recentSubs = await db
        .select({
          id: userSubscriptions.id,
          userId: userSubscriptions.userId,
          productId: userSubscriptions.productId,
          status: userSubscriptions.status,
          startedAt: userSubscriptions.startedAt,
          expiresAt: userSubscriptions.expiresAt,
          orderId: userSubscriptions.orderId,
        })
        .from(userSubscriptions)
        .orderBy(desc(userSubscriptions.createdAt))
        .limit(5);

      console.log("\n================ RECENT 5 SUBSCRIPTIONS ================");
      console.log(JSON.stringify(recentSubs, null, 2));

      // 5. Fetch recent 5 entitlements
      const recentEntitlements = await db
        .select({
          id: userEntitlements.id,
          userId: userEntitlements.userId,
          resourceType: userEntitlements.resourceType,
          resourceId: userEntitlements.resourceId,
          sourceType: userEntitlements.sourceType,
          startsAt: userEntitlements.startsAt,
          expiresAt: userEntitlements.expiresAt,
        })
        .from(userEntitlements)
        .orderBy(desc(userEntitlements.createdAt))
        .limit(5);

      console.log("\n================ RECENT 5 ENTITLEMENTS ================");
      console.log(JSON.stringify(recentEntitlements, null, 2));

      // 6. Fetch products catalog
      const productCatalog = await db
        .select({
          id: products.id,
          code: products.code,
          type: products.type,
          title: products.title,
          price: products.price,
          currency: products.currency,
          active: products.active,
        })
        .from(products)
        .orderBy(products.type, products.price);

      console.log("\n================ PRODUCTS CATALOG ================");
      console.log(JSON.stringify(productCatalog, null, 2));

      expect(productsCount?.count).toBeGreaterThanOrEqual(3);
    } finally {
      await close();
    }
  });

  it("3. DrizzleAdminStore Real Query Output Verification", async (ctx) => {
    const config = loadApiConfig();
    let client: ReturnType<typeof createDbClient> | undefined;

    try {
      client = createDbClient(config.database.url);
      await client.db.execute(sql`SELECT 1;`);
    } catch {
      console.warn("Skipping real DB admin query test because DB is not reachable in current environment");
      ctx.skip();
      return;
    }

    const { db, close } = client;
    const store = new DrizzleAdminStore(db);

    try {
      // 1. Stats
      const stats = await store.getCommerceStats();
      console.log("\n=== DrizzleAdminStore.getCommerceStats() ===");
      console.log(JSON.stringify(stats, null, 2));
      expect(typeof stats.totalRevenue).toBe("number");
      expect(typeof stats.successfulOrders).toBe("number");
      expect(typeof stats.subscriptionRevenue).toBe("number");

      // 2. Orders list
      const ordersList = await store.listCommerceOrders({});
      console.log("\n=== DrizzleAdminStore.listCommerceOrders() ===");
      console.log(JSON.stringify(ordersList, null, 2));
      expect(typeof ordersList.totalCount).toBe("number");
      expect(Array.isArray(ordersList.orders)).toBe(true);

      // 3. Payments list
      const paymentsList = await store.listCommercePayments({});
      console.log("\n=== DrizzleAdminStore.listCommercePayments() ===");
      console.log(JSON.stringify(paymentsList, null, 2));
      expect(typeof paymentsList.totalCount).toBe("number");
      expect(Array.isArray(paymentsList.payments)).toBe(true);

      // 4. Subscriptions list
      const subsList = await store.listCommerceSubscriptions({});
      console.log("\n=== DrizzleAdminStore.listCommerceSubscriptions() ===");
      console.log(JSON.stringify(subsList, null, 2));
      expect(typeof subsList.totalCount).toBe("number");
      expect(Array.isArray(subsList.subscriptions)).toBe(true);

      // 5. Entitlements list
      const entsList = await store.listCommerceEntitlements({});
      console.log("\n=== DrizzleAdminStore.listCommerceEntitlements() ===");
      console.log(JSON.stringify(entsList, null, 2));
      expect(typeof entsList.totalCount).toBe("number");
      expect(Array.isArray(entsList.entitlements)).toBe(true);

      // 6. Products list
      const prodsList = await store.listCommerceProducts();
      console.log("\n=== DrizzleAdminStore.listCommerceProducts() ===");
      console.log(JSON.stringify(prodsList, null, 2));
      expect(prodsList.length).toBeGreaterThanOrEqual(3);

      // 7. User commerce profile for real user
      const userProfile = await store.getUserCommerceProfile(
        "79bda286-08a4-4a16-9340-4106864e0732"
      );
      console.log("\n=== DrizzleAdminStore.getUserCommerceProfile() ===");
      console.log(JSON.stringify(userProfile, null, 2));
      expect(userProfile?.user.id).toBe("79bda286-08a4-4a16-9340-4106864e0732");
      expect(Array.isArray(userProfile?.orders)).toBe(true);
      expect(Array.isArray(userProfile?.payments)).toBe(true);
    } finally {
      await close();
    }
  });

  it("4. RBAC Matrix Verification: Strict platform_admin access control", async () => {
    const config = loadApiConfig();
    config.session.maxAgeMs = 86400000;
    config.logging.level = "silent";

    const sessionStore = new InMemorySessionStore();
    const orgStore = new InMemoryOrganizationStore();
    const userStore = new InMemoryUserStore(orgStore);
    const adminStore = new InMemoryAdminStore();
    const sessionService = new SessionService(sessionStore, config.session);

    async function createUserWithRole(email: string, role: Role) {
      const user = await userStore.createUserWithPassword({ email, passwordHash: "x" });
      if (role === Roles.platform_admin) {
        user.globalRole = "platform_admin";
        user.role = "platform_admin";
        userStore.insert({ ...user });
      }
      const orgId = randomUUID() as OrganizationId;
      orgStore.addMembership({
        id: randomUUID(),
        organizationId: orgId,
        userId: user.id as UserId,
        role,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      const session = await sessionService.createSession(user.id);
      return { user, sessionToken: session.sessionToken };
    }

    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      adminStore,
    });

    // Unauthenticated -> 401
    const unauthStatsRes = await app.inject({
      method: "GET",
      url: "/v1/admin/commerce/stats",
    });
    expect(unauthStatsRes.statusCode).toBe(401);

    const unauthOrdersRes = await app.inject({
      method: "GET",
      url: "/v1/admin/commerce/orders",
    });
    expect(unauthOrdersRes.statusCode).toBe(401);

    const nonAdminRoles: Role[] = [
      Roles.student,
      Roles.teacher,
      Roles.course_editor,
      Roles.organization_admin,
      Roles.support_agent,
    ];

    // Non-platform_admin roles -> 403
    for (const role of nonAdminRoles) {
      const { sessionToken } = await createUserWithRole(`${role}@test.com`, role);

      const resStats = await app.inject({
        method: "GET",
        url: "/v1/admin/commerce/stats",
        headers: {
          cookie: `avana_session=${sessionToken}`,
        },
      });
      expect(resStats.statusCode).toBe(403);

      const resOrders = await app.inject({
        method: "GET",
        url: "/v1/admin/commerce/orders",
        headers: {
          cookie: `avana_session=${sessionToken}`,
        },
      });
      expect(resOrders.statusCode).toBe(403);

      const resPayments = await app.inject({
        method: "GET",
        url: "/v1/admin/commerce/payments",
        headers: {
          cookie: `avana_session=${sessionToken}`,
        },
      });
      expect(resPayments.statusCode).toBe(403);

      const resSubs = await app.inject({
        method: "GET",
        url: "/v1/admin/commerce/subscriptions",
        headers: {
          cookie: `avana_session=${sessionToken}`,
        },
      });
      expect(resSubs.statusCode).toBe(403);

      const resEntitlements = await app.inject({
        method: "GET",
        url: "/v1/admin/commerce/entitlements",
        headers: {
          cookie: `avana_session=${sessionToken}`,
        },
      });
      expect(resEntitlements.statusCode).toBe(403);

      const resProducts = await app.inject({
        method: "GET",
        url: "/v1/admin/commerce/products",
        headers: {
          cookie: `avana_session=${sessionToken}`,
        },
      });
      expect(resProducts.statusCode).toBe(403);
    }

    // Platform Admin -> 200
    const platformAdmin = await createUserWithRole("admin@test.com", Roles.platform_admin);
    const adminStatsRes = await app.inject({
      method: "GET",
      url: "/v1/admin/commerce/stats",
      headers: {
        cookie: `avana_session=${platformAdmin.sessionToken}`,
      },
    });
    expect(adminStatsRes.statusCode).toBe(200);
    expect(adminStatsRes.json().totalRevenue).toBeDefined();

    const adminOrdersRes = await app.inject({
      method: "GET",
      url: "/v1/admin/commerce/orders",
      headers: {
        cookie: `avana_session=${platformAdmin.sessionToken}`,
      },
    });
    expect(adminOrdersRes.statusCode).toBe(200);
  });
});
