/* eslint-disable no-secrets/no-secrets */
/**
 * Tests for AVANA Tracking & Analytics Layer.
 *
 * Verifies all required conditions:
 * 1. Missing or invalid GTM ID does not crash.
 * 2. GTM script is not installed more than once.
 * 3. In development, GTM is not loaded by default.
 * 4. Event dispatch is blocked when analytics is disabled.
 * 5. Route changes trigger one pageview when enabled.
 * 6. Paths under /admin/* produce NO marketing pageview.
 * 7. Query parameters (?...) and hashes (#...) are excluded from page_location.
 * 8. React Strict Mode does not cause duplicate pageview events.
 * 9. Sign-up emits exactly one sign_up event without PII.
 * 10. Login emits login event with method (password or otp) without PII.
 * 11. fetchMe and session refresh does NOT produce login events.
 * 12. UTM parameters are validated, sanitized, and stored in sessionStorage.
 * 13. UTM parameters persist across internal SPA navigations.
 * 14. Malicious, invalid, or PII-laden UTM parameters are rejected.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { StrictMode, type ReactNode } from "react";
import { render, screen, act, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  initGtm,
  GTM_SCRIPT_ID,
  isValidGtmId,
  getSafePageLocation,
  shouldTrackPath,
  trackEvent,
  trackPageView,
  trackSignUp,
  trackLogin,
  usePageTracking,
  parseUtmParams,
  getStoredUtmParams,
  captureUtmFromUrl,
  sanitizeUtmValue,
  UTM_STORAGE_KEY,
  convertTomanToIrr,
  getGaClientIdFromCookie,
  getGaSessionIdFromCookie,
  getClientAnalyticsPayload,
  trackBeginCheckout,
  trackAddPaymentInfo,
  trackCardToCardSubmitted,
  setConsent,
  getConsentStatus,
  hasAnalyticsConsent,
  revokeConsent,
  getConsentRecord,
  CONSENT_STORAGE_KEY,
  CONSENT_DURATION_MS,
  CookieConsentBanner,
  openPrivacySettings,
  clearGaCookies,
} from "../lib/tracker/index.js";
import * as trackerConfig from "../lib/tracker/config.js";
import { AuthProvider } from "../providers/AuthProvider.js";

const createMockLocalStorage = () => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

const mockLocalStorage = createMockLocalStorage();
Object.defineProperty(window, "localStorage", {
  value: mockLocalStorage,
  writable: true,
});

function PageTrackerWrapper() {
  usePageTracking();
  return null;
}

function renderWithProviders(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe("AVANA Tracker Infrastructure", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Clean up DOM and window globals
    const existingScript = document.getElementById(GTM_SCRIPT_ID);
    if (existingScript) {
      existingScript.remove();
    }
    delete window.__gtmInitialized;
    window.dataLayer = [];
    window.sessionStorage.clear();
    mockLocalStorage.clear();
    document.title = "آوانا - همراه هوشمند یادگیری شما";
  });

  afterEach(() => {
    const existingScript = document.getElementById(GTM_SCRIPT_ID);
    if (existingScript) {
      existingScript.remove();
    }
    delete window.__gtmInitialized;
    delete window.dataLayer;
    window.sessionStorage.clear();
    mockLocalStorage.clear();
  });

  // 1. Missing or invalid GTM ID does not crash
  it("does not crash and returns false when GTM ID is missing or invalid", () => {
    expect(isValidGtmId("")).toBe(false);
    expect(isValidGtmId("invalid_id")).toBe(false);
    expect(isValidGtmId("GTM-529742BL")).toBe(true);

    const resEmpty = initGtm({ gtmId: "", enabled: true });
    expect(resEmpty).toBe(false);
    expect(document.getElementById(GTM_SCRIPT_ID)).toBeNull();

    const resDisabled = initGtm({ gtmId: "GTM-529742BL", enabled: false });
    expect(resDisabled).toBe(false);
    expect(document.getElementById(GTM_SCRIPT_ID)).toBeNull();
  });

  // 2. GTM script is not installed more than once
  it("does not install GTM script more than once across multiple calls", () => {
    const config = { gtmId: "GTM-529742BL", enabled: true };

    const firstCall = initGtm(config);
    expect(firstCall).toBe(true);
    expect(document.getElementById(GTM_SCRIPT_ID)).not.toBeNull();

    expect(window.dataLayer?.length).toBe(1);
    expect(window.dataLayer?.[0]?.event).toBe("gtm.js");

    const secondCall = initGtm(config);
    expect(secondCall).toBe(true);

    const scripts = document.querySelectorAll(`script#${GTM_SCRIPT_ID}`);
    expect(scripts.length).toBe(1);
    expect(window.dataLayer?.length).toBe(1);
  });

  // 3. In development, GTM is not loaded by default
  it("defaults to disabled in development unless explicitly opted in", () => {
    vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(false);

    const loaded = initGtm();
    expect(loaded).toBe(false);
    expect(document.getElementById(GTM_SCRIPT_ID)).toBeNull();
  });

  // 4. Event dispatch is blocked when disabled
  it("blocks event dispatch and page_view when analytics is disabled", () => {
    vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(false);

    const eventResult = trackEvent("custom_interaction", { step: 1 });
    expect(eventResult).toBe(false);
    expect(window.dataLayer?.length).toBe(0);

    const pageResult = trackPageView("/pricing");
    expect(pageResult).toBe(false);
    expect(window.dataLayer?.length).toBe(0);
  });

  // 5. Valid route change triggers one pageview when enabled
  it("dispatches page_view with sanitized location when enabled", () => {
    vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(true);

    const success = trackPageView("/courses", "لیست دوره‌ها");
    expect(success).toBe(true);

    expect(window.dataLayer?.length).toBe(1);
    const event = window.dataLayer?.[0];
    expect(event?.event).toBe("page_view");
    expect(event?.page_path).toBe("/courses");
    expect(event?.page_title).toBe("لیست دوره‌ها");
    expect(typeof event?.page_location).toBe("string");
    expect(event?.page_location as string).toContain("/courses");
  });

  // 6. Paths under /admin/* produce NO marketing pageview
  it("strictly excludes all /admin/* routes from marketing pageviews", () => {
    vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(true);

    expect(shouldTrackPath("/admin")).toBe(false);
    expect(shouldTrackPath("/admin/dashboard")).toBe(false);
    expect(shouldTrackPath("/admin/commerce/orders")).toBe(false);
    expect(shouldTrackPath("/admin/users")).toBe(false);

    expect(shouldTrackPath("/")).toBe(true);
    expect(shouldTrackPath("/home")).toBe(true);
    expect(shouldTrackPath("/courses/anatomy-heart")).toBe(true);
    expect(shouldTrackPath("/teacher/classrooms")).toBe(true);
    expect(shouldTrackPath("/pricing")).toBe(true);

    const result = trackPageView("/admin/commerce/orders");
    expect(result).toBe(false);
    expect(window.dataLayer?.length).toBe(0);
  });

  // 7. Query parameters (?...) and hashes (#...) are excluded from page_location
  it("strips query string and hash fragments completely from page_location", () => {
    const safeLocation = getSafePageLocation(
      "https://aavana.ir",
      "/reset-password?token=sample&flow=test#step",
    );
    expect(safeLocation).toBe("https://aavana.ir/reset-password");
    expect(safeLocation).not.toContain("sample");
    expect(safeLocation).not.toContain("?");
    expect(safeLocation).not.toContain("#");

    vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(true);
    trackPageView("/checkout/callback?authority=sample&status=ok#done");

    expect(window.dataLayer?.length).toBe(1);
    const event = window.dataLayer?.[0];
    expect(event?.page_path).toBe("/checkout/callback");
    expect(event?.page_location as string).not.toContain("authority");
    expect(event?.page_location as string).not.toContain("?");
    expect(event?.page_location as string).not.toContain("#");
  });

  // 8. React Strict Mode does not cause duplicate events
  it("does not trigger duplicate pageviews under React Strict Mode", async () => {
    vi.useFakeTimers();
    vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(true);

    render(
      <StrictMode>
        <MemoryRouter initialEntries={["/"]}>
          <PageTrackerWrapper />
          <Routes>
            <Route path="/" element={<div data-testid="home">Home</div>} />
            <Route
              path="/pricing"
              element={<div data-testid="pricing">Pricing</div>}
            />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    );

    act(() => {
      vi.runAllTimers();
    });

    const pageViewEvents = window.dataLayer?.filter(
      (e) => e.event === "page_view",
    );
    expect(pageViewEvents?.length).toBe(1);
    expect(pageViewEvents?.[0]?.page_path).toBe("/");

    vi.useRealTimers();
  });

  // 9. Navigation in SPA emits separate single pageview
  it("emits single pageview when navigating to a new page", async () => {
    vi.useFakeTimers();
    vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(true);

    render(
      <MemoryRouter initialEntries={["/courses"]}>
        <PageTrackerWrapper />
        <Link to="/pricing" data-testid="pricing-link">
          Go to Pricing
        </Link>
        <Routes>
          <Route path="/courses" element={<div>Courses Page</div>} />
          <Route path="/pricing" element={<div>Pricing Page</div>} />
        </Routes>
      </MemoryRouter>,
    );

    act(() => {
      vi.runAllTimers();
    });

    expect(
      window.dataLayer?.filter((e) => e.event === "page_view").length,
    ).toBe(1);

    const link = screen.getByTestId("pricing-link");
    act(() => {
      link.click();
    });

    act(() => {
      vi.runAllTimers();
    });

    const pageViews = window.dataLayer?.filter((e) => e.event === "page_view");
    expect(pageViews?.length).toBe(2);
    expect(pageViews?.[0]?.page_path).toBe("/courses");
    expect(pageViews?.[1]?.page_path).toBe("/pricing");

    vi.useRealTimers();
  });
});

describe("Sign-Up & Login Event Tracking", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.dataLayer = [];
  });

  afterEach(() => {
    delete window.dataLayer;
  });

  it("emits exactly one sign_up event on registration with generic method and NO PII", () => {
    vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(true);

    const emitted = trackSignUp("password");
    expect(emitted).toBe(true);

    const events = window.dataLayer?.filter((e) => e.event === "sign_up");
    expect(events?.length).toBe(1);
    expect(events?.[0]).toEqual({
      event: "sign_up",
      method: "password",
    });

    // Verify zero PII fields are included in the event
    expect(events?.[0]?.email).toBeUndefined();
    expect(events?.[0]?.user_id).toBeUndefined();
    expect(events?.[0]?.userId).toBeUndefined();
    expect(events?.[0]?.phone).toBeUndefined();
    expect(events?.[0]?.phoneNumber).toBeUndefined();
  });

  it("does not emit sign_up event when analytics is disabled", () => {
    vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(false);

    const emitted = trackSignUp("password");
    expect(emitted).toBe(false);

    const events = window.dataLayer?.filter((e) => e.event === "sign_up");
    expect(events?.length).toBe(0);
  });

  it("emits login event for password and otp methods without PII", () => {
    vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(true);

    expect(trackLogin("password")).toBe(true);
    expect(trackLogin("otp")).toBe(true);

    const events = window.dataLayer?.filter((e) => e.event === "login");
    expect(events?.length).toBe(2);
    expect(events?.[0]).toEqual({ event: "login", method: "password" });
    expect(events?.[1]).toEqual({ event: "login", method: "otp" });

    // Verify zero PII fields
    expect(events?.[0]?.email).toBeUndefined();
    expect(events?.[0]?.password).toBeUndefined();
    expect(events?.[1]?.otp).toBeUndefined();
    expect(events?.[1]?.code).toBeUndefined();
  });

  it("does not emit login event when analytics is disabled", () => {
    vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(false);

    const emitted = trackLogin("password");
    expect(emitted).toBe(false);

    const events = window.dataLayer?.filter((e) => e.event === "login");
    expect(events?.length).toBe(0);
  });

  it("does not emit login event when fetchMe runs on initial session mount or refresh", async () => {
    vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(true);

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          request_id: "req-auth-1",
          user: {
            id: "user-test-1",
            email: "student@avana.ir",
            name: "Student",
            role: "student",
          },
          memberships: [],
        }),
    } as Response);

    renderWithProviders(
      <AuthProvider>
        <div data-testid="auth-child">Authenticated App</div>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-child")).toBeDefined();
    });

    // Verifies fetchMe on initial mount/refresh does NOT record a login event
    const loginEvents = window.dataLayer?.filter((e) => e.event === "login");
    expect(loginEvents?.length).toBe(0);
  });
});

describe("UTM Attribution & Campaign Tracking", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    window.sessionStorage.clear();
  });

  it("extracts and sanitizes valid standard UTM parameters", () => {
    const parsed = parseUtmParams(
      "?utm_source=telegram&utm_medium=cpc&utm_campaign=konkur1405&utm_term=biology&utm_content=banner1",
    );
    expect(parsed).toEqual({
      utm_source: "telegram",
      utm_medium: "cpc",
      utm_campaign: "konkur1405",
      utm_term: "biology",
      utm_content: "banner1",
    });
  });

  it("strictly ignores unknown query parameters", () => {
    const parsed = parseUtmParams(
      "?utm_source=google&random_param=123&token=secretToken",
    );
    expect(parsed).toEqual({
      utm_source: "google",
    });
    expect((parsed as Record<string, unknown>)?.random_param).toBeUndefined();
    expect((parsed as Record<string, unknown>)?.token).toBeUndefined();
  });

  it("rejects excessively long UTM values (>100 characters)", () => {
    const longValue = "x".repeat(101);
    expect(sanitizeUtmValue(longValue)).toBeNull();

    const parsed = parseUtmParams(`?utm_source=${longValue}&utm_medium=cpc`);
    expect(parsed).toEqual({
      utm_medium: "cpc",
    });
  });

  it("rejects UTM values containing email or phone PII", () => {
    expect(sanitizeUtmValue("user@example.com")).toBeNull();
    expect(sanitizeUtmValue("09123456789")).toBeNull();

    const parsed = parseUtmParams(
      "?utm_source=google&utm_medium=user@example.com&utm_campaign=09123456789",
    );
    expect(parsed).toEqual({
      utm_source: "google",
    });
    expect(parsed?.utm_medium).toBeUndefined();
    expect(parsed?.utm_campaign).toBeUndefined();
  });

  it("persists UTM parameters in sessionStorage across internal SPA navigations", () => {
    vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(true);

    captureUtmFromUrl("?utm_source=telegram&utm_campaign=summer_promo");
    expect(getStoredUtmParams()).toEqual({
      utm_source: "telegram",
      utm_campaign: "summer_promo",
    });

    // Subsequent navigation within SPA with empty search query still accesses stored attribution
    const retained = captureUtmFromUrl("");
    expect(retained).toEqual({
      utm_source: "telegram",
      utm_campaign: "summer_promo",
    });
  });

  it("does not store UTM parameters when analytics is disabled", () => {
    vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(false);

    const res = captureUtmFromUrl("?utm_source=telegram");
    expect(res).toBeNull();
    expect(window.sessionStorage.getItem(UTM_STORAGE_KEY)).toBeNull();
  });
});

describe("Ecommerce & Funnel Tracking (Phase 3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.dataLayer = [];
    window.sessionStorage.clear();
    // Clear cookies
    document.cookie.split(";").forEach((cookie) => {
      const eqPos = cookie.indexOf("=");
      const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
      document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`;
    });
  });

  afterEach(() => {
    delete window.dataLayer;
    window.sessionStorage.clear();
  });

  describe("Currency Conversion", () => {
    it("converts Toman amounts to Rials (IRR) strictly by multiplying by 10", () => {
      expect(convertTomanToIrr(1)).toEqual({ currency: "IRR", value: 10 });
      expect(convertTomanToIrr(50_000)).toEqual({ currency: "IRR", value: 500_000 });
      expect(convertTomanToIrr(120_000)).toEqual({ currency: "IRR", value: 1_200_000 });
      expect(convertTomanToIrr(2_500_000)).toEqual({ currency: "IRR", value: 25_000_000 });
    });

    it("returns null for invalid, negative, zero, or non-finite values", () => {
      expect(convertTomanToIrr(0)).toBeNull();
      expect(convertTomanToIrr(-100)).toBeNull();
      expect(convertTomanToIrr(NaN)).toBeNull();
      expect(convertTomanToIrr(Infinity)).toBeNull();
      expect(convertTomanToIrr(null)).toBeNull();
      expect(convertTomanToIrr(undefined)).toBeNull();
    });
  });

  describe("GA Cookie Extraction", () => {
    beforeEach(() => {
      vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(true);
    });

    it("extracts client_id from standard _ga cookie", () => {
      document.cookie = "_ga=GA1.1.123456789.1670000000; path=/";
      const clientId = getGaClientIdFromCookie();
      expect(clientId).toBe("123456789.1670000000");
    });

    it("returns null when _ga cookie is absent or malformed without synthesizing fake IDs", () => {
      expect(getGaClientIdFromCookie()).toBeNull();

      document.cookie = "_ga=invalid_cookie_format; path=/";
      expect(getGaClientIdFromCookie()).toBeNull();
    });

    it("extracts session_id from container-specific _ga_<container> cookie", () => {
      document.cookie = "_ga_529742BL=GS1.1.1670000000.1.1.1670000010.0.0.0; path=/";
      const sessionId = getGaSessionIdFromCookie();
      expect(sessionId).toBe("1670000000");
    });

    it("parses cookies correctly when delimiter lacks spaces or has irregular spacing", () => {
      // Mock document.cookie to return unspaced delimiter
      const cookieGetterSpy = vi.spyOn(document, "cookie", "get").mockReturnValue(
        "_ga=GA1.1.999888777.1670000000;_ga_529742BL=GS1.1.1670000000.1.1.1670000010.0.0.0"
      );
      expect(getGaClientIdFromCookie()).toBe("999888777.1670000000");
      expect(getGaSessionIdFromCookie()).toBe("1670000000");
      cookieGetterSpy.mockRestore();
    });

    it("returns null when session cookie is absent", () => {
      expect(getGaSessionIdFromCookie()).toBeNull();
    });

    it("returns null when analytics is disabled", () => {
      vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(false);
      document.cookie = "_ga=GA1.1.123456789.1670000000; path=/";
      expect(getGaClientIdFromCookie()).toBeNull();
      expect(getClientAnalyticsPayload()).toBeNull();
    });

    it("builds client analytics payload with client_id, session_id, and attribution", () => {
      document.cookie = "_ga=GA1.2.987654321.1680000000; path=/";
      document.cookie = "_ga_529742BL=GS1.1.1680000000.1.1.1680000010.0.0.0; path=/";
      window.sessionStorage.setItem(
        UTM_STORAGE_KEY,
        JSON.stringify({ utm_source: "google", utm_campaign: "promo" }),
      );

      const payload = getClientAnalyticsPayload();
      expect(payload).toEqual({
        consent: "granted",
        ga_client_id: "987654321.1680000000",
        ga_session_id: "1680000000",
        utm_source: "google",
        utm_campaign: "promo",
      });
    });
  });

  describe("Funnel Events Tracking", () => {
    beforeEach(() => {
      vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(true);
    });

    it("tracks begin_checkout with standard GA4 ecommerce payload in IRR", () => {
      const converted = convertTomanToIrr(120_000)!;
      const items = [
        {
          item_id: "plan-pro-monthly",
          item_name: "پلن حرفه‌ای ماهیانه",
          price: converted.value,
          quantity: 1,
        },
      ];

      trackBeginCheckout({
        currency: converted.currency,
        value: converted.value,
        items,
      });

      expect(window.dataLayer).toHaveLength(1);
      const event = window.dataLayer?.[0] as Record<string, unknown>;
      expect(event?.event).toBe("begin_checkout");
      expect(event?.ecommerce).toEqual({
        currency: "IRR",
        value: 1_200_000,
        items: [
          {
            item_id: "plan-pro-monthly",
            item_name: "پلن حرفه‌ای ماهیانه",
            price: 1_200_000,
            quantity: 1,
          },
        ],
      });
    });

    it("tracks add_payment_info with payment_type and items in IRR", () => {
      const converted = convertTomanToIrr(120_000)!;
      const items = [
        {
          item_id: "plan-pro-monthly",
          item_name: "پلن حرفه‌ای ماهیانه",
          price: converted.value,
          quantity: 1,
        },
      ];

      trackAddPaymentInfo({
        payment_type: "card_to_card",
        currency: converted.currency,
        value: converted.value,
        items,
      });

      expect(window.dataLayer).toHaveLength(1);
      const event = window.dataLayer?.[0] as Record<string, unknown>;
      expect(event?.event).toBe("add_payment_info");
      expect(event?.ecommerce).toEqual({
        payment_type: "card_to_card",
        currency: "IRR",
        value: 1_200_000,
        items,
      });
    });

    it("tracks card_to_card_submitted strictly as submission, NEVER as purchase", () => {
      const converted = convertTomanToIrr(120_000)!;
      const items = [
        {
          item_id: "plan-pro-monthly",
          item_name: "پلن حرفه‌ای ماهیانه",
          price: converted.value,
          quantity: 1,
        },
      ];

      trackCardToCardSubmitted({
        order_id: "ord_c2c_12345",
        currency: converted.currency,
        value: converted.value,
        items,
      });

      expect(window.dataLayer).toHaveLength(1);
      const event = window.dataLayer?.[0] as Record<string, unknown>;
      expect(event?.event).toBe("card_to_card_submitted");
      expect(event?.event).not.toBe("purchase");
      expect(event?.ecommerce).toEqual({
        currency: "IRR",
        value: 1_200_000,
        items,
      });

      // Verify no PII is leaked in dataLayer
      const eventStr = JSON.stringify(event);
      expect(eventStr).not.toContain("0912");
      expect(eventStr).not.toContain("6037");
    });

    it("does not track ecommerce events when analytics is disabled", () => {
      vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(false);

      trackBeginCheckout({
        currency: "IRR",
        value: 1_000_000,
        items: [{ item_id: "plan-1", item_name: "Plan", price: 1_000_000, quantity: 1 }],
      });

      trackAddPaymentInfo({
        payment_type: "zarinpal",
        currency: "IRR",
        value: 1_000_000,
        items: [{ item_id: "plan-1", item_name: "Plan", price: 1_000_000, quantity: 1 }],
      });

      trackCardToCardSubmitted({
        order_id: "ord_1",
        currency: "IRR",
        value: 1_000_000,
      });

      expect(window.dataLayer).toHaveLength(0);
    });
  });
});

describe("Strict Opt-in Consent Management (Phase 6)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    const existingScript = document.getElementById(GTM_SCRIPT_ID);
    if (existingScript) {
      existingScript.remove();
    }
    delete window.__gtmInitialized;
    window.dataLayer = [];
    window.sessionStorage.clear();
    mockLocalStorage.clear();
    vi.stubEnv("VITE_ANALYTICS_ENABLED", "true");
    vi.stubEnv("VITE_GTM_ID", "GTM-529742BL");
  });

  afterEach(() => {
    const existingScript = document.getElementById(GTM_SCRIPT_ID);
    if (existingScript) {
      existingScript.remove();
    }
    delete window.__gtmInitialized;
    delete window.dataLayer;
    window.sessionStorage.clear();
    mockLocalStorage.clear();
    vi.unstubAllEnvs();
  });

    it("defaults to pending status and treats analytics as disabled for new visitors", () => {
      expect(getConsentStatus()).toBe("pending");
      expect(hasAnalyticsConsent()).toBe(false);
      expect(trackerConfig.isAnalyticsEnabled()).toBe(false);

      // GTM init should be blocked
      const initialized = initGtm();
      expect(initialized).toBe(false);
      expect(document.getElementById(GTM_SCRIPT_ID)).toBeNull();

      // Pageview should be blocked
      trackPageView("/");
      expect(window.dataLayer).toHaveLength(0);
    });

    it("holds UTM in memory before consent and auto-commits to storage on consent grant", () => {
      const captured = captureUtmFromUrl("https://aavana.ir/?utm_source=telegram&utm_campaign=winter2026");
      // Pre-consent: captured returns null to prevent consumption, and storage is clean
      expect(captured).toBeNull();
      expect(window.sessionStorage.getItem(UTM_STORAGE_KEY)).toBeNull();

      // Grant consent
      setConsent("granted");
      expect(hasAnalyticsConsent()).toBe(true);

      // Now committed to storage
      const stored = getStoredUtmParams();
      expect(stored).toEqual({
        utm_source: "telegram",
        utm_campaign: "winter2026",
      });
    });

    it("loads GTM and fires deferred pageview when consent is granted", async () => {
      render(
        <MemoryRouter initialEntries={["/dashboard"]}>
          <PageTrackerWrapper />
        </MemoryRouter>,
      );

      // Pre-consent: no pageviews dispatched
      expect(window.dataLayer?.filter((e: unknown) => (e as Record<string, unknown>).event === "page_view")).toHaveLength(0);

      // Grant consent
      act(() => {
        setConsent("granted");
      });

      await waitFor(() => {
        const pageViews = (window.dataLayer || []).filter(
          (e: unknown) => (e as Record<string, unknown>).event === "page_view",
        );
        expect(pageViews).toHaveLength(1);
        expect((pageViews[0] as Record<string, unknown>).page_path).toBe("/dashboard");
      });
    });

    it("clears storage and stops event dispatch when consent is denied", () => {
      // First grant and store something
      setConsent("granted");
      window.sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify({ utm_source: "test" }));

      // Now reject
      setConsent("denied");
      expect(getConsentStatus()).toBe("denied");
      expect(hasAnalyticsConsent()).toBe(false);
      expect(window.sessionStorage.getItem(UTM_STORAGE_KEY)).toBeNull();

      // Disallow events
      trackEvent("some_event", { foo: "bar" });
      expect(window.dataLayer).toHaveLength(0);
    });

    it("revokes consent and purges all Avana analytics data on revokeConsent", () => {
      setConsent("granted");
      window.sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify({ utm_source: "promo" }));

      revokeConsent();
      expect(getConsentStatus()).toBe("denied");
      expect(hasAnalyticsConsent()).toBe(false);
      expect(window.sessionStorage.getItem(UTM_STORAGE_KEY)).toBeNull();
    });

    it("expires consent older than 180 days reverting to pending", () => {
      const expiredTimestamp = Date.now() - (CONSENT_DURATION_MS + 60_000);
      mockLocalStorage.setItem(
        CONSENT_STORAGE_KEY,
        JSON.stringify({
          status: "granted",
          timestamp: expiredTimestamp,
          expiresAt: Date.now() - 1000,
        }),
      );

      expect(getConsentStatus()).toBe("pending");
      expect(hasAnalyticsConsent()).toBe(false);
      expect(getConsentRecord()).toBeNull();
      expect(mockLocalStorage.getItem(CONSENT_STORAGE_KEY)).toBeNull();
    });

    it("strictly isolates GA4 measurement cookies matching stream suffix", () => {
      vi.spyOn(trackerConfig, "isAnalyticsEnabled").mockReturnValue(true);

      // Ambiguous multiple container cookies with no stream match
      document.cookie = "_ga=GA1.1.111.222; path=/";
      document.cookie = "_ga_UNKNOWN1=GS1.1.1111111111.1.1.1111111111.0.0.0; path=/";
      document.cookie = "_ga_UNKNOWN2=GS1.1.2222222222.1.1.2222222222.0.0.0; path=/";

      expect(getGaSessionIdFromCookie()).toBeNull();

      // When measurement ID is configured in env, matches the stream suffix
      vi.stubEnv("VITE_GA4_MEASUREMENT_ID", "G-529742BL");
      document.cookie = "_ga_529742BL=GS1.1.1680000000.1.1.1680000010.0.0.0; path=/";
      expect(getGaSessionIdFromCookie()).toBe("1680000000");
    });

    it("renders CookieConsentBanner with approved texts and grants consent on accept click", () => {
      render(<CookieConsentBanner />);

      expect(screen.getByRole("region", { name: "تنظیمات حریم خصوصی و رضایت تحلیل‌ها" })).toBeInTheDocument();
      expect(screen.getByText("حریم خصوصی و تحلیل عملکرد")).toBeInTheDocument();
      expect(
        screen.getByText(
          "برای بهبود تجربه یادگیری و بررسی ترافیک صفحات، از ابزارهای آماری و تحلیلی استفاده می‌کنیم.",
        ),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/فعال‌سازی تحلیل‌های غیرضروری اختیاری است/),
      ).not.toBeInTheDocument();

      const acceptBtn = screen.getByRole("button", { name: "پذیرش تحلیل‌ها" });
      act(() => {
        fireEvent.click(acceptBtn);
      });

      expect(getConsentStatus()).toBe("granted");
      expect(screen.queryByRole("region", { name: "تنظیمات حریم خصوصی و رضایت تحلیل‌ها" })).not.toBeInTheDocument();
    });

    it("renders CookieConsentBanner and denies consent on decline click", () => {
      render(<CookieConsentBanner />);

      expect(screen.getByRole("region", { name: "تنظیمات حریم خصوصی و رضایت تحلیل‌ها" })).toBeInTheDocument();

      // Banner strictly has only two buttons (no "تنظیمات بیشتر" button)
      expect(screen.queryByRole("button", { name: "تنظیمات بیشتر" })).not.toBeInTheDocument();

      const declineBtn = screen.getByRole("button", { name: "رد" });
      act(() => {
        fireEvent.click(declineBtn);
      });

      expect(getConsentStatus()).toBe("denied");
      expect(screen.queryByRole("region", { name: "تنظیمات حریم خصوصی و رضایت تحلیل‌ها" })).not.toBeInTheDocument();
    });

    it("reopens privacy settings dialog via openPrivacySettings when banner is closed", () => {
      // Prior decision: denied
      setConsent("denied");
      render(<CookieConsentBanner />);

      // Banner itself is hidden
      expect(screen.queryByRole("region", { name: "تنظیمات حریم خصوصی و رضایت تحلیل‌ها" })).not.toBeInTheDocument();

      // Trigger reopen event (as would happen from Footer)
      act(() => {
        openPrivacySettings();
      });

      // Dialog opens
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("کوکی‌ها و عملکردهای ضروری")).toBeInTheDocument();

      // Accept all from inside the dialog
      const acceptAllBtn = screen.getByRole("button", { name: "پذیرش همه" });
      act(() => {
        fireEvent.click(acceptAllBtn);
      });

      expect(getConsentStatus()).toBe("granted");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closing the dialog without saving preserves existing consent status untouched", () => {
      setConsent("denied");
      render(<CookieConsentBanner />);

      act(() => {
        openPrivacySettings();
      });
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      // Toggle switch to ON
      const switches = screen.getAllByRole("switch");
      const toggleSwitch = switches[1];
      act(() => {
        fireEvent.click(toggleSwitch);
      });
      expect(toggleSwitch).toHaveAttribute("aria-checked", "true");

      // Close modal using close button without clicking save
      const closeBtn = screen.getByRole("button", { name: "بستن پنجره" });
      act(() => {
        fireEvent.click(closeBtn);
      });

      // Status remains denied!
      expect(getConsentStatus()).toBe("denied");
    });

    it("integrates Google Consent Mode v2 default and update signals", () => {
      // Initialize GTM when consent is granted
      setConsent("granted");
      initGtm({ gtmId: "GTM-529742BL", enabled: true });

      const dataLayer = window.dataLayer || [];

      // Consent Mode update was pushed upon initialization with granted status
      const consentUpdate = dataLayer.find(
        (item: unknown) => Array.isArray(item) && item[0] === "consent" && item[1] === "update",
      ) as unknown as [string, string, Record<string, string>];
      expect(consentUpdate).toBeDefined();
      expect(consentUpdate[2].analytics_storage).toBe("granted");
      expect(consentUpdate[2].ad_storage).toBe("denied");

      // Now revoke consent
      revokeConsent();

      // Most recent consent update should be denied
      const lastConsentUpdate = [...dataLayer].reverse().find(
        (item: unknown) => Array.isArray(item) && item[0] === "consent" && item[1] === "update",
      ) as unknown as [string, string, Record<string, string>];
      expect(lastConsentUpdate[2].analytics_storage).toBe("denied");
    });

    it("clears GA cookies on consent revocation", () => {
      document.cookie = "_ga=GA1.1.999.888; path=/";
      document.cookie = "_ga_529742BL=GS1.1.1700000000.1.1.1700000010.0.0.0; path=/";

      clearGaCookies();

      expect(getGaClientIdFromCookie()).toBeNull();
      expect(getGaSessionIdFromCookie()).toBeNull();
    });

    it("granting and then revoking consent on the same page does not send unwanted new events", () => {
      // 1. Grant consent
      setConsent("granted");
      expect(hasAnalyticsConsent()).toBe(true);

      // Track an event
      trackEvent("initial_event", { step: 1 });
      expect(window.dataLayer?.filter((e: unknown) => (e as Record<string, unknown>).event === "initial_event")).toHaveLength(1);

      // 2. Revoke consent on the same page
      revokeConsent();
      expect(hasAnalyticsConsent()).toBe(false);

      // 3. Subsequent event dispatches MUST be completely blocked
      trackEvent("subsequent_event", { step: 2 });
      trackPageView("/some-page");
      expect(window.dataLayer?.filter((e: unknown) => (e as Record<string, unknown>).event === "subsequent_event")).toHaveLength(0);
      expect(window.dataLayer?.filter((e: unknown) => (e as Record<string, unknown>).page_path === "/some-page")).toHaveLength(0);
    });

    it("synchronizes consent revocation with backend server safely without throwing", () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 200 }));

      revokeConsent("ord_sample_123");

      expect(fetchSpy).toHaveBeenCalledWith(
        "/v1/commerce/analytics/consent/revoke",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ order_id: "ord_sample_123" }),
        }),
      );
    });
  });



