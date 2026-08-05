/**
 * Course list page.
 *
 * Displays courses for the current user's organization.
 * Shows loading, empty, error, and populated states.
 * Course creation is out of scope for Sprint 1 PR-10.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, Loader2, AlertCircle, FileQuestion } from "lucide-react";
import { useAuth } from "../providers/AuthProvider.js";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createCourseApi } from "../lib/api/courses.js";
import type { OrganizationResource, CourseResource } from "@avana/contracts";

/**
 * Hook to fetch the first organization for the current user.
 * In Sprint 1, users typically belong to one organization.
 */
function useOrganization() {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const orgApi = createOrganizationApi(apiClient);

  return useQuery({
    queryKey: ["organizations"],
    queryFn: () => orgApi.listOrganizations(),
  });
}

/**
 * Hook to fetch courses for a given organization.
 */
function useCourses(organizationId: string | undefined) {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const courseApi = createCourseApi(apiClient);

  return useQuery({
    queryKey: ["courses", organizationId],
    queryFn: () => courseApi.listCourses(organizationId!),
    enabled: !!organizationId,
  });
}

export function CourseListPage() {
  const { isLoading: isAuthLoading } = useAuth();

  const orgQuery = useOrganization();
  const organization = orgQuery.data?.items?.[0] as
    OrganizationResource | undefined;
  const coursesQuery = useCourses(organization?.id);

  // Global loading state
  if (isAuthLoading || orgQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // Error loading organization
  if (orgQuery.isError) {
    return (
      <StateCard
        icon={AlertCircle}
        title="Failed to load organization"
        description="Please try signing out and back in."
      />
    );
  }

  // No organization found
  if (!organization) {
    return (
      <StateCard
        icon={FileQuestion}
        title="No organization found"
        description="You don't belong to any organization yet."
      />
    );
  }

  // Courses loading
  if (coursesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // Courses load error
  if (coursesQuery.isError) {
    return (
      <StateCard
        icon={AlertCircle}
        title="Failed to load courses"
        description={coursesQuery.error?.message ?? "An error occurred"}
      />
    );
  }

  const courses = coursesQuery.data?.items as CourseResource[] | undefined;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Courses</h1>
        <p className="text-[var(--color-text-muted)] mt-1 text-sm">
          {organization.name}
        </p>
      </div>

      {/* Empty state */}
      {(!courses || courses.length === 0) && (
        <StateCard
          icon={BookOpen}
          title="No courses yet"
          description="Courses you create will appear here."
        />
      )}

      {/* Course grid */}
      {courses && courses.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Course card component with link to detail view.
 */
function CourseCard({ course }: { course: CourseResource }) {
  const subjectLabel = course.subject ?? "No subject";
  const examDate = course.exam_at
    ? new Date(course.exam_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <Link
      to={`/courses/${course.id}`}
      className="block bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center group-hover:scale-105 transition-transform">
          <BookOpen className="w-5 h-5 text-white" />
        </div>
        {course.archived && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
            Archived
          </span>
        )}
      </div>

      <h3 className="font-semibold text-[var(--color-text)] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
        {course.title}
      </h3>

      <p className="text-sm text-[var(--color-text-muted)] mt-1">
        {subjectLabel}
      </p>

      {examDate && (
        <p className="text-xs text-[var(--color-text-muted)] mt-2">
          Exam: {examDate}
        </p>
      )}
    </Link>
  );
}

/**
 * Reusable state card for empty/error states.
 */
function StateCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Icon className="w-12 h-12 text-[var(--color-text-muted)] mb-4" />
      <h2 className="text-lg font-semibold text-[var(--color-text)]">
        {title}
      </h2>
      <p className="text-sm text-[var(--color-text-muted)] mt-1">
        {description}
      </p>
    </div>
  );
}
