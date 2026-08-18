/**
 * Course list page.
 *
 * Displays courses for the current user's organization.
 * Shows loading, empty, error, and populated states in Persian.
 */

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BookOpen, Loader2, AlertCircle, FileQuestion, GraduationCap, ChevronLeft } from "lucide-react";
import { useAuth } from "../providers/AuthProvider.js";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createCourseApi } from "../lib/api/courses.js";
import type { OrganizationResource, CourseResource } from "@avana/contracts";

/**
 * Hook to fetch the first organization for the current user.
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
        <Loader2 className="w-8 h-8 animate-spin text-[#008080]" />
      </div>
    );
  }

  // Error loading organization
  if (orgQuery.isError) {
    return (
      <StateCard
        icon={AlertCircle}
        title="خطا در بارگذاری سازمان"
        description="لطفاً اتصال اینترنت خود را بررسی کرده و دوباره تلاش کنید."
        action={
          <button
            type="button"
            onClick={() => void orgQuery.refetch()}
            className="px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-semibold"
          >
            تلاش مجدد
          </button>
        }
      />
    );
  }

  // No organization found
  if (!organization) {
    return (
      <StateCard
        icon={FileQuestion}
        title="سازمانی یافت نشد"
        description="شما هنوز عضو هیچ سازمان آموزشی نشده‌اید."
        action={
          <button
            type="button"
            onClick={() => void orgQuery.refetch()}
            className="px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-semibold"
          >
            تازه‌سازی
          </button>
        }
      />
    );
  }

  // Courses loading
  if (coursesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#008080]" />
      </div>
    );
  }

  // Courses load error
  if (coursesQuery.isError) {
    return (
      <StateCard
        icon={AlertCircle}
        title="خطا در بارگذاری دوره‌ها"
        description={coursesQuery.error?.message ?? "خطایی در دریافت اطلاعات رخ داد."}
        action={
          <button
            type="button"
            onClick={() => void coursesQuery.refetch()}
            className="px-4 py-2 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-semibold"
          >
            تلاش مجدد
          </button>
        }
      />
    );
  }

  const courses = coursesQuery.data?.items as CourseResource[] | undefined;

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            دوره‌های آموزشی
          </h1>
          <p className="text-slate-400 mt-1 text-xs">
            {organization.name}
          </p>
        </div>
        {courses && courses.length > 0 && (
          <span className="text-xs font-bold text-teal-300 bg-teal-900/30 px-3 py-1.5 rounded-full border border-teal-500/30 glass-panel">
            {courses.length} دوره در دسترس
          </span>
        )}
      </div>

      {/* Empty state */}
      {(!courses || courses.length === 0) && (
        <StateCard
          icon={BookOpen}
          title="هنوز دوره‌ای وجود ندارد"
          description="دوره‌های ایجادشده در این بخش نمایش داده خواهند شد."
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
  const subjectLabel = course.subject ?? "دوره تخصصی";
  const examDate = course.exam_at
    ? new Date(course.exam_at).toLocaleDateString("fa-IR", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <Link
      to={`/courses/${course.id}`}
      className="block glass-panel rounded-xl card-inner-border p-5 hover:bg-white/10 hover:border-teal-500/50 shadow-ambient transition-all group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-teal-950/60 border border-teal-500/30 text-teal-400 flex items-center justify-center group-hover:scale-105 transition-transform">
          <GraduationCap className="w-5 h-5" />
        </div>
        {course.archived && (
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-950/40 text-amber-300 font-medium border border-amber-500/30">
            بایگانی شده
          </span>
        )}
      </div>

      <h3 className="font-bold text-white group-hover:text-teal-400 transition-colors line-clamp-1">
        {course.title}
      </h3>

      <p className="text-xs text-slate-400 mt-1.5 line-clamp-1">
        {subjectLabel}
      </p>

      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
        <span>{examDate ? `تاریخ آزمون: ${examDate}` : "آماده یادگیری"}</span>
        <span className="text-teal-400 font-semibold flex items-center gap-1 group-hover:underline">
          <span>ورود</span>
          <ChevronLeft className="w-3.5 h-3.5" />
        </span>
      </div>
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
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center glass-panel rounded-xl card-inner-border p-8 shadow-ambient">
      <Icon className="w-12 h-12 text-slate-400 mb-4" />
      <h2 className="text-lg font-bold text-white">
        {title}
      </h2>
      <p className="text-xs text-slate-400 mt-1 max-w-sm">
        {description}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
