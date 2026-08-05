/**
 * Domain role abstractions.
 */

export type Role =
  | "student"
  | "teacher"
  | "course_editor"
  | "organization_admin"
  | "support_agent"
  | "platform_admin";

export const Roles = {
  student: "student" as const,
  teacher: "teacher" as const,
  course_editor: "course_editor" as const,
  organization_admin: "organization_admin" as const,
  support_agent: "support_agent" as const,
  platform_admin: "platform_admin" as const,
};

export function isRole(value: string): value is Role {
  return (
    value === Roles.student ||
    value === Roles.teacher ||
    value === Roles.course_editor ||
    value === Roles.organization_admin ||
    value === Roles.support_agent ||
    value === Roles.platform_admin
  );
}
