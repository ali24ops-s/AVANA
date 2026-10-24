/**
 * Avana Welcome Gift Domain Primitives.
 *
 * Defines business constants, gift status, and DTO interfaces for
 * the 20,000 Tomans wallet charge and 7-day free subscription gift.
 */

import type { UserId, UUID } from "./ids.js";

export const WELCOME_GIFT_WALLET_AMOUNT = 20_000; // in Tomans
export const WELCOME_GIFT_SUBSCRIPTION_DAYS = 7; // days
export const WELCOME_GIFT_WALLET_SOURCE = "welcome_gift" as const;
export const WELCOME_GIFT_WALLET_TITLE = "هدیه خوشآمدگویی ثبت‌نام";

export type WelcomeGiftStatus = "pending" | "completed";

export type WelcomeGiftId = string & { readonly __brand: unique symbol };

export function asWelcomeGiftId(id: string | UUID): WelcomeGiftId {
  return id as WelcomeGiftId;
}

export interface WelcomeGiftRecord {
  id: WelcomeGiftId;
  userId: UserId;
  walletAmount: number;
  walletTransactionId: string | null;
  subscriptionDays: number;
  subscriptionId: string | null;
  entitlementId: string | null;
  status: WelcomeGiftStatus;
  popupSeenAt: string | null;
  grantedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WelcomeGiftDto {
  wallet_amount: number;
  currency: "toman";
  subscription_days: number;
  granted_at: string | null;
}

export interface WelcomeGiftStatusResponse {
  request_id?: string;
  eligible: boolean;
  granted: boolean;
  popup_seen: boolean;
  gift: WelcomeGiftDto | null;
}

export interface WelcomeGiftAcknowledgeResponse {
  request_id?: string;
  success: boolean;
  popup_seen_at: string;
}
