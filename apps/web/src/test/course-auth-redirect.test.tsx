import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "../components/shell/ProtectedRoute.js";
import { getSafeInternalRedirect } from "../utils/urlSecurity.js";
import * as AuthProviderModule from "../providers/AuthProvider.js";

describe("Course Auth & Return Redirect Security", () => {
  it("redirects unauthenticated guest visiting /courses/:courseId to /sign-in?redirect=...", () => {
    vi.spyOn(AuthProviderModule, "useAuth").mockReturnValue({
      isAuthenticated: false,
      isVerified: false,
      isEmailVerified: false,
      isPhoneVerified: false,
      isLoading: false,
      user: null,
      memberships: [],
    } as any);

    render(
      <MemoryRouter initialEntries={["/courses/00000000-0000-4000-a000-000000000001"]}>
        <Routes>
          <Route path="/sign-in" element={<div data-testid="sign-in-page">Sign In Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/courses/:courseId" element={<div data-testid="course-page">Course Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("sign-in-page")).toBeInTheDocument();
    expect(screen.queryByTestId("course-page")).not.toBeInTheDocument();
  });

  it("preserves deep search parameters in redirect when guest opens course with query params", () => {
    vi.spyOn(AuthProviderModule, "useAuth").mockReturnValue({
      isAuthenticated: false,
      isVerified: false,
      isEmailVerified: false,
      isPhoneVerified: false,
      isLoading: false,
      user: null,
      memberships: [],
    } as any);

    let capturedLocation: any;
    function SignInTracker() {
      capturedLocation = window.location.href;
      return <div data-testid="sign-in-tracked">Sign In Tracked</div>;
    }

    render(
      <MemoryRouter initialEntries={["/courses/anatomy-101?tab=flashcards&lessonId=l-2"]}>
        <Routes>
          <Route path="/sign-in" element={<SignInTracker />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/courses/:courseId" element={<div>Course Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("sign-in-tracked")).toBeInTheDocument();
  });

  it("renders child course content when user is authenticated and verified", () => {
    vi.spyOn(AuthProviderModule, "useAuth").mockReturnValue({
      isAuthenticated: true,
      isVerified: true,
      isEmailVerified: true,
      isPhoneVerified: false,
      isLoading: false,
      user: { id: "u-1" },
      memberships: [],
    } as any);

    render(
      <MemoryRouter initialEntries={["/courses/00000000-0000-4000-a000-000000000001"]}>
        <Routes>
          <Route path="/sign-in" element={<div>Sign In Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/courses/:courseId" element={<div data-testid="course-page">Course Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId("course-page")).toBeInTheDocument();
  });

  describe("getSafeInternalRedirect Open Redirect defenses", () => {
    it("allows valid course relative routes", () => {
      expect(
        getSafeInternalRedirect("/courses/00000000-0000-4000-a000-000000000001"),
      ).toBe("/courses/00000000-0000-4000-a000-000000000001");
      expect(
        getSafeInternalRedirect("/courses/pharmacology-1?tab=quizzes"),
      ).toBe("/courses/pharmacology-1?tab=quizzes");
    });

    it("rejects protocol scheme URLs (http, https)", () => {
      expect(getSafeInternalRedirect("https://attacker.com/evil")).toBe("/home");
      expect(getSafeInternalRedirect("http://attacker.com")).toBe("/home");
    });

    it("rejects scheme-relative URLs (//attacker.com)", () => {
      expect(getSafeInternalRedirect("//attacker.com")).toBe("/home");
      expect(getSafeInternalRedirect("//evil.org/courses/1")).toBe("/home");
    });

    it("rejects backslash evasion URLs", () => {
      expect(getSafeInternalRedirect("/\\attacker.com")).toBe("/home");
      expect(getSafeInternalRedirect("\\attacker.com")).toBe("/home");
      expect(getSafeInternalRedirect("/courses\\evil")).toBe("/home");
    });

    it("rejects javascript: and data: pseudo-schemes", () => {
      expect(getSafeInternalRedirect("javascript:alert(document.cookie)")).toBe("/home");
      expect(getSafeInternalRedirect("/courses?redirect=javascript:evil")).toBe("/home");
    });

    it("falls back to custom fallback if provided", () => {
      expect(getSafeInternalRedirect("https://bad.com", "/courses")).toBe("/courses");
      expect(getSafeInternalRedirect(null, "/courses")).toBe("/courses");
    });
  });
});
