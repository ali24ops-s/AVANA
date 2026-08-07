/**
 * RequireCourseManager guard tests.
 *
 * Verifies the route-level authorization guard for the course content
 * management page, based on the user's organization membership roles:
 *  - organization_admin can access the manage page.
 *  - course_editor can access the manage page.
 *  - student (and other unauthorized roles) is redirected to the course.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import type { UserMembership } from "@avana/contracts";
import { RequireCourseManager } from "./RequireCourseManager.js";

// Mock the auth provider so we can control the authenticated user's memberships.
const mocks = vi.hoisted(() => ({
  memberships: undefined as UserMembership[] | undefined,
}));

vi.mock("../../providers/AuthProvider.js", () => ({
  useAuth: () => ({ memberships: mocks.memberships }),
}));

function membershipsOf(role: string): UserMembership[] {
  return [
    {
      organization_id: "org-1",
      role: role as UserMembership["role"],
    },
  ];
}

function renderGuard(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route
          path="/courses/:courseId"
          element={<div>Course Detail Page</div>}
        />
        <Route
          path="/courses/:courseId/manage"
          element={<RequireCourseManager />}
        >
          <Route index element={<div>Management UI</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("RequireCourseManager", () => {
  beforeEach(() => {
    mocks.memberships = undefined;
  });

  afterEach(() => {
    cleanup();
  });

  it("lets an organization_admin access the manage page", () => {
    mocks.memberships = membershipsOf("organization_admin");
    renderGuard("/courses/course-1/manage");
    expect(screen.getByText("Management UI")).toBeInTheDocument();
    expect(screen.queryByText("Course Detail Page")).not.toBeInTheDocument();
  });

  it("lets a course_editor access the manage page", () => {
    mocks.memberships = membershipsOf("course_editor");
    renderGuard("/courses/course-1/manage");
    expect(screen.getByText("Management UI")).toBeInTheDocument();
    expect(screen.queryByText("Course Detail Page")).not.toBeInTheDocument();
  });

  it("redirects a student away from the manage page", () => {
    mocks.memberships = membershipsOf("student");
    renderGuard("/courses/course-1/manage");
    expect(screen.getByText("Course Detail Page")).toBeInTheDocument();
    expect(screen.queryByText("Management UI")).not.toBeInTheDocument();
  });

  it("redirects an unauthenticated user (undefined memberships) away from the manage page", () => {
    mocks.memberships = undefined;
    renderGuard("/courses/course-1/manage");
    expect(screen.getByText("Course Detail Page")).toBeInTheDocument();
    expect(screen.queryByText("Management UI")).not.toBeInTheDocument();
  });
});
