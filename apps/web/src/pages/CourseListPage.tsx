/**
 * Course list page.
 *
 * Displays personal "My Courses" (دوره‌های من) for the current user's organization.
 * Includes initial onboarding modal for new users, "+ افزودن دوره" CTA,
 * deletion confirmation modal, and professional empty state.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  BookOpen,
  Loader2,
  AlertCircle,
  FileQuestion,
  Plus,
} from "lucide-react";
import { useAuth } from "../providers/AuthProvider.js";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createCourseApi } from "../lib/api/courses.js";
import { createLearningApi } from "../lib/api/learning.js";
import { CourseSelectionModal } from "../components/courses/CourseSelectionModal.js";
import { CourseDeleteConfirmModal } from "../components/courses/CourseDeleteConfirmModal.js";
import { CreateCourseModal } from "../components/courses/CreateCourseModal.js";
import { toPersianDigits } from "@avana/domain";
import {
  useCommerceProducts,
  useMyEntitlements,
  useMySubscription,
} from "../hooks/useCommerce.js";
import { Button } from "@avana/ui";
import { BookPlus } from "lucide-react";
import { MyCourseCardAdapter } from "../components/avana/CourseCard.js";
import type { OrganizationResource, CourseResource, CourseListResponse } from "@avana/contracts";

/**
 * Normalizes legacy organization names created with appended technical user ID slices
 * (e.g. "فضای یادگیری 79bda286") to a clean user-facing title ("فضای یادگیری").
 */
export function formatWorkspaceName(name: string | undefined | null): string {
  if (!name) return "";
  if (/^فضای یادگیری\s+[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})?$/.test(name.trim())) {
    return "فضای یادگیری";
  }
  return name;
}

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
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [hasAttemptedAutoModal, setHasAttemptedAutoModal] = useState(false);
  const [courseToDelete, setCourseToDelete] = useState<CourseResource | null>(
    null,
  );

  const navigate = useNavigate();
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
          <p className="text-[var(--color-text-muted)] mt-1 text-xs">{formatWorkspaceName(organization.name)}</p>
        </div>

        <div className="flex items-center gap-2">
          {myCourses.length > 0 && (
            <span className="text-xs font-bold text-[#006666] dark:text-teal-200 bg-primary/10 px-3 py-1.5 rounded-full border border-primary/30">
              {toPersianDigits(myCourses.length)} دوره در لیست شما
            </span>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCreateModalOpen(true)}
            leftIcon={<BookPlus className="w-4 h-4 text-[#008080]" />}
          >
            ایجاد دوره شخصی
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsSelectionModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            افزودن دوره از کتابخانه
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {myCourses.length === 0 && (
        <StateCard
          icon={BookOpen}
          title="هنوز دوره‌ای به لیست شما اضافه نشده است"
          description="می‌توانید یک دوره شخصی جدید بسازید یا دوره‌های آماده را از کتابخانه انتخاب کنید."
          action={
            <div className="flex items-center gap-3">
              <Button
                variant="primary"
                size="md"
                onClick={() => setIsCreateModalOpen(true)}
                leftIcon={<BookPlus className="w-4 h-4" />}
              >
                ایجاد دوره شخصی جدید
              </Button>
              <Button
                variant="outline"
                size="md"
                onClick={() => setIsSelectionModalOpen(true)}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                انتخاب از کتابخانه
              </Button>
            </div>
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

      {/* Create Course Modal */}
      {organization && (
        <CreateCourseModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          organizationId={organization.id}
          onCreated={(newId) => {
            void queryClient.invalidateQueries({
              queryKey: ["my-courses", organization.id],
            });
            navigate(`/courses/${newId}`);
          }}
        />
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
 * Course card wrapper for CourseListPage delegating to canonical CourseCard.
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
  const completedLessons =
    typeof progress?.completed_lessons === "number" ? progress.completed_lessons : 0;

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

  const handleBuyCourse = () => {
    if (courseProduct) {
      navigate(`/checkout/card-to-card?productId=${encodeURIComponent(courseProduct.id)}`);
    }
  };

  return (
    <MyCourseCardAdapter
      course={course}
      progress={{
        percentage,
        total_lessons: totalLessons,
        completed_lessons: completedLessons,
        isLoading: isProgressLoading,
      }}
      isPurchased={isPurchased}
      hasSubscription={hasSubscription}
      price={courseProduct?.price}
      onBuy={courseProduct ? handleBuyCourse : undefined}
      onDelete={onDelete}
    />
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

