/**
 * Mock Payment Gateway Adapter.
 *
 * Deterministic in-memory payment gateway for local development, unit tests,
 * and automated integration testing without requiring external bank connectivity.
 */

import { randomUUID } from "node:crypto";
import type {
  PaymentGateway,
  PaymentRequestInput,
  PaymentRequestResult,
  PaymentVerifyInput,
  PaymentVerifyResult,
} from "./types.js";

export class MockPaymentGateway implements PaymentGateway {
  readonly gatewayName = "mock";
  public authorities = new Map<
    string,
    { amount: number; paid: boolean; shouldFail?: boolean }
  >();

  async requestPayment(
    input: PaymentRequestInput,
  ): Promise<PaymentRequestResult> {
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
