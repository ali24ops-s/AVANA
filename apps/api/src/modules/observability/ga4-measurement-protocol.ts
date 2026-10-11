/**
 * Google Analytics 4 Measurement Protocol Server-Side Dispatcher for AVANA.
 *
 * Rules:
 * - Server-to-server dispatch for critical purchase events.
 * - GA4_API_SECRET is kept strictly confidential on the backend.
 * - Complete failure isolation: network drops or Google downtime NEVER disrupt
 *   database transactions, order approvals, or user entitlement grants.
 * - Strict timeout (default 3000ms).
 * - Client ID must originate from an authentic user session; no fake hashes.
 * - If client_id is missing, the event is safely skipped without throwing.
 * - All financial numbers are validated and converted to ISO 4217 "IRR" (Toman * 10).
 * - Zero PII is logged or transmitted.
 */

import type { OrderId } from "@avana/domain";
import type { CommerceStore } from "../commerce/commerce-store.js";

export interface Ga4PurchaseItem {
  item_id: string;
  item_name: string;
  item_category?: string;
  price: number; // in IRR
  quantity: number;
}

export interface Ga4PurchaseEventInput {
  transaction_id: string;
  value: number; // in IRR
  currency: "IRR";
  items: Ga4PurchaseItem[];
  client_id?: string;
  session_id?: string;
  coupon?: string;
}

export interface Ga4MeasurementProtocolConfig {
  measurementId?: string;
  apiSecret?: string;
  debugMode?: boolean;
  timeoutMs?: number;
}

export interface Ga4SendResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
  validationMessages?: unknown[];
}

/**
 * Validates and converts an internal Toman amount to GA4 ISO 4217 Rial (IRR).
 * 1 Toman = 10 Rials.
 */
export function convertTomanToIrr(
  amountToman: number | null | undefined,
): { currency: "IRR"; value: number } | null {
  if (
    typeof amountToman !== "number" ||
    !Number.isFinite(amountToman) ||
    Number.isNaN(amountToman) ||
    amountToman <= 0 ||
    amountToman > 10_000_000_000
  ) {
    return null;
  }

  return {
    currency: "IRR",
    value: Math.round(amountToman * 10),
  };
}

export class Ga4MeasurementProtocolService {
  private readonly measurementId?: string;
  private readonly apiSecret?: string;
  private readonly debugMode: boolean;
  private readonly timeoutMs: number;

  constructor(
    config: Ga4MeasurementProtocolConfig,
    private readonly logger?: {
      info: (obj: unknown, msg?: string) => void;
      warn: (obj: unknown, msg?: string) => void;
      error: (obj: unknown, msg?: string) => void;
      debug?: (obj: unknown, msg?: string) => void;
    },
  ) {
    this.measurementId = config.measurementId?.trim();
    this.apiSecret = config.apiSecret?.trim();
    this.debugMode = Boolean(config.debugMode);
    this.timeoutMs = config.timeoutMs && config.timeoutMs > 0 ? config.timeoutMs : 3000;
  }

  /**
   * Whether the service is configured with valid credentials.
   */
  isEnabled(): boolean {
    return Boolean(this.measurementId && this.apiSecret);
  }

