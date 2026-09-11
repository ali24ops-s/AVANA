/**
 * Mock Payment Gateway Adapter.
 *
 * Deterministic in-memory payment gateway for local development, unit tests,
 * and automated integration testing without requiring external bank connectivity.
 */

import { randomUUID } from "node:crypto";
import { DomainError } from "@avana/domain";
import type {
  PaymentGateway,
  PaymentRequestInput,
  PaymentRequestResult,
  PaymentVerifyInput,
  PaymentVerifyResult,
} from "./types.js";

export class MockPaymentGateway implements PaymentGateway {
  readonly gatewayName = "mock";
  readonly enabled: boolean;
  public authorities = new Map<
    string,
    { amount: number; paid: boolean; shouldFail?: boolean }
  >();

  constructor(options?: { enabled?: boolean }) {
    this.enabled = options?.enabled ?? false;
  }

  async requestPayment(
    input: PaymentRequestInput,
  ): Promise<PaymentRequestResult> {
    if (!this.enabled) {
      throw new DomainError(
        "bad_request",
        "درگاه پرداخت آزمایشی (Mock) غیرفعال است.",
      );
    }

    const authority = `mock_auth_${randomUUID().replace(/-/g, "")}`;
    const shouldFail = input.order.metadata?.mockShouldFail === true;

    this.authorities.set(authority, {
      amount: input.order.amount,
      paid: false,
      shouldFail,
    });

    const redirectUrl = `${input.callbackUrl}${
      input.callbackUrl.includes("?") ? "&" : "?"
    }Authority=${authority}&Status=${shouldFail ? "NOK" : "OK"}`;

    return {
      redirectUrl,
      authority,
    };
  }

  async verifyPayment(input: PaymentVerifyInput): Promise<PaymentVerifyResult> {
    if (!this.enabled) {
      return {
        success: false,
        errorMessage: "درگاه پرداخت آزمایشی (Mock) غیرفعال است.",
        rawResponse: {
          code: -99,
          message: "Mock payment gateway is globally disabled",
        },
      };
    }

    const authData = this.authorities.get(input.authority);

    if (input.authority.startsWith("mock_fail_") || authData?.shouldFail) {
      return {
        success: false,
        errorMessage: "تراکنش توسط کاربر یا درگاه بانکی لغو شد.",
        rawResponse: {
          code: -11,
          message: "Payment canceled by user or failed",
        },
      };
    }

    const txId = `mock_tx_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    if (authData) {
      authData.paid = true;
    }

    return {
      success: true,
      transactionId: txId,
      rawResponse: {
        code: 100,
        message: "Operation was successful",
        ref_id: txId,
        authority: input.authority,
        amount: input.amount,
      },
    };
  }
}
