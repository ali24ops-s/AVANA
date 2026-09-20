/**
 * Home / Dashboard page after login.
 *
 * Implements Google Stitch dark glassmorphic dashboard layout:
 *  - Greeting header with Persian date badge
 *  - Hero banner with progress bar & CTA
 *  - 4-card study stats grid (study time, completed lessons, quizzes, streak)
 *  - "My Courses" grid card list
 *  - AI Mentor sidebar card ("دستیار هوشمند آوانا")
 *  - Today's study plan & content recommendations
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useQuery, useQueries, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  GraduationCap,
  Clock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Brain,
  Flame,
  Calendar,
  ArrowLeft,
  Sparkles,
  Plus,
  X,
  AlertCircle,
  Trash2,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createCourseApi } from "../lib/api/courses.js";
import { createLearningApi } from "../lib/api/learning.js";
import { createStudyApi } from "../lib/api/study.js";
import { toPersianDigits, formatPersianOf, getWeeklyStudyComparison } from "@avana/domain";
import { Button } from "@avana/ui";
import { useAuth } from "../providers/AuthProvider.js";
import {
  useCurrentPersianDate,
  calculateDaysRemaining,
  formatPersianExamDate,
} from "../utils/date.js";
import { PersianDatePicker } from "../components/ui/PersianDatePicker.js";
import { useDailyMotivationalQuote } from "../utils/dailyQuote.js";
import { StudyAssistantModal } from "../components/ai/StudyAssistantModal.js";
import { StudyPlanner } from "../components/planner/StudyPlanner.js";
import { ExamDeleteConfirmModal } from "../components/courses/ExamDeleteConfirmModal.js";
import { CourseCard } from "../components/avana/CourseCard.js";
import { StudyActivityHeatmap } from "../components/dashboard/StudyActivityHeatmap.js";
import type { CourseResource } from "@avana/contracts";

export function HomePage() {
  const queryClient = useQueryClient();
  const { user, memberships } = useAuth();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isAddExamOpen, setIsAddExamOpen] = useState(false);
  const [selectedCourseIdForExam, setSelectedCourseIdForExam] = useState<string | undefined>();
  const [examToDelete, setExamToDelete] = useState<CourseResource | null>(null);

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const orgApi = createOrganizationApi(apiClient);
  const courseApi = createCourseApi(apiClient);
  const studyApi = createStudyApi(apiClient);

  const handleDeleteExam = async () => {
    if (!examToDelete) return;
    const targetOrgId =
      (examToDelete as { organization_id?: string })?.organization_id ||
      organization?.id;

    if (!targetOrgId) {
      throw new Error("شناسه سازمان یادگیری یافت نشد.");
    }

    await courseApi.updateCourse(targetOrgId, examToDelete.id, {
      exam_at: null,
      exam_scope: null,
    });

    await queryClient.invalidateQueries({ queryKey: ["my-courses"] });
    await queryClient.invalidateQueries({ queryKey: ["all-courses"] });
    await queryClient.invalidateQueries({ queryKey: ["course"] });
    await queryClient.invalidateQueries({ queryKey: ["daily-study-plan"] });
  };

  // Fetch real active study time for current week
  const studyTimeQuery = useQuery({
    queryKey: ["dashboard-study-time"],
    queryFn: () => studyApi.getDashboardStudyTime(),
  });

  // Fetch organization and courses for user learning status
  const orgQuery = useQuery({
    queryKey: ["organizations"],
    queryFn: () => orgApi.listOrganizations(),
  });

  const organization =
    orgQuery.data?.items?.[0] ||
    (memberships && memberships.length > 0
      ? { id: memberships[0].organization_id, name: "سازمان یادگیری" }
      : undefined);

  const coursesQuery = useQuery({
    queryKey: ["my-courses", organization?.id],
    queryFn: () => courseApi.listMyCourses(organization!.id),
    enabled: !!organization?.id,
  });

  const allCoursesQuery = useQuery({
    queryKey: ["all-courses", organization?.id],
    queryFn: () => courseApi.listCourses(organization!.id),
    enabled: !!organization?.id,
  });

  const courses = (coursesQuery.data?.items as CourseResource[] | undefined) ?? [];
  const allOrgCourses = (allCoursesQuery.data?.items as CourseResource[] | undefined) ?? [];
  const availableCourses = allOrgCourses.length > 0 ? allOrgCourses.filter((c) => !c.archived) : courses.filter((c) => !c.archived);

  // Upcoming exams: sorted by nearest date ascending (smallest days remaining first)
  const upcomingExams = courses
    .filter((c) => !!c.exam_at && !c.archived)
    .map((c) => ({
      course: c,
      daysRemaining: calculateDaysRemaining(c.exam_at!),
    }))
    .filter((item) => item.daysRemaining >= 0)
    .sort((a, b) => {
      const dateA = new Date(a.course.exam_at!).getTime();
      const dateB = new Date(b.course.exam_at!).getTime();
      return dateA - dateB;
    });

  // Filter out archived courses and sort by recency (created_at/updated_at descending)
  const activeCourses = courses.filter((c) => !c.archived);
  const sortedActive = [...activeCourses].sort((a, b) => {
    const timeA = new Date(a.updated_at || a.created_at).getTime();
    const timeB = new Date(b.updated_at || b.created_at).getTime();
    return timeB - timeA;
  });

  const primaryCourse =
    sortedActive.length > 0
      ? sortedActive[0]
      : courses.length > 0
        ? courses[0]
        : null;

  // Extract display name (prefer name if available, otherwise email prefix)
  const userDisplayName =
    user?.name && user.name.trim().length > 0
      ? user.name.trim()
      : user?.email
        ? user.email.split("@")[0]
        : "کاربر";

  const currentDate = useCurrentPersianDate();
  const dailyQuote = useDailyMotivationalQuote();

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Welcome Greeting Header & Date Badge */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-bold text-[var(--color-text)] mb-1">
            سلام {userDisplayName} 👋
          </h2>
          <p className="text-sm md:text-base text-[var(--color-text-muted)]">
            {dailyQuote}
          </p>
        </div>
        <div className="bg-[var(--color-surface)] px-4 py-2 rounded-full border border-[var(--color-border)] shadow-xs text-xs md:text-sm text-[var(--color-text)] flex items-center gap-1.5">
          <Calendar className="w-4 h-4 text-primary" />
          <span className="text-primary font-bold">{currentDate.formattedHeader}</span>
          <span>{currentDate.year}</span>
        </div>
      </div>

      {/* 2. Main 12-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left / Main Column (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {/* Hero Card / Top Courses Carousel */}
          <HeroCoursesCarousel
            courses={activeCourses}
            isLoading={coursesQuery.isLoading || orgQuery.isLoading}
          />

          {/* Stats Section: Weekly Study Time (1 col) + Activity Heatmap (3 cols) */}
          <section className="grid grid-cols-1 md:grid-cols-4 gap-4 items-stretch">
            {/* 1. Weekly Study Time Card */}
            <div className="md:col-span-1 bg-[var(--color-surface)] p-4 rounded-card border border-[var(--color-border)] shadow-xs flex flex-col items-center justify-center text-center hover:bg-[var(--color-surface-warm)] transition-colors">
              <Clock className="w-7 h-7 text-primary mb-2" />
              {studyTimeQuery.isLoading ? (
                <div className="h-7 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                </div>
              ) : (
                <span className="text-lg font-bold text-[var(--color-text)]">
                  {studyTimeQuery.data?.thisWeek?.formatted || "۰ دقیقه"}
                </span>
              )}
              <span className="text-xs text-[var(--color-text-muted)] mt-1">
                زمان مطالعه این هفته
              </span>
              {studyTimeQuery.data && !studyTimeQuery.isLoading && (
                (() => {
                  const thisWeekSec = studyTimeQuery.data.thisWeek?.seconds ?? 0;
                  const lastWeekSec = studyTimeQuery.data.lastWeek?.seconds ?? 0;
                  const lastWeekFormatted = studyTimeQuery.data.lastWeek?.formatted;
                  const comparison = getWeeklyStudyComparison(
                    thisWeekSec,
                    lastWeekSec,
                    lastWeekFormatted,
                  );

                  const colorClass =
                    comparison.type === "increase" || comparison.type === "new_start"
                      ? "text-[var(--avana-success)] font-medium"
                      : comparison.type === "decrease"
                        ? "text-[var(--avana-error)] font-medium"
                        : comparison.type === "last_week_reference"
                          ? "text-primary font-medium bg-[var(--avana-accent-soft)] px-2 py-0.5 rounded-full border border-primary/25 shadow-xs"
                          : "text-[var(--color-text-muted)]";

                  return (
                    <span
                      className={`text-[10px] mt-1.5 flex items-center justify-center gap-0.5 ${colorClass}`}
                    >
                      {comparison.text}
                    </span>
                  );
                })()
              )}
            </div>

            {/* 2. Wide Activity Heatmap Card */}
            <div className="md:col-span-3">
              <StudyActivityHeatmap
                isLoading={studyTimeQuery.isLoading}
                heatmapData={studyTimeQuery.data?.heatmap}
                className="h-full"
              />
            </div>
          </section>

          {/* Popular Courses Section (دوره‌های محبوب) */}
          <PopularCoursesSection organizationId={organization?.id} />
        </div>

        {/* Right / Side Column (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          {/* AI Mentor Card (Stitch Reference) */}
          <section
            id="assistant-section"
            className="bg-[var(--color-surface)] p-6 rounded-card border border-[var(--color-border)] shadow-card relative overflow-hidden space-y-4"
          >
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-12 h-12 rounded-card bg-[var(--avana-accent-soft)] flex items-center justify-center text-primary border border-primary/20 shrink-0">
                <Brain className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-[var(--color-text)] truncate">
                  دستیار هوشمند آوانا
                </h3>
                <span className="text-[10px] text-primary font-medium">
                  پاسخگویی هوشمند با Cloudflare AI
                </span>
              </div>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed relative z-10">
              درباره امکانات آوانا، تبدیل جزوه به درس و آزمون، روش‌های مرور و برنامه‌ریزی مطالعه از من بپرس.
            </p>
            <div className="flex items-center gap-2 relative z-10">
              <Button
                type="button"
                onClick={() => setIsChatOpen(true)}
                variant="primary"
                size="sm"
                className="flex-1"
              >
                <Sparkles className="w-4 h-4" />
                <span>از آوانا بپرس</span>
              </Button>
              {primaryCourse && (
                <Link
                  to={`/courses/${primaryCourse.id}`}
                  title="رفتن به آخرین درس"
                  className="bg-[var(--color-surface-warm)] text-[var(--color-text)] hover:bg-[var(--color-surface)] px-3 py-2 rounded-button text-xs font-medium border border-[var(--color-border)] transition-all flex items-center justify-center cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Link>
              )}
            </div>
          </section>

          {/* Today's Study Plan (Real Planner Component) */}
          <StudyPlanner />

          {/* Upcoming Exams Section (Replaced Content Recommendations) */}
          <section className="bg-[var(--color-surface)] p-6 rounded-card border border-[var(--color-border)] shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-primary" />
                <span>امتحانات پیش رو</span>
              </h3>
              <Button
                type="button"
                onClick={() => {
                  setSelectedCourseIdForExam(undefined);
                  setIsAddExamOpen(true);
                }}
                variant="secondary"
                size="sm"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>افزودن امتحان</span>
              </Button>
            </div>

            {coursesQuery.isLoading ? (
              <div className="p-6 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
              </div>
            ) : upcomingExams.length > 0 ? (
              <div className="space-y-2.5">
                {upcomingExams.map(({ course, daysRemaining }) => {
                  const formattedDate = formatPersianExamDate(course.exam_at!);
                  const urgencyTheme =
                    daysRemaining < 3
                      ? {
                          badge: "bg-[var(--avana-error-bg)] text-[var(--avana-error-text)] border-[var(--avana-error-border)]",
                          iconBox: "bg-[var(--avana-error-bg)] border-[var(--avana-error-border)] text-[var(--avana-error)]",
                        }
                      : daysRemaining < 7
                        ? {
                            badge: "bg-[var(--avana-warning-bg)] text-[var(--avana-warning-text)] border-[var(--avana-warning-border)]",
                            iconBox: "bg-[var(--avana-warning-bg)] border-[var(--avana-warning-border)] text-[var(--avana-warning)]",
                          }
                        : {
                            badge: "bg-[var(--color-primary-soft)] text-primary border-primary/20",
                            iconBox: "bg-[var(--color-primary-light)] border-primary/20 text-primary",
                          };

                  return (
                    <div
                      key={course.id}
                      className="bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] p-3.5 rounded-card border border-[var(--color-border)] hover:border-[var(--color-border-hover)] flex items-center justify-between gap-3 transition-colors group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-card flex items-center justify-center shrink-0 border ${urgencyTheme.iconBox}`}
                        >
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <Link
                            to={`/courses/${course.id}`}
                            className="text-xs font-bold text-[var(--color-text)] group-hover:text-primary transition-colors truncate block"
                            title={course.title}
                          >
                            {course.title}
                          </Link>
                          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                            تاریخ امتحان: {formattedDate}
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${urgencyTheme.badge}`}
                        >
                          {daysRemaining === 0
                            ? "امروز"
                            : `${toPersianDigits(daysRemaining)} روز باقیمانده`}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedCourseIdForExam(course.id);
                            setIsAddExamOpen(true);
                          }}
                          className="!p-1 !h-auto text-[var(--color-text-muted)] hover:text-primary transition-colors"
                          title="ویرایش تاریخ امتحان"
                          aria-label={`ویرایش امتحان ${course.title}`}
                          leftIcon={<FileText className="w-3.5 h-3.5" />}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setExamToDelete(course);
                          }}
                          className="!p-1 !h-auto text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                          title="حذف ثبت امتحان"
                          aria-label={`حذف ثبت امتحان ${course.title}`}
                          leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 flex flex-col items-center justify-center text-center p-5 rounded-card border border-dashed border-[var(--color-border)] bg-[var(--color-surface-warm)]">
                <div className="w-10 h-10 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-center text-primary mb-2.5 shadow-xs">
                  <Calendar className="w-5 h-5" />
                </div>
                <p className="text-xs font-bold text-[var(--color-text)]">
                  هیچ امتحانی ثبت نشده است
                </p>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-1 max-w-[240px] leading-relaxed">
                  با ثبت تاریخ آزمون‌ها، زمان‌بندی و مطالعه خود را مدیریت کنید.
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    setSelectedCourseIdForExam(undefined);
                    setIsAddExamOpen(true);
                  }}
                  variant="primary"
                  size="sm"
                  className="mt-3.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>افزودن امتحان</span>
                </Button>
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Floating Smart Assistant Modal */}
      <StudyAssistantModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        contextType="dashboard"
      />

      {/* Add / Edit Exam Modal */}
      <AddExamModal
        isOpen={isAddExamOpen}
        onClose={() => {
          setIsAddExamOpen(false);
          setSelectedCourseIdForExam(undefined);
        }}
        organizationId={organization?.id}
        courses={availableCourses}
        initialCourseId={selectedCourseIdForExam}
        onDeleteExam={(course) => setExamToDelete(course)}
      />

      {/* Delete Exam Confirmation Modal */}
      <ExamDeleteConfirmModal
        open={!!examToDelete}
        courseTitle={examToDelete?.title || ""}
        onClose={() => setExamToDelete(null)}
        onConfirm={handleDeleteExam}
      />
    </div>
  );
}

interface AddExamModalProps {
  isOpen: boolean;
  onClose: () => void;
  organizationId?: string;
  courses: CourseResource[];
  initialCourseId?: string;
  onDeleteExam?: (course: CourseResource) => void;
}

function AddExamModal({
  isOpen,
  onClose,
  organizationId,
  courses,
  initialCourseId,
  onDeleteExam,
}: AddExamModalProps) {
  const queryClient = useQueryClient();
  const [selectedCourseId, setSelectedCourseId] = useState(initialCourseId || "");
  const [examDate, setExamDate] = useState("");
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [isScopeExpanded, setIsScopeExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch course structure (modules & lessons) when modal is open and course is selected
  const learningApi = createLearningApi(createApiClient({ baseUrl: getApiBaseUrl() }));
  const courseLearnQuery = useQuery({
    queryKey: ["course-learn", selectedCourseId],
    queryFn: () => learningApi.getCourseLearning(selectedCourseId),
    enabled: isOpen && !!selectedCourseId,
  });

  const availableModules = courseLearnQuery.data?.modules ?? [];

  // Sync state when modal opens or initialCourseId changes
  useEffect(() => {
    if (isOpen) {
      setIsScopeExpanded(false);
      const courseId = initialCourseId || (courses.length > 0 ? courses[0].id : "");
      setSelectedCourseId(courseId);
      const found = courses.find((c) => c.id === courseId);
      if (found?.exam_at) {
        try {
          const d = new Date(found.exam_at);
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          setExamDate(`${yyyy}-${mm}-${dd}`);
        } catch {
          setExamDate("");
        }
      } else {
        setExamDate("");
      }

      if (found?.exam_scope?.moduleIds && Array.isArray(found.exam_scope.moduleIds)) {
        setSelectedModuleIds(found.exam_scope.moduleIds);
      } else {
        setSelectedModuleIds([]);
      }
      setError(null);
    }
  }, [isOpen, initialCourseId, courses]);

  // When course selection changes, prefill if that course has an exam date & scope
  const handleCourseChange = (newCourseId: string) => {
    setSelectedCourseId(newCourseId);
    const found = courses.find((c) => c.id === newCourseId);
    if (found?.exam_at) {
      try {
        const d = new Date(found.exam_at);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        setExamDate(`${yyyy}-${mm}-${dd}`);
      } catch {
        setExamDate("");
      }
    } else {
      setExamDate("");
    }

    if (found?.exam_scope?.moduleIds && Array.isArray(found.exam_scope.moduleIds)) {
      setSelectedModuleIds(found.exam_scope.moduleIds);
    } else {
      setSelectedModuleIds([]);
    }
  };

  // Keyboard Escape listener & scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCourseId) {
      setError("لطفاً یک درس را انتخاب کنید.");
      return;
    }
    if (!examDate) {
      setError("لطفاً تاریخ امتحان را مشخص کنید.");
      return;
    }

    const selectedCourse = courses.find((c) => c.id === selectedCourseId);
    const targetOrgId =
      (selectedCourse as { organization_id?: string } | undefined)
        ?.organization_id || organizationId;

    if (!targetOrgId) {
      setError("شناسه سازمان یادگیری یافت نشد.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
      const courseApi = createCourseApi(apiClient);

      const isoDate = new Date(`${examDate}T00:00:00.000Z`).toISOString();

      await courseApi.updateCourse(targetOrgId, selectedCourseId, {
        exam_at: isoDate,
        exam_scope:
          selectedModuleIds.length > 0
            ? { moduleIds: selectedModuleIds }
            : null,
      });

      // Ensure course is in user's enrolled courses list if not already
      try {
        await courseApi.addMyCourse(targetOrgId, selectedCourseId);
      } catch {
        // Ignore if already added
      }

      await queryClient.invalidateQueries({ queryKey: ["my-courses"] });
      await queryClient.invalidateQueries({ queryKey: ["all-courses"] });
      await queryClient.invalidateQueries({ queryKey: ["course"] });
      await queryClient.invalidateQueries({ queryKey: ["daily-study-plan"] });

      onClose();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "خطا در ثبت تاریخ امتحان",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--color-scrim)]/40 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-exam-modal-title"
    >
      <div className="w-full max-w-lg bg-[var(--color-surface)] border border-[var(--color-border)] rounded-dialog shadow-modal overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)] flex items-center justify-between bg-[var(--color-surface-warm)] shrink-0">
          <div className="flex items-center gap-2 text-primary">
            <GraduationCap className="w-5 h-5" />
            <h3 id="add-exam-modal-title" className="text-base font-bold text-[var(--color-text)]">
              {selectedCourse?.exam_at ? "ویرایش تاریخ و مباحث امتحان" : "افزودن تاریخ امتحان"}
            </h3>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            aria-label="بستن"
            className="!p-1 !h-auto text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            leftIcon={<X className="w-5 h-5" />}
          />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-card bg-[var(--avana-error-bg)] border border-[var(--avana-error-border)] text-[var(--avana-error)] text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Select Course */}
          <div className="space-y-1.5">
            <label
              htmlFor="exam-course-select"
              className="block text-xs font-semibold text-[var(--color-text)]"
            >
              انتخاب درس / دوره
            </label>
            {courses.length > 0 ? (
              <select
                id="exam-course-select"
                value={selectedCourseId}
                onChange={(e) => handleCourseChange(e.target.value)}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-input px-3.5 py-2.5 text-xs md:text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors cursor-pointer"
                required
              >
                <option value="">-- یک درس را انتخاب کنید --</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} {c.exam_at ? " (دارای امتحان)" : ""}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-[var(--color-text-muted)] p-3 bg-[var(--color-surface-warm)] rounded-card border border-[var(--color-border)]">
                دوره‌ای برای انتخاب موجود نیست.
              </p>
            )}
          </div>

          {/* Persian Exam Date Picker */}
          <div className="space-y-1.5">
            <PersianDatePicker
              id="exam-date-input"
              label="تاریخ برگزاری امتحان"
              value={examDate}
              onChange={(isoDate) => setExamDate(isoDate)}
              minDate={new Date()}
              required
            />
          </div>

          {/* Exam Scope (Modules Selection) */}
          <div className="pt-2 border-t border-[var(--color-border)]">
            <button
              type="button"
              onClick={() => setIsScopeExpanded((prev) => !prev)}
              aria-expanded={isScopeExpanded}
              aria-controls="exam-scope-panel"
              className="w-full flex items-center justify-between p-2.5 rounded-card bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface-hover,var(--color-border)/20)] border border-[var(--color-border)] transition-colors text-right cursor-pointer group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-[var(--color-text)] group-hover:text-primary transition-colors">
                  مباحث و سرفصل‌های امتحان (اختیاری)
                </span>
                {selectedModuleIds.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 font-bold shrink-0">
                    {toPersianDigits(selectedModuleIds.length)} مورد انتخاب شده
                  </span>
                )}
              </div>
              <ChevronDown
                className={`w-4 h-4 text-[var(--color-text-muted)] group-hover:text-[var(--color-text)] transition-transform duration-200 shrink-0 ${
                  isScopeExpanded ? "rotate-180" : ""
                }`}
              />
            </button>

            <AnimatePresence initial={false}>
              {isScopeExpanded && (
                <motion.div
                  id="exam-scope-panel"
                  key="exam-scope-content"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: "easeInOut" }}
                  className="overflow-hidden space-y-2 pt-2.5"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                      سرفصل‌هایی که در این امتحان مورد آزمون قرار می‌گیرند را مشخص کنید تا در برنامه‌ریزی روزانه اولویت فوریتی دریافت کنند.
                    </p>
                    {availableModules.length > 0 && (
                      <div className="flex items-center gap-2 shrink-0 mr-2">
                        <button
                          type="button"
                          onClick={() => setSelectedModuleIds(availableModules.map((m) => m.id))}
                          className="text-[11px] text-primary hover:underline font-medium cursor-pointer"
                        >
                          انتخاب همه
                        </button>
                        <span className="text-[var(--color-border)] text-xs">|</span>
                        <button
                          type="button"
                          onClick={() => setSelectedModuleIds([])}
                          className="text-[11px] text-[var(--color-text-muted)] hover:underline font-medium cursor-pointer"
                        >
                          حذف همه
                        </button>
                      </div>
                    )}
                  </div>

                  {courseLearnQuery.isLoading ? (
                    <div className="p-4 flex items-center justify-center bg-[var(--color-surface-warm)] rounded-card border border-[var(--color-border)]">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-xs text-[var(--color-text-muted)] mr-2">
                        در حال بارگذاری سرفصل‌های دوره...
                      </span>
                    </div>
                  ) : availableModules.length > 0 ? (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-[var(--color-surface-warm)] rounded-card border border-[var(--color-border)]">
                      {availableModules.map((m) => {
                        const isSelected = selectedModuleIds.includes(m.id);
                        const lessonCount = m.lessons?.length ?? 0;
                        return (
                          <label
                            key={m.id}
                            className={`flex items-center justify-between p-2 rounded-button border text-xs cursor-pointer transition-colors ${
                              isSelected
                                ? "bg-[var(--color-surface)] border-primary/40 text-[var(--color-text)] shadow-xs"
                                : "bg-[var(--color-surface)] border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-border)]"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedModuleIds((prev) => [...prev, m.id]);
                                  } else {
                                    setSelectedModuleIds((prev) =>
                                      prev.filter((id) => id !== m.id),
                                    );
                                  }
                                }}
                                className="rounded border-[var(--color-border)] text-primary focus:ring-primary h-4 w-4"
                              />
                              <span className="font-medium truncate">{m.title}</span>
                            </div>
                            <span className="text-[10px] text-[var(--color-text-muted)] shrink-0 mr-2">
                              {toPersianDigits(lessonCount)} درس
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--color-text-muted)] p-2.5 bg-[var(--color-surface-warm)] rounded-card border border-[var(--color-border)]">
                      {selectedCourseId
                        ? "سرفصلی برای این دوره ثبت نشده است."
                        : "ابتدا دوره مورد نظر را انتخاب کنید."}
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-between gap-3 border-t border-[var(--color-border)]">
            <div>
              {selectedCourse?.exam_at && onDeleteExam && (
                <Button
                  type="button"
                  onClick={() => {
                    onClose();
                    onDeleteExam(selectedCourse);
                  }}
                  disabled={isSubmitting}
                  variant="ghost"
                  size="sm"
                  className="!text-rose-500 hover:!text-rose-600 hover:!bg-rose-500/10"
                  leftIcon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  حذف تاریخ امتحان
                </Button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={onClose}
                variant="ghost"
                size="sm"
              >
                انصراف
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || courses.length === 0}
                isLoading={isSubmitting}
                variant="primary"
                size="sm"
              >
                ثبت امتحان
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * Shared motion variants generator for Dashboard Carousels.
 * Ensures synchronized, premium, direction-aware slide & scale transitions
 * while respecting prefers-reduced-motion.
 */
function createCarouselVariants(shouldReduceMotion: boolean | null) {
  return {
    enter: (direction: number) => ({
      x: shouldReduceMotion ? 0 : direction >= 0 ? 48 : -48,
      opacity: 0,
      scale: shouldReduceMotion ? 1 : 0.96,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        duration: shouldReduceMotion ? 0.2 : 0.45,
        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      },
    },
    exit: (direction: number) => ({
      x: shouldReduceMotion ? 0 : direction >= 0 ? -48 : 48,
      opacity: 0,
      scale: shouldReduceMotion ? 1 : 0.96,
      transition: {
        duration: shouldReduceMotion ? 0.15 : 0.3,
        ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      },
    }),
  };
}

/**
 * Popular Courses section component for Dashboard (دوره‌های محبوب).
 * Displays up to 8 top popular published courses across Avana, showing 2 courses at a time
 * with automatic rotation every 5 seconds, smooth transition, and pausing on hover.
 */
function PopularCoursesSection({
  organizationId: propOrgId,
}: {
  organizationId?: string;
}) {
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const shouldReduceMotion = useReducedMotion();
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
  const activeCourses = courses.filter((c) => !c.archived).slice(0, 8);

  // Group courses into pairs of 2
  const coursePairs: CourseResource[][] = [];
  for (let i = 0; i < activeCourses.length; i += 2) {
    coursePairs.push(activeCourses.slice(i, i + 2));
  }

  const totalGroups = coursePairs.length;
  const safeGroupIndex =
    totalGroups > 0 ? currentGroupIndex % totalGroups : 0;

  const handleDotClick = (i: number) => {
    if (i === safeGroupIndex) return;
    setDirection(i > safeGroupIndex ? 1 : -1);
    setCurrentGroupIndex(i);
  };

  // Auto-rotate every 5 seconds when more than 1 group exists and not paused
  useEffect(() => {
    if (totalGroups <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setDirection(1);
      setCurrentGroupIndex((prev) => (prev + 1) % totalGroups);
    }, 5000);

    return () => clearInterval(timer);
  }, [totalGroups, isPaused]);

  const carouselVariants = createCarouselVariants(shouldReduceMotion);

  return (
    <section
      className="space-y-4"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      data-testid="popular-courses-section"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-500" />
            <h3 className="text-lg font-bold text-[var(--color-text)]">
              دوره‌های محبوب
            </h3>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            دوره‌هایی که بیشترین استفاده و استقبال را توسط کاربران آوانا داشته‌اند
          </p>
        </div>

        <div className="flex items-center gap-3 self-end sm:self-auto">
          {totalGroups > 1 && (
            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-[11px] text-[var(--color-text-muted)] font-medium ml-1">
                {formatPersianOf(safeGroupIndex + 1, totalGroups)}
              </span>
              <div className="flex items-center gap-1">
                {coursePairs.map((_, i) => (
                  <motion.button
                    key={i}
                    type="button"
                    whileHover={{ scale: 1.25 }}
                    whileTap={{ scale: 0.85 }}
                    onClick={() => handleDotClick(i)}
                    aria-label={`رفتن به گروه ${toPersianDigits(i + 1)}`}
                    className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                      i === safeGroupIndex
                        ? "w-4 bg-primary shadow-xs"
                        : "w-1.5 bg-[var(--color-border-hover)] hover:bg-primary/50"
                    }`}
                  />
                ))}
              </div>
            </div>
          )}

          <Link
            to="/courses"
            className="text-primary text-xs font-semibold hover:underline flex items-center gap-1"
          >
            <span>مشاهده همه</span>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {popularCoursesQuery.isLoading ? (
        <div className="bg-[var(--color-surface)] p-8 rounded-card border border-[var(--color-border)] flex justify-center items-center min-h-[160px]">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : totalGroups > 0 ? (
        <div className="relative overflow-hidden min-h-[160px]">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={safeGroupIndex}
              custom={direction}
              variants={carouselVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="grid grid-cols-1 md:grid-cols-2 gap-4"
            >
              {coursePairs[safeGroupIndex].map((course) => (
                <PopularCourseCard key={course.id} course={course} />
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        <div className="bg-[var(--color-surface)] p-8 rounded-card border border-[var(--color-border)] flex flex-col items-center justify-center text-center p-6 min-h-[160px]">
          <GraduationCap className="w-8 h-8 text-[var(--color-text-muted)] mb-2" />
          <p className="text-sm text-[var(--color-text)] font-semibold">
            هنوز دوره‌ای در دسترس نیست
          </p>
          <Link
            to="/courses"
            className="mt-3 text-xs text-primary font-bold hover:underline inline-flex items-center gap-1"
          >
            <span>+ مشاهده دوره‌ها</span>
            <ChevronLeft className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </section>
  );
}

/**
 * Single Popular Course Card for Dashboard.
 */
function PopularCourseCard({ course }: { course: CourseResource }) {
  const rawCourse = course as { cover_image?: string; thumbnail_url?: string };
  return (
    <CourseCard
      id={course.id}
      title={course.title}
      subject={course.subject}
      coverImage={rawCourse.cover_image || rawCourse.thumbnail_url}
      href={`/courses/${course.id}`}
      variant="compact"
    />
  );
}

/**
 * Hero section displaying user's top completed courses in a carousel (up to 3)
 * or a clean empty state if no courses exist.
 */
function HeroCoursesCarousel({
  courses,
  isLoading,
}: {
  courses: CourseResource[];
  isLoading: boolean;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const shouldReduceMotion = useReducedMotion();

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const learningApi = createLearningApi(apiClient);

  // Fetch real progress for each course
  const progressQueries = useQueries({
    queries: courses.map((course) => ({
      queryKey: ["course-progress", course.id],
      queryFn: () => learningApi.getCourseProgress(course.id),
      enabled: !!course.id,
      staleTime: 30000,
    })),
  });

  // Combine courses with their real progress data
  const coursesWithProgress = courses.map((course, idx) => {
    const progressData = progressQueries[idx]?.data;
    const isProgressLoading = progressQueries[idx]?.isLoading ?? false;
    const percentage =
      typeof progressData?.percentage === "number"
        ? progressData.percentage
        : 0;
    const completedLessons =
      typeof progressData?.completed_lessons === "number"
        ? progressData.completed_lessons
        : 0;
    const totalLessons =
      typeof progressData?.total_lessons === "number"
        ? progressData.total_lessons
        : 0;

    return {
      course,
      percentage,
      completedLessons,
      totalLessons,
      isProgressLoading,
    };
  });

  // Sort strictly by completion rate:
  // 1. percentage descending
  // 2. completedLessons descending
  // 3. updated_at / created_at descending
  const sortedCourses = [...coursesWithProgress].sort((a, b) => {
    if (b.percentage !== a.percentage) {
      return b.percentage - a.percentage;
    }
    if (b.completedLessons !== a.completedLessons) {
      return b.completedLessons - a.completedLessons;
    }
    const timeA = new Date(a.course.updated_at || a.course.created_at).getTime();
    const timeB = new Date(b.course.updated_at || b.course.created_at).getTime();
    return timeB - timeA;
  });

  // Take strictly the Top 3 courses with highest completion
  const topCourses = sortedCourses.slice(0, 3);
  const totalCount = topCourses.length;

  // Safe index within Top 3 bounds
  const activeIndex = totalCount > 0 ? currentIndex % totalCount : 0;

  const handlePrev = () => {
    setDirection(-1);
    setCurrentIndex((prev) => (prev - 1 + totalCount) % totalCount);
  };

  const handleNext = () => {
    setDirection(1);
    setCurrentIndex((prev) => (prev + 1) % totalCount);
  };

  const handleDotClick = (i: number) => {
    if (i === activeIndex) return;
    setDirection(i > activeIndex ? 1 : -1);
    setCurrentIndex(i);
  };

  // Auto-advance rotation every 6 seconds (if more than 1 course and not paused)
  useEffect(() => {
    if (totalCount <= 1 || isPaused) return;

    const timer = setInterval(() => {
      setDirection(1);
      setCurrentIndex((prev) => (prev + 1) % totalCount);
    }, 6000);

    return () => clearInterval(timer);
  }, [totalCount, isPaused]);

  const carouselVariants = createCarouselVariants(shouldReduceMotion);

  // Loading state
  if (isLoading) {
    return (
      <section className="bg-[var(--color-surface)] rounded-card p-6 md:p-8 border border-[var(--color-border)] shadow-xs relative overflow-hidden flex items-center justify-center min-h-[250px]">
        <div className="flex flex-col items-center gap-3 text-[var(--color-text-muted)]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-xs font-medium">در حال بارگذاری دوره‌های شما...</span>
        </div>
      </section>
    );
  }

  // 0 courses: Empty State
  if (topCourses.length === 0) {
    return (
      <section className="bg-[var(--color-surface)] rounded-card p-6 md:p-8 border border-[var(--color-border)] shadow-card relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6 min-h-[250px]">
        <div className="z-10 w-full md:w-2/3 space-y-4">
          <span className="inline-block px-3 py-1 bg-[var(--avana-accent-soft)] text-primary text-xs font-semibold rounded-full border border-primary/20">
            شروع یادگیری با آوانا
          </span>

          <div>
            <h3 className="text-lg md:text-xl font-bold text-[var(--color-text)] mb-2">
              اولین دوره خود را ایجاد کنید
            </h3>
            <p className="text-xs md:text-sm text-[var(--color-text-muted)] leading-relaxed">
              هنوز دوره‌ای در حساب شما ثبت نشده است. با ایجاد یا انتخاب دوره، بسته‌های یادگیری هوشمند، فلش‌کارت‌های مرور و آزمون‌های خودسنجی برای شما فعال خواهند شد.
            </p>
          </div>

          <div className="pt-2">
            <Link
              to="/courses"
              className="w-full md:w-auto bg-primary text-[var(--color-primary-foreground)] px-6 py-2.5 rounded-button text-sm font-bold hover:opacity-90 transition-opacity inline-flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>ایجاد دوره</span>
              <ChevronLeft className="w-4 h-4" />
            </Link>
          </div>
        </div>

        <div className="z-10 w-full md:w-1/3 flex justify-center">
          <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border border-[var(--color-border)] shadow-card overflow-hidden relative bg-[var(--color-surface-warm)] flex items-center justify-center group">
            <Sparkles className="w-16 h-16 md:w-20 md:h-20 text-primary group-hover:scale-110 transition-transform duration-500" />
          </div>
        </div>
      </section>
    );
  }

  // Active top course (1, 2, or 3)
  const current = topCourses[activeIndex];

  return (
    <section
      className="bg-[var(--color-surface)] rounded-card p-6 md:p-8 border border-[var(--color-border)] shadow-card relative overflow-hidden flex flex-col md:flex-row justify-between items-center gap-6 min-h-[250px] transition-all duration-300"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="z-10 w-full md:w-2/3 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <AnimatePresence mode="wait" custom={direction} initial={false}>
              <motion.span
                key={`badge-${current.course.id}`}
                custom={direction}
                variants={carouselVariants}
                initial="enter"
                animate="center"
                exit="exit"
                className="inline-block px-3 py-1 bg-[var(--avana-accent-soft)] text-primary text-xs font-semibold rounded-full border border-primary/20 truncate"
              >
                {current.course.subject || "دوره آموزشی"}
              </motion.span>
            </AnimatePresence>
          </div>

          {/* Carousel Indicator & Controls (Shown ONLY if 2 or 3 courses exist) */}
          {totalCount > 1 && (
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[11px] text-[var(--color-text-muted)] font-medium ml-1">
                {formatPersianOf(activeIndex + 1, totalCount, { prefix: "دوره " })}
              </span>

              <div className="flex items-center gap-1">
                {topCourses.map((_, i) => (
                  <motion.button
                    key={i}
                    type="button"
                    whileHover={{ scale: 1.25 }}
                    whileTap={{ scale: 0.85 }}
                    onClick={() => handleDotClick(i)}
                    aria-label={`رفتن به دوره ${toPersianDigits(i + 1)}`}
                    className={`h-1.5 rounded-full transition-all duration-300 cursor-pointer ${
                      i === activeIndex
                        ? "w-5 bg-primary shadow-xs"
                        : "w-1.5 bg-[var(--color-border-hover)] hover:bg-primary/50"
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-1 mr-2">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handlePrev}
                  aria-label="دوره قبلی"
                  className="p-1 rounded-button bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleNext}
                  aria-label="دوره بعدی"
                  className="p-1 rounded-button bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)] transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </motion.button>
              </div>
            </div>
          )}
        </div>

        <div className="relative overflow-hidden min-h-[140px]">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={current.course.id}
              custom={direction}
              variants={carouselVariants}
              initial="enter"
              animate="center"
              exit="exit"
              className="space-y-4"
            >
              <div>
                <h3 className="text-lg md:text-xl font-bold text-[var(--color-text)] mb-1 leading-snug">
                  {current.course.title}
                </h3>
                <p className="text-xs md:text-sm text-[var(--color-text-muted)] mt-1.5 leading-relaxed">
                  {current.isProgressLoading ? (
                    <span className="inline-flex items-center gap-1.5 text-[var(--color-text-muted)]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      <span>در حال دریافت پیشرفت...</span>
                    </span>
                  ) : current.totalLessons > 0 ? (
                    formatPersianOf(current.completedLessons, current.totalLessons, { suffix: " درس تکمیل شده است." })
                  ) : (
                    "دوره در حال آماده‌سازی محتوا و دروس است."
                  )}
                </p>
              </div>

              {/* Progress bar */}
              <div className="pt-1">
                <div className="flex justify-between items-center text-xs font-medium mb-1.5">
                  <span className="text-[var(--color-text)]">میزان پیشرفت</span>
                  <span className="text-primary font-bold" dir="rtl">
                    {current.isProgressLoading
                      ? "..."
                      : `${toPersianDigits(current.percentage)}٪ تکمیل شده`}
                  </span>
                </div>
                <div
                  className="w-full h-2 bg-[var(--color-surface-warm)] rounded-full overflow-hidden border border-[var(--color-border)]"
                  role="progressbar"
                  aria-label={`میزان پیشرفت دوره ${current.course.title}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={current.percentage}
                >
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${current.isProgressLoading ? 0 : current.percentage}%` }}
                  />
                </div>
              </div>

              {/* Action Button */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  to={`/courses/${current.course.id}`}
                  className="w-full md:w-auto bg-primary text-[var(--color-primary-foreground)] px-6 py-2.5 rounded-button text-sm font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-xs cursor-pointer group"
                >
                  <span>
                    {current.percentage > 0 ? "ادامه یادگیری" : "شروع یادگیری"}
                  </span>
                  <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                </Link>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Glowing Brain / Artwork Frame */}
      <div className="z-10 w-full md:w-1/3 flex justify-center">
        <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border border-[var(--color-border)] shadow-card overflow-hidden relative bg-[var(--color-surface-warm)] flex items-center justify-center group">
          <Brain className="w-16 h-16 md:w-20 md:h-20 text-primary group-hover:scale-110 transition-transform duration-500" />
        </div>
      </div>
    </section>
  );
}


