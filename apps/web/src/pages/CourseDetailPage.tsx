/**
 * Course detail page.
 *
 * Displays detailed information about a specific course in Persian.
 */

import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Loader2,
  AlertCircle,
  ArrowRight,
  Calendar,
  FileText,
  GraduationCap,
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
        <Loader2 className="w-8 h-8 animate-spin text-[#008080]" />
      </div>
    );
  }

  // Error state
  if (courseQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-8">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-lg font-bold text-[var(--color-text)]">
          خطا در دریافت اطلاعات دوره
        </h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          {courseQuery.error?.message ?? "خطایی در دریافت اطلاعات رخ داد."}
        </p>
        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            onClick={() => void courseQuery.refetch()}
            className="px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-semibold"
          >
            تلاش مجدد
          </button>
          <Link
            to="/courses"
            className="px-4 py-2 bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text)] rounded-xl text-xs font-semibold"
          >
            بازگشت به دوره‌ها
          </Link>
        </div>
      </div>
    );
  }

  const course = courseQuery.data?.course;

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-8">
        <BookOpen className="w-12 h-12 text-[var(--color-text-muted)] mb-4" />
        <h2 className="text-lg font-bold text-[var(--color-text)]">
          دوره یافت نشد
        </h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-1">
          دوره مورد نظر یافت نشد یا دسترسی به آن امکان‌پذیر نیست.
        </p>
        <Link
          to="/courses"
          className="mt-4 px-4 py-2 bg-[#008080] text-white rounded-xl text-xs font-semibold"
        >
          بازگشت به دوره‌ها
        </Link>
      </div>
    );
  }

  const createdDate = new Date(course.created_at).toLocaleDateString("fa-IR", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const examDate = course.exam_at
    ? new Date(course.exam_at).toLocaleDateString("fa-IR", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back link */}
      <Link
        to="/courses"
        className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-teal-400 transition-colors"
      >
        <ArrowRight className="w-4 h-4" />
        <span>بازگشت به دوره‌ها</span>
      </Link>

      {/* Course header */}
      <div className="glass-panel rounded-xl card-inner-border p-8 shadow-ambient space-y-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-950/60 border border-teal-500/30 text-teal-400 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-extrabold text-white truncate">
                {course.title}
              </h1>
              {course.archived && (
                <span className="text-xs px-2.5 py-1 rounded-full bg-amber-950/40 text-amber-300 font-medium border border-amber-500/30 flex-shrink-0">
                  بایگانی شده
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {course.subject ?? "دوره تخصصی"}
            </p>
          </div>
        </div>

        {/* Course metadata */}
        <div className="grid grid-cols-2 gap-4 pt-6 border-t border-white/10">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-teal-400" />
            <div>
              <p className="text-xs text-slate-400">تاریخ ایجاد</p>
              <p className="text-sm font-semibold text-white">
                {createdDate}
              </p>
            </div>
          </div>
          {examDate && (
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-teal-400" />
              <div>
                <p className="text-xs text-slate-400">
                  تاریخ آزمون
                </p>
                <p className="text-sm font-semibold text-white">
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
