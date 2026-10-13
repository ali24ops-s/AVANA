/* eslint-disable no-secrets/no-secrets */
/**
 * Configuration & Environment resolver for AVANA Tracker.
 *
 * Rules:
 * - GTM container ID validated against standard pattern /^GTM-[A-Z0-9]+$/
 * - In development/test environments, tracking is DISABLED by default.
 * - Can be explicitly tested in development only if VITE_ANALYTICS_ENABLED === "true".
 */

import { hasAnalyticsConsent } from "./consent.js";
import type { TrackerConfig } from "./types.js";

/**
 * Validate that a string matches standard Google Tag Manager container ID format.
 */
export function isValidGtmId(id: string | undefined | null): boolean {
  if (!id) return false;
  return /^GTM-[A-Z0-9]+$/.test(id.trim());
}

/**
 * Validate that a string matches standard Google Analytics 4 Measurement ID format.
 */
export function isValidGa4Id(id: string | undefined | null): boolean {
  if (!id) return false;
  return /^G-[A-Z0-9]+$/i.test(id.trim());
}

/**
 * Resolve current tracker configuration from Vite environment variables.
 */
export function getTrackerConfig(): TrackerConfig {
  const rawGa4Id = (import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined)?.trim() || "";
  const validGa4 = isValidGa4Id(rawGa4Id);
  const ga4MeasurementId = validGa4 ? rawGa4Id : "";

  const rawGtmId = (import.meta.env.VITE_GTM_ID as string | undefined)?.trim() || "";
  const validGtm = isValidGtmId(rawGtmId);
  const gtmId = validGtm ? rawGtmId : "";

  const explicitEnable = (import.meta.env.VITE_ANALYTICS_ENABLED as string | undefined) === "true";
  const isDev = Boolean(import.meta.env.DEV);

  const hasIdentifier = Boolean(ga4MeasurementId || gtmId);
  const mode: "ga4" | "gtm" | "disabled" = ga4MeasurementId
    ? "ga4"
    : gtmId
      ? "gtm"
      : "disabled";

  // In development, tracking is strictly disabled unless explicitly opted-in via VITE_ANALYTICS_ENABLED="true".
  // In production, enabled if valid identifier exists and not explicitly turned off.
  const enabled = isDev
    ? Boolean(hasIdentifier && explicitEnable)
    : Boolean(hasIdentifier && (import.meta.env.VITE_ANALYTICS_ENABLED !== "false"));

  return {
    gtmId,
    ga4MeasurementId,
    mode,
    enabled,
  };
}

/**
 * Check if tracking is currently active.
 * Requires BOTH environment enablement AND explicit active user consent (Strict Opt-in).
 */
export function isAnalyticsEnabled(): boolean {
  return getTrackerConfig().enabled && hasAnalyticsConsent();
}
