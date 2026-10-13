/**
 * Central Type-safe Tracking API for AVANA.
 *
 * Rules:
 * - Direct interface to window.dataLayer
 * - No PII, student answers, or secret tokens are ever transmitted
 * - Page location strictly excludes query parameters (?...) and hash (#...)
 * - Routes under /admin/* are excluded from marketing reports
 * - Event dispatch is silenced when tracking is disabled
 */

import { isAnalyticsEnabled, getTrackerConfig } from "./config.js";
import type {
  AddPaymentInfoParams,
  AuthMethod,
  BeginCheckoutParams,
  CardToCardSubmittedParams,
  EventParamPrimitive,
  LoginEventParams,
  PageViewParams,
  SignUpEventParams,
} from "./types.js";

export { convertTomanToIrr } from "./currency.js";
export {
  getGaClientIdFromCookie,
  getGaSessionIdFromCookie,
  getClientAnalyticsPayload,
} from "./cookies.js";


const DEFAULT_PAGE_TITLE = "آوانا - همراه هوشمند یادگیری شما";

/**
 * Returns a sanitized URL location containing only origin and pathname.
 * Query parameters and fragments are completely stripped to prevent token or PII leakage.
 */
export function getSafePageLocation(origin?: string, pathname?: string): string {
  const baseOrigin =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const rawPath =
    pathname ?? (typeof window !== "undefined" ? window.location.pathname : "/");

  // Strip any accidental query string or hash if passed in rawPath
  const cleanPath = rawPath.split("?")[0]?.split("#")[0] || "/";
  const normalizedPath = cleanPath.startsWith("/") ? cleanPath : `/${cleanPath}`;

  return `${baseOrigin}${normalizedPath}`;
}

/**
 * Checks whether a route pathname is eligible for marketing analytics tracking.
 * Administrative paths (/admin/*) are excluded.
 */
export function shouldTrackPath(pathname: string): boolean {
  if (!pathname) return false;
  const normalized = pathname.toLowerCase();
  if (normalized === "/admin" || normalized.startsWith("/admin/")) {
    return false;
  }
  return true;
}

/**
 * Retrieves safe document title without deriving from URL parameters or user PII.
 */
export function getSafePageTitle(): string {
  if (typeof document !== "undefined" && document.title?.trim()) {
    return document.title.trim();
  }
  return DEFAULT_PAGE_TITLE;
}

/**
 * Push an arbitrary event object directly into window.dataLayer.
 * Silently no-ops if analytics is disabled.
 */
export function pushToDataLayer(eventData: Record<string, unknown>): boolean {
  if (!isAnalyticsEnabled() || typeof window === "undefined") {
    return false;
  }

  try {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(eventData);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely dispatches an event to Google Analytics 4 via window.gtag.
 * Fails gracefully if gtag is not available or throws.
 */
export function sendGtagEvent(
  eventName: string,
  eventParams?: Record<string, unknown>,
): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    if (typeof window.gtag === "function") {
      window.gtag("event", eventName, eventParams || {});
      return true;
    }
    // If window.gtag is not yet attached but dataLayer exists, queue in standard gtag format
    if (window.dataLayer) {
      window.dataLayer.push([
        "event",
        eventName,
        eventParams || {},
      ] as unknown as Record<string, unknown>);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Internal dispatcher for tracking events.
 * 1. Pushes to dataLayer for backward compatibility, testing, and GTM container.
 * 2. In direct GA4 mode, forwards directly to GA4 via sendGtagEvent without duplicate dispatching.
 */
function emitEvent(
  eventName: string,
  eventParams?: Record<string, unknown>,
  dataLayerOverride?: Record<string, unknown>,
): boolean {
  if (!isAnalyticsEnabled() || typeof window === "undefined") {
    return false;
  }

  // 1. Record in window.dataLayer (for internal tests and GTM compatibility)
  const dlPayload = dataLayerOverride ?? {
    event: eventName,
    ...(eventParams || {}),
  };
  pushToDataLayer(dlPayload);

  // 2. In direct GA4 mode, dispatch directly to GA4 via window.gtag
  const config = getTrackerConfig();
  if (config.mode === "ga4") {
    sendGtagEvent(eventName, eventParams);
  }

  return true;
}

/**
 * Central generic event dispatcher.
 * Type-safe parameters restricted to primitives (string, number, boolean, null, undefined).
 */
export function trackEvent(
  eventName: string,
  params?: Record<string, EventParamPrimitive>,
): boolean {
  if (!eventName || !isAnalyticsEnabled()) {
    return false;
  }

  const cleanParams: Record<string, unknown> = {};
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        cleanParams[key] = value;
      }
    }
  }

  return emitEvent(eventName, cleanParams);
}

/**
 * Track a pageview with sanitized location and path.
 *
 * Excludes /admin/* paths and strips query params/hash.
 */
