/**
 * ZarinPal Payment Gateway Adapter.
 *
 * Production Iranian payment gateway integration implementing ZarinPal REST API v4.
 */

import type {
  PaymentGateway,
  PaymentRequestInput,
  PaymentRequestResult,
  PaymentVerifyInput,
  PaymentVerifyResult,
} from "./types.js";

export interface ZarinpalConfig {
  merchantId: string;
  sandbox?: boolean;
}

export class ZarinpalPaymentGateway implements PaymentGateway {
  readonly gatewayName = "zarinpal";
  private readonly baseUrl: string;
  private readonly payUrl: string;

  constructor(private readonly config: ZarinpalConfig) {
    if (config.sandbox) {
      this.baseUrl = "https://sandbox.zarinpal.com/pg/v4/payment";
      this.payUrl = "https://sandbox.zarinpal.com/pg/StartPay";
    } else {
      this.baseUrl = "https://payment.zarinpal.com/pg/v4/payment";
      this.payUrl = "https://payment.zarinpal.com/pg/StartPay";
    }
  }

  async requestPayment(
    input: PaymentRequestInput,
  ): Promise<PaymentRequestResult> {
    const payload = {
      merchant_id: this.config.merchantId,
      amount: input.order.amount, // Tomans
      currency: "IRT",
      callback_url: input.callbackUrl,
      description:
        input.description || `پرداخت سفارش ${input.order.orderNumber} در آوانا`,
      metadata: {
        email: input.user.email,
        mobile: input.user.mobile,
        order_id: input.order.id,
      },
    };

    try {
      const response = await fetch(`${this.baseUrl}/request.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const resData = (await response.json()) as {
        data?: {
          code: number;
          message: string;
          authority: string;
          fee_type: string;
          fee: number;
        };
        errors?: Array<{ code: number; message: string }> | Record<string, unknown>;
      };

      if (resData.data && resData.data.code === 100) {
        const authority = resData.data.authority;
        return {
          authority,
          redirectUrl: `${this.payUrl}/${authority}`,
        };
      }

      const errMsg =
        Array.isArray(resData.errors) && resData.errors.length > 0
          ? resData.errors[0].message
          : `خطا در اتصال به درگاه پرداخت زرین‌پال (کد: ${resData.data?.code ?? "نامشخص"})`;

      throw new Error(errMsg);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطا در درخواست پرداخت";
      throw new Error(msg);
    }
  }

  async verifyPayment(input: PaymentVerifyInput): Promise<PaymentVerifyResult> {
    const payload = {
      merchant_id: this.config.merchantId,
      amount: input.amount, // in Tomans
      authority: input.authority,
    };

    try {
      const response = await fetch(`${this.baseUrl}/verify.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const resData = (await response.json()) as {
        data?: {
          code: number;
          message: string;
          card_hash: string;
          card_pan: string;
          ref_id: number | string;
          fee_type: string;
          fee: number;
        };
        errors?: Array<{ code: number; message: string }>;
      };

      if (
        resData.data &&
        (resData.data.code === 100 || resData.data.code === 101)
      ) {
        return {
          success: true,
          transactionId: String(resData.data.ref_id),
          rawResponse: resData as unknown as Record<string, unknown>,
        };
      }

      return {
        success: false,
        errorMessage:
          resData.errors?.[0]?.message ||
          `تراکنش تایید نشد (کد: ${resData.data?.code ?? "نامشخص"})`,
        rawResponse: resData as unknown as Record<string, unknown>,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطا در بررسی تراکنش";
      return {
        success: false,
        errorMessage: msg,
        rawResponse: { error: msg },
      };
    }
  }
}
