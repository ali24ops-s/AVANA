/**
 * Safe GA4 Cookie & Session Reader for AVANA.
 *
 * Rules:
 * - Only reads cookies if analytics is enabled and user consent is active.
 * - Extracts client_id strictly from the authentic `_ga` cookie.
 * - NEVER generates a fallback hash from user IDs or emails.
 * - If no valid client_id exists, returns null.
 * - Extracts session_id strictly from authentic `_ga_*` cookie (GS1 protocol).
 * - Enforces length and character whitelist to reject malformed or poisoned values.
 */

import { isAnalyticsEnabled } from "./config.js";
import { CONSENT_CHANGE_EVENT } from "./consent.js";
import type { ClientAnalyticsPayload } from "./types.js";
import { getStoredUtmParams } from "./utm.js";

const GA_CLIENT_ID_REGEX = /^(\d{4,15}\.\d{8,15}|AMP-[a-zA-Z0-9_-]{5,50})$/;
const GA_SESSION_ID_REGEX = /^\d{8,18}$/;

/**
 * Extracts and validates the Google Analytics client ID from the `_ga` cookie.
 * Returns null if analytics is disabled, cookie is absent, or format is invalid.
 */
export function getGaClientIdFromCookie(): string | null {
  if (typeof document === "undefined" || !isAnalyticsEnabled()) {
    return null;
  }

  try {
    const cookies = document.cookie
      ? document.cookie.split(";").map((c) => c.trim())
      : [];
    const gaCookie = cookies.find((c) => c.startsWith("_ga="));
    if (!gaCookie) return null;

    const rawValue = gaCookie.slice(4).trim();
    if (!rawValue) return null;

    let candidate = rawValue;
    // Standard format: GA1.1.XXXXXXXX.YYYYYYYY or GA1.2.XXXXXXXX.YYYYYYYY
    if (rawValue.startsWith("GA1.")) {
      const parts = rawValue.split(".");
      if (parts.length >= 4) {
        candidate = `${parts[2]}.${parts[3]}`;
      } else if (parts.length === 3) {
        candidate = parts[2];
      }
    }

    if (
      GA_CLIENT_ID_REGEX.test(candidate) &&
      !candidate.includes("@") &&
      !candidate.includes("/")
    ) {
      return candidate;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolves the configured GA4 Measurement ID from environment variables.
 */
export function getGaMeasurementId(): string | null {
  const mid = (import.meta.env.VITE_GA4_MEASUREMENT_ID as string | undefined)?.trim();
  if (mid && /^G-[A-Z0-9]+$/i.test(mid)) {
    return mid;
  }
  return null;
}

/**
 * Extracts and validates the GA4 session ID from `_ga_*` measurement stream cookie.
 * Matches strictly against the configured stream ID if available.
 * Returns null if not found, ambiguous, malformed, or analytics is disabled.
 */
export function getGaSessionIdFromCookie(): string | null {
  if (typeof document === "undefined" || !isAnalyticsEnabled()) {
    return null;
  }

  try {
    const cookies = document.cookie
      ? document.cookie.split(";").map((c) => c.trim())
      : [];

    const measurementId = getGaMeasurementId();
    let sessionCookie: string | undefined;

    if (measurementId) {
      // Precise stream matching: _ga_<STREAM_ID>
      const streamSuffix = measurementId.startsWith("G-")
        ? measurementId.slice(2)
        : measurementId;
      const targetPrefix = `_ga_${streamSuffix}=`;
      sessionCookie = cookies.find((c) =>
        c.toLowerCase().startsWith(targetPrefix.toLowerCase()),
      );
    } else {
      // Fallback for single stream environments: if multiple exist, refuse to guess
      const matchingCookies = cookies.filter((c) => /^(_ga_[A-Z0-9]+)=/i.test(c));
      if (matchingCookies.length === 1) {
        sessionCookie = matchingCookies[0];
      } else {
        return null;
      }
    }

    if (!sessionCookie) return null;

    const eqIdx = sessionCookie.indexOf("=");
    if (eqIdx === -1) return null;

    const rawVal = sessionCookie.slice(eqIdx + 1).trim();
    if (!rawVal.startsWith("GS1.")) return null;

    const parts = rawVal.split(".");
    if (parts.length < 3) return null;

    const candidateSessionId = parts[2];
    if (GA_SESSION_ID_REGEX.test(candidateSessionId)) {
      return candidateSessionId;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Constructs a sanitized client analytics payload to pass to the backend commerce endpoints.
 * Returns null if analytics is disabled or no valid attribution data exists.
 */
export function getClientAnalyticsPayload(): ClientAnalyticsPayload | null {
  if (!isAnalyticsEnabled()) {
    return null;
  }

  const clientId = getGaClientIdFromCookie();
  const sessionId = getGaSessionIdFromCookie();
  const utmParams = getStoredUtmParams() || {};

  const payload: ClientAnalyticsPayload = {
    consent: "granted",
  };
  let hasData = false;

  if (clientId) {
    payload.ga_client_id = clientId;
    hasData = true;
  }

  if (sessionId) {
    payload.ga_session_id = sessionId;
    hasData = true;
  }

  for (const [k, v] of Object.entries(utmParams)) {
    if (typeof v === "string" && v.length > 0) {
      (payload as Record<string, unknown>)[k] = v;
      hasData = true;
    }
  }

  return hasData ? payload : null;
}

/**
 * Safely removes Google Analytics client cookies (_ga, _ga_*) on the current domain.
 * Strictly preserves authentication, session, security, and functional cookies.
 */
export function clearGaCookies(): void {
  if (typeof document === "undefined") return;
  try {
    const rawCookies = document.cookie ? document.cookie.split(";") : [];
    const hostname = typeof window !== "undefined" ? window.location.hostname : "";
    const domains = [
      hostname,
      `.${hostname}`,
      hostname.replace(/^[^.]+\./, "."),
      "",
    ];

    for (const cookie of rawCookies) {
      const eqIdx = cookie.indexOf("=");
      const rawName = eqIdx > -1 ? cookie.slice(0, eqIdx).trim() : cookie.trim();
      if (rawName === "_ga" || rawName.startsWith("_ga_")) {
        for (const dom of domains) {
          const domPart = dom ? `; domain=${dom}` : "";
          document.cookie = `${rawName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domPart}; SameSite=Lax`;
          document.cookie = `${rawName}=; Max-Age=0; path=/${domPart}; SameSite=Lax`;
        }
      }
    }
  } catch {
    // Graceful degradation
  }
}

// Automatically clear GA cookies upon consent denial or revocation
if (typeof window !== "undefined") {
  window.addEventListener(CONSENT_CHANGE_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<{ status: string }>).detail;
    if (detail?.status === "denied") {
      clearGaCookies();
    }
  });
}

