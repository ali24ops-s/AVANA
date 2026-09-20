/**
 * Referral Store Interface.
 *
 * Defines data access methods for:
 * - referral_codes
 * - referrals
 * - referral system configurations
 * - atomic subscription reward & device abuse enforcement
 */

import type {
  AdminReferralListItemDto,
  ReferralCodeRecord,
  ReferralRecord,
  ReferralSystemConfig,
  UserId,
  ReferralId,
  ReferralCodeId,
} from "@avana/domain";

export interface ProcessRegistrationReferralParams {
  referralId: ReferralId;
  inviterUserId: UserId;
  invitedUserId: UserId;
  referralCodeId: ReferralCodeId;
  deviceId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  durationDays?: number;
  maxRewardedReferrals?: number;
  metadata?: Record<string, unknown>;
}

export interface ProcessRegistrationReferralResult {
  referral: ReferralRecord;
  rewarded: boolean;
  abuse: boolean;
  limitReached: boolean;
  newExpiry?: string;
}

export interface ReferralStore {
  findReferralCodeByUserId(userId: UserId): Promise<ReferralCodeRecord | null>;
  findReferralCodeByCode(code: string): Promise<ReferralCodeRecord | null>;
  createReferralCode(codeRecord: ReferralCodeRecord): Promise<ReferralCodeRecord>;

  findReferralByInvitedUserId(invitedUserId: UserId): Promise<ReferralRecord | null>;
  findReferralById(id: ReferralId): Promise<ReferralRecord | null>;
  createReferral(referral: ReferralRecord): Promise<ReferralRecord>;
  updateReferral(referral: ReferralRecord): Promise<ReferralRecord>;

  /**
   * Atomically evaluates inviter lock, checks device abuse, checks reward count (max 4),
   * creates the referral record, and if eligible, extends/creates the 15-day subscription.
   */
  processRegistrationReferral(
    params: ProcessRegistrationReferralParams,
  ): Promise<ProcessRegistrationReferralResult>;

  /** Checks if device is associated with a given user (in user_devices). */
  isDeviceLinkedToUser(deviceId: string, userId: UserId): Promise<boolean>;

  /** Checks if device was already used for a rewarded referral for this inviter. */
  hasDeviceClaimedRewardForInviter(
    deviceId: string,
    inviterUserId: UserId,
  ): Promise<boolean>;

  listReferralsByInviter(
    inviterUserId: UserId,
    limit?: number,
    offset?: number,
  ): Promise<{ referrals: ReferralRecord[]; total: number }>;

  getInviterStats(inviterUserId: UserId): Promise<{
    totalInvites: number;
    pendingCount: number;
    rewardedCount: number;
    rewardedDays: number;
    totalRewardAmount: number;
    isLimitReached: boolean;
  }>;

  listAllReferrals(
    filter?: { status?: string },
    limit?: number,
    offset?: number,
  ): Promise<{ referrals: AdminReferralListItemDto[]; total: number }>;

  listPendingOrFailedRewardReferrals(): Promise<ReferralRecord[]>;

  getReferralSystemConfig(): Promise<ReferralSystemConfig>;
  updateReferralSystemConfig(
    adminId: UserId,
    config: Partial<ReferralSystemConfig>,
  ): Promise<ReferralSystemConfig>;
}
