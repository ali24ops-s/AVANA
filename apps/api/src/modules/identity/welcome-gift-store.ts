/**
 * Welcome Gift Store (Drizzle & In-Memory).
 *
 * Implements persistence and atomic mutations for:
 * - user_welcome_gifts
 * - wallet balance mutation and transaction ledger
 * - subscription & runtime entitlement creation
 */

import { eq, desc, and, or, isNull, gt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DbClient } from "@avana/database/client";
import {
  userWelcomeGifts,
  wallets,
  walletTransactions,
  userSubscriptions,
  userEntitlements,
  products,
} from "@avana/database/schema";
import {
  type UserId,
  type WelcomeGiftRecord,
  asWelcomeGiftId,
  asUserId,
  asUserSubscriptionId,
  asUserEntitlementId,
  asProductId,
  calculateSubscriptionExpiry,
  WELCOME_GIFT_WALLET_AMOUNT,
  WELCOME_GIFT_SUBSCRIPTION_DAYS,
} from "@avana/domain";
import type { WalletStore } from "../wallet/wallet-store.js";
import type { CommerceStore } from "../commerce/commerce-store.js";

export interface WelcomeGiftStore {
  findGiftByUserId(userId: UserId): Promise<WelcomeGiftRecord | null>;
  createPendingGift(userId: UserId): Promise<WelcomeGiftRecord>;
  executeAtomicGrant(
    userId: UserId,
    referenceDate?: Date,
  ): Promise<{ record: WelcomeGiftRecord; alreadyGranted: boolean }>;
  markPopupSeen(userId: UserId): Promise<WelcomeGiftRecord | null>;
}

export class DrizzleWelcomeGiftStore implements WelcomeGiftStore {
  constructor(private readonly db: DbClient) {}

