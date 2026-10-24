import { describe, it, expect } from "vitest";
import { getHeaderManagementActions } from "./headerNavigation.js";

describe("headerNavigation - getHeaderManagementActions", () => {
  it("Student (regular user): returns no management actions", () => {
    const user = { role: "student" as const };
    const memberships = [{ organization_id: "org-1", role: "student" as const }];

    const actions = getHeaderManagementActions(user, memberships);
    expect(actions).toEqual([]);
  });

  it("Platform Admin (platform_admin): returns Admin Panel and Teacher Platform actions, never Course Management", () => {
    const user = { role: "platform_admin" as const };
    const memberships = [];

    const actions = getHeaderManagementActions(user, memberships);

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({
      id: "admin",
      to: "/admin",
      label: "پنل مدیریت",
      shortLabel: "پنل مدیریت",
      badgeVariant: "primary",
      ariaLabel: "پنل مدیریت",
    });
    expect(actions[1]).toMatchObject({
      id: "teacher",
      to: "/teacher",
      label: "پنل اساتید",
      shortLabel: "پنل اساتید",
      badgeVariant: "neutral",
      ariaLabel: "پنل اساتید",
    });

    // Critical assertion: /admin/courses MUST NOT be included for platform_admin
    expect(actions.some((a) => a.to === "/admin/courses")).toBe(false);
  });

  it("Organization Admin (organization_admin): returns Admin Panel action only, never Teacher Platform action", () => {
    const user = { role: "organization_admin" as const };
    const memberships = [{ organization_id: "org-1", role: "organization_admin" as const }];

    const actions = getHeaderManagementActions(user, memberships);

    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe("admin");
    expect(actions[0].to).toBe("/admin");
    expect(actions.some((a) => a.id === "teacher")).toBe(false);
    expect(actions.some((a) => a.to === "/teacher")).toBe(false);
    expect(actions.some((a) => a.to === "/admin/courses")).toBe(false);
  });

  it("Content Worker (content_worker): returns Admin Panel action, but no Teacher Platform", () => {
    const user = { role: "content_worker" as const };
    const memberships = [];

    const actions = getHeaderManagementActions(user, memberships);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      id: "admin",
      to: "/admin",
      label: "پنل مدیریت",
      shortLabel: "پنل مدیریت",
    });
    expect(actions.some((a) => a.to === "/admin/courses")).toBe(false);
  });

  it("Course Editor (course_editor): returns Course Management action to /admin/courses, and NOT /admin", () => {
    const user = { role: "course_editor" as const };
    const memberships = [{ organization_id: "org-1", role: "course_editor" as const }];

    const actions = getHeaderManagementActions(user, memberships);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      id: "course_management",
      to: "/admin/courses",
      label: "مدیریت دوره‌ها و محتوا",
      shortLabel: "مدیریت دوره‌ها",
      badgeVariant: "primary",
      ariaLabel: "مدیریت دوره‌ها",
    });
    expect(actions.some((a) => a.to === "/admin")).toBe(false);
  });

  it("Teacher (teacher): returns Teacher Platform action only", () => {
    const user = { role: "teacher" as const };
    const memberships = [{ organization_id: "org-1", role: "teacher" as const }];

    const actions = getHeaderManagementActions(user, memberships);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      id: "teacher",
      to: "/teacher",
      label: "پنل اساتید",
      shortLabel: "پنل اساتید",
      badgeVariant: "neutral",
      ariaLabel: "پنل اساتید",
    });
  });

  it("Multi-role: Student with course_editor membership gets Course Management action", () => {
    const user = { role: "student" as const };
    const memberships = [{ organization_id: "org-1", role: "course_editor" as const }];

    const actions = getHeaderManagementActions(user, memberships);

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      id: "course_management",
      to: "/admin/courses",
      label: "مدیریت دوره‌ها و محتوا",
      shortLabel: "مدیریت دوره‌ها",
    });
  });

  it("Multi-role: Student with organization_admin membership gets Admin action only, NEVER Teacher action", () => {
    const user = { role: "student" as const };
    const memberships = [{ organization_id: "org-1", role: "organization_admin" as const }];

    const actions = getHeaderManagementActions(user, memberships);

    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe("admin");
    expect(actions[0].to).toBe("/admin");
    expect(actions.some((a) => a.id === "teacher")).toBe(false);
  });

  it("Personal organization student: student role with personal organization_admin gets NO teacher link", () => {
    const user = { role: "student" as const };
    const memberships = [
      { organization_id: "personal-org-123", role: "organization_admin" as const },
    ];

    const actions = getHeaderManagementActions(user, memberships);

    expect(actions.some((a) => a.id === "teacher")).toBe(false);
    expect(actions.some((a) => a.to === "/teacher")).toBe(false);
  });

  it("Organization Admin alone: user with role='organization_admin' gets Admin action only, NEVER Teacher action", () => {
    const user = { role: "organization_admin" as const };
    const memberships = [{ organization_id: "org-1", role: "organization_admin" as const }];

    const actions = getHeaderManagementActions(user, memberships);

    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe("admin");
    expect(actions[0].to).toBe("/admin");
    expect(actions.some((a) => a.id === "teacher")).toBe(false);
    expect(actions.some((a) => a.to === "/teacher")).toBe(false);
  });

  it("Organization Admin with teaching role: gets BOTH Admin and Teacher actions", () => {
    const user = { role: "organization_admin" as const };
    const memberships = [
      { organization_id: "org-1", role: "organization_admin" as const },
      { organization_id: "school-org", role: "teacher" as const },
    ];

    const actions = getHeaderManagementActions(user, memberships);

    expect(actions).toHaveLength(2);
    expect(actions.some((a) => a.id === "admin" && a.to === "/admin")).toBe(true);
    expect(actions.some((a) => a.id === "teacher" && a.to === "/teacher")).toBe(true);
  });

  it("Teacher: user with role='teacher' gets Teacher action only", () => {
    const user = { role: "teacher" as const };
    const memberships = [{ organization_id: "school-org", role: "teacher" as const }];

    const actions = getHeaderManagementActions(user, memberships);

    expect(actions).toHaveLength(1);
    expect(actions[0].id).toBe("teacher");
    expect(actions[0].to).toBe("/teacher");
    expect(actions.some((a) => a.id === "admin")).toBe(false);
  });

  it("Multi-role: Platform Admin with course_editor membership receives Admin and Teacher, NEVER /admin/courses", () => {
    const user = { role: "platform_admin" as const };
    const memberships = [{ organization_id: "org-1", role: "course_editor" as const }];

    const actions = getHeaderManagementActions(user, memberships);

    expect(actions).toHaveLength(2);
    expect(actions[0].id).toBe("admin");
    expect(actions[0].to).toBe("/admin");
    expect(actions[1].id).toBe("teacher");
    expect(actions[1].to).toBe("/teacher");
    expect(actions.some((a) => a.to === "/admin/courses")).toBe(false);
  });
});
