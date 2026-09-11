/**
 * Course list page.
 *
 * Displays personal "My Courses" (دوره‌های من) for the current user's organization.
 * Includes initial onboarding modal for new users, "+ افزودن دوره" CTA,
 * deletion confirmation modal, and professional empty state.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import {
  BookOpen,
  Loader2,
  AlertCircle,
  FileQuestion,
  GraduationCap,
  ChevronLeft,
  Plus,
  Trash2,
} from "lucide-react";
import { useAuth } from "../providers/AuthProvider.js";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createCourseApi } from "../lib/api/courses.js";
import { createLearningApi } from "../lib/api/learning.js";
import { CourseSelectionModal } from "../components/courses/CourseSelectionModal.js";
import { CourseDeleteConfirmModal } from "../components/courses/CourseDeleteConfirmModal.js";
import { toPersianDigits } from "@avana/domain";
import {
  useCommerceProducts,
  useMyEntitlements,
  useMySubscription,
} from "../hooks/useCommerce.js";
import { formatToman } from "../components/commerce/userCommerceUtils.js";
import { Button } from "@avana/ui";
import type { OrganizationResource, CourseResource, CourseListResponse } from "@avana/contracts";

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
 * Hook to fetch all available courses for selection in an organization.
 */
function useAvailableCourses(organizationId: string | undefined) {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const courseApi = createCourseApi(apiClient);

  return useQuery({
    queryKey: ["courses", organizationId],
    queryFn: () => courseApi.listCourses(organizationId!),
    enabled: !!organizationId,
  });
}

/**
 * Hook to fetch the user's selected / personal courses ("My Courses").
 */
function useMyCourses(organizationId: string | undefined) {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const courseApi = createCourseApi(apiClient);

  return useQuery({
    queryKey: ["my-courses", organizationId],
    queryFn: async () => {
      const res = await courseApi.listMyCourses(organizationId!);
      return res;
    },
    enabled: !!organizationId,
  });
}

/**
 * Hook to fetch progress summary for a specific course.
 */
function useCourseProgress(courseId: string | undefined) {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const learningApi = createLearningApi(apiClient);

  return useQuery({
    queryKey: ["course-progress", courseId],
    queryFn: () => learningApi.getCourseProgress(courseId!),
    enabled: !!courseId,
  });
}

