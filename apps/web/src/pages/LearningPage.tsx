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
import { useParams, Link, useSearchParams, useNavigate } from "react-router-dom";
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
  Lock,
  ShoppingBag,
} from "lucide-react";
import { Button, Badge } from "@avana/ui";
import { MarkdownRenderer } from "../components/markdown/MarkdownRenderer.js";
import { LessonInteractiveContent } from "../components/study/LessonInteractiveContent.js";
import { FlashcardExperience } from "../components/flashcards/FlashcardExperience.js";
import { QuizListView } from "../components/quiz/QuizListView.js";
import { StudyAnalyticsView } from "../components/analytics/StudyAnalyticsView.js";
import { CourseDocumentsView } from "../components/documents/CourseDocumentsView.js";
import { CourseReviewSummaryView } from "../components/documents/CourseReviewSummaryView.js";
import { ReviewQueueList } from "../components/review/ReviewQueueList.js";
import { SubscriptionBanner, PaywallModal } from "../components/commerce/index.js";
import { useAuth } from "../providers/AuthProvider.js";
import { useCheckout } from "../hooks/useCommerce.js";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createLearningApi } from "../lib/api/learning.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createReviewApi } from "../lib/api/review.js";
import { StudyAssistantChat } from "../components/ai/StudyAssistantChat.js";
import { useStudySessionTracker } from "../hooks/useStudySessionTracker.js";
import { ComingSoonGenerationModal } from "../components/generation/ComingSoonGenerationModal.js";
import {
  canUserGenerateContent,
  isContentManagerOrAdmin,
} from "../utils/generationPermissions.js";
import type { CourseLearnResponse } from "@avana/contracts";
import { toPersianDigits, formatPersianOf } from "@avana/domain";

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

  const { user, memberships } = useAuth();
  const isGenerationPermitted = canUserGenerateContent(user, memberships);
  const isManagerOrAdmin = isContentManagerOrAdmin(user, memberships);
  const [isComingSoonOpen, setIsComingSoonOpen] = useState(false);
  const [isCoursePaywallOpen, setIsCoursePaywallOpen] = useState(false);
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

  // Review queue query for badge count (only polled if generation is permitted)
  const reviewQueueQuery = useQuery({
    queryKey: ["review-queue", organization?.id, courseId],
    queryFn: () => reviewApi.getReviewQueue(organization!.id, courseId!),
    enabled: !!organization?.id && !!courseId && isGenerationPermitted,
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

  const rawLessonId = searchParams.get("lessonId");

  useEffect(() => {
    if (!data) return;

    // Direct lesson navigation from Library or deep links
    if (rawLessonId) {
      const targetModule = data.modules.find((module) =>
        module.lessons.some((lesson) => lesson.id === rawLessonId),
      );
      if (targetModule) {
        setSelectedLessonId(rawLessonId);
        setExpandedModules((prev) => new Set([...prev, targetModule.id]));
        return;
      }
    }

    const firstModule = data.modules.find(
      (module) => module.lessons.length > 0,
    );
    const selectionExists = data.modules.some((module) =>
      module.lessons.some((lesson) => lesson.id === selectedLessonId),
    );
    if (!selectionExists && firstModule) {
      const defaultLessonId =
        (data as any).preview?.preview_lesson_id ?? firstModule.lessons[0].id;
      setSelectedLessonId(defaultLessonId);
      const containingMod = data.modules.find((m) =>
        m.lessons.some((l) => l.id === defaultLessonId),
      );
      setExpandedModules(new Set([containingMod ? containingMod.id : firstModule.id]));
    }
  }, [data, rawLessonId, selectedLessonId]);

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
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
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
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              void refetch();
              void orgQuery.refetch();
            }}
          >
            تلاش مجدد
          </Button>
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
      {/* Course Paywall Modal for Flashcard/Quiz preview unlocks */}
      <PaywallModal
        isOpen={isCoursePaywallOpen}
        onClose={() => setIsCoursePaywallOpen(false)}
        resourceTitle={course.title}
        resourceType="course"
        availablePurchaseOptions={(data as any).access?.availablePurchaseOptions ?? []}
      />

      {/* Back link */}
      <Link
        to="/courses"
        className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--color-text-muted)] hover:text-primary transition-colors"
      >
        <ArrowRight className="w-4 h-4" />
        <span>بازگشت به دوره‌ها</span>
      </Link>

      {/* Course header with progress bar */}
      <CourseHeader
        course={course}
        progress={progress}
        access={(data as any).access}
        availablePurchaseOptions={(data as any).access?.availablePurchaseOptions}
        manageLink={
          courseId && isManagerOrAdmin ? (
            <Link
              to={`/courses/${courseId}/manage`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-primary border border-primary/30 hover:bg-primary/10 transition-colors flex-shrink-0"
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
          badge={!isGenerationPermitted ? "به‌زودی" : undefined}
          active={activeTab === "documents"}
          onClick={() => {
            if (!isGenerationPermitted) {
              setIsComingSoonOpen(true);
              return;
            }
            setTab("documents");
          }}
        />
        <TabButton
          icon={Sparkles}
          label={
            !isGenerationPermitted
              ? "صف بررسی محتوا"
              : pendingReviewCount > 0
                ? `صف بررسی محتوا (${pendingReviewCount})`
                : "صف بررسی محتوا (AI)"
          }
          badge={!isGenerationPermitted ? "به‌زودی" : undefined}
          active={activeTab === "review"}
          onClick={() => {
            if (!isGenerationPermitted) {
              setIsComingSoonOpen(true);
              return;
            }
            setTab("review");
          }}
        />
      </div>

      {/* Tab Content */}
      {activeTab === "review_summary" && (
        <CourseReviewSummaryView
          organizationId={((data?.course as any)?.organization_id) || organization.id}
          courseId={courseId!}
          modules={data?.modules}
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
              className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <span>تنظیم هدف مطالعه و انتخاب سرفصل‌ها</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <FlashcardExperience
            organizationId={((data?.course as any)?.organization_id) || organization.id}
            courseId={courseId!}
            onBack={() => setTab("lessons")}
            isPreview={(data?.course as any)?.locked === true}
            onUnlock={() => setIsCoursePaywallOpen(true)}
          />
        </div>
      )}

      {activeTab === "quizzes" && (
        <QuizListView
          organizationId={((data?.course as any)?.organization_id) || organization.id}
          courseId={courseId!}
          isPreview={(data?.course as any)?.locked === true}
          onUnlock={() => setIsCoursePaywallOpen(true)}
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
        isGenerationPermitted ? (
          <CourseDocumentsView
            organizationId={organization.id}
            courseId={courseId!}
            onNavigateToReview={() => setTab("review")}
          />
        ) : (
          <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center space-y-4 shadow-sm" dir="rtl">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto shadow-inner">
              <Clock className="w-8 h-8" />
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <div className="flex items-center justify-center gap-2">
                <h3 className="text-base font-bold text-[var(--color-text)]">
                  اسناد و منابع (به‌زودی)
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  به‌زودی
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                قابلیت تولید محتوای هوشمند به‌زودی در آوانا فعال خواهد شد. بارگذاری اسناد و استخراج خودکار سرفصل‌ها در فاز بعدی در دسترس قرار می‌گیرد.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="md"
                onClick={() => setTab("lessons")}
              >
                بازگشت به درس‌های دوره
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => setIsComingSoonOpen(true)}
              >
                اطلاعات بیشتر
              </Button>
            </div>
          </div>
        )
      )}

      {activeTab === "review" && (
        isGenerationPermitted ? (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--color-surface)] p-6 rounded-card border border-[var(--color-border)] shadow-sm">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-button bg-secondary/30 text-primary text-xs font-bold">
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
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary text-white text-xs font-bold rounded-button hover:bg-primary-hover transition-all shadow-sm flex-shrink-0"
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
        ) : (
          <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center space-y-4 shadow-sm" dir="rtl">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto shadow-inner">
              <Clock className="w-8 h-8" />
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <div className="flex items-center justify-center gap-2">
                <h3 className="text-base font-bold text-[var(--color-text)]">
                  صف بازبینی محتوا (به‌زودی)
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  به‌زودی
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                قابلیت تولید محتوای هوشمند به‌زودی در آوانا فعال خواهد شد. محیط بازبینی پیش‌نویس‌های هوش مصنوعی در حال حاضر برای کاربران عادی غیرفعال است.
              </p>
            </div>
            <div className="pt-2 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="md"
                onClick={() => setTab("lessons")}
              >
                بازگشت به درس‌های دوره
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={() => setIsComingSoonOpen(true)}
              >
                اطلاعات بیشتر
              </Button>
            </div>
          </div>
        )
      )}

      {activeTab === "lessons" && (
        <div>
          <SubscriptionBanner className="mb-6" />
          {totalLessonsCount === 0 ? (
            <div className="w-full">
              <div className="bg-[var(--color-surface)] rounded-card border border-[var(--color-border)] p-10 text-center space-y-4 shadow-sm">
                <div className="w-16 h-16 rounded-button bg-primary/10 text-primary border border-primary/20 flex items-center justify-center mx-auto shadow-inner">
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
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={() => {
                      if (!isGenerationPermitted) {
                        setIsComingSoonOpen(true);
                        return;
                      }
                      setTab("documents");
                    }}
                    leftIcon={<UploadCloud className="w-4 h-4" />}
                  >
                    {!isGenerationPermitted ? "افزودن فایل PDF (به‌زودی)" : "افزودن فایل PDF"}
                  </Button>
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
                          {toPersianDigits(totalLessonsCount)} درس
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
                  <div className="bg-[var(--color-surface)] rounded-card border border-[var(--color-border)] overflow-hidden shadow-sm flex flex-col max-h-[calc(100vh-8rem)]">
                    <div className="p-4 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)] flex items-center justify-between">
                      <div>
                        <h2 className="font-bold text-sm text-[var(--color-text)]">
                          سرفصل‌های دوره
                        </h2>
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                          {toPersianDigits(totalLessonsCount)} درس
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setIsSidebarOpen(false)}
                        title="بستن سرفصل‌ها"
                        aria-label="بستن پنل سرفصل‌ها"
                        leftIcon={<PanelRightClose className="w-4 h-4" />}
                        className="!p-1.5 !h-auto text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                      />
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
                    coursePurchaseOptions={(data as any).access?.availablePurchaseOptions}
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
      <ComingSoonGenerationModal
        isOpen={isComingSoonOpen}
        onClose={() => setIsComingSoonOpen(false)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab Button Component
// ---------------------------------------------------------------------------

function TabButton({
  icon: Icon,
  label,
  badge,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  badge?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-button text-xs font-bold transition-all whitespace-nowrap ${
        active
          ? "bg-primary text-white shadow-sm"
          : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
      }`}
    >
      <Icon className="w-4 h-4" />
      <span>{label}</span>
      {badge && (
        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
          {badge}
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Course header with progress bar
// ---------------------------------------------------------------------------

function CourseHeader({
  course,
  progress,
  access,
  availablePurchaseOptions,
  manageLink,
}: {
  course: CourseData;
  progress: CourseLearnResponse["progress"];
  access?: any;
  availablePurchaseOptions?: any[];
  manageLink?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const courseOption = availablePurchaseOptions?.find(
    (opt) => opt.type === "course",
  );
  const isCourseLocked = (course as any).locked === true || (access && access.granted === false);

  const examDate = course.exam_at
    ? new Date(course.exam_at).toLocaleDateString("fa-IR", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="bg-[var(--color-surface)] rounded-card border border-[var(--color-border)] p-5 sm:p-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-11 h-11 rounded-button bg-primary/10 text-primary border border-primary/20 flex items-center justify-center flex-shrink-0 shadow-inner">
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
          {/* Course Purchase CTA for paid unpurchased courses */}
          {isCourseLocked && courseOption && courseOption.price > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                navigate(`/checkout/card-to-card?productId=${encodeURIComponent(courseOption.productId)}`);
              }}
              leftIcon={<ShoppingBag className="w-3.5 h-3.5" />}
              className="flex-shrink-0"
            >
              خرید کل دوره — {courseOption.price.toLocaleString("fa-IR")} تومان
            </Button>
          )}

          {examDate && (
            <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-3 py-1.5 rounded-button border border-[var(--color-border)]">
              <FileText className="w-3.5 h-3.5 text-primary" />
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
              <Trophy className="w-3.5 h-3.5 text-amber-500" />
              <span>
                {formatPersianOf(progress.completed_lessons, progress.total_lessons, { suffix: "درس تکمیل شده" })}
              </span>
            </div>
            <span className="text-xs font-bold text-primary" dir="ltr">
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
              className="h-full bg-primary rounded-full transition-all duration-500"
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
    <div className="rounded-button overflow-hidden mb-1">
      {/* Module header (clickable to expand/collapse) */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? "بستن" : "باز کردن"} فصل ${module.title}`}
        className={`w-full flex items-center gap-2 px-3 py-2.5 text-right rounded-button transition-all cursor-pointer ${
          isExpanded
            ? "bg-primary/10 text-primary font-semibold"
            : "hover:bg-[var(--color-surface-warm)] text-[var(--color-text)]"
        }`}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-primary flex-shrink-0 transition-transform duration-200" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0 transition-transform duration-200" />
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
        {module.lessons.length > 0 && (
          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
              isAllCompleted
                ? "bg-primary/15 text-primary border border-primary/30"
                : completedCount > 0
                  ? "bg-[var(--color-surface-warm)] text-[var(--color-text-secondary)]"
                  : "text-[var(--color-text-muted)]"
            }`}
            dir="ltr"
          >
            {completedCount}/{module.lessons.length}
          </span>
        )}
      </button>

      {/* Lesson list (visible when expanded) */}
      {isExpanded && (
        <div className="mr-2 mt-1 space-y-0.5 pb-1 pr-2.5 border-r border-primary/20">
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
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-right rounded-button text-xs transition-all cursor-pointer ${
        isSelected
          ? "bg-primary/15 text-primary dark:text-teal-300 font-bold border-r-2 border-primary shadow-xs"
          : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
      }`}
    >
      {lesson.completed ? (
        <CheckCircle2
          className={`w-4 h-4 flex-shrink-0 ${
            isSelected ? "text-primary" : "text-primary/90"
          }`}
        />
      ) : (
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors ${
            isSelected
              ? "bg-primary ring-2 ring-primary/30"
              : "border border-[var(--color-text-muted)] bg-transparent"
          }`}
        />
      )}
      <span className="truncate flex-1 text-[13px] flex items-center gap-1.5">
        <span>{lesson.title}</span>
        {(lesson as any).locked && (
          <Lock className="w-3 h-3 text-amber-500 shrink-0" />
        )}
        {lesson.is_preview && (
          <Badge variant="info" size="sm">
            پیش‌نمایش رایگان
          </Badge>
        )}
      </span>
      {lesson.estimated_minutes && (
        <span
          className={`text-[10px] flex-shrink-0 flex items-center gap-1 ${
            isSelected ? "text-primary font-semibold" : "text-[var(--color-text-muted)]"
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
  coursePurchaseOptions,
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
  coursePurchaseOptions?: any[];
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
  const [isPaywallOpen, setIsPaywallOpen] = useState(false);

  const isLocked = (lesson as any).locked === true;

  const rawOptions: any[] =
    (lesson as any).purchase_options && (lesson as any).purchase_options.length > 0
      ? (lesson as any).purchase_options
      : (coursePurchaseOptions ?? []);

  const contentOption = rawOptions.find((opt: any) => opt.type === "content");

  return (
    <article className="bg-[var(--color-surface)] rounded-card border border-[var(--color-border)] overflow-hidden shadow-ambient">
      {/* Paywall Modal */}
      <PaywallModal
        isOpen={isPaywallOpen}
        onClose={() => setIsPaywallOpen(false)}
        resourceTitle={lesson.title}
        resourceType="lesson"
        availablePurchaseOptions={rawOptions}
      />

      {/* Minimal Context & Actions Header Bar */}
      <div className="px-5 py-3 sm:px-6 sm:py-3.5 border-b border-[var(--color-border)] bg-[var(--color-surface-warm)]">
        <div className="flex items-center justify-between gap-3">
          {/* Breadcrumb Context (Course > Module) */}
          <div className="flex items-center gap-2 text-xs text-slate-400 font-medium min-w-0 flex-1">
            {courseTitle && (
              <span className="truncate max-w-[200px] hidden sm:inline">{courseTitle}</span>
            )}
            {courseTitle && moduleTitle && <span className="hidden sm:inline text-slate-600">/</span>}
            <span className="inline-block text-[11px] font-bold text-primary dark:text-teal-300 bg-primary/10 border border-primary/20 px-2.5 py-0.5 rounded-button truncate">
              {moduleTitle}
            </span>
            {lesson.is_preview && (
              <Badge variant="info" size="sm" icon={<Sparkles className="w-3 h-3" />}>
                پیش‌نمایش رایگان
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Mobile Drawer Trigger Button */}
            {onOpenMobileDrawer && (
              <Button
                variant="tertiary"
                size="sm"
                onClick={onOpenMobileDrawer}
                aria-label="سرفصل‌های دوره"
                leftIcon={<ListOrdered className="w-3.5 h-3.5 text-primary" />}
                className="lg:hidden"
              >
                سرفصل‌ها
              </Button>
            )}

            {/* Desktop Sidebar Toggle Button */}
            {onToggleSidebar && (
              <Button
                variant="tertiary"
                size="sm"
                onClick={onToggleSidebar}
                title={isSidebarOpen ? "بستن سرفصل‌ها برای تمرکز بر مطالعه" : "نمایش سرفصل‌های دوره"}
                aria-label={isSidebarOpen ? "بستن سرفصل‌ها" : "نمایش سرفصل‌ها"}
                leftIcon={
                  isSidebarOpen ? (
                    <PanelRightClose className="w-3.5 h-3.5 text-primary" />
                  ) : (
                    <PanelRightOpen className="w-3.5 h-3.5 text-primary" />
                  )
                }
                className="hidden lg:inline-flex"
              >
                {isSidebarOpen ? "تمرکز مطالعه" : "سرفصل‌ها"}
              </Button>
            )}

            {lesson.estimated_minutes && (
              <div className="hidden md:flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] bg-[var(--color-surface)] px-2.5 py-1.5 rounded-button border border-[var(--color-border)] flex-shrink-0">
                <Clock className="w-3.5 h-3.5 text-primary" />
                <span>{lesson.estimated_minutes} دقیقه</span>
              </div>
            )}

            <Button
              variant={isAssistantOpen ? "secondary-purple" : "outline"}
              size="sm"
              onClick={() => setIsAssistantOpen(!isAssistantOpen)}
              leftIcon={<Sparkles className="w-3.5 h-3.5" />}
            >
              {isAssistantOpen ? "بستن دستیار" : "از آوانا بپرس"}
            </Button>
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

      {/* Free Preview Banner */}
      {(lesson as any).is_preview && (
        <div className="mx-6 sm:mx-8 lg:mx-10 mt-6 p-4 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-teal-500/20 text-teal-600 dark:text-teal-400">
              <Sparkles className="w-5 h-5" />
            </span>
            <div>
              <h4 className="font-bold text-sm text-[var(--color-text)]">
                پیش‌نمایش رایگان این دوره آموزشی
              </h4>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                شما در حال مطالعه جلسه نمونه رایگان هستید. برای دسترسی به همه سرفصل‌ها و آزمون‌ها، دوره را تهیه کنید.
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsPaywallOpen(true)}
            leftIcon={<Zap className="w-3.5 h-3.5 fill-current text-amber-300" />}
          >
            خرید و فعال‌سازی دوره
          </Button>
        </div>
      )}

      {/* Lesson content rendered with interactive text selection & annotations */}
      <div className="p-6 sm:p-8 lg:p-10">
        <div className="max-w-4xl mx-auto prose prose-sm sm:prose-base">
          <LessonInteractiveContent
            lessonId={lesson.id}
            courseId={courseId}
            lessonTitle={lesson.title}
            moduleTitle={moduleTitle}
            courseTitle={courseTitle}
            content={lesson.content_markdown}
          />
        </div>
      </div>

      {/* Completion button or Paywall CTA */}
      <div className="px-6 pb-6 pt-2 max-w-4xl mx-auto w-full space-y-3">
        {isError && (
          <div className="p-3.5 bg-red-950/40 rounded-button border border-red-500/30 text-xs text-red-300 flex items-center gap-2 justify-center">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>خطا در ثبت وضعیت تکمیل: {errorMessage || "لطفاً دوباره تلاش کنید."}</span>
          </div>
        )}
        {isLocked ? (
          <div className="p-5 sm:p-6 rounded-card bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-purple-500/10 border border-amber-400/30 text-center space-y-3.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400/20 text-amber-300 text-xs font-bold">
              <Lock className="w-3.5 h-3.5" />
              <span>محتوای ویژه آوانا پلاس</span>
            </div>
            <h4 className="font-bold text-sm sm:text-base text-[var(--color-text)]">
              برای دسترسی به متن کامل این درسنامه، اشتراک تهیه کرده یا این محتوا را مستقلاً خریداری کنید
            </h4>
            <div className="flex items-center justify-center gap-2.5 flex-wrap pt-1">
              <Button
                variant="primary"
                size="md"
                onClick={() => setIsPaywallOpen(true)}
                leftIcon={<Zap className="w-4 h-4 fill-current text-amber-300" />}
              >
                مشاهده گزینه‌های خرید و دسترسی
              </Button>
              {contentOption && (
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => setIsPaywallOpen(true)}
                  leftIcon={<FileText className="w-4 h-4" />}
                >
                  خرید تکی درسنامه ({contentOption.price.toLocaleString("fa-IR")} تومان)
                </Button>
              )}
            </div>
          </div>
        ) : lesson.completed ? (
          <div className="flex items-center justify-center gap-2.5 w-full py-3.5 rounded-button bg-primary/10 border border-primary/25 text-primary dark:text-teal-300 text-sm font-bold shadow-xs">
            <CheckCircle2 className="w-5 h-5 text-primary" />
            <span>تکمیل شده</span>
          </div>
        ) : (
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={onComplete}
            disabled={isCompleting}
            isLoading={isCompleting}
            leftIcon={<CheckCircle2 className="w-5 h-5" />}
          >
            ثبت به عنوان خوانده‌شده
          </Button>
        )}

        {(lesson as any).is_preview && (
          <div className="p-6 sm:p-7 rounded-2xl bg-gradient-to-br from-teal-500/15 via-indigo-500/10 to-purple-500/15 border border-teal-500/30 text-center space-y-4 shadow-sm mt-4">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-400/20 text-teal-600 dark:text-teal-300 text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>پایان جلسه نمونه رایگان</span>
            </div>
            <h4 className="text-base sm:text-lg font-bold text-[var(--color-text)]">
              از این مبحث لذت بردید؟ کل این دوره آموزشی را آزاد کنید!
            </h4>
            <p className="text-xs sm:text-sm text-[var(--color-text-secondary)] max-w-xl mx-auto leading-relaxed">
              با تهیه این دوره به تمام درسنامه‌های تخصصی، فلش‌کارت‌های هوشمند لایتنر، آزمون‌های آزمایشی استاندارد و دستیار هوش مصنوعی آوانا دسترسی نامحدود پیدا می‌کنید.
            </p>
            <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
              <Button
                variant="primary"
                size="md"
                onClick={() => setIsPaywallOpen(true)}
                leftIcon={<Zap className="w-4 h-4 fill-current text-amber-300" />}
              >
                مشاهده گزینه‌های خرید و ثبت‌نام
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Navigation footer */}
      <div className="px-6 py-4 bg-[var(--color-surface-warm)] border-t border-[var(--color-border)] flex items-center justify-between gap-4">
        {prevLessonId ? (
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => onSelectLesson(prevLessonId)}
            leftIcon={<ChevronRight className="w-4 h-4" />}
          >
            درس قبلی
          </Button>
        ) : (
          <div />
        )}
        {nextLessonId ? (
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => onSelectLesson(nextLessonId)}
            rightIcon={<ChevronLeft className="w-4 h-4" />}
          >
            درس بعدی
          </Button>
        ) : (
          <div />
        )}
      </div>
    </article>
  );
}
