/**
 * Referral Domain Models, Types, and Utilities.
 *
 * Implements:
 * 1. Referral Code & Relationship Types
 * 2. Unambiguous Crockford Base32-like Referral Code Generator (AVN + 5 chars)
 * 3. Configuration & Constants for Referral System V1
 */

import type {
  OrderId,
  PaymentId,
  ReferralCodeId,
  ReferralId,
  UserId,
  WalletTransactionId,
} from "./ids.js";

// ---------------------------------------------------------------------------
// Referral Constants & Statuses
// ---------------------------------------------------------------------------

export type ReferralStatus = "pending" | "qualified" | "rewarded" | "cancelled";

export const REFERRAL_STATUSES: readonly ReferralStatus[] = [
  "pending",
  "qualified",
  "rewarded",
  "cancelled",
] as const;

export function isReferralStatus(v: string): v is ReferralStatus {
  return (REFERRAL_STATUSES as readonly string[]).includes(v);
}

export type ReferralRewardType = "subscription_days" | "wallet_credit";

export const REFERRAL_REWARD_TYPES: readonly ReferralRewardType[] = [
  "subscription_days",
  "wallet_credit",
] as const;

export function isReferralRewardType(v: string): v is ReferralRewardType {
  return (REFERRAL_REWARD_TYPES as readonly string[]).includes(v);
}

export type ReferralRewardStatus =
  | "pending"
  | "completed"
  | "failed"
  | "limit_reached"
  | "abuse_rejected";

export const REFERRAL_REWARD_STATUSES: readonly ReferralRewardStatus[] = [
  "pending",
  "completed",
  "failed",
  "limit_reached",
  "abuse_rejected",
] as const;

export function isReferralRewardStatus(v: string): v is ReferralRewardStatus {
  return (REFERRAL_REWARD_STATUSES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Configuration Key & Defaults
// ---------------------------------------------------------------------------

export const REFERRAL_SYSTEM_CONFIG_KEY = "referral_system_config";

export interface ReferralSystemConfig {
  enabled: boolean;
  rewardDays: number; // Reward in subscription days for inviter (default: 15)
  maxRewardedReferrals: number; // Max referrals that grant rewards (default: 4)
  maxRewardDays: number; // Max total reward days (default: 60)
  rewardAmount?: number; // Backward-compatibility alias for rewardDays
  rewardType?: ReferralRewardType;
  currency?: string;
}

export const DEFAULT_REFERRAL_SYSTEM_CONFIG: ReferralSystemConfig = {
  enabled: true,
  rewardDays: 15,
  maxRewardedReferrals: 4,
  maxRewardDays: 60,
  rewardAmount: 15,
  rewardType: "subscription_days",
};

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

export interface ReferralCodeRecord {
  id: ReferralCodeId;
  userId: UserId;
  code: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralRecord {
  id: ReferralId;
  inviterUserId: UserId;
  invitedUserId: UserId;
  referralCodeId: ReferralCodeId;
  status: ReferralStatus;
  qualifyingOrderId: OrderId | null;
  qualifyingPaymentId: PaymentId | null;
  qualifiedAt: string | null;
  rewardType: ReferralRewardType;
  rewardAmount: number;
  rewardStatus: ReferralRewardStatus;
  rewardedAt: string | null;
  walletTransactionId: WalletTransactionId | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// DTOs & Inputs
// ---------------------------------------------------------------------------

export interface UserReferralSummaryDto {
  referralCode: string;
  inviteUrl: string;
  totalInvites: number;
  pendingCount: number;
  rewardedCount: number;
  rewardedDays: number;
  totalRewardAmount: number;
  maxReferrals: number;
  maxRewardDays: number;
  isLimitReached: boolean;
}

export interface UserReferralHistoryItemDto {
  id: string;
  createdAt: string;
  status: ReferralStatus;
  rewardType: ReferralRewardType;
  rewardAmount: number;
  rewardStatus: ReferralRewardStatus;
  qualifiedAt: string | null;
  rewardedAt: string | null;
}

export interface AdminReferralListItemDto {
  id: string;
  inviterUserId: string;
  inviterName?: string | null;
  inviterEmail?: string | null;
  inviterPhone?: string | null;
  invitedUserId: string;
  invitedName?: string | null;
  invitedEmail?: string | null;
  invitedPhone?: string | null;
  referralCode: string;
  status: ReferralStatus;
  qualifyingOrderId: string | null;
  qualifyingOrderNumber?: string | null;
  rewardType: ReferralRewardType;
  rewardAmount: number;
  rewardStatus: ReferralRewardStatus;
  qualifiedAt: string | null;
  rewardedAt: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Code Generation & Normalization
// ---------------------------------------------------------------------------

// Unambiguous Crockford Base32-inspired alphabet (excludes 0, O, 1, I, L)
// eslint-disable-next-line no-secrets/no-secrets
const REFERRAL_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const REFERRAL_CODE_RANDOM_LENGTH = 5;
const REFERRAL_CODE_PREFIX = "AVN";

/**
 * Normalizes user-submitted referral codes (trims whitespace, removes hyphens, converts to uppercase).
 */
export function normalizeReferralCode(rawCode: string): string {
  if (!rawCode) return "";
  return rawCode.replace(/[-\s]/g, "").trim().toUpperCase();
}

/**
 * Validates if the code matches the expected format (e.g., AVN7K4P2).
 */
export function isValidReferralCodeFormat(code: string): boolean {
  if (!code || typeof code !== "string") return false;
  const normalized = normalizeReferralCode(code);
  return /^AVN[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{5}$/.test(normalized);
}

/**
 * Generates a random, collision-safe referral code starting with 'AVN'.
 * Example: 'AVN7K4P2'
 */
export function generateRandomReferralCode(): string {
  let result = REFERRAL_CODE_PREFIX;
  const alphabetLen = REFERRAL_CODE_ALPHABET.length;
  for (let i = 0; i < REFERRAL_CODE_RANDOM_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * alphabetLen);
    result += REFERRAL_CODE_ALPHABET[randomIndex];
  }
  return result;
}
