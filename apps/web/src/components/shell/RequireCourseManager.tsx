/**
 * Route-level authorization guard for the course content management page.
 *
 * Only users with content management permissions (`organization_admin` or
 * `course_editor`) may access `/courses/:courseId/manage`. The guard runs at
 * the route level, before the management UI renders, so unauthorized users
 * (e.g. `student`) are redirected back to the course detail page rather than
 * merely having links hidden.
 *
 * Permissions are derived from the user's organization membership roles (from
 * `useAuth().memberships`), not from the base `user.role`. Backend
 * authorization is intentionally not modified — this is a client-side UX guard
 * that reuses the existing `canManageCourseContent` permission helper.
 */

import { Navigate, Outlet, useParams } from "react-router-dom";
import { useAuth } from "../../providers/AuthProvider.js";
import { canManageCourseContent } from "../../utils/coursePermissions.js";

export function RequireCourseManager() {
  const { courseId } = useParams<{ courseId: string }>();
  const { memberships } = useAuth();

  const allowed = canManageCourseContent(memberships);

  // Unauthorized — prevent the management UI from rendering and redirect to
  // the course detail page.
  if (!allowed) {
    return <Navigate to={`/courses/${courseId ?? ""}`} replace />;
  }

  // Authorized — render the management page (CourseContentPage).
  return <Outlet />;
}