export function CourseListPage() {
  const { isLoading: isAuthLoading } = useAuth();
  const queryClient = useQueryClient();

  const orgQuery = useOrganization();
  const organization = orgQuery.data?.items?.[0] as
    OrganizationResource | undefined;

  const myCoursesQuery = useMyCourses(organization?.id);
  const availableCoursesQuery = useAvailableCourses(organization?.id);

  // Modal and Onboarding State
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [hasAttemptedAutoModal, setHasAttemptedAutoModal] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<CourseResource | null>(
    null,
  );

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const courseApi = createCourseApi(apiClient);

  // Sync courses mutation
  const syncMutation = useMutation({
    mutationFn: (courseIds: string[]) =>
      courseApi.syncMyCourses(organization!.id, courseIds),
    onSuccess: (data) => {
      if (data && organization?.id) {
        queryClient.setQueryData(["my-courses", organization.id], data);
      }
      void queryClient.invalidateQueries({
        queryKey: ["my-courses", organization?.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["courses", organization?.id],
      });
      setIsSelectionModalOpen(false);
    },
  });

  // Delete course from my list mutation
  const deleteMutation = useMutation({
    mutationFn: (courseId: string) =>
      courseApi.removeMyCourse(organization!.id, courseId),
    onSuccess: (_, courseId) => {
      if (organization?.id) {
        queryClient.setQueryData<CourseListResponse>(
          ["my-courses", organization.id],
          (old) => {
            if (!old) return old;
            return {
              ...old,
              items: (old.items || []).filter((c) => c.id !== courseId),
            };
          },
        );
      }
      void queryClient.invalidateQueries({
        queryKey: ["my-courses", organization?.id],
      });
      setCourseToDelete(null);
    },
  });

  const myCourses = (myCoursesQuery.data?.items as CourseResource[] | undefined) ?? [];
  const availableCourses =
    (availableCoursesQuery.data?.items as CourseResource[] | undefined) ?? [];

  // Auto-open modal on first visit if user has no selected courses
  useEffect(() => {
    if (
      !hasAttemptedAutoModal &&
      myCoursesQuery.isSuccess &&
      availableCoursesQuery.isSuccess
    ) {
      setHasAttemptedAutoModal(true);
      if (myCourses.length === 0 && availableCourses.length > 0) {
        setIsSelectionModalOpen(true);
      }
    }
  }, [
    hasAttemptedAutoModal,
    myCoursesQuery.isSuccess,
    availableCoursesQuery.isSuccess,
    myCourses.length,
    availableCourses.length,
  ]);

  // Global loading state
  if (isAuthLoading || orgQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
          <Button
            variant="primary"
            size="sm"
            onClick={() => void orgQuery.refetch()}
          >
            تلاش مجدد
          </Button>
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
          <Button
            variant="primary"
            size="sm"
            onClick={() => void orgQuery.refetch()}
          >
            تازه‌سازی
          </Button>
        }
      />
    );
  }

  // Courses loading
  if (myCoursesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Courses load error
  if (myCoursesQuery.isError) {
    return (
      <StateCard
        icon={AlertCircle}
        title="خطا در بارگذاری دوره‌ها"
        description={
          myCoursesQuery.error?.message ?? "خطایی در دریافت اطلاعات رخ داد."
        }
        action={
          <Button
            variant="primary"
            size="sm"
            onClick={() => void myCoursesQuery.refetch()}
          >
            تلاش مجدد
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header with Add Course CTA */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-h1 text-[var(--color-text)]">دوره‌های من</h1>
          <p className="text-[var(--color-text-muted)] mt-1 text-xs">{organization.name}</p>
        </div>

        <div className="flex items-center gap-3">
          {myCourses.length > 0 && (
            <span className="text-xs font-bold text-[#006666] dark:text-teal-200 bg-primary/10 px-3 py-1.5 rounded-full border border-primary/30">
              {myCourses.length} دوره در لیست شما
            </span>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsSelectionModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            افزودن دوره
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {myCourses.length === 0 && (
        <StateCard
          icon={BookOpen}
          title="هنوز دوره‌ای به لیست شما اضافه نشده است"
          description="دوره‌های موردنظر خود را انتخاب کنید تا در اینجا نمایش داده شوند."
          action={
            <Button
              variant="primary"
              size="md"
              onClick={() => setIsSelectionModalOpen(true)}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              افزودن دوره
            </Button>
          }
        />
      )}

      {/* Course grid */}
      {myCourses.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {myCourses.map((course) => (
            <CourseCard
              key={course.id}
              course={course}
              onDelete={() => setCourseToDelete(course)}
            />
          ))}
        </div>
      )}

      {/* Selection Modal */}
      <CourseSelectionModal
        open={isSelectionModalOpen}
        onClose={() => setIsSelectionModalOpen(false)}
        availableCourses={availableCourses}
        selectedCourseIds={myCourses.map((c) => c.id)}
        onConfirm={async (selectedIds) => {
          await syncMutation.mutateAsync(selectedIds);
        }}
        isSubmitting={syncMutation.isPending}
        isLoadingAvailable={availableCoursesQuery.isLoading}
        isErrorAvailable={availableCoursesQuery.isError}
        onRetryAvailable={() => void availableCoursesQuery.refetch()}
      />

      {/* Delete Confirmation Modal */}
      <CourseDeleteConfirmModal
        open={!!courseToDelete}
        courseTitle={courseToDelete?.title ?? ""}
        onClose={() => setCourseToDelete(null)}
        onConfirm={async () => {
          if (courseToDelete) {
            await deleteMutation.mutateAsync(courseToDelete.id);
          }
        }}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}

/**
 * Course card component with link to detail view.
 * Displays progress bar, lesson count, and delete action.
 */
function CourseCard({
  course,
  onDelete,
}: {
  course: CourseResource;
  onDelete?: () => void;
}) {
  const navigate = useNavigate();
  const progressQuery = useCourseProgress(course.id);
  const { data: productsData } = useCommerceProducts();
  const { data: entitlementsData } = useMyEntitlements();
  const { data: subData } = useMySubscription();

  const progress = progressQuery.data;
  const isProgressLoading = progressQuery.isLoading;

  const percentage =
    typeof progress?.percentage === "number" ? progress.percentage : 0;
  const totalLessons =
    typeof progress?.total_lessons === "number" ? progress.total_lessons : 0;

  // Resolve product for this course
  const courseProduct = (productsData?.items ?? []).find(
    (p) => p.target_type === "course" && p.target_id === course.id,
  );

  // Check if purchased directly
  const isPurchased = (entitlementsData?.items ?? []).some(
    (e) => e.resource_type === "course" && e.resource_id === course.id,
  );

  // Check if user has active subscription
  const hasSubscription = subData?.subscription?.status === "active";

  const handleBuyCourse = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (courseProduct) {
      navigate(`/checkout/card-to-card?productId=${encodeURIComponent(courseProduct.id)}`);
    }
  };

  return (
    <div className="bg-[var(--color-surface)] rounded-card border border-[var(--color-border)] p-5 hover:border-primary/50 shadow-sm transition-all group relative flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between mb-3">
          <div className="w-10 h-10 rounded-button bg-primary/10 border border-primary/20 text-primary flex items-center justify-center group-hover:scale-105 transition-transform">
            <GraduationCap className="w-5 h-5" />
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            {isPurchased ? (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold border border-emerald-500/30">
                خریداری شده
              </span>
            ) : hasSubscription ? (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-bold border border-primary/30">
                در دسترس با اشتراک
              </span>
            ) : courseProduct ? (
              <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300 font-bold border border-amber-500/30">
                {formatToman(courseProduct.price)}
              </span>
            ) : null}

            {course.archived && (
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-800/60">
                بایگانی شده
              </span>
            )}

            {onDelete && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete();
                }}
                className="!p-1.5 !h-auto text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10"
                title="حذف از دوره‌های من"
                aria-label="حذف از دوره‌های من"
                leftIcon={<Trash2 className="w-4 h-4" />}
              />
            )}
          </div>
        </div>

        <Link to={`/courses/${course.id}`} className="block">
          <h3 className="font-bold text-[var(--color-text)] group-hover:text-primary transition-colors line-clamp-1">
            {course.title}
          </h3>
        </Link>

        {/* Progress Bar Section */}
        <div className="mt-3.5 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--color-text-muted)] text-[11px]">پیشرفت</span>
            <span className="font-bold text-primary text-[11px]" dir="ltr">
              {isProgressLoading ? "..." : `${percentage}%`}
            </span>
          </div>
          <div
            className="w-full h-2 bg-[var(--color-surface-warm)] rounded-full overflow-hidden border border-[var(--color-border)]"
            role="progressbar"
            aria-label="پیشرفت دوره"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percentage}
          >
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${isProgressLoading ? 0 : percentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Footer Section */}
      <div className="mt-4 pt-3 border-t border-[var(--color-border)] flex items-center justify-between text-xs text-[var(--color-text-muted)]">
        <span>{isProgressLoading ? "... درس" : `${toPersianDigits(totalLessons)} درس`}</span>

        <div className="flex items-center gap-2">
          {!isPurchased && !hasSubscription && courseProduct && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleBuyCourse}
              className="!h-7 !px-2.5 !text-[11px]"
            >
              خرید دوره
            </Button>
          )}

          <Link
            to={`/courses/${course.id}`}
            className="text-primary font-semibold flex items-center gap-1 group-hover:underline"
          >
            <span>{isPurchased || hasSubscription || !courseProduct ? "ورود" : "پیش‌نمایش"}</span>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
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
    <div className="flex flex-col items-center justify-center py-20 text-center bg-[var(--color-surface)] rounded-card border border-[var(--color-border)] p-8 shadow-sm">
      <Icon className="w-12 h-12 text-[var(--color-text-muted)] mb-4" />
      <h2 className="text-lg font-bold text-[var(--color-text)]">{title}</h2>
      <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