  /**
   * Send a purchase event to Google Analytics 4 via Measurement Protocol.
   *
   * Completely isolated: Errors are logged but NEVER thrown to the caller.
   */
  async sendPurchaseEvent(input: Ga4PurchaseEventInput): Promise<Ga4SendResult> {
    // 1. Check if configured
    if (!this.isEnabled()) {
      this.logger?.debug?.(
        { transactionId: input.transaction_id },
        "GA4 Measurement Protocol is not configured or disabled; skipping purchase event.",
      );
      return { success: false, skipped: true, reason: "disabled" };
    }

    // 2. Client ID validation
    // GA4 MP requires client_id. In accordance with privacy & non-fake attribution policies,
    // if the client didn't supply a consented client ID, we do NOT synthesize a fake hash.
    if (!input.client_id || !input.client_id.trim()) {
      this.logger?.info(
        { transactionId: input.transaction_id },
        "No authentic client_id provided for order; skipping GA4 purchase attribution.",
      );
      return { success: false, skipped: true, reason: "missing_client_id" };
    }

    // 3. Financial validation
    if (
      input.currency !== "IRR" ||
      typeof input.value !== "number" ||
      input.value <= 0 ||
      !Number.isFinite(input.value)
    ) {
      this.logger?.warn(
        { transactionId: input.transaction_id, value: input.value, currency: input.currency },
        "Invalid currency or value for GA4 purchase event; skipping.",
      );
      return { success: false, skipped: true, reason: "invalid_financial_data" };
    }

    if (!Array.isArray(input.items) || input.items.length === 0) {
      this.logger?.warn(
        { transactionId: input.transaction_id },
        "No items provided for GA4 purchase event; skipping.",
      );
      return { success: false, skipped: true, reason: "empty_items" };
    }

    // 4. Construct payload
    const eventParams: Record<string, unknown> = {
      transaction_id: input.transaction_id,
      value: input.value,
      currency: "IRR",
      items: input.items.map((it) => ({
        item_id: it.item_id,
        item_name: it.item_name,
        ...(it.item_category ? { item_category: it.item_category } : {}),
        price: it.price,
        quantity: it.quantity,
      })),
    };

    if (input.session_id && /^\d+$/.test(input.session_id.trim())) {
      eventParams.session_id = input.session_id.trim();
    }

    if (input.coupon && input.coupon.trim()) {
      eventParams.coupon = input.coupon.trim();
    }

    const payload = {
      client_id: input.client_id.trim(),
      events: [
        {
          name: "purchase",
          params: eventParams,
        },
      ],
    };

    // 5. Send HTTP request with timeout
    const endpoint = this.debugMode
      ? "https://www.google-analytics.com/debug/mp/collect"
      : "https://www.google-analytics.com/mp/collect";

    const targetUrl = `${endpoint}?api_secret=${encodeURIComponent(
      this.apiSecret!,
    )}&measurement_id=${encodeURIComponent(this.measurementId!)}`;

    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (this.debugMode) {
        // Debug endpoint returns JSON validation messages
        const debugData = (await response.json()) as {
          validationMessages?: unknown[];
        };
        const messages = debugData.validationMessages ?? [];
        if (messages.length > 0) {
          this.logger?.warn(
            { transactionId: input.transaction_id, messages },
            "GA4 MP Debug endpoint returned validation issues",
          );
          return { success: false, validationMessages: messages };
        }
        return { success: true, validationMessages: [] };
      }

      // Production endpoint returns 204 No Content upon success
      if (response.status >= 200 && response.status < 300) {
        this.logger?.info(
          { transactionId: input.transaction_id },
          "Successfully reported purchase to GA4 Measurement Protocol.",
        );
        return { success: true };
      }

      this.logger?.warn(
        { transactionId: input.transaction_id, status: response.status },
        "GA4 Measurement Protocol returned non-2xx status code.",
      );
      return { success: false, reason: `http_status_${response.status}` };
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger?.warn(
        { transactionId: input.transaction_id, error: errMsg },
        "Failed to dispatch purchase to GA4 Measurement Protocol (network/timeout); isolated from commerce flow.",
      );
      return { success: false, reason: errMsg };
    }
  }
}

/**
 * Centrally and atomically dispatches a GA4 purchase event for a paid order.
 *
 * Guaranteed characteristics:
 * - Atomic lock/claim via order.metadata in Postgres: concurrent attempts return null.
 * - Deduplication: duplicate claims or retries are safely ignored.
 * - Converted to IRR exactly once.
 * - Isolated: failures never bubble up to callers.
 */
