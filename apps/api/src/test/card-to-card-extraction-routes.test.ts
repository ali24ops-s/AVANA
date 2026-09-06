import { describe, it, expect, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import {
  type Actor,
  asUserId,
} from "@avana/domain";
import { InMemoryCommerceStore } from "../modules/commerce/commerce-store.js";
import { CommerceService } from "../modules/commerce/commerce-service.js";
import { MockPaymentGateway } from "../modules/commerce/gateway/mock-gateway.js";
import { PaymentInfoExtractionService } from "../modules/commerce/payment-extraction-service.js";
import type { ModelGateway, CompletionRequest, CompletionResult } from "../modules/generation/gateway/types.js";

class TestMockModelGateway implements ModelGateway {
  readonly provider = "mock" as const;
  public lastRequest?: CompletionRequest;
  public mockResponseText: string = JSON.stringify({
    amount: 299000,
    currency: "toman",
    trackingNumber: "AI998877",
    sourceCardLast4: "5566",
    paymentDate: "1404/12/10",
    paymentTime: "15:20",
    payerName: "سارا احمدی",
  });

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.lastRequest = req;
    return {
      text: this.mockResponseText,
      model: "mock-ai",
      usage: { inputTokens: 50, outputTokens: 50 },
      finishReason: "stop",
    };
  }
}

describe("Card-to-Card Payment Extraction & Flow Isolation", () => {
  let commerceStore: InMemoryCommerceStore;
  let mockGateway: MockPaymentGateway;
  let commerceService: CommerceService;
  let modelGateway: TestMockModelGateway;
  let extractionService: PaymentInfoExtractionService;

  const testUser: Actor = {
    userId: asUserId(randomUUID() as any),
    role: "student",
  };

  const c2cConfig = {
    enabled: true,
    destinationCardNumber: "5894631131738239",
    cardholderName: "علی محمدلو",
    instructions: "لطفاً مبلغ را به شماره کارت فوق واریز کرده و اطلاعات را ثبت کنید.",
  };

  beforeEach(async () => {
    commerceStore = new InMemoryCommerceStore();
    mockGateway = new MockPaymentGateway();
    modelGateway = new TestMockModelGateway();
    commerceService = new CommerceService(
      commerceStore,
      mockGateway,
      undefined,
      undefined,
      undefined,
      c2cConfig,
    );
    extractionService = new PaymentInfoExtractionService(
      modelGateway,
      c2cConfig.destinationCardNumber,
    );
  });

  describe("1. Pure Read-Only Extraction (Zero Financial Side Effects)", () => {
    it("extracts details from standard bank SMS using rule-based parsing", async () => {
      const sms = `
بانک صادرات
برداشت از: ۶۰۳۷۶۹******۱۲۳۴
مبلغ: ۲۹۹٬۰۰۰ تومان
شماره پیگیری: ۸۸۷۷۶۶۵۵۴۴
تاریخ: ۱۴۰۴/۱۲/۱۸ ساعت ۱۰:۱۵
`;
      const result = await extractionService.extract(sms);
      expect(result.extractionMethod).toBe("rule");
      expect(result.data.amount).toBe(299000);
      expect(result.data.trackingNumber).toBe("8877665544");
      expect(result.data.sourceCardLast4).toBe("1234");
      expect(result.data.paymentDate).toBe("1404/12/18");
      expect(result.data.paymentTime).toBe("10:15");
      expect(result.sanitizedText).toContain("**** **** **** 1234");
    });

    it("verifies that calling extract does NOT create any orders, payments, or subscriptions in the database", async () => {
      const initialOrders = await commerceStore.listOrdersByUser(testUser.userId);
      const initialSub = await commerceStore.findActiveSubscription(testUser.userId);

      expect(initialOrders).toHaveLength(0);
      expect(initialSub).toBeNull();

      const sms = "مبلغ: ۲۹۹٬۰۰۰ تومان پیگیری: ۱۲۳۴۵۶ از کارت: ۱۱۱۱";
      await extractionService.extract(sms);
      await extractionService.extract(sms); // Repeated extraction

      const afterOrders = await commerceStore.listOrdersByUser(testUser.userId);
      const afterSub = await commerceStore.findActiveSubscription(testUser.userId);

      expect(afterOrders).toHaveLength(0);
      expect(afterSub).toBeNull();
    });

    it("falls back to AI Gateway when essential fields are missing from rule parser", async () => {
      // Missing tracking number and card number from regular regex
      const messyReceipt = "رسید انتقال وجوه واریز شد به حساب آوانا";
      const result = await extractionService.extract(messyReceipt, { useAiFallback: true });

      expect(modelGateway.lastRequest).toBeDefined();
      expect(result.data.trackingNumber).toBe("AI998877");
      expect(result.data.sourceCardLast4).toBe("5566");
      expect(result.extractionMethod).toBe("ai");
    });
  });

  describe("2. Sanitized Storage & Security in Payment Submission", () => {
    it("persists sanitized payment text inside initialValidationResult without full card number or OTP", async () => {
      const products = await commerceService.listActiveProducts();
      const product = products[0];

      const rawPastedText = `
بانک پاسارگاد
انتقال از کارت 6037991234567890
رمز پویا: 123456 CVV2: 321
مبلغ: ${product.price} تومان
شماره پیگیری: 77889900
تاریخ: 1404/12/20
`;

      const submission = await commerceService.submitCardToCardPayment(
        testUser,
        {
          productId: product.id,
          amount: product.price,
          trackingNumber: "77889900",
          sourceCardLast4: "7890",
          rawPaymentText: rawPastedText,
          extractionMethod: "rule",
        },
        "req-1",
      );

      expect(submission.success).toBe(true);

      // Verify payment in store
      const payment = await commerceStore.findPaymentById(submission.paymentId);
      expect(payment).toBeDefined();

      const validationRes = payment!.initialValidationResult as any;
      expect(validationRes).toBeDefined();
      expect(validationRes.amountMatched).toBe(true);
      expect(validationRes.paymentExtraction).toBeDefined();

      const storedText = validationRes.paymentExtraction.sanitizedPaymentText;
      expect(storedText).not.toContain("6037991234567890");
      expect(storedText).not.toContain("123456");
      expect(storedText).not.toContain("321");
      expect(storedText).toContain("**** **** **** 7890");
      expect(storedText).toContain("CVV2: ***");
      expect(storedText).toContain("رمز پویا: [REDACTED]");
    });
  });
});
