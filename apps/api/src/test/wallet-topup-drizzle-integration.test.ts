import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDbClient } from "@avana/database/client";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as schema from "@avana/database/schema";
import {
  type Actor,
  asUserId,
  asProductId,
  CANONICAL_WALLET_TOPUP_ID,
  CANONICAL_WALLET_TOPUP_CODE,
} from "@avana/domain";
import { DrizzleCommerceStore } from "../modules/commerce/commerce-store.js";
import { CommerceService } from "../modules/commerce/commerce-service.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { DrizzleWalletStore } from "../modules/wallet/wallet-store.js";
import { WalletService } from "../modules/wallet/wallet-service.js";
import { createApp } from "../server/createApp.js";
import { loadApiConfig } from "../config.js";
import { v1Routes } from "../routes/v1.js";
import { DrizzleUserStore, DrizzleSessionStore } from "../modules/identity/drizzle-stores.js";
import { generateSessionToken, hashToken } from "../modules/identity/session-service.js";

/* eslint-disable no-secrets/no-secrets */
describe("Real Postgres DB Integration: Wallet Top-Up & Card-to-Card", () => {
  const dbUrl =
    process.env.DATABASE_URL ||
    "postgres://avana:avana@127.0.0.1:5432/avana?sslmode=disable";

  let client: ReturnType<typeof createDbClient>;
  let isConnected = false;
  let commerceStore: DrizzleCommerceStore;
  let walletStore: DrizzleWalletStore;
  let commerceService: CommerceService;
  let userStore: DrizzleUserStore;
  let sessionStore: DrizzleSessionStore;
  beforeAll(async () => {
    try {
      client = createDbClient(dbUrl);
      await client.db.execute(sql`SELECT 1;`);
      isConnected = true;

      commerceStore = new DrizzleCommerceStore(client.db);
      walletStore = new DrizzleWalletStore(client.db);
      userStore = new DrizzleUserStore(client.db);
      sessionStore = new DrizzleSessionStore(client.db);

      commerceService = new CommerceService(
        commerceStore,
        new MockPaymentGateway(),
        userStore,
        undefined,
        undefined,
        {
          enabled: true,
          destinationCardNumber: "5894631131738239",
        },
      );
    } catch (err) {
      console.error("Failed to connect to real Postgres DB:", err);
      isConnected = false;
    }
  });

  const createdUserIds: string[] = [];

  async function createFreshUser(): Promise<{ user: Actor; userId: string }> {
    const uId = randomUUID();
    createdUserIds.push(uId);
    await client.db.insert(schema.users).values({
      id: uId,
      email: `c2c-topup-test-${Date.now()}-${randomUUID().slice(0, 6)}@test.avana.dev`,
      name: "Test Topup User",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return {
      userId: uId,
      user: {
        userId: asUserId(uId),
        role: "student",
      },
    };
  }

  afterAll(async () => {
    if (client) {
      for (const uId of createdUserIds) {
        await client.db
          .delete(schema.users)
          .where(sql`id = ${uId}`)
          .catch(() => {});
      }
      await client.close().catch(() => {});
    }
  });

  it("1. Resolves canonical wallet_topup product from real Postgres DB", async (ctx) => {
    if (!isConnected) {
      ctx.skip();
      return;
    }

    // 1. Find by code
    const byCode = await commerceStore.findProductByCode(CANONICAL_WALLET_TOPUP_CODE);
    expect(byCode).toBeDefined();
    expect(byCode).not.toBeNull();
    expect(byCode?.id).toBe(CANONICAL_WALLET_TOPUP_ID);
    expect(byCode?.code).toBe("wallet_topup");
    expect(byCode?.type).toBe("wallet_topup");
    expect(byCode?.targetType).toBe("wallet");
    expect(byCode?.price).toBe(0); // System placeholder

    // 2. Find by ID
    const byId = await commerceStore.findProductById(asProductId(CANONICAL_WALLET_TOPUP_ID));
    expect(byId).toBeDefined();
    expect(byId).not.toBeNull();
    expect(byId?.code).toBe("wallet_topup");

    // 3. listActiveProducts contains wallet_topup
    const activeProducts = await commerceStore.listActiveProducts();
    const topupInList = activeProducts.find((p) => p.code === "wallet_topup");
    expect(topupInList).toBeDefined();
  });

  it("2. Submits Card-to-Card wallet top-up on real Postgres DB with custom 50,000 Tomans amount and verifies Foreign Key", async (ctx) => {
    if (!isConnected) {
      ctx.skip();
      return;
    }

    const { user: user2 } = await createFreshUser();
    const topupProd = (await commerceStore.findProductByCode("wallet_topup"))!;
    expect(topupProd).toBeDefined();

    const topupAmount = 50_000;
    const trackingNumber = `TRK-PG-${Date.now().toString().slice(-6)}`;

    const result = await commerceService.submitCardToCardPayment(
      user2,
      {
        productId: topupProd.id,
        amount: topupAmount,
        trackingNumber,
        sourceCardLast4: "5022",
        payerName: "کاربر تست پُستگرس",
      },
      "req-pg-topup-50k",
    );

    expect(result.success).toBe(true);
    expect(result.paymentId).toBeDefined();
    expect(result.orderId).toBeDefined();
    expect(result.status).toBe("pending_admin_review");
    expect(result.subscriptionId).toBeUndefined(); // Invariant: no subscription created

    // Verify order in PostgreSQL
    const order = await commerceStore.findOrderById(result.orderId);
    expect(order).not.toBeNull();
    expect(order?.amount).toBe(50_000); // INVARIANT: amount is user-specified 50,000, NOT product.price (0)
    expect(order?.productId).toBe(topupProd.id);

    // Verify payment in PostgreSQL
    const payment = await commerceStore.findPaymentById(result.paymentId);
    expect(payment).not.toBeNull();
    expect(payment?.amount).toBe(50_000);
    expect(payment?.trackingNumber).toBe(trackingNumber);
    expect(payment?.sourceCardLast4).toBe("5022");
    expect(payment?.status).toBe("pending_admin_review");
  });

  it("3. HTTP endpoint POST /v1/commerce/payments/card-to-card accepts product_id='wallet_topup' and resolves cleanly on Postgres", async (ctx) => {
    if (!isConnected) {
      ctx.skip();
      return;
    }

    const { user: user3 } = await createFreshUser();
    const config = loadApiConfig();
    const app = createApp({ config });
    await app.register(v1Routes, {
      config,
      sessionStore,
      userStore,
      commerceStore,
      walletStore,
      paymentGateway: new MockPaymentGateway(),
    });
    await app.ready();

    // Create session token for user3
    const sessionToken = generateSessionToken();
    const tokenHash = hashToken(sessionToken);
    const sessionRecord = await sessionStore.insert({
      userId: user3.userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    });

    const trackingNumber = `TRK-HTTP-${Date.now().toString().slice(-6)}`;
    const customAmount = 120_000;

    const res = await app.inject({
      method: "POST",
      url: "/v1/commerce/payments/card-to-card",
      cookies: { avana_session: sessionToken },
      payload: {
        product_id: "wallet_topup", // Passing code 'wallet_topup' directly
        amount: customAmount,
        tracking_number: trackingNumber,
        source_card_last4: "6037",
        payment_date: "1404/12/25",
        payment_time: "16:45",
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.orderId).toBeDefined();
    expect(body.paymentId).toBeDefined();
    expect(body.status).toBe("pending_admin_review");

    // Clean up created session
    await sessionStore.revoke(sessionRecord.id).catch(() => {});
  });

  it("4. Subscription Card-to-Card payment strictly preserves catalog price on Postgres", async (ctx) => {
    if (!isConnected) {
      ctx.skip();
      return;
    }

    const { user: user4 } = await createFreshUser();
    const monthlySub = (await commerceStore.findProductByCode("sub_monthly"))!;
    expect(monthlySub).toBeDefined();

    // Paying custom arbitrary amount for subscription FAILS
    await expect(
      commerceService.submitCardToCardPayment(
        user4,
        {
          productId: monthlySub.id,
          amount: 50_000,
          trackingNumber: `TRK-SUB-FAIL-${Date.now().toString().slice(-4)}`,
          sourceCardLast4: "1111",
        },
        "req-sub-fail",
      ),
    ).rejects.toThrow(/با مبلغ پلن انتخابی.*مطابقت ندارد/);
  });
});
