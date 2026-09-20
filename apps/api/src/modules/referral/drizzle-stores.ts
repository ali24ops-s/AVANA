/**
 * Drizzle PostgreSQL Implementation of ReferralStore.
 */

import { randomUUID } from "node:crypto";
import { eq, desc, and, sql, or, gt, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DbClient } from "@avana/database/client";
import {
  referralCodes,
  referrals,
  systemConfigurations,
  users,
  orders,
  userDevices,
  userSubscriptions,
  userEntitlements,
  products,
} from "@avana/database/schema";
import {
  type AdminReferralListItemDto,
  type ReferralCodeRecord,
  type ReferralRecord,
  type ReferralSystemConfig,
  type UserId,
  type ReferralId,
  type UUID,
  asUserId,
  asReferralId,
  asReferralCodeId,
  asOrderId,
  asPaymentId,
  asWalletTransactionId,
  calculateSubscriptionExpiry,
  normalizeReferralCode,
  DEFAULT_REFERRAL_SYSTEM_CONFIG,
  REFERRAL_SYSTEM_CONFIG_KEY,
} from "@avana/domain";
import type {
  ReferralStore,
  ProcessRegistrationReferralParams,
  ProcessRegistrationReferralResult,
} from "./referral-store.js";

export class DrizzleReferralStore implements ReferralStore {
  constructor(public readonly db: DbClient) {}

