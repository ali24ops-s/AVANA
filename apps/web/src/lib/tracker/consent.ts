/**
 * Strict Opt-in Consent Management Module for AVANA Analytics.
 *
 * Rules:
 * 1. Default state for new visitors is 'pending' (strict opt-in).
 * 2. Consent validity is strictly 6 months (180 days).
 * 3. Expired consent is treated as 'pending'.
 * 4. Safe against localStorage exceptions or privacy mode restrictions.
 * 5. Single source of truth for analytics gating.
 */

export type ConsentStatus = "pending" | "granted" | "denied";

export interface StoredConsentRecord {
  status: "granted" | "denied";
  timestamp: number;
  expiresAt: number;
}

export const CONSENT_STORAGE_KEY = "avana_analytics_consent";
export const CONSENT_DURATION_MS = 180 * 24 * 60 * 60 * 1000; // 6 months (~180 days)

/**
 * Custom event dispatched whenever consent state changes.
 */
export const CONSENT_CHANGE_EVENT = "avana:consent-changed";

/**
 * Custom event dispatched to request opening the privacy settings modal.
 */
export const OPEN_PRIVACY_SETTINGS_EVENT = "avana:open-privacy-settings";

/**
 * Programmatically triggers opening the privacy settings modal.
 */
export function openPrivacySettings(): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(OPEN_PRIVACY_SETTINGS_EVENT));
  } catch {
    // Graceful fallback
  }
}

/**
 * Retrieves the stored consent record if valid and not expired.
 * Cleans up invalid or expired records automatically.
 */
export function getConsentRecord(): StoredConsentRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredConsentRecord>;
    if (
      (parsed.status === "granted" || parsed.status === "denied") &&
      typeof parsed.timestamp === "number" &&
      typeof parsed.expiresAt === "number"
    ) {
      // Check expiration
      if (Date.now() > parsed.expiresAt) {
        window.localStorage.removeItem(CONSENT_STORAGE_KEY);
        return null;
      }
      return {
        status: parsed.status,
        timestamp: parsed.timestamp,
        expiresAt: parsed.expiresAt,
      };
    }
    // Invalid record shape: clear safely
    window.localStorage.removeItem(CONSENT_STORAGE_KEY);
    return null;
  } catch {
    return null;
  }
}

/**
 * Gets the current effective consent status.
 * Returns 'pending' if no decision was made or consent has expired.
 */
export function getConsentStatus(): ConsentStatus {
  const record = getConsentRecord();
  return record ? record.status : "pending";
}

/**
 * Returns true strictly when the user has explicitly granted active analytics consent.
 */
export function hasAnalyticsConsent(): boolean {
  return getConsentStatus() === "granted";
}

/**
 * Persists user consent decision ('granted' or 'denied') with a 6-month expiration.
 */
export function setConsent(status: "granted" | "denied"): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const record: StoredConsentRecord = {
    status,
    timestamp: now,
    expiresAt: now + CONSENT_DURATION_MS,
  };
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record));
  } catch {
    // Ignore storage quota or security errors gracefully
  }

  // Dispatch event for UI and tracker subscribers
  try {
    window.dispatchEvent(
      new CustomEvent(CONSENT_CHANGE_EVENT, { detail: { status } }),
    );
  } catch {
    // Graceful fallback
  }

  // If consent was denied or revoked, synchronize with backend to cancel pending purchase dispatches
  if (status === "denied") {
    syncConsentRevocationWithServer();
  }
}

/**
 * Safely notifies the server about consent revocation so that any pending orders
 * or backend purchase events are immediately marked as skipped.
 */
export function syncConsentRevocationWithServer(orderId?: string): void {
  if (typeof window === "undefined" || typeof fetch === "undefined") return;
  try {
    void fetch("/v1/commerce/analytics/consent/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(orderId ? { order_id: orderId } : {}),
      keepalive: true,
    }).catch(() => {
      // Graceful offline degradation
    });
  } catch {
    // Ignore network setup errors
  }
}

/**
 * Revokes existing consent, marking status as 'denied' and synchronizing with backend.
 */
export function revokeConsent(orderId?: string): void {
  setConsent("denied");
  if (orderId) {
    syncConsentRevocationWithServer(orderId);
  }
}

