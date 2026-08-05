/**
 * Course detail page.
 *
 * Displays detailed information about a specific course.
 * Shows loading, error, and not-found states.
 * Course editing is out of scope for Sprint 1 PR-10.
 */

import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Loader2,
  AlertCircle,
  ArrowLeft,
  Calendar,
  FileText,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createCourseApi } from "../lib/api/courses.js";

export function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();

  // Fetch organizations to resolve org context
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const orgApi = createOrganizationApi(apiClient);
  const courseApi = createCourseApi(apiClient);

  const orgQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: () => orgApi.listOrganizations(),
  });

  const organization = orgQuery.data?.items?.[0];

  const courseQuery = useQuery({
    queryKey: ["course", organization?.id, courseId],
    queryFn: () => courseApi.getCourse(organization!.id, courseId!),
    enabled: !!organization?.id && !!courseId,
  });

  // Loading state
  if (orgQuery.isLoading || courseQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // Error state
  if (courseQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Failed to load course
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {courseQuery.error?.message ?? "An error occurred"}
        </p>
        <Link
          to="/"
          className="mt-4 px-4 py-2 bg-[var(--color-text)] text-[var(--color-background)] rounded-xl text-sm font-medium"
        >
          Back to courses
        </Link>
      </div>
    );
  }

  const course = courseQuery.data?.course;

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BookOpen className="w-12 h-12 text-[var(--color-text-muted)] mb-4" />
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Course not found
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          This course could not be found.
        </p>
        <Link
          to="/"
          className="mt-4 px-4 py-2 bg-[var(--color-text)] text-[var(--color-background)] rounded-xl text-sm font-medium"
        >
          Back to courses
        </Link>
      </div>
    );
  }

  const createdDate = new Date(course.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const examDate = course.exam_at
    ? new Date(course.exam_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to courses
      </Link>

      {/* Course header */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-8">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[var(--color-text)] truncate">
                {course.title}
              </h1>
              {course.archived && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 flex-shrink-0">
                  Archived
                </span>
              )}
            </div>
            <p className="text-[var(--color-text-muted)] mt-1">
              {course.subject ?? "No subject"}
            </p>
          </div>
        </div>

        {/* Course metadata */}
        <div className="grid grid-cols-2 gap-4 mt-8 pt-6 border-t border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-[var(--color-text-muted)]" />
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">Created</p>
              <p className="text-sm font-medium text-[var(--color-text)]">
                {createdDate}
              </p>
            </div>
          </div>
          {examDate && (
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-[var(--color-text-muted)]" />
              <div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Exam date
                </p>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  {examDate}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