  private mapRecord(row: typeof userWelcomeGifts.$inferSelect): WelcomeGiftRecord {
    return {
      id: asWelcomeGiftId(row.id),
      userId: asUserId(row.userId),
      walletAmount: row.walletAmount,
      walletTransactionId: row.walletTransactionId,
      subscriptionDays: row.subscriptionDays,
      subscriptionId: row.subscriptionId,
      entitlementId: row.entitlementId,
      status: row.status as "pending" | "completed",
      popupSeenAt: row.popupSeenAt ? row.popupSeenAt.toISOString() : null,
      grantedAt: row.grantedAt ? row.grantedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async findGiftByUserId(userId: UserId): Promise<WelcomeGiftRecord | null> {
    const [row] = await this.db
      .select()
      .from(userWelcomeGifts)
      .where(eq(userWelcomeGifts.userId, userId))
      .limit(1);

    return row ? this.mapRecord(row) : null;
  }

  async createPendingGift(userId: UserId): Promise<WelcomeGiftRecord> {
    const existing = await this.findGiftByUserId(userId);
    if (existing) {
      return existing;
    }

    const now = new Date();
    const [inserted] = await this.db
      .insert(userWelcomeGifts)
      .values({
        id: randomUUID(),
        userId,
        walletAmount: WELCOME_GIFT_WALLET_AMOUNT,
        subscriptionDays: WELCOME_GIFT_SUBSCRIPTION_DAYS,
        status: "pending",
        popupSeenAt: null,
        grantedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      return this.mapRecord(inserted);
    }

    const raceWinner = await this.findGiftByUserId(userId);
    if (raceWinner) {
      return raceWinner;
    }

    throw new Error("Failed to create pending welcome gift record");
  }

  async executeAtomicGrant(
    userId: UserId,
    referenceDate: Date = new Date(),
  ): Promise<{ record: WelcomeGiftRecord; alreadyGranted: boolean }> {
    return this.db.transaction(async (tx) => {
      // 1. Lock or lazily create the user_welcome_gifts record for update
      let [giftRow] = await tx
        .select()
        .from(userWelcomeGifts)
        .where(eq(userWelcomeGifts.userId, userId))
        .for("update");

      if (!giftRow) {
        // If pending record was not pre-created, insert atomically
        const newGiftId = randomUUID();
        const [created] = await tx
          .insert(userWelcomeGifts)
          .values({
            id: newGiftId,
            userId,
            walletAmount: WELCOME_GIFT_WALLET_AMOUNT,
            subscriptionDays: WELCOME_GIFT_SUBSCRIPTION_DAYS,
            status: "pending",
            popupSeenAt: null,
            grantedAt: null,
            createdAt: referenceDate,
            updatedAt: referenceDate,
          })
          .onConflictDoNothing()
          .returning();

        if (created) {
          giftRow = created;
        } else {
          // If conflict occurred concurrently, re-select under row lock
          const [locked] = await tx
            .select()
            .from(userWelcomeGifts)
            .where(eq(userWelcomeGifts.userId, userId))
            .for("update");
          giftRow = locked;
        }
      }

      if (giftRow.status === "completed") {
        return {
          record: this.mapRecord(giftRow),
          alreadyGranted: true,
        };
      }

      const now = referenceDate;
      const nowIso = now.toISOString();

      // 2. Lock user's wallet row for UPDATE (creating if not yet present)
      let [walletRow] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .for("update");

      if (!walletRow) {
        const newWalletId = randomUUID();
        const [insertedWallet] = await tx
          .insert(wallets)
          .values({
            id: newWalletId,
            userId,
            balance: 0,
            currency: "toman",
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        walletRow = insertedWallet;
      }

      const balanceBefore = walletRow.balance;
      const balanceAfter = balanceBefore + WELCOME_GIFT_WALLET_AMOUNT;

      // Update wallet balance
      await tx
        .update(wallets)
        .set({
          balance: balanceAfter,
          updatedAt: now,
        })
        .where(eq(wallets.id, walletRow.id));

      // Insert wallet_transactions entry
      const txId = randomUUID();
      const idempotencyKey = `welcome-gift:wallet:${userId}`;
      await tx
        .insert(walletTransactions)
        .values({
          id: txId,
          walletId: walletRow.id,
          userId,
          type: "credit",
          amount: WELCOME_GIFT_WALLET_AMOUNT,
          balanceBefore,
          balanceAfter,
          source: "welcome_gift",
          referenceType: "welcome_gift",
          referenceId: giftRow.id,
          idempotencyKey,
          metadata: {
            title: "هدیه خوشآمدگویی ثبت‌نام",
            amount: WELCOME_GIFT_WALLET_AMOUNT,
            currency: "toman",
            grantedAt: nowIso,
          },
          createdAt: now,
        });

      // 3. Resolve active subscription date to prevent truncating paid or active subs
      const [activeSub] = await tx
        .select({ expiresAt: userSubscriptions.expiresAt })
        .from(userSubscriptions)
        .where(
          and(
            eq(userSubscriptions.userId, userId),
            or(
              eq(userSubscriptions.status, "active"),
              eq(userSubscriptions.status, "active_pending_payment_review"),
            ),
            gt(userSubscriptions.expiresAt, now),
          ),
        )
        .orderBy(desc(userSubscriptions.expiresAt))
        .limit(1);

      const [activeEnt] = await tx
        .select({ expiresAt: userEntitlements.expiresAt })
        .from(userEntitlements)
        .where(
          and(
            eq(userEntitlements.userId, userId),
            eq(userEntitlements.resourceType, "subscription"),
            or(
              isNull(userEntitlements.expiresAt),
              gt(userEntitlements.expiresAt, now),
            ),
          ),
        )
        .orderBy(desc(userEntitlements.expiresAt))
        .limit(1);

      let latestExpiry: Date | null = null;
      if (activeSub?.expiresAt && activeSub.expiresAt > now) {
        latestExpiry = activeSub.expiresAt;
      }
      if (activeEnt?.expiresAt && activeEnt.expiresAt > (latestExpiry ?? now)) {
        latestExpiry = activeEnt.expiresAt;
      }

      const baseDate = latestExpiry ?? now;
      const newExpiryDate = calculateSubscriptionExpiry(
        baseDate,
        WELCOME_GIFT_SUBSCRIPTION_DAYS,
      );

      // Find standard subscription product
      const [subProduct] = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(eq(products.type, "subscription"), isNull(products.deletedAt)))
        .limit(1);

      const subProductId = subProduct ? subProduct.id : randomUUID();

      // Insert user_subscriptions
      const subscriptionId = randomUUID();
      await tx.insert(userSubscriptions).values({
        id: subscriptionId,
        userId,
        productId: subProductId,
        orderId: null,
        status: "active",
        startedAt: now,
        expiresAt: newExpiryDate,
        createdAt: now,
        updatedAt: now,
      });

      // Insert user_entitlements
      const entitlementId = randomUUID();
      await tx.insert(userEntitlements).values({
        id: entitlementId,
        userId,
        resourceType: "subscription",
        resourceId: null,
        sourceType: "gift",
        orderId: null,
        startsAt: now,
        expiresAt: newExpiryDate,
        createdAt: now,
        updatedAt: now,
      });

      // 4. Mark user_welcome_gifts as completed
      const [updatedGift] = await tx
        .update(userWelcomeGifts)
        .set({
          status: "completed",
          walletTransactionId: txId,
          subscriptionId,
          entitlementId,
          grantedAt: now,
          updatedAt: now,
        })
        .where(eq(userWelcomeGifts.id, giftRow.id))
        .returning();

      return {
        record: this.mapRecord(updatedGift),
        alreadyGranted: false,
      };
    });
  }

  async markPopupSeen(userId: UserId): Promise<WelcomeGiftRecord | null> {
    const now = new Date();
    const [row] = await this.db
      .update(userWelcomeGifts)
      .set({
        popupSeenAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(userWelcomeGifts.userId, userId),
          isNull(userWelcomeGifts.popupSeenAt),
        ),
      )
      .returning();

    if (row) {
      return this.mapRecord(row);
    }

    return this.findGiftByUserId(userId);
  }
}

export class InMemoryWelcomeGiftStore implements WelcomeGiftStore {
  public records = new Map<string, WelcomeGiftRecord>();

  constructor(
    private readonly walletStore?: WalletStore,
    private readonly commerceStore?: CommerceStore,
  ) {}

  async findGiftByUserId(userId: UserId): Promise<WelcomeGiftRecord | null> {
    for (const record of this.records.values()) {
      if (record.userId === userId) {
        return { ...record };
      }
    }
    return null;
  }

  async createPendingGift(userId: UserId): Promise<WelcomeGiftRecord> {
    const existing = await this.findGiftByUserId(userId);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const id = asWelcomeGiftId(randomUUID());
    const record: WelcomeGiftRecord = {
      id,
      userId,
      walletAmount: WELCOME_GIFT_WALLET_AMOUNT,
      walletTransactionId: null,
      subscriptionDays: WELCOME_GIFT_SUBSCRIPTION_DAYS,
      subscriptionId: null,
      entitlementId: null,
      status: "pending",
      popupSeenAt: null,
      grantedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    this.records.set(id, record);
    return { ...record };
  }

  async executeAtomicGrant(
    userId: UserId,
    referenceDate: Date = new Date(),
  ): Promise<{ record: WelcomeGiftRecord; alreadyGranted: boolean }> {
    let existing = await this.findGiftByUserId(userId);
    if (!existing) {
      existing = await this.createPendingGift(userId);
    }

    if (existing.status === "completed") {
      return { record: { ...existing }, alreadyGranted: true };
    }

    const nowIso = referenceDate.toISOString();

    // 1. Credit wallet
    let txId: string = randomUUID();
    if (this.walletStore) {
      const creditRes = await this.walletStore.executeAtomicWalletMutation({
        userId,
        mutationType: "credit",
        amount: WELCOME_GIFT_WALLET_AMOUNT,
        source: "welcome_gift",
        referenceType: "welcome_gift",
        referenceId: existing.id,
        idempotencyKey: `welcome-gift:wallet:${userId}`,
        metadata: {
          title: "هدیه خوشآمدگویی ثبت‌نام",
          amount: WELCOME_GIFT_WALLET_AMOUNT,
          currency: "toman",
          grantedAt: nowIso,
        },
      });
      txId = creditRes.transaction.id as string;
    }

    // 2. Grant subscription & entitlement
    let subId = asUserSubscriptionId(randomUUID());
    let entId = asUserEntitlementId(randomUUID());

    if (this.commerceStore) {
      const existingSub = await this.commerceStore.findActiveSubscription(
        userId,
        referenceDate,
      );
      const activeEnts = await this.commerceStore.listActiveEntitlements(
        userId,
        referenceDate,
      );
      const subEnt = activeEnts.find((e) => e.resourceType === "subscription");

      let latestExpiry: Date | null = null;
      if (existingSub && new Date(existingSub.expiresAt) > referenceDate) {
        latestExpiry = new Date(existingSub.expiresAt);
      }
      if (
        subEnt?.expiresAt &&
        new Date(subEnt.expiresAt) > (latestExpiry ?? referenceDate)
      ) {
        latestExpiry = new Date(subEnt.expiresAt);
      }

      const baseDate = latestExpiry ?? referenceDate;
      const newExpiry = calculateSubscriptionExpiry(
        baseDate,
        WELCOME_GIFT_SUBSCRIPTION_DAYS,
      );

      const activeProducts = await this.commerceStore.listActiveProducts();
      const subProduct = activeProducts.find((p) => p.type === "subscription");
      const subProductId = subProduct ? subProduct.id : asProductId(randomUUID());

      const createdSub = await this.commerceStore.createSubscription({
        id: subId,
        userId,
        productId: subProductId,
        orderId: null,
        status: "active",
        startedAt: nowIso,
        expiresAt: newExpiry.toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      subId = createdSub.id;

      const createdEnt = await this.commerceStore.grantEntitlement({
        id: entId,
        userId,
        resourceType: "subscription",
        resourceId: null,
        sourceType: "gift",
        orderId: null,
        startsAt: nowIso,
        expiresAt: newExpiry.toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      });
      entId = createdEnt.id;
    }

    const updated: WelcomeGiftRecord = {
      ...existing,
      status: "completed",
      walletTransactionId: txId,
      subscriptionId: subId,
      entitlementId: entId,
      grantedAt: nowIso,
      updatedAt: nowIso,
    };

    this.records.set(existing.id, updated);
    return { record: { ...updated }, alreadyGranted: false };
  }

  async markPopupSeen(userId: UserId): Promise<WelcomeGiftRecord | null> {
    const existing = await this.findGiftByUserId(userId);
    if (!existing) return null;

    if (existing.popupSeenAt) {
      return { ...existing };
    }

    const updated: WelcomeGiftRecord = {
      ...existing,
      popupSeenAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.records.set(existing.id, updated);
    return { ...updated };
  }
}
