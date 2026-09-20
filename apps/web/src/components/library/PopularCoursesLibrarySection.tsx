/**
 * Popular courses section in Public Library Page (محبوب‌ترین دوره‌های آوانا).
 *
 * Displays up to 8 top popular courses across Avana in the Library page,
 * reusing the backend canonical popularity endpoint and matching the Course Card UI.
 */

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Flame,
  ChevronLeft,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createOrganizationApi } from "../../lib/api/organizations.js";
import { createCourseApi } from "../../lib/api/courses.js";
import { useAuth } from "../../providers/AuthProvider.js";
import { CourseCard } from "../avana/CourseCard.js";
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
          {activeCourses.map((course) => {
            const rawCourse = course as { cover_image?: string; thumbnail_url?: string };
            return (
              <CourseCard
                key={course.id}
                id={course.id}
                title={course.title}
                subject={course.subject}
                coverImage={rawCourse.cover_image || rawCourse.thumbnail_url}
                href={`/courses/${course.id}`}
                variant="compact"
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
