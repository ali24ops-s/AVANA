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
  Sparkles,
  Zap,
  PanelRightClose,
  PanelRightOpen,
  ListOrdered,
  X,
} from "lucide-react";
import { MarkdownRenderer } from "../components/markdown/MarkdownRenderer.js";
import { FlashcardExperience } from "../components/flashcards/FlashcardExperience.js";
import { QuizListView } from "../components/quiz/QuizListView.js";
import { StudyAnalyticsView } from "../components/analytics/StudyAnalyticsView.js";
import { CourseDocumentsView } from "../components/documents/CourseDocumentsView.js";
import { CourseReviewSummaryView } from "../components/documents/CourseReviewSummaryView.js";
import { ReviewQueueList } from "../components/review/ReviewQueueList.js";
import { useAuth } from "../providers/AuthProvider.js";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createLearningApi } from "../lib/api/learning.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createReviewApi } from "../lib/api/review.js";
import { StudyAssistantChat } from "../components/ai/StudyAssistantChat.js";
import { useStudySessionTracker } from "../hooks/useStudySessionTracker.js";
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
  | "review_summary"
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
    "review_summary",
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
      : undefined);

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
  // Track desktop sidebar collapse state
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  // Track mobile drawer open state
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);

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

  // Track active educational study time for lessons
  useStudySessionTracker({
    activityType: "lesson",
    courseId,
    lessonId: selectedLessonId,
    enabled: activeTab === "lessons" && Boolean(selectedLessonId),
  });

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
          icon={Zap}
          label="خلاصه مروری"
          active={activeTab === "review_summary"}
          onClick={() => setTab("review_summary")}
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
      {activeTab === "review_summary" && (
        <CourseReviewSummaryView
          organizationId={organization.id}
          courseId={courseId!}
          onNavigateToFlashcards={() => setTab("flashcards")}
          onNavigateToQuiz={() => setTab("quizzes")}
        />
      )}

      {activeTab === "flashcards" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-[var(--color-surface)] p-4 rounded-2xl border border-[var(--color-border)]">
            <span className="text-xs text-[var(--color-text-muted)]">
              می‌خواهید هدف مطالعه را تغییر داده یا سرفصل‌های خاصی را برای شب امتحان تیک بزنید؟
            </span>
            <Link
              to={`/flashcards?courses=${courseId}`}
              className="px-4 py-2 bg-[#008080]/10 hover:bg-[#008080]/20 text-[#008080] rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <span>تنظیم هدف مطالعه و انتخاب سرفصل‌ها</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <FlashcardExperience
            organizationId={organization.id}
            courseId={courseId!}
            onBack={() => setTab("lessons")}
          />
        </div>
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
        <div>
          {totalLessonsCount === 0 ? (
            <div className="w-full">
              <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-10 text-center space-y-4 shadow-sm">
                <div className="w-16 h-16 rounded-2xl bg-[#008080]/10 text-[#008080] border border-[#008080]/20 flex items-center justify-center mx-auto shadow-inner">
                  <BookOpen className="w-8 h-8" />
                </div>
                <div className="space-y-1.5 max-w-md mx-auto">
                  <h3 className="text-lg font-bold text-[var(--color-text)]">
                    هنوز محتوایی به این دوره اضافه نشده است
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                    این دوره هنوز محتوای آموزشی ندارد. برای شروع، اولین فایل PDF آموزشی خود را اضافه کنید.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setTab("documents")}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-[#008080] hover:bg-[#006666] text-white rounded-2xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>افزودن فایل PDF</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="relative flex flex-col lg:flex-row gap-6 items-start">
              {/* Mobile Drawer (Only rendered when open) */}
              {isMobileDrawerOpen && (
                <>
                  <div
                    className="lg:hidden fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 transition-opacity"
                    onClick={() => setIsMobileDrawerOpen(false)}
                    aria-hidden="true"
                  />
                  <aside
                    className="lg:hidden fixed inset-y-0 right-0 z-50 w-80 max-w-[85vw] bg-slate-900 border-l border-white/10 shadow-2xl p-4 flex flex-col animate-in slide-in-from-right duration-200"
                    aria-label="سرفصل‌های دوره (موبایل)"
                  >
                    <div className="flex items-center justify-between pb-3 border-b border-white/10">
                      <div>
                        <h2 className="font-bold text-sm text-[var(--color-text)]">
                          سرفصل‌های دوره
                        </h2>
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                          {totalLessonsCount} درس
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsMobileDrawerOpen(false)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        aria-label="بستن منوی سرفصل‌ها"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <nav className="py-3 space-y-1 overflow-y-auto flex-1 custom-scrollbar">
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
                            setIsMobileDrawerOpen(false);
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
                    </nav>
                  </aside>
                </>
              )}

              {/* Desktop Collapsible Sidebar */}
              {isSidebarOpen && (
                <aside className="hidden lg:block w-72 xl:w-80 flex-shrink-0 sticky top-24 z-20">
                  <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden shadow-sm flex flex-col max-h-[calc(100vh-8rem)]">
                    <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)] flex items-center justify-between">
                      <div>
                        <h2 className="font-bold text-sm text-[var(--color-text)]">
                          سرفصل‌های دوره
                        </h2>
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                          {totalLessonsCount} درس
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsSidebarOpen(false)}
                        title="بستن سرفصل‌ها"
                        aria-label="بستن پنل سرفصل‌ها"
                        className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      >
                        <PanelRightClose className="w-4 h-4" />
                      </button>
                    </div>
                    <nav className="p-2 space-y-1 overflow-y-auto flex-1 custom-scrollbar">
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
              )}

              {/* Main content: Lesson viewer */}
              <main className="flex-1 min-w-0 w-full">
                {selectedLesson ? (
                  <LessonViewer
                    lesson={selectedLesson}
                    moduleTitle={selectedModuleTitle}
                    courseTitle={course.title}
                    courseId={courseId}
                    onComplete={() => completeMutation.mutate(selectedLesson.id)}
                    isCompleting={completeMutation.isPending}
                    isError={completeMutation.isError}
                    errorMessage={completeMutation.error?.message}
                    prevLessonId={prevLessonId}
                    nextLessonId={nextLessonId}
                    onSelectLesson={setSelectedLessonId}
                    isSidebarOpen={isSidebarOpen}
                    onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
                    onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
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
            </div>
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
    <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-2xl bg-teal-600/20 text-teal-400 border border-teal-500/20 flex items-center justify-center flex-shrink-0 shadow-inner">
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg sm:text-xl font-extrabold text-[var(--color-text)] truncate">
              {course.title}
            </h1>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {course.subject ?? "دوره تخصصی"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap sm:flex-nowrap flex-shrink-0">
          {examDate && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-3 py-1.5 rounded-xl border border-[var(--color-border)]">
              <FileText className="w-3.5 h-3.5 text-teal-400" />
              <span>آزمون: {examDate}</span>
            </div>
          )}
          {manageLink}
        </div>
      </div>

      {/* Progress bar */}
      {progress.total_lessons > 0 && (
        <div className="mt-4 pt-3.5 border-t border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)]">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>
                {progress.completed_lessons} از {progress.total_lessons} درس تکمیل شده
              </span>
            </div>
            <span className="text-xs font-bold text-teal-400" dir="ltr">
              {progress.progress_percent}%
            </span>
          </div>
          <div
            className="w-full h-2 bg-[var(--color-surface-warm)] rounded-full overflow-hidden border border-[var(--color-border)]"
            role="progressbar"
            aria-label="پیشرفت دوره"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.progress_percent}
          >
            <div
              className="h-full bg-teal-500 rounded-full transition-all duration-500"
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
  const isAllCompleted =
    module.lessons.length > 0 && completedCount === module.lessons.length;

  return (
    <div className="rounded-xl overflow-hidden mb-1">
      {/* Module header (clickable to expand/collapse) */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? "بستن" : "باز کردن"} فصل ${module.title}`}
        className={`w-full flex items-center gap-2 px-3 py-2.5 text-right rounded-xl transition-all cursor-pointer ${
          isExpanded
            ? "bg-teal-900/20 text-teal-400 font-semibold"
            : "hover:bg-white/5 text-slate-200"
        }`}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-teal-400 flex-shrink-0 transition-transform duration-200" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200" />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-xs font-bold block truncate">
            {module.title}
          </span>
          {module.description && (
            <span className="text-[11px] text-slate-400 block truncate mt-0.5">
              {module.description}
            </span>
          )}
        </div>
        {module.lessons.length > 0 && (
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
              isAllCompleted
                ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                : completedCount > 0
                  ? "bg-white/5 text-slate-300"
                  : "text-slate-400"
            }`}
            dir="ltr"
          >
            {completedCount}/{module.lessons.length}
          </span>
        )}
      </button>

      {/* Lesson list (visible when expanded) */}
      {isExpanded && (
        <div className="mr-2 mt-1 space-y-0.5 pb-1 pr-2.5 border-r border-teal-500/20">
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
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-right rounded-xl text-xs transition-all cursor-pointer ${
        isSelected
          ? "bg-teal-500/20 text-white font-bold border-r-2 border-teal-400 shadow-xs"
          : "text-slate-300 hover:text-white hover:bg-white/5"
      }`}
    >
      {lesson.completed ? (
        <CheckCircle2
          className={`w-4 h-4 flex-shrink-0 ${
            isSelected ? "text-teal-300" : "text-teal-400/90"
          }`}
        />
      ) : (
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
            isSelected
              ? "bg-teal-400 ring-2 ring-teal-400/30"
              : "border border-slate-500/60 bg-transparent"
          }`}
        />
      )}
      <span className="truncate flex-1 text-[13px]">{lesson.title}</span>
      {lesson.estimated_minutes && (
        <span
          className={`text-[10px] flex-shrink-0 flex items-center gap-1 ${
            isSelected ? "text-teal-200/90" : "text-slate-400"
          }`}
        >
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
  courseTitle,
  courseId,
  onComplete,
  isCompleting,
  isError,
  errorMessage,
  prevLessonId,
  nextLessonId,
  onSelectLesson,
  isSidebarOpen,
  onToggleSidebar,
  onOpenMobileDrawer,
}: {
  lesson: LessonData;
  moduleTitle: string;
  courseTitle?: string;
  courseId?: string;
  onComplete: () => void;
  isCompleting: boolean;
  isError: boolean;
  errorMessage?: string;
  prevLessonId: string | null;
  nextLessonId: string | null;
  onSelectLesson: (id: string) => void;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  onOpenMobileDrawer?: () => void;
}) {
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);

  return (
    <article className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] overflow-hidden shadow-ambient">
      {/* Minimal Context & Actions Header Bar */}
      <div className="px-5 py-3 sm:px-6 sm:py-3.5 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
        <div className="flex items-center justify-between gap-3">
          {/* Breadcrumb Context (Course > Module) */}
          <div className="flex items-center gap-2 text-xs text-slate-400 font-medium min-w-0 flex-1">
            {courseTitle && (
              <span className="truncate max-w-[200px] hidden sm:inline">{courseTitle}</span>
            )}
            {courseTitle && moduleTitle && <span className="hidden sm:inline text-slate-600">/</span>}
            <span className="inline-block text-[11px] font-bold text-teal-300 bg-teal-950/40 border border-teal-500/20 px-2.5 py-0.5 rounded-lg truncate">
              {moduleTitle}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Mobile Drawer Trigger Button */}
            {onOpenMobileDrawer && (
              <button
                type="button"
                onClick={onOpenMobileDrawer}
                className="lg:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                aria-label="سرفصل‌های دوره"
              >
                <ListOrdered className="w-3.5 h-3.5 text-teal-400" />
                <span>سرفصل‌ها</span>
              </button>
            )}

            {/* Desktop Sidebar Toggle Button */}
            {onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
                title={isSidebarOpen ? "بستن سرفصل‌ها برای تمرکز بر مطالعه" : "نمایش سرفصل‌های دوره"}
                aria-label={isSidebarOpen ? "بستن سرفصل‌ها" : "نمایش سرفصل‌ها"}
              >
                {isSidebarOpen ? (
                  <>
                    <PanelRightClose className="w-3.5 h-3.5 text-teal-400" />
                    <span>تمرکز مطالعه</span>
                  </>
                ) : (
                  <>
                    <PanelRightOpen className="w-3.5 h-3.5 text-teal-400" />
                    <span>سرفصل‌ها</span>
                  </>
                )}
              </button>
            )}

            {lesson.estimated_minutes && (
              <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 bg-white/5 px-2.5 py-1.5 rounded-xl border border-white/10 flex-shrink-0">
                <Clock className="w-3.5 h-3.5 text-teal-400" />
                <span>{lesson.estimated_minutes} دقیقه</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsAssistantOpen(!isAssistantOpen)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer ${
                isAssistantOpen
                  ? "bg-purple-600 text-white shadow-purple-600/30 shadow-md"
                  : "bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isAssistantOpen ? "بستن دستیار" : "از آوانا بپرس"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Embedded Study Assistant Chat Panel */}
      {isAssistantOpen && (
        <div className="p-4 sm:p-6 bg-[var(--color-surface-warm)] border-b border-[var(--color-border)]">
          <StudyAssistantChat
            contextType="lesson"
            lessonId={lesson.id}
            courseId={courseId}
            lessonTitle={lesson.title}
            moduleTitle={moduleTitle}
            courseTitle={courseTitle}
            onClose={() => setIsAssistantOpen(false)}
            className="max-h-[550px]"
          />
        </div>
      )}

      {/* Lesson content rendered as markdown with optimal Persian reading measure */}
      <div className="p-6 sm:p-8 lg:p-10">
        <div className="max-w-4xl mx-auto prose prose-sm sm:prose-base">
          <MarkdownRenderer content={lesson.content_markdown} />
        </div>
      </div>

      {/* Completion button */}
      <div className="px-6 pb-6 pt-2 max-w-4xl mx-auto w-full space-y-3">
        {isError && (
          <div className="p-3.5 bg-red-950/40 rounded-xl border border-red-500/30 text-xs text-red-300 flex items-center gap-2 justify-center">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>خطا در ثبت وضعیت تکمیل: {errorMessage || "لطفاً دوباره تلاش کنید."}</span>
          </div>
        )}
        {lesson.completed ? (
          <div className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-2xl bg-teal-950/30 border border-teal-500/30 text-teal-300 text-sm font-bold shadow-xs">
            <CheckCircle2 className="w-5 h-5 text-teal-400" />
            <span>تکمیل شده</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={onComplete}
            disabled={isCompleting}
            className="w-full py-3.5 rounded-2xl bg-[#008080] hover:bg-[#006666] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]"
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
            className="px-4 py-2 bg-[var(--color-surface)] hover:bg-white/10 border border-[var(--color-border)] text-[var(--color-text)] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
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
            className="px-4 py-2 bg-[var(--color-surface)] hover:bg-white/10 border border-[var(--color-border)] text-[var(--color-text)] rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
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
