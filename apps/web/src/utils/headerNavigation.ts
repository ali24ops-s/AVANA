/**
 * Header management navigation resolver.
 *
 * Provides a single source of truth for resolving privileged management destinations
 * (Admin Panel, Course & Content Studio, Teacher Platform) across:
 *   - Desktop Header Badges
 *   - Mobile Drawer Links
 *   - User Profile Dropdown Menu
 *
 * Ensures consistent, permission-driven destination routing so that platform/org
 * admins always access their primary administration panels, while course editors
 * land on course management, without duplicate or diverging role logic across devices.
 */

import type { ComponentType } from "react";
import { ShieldCheck, BookOpen, GraduationCap } from "lucide-react";
import type { Role, UserMembership, UserResource } from "@avana/contracts";
import { isUserAdmin } from "./adminPermissions.js";
import { canManageCourseContent } from "./coursePermissions.js";
import { isTeacherOrAdmin } from "../components/teacher/TeacherRouteGuard.js";

export type HeaderManagementActionId = "admin" | "course_management" | "teacher";

export interface HeaderManagementAction {
  id: HeaderManagementActionId;
  label: string;
  shortLabel: string;
  to: string;
  icon: ComponentType<{ className?: string }>;
  badgeVariant: "primary" | "neutral";
  ariaLabel: string;
}

/**
 * Resolves the appropriate management navigation actions for the current user.
 *
 * Rules:
 * 1. Admin: Users with administrative roles (platform_admin, organization_admin, content_worker)
 *    receive the primary Admin Panel action ("/admin", "پنل مدیریت", ShieldCheck).
 * 2. Course Editor: Users who are NOT admins but possess course content management privileges
 *    (course_editor) receive the Course Management action ("/admin/courses", BookOpen).
 *    Admins do NOT receive /admin/courses as an extra header action because /admin is their primary workspace.
 * 3. Teacher: Users with teaching privileges (teacher, organization_admin, platform_admin)
 *    receive the Teacher Platform action ("/teacher", "پنل اساتید", GraduationCap).
 * 4. Regular Learners (student): Receive an empty array.
 */
export function getHeaderManagementActions(
  user?: Pick<UserResource, "role"> | { role?: Role | string } | null,
  memberships?: Pick<UserMembership, "role">[] | { role?: Role | string }[] | null,
): HeaderManagementAction[] {
  const actions: HeaderManagementAction[] = [];

  // Rule 1 — Admin
  if (isUserAdmin(user, memberships)) {
    actions.push({
      id: "admin",
      to: "/admin",
      label: "پنل مدیریت",
      shortLabel: "پنل مدیریت",
      icon: ShieldCheck,
      badgeVariant: "primary",
      ariaLabel: "پنل مدیریت",
    });
  } else if (canManageCourseContent(memberships as UserMembership[], user)) {
    // Rule 2 — Course Editor (only when not admin)
    actions.push({
      id: "course_management",
      to: "/admin/courses",
      label: "مدیریت دوره‌ها و محتوا",
      shortLabel: "مدیریت دوره‌ها",
      icon: BookOpen,
      badgeVariant: "primary",
      ariaLabel: "مدیریت دوره‌ها",
    });
  }

  // Rule 3 — Teacher
  if (isTeacherOrAdmin(user?.role, memberships)) {
    actions.push({
      id: "teacher",
      to: "/teacher",
      label: "پنل اساتید",
      shortLabel: "پنل اساتید",
      icon: GraduationCap,
      badgeVariant: "neutral",
      ariaLabel: "پنل اساتید",
    });
  }

  return actions;
}
