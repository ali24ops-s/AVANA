/**
 * Typed Commerce and Monetization API Client for AVANA.
 */

export type ProductDto = {
  id: string;
  code: string;
  type: "subscription" | "content_pack" | "course" | "content" | "special_exam";
  title: string;
  description: string | null;
  price: number;
  currency: string;
  target_type: string | null;
  target_id: string | null;
  duration_days: number | null;
  metadata: Record<string, unknown>;
};

export type ListProductsResponse = {
  items: ProductDto[];
};

export type CheckoutRequest = {
  product_id: string;
  callback_url?: string;
  gateway?: string;
};

export type CheckoutResponse = {
  order_id: string;
  payment_id: string;
  payment_url: string;
  authority: string;
};

export type VerifyPaymentRequest = {
  authority: string;
  status?: string;
};

export type VerifyPaymentResponse = {
  success: boolean;
  order_id?: string;
  payment_id?: string;
  transaction_id?: string;
  error_message?: string;
  entitlement?: {
    resource_type: string;
    resource_id: string | null;
    expires_at: string | null;
  };
  subscription?: {
    id: string;
    expires_at: string;
  };
};

export type AccessDecisionResponse = {
  granted: boolean;
  reason:
    | "free"
    | "admin_grant"
    | "creator_access"
    | "subscription"
    | "content_pack_purchase"
    | "course_purchase"
    | "locked";
  expiresAt: string | null;
  availablePurchaseOptions: Array<{
    type: "subscription" | "content_pack" | "course";
    productId: string;
    code: string;
    title: string;
    price: number;
    currency: string;
    durationDays: number | null;
  }>;
};

export type MySubscriptionResponse = {
  subscription: {
    id: string;
    product_id: string;
    status: string;
    started_at: string;
    expires_at: string;
  } | null;
};

export type MyEntitlementsResponse = {
  items: Array<{
    id: string;
    resource_type: string;
    resource_id: string | null;
    source_type: string;
    starts_at: string;
    expires_at: string | null;
  }>;
};

export type OrderDto = {
  id: string;
  order_number: string;
  product_id: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "failed" | "cancelled" | "expired";
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ListMyOrdersResponse = {
  items: OrderDto[];
};

export type CardToCardInfoResponse = {
  enabled: boolean;
  destinationCardNumber?: string;
  cardholderName?: string;
  instructions?: string;
};

export type CardToCardPaymentRequest = {
  product_id: string;
  amount: number;
  tracking_number: string;
  source_card_last4: string;
  payment_date?: string;
  payment_time?: string;
  payer_name?: string;
  receipt_url?: string;
  raw_payment_text?: string;
  extraction_method?: "rule" | "ai" | "hybrid" | "manual";
};

export type ExtractPaymentRequest = {
  text: string;
  product_id?: string;
  use_ai_fallback?: boolean;
};

export type PaymentExtractionDto = {
  data: {
    amount: number | null;
    rawAmount: number | null;
    currency: "toman" | "rial" | null;
    trackingNumber: string | null;
    sourceCardLast4: string | null;
    paymentDate: string | null;
    paymentTime: string | null;
    payerName: string | null;
  };
  confidence: {
    amount: "high" | "medium" | "low";
    trackingNumber: "high" | "medium" | "low";
    sourceCardLast4: "high" | "medium" | "low";
    paymentDate: "high" | "medium" | "low";
    paymentTime: "high" | "medium" | "low";
    payerName: "high" | "medium" | "low";
  };
  extractionMethod: "rule" | "ai" | "hybrid" | "manual";
  missingFields: string[];
  sanitizedText: string;
};

export type CardToCardSubmissionResponse = {
  success: boolean;
  orderId: string;
  paymentId: string;
  subscriptionId: string;
  attemptId?: string;
  attempt_id?: string;
  status: string;
  subscriptionStatus: string;
  message: string;
  expiresAt: string;
};

import type { ApiClient } from "./client.js";

export function createCommerceApi(client: ApiClient) {
  return {
    async listProducts(): Promise<ListProductsResponse> {
      return client.get<ListProductsResponse>("/v1/commerce/products");
    },

    async getProduct(productId: string): Promise<{ product: ProductDto }> {
      return client.get<{ product: ProductDto }>(
        `/v1/commerce/products/${encodeURIComponent(productId)}`,
      );
    },

    async checkout(data: CheckoutRequest): Promise<CheckoutResponse> {
      return client.post<CheckoutResponse>("/v1/commerce/checkout", data);
    },

    async verifyPayment(
      data: VerifyPaymentRequest,
    ): Promise<VerifyPaymentResponse> {
      return client.post<VerifyPaymentResponse>("/v1/commerce/verify", data);
    },

    async getCardToCardInfo(): Promise<CardToCardInfoResponse> {
      return client.get<CardToCardInfoResponse>("/v1/commerce/card-to-card/info");
    },

    async extractCardToCardPaymentInfo(
      data: ExtractPaymentRequest,
    ): Promise<PaymentExtractionDto> {
      return client.post<PaymentExtractionDto>(
        "/v1/commerce/card-to-card/extract",
        data,
      );
    },

    async submitCardToCardPayment(
      data: CardToCardPaymentRequest,
    ): Promise<CardToCardSubmissionResponse> {
      return client.post<CardToCardSubmissionResponse>(
        "/v1/commerce/payments/card-to-card",
        data,
      );
    },

    async getPayment(
      paymentId: string,
    ): Promise<{ payment: Record<string, unknown> }> {
      return client.get<{ payment: Record<string, unknown> }>(
        `/v1/commerce/payments/${encodeURIComponent(paymentId)}`,
      );
    },

    async checkAccess(params: {
      resourceType: string;
      resourceId: string;
      courseId?: string;
      contentPackId?: string;
    }): Promise<AccessDecisionResponse> {
      const search = new URLSearchParams();
      search.set("resource_type", params.resourceType);
      search.set("resource_id", params.resourceId);
      if (params.courseId) search.set("course_id", params.courseId);
      if (params.contentPackId)
        search.set("content_pack_id", params.contentPackId);

      return client.get<AccessDecisionResponse>(
        `/v1/commerce/access/check?${search.toString()}`,
      );
    },

    async getMySubscription(): Promise<MySubscriptionResponse> {
      return client.get<MySubscriptionResponse>(
        "/v1/commerce/subscriptions/my",
      );
    },

    async getMyEntitlements(): Promise<MyEntitlementsResponse> {
      return client.get<MyEntitlementsResponse>(
        "/v1/commerce/entitlements/my",
      );
    },

    async getMyOrders(): Promise<ListMyOrdersResponse> {
      return client.get<ListMyOrdersResponse>(
        "/v1/commerce/orders/my",
      );
    },
  };
}
