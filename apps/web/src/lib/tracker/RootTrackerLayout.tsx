/**
 * Root Tracker Layout Component.
 *
 * Pathless layout route that attaches SPA page tracking without altering
 * DOM hierarchy or existing shell/page component styling.
 */

import { Outlet } from "react-router-dom";
import { usePageTracking } from "./usePageTracking.js";
import { CookieConsentBanner } from "./CookieConsentBanner.js";
import { RouteMetaRobotsManager } from "./RouteMetaRobotsManager.js";
import { OfflineBanner } from "../../components/error/index.js";

export function RootTrackerLayout() {
  usePageTracking();
  return (
    <>
      <RouteMetaRobotsManager />
      <OfflineBanner />
      <Outlet />
      <CookieConsentBanner />
    </>
  );
}
