/**
 * Payment Gateway Adapter Types.
 *
 * Provides a uniform contract for initiating and verifying transactions across
 * multiple payment providers (ZarinPal, Mock, etc.).
 */

import type { OrderRecord, UserId } from "@avana/domain";

export type PaymentRequestInput = {
  order: OrderRecord;
  user: {
    userId: UserId;
    email?: string;
    mobile?: string;
  };
  callbackUrl: string;
  description?: string;
};

export type PaymentRequestResult = {
  redirectUrl: string;
  authority: string;
};

export type PaymentVerifyInput = {
  authority: string;
  amount: number; // in Tomans
};

export type PaymentVerifyResult = {
  success: boolean;
  transactionId?: string;
  errorMessage?: string;
  rawResponse: Record<string, unknown>;
};

export interface PaymentGateway {
  readonly gatewayName: string;

  /**
   * Requests a payment transaction authority and gateway redirection URL.
   */
  requestPayment(input: PaymentRequestInput): Promise<PaymentRequestResult>;

  /**
   * Verifies the completion and payment integrity with the gateway.
   */
  verifyPayment(input: PaymentVerifyInput): Promise<PaymentVerifyResult>;
}