  private mapReferralCode(row: typeof referralCodes.$inferSelect): ReferralCodeRecord {
    return {
      id: asReferralCodeId(row.id as UUID),
      userId: asUserId(row.userId as UUID),
      code: row.code,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private mapReferral(row: typeof referrals.$inferSelect): ReferralRecord {
    return {
      id: asReferralId(row.id as UUID),
      inviterUserId: asUserId(row.inviterUserId as UUID),
      invitedUserId: asUserId(row.invitedUserId as UUID),
      referralCodeId: asReferralCodeId(row.referralCodeId as UUID),
      status: row.status as ReferralRecord["status"],
      qualifyingOrderId: row.qualifyingOrderId ? asOrderId(row.qualifyingOrderId as UUID) : null,
      qualifyingPaymentId: row.qualifyingPaymentId ? asPaymentId(row.qualifyingPaymentId as UUID) : null,
      qualifiedAt: row.qualifiedAt ? row.qualifiedAt.toISOString() : null,
      rewardType: (row.rewardType || "subscription_days") as ReferralRecord["rewardType"],
      rewardAmount: row.rewardAmount,
      rewardStatus: (row.rewardStatus || "pending") as ReferralRecord["rewardStatus"],
      rewardedAt: row.rewardedAt ? row.rewardedAt.toISOString() : null,
      walletTransactionId: row.walletTransactionId ? asWalletTransactionId(row.walletTransactionId as UUID) : null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async findReferralCodeByUserId(userId: UserId): Promise<ReferralCodeRecord | null> {
    const [row] = await this.db
      .select()
      .from(referralCodes)
      .where(eq(referralCodes.userId, userId))
      .limit(1);

    return row ? this.mapReferralCode(row) : null;
  }

  async findReferralCodeByCode(code: string): Promise<ReferralCodeRecord | null> {
    const normalized = normalizeReferralCode(code);
    if (!normalized) return null;

    const [row] = await this.db
      .select()
      .from(referralCodes)
      .where(eq(sql`UPPER(${referralCodes.code})`, normalized))
      .limit(1);

    return row ? this.mapReferralCode(row) : null;
  }

  async createReferralCode(codeRecord: ReferralCodeRecord): Promise<ReferralCodeRecord> {
    const [row] = await this.db
      .insert(referralCodes)
      .values({
        id: codeRecord.id,
        userId: codeRecord.userId,
        code: codeRecord.code.toUpperCase(),
        createdAt: new Date(codeRecord.createdAt),
        updatedAt: new Date(codeRecord.updatedAt),
      })
      .returning();

    return this.mapReferralCode(row);
  }

  async findReferralByInvitedUserId(invitedUserId: UserId): Promise<ReferralRecord | null> {
    const [row] = await this.db
      .select()
      .from(referrals)
      .where(eq(referrals.invitedUserId, invitedUserId))
      .limit(1);

    return row ? this.mapReferral(row) : null;
  }

  async findReferralById(id: ReferralId): Promise<ReferralRecord | null> {
    const [row] = await this.db
      .select()
      .from(referrals)
      .where(eq(referrals.id, id))
      .limit(1);

    return row ? this.mapReferral(row) : null;
  }

  async createReferral(referral: ReferralRecord): Promise<ReferralRecord> {
    const [row] = await this.db
      .insert(referrals)
      .values({
        id: referral.id,
        inviterUserId: referral.inviterUserId,
        invitedUserId: referral.invitedUserId,
        referralCodeId: referral.referralCodeId,
        status: referral.status,
        qualifyingOrderId: referral.qualifyingOrderId,
        qualifyingPaymentId: referral.qualifyingPaymentId,
        qualifiedAt: referral.qualifiedAt ? new Date(referral.qualifiedAt) : null,
        rewardType: referral.rewardType,
        rewardAmount: referral.rewardAmount,
        rewardStatus: referral.rewardStatus,
        rewardedAt: referral.rewardedAt ? new Date(referral.rewardedAt) : null,
        walletTransactionId: referral.walletTransactionId,
        metadata: referral.metadata,
        createdAt: new Date(referral.createdAt),
        updatedAt: new Date(referral.updatedAt),
      })
      .returning();

    return this.mapReferral(row);
  }

  async updateReferral(referral: ReferralRecord): Promise<ReferralRecord> {
    const [row] = await this.db
      .update(referrals)
      .set({
        status: referral.status,
        qualifyingOrderId: referral.qualifyingOrderId,
        qualifyingPaymentId: referral.qualifyingPaymentId,
        qualifiedAt: referral.qualifiedAt ? new Date(referral.qualifiedAt) : null,
        rewardType: referral.rewardType,
        rewardAmount: referral.rewardAmount,
        rewardStatus: referral.rewardStatus,
        rewardedAt: referral.rewardedAt ? new Date(referral.rewardedAt) : null,
        walletTransactionId: referral.walletTransactionId,
        metadata: referral.metadata,
        updatedAt: new Date(),
      })
      .where(eq(referrals.id, referral.id))
      .returning();

    return this.mapReferral(row);
  }

  async isDeviceLinkedToUser(deviceId: string, userId: UserId): Promise<boolean> {
    if (!deviceId) return false;
    const [row] = await this.db
      .select({ id: userDevices.id })
      .from(userDevices)
      .where(
        and(
          eq(userDevices.userId, userId),
          eq(userDevices.deviceId, deviceId),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async hasDeviceClaimedRewardForInviter(
    deviceId: string,
    inviterUserId: UserId,
  ): Promise<boolean> {
    if (!deviceId) return false;
    const [row] = await this.db
      .select({ id: referrals.id })
      .from(referrals)
      .where(
        and(
          eq(referrals.inviterUserId, inviterUserId),
          eq(referrals.rewardStatus, "completed"),
          sql`${referrals.metadata}->>'deviceId' = ${deviceId}`,
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /**
   * Atomic Registration Referral & Subscription Grant under Inviter Lock.
   */
  async processRegistrationReferral(
    params: ProcessRegistrationReferralParams,
  ): Promise<ProcessRegistrationReferralResult> {
    const {
      referralId,
      inviterUserId,
      invitedUserId,
      referralCodeId,
      deviceId,
      ip,
      userAgent,
      durationDays = 15,
      maxRewardedReferrals = 4,
      metadata = {},
    } = params;

    const now = new Date();

    return await this.db.transaction(async (tx) => {
      // 1. Lock inviter user row to serialize concurrent referrals for this inviter
      await tx.execute(
        sql`SELECT id FROM users WHERE id = ${inviterUserId}::uuid FOR UPDATE`,
      );

      // 2. Check Device Abuse if deviceId is provided
      let isAbuse = false;
      let abuseReason: string | undefined;

      if (deviceId) {
        // Check A: Is this device owned by the inviter (self-device referral)?
        const [selfDevice] = await tx
          .select({ id: userDevices.id })
          .from(userDevices)
          .where(
            and(
              eq(userDevices.userId, inviterUserId),
              eq(userDevices.deviceId, deviceId),
            ),
          )
          .limit(1);

        if (selfDevice) {
          isAbuse = true;
          abuseReason = "self_device";
        } else {
          // Check B: Has this device already been used to earn a completed reward for this inviter?
          const [duplicateDevice] = await tx
            .select({ id: referrals.id })
            .from(referrals)
            .where(
              and(
                eq(referrals.inviterUserId, inviterUserId),
                eq(referrals.rewardStatus, "completed"),
                sql`${referrals.metadata}->>'deviceId' = ${deviceId}`,
              ),
            )
            .limit(1);

          if (duplicateDevice) {
            isAbuse = true;
            abuseReason = "duplicate_device_for_inviter";
          }
        }
      }

      // If abuse detected: Record referral as abuse_rejected with 0 reward, do NOT grant subscription
      if (isAbuse) {
        const [abuseRef] = await tx
          .insert(referrals)
          .values({
            id: referralId,
            inviterUserId,
            invitedUserId,
            referralCodeId,
            status: "pending",
            qualifyingOrderId: null,
            qualifyingPaymentId: null,
            qualifiedAt: null,
            rewardType: "subscription_days",
            rewardAmount: 0,
            rewardStatus: "abuse_rejected",
            rewardedAt: null,
            walletTransactionId: null,
            metadata: {
              ...metadata,
              deviceId: deviceId ?? null,
              ip: ip ?? null,
              userAgent: userAgent ?? null,
              abuseReason,
            },
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        return {
          referral: this.mapReferral(abuseRef),
          rewarded: false,
          abuse: true,
          limitReached: false,
        };
      }

      // 3. Count completed rewards for inviter under lock
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(referrals)
        .where(
          and(
            eq(referrals.inviterUserId, inviterUserId),
            eq(referrals.rewardStatus, "completed"),
          ),
        );

      // 4. Case A: Under cap (< 4) -> Grant 15 days subscription
      if (count < maxRewardedReferrals) {
        // Query inviter's active subscription in userSubscriptions
        const [activeSub] = await tx
          .select({ expiresAt: userSubscriptions.expiresAt })
          .from(userSubscriptions)
          .where(
            and(
              eq(userSubscriptions.userId, inviterUserId),
              or(
                eq(userSubscriptions.status, "active"),
                eq(userSubscriptions.status, "active_pending_payment_review"),
              ),
              gt(userSubscriptions.expiresAt, now),
            ),
          )
          .orderBy(desc(userSubscriptions.expiresAt))
          .limit(1);

        // Query inviter's active entitlement in userEntitlements
        const [activeEnt] = await tx
          .select({ expiresAt: userEntitlements.expiresAt })
          .from(userEntitlements)
          .where(
            and(
              eq(userEntitlements.userId, inviterUserId),
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
        const newExpiryDate = calculateSubscriptionExpiry(baseDate, durationDays);

        // Fetch standard subscription product for linking
        const [subProduct] = await tx
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.type, "subscription"), isNull(products.deletedAt)))
          .limit(1);

        const subProductId = subProduct ? subProduct.id : randomUUID();

        // Insert userSubscriptions business record
        await tx.insert(userSubscriptions).values({
          id: randomUUID(),
          userId: inviterUserId,
          productId: subProductId,
          orderId: null,
          status: "active",
          startedAt: now,
          expiresAt: newExpiryDate,
          createdAt: now,
          updatedAt: now,
        });

        // Insert / update userEntitlements access record
        await tx.insert(userEntitlements).values({
          id: randomUUID(),
          userId: inviterUserId,
          resourceType: "subscription",
          resourceId: null,
          sourceType: "gift",
          orderId: null,
          startsAt: now,
          expiresAt: newExpiryDate,
          createdAt: now,
          updatedAt: now,
        });

        // Insert rewarded referral
        const [rewardedRef] = await tx
          .insert(referrals)
          .values({
            id: referralId,
            inviterUserId,
            invitedUserId,
            referralCodeId,
            status: "rewarded",
            qualifyingOrderId: null,
            qualifyingPaymentId: null,
            qualifiedAt: now,
            rewardType: "subscription_days",
            rewardAmount: durationDays,
            rewardStatus: "completed",
            rewardedAt: now,
            walletTransactionId: null,
            metadata: {
              ...metadata,
              deviceId: deviceId ?? null,
              ip: ip ?? null,
              userAgent: userAgent ?? null,
              rewardedDays: durationDays,
              newExpiry: newExpiryDate.toISOString(),
            },
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        return {
          referral: this.mapReferral(rewardedRef),
          rewarded: true,
          abuse: false,
          limitReached: false,
          newExpiry: newExpiryDate.toISOString(),
        };
      }

      // 5. Case B: Cap reached (>= 4) -> Record referral as qualified / limit_reached, 0 reward
      const [limitRef] = await tx
        .insert(referrals)
        .values({
          id: referralId,
          inviterUserId,
          invitedUserId,
          referralCodeId,
          status: "qualified",
          qualifyingOrderId: null,
          qualifyingPaymentId: null,
          qualifiedAt: now,
          rewardType: "subscription_days",
          rewardAmount: 0,
          rewardStatus: "limit_reached",
          rewardedAt: null,
          walletTransactionId: null,
          metadata: {
            ...metadata,
            deviceId: deviceId ?? null,
            ip: ip ?? null,
            userAgent: userAgent ?? null,
            reason: "max_rewards_reached",
          },
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return {
        referral: this.mapReferral(limitRef),
        rewarded: false,
        abuse: false,
        limitReached: true,
      };
    });
  }

  async listReferralsByInviter(
    inviterUserId: UserId,
    limit = 20,
    offset = 0,
  ): Promise<{ referrals: ReferralRecord[]; total: number }> {
    const rows = await this.db
      .select()
      .from(referrals)
      .where(eq(referrals.inviterUserId, inviterUserId))
      .orderBy(desc(referrals.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(referrals)
      .where(eq(referrals.inviterUserId, inviterUserId));

    return {
      referrals: rows.map((r) => this.mapReferral(r)),
      total: count,
    };
  }

  async getInviterStats(inviterUserId: UserId): Promise<{
    totalInvites: number;
    pendingCount: number;
    rewardedCount: number;
    rewardedDays: number;
    totalRewardAmount: number;
    isLimitReached: boolean;
  }> {
    const rows = await this.db
      .select({
        status: referrals.status,
        rewardAmount: referrals.rewardAmount,
        rewardStatus: referrals.rewardStatus,
      })
      .from(referrals)
      .where(eq(referrals.inviterUserId, inviterUserId));

    const totalInvites = rows.length;
    let pendingCount = 0;
    let rewardedCount = 0;
    let rewardedDays = 0;

    for (const r of rows) {
      if (r.rewardStatus === "completed" || r.status === "rewarded") {
        rewardedCount++;
        rewardedDays += r.rewardAmount > 0 ? r.rewardAmount : 15;
      } else if (r.status === "pending" && r.rewardStatus === "pending") {
        pendingCount++;
      }
    }

    return {
      totalInvites,
      pendingCount,
      rewardedCount,
      rewardedDays,
      totalRewardAmount: rewardedDays,
      isLimitReached: rewardedCount >= 4,
    };
  }

  async listAllReferrals(
    filter?: { status?: string },
    limit = 50,
    offset = 0,
  ): Promise<{ referrals: AdminReferralListItemDto[]; total: number }> {
    const inviterUser = alias(users, "inviter_user");
    const invitedUser = alias(users, "invited_user");

    const whereClause = filter?.status
      ? eq(referrals.status, filter.status)
      : undefined;

    const baseQuery = this.db
      .select({
        id: referrals.id,
        inviterUserId: referrals.inviterUserId,
        inviterName: inviterUser.name,
        inviterEmail: inviterUser.email,
        inviterPhone: inviterUser.phoneNumber,
        invitedUserId: referrals.invitedUserId,
        invitedName: invitedUser.name,
        invitedEmail: invitedUser.email,
        invitedPhone: invitedUser.phoneNumber,
        referralCode: referralCodes.code,
        status: referrals.status,
        qualifyingOrderId: referrals.qualifyingOrderId,
        qualifyingOrderNumber: orders.orderNumber,
        rewardType: referrals.rewardType,
        rewardAmount: referrals.rewardAmount,
        rewardStatus: referrals.rewardStatus,
        qualifiedAt: referrals.qualifiedAt,
        rewardedAt: referrals.rewardedAt,
        createdAt: referrals.createdAt,
      })
      .from(referrals)
      .innerJoin(inviterUser, eq(referrals.inviterUserId, inviterUser.id))
      .innerJoin(invitedUser, eq(referrals.invitedUserId, invitedUser.id))
      .innerJoin(referralCodes, eq(referrals.referralCodeId, referralCodes.id))
      .leftJoin(orders, eq(referrals.qualifyingOrderId, orders.id));

    const rows = await (whereClause
      ? baseQuery.where(whereClause)
      : baseQuery
    )
      .orderBy(desc(referrals.createdAt))
      .limit(limit)
      .offset(offset);

    const countQuery = this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(referrals);

    const [{ count }] = await (whereClause
      ? countQuery.where(whereClause)
      : countQuery);

    const dtos: AdminReferralListItemDto[] = rows.map((r) => ({
      id: r.id,
      inviterUserId: r.inviterUserId,
      inviterName: r.inviterName,
      inviterEmail: r.inviterEmail,
      inviterPhone: r.inviterPhone,
      invitedUserId: r.invitedUserId,
      invitedName: r.invitedName,
      invitedEmail: r.invitedEmail,
      invitedPhone: r.invitedPhone,
      referralCode: r.referralCode,
      status: r.status as ReferralRecord["status"],
      qualifyingOrderId: r.qualifyingOrderId,
      qualifyingOrderNumber: r.qualifyingOrderNumber,
      rewardType: (r.rewardType || "subscription_days") as ReferralRecord["rewardType"],
      rewardAmount: r.rewardAmount,
      rewardStatus: (r.rewardStatus || "pending") as ReferralRecord["rewardStatus"],
      qualifiedAt: r.qualifiedAt ? r.qualifiedAt.toISOString() : null,
      rewardedAt: r.rewardedAt ? r.rewardedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      referrals: dtos,
      total: count,
    };
  }

  async listPendingOrFailedRewardReferrals(): Promise<ReferralRecord[]> {
    return this.db
      .select()
      .from(referrals)
      .where(
        and(
          eq(referrals.status, "qualified"),
          or(
            eq(referrals.rewardStatus, "pending"),
            eq(referrals.rewardStatus, "failed"),
          ),
        ),
      )
      .then((rows) => rows.map((r) => this.mapReferral(r)));
  }

  async getReferralSystemConfig(): Promise<ReferralSystemConfig> {
    const [row] = await this.db
      .select()
      .from(systemConfigurations)
      .where(eq(systemConfigurations.key, REFERRAL_SYSTEM_CONFIG_KEY))
      .limit(1);

    if (!row || !row.value) {
      return { ...DEFAULT_REFERRAL_SYSTEM_CONFIG };
    }

    const val = row.value as Record<string, unknown>;
    return {
      enabled: typeof val.enabled === "boolean" ? val.enabled : true,
      rewardDays: typeof val.rewardDays === "number" ? val.rewardDays : (typeof val.rewardAmount === "number" ? val.rewardAmount : 15),
      maxRewardedReferrals: typeof val.maxRewardedReferrals === "number" ? val.maxRewardedReferrals : 4,
      maxRewardDays: typeof val.maxRewardDays === "number" ? val.maxRewardDays : 60,
      rewardAmount: typeof val.rewardDays === "number" ? val.rewardDays : 15,
      rewardType: (val.rewardType as ReferralRecord["rewardType"]) || "subscription_days",
    };
  }

  async updateReferralSystemConfig(
    adminId: UserId,
    config: Partial<ReferralSystemConfig>,
  ): Promise<ReferralSystemConfig> {
    const current = await this.getReferralSystemConfig();
    const updated: ReferralSystemConfig = {
      ...current,
      ...config,
      rewardAmount: config.rewardDays ?? config.rewardAmount ?? current.rewardDays,
    };

    const now = new Date();
    await this.db
      .insert(systemConfigurations)
      .values({
        key: REFERRAL_SYSTEM_CONFIG_KEY,
        value: updated as unknown as Record<string, unknown>,
        updatedBy: adminId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: systemConfigurations.key,
        set: {
          value: updated as unknown as Record<string, unknown>,
          updatedBy: adminId,
          updatedAt: now,
        },
      });

    return updated;
  }
}
