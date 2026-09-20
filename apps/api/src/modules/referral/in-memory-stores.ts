/**
 * In-Memory Implementation of ReferralStore for unit testing.
 */

import { randomUUID } from "node:crypto";
import {
  type AdminReferralListItemDto,
  type ReferralCodeRecord,
  type ReferralRecord,
  type ReferralSystemConfig,
  type UserId,
  type ReferralId,
  type UserSubscriptionRecord,
  type UserEntitlementRecord,
  asUserSubscriptionId,
  asUserEntitlementId,
  asProductId,
  calculateSubscriptionExpiry,
  normalizeReferralCode,
  DEFAULT_REFERRAL_SYSTEM_CONFIG,
} from "@avana/domain";
import type {
  ReferralStore,
  ProcessRegistrationReferralParams,
  ProcessRegistrationReferralResult,
} from "./referral-store.js";

export class InMemoryReferralStore implements ReferralStore {
  public referralCodes: ReferralCodeRecord[] = [];
  public referrals: ReferralRecord[] = [];
  public config: ReferralSystemConfig = { ...DEFAULT_REFERRAL_SYSTEM_CONFIG };
  public userSubscriptions: UserSubscriptionRecord[] = [];
  public userEntitlements: UserEntitlementRecord[] = [];
  public userDevices: Array<{ userId: UserId; deviceId: string; deviceType?: string }> = [];

  async findReferralCodeByUserId(userId: UserId): Promise<ReferralCodeRecord | null> {
    return this.referralCodes.find((c) => c.userId === userId) ?? null;
  }

  async findReferralCodeByCode(code: string): Promise<ReferralCodeRecord | null> {
    const normalized = normalizeReferralCode(code);
    if (!normalized) return null;
    return this.referralCodes.find((c) => c.code.toUpperCase() === normalized) ?? null;
  }

  async createReferralCode(codeRecord: ReferralCodeRecord): Promise<ReferralCodeRecord> {
    const existing = this.referralCodes.find((c) => c.userId === codeRecord.userId);
    if (existing) {
      return existing;
    }
    const record = { ...codeRecord, code: codeRecord.code.toUpperCase() };
    this.referralCodes.push(record);
    return record;
  }

  async findReferralByInvitedUserId(invitedUserId: UserId): Promise<ReferralRecord | null> {
    return this.referrals.find((r) => r.invitedUserId === invitedUserId) ?? null;
  }

  async findReferralById(id: ReferralId): Promise<ReferralRecord | null> {
    return this.referrals.find((r) => r.id === id) ?? null;
  }

  async createReferral(referral: ReferralRecord): Promise<ReferralRecord> {
    const existing = this.referrals.find((r) => r.invitedUserId === referral.invitedUserId);
    if (existing) {
      throw new Error(`Referral already exists for invited user ${referral.invitedUserId}`);
    }
    this.referrals.push({ ...referral });
    return referral;
  }

  async updateReferral(referral: ReferralRecord): Promise<ReferralRecord> {
    const idx = this.referrals.findIndex((r) => r.id === referral.id);
    if (idx === -1) {
      throw new Error(`Referral not found: ${referral.id}`);
    }
    this.referrals[idx] = { ...referral, updatedAt: new Date().toISOString() };
    return this.referrals[idx];
  }

  async isDeviceLinkedToUser(deviceId: string, userId: UserId): Promise<boolean> {
    if (!deviceId) return false;
    return this.userDevices.some(
      (d) => d.userId === userId && d.deviceId === deviceId,
    );
  }

  async hasDeviceClaimedRewardForInviter(
    deviceId: string,
    inviterUserId: UserId,
  ): Promise<boolean> {
    if (!deviceId) return false;
    return this.referrals.some(
      (r) =>
        r.inviterUserId === inviterUserId &&
        r.rewardStatus === "completed" &&
        r.metadata?.deviceId === deviceId,
    );
  }

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
    const nowIso = now.toISOString();

