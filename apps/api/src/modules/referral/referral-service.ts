/**
 * ReferralService — Referral Code Generation, Registration Attachment,
 * Immediate Qualification, and Atomic 15-Day Subscription Grants.
 */

import { randomUUID } from "node:crypto";
import {
  type Actor,
  type UserId,
  type ReferralCodeRecord,
  type ReferralRecord,
  type UserReferralSummaryDto,
  type UserReferralHistoryItemDto,
  type AdminReferralListItemDto,
  type ReferralSystemConfig,
  asReferralId,
  asReferralCodeId,
  generateRandomReferralCode,
  normalizeReferralCode,
  DomainError,
} from "@avana/domain";
import type { ReferralStore } from "./referral-store.js";
import type { WalletService } from "../wallet/wallet-service.js";
import type { NotificationService } from "../notifications/notification-service.js";
import type { AuditService } from "../../observability/audit-service.js";

export class ReferralService {
  constructor(
    private readonly store: ReferralStore,
    _walletService?: WalletService,
    private readonly notificationService?: NotificationService,
    private readonly auditService?: AuditService,
  ) {}

  /**
   * Retrieves or lazily creates a unique referral code for a user.
   * Collision-safe with automatic retries.
   */
  async getOrCreateReferralCode(userId: UserId): Promise<ReferralCodeRecord> {
    const existing = await this.store.findReferralCodeByUserId(userId);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
      attempts++;
      const code = generateRandomReferralCode();
      const codeConflict = await this.store.findReferralCodeByCode(code);
      if (codeConflict) {
        continue;
      }

      try {
        const newRecord: ReferralCodeRecord = {
          id: asReferralCodeId(randomUUID()),
          userId,
          code,
          createdAt: now,
          updatedAt: now,
        };
        return await this.store.createReferralCode(newRecord);
      } catch {
        // In case of a race condition on concurrent generation, check if code was already created for user
        const raceWinner = await this.store.findReferralCodeByUserId(userId);
        if (raceWinner) {
          return raceWinner;
        }
      }
    }

