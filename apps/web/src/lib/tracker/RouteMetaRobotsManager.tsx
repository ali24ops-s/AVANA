import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { isNoindexRoute, isAdminPath } from "@avana/domain";

/**
 * Attribute used to mark the robots meta tag managed by AVANA RouteMetaRobotsManager
 */
const MANAGED_ATTR = "data-managed-by";
const MANAGED_VALUE = "avana-route-robots";

/**
 * Centralized Route Meta Robots Manager.
 *
 * Ensures:
 * 1. All admin routes (/admin, /admin/*) and auth routes (/sign-in, /login, etc.)
 *    strictly receive `<meta name="robots" content="noindex, nofollow" />`.
 * 2. Uses strict path boundaries (e.g. /administrator is NOT treated as admin).
 * 3. Query strings or hash fragments (e.g. /admin/courses/123?tab=settings) never bypass the policy.
 * 4. Stale canonical tags from previous public routes (like blog) are removed when entering admin.
 * 5. Public routes never inherit leftover `noindex` tags; stale noindex tags are removed on navigation.
 * 6. Avoids injecting conflicting duplicate tags.
 */
export function RouteMetaRobotsManager() {
  const location = useLocation();

  useEffect(() => {
    if (typeof document === "undefined") return;

    const pathname = location.pathname;
    const shouldBeNoindex = isNoindexRoute(pathname);
    const isAdmin = isAdminPath(pathname);

    // Collect all existing meta[name="robots"] tags
    const existingRobotsTags = Array.from(
      document.querySelectorAll<HTMLMetaElement>('meta[name="robots"]'),
    );

    if (shouldBeNoindex) {
      // 1. Enforce single `<meta name="robots" content="noindex, nofollow" />`
      if (existingRobotsTags.length > 0) {
        // Keep the first tag and set content, remove any duplicates
        const primary = existingRobotsTags[0];
        primary.setAttribute("content", "noindex, nofollow");
        primary.setAttribute(MANAGED_ATTR, MANAGED_VALUE);

        for (let i = 1; i < existingRobotsTags.length; i++) {
          existingRobotsTags[i].remove();
        }
      } else {
        const meta = document.createElement("meta");
        meta.setAttribute("name", "robots");
        meta.setAttribute("content", "noindex, nofollow");
        meta.setAttribute(MANAGED_ATTR, MANAGED_VALUE);
        document.head.appendChild(meta);
      }

      // 2. In admin routes, remove any stray canonical links left over from public/blog pages
      // Never canonicalize admin pages to homepage or public pages
      if (isAdmin) {
        const canonicalLinks = document.querySelectorAll('link[rel="canonical"]');
        canonicalLinks.forEach((link) => link.remove());
      }
    } else {
      // Public route:
      // Remove any leftover noindex tag set by our manager or stale from prior private route
      for (const tag of existingRobotsTags) {
        const content = tag.getAttribute("content") || "";
        if (
          tag.getAttribute(MANAGED_ATTR) === MANAGED_VALUE ||
          content.includes("noindex")
        ) {
          tag.remove();
        }
      }

      // If multiple robots tags remain from other sources, keep at most one
      const remainingRobots = Array.from(
        document.querySelectorAll<HTMLMetaElement>('meta[name="robots"]'),
      );
      for (let i = 1; i < remainingRobots.length; i++) {
        remainingRobots[i].remove();
      }
    }
  }, [location.pathname]);

  return null;
}