    // 1. Check duplicate referral for invited user
    const existing = this.referrals.find((r) => r.invitedUserId === invitedUserId);
    if (existing) {
      return {
        referral: existing,
        rewarded: existing.rewardStatus === "completed",
        abuse: existing.rewardStatus === "abuse_rejected",
        limitReached: existing.rewardStatus === "limit_reached",
      };
    }

    // 2. Check Device Abuse if deviceId provided
    let isAbuse = false;
    let abuseReason: string | undefined;

    if (deviceId) {
      const isSelfDevice = this.userDevices.some(
        (d) => d.userId === inviterUserId && d.deviceId === deviceId,
      );
      if (isSelfDevice) {
        isAbuse = true;
        abuseReason = "self_device";
      } else {
        const isDuplicateDevice = this.referrals.some(
          (r) =>
            r.inviterUserId === inviterUserId &&
            r.rewardStatus === "completed" &&
            r.metadata?.deviceId === deviceId,
        );
        if (isDuplicateDevice) {
          isAbuse = true;
          abuseReason = "duplicate_device_for_inviter";
        }
      }
    }

    if (isAbuse) {
      const abuseRef: ReferralRecord = {
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
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.referrals.push(abuseRef);
      return {
        referral: abuseRef,
        rewarded: false,
        abuse: true,
        limitReached: false,
      };
    }

    // 3. Check reward count
    const completedCount = this.referrals.filter(
      (r) => r.inviterUserId === inviterUserId && r.rewardStatus === "completed",
    ).length;

    if (completedCount < maxRewardedReferrals) {
      // Find active subscription / entitlement for inviter
      const activeSubs = this.userSubscriptions.filter(
        (s) =>
          s.userId === inviterUserId &&
          s.status === "active" &&
          new Date(s.expiresAt).getTime() > now.getTime(),
      );
      activeSubs.sort(
        (a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime(),
      );

      const activeEnts = this.userEntitlements.filter(
        (e) =>
          e.userId === inviterUserId &&
          e.resourceType === "subscription" &&
          (!e.expiresAt || new Date(e.expiresAt).getTime() > now.getTime()),
      );
      activeEnts.sort((a, b) => {
        if (!a.expiresAt) return 1;
        if (!b.expiresAt) return -1;
        return new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime();
      });

      let latestExpiry: Date | null = null;
      if (activeSubs[0]) {
        latestExpiry = new Date(activeSubs[0].expiresAt);
      }
      if (activeEnts[0]?.expiresAt) {
        const entExpiry = new Date(activeEnts[0].expiresAt);
        if (!latestExpiry || entExpiry.getTime() > latestExpiry.getTime()) {
          latestExpiry = entExpiry;
        }
      }

      const baseDate = latestExpiry && latestExpiry.getTime() > now.getTime() ? latestExpiry : now;
      const newExpiryDate = calculateSubscriptionExpiry(baseDate, durationDays);
      const newExpiryIso = newExpiryDate.toISOString();

      const subRecord: UserSubscriptionRecord = {
        id: asUserSubscriptionId(randomUUID()),
        userId: inviterUserId,
        productId: asProductId("sub_monthly"),
        orderId: null,
        status: "active",
        startedAt: nowIso,
        expiresAt: newExpiryIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.userSubscriptions.push(subRecord);

      const entRecord: UserEntitlementRecord = {
        id: asUserEntitlementId(randomUUID()),
        userId: inviterUserId,
        resourceType: "subscription",
        resourceId: null,
        sourceType: "gift",
        orderId: null,
        startsAt: nowIso,
        expiresAt: newExpiryIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.userEntitlements.push(entRecord);

      const rewardedRef: ReferralRecord = {
        id: referralId,
        inviterUserId,
        invitedUserId,
        referralCodeId,
        status: "rewarded",
        qualifyingOrderId: null,
        qualifyingPaymentId: null,
        qualifiedAt: nowIso,
        rewardType: "subscription_days",
        rewardAmount: durationDays,
        rewardStatus: "completed",
        rewardedAt: nowIso,
        walletTransactionId: null,
        metadata: {
          ...metadata,
          deviceId: deviceId ?? null,
          ip: ip ?? null,
          userAgent: userAgent ?? null,
          rewardedDays: durationDays,
          newExpiry: newExpiryIso,
        },
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      this.referrals.push(rewardedRef);

      return {
        referral: rewardedRef,
        rewarded: true,
        abuse: false,
        limitReached: false,
        newExpiry: newExpiryIso,
      };
    }

    // Limit reached
    const limitRef: ReferralRecord = {
      id: referralId,
      inviterUserId,
      invitedUserId,
      referralCodeId,
      status: "qualified",
      qualifyingOrderId: null,
      qualifyingPaymentId: null,
      qualifiedAt: nowIso,
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
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.referrals.push(limitRef);

    return {
      referral: limitRef,
      rewarded: false,
      abuse: false,
      limitReached: true,
    };
  }

  async listReferralsByInviter(
    inviterUserId: UserId,
    limit = 20,
    offset = 0,
  ): Promise<{ referrals: ReferralRecord[]; total: number }> {
    const filtered = this.referrals.filter((r) => r.inviterUserId === inviterUserId);
    const total = filtered.length;
    const sorted = [...filtered].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const paginated = sorted.slice(offset, offset + limit);
    return { referrals: paginated, total };
  }

  async getInviterStats(inviterUserId: UserId): Promise<{
    totalInvites: number;
    pendingCount: number;
    rewardedCount: number;
    rewardedDays: number;
    totalRewardAmount: number;
    isLimitReached: boolean;
  }> {
    const filtered = this.referrals.filter((r) => r.inviterUserId === inviterUserId);
    const totalInvites = filtered.length;
    let pendingCount = 0;
    let rewardedCount = 0;
    let rewardedDays = 0;

    for (const r of filtered) {
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
    let filtered = [...this.referrals];
    if (filter?.status) {
      filtered = filtered.filter((r) => r.status === filter.status);
    }
    const total = filtered.length;
    const sorted = filtered.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    const paginated = sorted.slice(offset, offset + limit);

    const dtos: AdminReferralListItemDto[] = paginated.map((r) => {
      const codeRec = this.referralCodes.find((c) => c.id === r.referralCodeId);
      return {
        id: r.id,
        inviterUserId: r.inviterUserId,
        invitedUserId: r.invitedUserId,
        referralCode: codeRec?.code ?? "",
        status: r.status,
        qualifyingOrderId: r.qualifyingOrderId,
        rewardType: r.rewardType,
        rewardAmount: r.rewardAmount,
        rewardStatus: r.rewardStatus,
        qualifiedAt: r.qualifiedAt,
        rewardedAt: r.rewardedAt,
        createdAt: r.createdAt,
      };
    });

    return { referrals: dtos, total };
  }

  async listPendingOrFailedRewardReferrals(): Promise<ReferralRecord[]> {
    return this.referrals.filter(
      (r) =>
        r.status === "qualified" &&
        (r.rewardStatus === "pending" || r.rewardStatus === "failed"),
    );
  }

  async getReferralSystemConfig(): Promise<ReferralSystemConfig> {
    return { ...this.config };
  }

  async updateReferralSystemConfig(
    _adminId: UserId,
    config: Partial<ReferralSystemConfig>,
  ): Promise<ReferralSystemConfig> {
    this.config = {
      enabled: config?.enabled ?? this.config.enabled ?? true,
      rewardDays: config?.rewardDays ?? (config?.rewardAmount ? config.rewardAmount : this.config.rewardDays ?? 15),
      maxRewardedReferrals: config?.maxRewardedReferrals ?? this.config.maxRewardedReferrals ?? 4,
      maxRewardDays: config?.maxRewardDays ?? this.config.maxRewardDays ?? 60,
      rewardAmount: config?.rewardDays ?? (config?.rewardAmount ? config.rewardAmount : this.config.rewardDays ?? 15),
      rewardType: config?.rewardType ?? this.config.rewardType ?? "subscription_days",
    };
    return { ...this.config };
  }
}
