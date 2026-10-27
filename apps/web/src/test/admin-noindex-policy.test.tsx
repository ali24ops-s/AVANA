import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, Link } from "react-router-dom";
import { RouteMetaRobotsManager } from "../lib/tracker/RouteMetaRobotsManager.js";
import { isAdminPath, isAuthPath, isNoindexRoute } from "@avana/domain";

describe("AVANA Admin & Auth Noindex Policy", () => {
  beforeEach(() => {
    // Clear head tags before each test
    document.head.innerHTML = "";
  });

  afterEach(() => {
    cleanup();
    document.head.innerHTML = "";
  });

  describe("Domain Path Helpers & Strict Boundary Verification", () => {
    it("correctly identifies /admin and all sub-routes as admin", () => {
      expect(isAdminPath("/admin")).toBe(true);
      expect(isAdminPath("/admin/")).toBe(true);
      expect(isAdminPath("/admin/dashboard")).toBe(true);
      expect(isAdminPath("/admin/courses/123")).toBe(true);
      expect(isAdminPath("/admin/courses/123?tab=settings")).toBe(true);
      expect(isAdminPath("/admin/generation/providers")).toBe(true);
      expect(isAdminPath("/admin/users/subscriptions")).toBe(true);
      expect(isAdminPath("/admin/commerce/orders?status=paid#table")).toBe(true);
    });

    it("does NOT falsely flag /administrator or unrelated paths with admin prefix", () => {
      expect(isAdminPath("/administrator")).toBe(false);
      expect(isAdminPath("/administrator/panel")).toBe(false);
      expect(isAdminPath("/admin-test")).toBe(false);
      expect(isAdminPath("/admin_settings")).toBe(false);
      expect(isAdminPath("/")).toBe(false);
      expect(isAdminPath("/teachers")).toBe(false);
      expect(isAdminPath("/blog")).toBe(false);
      expect(isAdminPath("/blog/admin-guide")).toBe(false);
    });

    it("correctly identifies auth routes for noindex", () => {
      expect(isAuthPath("/sign-in")).toBe(true);
      expect(isAuthPath("/login")).toBe(true);
      expect(isAuthPath("/register")).toBe(true);
      expect(isAuthPath("/sign-up")).toBe(true);
      expect(isAuthPath("/forgot-password")).toBe(true);
      expect(isAuthPath("/reset-password")).toBe(true);
      expect(isAuthPath("/verify-email")).toBe(true);
      expect(isAuthPath("/verify-email/123")).toBe(true);

      // Public pages should not match
      expect(isAuthPath("/")).toBe(false);
      expect(isAuthPath("/terms")).toBe(false);
      expect(isAuthPath("/teachers")).toBe(false);
      expect(isAuthPath("/blog")).toBe(false);
    });

    it("verifies isNoindexRoute covers admin, auth and private surfaces", () => {
      expect(isNoindexRoute("/admin")).toBe(true);
      expect(isNoindexRoute("/admin/courses/pharm-101")).toBe(true);
      expect(isNoindexRoute("/sign-in")).toBe(true);
      expect(isNoindexRoute("/teacher/classrooms")).toBe(true);
      expect(isNoindexRoute("/design-preview/stickers")).toBe(true);

      // Public indexable routes must be false
      expect(isNoindexRoute("/")).toBe(false);
      expect(isNoindexRoute("/teachers")).toBe(false);
      expect(isNoindexRoute("/terms")).toBe(false);
      expect(isNoindexRoute("/blog")).toBe(false);
      expect(isNoindexRoute("/blog/pharmacology-tips")).toBe(false);
    });
  });

  describe("RouteMetaRobotsManager DOM Reactivity", () => {
    function renderWithRoute(initialEntries: string[]) {
      return render(
        <MemoryRouter initialEntries={initialEntries}>
          <RouteMetaRobotsManager />
          <Routes>
            <Route path="/" element={<div data-testid="page-home">Home Page</div>} />
            <Route path="/teachers" element={<div data-testid="page-teachers">Teachers Page</div>} />
            <Route path="/terms" element={<div data-testid="page-terms">Terms Page</div>} />
            <Route path="/blog/*" element={<div data-testid="page-blog">Blog Page</div>} />
            <Route path="/administrator" element={<div data-testid="page-administrator">Fake Admin Page</div>} />
            <Route path="/sign-in" element={<div data-testid="page-signin">Sign In</div>} />
            <Route path="/register" element={<div data-testid="page-register">Register</div>} />
            <Route path="/admin" element={<div data-testid="page-admin">Admin Index</div>} />
            <Route path="/admin/dashboard" element={<div data-testid="page-admin-dash">Admin Dashboard</div>} />
            <Route path="/admin/courses/:id" element={<div data-testid="page-admin-course">Admin Course</div>} />
            <Route path="/admin/generation/providers" element={<div data-testid="page-admin-gen">Admin Generation</div>} />
            <Route path="/admin/users/subscriptions" element={<div data-testid="page-admin-users">Admin Users</div>} />
          </Routes>
        </MemoryRouter>,
      );
    }

    it("injects <meta name='robots' content='noindex, nofollow'> for /admin and /admin/", () => {
      renderWithRoute(["/admin"]);

      const robotsMeta = document.querySelector('meta[name="robots"]');
      expect(robotsMeta).not.toBeNull();
      expect(robotsMeta?.getAttribute("content")).toBe("noindex, nofollow");
    });

    it("injects <meta name='robots' content='noindex, nofollow'> for admin sub-routes", () => {
      renderWithRoute(["/admin/dashboard"]);

      const robotsMeta = document.querySelector('meta[name="robots"]');
      expect(robotsMeta).not.toBeNull();
      expect(robotsMeta?.getAttribute("content")).toBe("noindex, nofollow");
    });

    it("injects <meta name='robots' content='noindex, nofollow'> for dynamic route with query params (/admin/courses/123?tab=settings)", () => {
      renderWithRoute(["/admin/courses/123?tab=settings"]);

      const robotsMeta = document.querySelector('meta[name="robots"]');
      expect(robotsMeta).not.toBeNull();
      expect(robotsMeta?.getAttribute("content")).toBe("noindex, nofollow");
    });

    it("injects <meta name='robots' content='noindex, nofollow'> for AI generation and user subscription admin pages", () => {
      renderWithRoute(["/admin/generation/providers"]);
      expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");

      cleanup();
      document.head.innerHTML = "";

      renderWithRoute(["/admin/users/subscriptions"]);
      expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
    });

    it("does NOT inject noindex for /administrator (path boundary check)", () => {
      renderWithRoute(["/administrator"]);

      const robotsMeta = document.querySelector('meta[name="robots"]');
      expect(robotsMeta).toBeNull();
    });

    it("injects noindex, nofollow for auth pages (/sign-in, /register)", () => {
      renderWithRoute(["/sign-in"]);
      expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");

      cleanup();
      document.head.innerHTML = "";

      renderWithRoute(["/register"]);
      expect(document.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex, nofollow");
    });

    it("preserves public pages (/teachers, /terms, /blog) without noindex", () => {
      renderWithRoute(["/"]);
      expect(document.querySelector('meta[name="robots"]')).toBeNull();

      cleanup();
      document.head.innerHTML = "";

      renderWithRoute(["/teachers"]);
      expect(document.querySelector('meta[name="robots"]')).toBeNull();

      cleanup();
      document.head.innerHTML = "";

      renderWithRoute(["/terms"]);
      expect(document.querySelector('meta[name="robots"]')).toBeNull();

      cleanup();
      document.head.innerHTML = "";

      renderWithRoute(["/blog/pharmacology-101"]);
      expect(document.querySelector('meta[name="robots"]')).toBeNull();
    });

    it("removes stale canonical tag when entering an admin route", () => {
      // Simulate existing canonical link from a public blog page
      const canonical = document.createElement("link");
      canonical.rel = "canonical";
      canonical.href = "https://aavana.ir/blog/some-article";
      document.head.appendChild(canonical);

      expect(document.querySelector('link[rel="canonical"]')).not.toBeNull();

      renderWithRoute(["/admin/dashboard"]);

      // Canonical link MUST be removed, preventing admin canonicalizing to blog or home
      expect(document.querySelector('link[rel="canonical"]')).toBeNull();
    });

    it("clears stale noindex tag when transitioning from admin to a public page without duplicate tags", async () => {
      function NavigationApp() {
        return (
          <MemoryRouter initialEntries={["/admin/dashboard"]}>
            <RouteMetaRobotsManager />
            <Link to="/teachers" data-testid="nav-to-teachers">
              Go to Teachers
            </Link>
            <Routes>
              <Route path="/admin/dashboard" element={<div>Admin Dash</div>} />
              <Route path="/teachers" element={<div>Teachers Page</div>} />
            </Routes>
          </MemoryRouter>
        );
      }

      const { getByTestId } = render(<NavigationApp />);

      // On admin dashboard, noindex is present
      const adminMeta = document.querySelector('meta[name="robots"]');
      expect(adminMeta?.getAttribute("content")).toBe("noindex, nofollow");

      // Click link to navigate to public page
      fireEvent.click(getByTestId("nav-to-teachers"));

      // After navigation, the noindex tag MUST be cleaned up
      await waitFor(() => {
        const afterNavMeta = document.querySelector('meta[name="robots"]');
        expect(afterNavMeta).toBeNull();
      });

      // Ensure no conflicting multiple tags
      const allRobots = document.querySelectorAll('meta[name="robots"]');
      expect(allRobots.length).toBe(0);
    });
  });
});