export async function dispatchOrderGa4Purchase(params: {
  orderId: OrderId;
  store: CommerceStore;
  ga4Service?: Ga4MeasurementProtocolService;
  logger?: {
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
    error: (obj: unknown, msg?: string) => void;
    debug?: (obj: unknown, msg?: string) => void;
  };
}): Promise<Ga4SendResult | null> {
  const { orderId, store, ga4Service, logger } = params;
  if (!ga4Service || !ga4Service.isEnabled()) {
    return null;
  }

  try {
    // 1. Concurrency-safe atomic claim
    const claimedOrder = await store.claimOrderForAnalyticsPurchase(orderId);
    if (!claimedOrder) {
      logger?.debug?.({ orderId }, "Order already claimed or reported for GA4 purchase; skipping.");
      return null;
    }

    // Extract analytics metadata & claim_id
    const metadata = (claimedOrder.metadata ?? {}) as Record<string, unknown>;
    const analytics = (metadata.analytics ?? {}) as Record<string, unknown>;
    const claimId = typeof analytics.claim_id === "string" ? analytics.claim_id : undefined;

    // Strict Opt-in Consent Policy: Purchase is only dispatched if consent is explicitly "granted".
    // Legacy orders or orders without explicit consent are gracefully skipped.
    if (analytics.consent !== "granted") {
      await store.recordOrderAnalyticsPurchaseResult(orderId, "skipped_no_consent", claimId);
      return null;
    }

    // 2. Fetch associated product to construct items payload
    const product = await store.findProductById(claimedOrder.productId);
    if (!product) {
      await store.recordOrderAnalyticsPurchaseResult(orderId, "failed", claimId, "product_not_found");
      return null;
    }

    const clientId = typeof analytics.ga_client_id === "string" ? analytics.ga_client_id.trim() : undefined;
    const sessionId = typeof analytics.ga_session_id === "string" ? analytics.ga_session_id.trim() : undefined;

    // 4. Validate client_id: Privacy rule - no fake hashes!
    if (!clientId) {
      await store.recordOrderAnalyticsPurchaseResult(orderId, "skipped_no_client_id", claimId);
      return null;
    }

    // 5. Convert price: Exactly once at analytics boundary (Toman * 10 = IRR)
    const money = convertTomanToIrr(claimedOrder.amount);
    if (!money) {
      await store.recordOrderAnalyticsPurchaseResult(orderId, "failed", claimId, "invalid_order_amount");
      return null;
    }

    // 5.5 Race Condition Pre-Check:
    // Immediately prior to external HTTP dispatch, re-fetch the freshest state of the order from the store.
    // If the user concurrently revoked consent or the claim lease was invalidated while resolving product/amount,
    // we MUST abort and never send the HTTP request to Google.
    const freshOrder = await store.findOrderById(orderId);
    if (freshOrder) {
      const freshMeta = (freshOrder.metadata ?? {}) as Record<string, unknown>;
      const freshAnalytics = (freshMeta.analytics ?? {}) as Record<string, unknown>;

      if (
        freshAnalytics.consent !== "granted" ||
        freshAnalytics.purchase_status === "skipped_no_consent"
      ) {
        logger?.info?.(
          { orderId },
          "Analytics consent was revoked prior to HTTP dispatch; aborting GA4 purchase event.",
        );
        if (freshAnalytics.purchase_status !== "skipped_no_consent") {
          await store.recordOrderAnalyticsPurchaseResult(orderId, "skipped_no_consent", claimId);
        }
        return null;
      }

      if (claimId && freshAnalytics.claim_id && freshAnalytics.claim_id !== claimId) {
        logger?.warn?.(
          { orderId, currentClaimId: freshAnalytics.claim_id, ourClaimId: claimId },
          "Order claim lease was superseded prior to HTTP dispatch; aborting duplicate GA4 dispatch.",
        );
        return null;
      }
    }

    // 6. Send to Measurement Protocol
    const result = await ga4Service.sendPurchaseEvent({
      transaction_id: claimedOrder.orderNumber,
      value: money.value,
      currency: "IRR",
      client_id: clientId,
      session_id: sessionId,
      coupon: typeof metadata.couponCode === "string" ? metadata.couponCode : undefined,
      items: [
        {
          item_id: product.id,
          item_name: product.title,
          item_category: product.type,
          price: money.value,
          quantity: 1,
        },
      ],
    });

    if (result.success) {
      await store.recordOrderAnalyticsPurchaseResult(orderId, "sent", claimId);
    } else {
      await store.recordOrderAnalyticsPurchaseResult(orderId, "failed", claimId, result.reason);
    }

    return result;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await store.recordOrderAnalyticsPurchaseResult(orderId, "failed", undefined, msg);
    } catch {
      // Ignore secondary recording error
    }
    return { success: false, reason: msg };
  }
}
