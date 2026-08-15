/**
 * Learning page — course learning experience.
 *
 * Displays:
 * - Top header with course metadata, progress, and study hub tabs:
 *   - Lessons (two-panel curriculum + markdown viewer)
 *   - Flashcards (spaced-repetition study)
 *   - Quizzes (interactive quiz taking & results)
 *   - Analytics & Recommendations (mastery metrics, weak areas, smart next steps)
 * - "Manage Content" entry point for authorized course managers
 */

import { useEffect, useState } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Loader2,
  AlertCircle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Clock,
  FileText,
  Trophy,
  Layers,
  HelpCircle,
  BarChart3,
  UploadCloud,
} from "lucide-react";
import { MarkdownRenderer } from "../components/markdown/MarkdownRenderer.js";
import { FlashcardExperience } from "../components/flashcards/FlashcardExperience.js";
import { QuizListView } from "../components/quiz/QuizListView.js";
import { StudyAnalyticsView } from "../components/analytics/StudyAnalyticsView.js";
import { CourseDocumentsView } from "../components/documents/CourseDocumentsView.js";
import { ReviewQueueList } from "../components/review/ReviewQueueList.js";
import { useAuth } from "../providers/AuthProvider.js";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createLearningApi } from "../lib/api/learning.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createReviewApi } from "../lib/api/review.js";
import { Sparkles } from "lucide-react";
import type { CourseLearnResponse } from "@avana/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CourseData = CourseLearnResponse["course"];
type ModuleData = CourseLearnResponse["modules"][number];
type LessonData = ModuleData["lessons"][number];

type LearningTab =
  | "lessons"
  | "flashcards"
  | "quizzes"
  | "analytics"
  | "documents"
  | "review";

// ---------------------------------------------------------------------------
// Hook: fetch learning data
// ---------------------------------------------------------------------------

function useCourseLearning(courseId: string | undefined) {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const learningApi = createLearningApi(apiClient);

  return useQuery({
    queryKey: ["course-learning", courseId],
    queryFn: () => learningApi.getCourseLearning(courseId!),
    enabled: !!courseId,
  });
}

