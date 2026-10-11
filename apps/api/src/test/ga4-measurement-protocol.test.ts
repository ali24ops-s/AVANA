/* eslint-disable no-secrets/no-secrets, @typescript-eslint/no-explicit-any */
/**
 * Unit & Integration tests for GA4 Server-Side Measurement Protocol.
 *
 * Verifies:
 * 1. convertTomanToIrr currency conversion (IRR currency, *10 Toman conversion).
 * 2. Ga4MeasurementProtocolService payload structure (currency, items, transaction_id).
 * 3. Graceful skip when client_id is missing (never synthesizes fake/hashed IDs).
 * 4. Network timeout & error isolation (fetch failures never crash the caller).
 * 5. Debug endpoint vs Production endpoint selection.
 * 6. Atomic store idempotency claim (claimOrderForAnalyticsPurchase).
 * 7. dispatchOrderGa4Purchase idempotency under retries / repeated execution.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  Ga4MeasurementProtocolService,
  convertTomanToIrr,
  dispatchOrderGa4Purchase,
} from "../modules/observability/ga4-measurement-protocol.js";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import type { OrderRecord, ProductRecord } from "@avana/domain";

describe("GA4 Measurement Protocol Service", () => {
  const mockConfig = {
    measurementId: "G-TEST123456",
    apiSecret: "secret_api_key_test",
    debugMode: false,
    timeoutMs: 1000,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Currency Conversion", () => {
    it("converts Toman to IRR (* 10) strictly and correctly", () => {
      expect(convertTomanToIrr(1)).toEqual({ currency: "IRR", value: 10 });
      expect(convertTomanToIrr(50_000)).toEqual({ currency: "IRR", value: 500_000 });
      expect(convertTomanToIrr(120_000)).toEqual({ currency: "IRR", value: 1_200_000 });
      expect(convertTomanToIrr(2_500_000)).toEqual({ currency: "IRR", value: 25_000_000 });
    });

    it("returns null if amount is invalid, zero, or negative", () => {
      expect(convertTomanToIrr(0)).toBeNull();
      expect(convertTomanToIrr(-100)).toBeNull();
      expect(convertTomanToIrr(NaN)).toBeNull();
      expect(convertTomanToIrr(Infinity)).toBeNull();
      expect(convertTomanToIrr(null)).toBeNull();
      expect(convertTomanToIrr(undefined)).toBeNull();
    });
  });

  describe("Dispatching & Network Isolation", () => {
    it("gracefully returns failure without sending request when clientId is missing or empty", async () => {
      const service = new Ga4MeasurementProtocolService(mockConfig);
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      const result = await service.sendPurchaseEvent({
        client_id: "", // Missing client ID
        transaction_id: "ORD-004",
        currency: "IRR",
        value: 500_000,
        items: [{ item_id: "plan-1", item_name: "Plan", price: 500_000, quantity: 1 }],
      });

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe("missing_client_id");
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("sends request to production endpoint when debugMode is false", async () => {
      const service = new Ga4MeasurementProtocolService({
        ...mockConfig,
        debugMode: false,
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(null, { status: 204 }),
      );

      const result = await service.sendPurchaseEvent({
        client_id: "123456789.1670000000",
        transaction_id: "ORD-PROD-001",
        currency: "IRR",
        value: 500_000,
        items: [{ item_id: "plan-1", item_name: "Plan", price: 500_000, quantity: 1 }],
      });

      expect(result.success).toBe(true);
      expect(fetchSpy).toHaveBeenCalledTimes(1);

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("https://www.google-analytics.com/mp/collect");
      expect(url).toContain("measurement_id=G-TEST123456");
      expect(url).toContain("api_secret=secret_api_key_test");

      const callInit = fetchSpy.mock.calls[0][1] as RequestInit;
      const sentBody = JSON.parse(callInit.body as string);
      expect(sentBody.client_id).toBe("123456789.1670000000");
      expect(sentBody.events[0].name).toBe("purchase");
      expect(sentBody.events[0].params.transaction_id).toBe("ORD-PROD-001");
      expect(sentBody.events[0].params.currency).toBe("IRR");
      expect(sentBody.events[0].params.value).toBe(500_000);
    });

    it("sends request to debug endpoint when debugMode is true", async () => {
      const service = new Ga4MeasurementProtocolService({
        ...mockConfig,
        debugMode: true,
      });

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify({ validationMessages: [] }), { status: 200 }),
      );

      const result = await service.sendPurchaseEvent({
        client_id: "123456789.1670000000",
        transaction_id: "ORD-DEBUG-001",
        currency: "IRR",
        value: 500_000,
        items: [{ item_id: "plan-1", item_name: "Plan", price: 500_000, quantity: 1 }],
      });

      expect(result.success).toBe(true);
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("https://www.google-analytics.com/debug/mp/collect");
    });

    it("never throws when network times out or fetch rejects (error isolation)", async () => {
      const service = new Ga4MeasurementProtocolService(mockConfig);

      vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(
        new Error("Network timeout or connection refused"),
      );

      // Must never throw to caller!
      let result;
      await expect(
        (async () => {
          result = await service.sendPurchaseEvent({
            client_id: "123456789.1670000000",
            transaction_id: "ORD-ERR-001",
            currency: "IRR",
            value: 500_000,
            items: [{ item_id: "plan-1", item_name: "Plan", price: 500_000, quantity: 1 }],
          });
        })(),
      ).resolves.not.toThrow();

      expect(result?.success).toBe(false);
      expect(result?.reason).toBe("Network timeout or connection refused");
    });
  });

  describe("Order Idempotency Claim & Purchase Dispatcher", () => {
    it("claims order atomically and dispatches purchase event exactly once", async () => {
      const store = new InMemoryCommerceStore();
      const service = new Ga4MeasurementProtocolService(mockConfig);

      const product: ProductRecord = {
        id: "prd_plan_pro",
        title: "طرح ماهانه حرفه‌ای",
        code: "monthly_pro",
        description: "دسترسی کامل",
        price: 100_000,
        currency: "toman",
        type: "subscription",
        isActive: true,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createProduct(product);

      const order: OrderRecord = {
        id: "ord_test_001",
        userId: "usr_test_001",
        orderNumber: "ORD-20261010-001",
        productId: product.id,
        amount: 100_000,
        discountAmount: 0,
        payableAmount: 100_000,
        status: "paid",
        paymentMethod: "online",
        metadata: {
          analytics: {
            consent: "granted",
            ga_client_id: "123456789.1670000000",
            ga_session_id: "1670000000",
            utm_source: "instagram",
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createOrder(order);

      const sendSpy = vi.spyOn(service, "sendPurchaseEvent").mockResolvedValueOnce({
        success: true,
      });

      // First dispatch attempt: should succeed and claim
      await dispatchOrderGa4Purchase({
        orderId: order.id,
        store,
        ga4Service: service,
      });

      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(sendSpy).toHaveBeenCalledWith({
        transaction_id: "ORD-20261010-001",
        value: 1_000_000, // 100,000 Tomans * 10 = 1,000,000 IRR
        currency: "IRR",
        client_id: "123456789.1670000000",
        session_id: "1670000000",
        coupon: undefined,
        items: [
          {
            item_id: product.id,
            item_name: product.title,
            item_category: product.type,
            price: 1_000_000,
            quantity: 1,
          },
        ],
      });

      const updatedOrder = await store.findOrderById(order.id);
      const analyticsMeta = updatedOrder?.metadata?.analytics as Record<string, unknown>;
      expect(analyticsMeta?.purchase_status).toBe("sent");
      expect(analyticsMeta?.purchase_reported_at).toBeDefined();

      // Second dispatch attempt (retry or duplicate webhook): MUST BE SKIPPED!
      await dispatchOrderGa4Purchase({
        orderId: order.id,
        store,
        ga4Service: service,
      });

      // No second dispatch
      expect(sendSpy).toHaveBeenCalledTimes(1);
    });

    it("skips dispatch when consent is not explicitly granted (missing or denied)", async () => {
      const store = new InMemoryCommerceStore();
      const service = new Ga4MeasurementProtocolService(mockConfig);

      const product: ProductRecord = {
        id: "prd_plan_basic",
        title: "طرح پایه",
        code: "monthly_basic",
        description: "دسترسی پایه",
        price: 50_000,
        currency: "toman",
        type: "subscription",
        isActive: true,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createProduct(product);

      // Order with no analytics metadata (legacy)
      const orderLegacy: OrderRecord = {
        id: "ord_test_no_analytics",
        userId: "usr_test_001",
        orderNumber: "ORD-20261010-002",
        productId: product.id,
        amount: 50_000,
        discountAmount: 0,
        payableAmount: 50_000,
        status: "paid",
        paymentMethod: "online",
        metadata: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createOrder(orderLegacy);

      const sendSpy = vi.spyOn(service, "sendPurchaseEvent");

      await dispatchOrderGa4Purchase({
        orderId: orderLegacy.id,
        store,
        ga4Service: service,
      });

      expect(sendSpy).not.toHaveBeenCalled();
      let updatedOrder = await store.findOrderById(orderLegacy.id);
      let analyticsMeta = updatedOrder?.metadata?.analytics as Record<string, unknown>;
      expect(analyticsMeta?.purchase_status).toBe("skipped_no_consent");

      // Order with explicit denied consent
      const orderDenied: OrderRecord = {
        id: "ord_test_denied_consent",
        userId: "usr_test_001",
        orderNumber: "ORD-20261010-002B",
        productId: product.id,
        amount: 50_000,
        discountAmount: 0,
        payableAmount: 50_000,
        status: "paid",
        paymentMethod: "online",
        metadata: {
          analytics: {
            consent: "denied",
            ga_client_id: "123456789.1670000000",
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createOrder(orderDenied);

      await dispatchOrderGa4Purchase({
        orderId: orderDenied.id,
        store,
        ga4Service: service,
      });

      expect(sendSpy).not.toHaveBeenCalled();
      updatedOrder = await store.findOrderById(orderDenied.id);
      analyticsMeta = updatedOrder?.metadata?.analytics as Record<string, unknown>;
      expect(analyticsMeta?.purchase_status).toBe("skipped_no_consent");
    });

    it("skips dispatch if consent is granted but analytics client_id is missing", async () => {
      const store = new InMemoryCommerceStore();
      const service = new Ga4MeasurementProtocolService(mockConfig);

      const product: ProductRecord = {
        id: "prd_plan_basic_2",
        title: "طرح پایه",
        code: "monthly_basic",
        description: "دسترسی پایه",
        price: 50_000,
        currency: "toman",
        type: "subscription",
        isActive: true,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createProduct(product);

      const order: OrderRecord = {
        id: "ord_test_no_client_id",
        userId: "usr_test_001",
        orderNumber: "ORD-20261010-002C",
        productId: product.id,
        amount: 50_000,
        discountAmount: 0,
        payableAmount: 50_000,
        status: "paid",
        paymentMethod: "online",
        metadata: {
          analytics: {
            consent: "granted",
            // ga_client_id omitted
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createOrder(order);

      const sendSpy = vi.spyOn(service, "sendPurchaseEvent");

      await dispatchOrderGa4Purchase({
        orderId: order.id,
        store,
        ga4Service: service,
      });

      expect(sendSpy).not.toHaveBeenCalled();

      const updatedOrder = await store.findOrderById(order.id);
      const analyticsMeta = updatedOrder?.metadata?.analytics as Record<string, unknown>;
      expect(analyticsMeta?.purchase_status).toBe("skipped_no_client_id");
    });

    it("allows re-claiming a stalled order after lease expires (15 min) but rejects active lease", async () => {
      vi.useFakeTimers();
      try {
        const store = new InMemoryCommerceStore();

        const order: OrderRecord = {
          id: "ord_test_lease_stalled",
          userId: "usr_test_001",
          orderNumber: "ORD-20261010-003",
          productId: "prd_1",
          amount: 50_000,
          discountAmount: 0,
          payableAmount: 50_000,
          status: "paid",
          paymentMethod: "online",
          metadata: {
            analytics: {
              ga_client_id: "12345.67890",
            },
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await store.createOrder(order);

        // Initial claim
        const claimInitial = await store.claimOrderForAnalyticsPurchase(order.id);
        expect(claimInitial).not.toBeNull();
        expect((claimInitial?.metadata?.analytics as Record<string, unknown>)?.purchase_status).toBe("processing");

        // Advance 5 minutes (< 15 min lease)
        vi.advanceTimersByTime(5 * 60 * 1000);

        // Attempt claim while lease is active: must fail
        const claimActive = await store.claimOrderForAnalyticsPurchase(order.id);
        expect(claimActive).toBeNull();

        // Advance another 11 minutes (total 16 minutes > 15 min lease)
        vi.advanceTimersByTime(11 * 60 * 1000);

        // Re-claim must succeed
        const claimExpired = await store.claimOrderForAnalyticsPurchase(order.id);
        expect(claimExpired).not.toBeNull();
        const analytics = claimExpired?.metadata?.analytics as Record<string, unknown>;
        expect(analytics?.purchase_status).toBe("processing");
        expect(typeof analytics?.claim_id).toBe("string");
        expect(typeof analytics?.claimed_at_epoch).toBe("number");
      } finally {
        vi.useRealTimers();
      }
    });

    it("never allows re-claiming an order in 'sent' status", async () => {
      const store = new InMemoryCommerceStore();

      const order: OrderRecord = {
        id: "ord_test_sent",
        userId: "usr_test_001",
        orderNumber: "ORD-20261010-004",
        productId: "prd_1",
        amount: 50_000,
        discountAmount: 0,
        payableAmount: 50_000,
        status: "paid",
        paymentMethod: "online",
        metadata: {
          analytics: {
            ga_client_id: "12345.67890",
            purchase_status: "sent",
            claimed_at_epoch: Date.now() - 60 * 60 * 1000, // even hours ago
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createOrder(order);

      const claimResult = await store.claimOrderForAnalyticsPurchase(order.id);
      expect(claimResult).toBeNull();
    });

    it("prevents stale attempt with outdated claimId from overwriting newer claim or sent status", async () => {
      vi.useFakeTimers();
      try {
        const store = new InMemoryCommerceStore();

        const order: OrderRecord = {
          id: "ord_test_stale_claim",
          userId: "usr_test_001",
          orderNumber: "ORD-20261010-005",
          productId: "prd_1",
          amount: 50_000,
          discountAmount: 0,
          payableAmount: 50_000,
          status: "paid",
          paymentMethod: "online",
          metadata: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await store.createOrder(order);

        // Claim #1
        const claim1 = await store.claimOrderForAnalyticsPurchase(order.id);
        const claimId1 = (claim1?.metadata?.analytics as Record<string, unknown>).claim_id as string;

        // Advance 20 minutes (lease expired)
        vi.advanceTimersByTime(20 * 60 * 1000);

        // Claim #2
        const claim2 = await store.claimOrderForAnalyticsPurchase(order.id);
        const claimId2 = (claim2?.metadata?.analytics as Record<string, unknown>).claim_id as string;
        expect(claimId2).not.toEqual(claimId1);

        // Delayed result from attempt #1 tries to write "failed"
        await store.recordOrderAnalyticsPurchaseResult(order.id, "failed", claimId1, "old_timeout");

        // Verify attempt #1 was IGNORED and status is still processing under claim #2
        let fresh = await store.findOrderById(order.id);
        expect((fresh?.metadata?.analytics as Record<string, unknown>).purchase_status).toBe("processing");
        expect((fresh?.metadata?.analytics as Record<string, unknown>).claim_id).toBe(claimId2);

        // Attempt #2 finishes successfully with "sent"
        await store.recordOrderAnalyticsPurchaseResult(order.id, "sent", claimId2);
        fresh = await store.findOrderById(order.id);
        expect((fresh?.metadata?.analytics as Record<string, unknown>).purchase_status).toBe("sent");

        // Even without claimId or with claimId1, cannot overwrite "sent"
        await store.recordOrderAnalyticsPurchaseResult(order.id, "failed", undefined, "ignored_error");
        fresh = await store.findOrderById(order.id);
        expect((fresh?.metadata?.analytics as Record<string, unknown>).purchase_status).toBe("sent");
      } finally {
        vi.useRealTimers();
      }
    });

    it("revoking consent after order creation and before card-to-card approval prevents Purchase dispatch", async () => {
      const store = new InMemoryCommerceStore();
      const service = new Ga4MeasurementProtocolService(mockConfig);

      const product: ProductRecord = {
        id: "prd_plan_c2c",
        title: "طرح دوره‌ای",
        code: "monthly_c2c",
        description: "دسترسی",
        price: 100_000,
        currency: "toman",
        type: "subscription",
        isActive: true,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createProduct(product);

      // 1. User places card-to-card order with valid consent
      const order: OrderRecord = {
        id: "ord_c2c_revocation_test",
        userId: "usr_student_01",
        orderNumber: "ORD-C2C-REVOKE-01",
        productId: product.id,
        amount: 100_000,
        discountAmount: 0,
        payableAmount: 100_000,
        status: "pending",
        paymentMethod: "card_to_card",
        metadata: {
          analytics: {
            consent: "granted",
            ga_client_id: "98765.43210",
            ga_session_id: "1680000000",
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createOrder(order);

      // 2. User revokes consent before admin approval
      await store.revokeUserAnalyticsConsent(order.userId);

      // Verify order metadata in DB now has consent: 'denied' and purchase_status: 'skipped_no_consent'
      const orderAfterRevoke = await store.findOrderById(order.id);
      const analyticsMeta = orderAfterRevoke?.metadata?.analytics as Record<string, unknown>;
      expect(analyticsMeta?.consent).toBe("denied");
      expect(analyticsMeta?.purchase_status).toBe("skipped_no_consent");
      expect(typeof analyticsMeta?.revoked_at).toBe("string");

      // 3. Admin or Telegram Bot later approves the payment and triggers dispatchOrderGa4Purchase
      const sendSpy = vi.spyOn(service, "sendPurchaseEvent");

      const result = await dispatchOrderGa4Purchase({
        orderId: order.id,
        store,
        ga4Service: service,
      });

      // 4. Must NOT dispatch any purchase to Google
      expect(sendSpy).not.toHaveBeenCalled();
      expect(result).toBeNull();

      // Final order status remains skipped_no_consent
      const finalOrder = await store.findOrderById(order.id);
      const finalAnalytics = finalOrder?.metadata?.analytics as Record<string, unknown>;
      expect(finalAnalytics?.purchase_status).toBe("skipped_no_consent");
    });

    it("revoking consent via order-specific revocation method properly prevents Purchase dispatch on Telegram approval", async () => {
      const store = new InMemoryCommerceStore();
      const service = new Ga4MeasurementProtocolService(mockConfig);

      const product: ProductRecord = {
        id: "prd_plan_tg",
        title: "طرح تلگرام",
        code: "monthly_tg",
        description: "دسترسی تلگرام",
        price: 150_000,
        currency: "toman",
        type: "subscription",
        isActive: true,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createProduct(product);

      const order: OrderRecord = {
        id: "ord_tg_revocation_test",
        userId: "usr_student_02",
        orderNumber: "ORD-TG-REVOKE-01",
        productId: product.id,
        amount: 150_000,
        discountAmount: 0,
        payableAmount: 150_000,
        status: "pending",
        paymentMethod: "card_to_card",
        metadata: {
          analytics: {
            consent: "granted",
            ga_client_id: "11223.44556",
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createOrder(order);

      // Order-level revocation
      await store.revokeOrderAnalyticsConsent(order.id);

      const sendSpy = vi.spyOn(service, "sendPurchaseEvent");

      // Telegram ops bot triggers dispatch
      const result = await dispatchOrderGa4Purchase({
        orderId: order.id,
        store,
        ga4Service: service,
      });

      expect(sendSpy).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("order without consent info is NEVER automatically assumed to have consent", async () => {
      const store = new InMemoryCommerceStore();
      const service = new Ga4MeasurementProtocolService(mockConfig);

      const product: ProductRecord = {
        id: "prd_plan_no_consent",
        title: "طرح بدون رضایت",
        code: "plan_no_consent",
        description: "دسترسی",
        price: 50_000,
        currency: "toman",
        type: "subscription",
        isActive: true,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createProduct(product);

      // Order with client_id but NO consent property
      const order: OrderRecord = {
        id: "ord_missing_consent_property",
        userId: "usr_student_03",
        orderNumber: "ORD-NO-CONSENT-01",
        productId: product.id,
        amount: 50_000,
        discountAmount: 0,
        payableAmount: 50_000,
        status: "paid",
        paymentMethod: "online",
        metadata: {
          analytics: {
            ga_client_id: "55555.66666",
            // consent property completely missing
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createOrder(order);

      const sendSpy = vi.spyOn(service, "sendPurchaseEvent");

      const result = await dispatchOrderGa4Purchase({
        orderId: order.id,
        store,
        ga4Service: service,
      });

      expect(sendSpy).not.toHaveBeenCalled();
      expect(result).toBeNull();

      const updated = await store.findOrderById(order.id);
      const analytics = updated?.metadata?.analytics as Record<string, unknown>;
      expect(analytics?.purchase_status).toBe("skipped_no_consent");
    });

    it("consent or analytics service failure never causes financial approval failure", async () => {
      const store = new InMemoryCommerceStore();
      const service = new Ga4MeasurementProtocolService(mockConfig);

      // Even if store throws unexpectedly inside claim
      vi.spyOn(store, "claimOrderForAnalyticsPurchase").mockRejectedValueOnce(
        new Error("Database connection glitch during analytics claim"),
      );

      await expect(
        dispatchOrderGa4Purchase({
          orderId: "ord_any_id",
          store,
          ga4Service: service,
        }),
      ).resolves.not.toThrow();
    });

    it("aborts purchase dispatch when consent is revoked concurrently during claim lease prior to HTTP send", async () => {
      const store = new InMemoryCommerceStore();
      const service = new Ga4MeasurementProtocolService(mockConfig);

      const product: ProductRecord = {
        id: "prd_plan_race",
        title: "طرح مسابقه همزمانی",
        code: "plan_race",
        description: "دسترسی",
        price: 99_000,
        currency: "toman",
        type: "subscription",
        isActive: true,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createProduct(product);

      const order: OrderRecord = {
        id: "ord_race_revocation",
        userId: "usr_student_race",
        orderNumber: "ORD-RACE-REVOKE-01",
        productId: product.id,
        amount: 99_000,
        discountAmount: 0,
        payableAmount: 99_000,
        status: "paid",
        paymentMethod: "card_to_card",
        metadata: {
          analytics: {
            consent: "granted",
            ga_client_id: "77777.88888",
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createOrder(order);

      const sendSpy = vi.spyOn(service, "sendPurchaseEvent");

      // Simulate concurrent revocation occurring during store.findProductById
      const originalFindProduct = store.findProductById.bind(store);
      vi.spyOn(store, "findProductById").mockImplementation(async (id) => {
        // Concurrently revoke consent while order is in "processing" state
        await store.revokeOrderAnalyticsConsent(order.id);
        return originalFindProduct(id);
      });

      const result = await dispatchOrderGa4Purchase({
        orderId: order.id,
        store,
        ga4Service: service,
      });

      // The pre-HTTP check in Step 5.5 must catch this and abort!
      expect(sendSpy).not.toHaveBeenCalled();
      expect(result).toBeNull();

      // Database state must remain skipped_no_consent (never overwritten with 'sent')
      const finalOrder = await store.findOrderById(order.id);
      const analytics = finalOrder?.metadata?.analytics as Record<string, unknown>;
      expect(analytics?.consent).toBe("denied");
      expect(analytics?.purchase_status).toBe("skipped_no_consent");
    });

    it("aborts purchase dispatch when claim lease is superseded by another worker before HTTP send", async () => {
      const store = new InMemoryCommerceStore();
      const service = new Ga4MeasurementProtocolService(mockConfig);

      const product: ProductRecord = {
        id: "prd_plan_supersede",
        title: "طرح اشتراک تستی",
        code: "plan_supersede",
        description: "دسترسی",
        price: 99_000,
        currency: "toman",
        type: "subscription",
        isActive: true,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createProduct(product);

      const order: OrderRecord = {
        id: "ord_lease_supersede",
        userId: "usr_student_supersede",
        orderNumber: "ORD-LEASE-SUPERSEDE-01",
        productId: product.id,
        amount: 99_000,
        discountAmount: 0,
        payableAmount: 99_000,
        status: "paid",
        paymentMethod: "online",
        metadata: {
          analytics: {
            consent: "granted",
            ga_client_id: "33333.44444",
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createOrder(order);

      const sendSpy = vi.spyOn(service, "sendPurchaseEvent");

      // Simulate lease stolen by another worker changing claim_id
      const originalFindProduct = store.findProductById.bind(store);
      vi.spyOn(store, "findProductById").mockImplementation(async (id) => {
        const o = (store as any).orders.find((x: any) => x.id === order.id);
        if (o) {
          o.metadata.analytics.claim_id = "claim_superseded_by_other_worker";
        }
        return originalFindProduct(id);
      });

      const result = await dispatchOrderGa4Purchase({
        orderId: order.id,
        store,
        ga4Service: service,
      });

      expect(sendSpy).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it("aborts dispatch when revocation happens at the closest point (Step 5.5 double check immediately prior to fetch)", async () => {
      const store = new InMemoryCommerceStore();
      const service = new Ga4MeasurementProtocolService(mockConfig);

      const product: ProductRecord = {
        id: "prd_plan_closest",
        title: "طرح نزدیکترین مسابقه",
        code: "plan_closest",
        description: "دسترسی",
        price: 99_000,
        currency: "toman",
        type: "subscription",
        isActive: true,
        deletedAt: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createProduct(product);

      const order: OrderRecord = {
        id: "ord_closest_revocation",
        userId: "usr_student_closest",
        orderNumber: "ORD-CLOSEST-REVOKE-01",
        productId: product.id,
        amount: 99_000,
        discountAmount: 0,
        payableAmount: 99_000,
        status: "paid",
        paymentMethod: "online",
        metadata: {
          analytics: {
            consent: "granted",
            ga_client_id: "99887.66554",
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createOrder(order);

      const sendSpy = vi.spyOn(service, "sendPurchaseEvent");

      // Hook into findOrderById so that during Step 5.5 (after product and currency conversion are done),
      // consent revocation occurs right at the final DB double-check before HTTP call
      const originalFindOrderById = store.findOrderById.bind(store);
      vi.spyOn(store, "findOrderById").mockImplementation(async (id) => {
        // Concurrently revoke consent
        await store.revokeOrderAnalyticsConsent(id);
        return originalFindOrderById(id);
      });

      const result = await dispatchOrderGa4Purchase({
        orderId: order.id,
        store,
        ga4Service: service,
      });

      expect(sendSpy).not.toHaveBeenCalled();
      expect(result).toBeNull();

      const finalOrder = await store.findOrderById(order.id);
      const analytics = finalOrder?.metadata?.analytics as Record<string, unknown>;
      expect(analytics?.consent).toBe("denied");
      expect(analytics?.purchase_status).toBe("skipped_no_consent");
    });

    it("prevents stale/late processing results (sent or failed) from overwriting skipped_no_consent status", async () => {
      const store = new InMemoryCommerceStore();

      const order: OrderRecord = {
        id: "ord_stale_overwrite_guard",
        userId: "usr_student_guard",
        orderNumber: "ORD-GUARD-OVERWRITE-01",
        productId: "prd_any" as any,
        amount: 99_000,
        discountAmount: 0,
        payableAmount: 99_000,
        status: "paid",
        paymentMethod: "online",
        metadata: {
          analytics: {
            consent: "granted",
            ga_client_id: "12345.67890",
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.createOrder(order);

      // Claim the order
      const claimed = await store.claimOrderForAnalyticsPurchase(order.id);
      const claimId = (claimed?.metadata?.analytics as any)?.claim_id;
      expect(claimId).toBeDefined();

      // User revokes consent, setting skipped_no_consent and invalidating claim_id
      await store.revokeOrderAnalyticsConsent(order.id);
      const revokedOrder = await store.findOrderById(order.id);
      expect((revokedOrder?.metadata?.analytics as any)?.purchase_status).toBe("skipped_no_consent");

      // Stale worker finishes and tries to report 'sent'
      await store.recordOrderAnalyticsPurchaseResult(order.id, "sent", claimId);
      const afterSentAttempt = await store.findOrderById(order.id);
      expect((afterSentAttempt?.metadata?.analytics as any)?.purchase_status).toBe("skipped_no_consent");

      // Stale worker tries to report 'failed' with claimId
      await store.recordOrderAnalyticsPurchaseResult(order.id, "failed", claimId, "timed out");
      const afterFailedAttempt = await store.findOrderById(order.id);
      expect((afterFailedAttempt?.metadata?.analytics as any)?.purchase_status).toBe("skipped_no_consent");

      // Stale catch block tries to report 'failed' without claimId
      await store.recordOrderAnalyticsPurchaseResult(order.id, "failed", undefined, "catch block error");
      const afterCatchAttempt = await store.findOrderById(order.id);
      expect((afterCatchAttempt?.metadata?.analytics as any)?.purchase_status).toBe("skipped_no_consent");
    });
  });
});

