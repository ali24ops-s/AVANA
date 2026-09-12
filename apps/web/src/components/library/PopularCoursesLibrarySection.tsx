/**
 * Popular courses section in Public Library Page (محبوب‌ترین دوره‌های آوانا).
 *
 * Displays up to 8 top popular courses across Avana in the Library page,
 * reusing the backend canonical popularity endpoint and matching the Course Card UI.
 */

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  GraduationCap,
  Flame,
  ChevronLeft,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createOrganizationApi } from "../../lib/api/organizations.js";
import { createCourseApi } from "../../lib/api/courses.js";
import { useAuth } from "../../providers/AuthProvider.js";
import type { CourseResource } from "@avana/contracts";

export interface PopularCoursesLibrarySectionProps {
  organizationId?: string;
}

export function PopularCoursesLibrarySection({
  organizationId: propOrgId,
}: PopularCoursesLibrarySectionProps) {
  const { memberships } = useAuth();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const orgApi = createOrganizationApi(apiClient);
  const courseApi = createCourseApi(apiClient);

  // Fetch organization if not provided via props
  const orgQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: () => orgApi.listOrganizations(),
    enabled: !propOrgId,
  });

  const organizationId =
    propOrgId ||
    orgQuery.data?.items?.[0]?.id ||
    memberships?.[0]?.organization_id;

  const popularCoursesQuery = useQuery({
    queryKey: ["popular-courses", organizationId],
    queryFn: () => courseApi.listPopularCourses(organizationId!),
    enabled: !!organizationId,
  });

  const courses =
    (popularCoursesQuery.data?.items as CourseResource[] | undefined) ?? [];
  const activeCourses = courses.filter((c) => !c.archived);

  // If there's an error, gracefully hide this section to keep the library functional
  if (popularCoursesQuery.isError) {
    return null;
  }

  // If loading is complete and no courses exist, hide section
  if (!popularCoursesQuery.isLoading && activeCourses.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4" data-testid="popular-courses-library-section">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg sm:text-xl font-bold text-[var(--color-text)]">
              محبوب‌ترین دوره‌های آوانا
            </h2>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            دوره‌هایی که بیشتر توسط کاربران آوانا انتخاب و استفاده شده‌اند
          </p>
        </div>

        <Link
          to="/courses"
          className="text-primary hover:text-[#007575] text-xs font-semibold hover:underline flex items-center gap-1 self-end sm:self-auto shrink-0"
        >
          <span>مشاهده همه دوره‌ها</span>
          <ChevronLeft className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Loading Skeletons */}
      {popularCoursesQuery.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-40 rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] p-4 animate-pulse flex flex-col justify-between shadow-subtle"
            >
              <div className="flex justify-between items-start">
                <div className="w-9 h-9 rounded-[10px] bg-[var(--color-surface-warm)]" />
                <div className="w-16 h-4 rounded-full bg-[var(--color-surface-warm)]" />
              </div>
              <div className="w-3/4 h-5 rounded-[8px] bg-[var(--color-surface-warm)] my-2" />
              <div className="w-full h-4 rounded bg-[var(--color-surface-warm)] pt-2 border-t border-[var(--color-border)]" />
            </div>
          ))}
        </div>
      ) : (
        /* Course Grid in exact API ranking order */
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {activeCourses.map((course) => (
            <PopularCourseLibraryCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Single Popular Course Card for Library page.
 */
function PopularCourseLibraryCard({ course }: { course: CourseResource }) {
  return (
    <Link
      to={`/courses/${course.id}`}
      className="p-4 sm:p-5 rounded-[16px] bg-[var(--color-surface)] border border-[var(--color-border)] shadow-subtle hover:border-primary/50 hover:shadow-card transition-all duration-200 flex flex-col justify-between group cursor-pointer min-h-[160px]"
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="w-9 h-9 rounded-[10px] bg-primary/10 border border-primary/30 flex items-center justify-center shrink-0 text-primary group-hover:scale-105 transition-transform">
            <GraduationCap className="w-4.5 h-4.5" />
          </div>
          {course.subject && (
            <span
              className="text-[10px] px-2.5 py-0.5 rounded-full bg-[#e0f2f2] text-[#006666] font-medium border border-[#b3d9d9] shrink-0 truncate max-w-[130px]"
              title={course.subject}
            >
              {course.subject}
            </span>
          )}
        </div>

        <h3
          className="text-sm font-bold text-[var(--color-text)] group-hover:text-primary transition-colors line-clamp-2 min-h-[2.5rem] leading-snug"
          title={course.title}
        >
          {course.title}
        </h3>
      </div>

      {/* Footer Section */}
      <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-text-muted)]">
        <span>محتوای آموزشی</span>
        <div className="text-primary font-semibold flex items-center gap-1 group-hover:underline">
          <span>ورود به دوره</span>
          <ChevronLeft className="w-3.5 h-3.5" />
        </div>
      </div>
    </Link>
  );
}