function useOrganization() {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const orgApi = createOrganizationApi(apiClient);

  return useQuery({
    queryKey: ["organizations"],
    queryFn: () => orgApi.listOrganizations(),
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LearningPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab") as LearningTab;
  const validTabs: LearningTab[] = [
    "lessons",
    "flashcards",
    "quizzes",
    "analytics",
    "documents",
    "review",
  ];
  const activeTab: LearningTab = validTabs.includes(rawTab) ? rawTab : "lessons";

  const { memberships } = useAuth();
  const orgQuery = useOrganization();
  const organization =
    orgQuery.data?.items?.[0] ||
    (memberships && memberships.length > 0
      ? { id: memberships[0].organization_id, name: "سازمان یادگیری" }
      : { id: "00000000-0000-0000-0000-000000000010", name: "سازمان یادگیری آوانا" });

  const { data, isLoading, isError, error, refetch } = useCourseLearning(courseId);
  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const learningApi = createLearningApi(apiClient);
  const reviewApi = createReviewApi(apiClient);

  // Review queue query for badge count
  const reviewQueueQuery = useQuery({
    queryKey: ["review-queue", organization?.id, courseId],
    queryFn: () => reviewApi.getReviewQueue(organization!.id, courseId!),
    enabled: !!organization?.id && !!courseId,
    refetchInterval: 5000,
  });
  const pendingReviewCount = reviewQueueQuery.data?.pending?.length ?? 0;

  // Track which modules are expanded in the sidebar
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    new Set(),
  );
  // Track the currently selected lesson
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);

  useEffect(() => {
    const firstModule = data?.modules.find(
      (module) => module.lessons.length > 0,
    );
    const selectionExists = data?.modules.some((module) =>
      module.lessons.some((lesson) => lesson.id === selectedLessonId),
    );
    if (!selectionExists && firstModule) {
      setSelectedLessonId(firstModule.lessons[0].id);
      setExpandedModules(new Set([firstModule.id]));
    }
  }, [data, selectedLessonId]);

  // --- Mutation: mark lesson as completed (optimistic UI) ---
  const completeMutation = useMutation({
    mutationFn: (lessonId: string) =>
      learningApi.markLessonComplete(courseId!, lessonId),
    onMutate: async (lessonId: string) => {
      await queryClient.cancelQueries({
        queryKey: ["course-learning", courseId],
      });
      const previous = queryClient.getQueryData<CourseLearnResponse>([
        "course-learning",
        courseId,
      ]);
      if (previous) {
        const lessonWasCompleted = previous.modules.some((module) =>
          module.lessons.some(
            (lesson) => lesson.id === lessonId && lesson.completed,
          ),
        );
        const completedLessons = lessonWasCompleted
          ? previous.progress.completed_lessons
          : previous.progress.completed_lessons + 1;
        const updated: CourseLearnResponse = {
          ...previous,
          modules: previous.modules.map((mod) => ({
            ...mod,
            lessons: mod.lessons.map((lesson) =>
              lesson.id === lessonId
                ? {
                    ...lesson,
                    completed: true,
                    completed_at: new Date().toISOString(),
                  }
                : lesson,
            ),
          })),
          progress: {
            ...previous.progress,
            completed_lessons: completedLessons,
            progress_percent:
              previous.progress.total_lessons > 0
                ? Math.round(
                    (completedLessons / previous.progress.total_lessons) * 100,
                  )
                : 0,
          },
        };
        queryClient.setQueryData(["course-learning", courseId], updated);
      }
      return { previous };
    },
    onError: (_err: Error, _lessonId: string, context) => {
      if (context?.previous) {
        queryClient.setQueryData(
          ["course-learning", courseId],
          context.previous,
        );
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ["course-learning", courseId],
      });
      if (organization?.id) {
        void queryClient.invalidateQueries({
          queryKey: ["study-analytics", organization.id, courseId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["study-recommendations", organization.id, courseId],
        });
      }
    },
  });

  const setTab = (tab: LearningTab) => {
    setSearchParams(tab === "lessons" ? {} : { tab });
  };

  // Loading state
  if (isLoading || orgQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#008080]" />
      </div>
    );
  }

  // Error state
  if (isError || !data || !organization) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-8">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-lg font-bold text-[var(--color-text)]">
          خطا در بارگذاری محتوای دوره
        </h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-sm">
          {(error as Error)?.message ?? "خطایی در دریافت اطلاعات رخ داد."}
        </p>
        <div className="flex items-center gap-3 mt-5">
          <button
            type="button"
            onClick={() => {
              void refetch();
              void orgQuery.refetch();
            }}
            className="px-5 py-2.5 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            تلاش مجدد
          </button>
          <Link
            to="/courses"
            className="px-5 py-2.5 bg-[var(--color-surface-warm)] hover:bg-[var(--color-border)] text-[var(--color-text)] border border-[var(--color-border)] rounded-xl text-xs font-bold transition-all"
          >
            بازگشت به دوره‌ها
          </Link>
        </div>
      </div>
    );
  }

  const { course, modules, progress } = data;

  const totalLessonsCount = modules.reduce(
    (sum: number, m: ModuleData) => sum + m.lessons.length,
    0,
  );

  // Find selected lesson
  let selectedLesson: LessonData | null = null;
  let selectedModuleTitle = "";
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      if (lesson.id === selectedLessonId) {
        selectedLesson = lesson;
        selectedModuleTitle = mod.title;
        break;
      }
    }
    if (selectedLesson) break;
  }

  // Find all lessons sequentially
  const allLessons: { id: string; title: string }[] = [];
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      allLessons.push({ id: lesson.id, title: lesson.title });
    }
  }

  const currentLessonIdx = allLessons.findIndex((l) => l.id === selectedLessonId);
  const prevLessonId = currentLessonIdx > 0 ? allLessons[currentLessonIdx - 1].id : null;
  const nextLessonId =
    currentLessonIdx >= 0 && currentLessonIdx < allLessons.length - 1
      ? allLessons[currentLessonIdx + 1].id : null;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/courses"
        className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)] hover:text-[#008080] transition-colors"
      >
        <ArrowRight className="w-4 h-4" />
        <span>بازگشت به دوره‌ها</span>
      </Link>

      {/* Course header with progress bar */}
      <CourseHeader
        course={course}
        progress={progress}
        manageLink={
          courseId ? (
            <Link
              to={`/courses/${courseId}/manage`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-[#008080] border border-[#008080]/30 hover:bg-[#008080]/10 transition-colors flex-shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>مدیریت محتوا و سرفصل‌ها</span>
            </Link>
          ) : null
        }
      />

      {/* Primary Study Navigation Tabs */}
      <div
        role="tablist"
        aria-label="بخش‌های آموزشی دوره"
        className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2 overflow-x-auto"
      >
        <TabButton
          icon={BookOpen}
          label="درس‌ها"
          active={activeTab === "lessons"}
          onClick={() => setTab("lessons")}
        />
        <TabButton
          icon={Layers}
          label="فلش‌کارت‌ها"
          active={activeTab === "flashcards"}
          onClick={() => setTab("flashcards")}
        />
        <TabButton
          icon={HelpCircle}
          label="آزمون‌ها"
          active={activeTab === "quizzes"}
          onClick={() => setTab("quizzes")}
        />
        <TabButton
          icon={BarChart3}
          label="تحلیل و گام‌های بعدی"
          active={activeTab === "analytics"}
          onClick={() => setTab("analytics")}
        />
        <TabButton
          icon={UploadCloud}
          label="منابع و اسناد (PDF)"
          active={activeTab === "documents"}
          onClick={() => setTab("documents")}
        />
        <TabButton
          icon={Sparkles}
          label={
            pendingReviewCount > 0
              ? `صف بررسی محتوا (${pendingReviewCount})`
              : "صف بررسی محتوا (AI)"
          }
          active={activeTab === "review"}
          onClick={() => setTab("review")}
        />
      </div>

      {/* Tab Content */}
      {activeTab === "flashcards" && (
        <FlashcardExperience
          organizationId={organization.id}
          courseId={courseId!}
          onBack={() => setTab("lessons")}
        />
      )}

      {activeTab === "quizzes" && (
        <QuizListView
          organizationId={organization.id}
          courseId={courseId!}
        />
      )}

      {activeTab === "analytics" && (
        <StudyAnalyticsView
          organizationId={organization.id}
          courseId={courseId!}
          onNavigateToTab={(t) => setTab(t)}
        />
      )}

      {activeTab === "documents" && (
        <CourseDocumentsView
          organizationId={organization.id}
          courseId={courseId!}
          onNavigateToReview={() => setTab("review")}
        />
      )}

      {activeTab === "review" && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--color-surface)] p-6 rounded-3xl border border-[var(--color-border)] shadow-sm">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-[#a7d0e6]/30 text-[#008080] text-xs font-bold">
                <Sparkles className="w-4 h-4" />
                <span>بررسی و تایید پیش‌نویس‌های هوش مصنوعی</span>
              </div>
              <h2 className="text-lg font-bold text-[var(--color-text)]">
                صف بررسی و انتشار محتوای تولیدشده
              </h2>
              <p className="text-xs text-[var(--color-text-muted)]">
                پیش‌نویس درس‌ها، فلش‌کارت‌ها و آزمون‌های استخراج‌شده از منابع درسی را بررسی، ویرایش یا تایید کنید.
              </p>
            </div>
            <Link
              to={`/courses/${courseId}/manage?tab=review`}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#008080] text-white text-xs font-bold rounded-xl hover:bg-[#006666] transition-all shadow-sm flex-shrink-0"
            >
              <span>مدیریت کامل محتوا و سرفصل‌ها</span>
              <ChevronLeft className="w-4 h-4" />
            </Link>
          </div>

          <ReviewQueueList
            organizationId={organization.id}
            courseId={courseId!}
          />
        </div>
      )}

      {activeTab === "lessons" && (
        <div className="flex flex-col lg:flex-row gap-6">
          {totalLessonsCount === 0 ? (
            <div className="w-full space-y-6">
              <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-8 text-center space-y-3 shadow-sm">
                <div className="w-12 h-12 rounded-2xl bg-[#a7d0e6]/30 text-[#008080] flex items-center justify-center mx-auto">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-[var(--color-text)]">
                  هنوز درسی در دسترس نیست
                </h3>
                <p className="text-xs text-[var(--color-text-muted)] max-w-md mx-auto leading-relaxed">
                  برای شروع یادگیری، فایل جزوه یا اسلاید درسی (PDF) خود را از کادر زیر بارگذاری نمایید تا درس‌ها، فلش‌کارت‌ها و آزمون‌ها به‌صورت هوشمند تولید شوند.
                </p>
              </div>

              <CourseDocumentsView
                organizationId={organization.id}
                courseId={courseId!}
              />
            </div>
          ) : (
            <>
              {/* Sidebar: Module accordion + lesson navigation */}
              <aside className="w-full lg:w-80 xl:w-96 flex-shrink-0">
                <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden sticky top-20">
                  <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
                    <h2 className="font-bold text-sm text-[var(--color-text)]">
                      سرفصل‌های دوره
                    </h2>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      {totalLessonsCount} درس
                    </p>
                  </div>
                  <nav className="p-2 space-y-1 max-h-[calc(100vh-16rem)] overflow-y-auto">
                    {modules.map((mod) => (
                      <ModuleSection
                        key={mod.id}
                        module={mod}
                        isExpanded={expandedModules.has(mod.id)}
                        selectedLessonId={selectedLessonId}
                        onToggle={() => {
                          setExpandedModules((prev) => {
                            const next = new Set(prev);
                            if (next.has(mod.id)) {
                              next.delete(mod.id);
                            } else {
                              next.add(mod.id);
                            }
                            return next;
                          });
                        }}
                        onSelectLesson={(lessonId: string) => {
                          setSelectedLessonId(lessonId);
                          if (!expandedModules.has(mod.id)) {
                            setExpandedModules((prev) => {
                              const next = new Set(prev);
                              next.add(mod.id);
                              return next;
                            });
                          }
                        }}
                      />
                    ))}
                    {modules.length === 0 && (
                      <div className="p-4 text-center text-xs text-[var(--color-text-muted)]">
                        هنوز فصلی وجود ندارد.
                      </div>
                    )}
                  </nav>
                </div>
              </aside>

              {/* Main content: Lesson viewer */}
              <main className="flex-1 min-w-0">
                {selectedLesson ? (
                  <LessonViewer
                    lesson={selectedLesson}
                    moduleTitle={selectedModuleTitle}
                    onComplete={() => completeMutation.mutate(selectedLesson.id)}
                    isCompleting={completeMutation.isPending}
                    isError={completeMutation.isError}
                    errorMessage={completeMutation.error?.message}
                    prevLessonId={prevLessonId}
                    nextLessonId={nextLessonId}
                    onSelectLesson={setSelectedLessonId}
                  />
                ) : (
                  <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center">
                    <BookOpen className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-4" />
                    <h2 className="text-lg font-bold text-[var(--color-text)]">
                      یک درس را انتخاب کنید
                    </h2>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">
                      برای شروع یادگیری، یک درس را از فهرست کناری انتخاب کنید.
                    </p>
                  </div>
                )}
              </main>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Button Component
// ---------------------------------------------------------------------------

function TabButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
        active
          ? "bg-[#008080] text-white shadow-sm"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
      }`}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Course header with progress bar
// ---------------------------------------------------------------------------

function CourseHeader({
  course,
  progress,
  manageLink,
}: {
  course: CourseData;
  progress: CourseLearnResponse["progress"];
  manageLink?: React.ReactNode;
}) {
  const examDate = course.exam_at
    ? new Date(course.exam_at).toLocaleDateString("fa-IR", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-6 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#a7d0e6]/30 text-[#008080] flex items-center justify-center flex-shrink-0">
            <BookOpen className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-[var(--color-text)] truncate">
              {course.title}
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {course.subject ?? "دوره تخصصی"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {examDate && (
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-3 py-1.5 rounded-xl border border-[var(--color-border)]">
              <FileText className="w-3.5 h-3.5 text-[#008080]" />
              <span>آزمون: {examDate}</span>
            </div>
          )}
          {manageLink}
        </div>
      </div>

      {/* Progress bar */}
      {progress.total_lessons > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>
                {progress.completed_lessons} از {progress.total_lessons} درس تکمیل شده
              </span>
            </div>
            <span className="text-xs font-bold text-[#008080]" dir="ltr">
              {progress.progress_percent}%
            </span>
          </div>
          <div
            className="w-full h-2.5 bg-[var(--color-surface-warm)] rounded-full overflow-hidden border border-[var(--color-border)]"
            role="progressbar"
            aria-label="پیشرفت دوره"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.progress_percent}
          >
            <div
              className="h-full bg-[#008080] rounded-full transition-all duration-500"
              style={{ width: `${progress.progress_percent}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module section (accordion)
// ---------------------------------------------------------------------------

function ModuleSection({
  module,
  isExpanded,
  selectedLessonId,
  onToggle,
  onSelectLesson,
}: {
  module: ModuleData;
  isExpanded: boolean;
  selectedLessonId: string | null;
  onToggle: () => void;
  onSelectLesson: (lessonId: string) => void;
}) {
  const completedCount = module.lessons.filter((l) => l.completed).length;

  return (
    <div className="rounded-xl overflow-hidden">
      {/* Module header (clickable to expand/collapse) */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? "بستن" : "باز کردن"} فصل ${module.title}`}
        className={`w-full flex items-center gap-2 px-3 py-2.5 text-right rounded-xl transition-colors ${
          isExpanded
            ? "bg-[#008080]/10 text-[#008080]"
            : "hover:bg-[var(--color-surface-warm)] text-[var(--color-text)]"
        }`}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-[#008080] flex-shrink-0" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold block truncate">
            {module.title}
          </span>
          {module.description && (
            <span className="text-[11px] text-[var(--color-text-muted)] block truncate mt-0.5">
              {module.description}
            </span>
          )}
        </div>
        {completedCount > 0 && (
          <span className="text-[11px] font-bold text-[#008080] flex-shrink-0" dir="ltr">
            {completedCount}/{module.lessons.length}
          </span>
        )}
      </button>

      {/* Lesson list (visible when expanded) */}
      {isExpanded && (
        <div className="mr-2 mt-1 space-y-0.5 pb-1 pr-2 border-r-2 border-[#a7d0e6]/40">
          {module.lessons.map((lesson) => (
            <LessonNavItem
              key={lesson.id}
              lesson={lesson}
              isSelected={lesson.id === selectedLessonId}
              onSelect={() => onSelectLesson(lesson.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lesson nav item (sidebar)
// ---------------------------------------------------------------------------

function LessonNavItem({
  lesson,
  isSelected,
  onSelect,
}: {
  lesson: LessonData;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={isSelected ? "true" : undefined}
      className={`w-full flex items-center gap-2 px-3 py-2 text-right rounded-xl text-xs transition-all ${
        isSelected
          ? "bg-[#008080] text-white font-bold shadow-sm"
          : "text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
      }`}
    >
      {lesson.completed ? (
        <CheckCircle2 className={`w-4 h-4 flex-shrink-0 ${isSelected ? "text-white" : "text-green-600"}`} />
      ) : (
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSelected ? "bg-white" : "bg-[var(--color-text-muted)]"}`} />
      )}
      <span className="truncate flex-1">{lesson.title}</span>
      {lesson.estimated_minutes && (
        <span className={`text-[10px] flex-shrink-0 flex items-center gap-1 ${isSelected ? "text-white/80" : "text-[var(--color-text-muted)]"}`}>
          <Clock className="w-3 h-3" />
          <span>{lesson.estimated_minutes} دقیقه</span>
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Lesson viewer with markdown and completion button
// ---------------------------------------------------------------------------

function LessonViewer({
  lesson,
  moduleTitle,
  onComplete,
  isCompleting,
  isError,
  errorMessage,
  prevLessonId,
  nextLessonId,
  onSelectLesson,
}: {
  lesson: LessonData;
  moduleTitle: string;
  onComplete: () => void;
  isCompleting: boolean;
  isError: boolean;
  errorMessage?: string;
  prevLessonId: string | null;
  nextLessonId: string | null;
  onSelectLesson: (id: string) => void;
}) {
  return (
    <article className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] overflow-hidden shadow-sm">
      {/* Lesson header */}
      <div className="p-6 pb-4 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <span className="inline-block text-[11px] font-bold text-[#008080] bg-[#008080]/10 px-2.5 py-0.5 rounded-lg">
              {moduleTitle}
            </span>
            <h2 className="text-xl font-extrabold text-[var(--color-text)] mt-2">
              {lesson.title}
            </h2>
          </div>
          {lesson.estimated_minutes && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] px-3 py-1.5 rounded-xl border border-[var(--color-border)] flex-shrink-0">
              <Clock className="w-3.5 h-3.5 text-[#008080]" />
              <span>{lesson.estimated_minutes} دقیقه</span>
            </div>
          )}
        </div>
      </div>

      {/* Lesson content rendered as markdown */}
      <div className="p-6 sm:p-8 prose prose-sm sm:prose-base max-w-none">
        <MarkdownRenderer content={lesson.content_markdown} />
      </div>

      {/* Completion button */}
      <div className="px-6 pb-6 pt-2 space-y-3">
        {isError && (
          <div className="p-3 bg-red-50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-900/40 text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5 justify-center">
            <AlertCircle className="w-4 h-4" />
            <span>خطا در ثبت وضعیت تکمیل: {errorMessage || "لطفاً دوباره تلاش کنید."}</span>
          </div>
        )}
        {lesson.completed ? (
          <div className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-400 text-sm font-bold">
            <CheckCircle2 className="w-5 h-5" />
            <span>تکمیل شده</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onComplete}
            disabled={isCompleting}
            className="w-full py-3.5 rounded-2xl bg-[#008080] hover:bg-[#006666] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2"
          >
            {isCompleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال ذخیره...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                <span>ثبت به عنوان خوانده‌شده</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Navigation footer */}
      <div className="px-6 py-4 bg-[var(--color-surface-warm)] border-t border-[var(--color-border)] flex items-center justify-between gap-4">
        {prevLessonId ? (
          <button
            type="button"
            onClick={() => onSelectLesson(prevLessonId)}
            className="px-4 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-border)] border border-[var(--color-border)] text-[var(--color-text)] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
            <span>درس قبلی</span>
          </button>
        ) : (
          <div />
        )}
        {nextLessonId ? (
          <button
            type="button"
            onClick={() => onSelectLesson(nextLessonId)}
            className="px-4 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-border)] border border-[var(--color-border)] text-[var(--color-text)] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            <span>درس بعدی</span>
            <ChevronLeft className="w-4 h-4" />
          </button>
        ) : (
          <div />
        )}
      </div>
    </article>
  );
}
