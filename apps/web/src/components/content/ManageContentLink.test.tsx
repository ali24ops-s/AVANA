/**
 * ManageContentLink tests.
 *
 * Verifies the "Manage Content" navigation entry:
 *  - Renders for users with content management permissions (based on their
 *    organization membership roles)
 *  - Links to /courses/:courseId/manage
 *  - Is absent for learners / users without permissions
 */

import { describe, expect, it, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ManageContentLink } from "./ManageContentLink.js";
import type { UserMembership } from "@avana/contracts";

function membershipsOf(role: string): UserMembership[] {
  return [
    {
      organization_id: "org-1",
      role: role as UserMembership["role"],
    },
  ];
}

function renderLink(memberships: UserMembership[] | undefined) {
  return render(
    <MemoryRouter>
      <ManageContentLink courseId="course-1" memberships={memberships} />
    </MemoryRouter>,
  );
}

describe("ManageContentLink", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a link that points to /courses/:courseId/manage for organization_admin", () => {
    renderLink(membershipsOf("organization_admin"));
    const link = screen.getByRole("link", { name: /manage content/i });
    expect(link).toHaveAttribute("href", "/courses/course-1/manage");
  });

  it("renders a link for course_editor", () => {
    renderLink(membershipsOf("course_editor"));
    expect(
      screen.getByRole("link", { name: /manage content/i }),
    ).toBeInTheDocument();
  });

  it("does not render anything for a student", () => {
    renderLink(membershipsOf("student"));
    expect(
      screen.queryByRole("link", { name: /manage content/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render anything when memberships is undefined", () => {
    renderLink(undefined);
    expect(
      screen.queryByRole("link", { name: /manage content/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render anything when memberships is empty", () => {
    renderLink([]);
    expect(
      screen.queryByRole("link", { name: /manage content/i }),
    ).not.toBeInTheDocument();
  });
});
