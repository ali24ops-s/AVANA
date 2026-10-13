/**
 * Google Tag Manager Script Loader.
 *
 * Guarantees:
 * 1. Script is injected at most ONCE per application lifecycle.
 * 2. Does nothing and never crashes if container ID is missing or invalid.
 * 3. Does not load in development unless explicitly configured.
 * 4. Initializes window.dataLayer with standard gtm.start event.
 */

import { getTrackerConfig, isAnalyticsEnabled } from "./config.js";
import { hasAnalyticsConsent, CONSENT_CHANGE_EVENT } from "./consent.js";
import type { TrackerConfig } from "./types.js";

export const GTM_SCRIPT_ID = "gtm-script";
export const GA4_SCRIPT_ID = "ga4-script";

/**
 * Updates Google Consent Mode v2 status in window.dataLayer.
 * Strictly checks that GTM or GA4 is initialized to prevent unconsented queue buildup.
 * Ensures advertising signals remain permanently denied while analytics reflects user consent.
 */
export function updateConsentMode(status: "granted" | "denied"): void {
  if (
    typeof window === "undefined" ||
    (!window.__gtmInitialized && !window.__ga4Initialized) ||
    !window.dataLayer
  ) {
    return;
  }

  try {
    window.dataLayer.push([
      "consent",
      "update",
      {
        analytics_storage: status,
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      },
    ] as unknown as Record<string, unknown>);
  } catch {
    // Graceful degradation
  }
}

/**
 * Initialize Google Analytics (GA4 or GTM) if enabled and not already initialized.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @returns boolean indicating whether tracking was successfully initialized.
 */
export function initAnalytics(customConfig?: TrackerConfig): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  const isEnabled = customConfig ? customConfig.enabled : isAnalyticsEnabled();
  const config = customConfig ?? getTrackerConfig();

  if (!isEnabled) {
    return false;
  }

  // 1. Direct GA4 Mode
  if (config.ga4MeasurementId) {
    // Deduplication: prevent multiple injections across app lifecycle
    if (window.__ga4Initialized || document.getElementById(GA4_SCRIPT_ID)) {
      return true;
    }

    try {
      // 1. Initialize dataLayer safely
      window.dataLayer = window.dataLayer || [];

      // 2. Initialize window.gtag safely
      if (!window.gtag) {
        window.gtag = function (...args: unknown[]) {
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push(args as unknown as Record<string, unknown>);
        };
      }

      window.gtag("js", new Date());

      // 3. Mark initialized
      window.__ga4Initialized = true;

      // 4. Signal Consent Mode v2 update if user has active granted consent
      if (hasAnalyticsConsent()) {
        updateConsentMode("granted");
      }

      // 5. Configure GA4 Measurement ID with send_page_view: false to avoid duplicate pageviews
      window.gtag("config", config.ga4MeasurementId, {
        send_page_view: false,
      });

      // 6. Inject official gtag.js script into document head
      const script = document.createElement("script");
      script.id = GA4_SCRIPT_ID;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.ga4MeasurementId)}`;
      document.head.appendChild(script);

      return true;
    } catch {
      // Graceful degradation
      return false;
    }
  }

  // 2. GTM Compatibility Mode
  if (config.gtmId) {
    if (window.__gtmInitialized || document.getElementById(GTM_SCRIPT_ID)) {
      return true;
    }

    try {
      // 1. Initialize dataLayer safely with canonical gtm.start event
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        "gtm.start": new Date().getTime(),
        event: "gtm.js",
      });

      // 2. Mark initialized
      window.__gtmInitialized = true;

      // 3. If user has active granted consent, signal Consent Mode v2 update
      if (hasAnalyticsConsent()) {
        updateConsentMode("granted");
      }

      // 4. Inject official GTM script into document head
      const script = document.createElement("script");
      script.id = GTM_SCRIPT_ID;
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(config.gtmId)}`;
      document.head.appendChild(script);

      return true;
    } catch {
      // Graceful degradation: never crash host application
      return false;
    }
  }

  return false;
}

/**
 * Compatibility alias for initAnalytics.
 */
export function initGtm(customConfig?: TrackerConfig): boolean {
  return initAnalytics(customConfig);
}

// Automatically sync Consent Mode updates on consent change events if dataLayer exists
if (typeof window !== "undefined") {
  window.addEventListener(CONSENT_CHANGE_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<{ status: string }>).detail;
    if (detail?.status === "granted" || detail?.status === "denied") {
      updateConsentMode(detail.status as "granted" | "denied");
    }
  });
}

