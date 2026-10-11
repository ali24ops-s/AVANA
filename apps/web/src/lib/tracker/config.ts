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
 * Resolve current tracker configuration from Vite environment variables.
 */
export function getTrackerConfig(): TrackerConfig {
  const rawId = (import.meta.env.VITE_GTM_ID as string | undefined)?.trim() || "";
  const valid = isValidGtmId(rawId);
  const gtmId = valid ? rawId : "";

  const explicitEnable = (import.meta.env.VITE_ANALYTICS_ENABLED as string | undefined) === "true";
  const isDev = Boolean(import.meta.env.DEV);

  // In development, tracking is strictly disabled unless explicitly opted-in via VITE_ANALYTICS_ENABLED="true".
  // In production, enabled if valid GTM ID exists and not explicitly turned off.
  const enabled = isDev
    ? Boolean(gtmId && explicitEnable)
    : Boolean(gtmId && (import.meta.env.VITE_ANALYTICS_ENABLED !== "false"));

  return {
    gtmId,
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