    throw new DomainError(
      "internal_error",
      "Failed to generate unique referral code after multiple attempts",
    );
  }

  /**
   * Processes a referral on user registration:
   * 1. Validates referral code format & resolves inviter.
   * 2. Rejects self-referrals (by User ID & Device ID).
   * 3. Prevents duplicate referral attachment on same invited account.
   * 4. Enforces Device Abuse Prevention (1 rewarded account per device for this inviter).
   * 5. Atomically grants +15 days free subscription to inviter under inviter row lock (up to 4 referrals / 60 days max).
   *
   * User registration NEVER fails due to referral errors (graceful degradation).
   */
  async processReferralOnRegister(params: {
    invitedUserId: UserId;
    referralCode?: string;
    deviceId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
  }): Promise<{
    success: boolean;
    referral?: ReferralRecord;
    rewarded?: boolean;
    abuse?: boolean;
    limitReached?: boolean;
    reason?: string;
  }> {
    const { invitedUserId, referralCode, deviceId, ip, userAgent } = params;
    if (!referralCode || !referralCode.trim()) {
      return { success: false, reason: "no_code" };
    }

    const normalized = normalizeReferralCode(referralCode);
    const codeRecord = await this.store.findReferralCodeByCode(normalized);
    if (!codeRecord) {
      return { success: false, reason: "invalid_code" };
    }

    if (codeRecord.userId === invitedUserId) {
      return { success: false, reason: "self_referral" };
    }

    const existingReferral =
      await this.store.findReferralByInvitedUserId(invitedUserId);
    if (existingReferral) {
      return {
        success: false,
        referral: existingReferral,
        reason: "already_referred",
      };
    }

    const config = await this.store.getReferralSystemConfig();
    const durationDays = config.rewardDays ?? 15;
    const maxRewardedReferrals = config.maxRewardedReferrals ?? 4;

    const referralId = asReferralId(randomUUID());
    const now = new Date().toISOString();

    try {
      const result = await this.store.processRegistrationReferral({
        referralId,
        inviterUserId: codeRecord.userId,
        invitedUserId,
        referralCodeId: codeRecord.id,
        deviceId: deviceId?.trim() || null,
        ip: ip ?? null,
        userAgent: userAgent ?? null,
        durationDays,
        maxRewardedReferrals,
      });

      if (this.auditService) {
        await this.auditService.emit([
          {
            actorId: invitedUserId,
            organizationId: null,
            action: result.abuse
              ? "referral.abuse_rejected"
              : result.rewarded
                ? "referral.rewarded"
                : "referral.attached",
            entityType: "referral",
            entityId: result.referral.id,
            createdAt: now,
            details: {
              inviterUserId: result.referral.inviterUserId,
              invitedUserId: result.referral.invitedUserId,
              referralCode: normalized,
              rewarded: result.rewarded,
              rewardDays: result.referral.rewardAmount,
              abuse: result.abuse,
              limitReached: result.limitReached,
              deviceId: deviceId ?? null,
            },
          },
        ]);
      }

      if (result.rewarded && this.notificationService) {
        void this.notificationService.notifyReferralRewardEarned(
          result.referral.inviterUserId,
          {
            referralId: result.referral.id,
            amount: result.referral.rewardAmount,
            invitedUserId: result.referral.invitedUserId,
          },
        );
      }

      return {
        success: true,
        referral: result.referral,
        rewarded: result.rewarded,
        abuse: result.abuse,
        limitReached: result.limitReached,
      };
    } catch {
      const raceWinner =
        await this.store.findReferralByInvitedUserId(invitedUserId);
      if (raceWinner) {
        return {
          success: false,
          referral: raceWinner,
          reason: "already_referred",
        };
      }
      return { success: false, reason: "internal_error" };
    }
  }

  /**
   * Backward-compatible alias for processReferralOnRegister.
   */
  async attachReferralOnRegister(params: {
    invitedUserId: UserId;
    referralCode?: string;
    deviceId?: string | null;
  }): Promise<{ success: boolean; referral?: ReferralRecord; reason?: string }> {
    return this.processReferralOnRegister(params);
  }

  /**
   * Retries subscription grants for any qualified referrals whose rewards are pending or failed.
   */
  async retryPendingRewards(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
  }> {
    const pending = await this.store.listPendingOrFailedRewardReferrals();
    let succeeded = 0;
    let failed = 0;

    const config = await this.store.getReferralSystemConfig();
    const durationDays = config.rewardDays ?? 15;
    const maxRewardedReferrals = config.maxRewardedReferrals ?? 4;

    for (const ref of pending) {
      try {
        const result = await this.store.processRegistrationReferral({
          referralId: ref.id,
          inviterUserId: ref.inviterUserId,
          invitedUserId: ref.invitedUserId,
          referralCodeId: ref.referralCodeId,
          deviceId: (ref.metadata?.deviceId as string) ?? null,
          durationDays,
          maxRewardedReferrals,
        });

        if (result.rewarded) {
          succeeded++;
        }
      } catch {
        failed++;
      }
    }

    return {
      processed: pending.length,
      succeeded,
      failed,
    };
  }

  /**
   * Returns current user's referral summary, code, invite link, and stats.
   */
  async getMyReferralSummary(
    actor: Actor,
    baseUrl = "https://aavana.ir",
  ): Promise<UserReferralSummaryDto> {
    if (!actor.userId) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const codeRecord = await this.getOrCreateReferralCode(actor.userId);
    const stats = await this.store.getInviterStats(actor.userId);
    const cleanBaseUrl = baseUrl.replace(/\/+$/, "");

    return {
      referralCode: codeRecord.code,
      inviteUrl: `${cleanBaseUrl}/register?ref=${codeRecord.code}`,
      totalInvites: stats.totalInvites,
      pendingCount: stats.pendingCount,
      rewardedCount: stats.rewardedCount,
      rewardedDays: stats.rewardedDays,
      totalRewardAmount: stats.totalRewardAmount,
      maxReferrals: 4,
      maxRewardDays: 60,
      isLimitReached: stats.isLimitReached,
    };
  }

  /**
   * Returns paginated referral history for the authenticated user (privacy-safe, no invitee phone/email).
   */
  async getMyReferralHistory(
    actor: Actor,
    pagination: { limit?: number; offset?: number } = {},
  ): Promise<{ referrals: UserReferralHistoryItemDto[]; total: number }> {
    if (!actor.userId) {
      throw new DomainError("unauthorized", "Not signed in");
    }

    const limit = Math.min(100, Math.max(1, pagination.limit ?? 20));
    const offset = Math.max(0, pagination.offset ?? 0);

    const { referrals: list, total } =
      await this.store.listReferralsByInviter(actor.userId, limit, offset);

    const sanitized: UserReferralHistoryItemDto[] = list.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      status: r.status,
      rewardType: r.rewardType,
      rewardAmount: r.rewardAmount,
      rewardStatus: r.rewardStatus,
      qualifiedAt: r.qualifiedAt,
      rewardedAt: r.rewardedAt,
    }));

    return { referrals: sanitized, total };
  }

  /**
   * Admin: List all referrals across the system.
   */
  async listAllReferralsForAdmin(
    actor: Actor,
    filter?: { status?: string },
    pagination: { limit?: number; offset?: number } = {},
  ): Promise<{ referrals: AdminReferralListItemDto[]; total: number }> {
    if (actor.role !== "platform_admin") {
      throw new DomainError(
        "forbidden",
        "Only platform admins can view system referrals",
      );
    }

    const limit = Math.min(100, Math.max(1, pagination.limit ?? 50));
    const offset = Math.max(0, pagination.offset ?? 0);

    return this.store.listAllReferrals(filter, limit, offset);
  }

  /**
   * Admin: Get referral system configuration.
   */
  async getReferralSystemConfig(): Promise<ReferralSystemConfig> {
    return this.store.getReferralSystemConfig();
  }

  /**
   * Admin: Update referral system configuration.
   */
  async updateReferralSystemConfig(
    actor: Actor,
    config: Partial<ReferralSystemConfig>,
  ): Promise<ReferralSystemConfig> {
    if (actor.role !== "platform_admin") {
      throw new DomainError(
        "forbidden",
        "Only platform admins can update referral configuration",
      );
    }
    return this.store.updateReferralSystemConfig(actor.userId!, config);
  }
}
