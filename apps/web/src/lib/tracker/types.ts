/**
 * Type-safe definitions for AVANA Tracking & Analytics Layer.
 *
 * Strict typing with ZERO usage of `any`.
 */

export interface TrackerConfig {
  gtmId: string;
  enabled: boolean;
}

export type EventParamPrimitive = string | number | boolean | null | undefined;

export interface BaseEventParams {
  [key: string]: EventParamPrimitive;
}

export interface PageViewParams extends BaseEventParams {
  page_title: string;
  page_location: string;
  page_path: string;
}

export type AuthMethod = "password" | "otp" | "unknown";

export interface SignUpEventParams extends BaseEventParams {
  method: AuthMethod;
}

export interface LoginEventParams extends BaseEventParams {
  method: "password" | "otp";
}

export interface UtmParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

export interface EcommerceItem {
  item_id: string;
  item_name: string;
  item_category?: string;
  price: number;
  quantity: number;
}

export interface BeginCheckoutParams {
  currency: "IRR";
  value: number;
  items: EcommerceItem[];
  coupon?: string;
}

export interface AddPaymentInfoParams {
  currency: "IRR";
  value: number;
  payment_type: "card_to_card" | "online_gateway" | "wallet";
  items: EcommerceItem[];
  coupon?: string;
}

export interface CardToCardSubmittedParams {
  currency: "IRR";
  value: number;
  items: EcommerceItem[];
}

export interface ClientAnalyticsPayload {
  [key: string]: unknown;
  consent?: "granted" | "denied";
  ga_client_id?: string;
  ga_session_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
}

export interface DataLayerEvent {
  event: string;
  [key: string]: unknown;
}

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
    __gtmInitialized?: boolean;
  }
}

