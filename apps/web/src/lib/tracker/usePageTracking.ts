/**
 * React Router Hook for SPA Page View Tracking.
 *
 * Guarantees:
 * 1. Tracks initial page load and every subsequent SPA navigation.
 * 2. Exactly one pageview per navigation.
 * 3. Deduplicated against React Strict Mode double-invocation in development.
 * 4. Allows child pages to update document.title before tracking fires.
 */

import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { trackPageView } from "./tracker.js";
import { captureUtmFromUrl } from "./utm.js";
import { isAnalyticsEnabled } from "./config.js";
import { CONSENT_CHANGE_EVENT } from "./consent.js";
import { initGtm } from "./gtm.js";

export function usePageTracking(): void {
  const location = useLocation();
  const lastTrackedPathRef = useRef<string | null>(null);

  useEffect(() => {
    // Capture UTM parameters (held in-memory before consent, persisted after consent)
    if (location.search) {
      captureUtmFromUrl(location.search);
    }

    const currentPath = location.pathname;

    // Deduplication: skip if already tracked for this exact path
    if (lastTrackedPathRef.current === currentPath) {
      return;
    }

    // If analytics is enabled (consent granted), track pageview after tick
    if (isAnalyticsEnabled()) {
      const timeoutId = setTimeout(() => {
        lastTrackedPathRef.current = currentPath;
        trackPageView(currentPath);
      }, 0);

      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [location.pathname, location.search]);

  // Listen for consent grant on the current page to fire deferred initial pageview
  useEffect(() => {
    const onConsentChange = (event: Event) => {
      const detail = (event as CustomEvent<{ status: string }>).detail;
      if (detail?.status === "granted") {
        const currentPath = location.pathname;
        if (lastTrackedPathRef.current !== currentPath) {
          lastTrackedPathRef.current = currentPath;
          initGtm();
          trackPageView(currentPath);
        }
      }
    };

    window.addEventListener(CONSENT_CHANGE_EVENT, onConsentChange);
    return () => {
      window.removeEventListener(CONSENT_CHANGE_EVENT, onConsentChange);
    };
  }, [location.pathname]);
}
