/**
 * Manage Content link.
 *
 * A navigation entry that points to the course content management page
 * (`/courses/:courseId/manage`). It is only rendered for users who have
 * content management permissions based on their organization membership roles
 * (`organization_admin` or `course_editor`).
 *
 * For learners (and users without management permissions) the component
 * renders nothing, keeping the learner experience unchanged.
 */

import { Link } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { canManageCourseContent } from "../../utils/coursePermissions.js";
import type { UserMembership } from "@avana/contracts";

export function ManageContentLink({
  courseId,
  memberships,
}: {
  courseId: string;
  memberships: UserMembership[] | undefined;
}) {
  if (!canManageCourseContent(memberships)) {
    return null;
  }

  return (
    <Link
      to={`/courses/${courseId}/manage`}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors flex-shrink-0"
    >
      <Settings2 className="w-4 h-4" />
      Manage Content
    </Link>
  );
}
