/**
 * Type-safe UTM Attribution & Campaign Extraction Module.
 *
 * Rules:
 * - Only standard keys: utm_source, utm_medium, utm_campaign, utm_term, utm_content
 * - Length capped at 100 characters per value
 * - PII detection: rejects values resembling email addresses or phone numbers
 * - Before consent: held strictly in-memory without touching sessionStorage or localStorage
 * - After consent: persisted to sessionStorage
 * - Upon rejection/revocation: in-memory parameters discarded and Avana storage cleared
 */

import { isAnalyticsEnabled } from "./config.js";
import { CONSENT_CHANGE_EVENT } from "./consent.js";
import type { UtmParams } from "./types.js";

export const UTM_STORAGE_KEY = "avana_utm_params";
const MAX_UTM_LENGTH = 100;

let inMemoryUtm: UtmParams | null = null;

const ALLOWED_UTM_KEYS: Array<keyof UtmParams> = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
];

// Basic regex to detect email pattern (plain or URL-encoded)
const EMAIL_PII_PATTERN = /(@|%40)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i;

// Regex to detect phone number sequences (8 or more consecutive digits, with optional leading +)
const PHONE_PII_PATTERN = /(?:\+|%2B)?\d{8,15}/;

// Allowed character set for campaign tags: alphanumeric, hyphens, underscores, dots, and safe encoding
const SAFE_UTM_PATTERN = /^[a-zA-Z0-9_\-.~%+]+$/;

/**
 * Validates and sanitizes a single UTM parameter value.
 * Returns null if the value is invalid, exceeds length, or contains PII.
 */
export function sanitizeUtmValue(rawValue: string | null | undefined): string | null {
  if (!rawValue) return null;

  const trimmed = rawValue.trim();
  if (!trimmed || trimmed.length > MAX_UTM_LENGTH) {
    return null;
  }

  // PII prevention check
  if (EMAIL_PII_PATTERN.test(trimmed) || PHONE_PII_PATTERN.test(trimmed)) {
    return null;
  }

  // Safe characters only
  if (!SAFE_UTM_PATTERN.test(trimmed)) {
    return null;
  }

  return trimmed;
}

/**
 * Extracts standard UTM parameters from a query string.
 * Strictly sanitizes all values and returns null if no valid UTM parameters exist.
 */
export function parseUtmParams(queryString: string): UtmParams | null {
  if (!queryString) return null;

  const search = queryString.includes("?")
    ? queryString.slice(queryString.indexOf("?") + 1)
    : queryString;
  if (!search) return null;

  const params = new URLSearchParams(search);
  const result: UtmParams = {};
  let foundAny = false;

  for (const key of ALLOWED_UTM_KEYS) {
    const rawVal = params.get(key);
    const cleanVal = sanitizeUtmValue(rawVal);
    if (cleanVal) {
      result[key] = cleanVal;
      foundAny = true;
    }
  }

  return foundAny ? result : null;
}

/**
 * Safely retrieves stored UTM parameters from sessionStorage.
 * If consent is active, returns validated stored UTMs (or fallback in-memory).
 * If consent is not granted, returns null (cannot be read).
 */
export function getStoredUtmParams(): UtmParams | null {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(UTM_STORAGE_KEY);
    if (!raw) return inMemoryUtm;
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    const validated: UtmParams = {};
    let count = 0;

    for (const key of ALLOWED_UTM_KEYS) {
      const val = parsed[key];
      if (typeof val === "string") {
        const clean = sanitizeUtmValue(val);
        if (clean) {
          validated[key] = clean;
          count++;
        }
      }
    }

    return count > 0 ? validated : inMemoryUtm;
  } catch {
    return inMemoryUtm;
  }
}

/**
 * Safely persists UTM parameters to sessionStorage if analytics is enabled.
 */
export function storeUtmParams(params: UtmParams): boolean {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) {
    return false;
  }

  try {
    const existing = getStoredUtmParams() || {};
    // Merge new params into existing session attribution
    const merged: UtmParams = { ...existing, ...params };

    window.sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(merged));
    return true;
  } catch {
    return false;
  }
}

/**
 * Commits pending in-memory UTM parameters into persistent storage once consent is granted.
 */
export function commitInMemoryUtm(): boolean {
  if (inMemoryUtm && isAnalyticsEnabled()) {
    return storeUtmParams(inMemoryUtm);
  }
  return false;
}

/**
 * Clears both in-memory UTM parameters and Avana's sessionStorage UTM entry upon consent denial/revocation.
 */
export function clearUtmStorage(): void {
  inMemoryUtm = null;
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(UTM_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

/**
 * Captures UTM parameters from current window URL or provided search string.
 * Before consent: preserves strictly in-memory without touching storage and returns null.
 * After consent: persists into sessionStorage and returns validated params.
 */
export function captureUtmFromUrl(searchQuery?: string): UtmParams | null {
  const query =
    searchQuery ?? (typeof window !== "undefined" ? window.location.search : "");
  const extracted = parseUtmParams(query);

  if (extracted) {
    inMemoryUtm = { ...(inMemoryUtm || {}), ...extracted };
    if (isAnalyticsEnabled()) {
      storeUtmParams(extracted);
      return extracted;
    }
    return null;
  }

  return isAnalyticsEnabled() ? getStoredUtmParams() : null;
}

// Subscribe to consent changes to commit or clear UTM parameters automatically
if (typeof window !== "undefined") {
  window.addEventListener(CONSENT_CHANGE_EVENT, (event: Event) => {
    const detail = (event as CustomEvent<{ status: string }>).detail;
    if (detail?.status === "granted") {
      commitInMemoryUtm();
    } else if (detail?.status === "denied") {
      clearUtmStorage();
    }
  });
}
