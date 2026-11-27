import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createDbClient } from "@avana/database/client";
import { sql, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import * as schema from "@avana/database/schema";
import {
  type Actor,
  asUserId,
} from "@avana/domain";
import { PromotionService } from "../modules/commerce/promotion-service.js";
import { DrizzleWalletStore } from "../modules/wallet/wallet-store.js";
import { WalletService } from "../modules/wallet/wallet-service.js";

/**
 * Stage 2 Integration Test: True Concurrency Race on Real PostgreSQL.
 *
 * Designed specifically for Staging execution with live PostgreSQL (port 5432).
 * Verifies that the row-level lock `SELECT ... FOR UPDATE` on `promotions`
 * strictly serializes concurrent reservation attempts, preventing quota overselling.
 *
 * If live PostgreSQL is not reachable, gracefully marks as skipped (UNRUN in sandbox).
 */
/* eslint-disable no-secrets/no-secrets */
import {
  assertSafeDestructiveTestOperation,
  resolveSafePostgresTestUrl,
} from "./pg-test-guard.js";

describe("Staging PostgreSQL Integration: Promotion Concurrency & Quota Race", () => {
  let dbUrl = "";
  let client: ReturnType<typeof createDbClient>;
  let isConnected = false;
  let promotionService: PromotionService;
  let walletService: WalletService;

  const testUserIds: string[] = [];
  let testPromoId: string | null = null;
  let testCodeId: string | null = null;
  const testPromoCode = `RACE_STAGING_${Date.now()}`;

  beforeAll(async () => {
    dbUrl = resolveSafePostgresTestUrl();
    client = createDbClient(dbUrl);
    await client.db.execute(sql`SELECT 1;`);
    isConnected = true;

    const walletStore = new DrizzleWalletStore(client.db);
    walletService = new WalletService(walletStore);
    promotionService = new PromotionService(client.db, walletService);
  });

  afterAll(async () => {
    if (!isConnected || !client) return;
    assertSafeDestructiveTestOperation("staging_promotion_concurrency_cleanup", dbUrl);
    try {
      if (testPromoId) {
        await client.db.delete(schema.promotionRedemptions).where(eq(schema.promotionRedemptions.promotionId, testPromoId));
        await client.db.delete(schema.promotionCodes).where(eq(schema.promotionCodes.promotionId, testPromoId));
        await client.db.delete(schema.promotions).where(eq(schema.promotions.id, testPromoId));
      }
      for (const uid of testUserIds) {
        await client.db.delete(schema.users).where(eq(schema.users.id, uid));
      }
      await client.close();
    } catch {
      // Best-effort cleanup
    }
  });

  async function createTestUser(role = "student"): Promise<{ actor: Actor; userId: string }> {
    const userId = randomUUID();
    testUserIds.push(userId);
    await client.db.insert(schema.users).values({
      id: userId,
      email: `test_race_${userId.slice(0, 8)}@avana.test`,
      role,
      name: "Test Concurrent Student",
      passwordHash: "hash_test",
      active: true,
      metadata: {},
    });
    return {
      actor: {
        userId: asUserId(userId),
        role: "student",
      },
      userId,
    };
  }

  it("strictly enforces totalUsageLimit=1 under concurrent load in real PostgreSQL", async (ctx) => {
    if (!isConnected) {
      ctx.skip();
      return;
    }

    // 1. Create Promotion with totalUsageLimit = 1 on real PostgreSQL
    testPromoId = randomUUID();
    testCodeId = randomUUID();
    const now = new Date();

    await client.db.insert(schema.promotions).values({
      id: testPromoId,
      name: "تخفیف مسابقه همزمانی استیجینگ",
      benefitType: "fixed_discount",
      benefitValue: 50_000,
      totalUsageLimit: 1,
      perUserUsageLimit: 1,
      minOrderAmount: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    await client.db.insert(schema.promotionCodes).values({
      id: testCodeId,
      promotionId: testPromoId,
      code: testPromoCode,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    // 2. Create two independent users
    const { actor: userA } = await createTestUser();
    const { actor: userB } = await createTestUser();

    // 3. Issue two concurrent reservation requests against live PostgreSQL
    const [resultA, resultB] = await Promise.allSettled([
      promotionService.evaluateAndReservePromotion({
        userId: userA.userId,
        code: testPromoCode,
        orderAmount: 100_000,
        productId: "prod_dummy_concurrency",
      }),
      promotionService.evaluateAndReservePromotion({
        userId: userB.userId,
        code: testPromoCode,
        orderAmount: 100_000,
        productId: "prod_dummy_concurrency",
      }),
    ]);

    const successes = [resultA, resultB].filter((r) => r.status === "fulfilled");
    const failures = [resultA, resultB].filter((r) => r.status === "rejected");

    // Exactly one winner and one loser
    expect(successes.length).toBe(1);
    expect(failures.length).toBe(1);

    // 4. Verify in the database directly: exactly 1 redemption row exists
    const redemptions = await client.db
      .select()
      .from(schema.promotionRedemptions)
      .where(eq(schema.promotionRedemptions.promotionId, testPromoId));

    expect(redemptions.length).toBe(1);
    expect(redemptions[0].status).toBe("pending");
  });
});
