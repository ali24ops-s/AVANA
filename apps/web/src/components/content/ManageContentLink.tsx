/**
 * Manage Content link.
 *
 * A navigation entry that points to the course content management page
 * (`/courses/:courseId/manage`). It is only rendered for users who have
 * content management permissions based on their organization membership roles.
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
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-[#008080] border border-[#008080]/30 hover:bg-[#008080]/10 transition-colors flex-shrink-0"
    >
      <Settings2 className="w-3.5 h-3.5" />
      <span>مدیریت محتوا</span>
    </Link>
  );
}
