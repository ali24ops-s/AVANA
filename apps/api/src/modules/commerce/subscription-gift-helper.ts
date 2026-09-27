/**
 * Subscription Activation Gift Helper.
 *
 * Enforces business rules for subscription activation bonuses:
 * - Granted ONLY on the user's first successful subscription purchase ever.
 * - Skipped on renewals, subsequent purchases, plan changes, repurchases after expiration or cancellation.
 * - Protected by the user-scoped idempotency key `subscription-first-gift:${userId}`
 *   to ensure strictly at-most-once credit even under concurrent execution or payment retries.
 */

import type {
  OrderId,
  PaymentId,
  ProductRecord,
  SubscriptionCreditBonusesConfig,
  UserId,
  UserSubscriptionId,
} from "@avana/domain";
import {
  DEFAULT_SUBSCRIPTION_CREDIT_BONUSES,
  resolveGiftCreditAmount,
  resolveSubscriptionPlanType,
} from "@avana/domain";
import type { CommerceStore } from "./commerce-store.js";
import type { WalletService } from "../wallet/wallet-service.js";

export interface GrantSubscriptionGiftParams {
  userId: UserId;
  orderId: OrderId;
  subscriptionId: UserSubscriptionId;
  product: ProductRecord;
  paymentId: PaymentId;
  commerceStore: CommerceStore;
  walletService: WalletService;
  getBonusesConfig?: () => Promise<SubscriptionCreditBonusesConfig>;
  grantedAt?: string;
}

export interface GrantSubscriptionGiftResult {
  granted: boolean;
  amount: number;
  isDuplicate?: boolean;
}

/**
 * Evaluates first-purchase eligibility and conditionally awards the subscription
 * activation bonus into the user's wallet.
 */
export async function grantSubscriptionActivationGiftIfEligible(
  params: GrantSubscriptionGiftParams,
): Promise<GrantSubscriptionGiftResult> {
  const {
    userId,
    orderId,
    subscriptionId,
    product,
    paymentId,
    commerceStore,
    walletService,
    getBonusesConfig,
    grantedAt = new Date().toISOString(),
  } = params;

  if (product.type !== "subscription") {
    return { granted: false, amount: 0 };
  }

  const planType = resolveSubscriptionPlanType(product);
  if (!planType) {
    return { granted: false, amount: 0 };
  }

  const config = getBonusesConfig
    ? await getBonusesConfig()
    : DEFAULT_SUBSCRIPTION_CREDIT_BONUSES;
  const giftAmount = resolveGiftCreditAmount(planType, config);
  if (giftAmount <= 0) {
    return { granted: false, amount: 0 };
  }

  const hasPrevious =
    await commerceStore.hasPreviousSuccessfulSubscriptionPurchase(
      userId,
      orderId,
      subscriptionId,
    );

  if (hasPrevious) {
    return { granted: false, amount: 0 };
  }

  const creditResult = await walletService.credit({
    userId,
    amount: giftAmount,
    source: "subscription_bonus",
    referenceType: "user_subscription",
    referenceId: subscriptionId,
    idempotencyKey: `subscription-first-gift:${userId}`,
    metadata: {
      subscriptionId,
      productId: product.id,
      productTitle: product.title,
      planType,
      durationDays: product.durationDays,
      giftAmount,
      paymentId,
      orderId,
      grantedAt,
    },
  });

  return {
    granted: !creditResult.isDuplicate,
    amount: giftAmount,
    isDuplicate: creditResult.isDuplicate,
  };
}