export function trackPageView(
  pathname: string,
  customTitle?: string,
): boolean {
  if (!shouldTrackPath(pathname) || !isAnalyticsEnabled()) {
    return false;
  }

  const safeLocation = getSafePageLocation(undefined, pathname);
  const safeTitle = customTitle || getSafePageTitle();

  const payload: PageViewParams = {
    page_title: safeTitle,
    page_location: safeLocation,
    page_path: pathname.split("?")[0]?.split("#")[0] || pathname,
  };

  return emitEvent("page_view", payload);
}

/**
 * Track successful user registration.
 *
 * Emitted strictly upon verified account creation.
 * No PII, passwords, or personal data are included.
 */
export function trackSignUp(method: AuthMethod = "password"): boolean {
  if (!isAnalyticsEnabled()) {
    return false;
  }

  const payload: SignUpEventParams = {
    method,
  };

  return emitEvent("sign_up", payload);
}

/**
 * Track successful user login.
 *
 * Emitted strictly upon successful user-initiated authentication.
 * Method is restricted to 'password' or 'otp'.
 * Not emitted on session restore or fetchMe.
 */
export function trackLogin(method: "password" | "otp" = "password"): boolean {
  if (!isAnalyticsEnabled()) {
    return false;
  }

  const payload: LoginEventParams = {
    method,
  };

  return emitEvent("login", payload);
}

/**
 * Track user initiation of checkout funnel for a specific plan/product.
 *
 * Rules:
 * - Emitted strictly upon deliberate user purchase intent (not upon page visit).
 * - Currency must be standard ISO 4217 "IRR" with valid positive value.
 * - Items array must be non-empty.
 */
export function trackBeginCheckout(params: BeginCheckoutParams): boolean {
  if (!isAnalyticsEnabled() || !params || params.currency !== "IRR") {
    return false;
  }

  if (
    typeof params.value !== "number" ||
    params.value <= 0 ||
    !Number.isFinite(params.value) ||
    !Array.isArray(params.items) ||
    params.items.length === 0
  ) {
    return false;
  }

  const ecommercePayload: Record<string, unknown> = {
    currency: "IRR",
    value: params.value,
    items: params.items.map((item) => ({
      item_id: item.item_id,
      item_name: item.item_name,
      ...(item.item_category ? { item_category: item.item_category } : {}),
      price: item.price,
      quantity: item.quantity,
    })),
  };

  if (params.coupon) {
    ecommercePayload.coupon = params.coupon;
  }

  return emitEvent("begin_checkout", ecommercePayload, {
    event: "begin_checkout",
    ecommerce: ecommercePayload,
  });
}

/**
 * Track user submission of payment information (e.g. Card-to-Card or Online Gateway).
 *
 * Rules:
 * - No card numbers, tracking numbers, or personal details are included.
 * - Currency must be "IRR" with valid positive value.
 */
export function trackAddPaymentInfo(params: AddPaymentInfoParams): boolean {
  if (!isAnalyticsEnabled() || !params || params.currency !== "IRR") {
    return false;
  }

  if (
    typeof params.value !== "number" ||
    params.value <= 0 ||
    !Number.isFinite(params.value) ||
    !Array.isArray(params.items) ||
    params.items.length === 0
  ) {
    return false;
  }

  const ecommercePayload: Record<string, unknown> = {
    currency: "IRR",
    value: params.value,
    payment_type: params.payment_type,
    items: params.items.map((item) => ({
      item_id: item.item_id,
      item_name: item.item_name,
      ...(item.item_category ? { item_category: item.item_category } : {}),
      price: item.price,
      quantity: item.quantity,
    })),
  };

  if (params.coupon) {
    ecommercePayload.coupon = params.coupon;
  }

  return emitEvent("add_payment_info", ecommercePayload, {
    event: "add_payment_info",
    ecommerce: ecommercePayload,
  });
}

/**
 * Track Card-to-Card receipt submission.
 *
 * Rules:
 * - Emitted strictly upon successful receipt submission to the server.
 * - Represents that the receipt is pending admin review.
 * - NEVER represents a financial purchase!
 * - No receipt image URLs, transfer notes, or banking details are included.
 */
export function trackCardToCardSubmitted(
  params: CardToCardSubmittedParams,
): boolean {
  if (!isAnalyticsEnabled() || !params || params.currency !== "IRR") {
    return false;
  }

  if (
    typeof params.value !== "number" ||
    params.value <= 0 ||
    !Number.isFinite(params.value) ||
    !Array.isArray(params.items) ||
    params.items.length === 0
  ) {
    return false;
  }

  const ecommercePayload = {
    currency: "IRR",
    value: params.value,
    items: params.items.map((item) => ({
      item_id: item.item_id,
      item_name: item.item_name,
      ...(item.item_category ? { item_category: item.item_category } : {}),
      price: item.price,
      quantity: item.quantity,
    })),
  };

  return emitEvent("card_to_card_submitted", ecommercePayload, {
    event: "card_to_card_submitted",
    ecommerce: ecommercePayload,
  });
}


