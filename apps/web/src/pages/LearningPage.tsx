/**
 * Learning page — course learning experience.
 *
 * Displays a two-panel layout (desktop) or stacked layout (mobile):
 * - Left sidebar: Module accordion with lesson navigation
 * - Right content area: Selected lesson content rendered as markdown
 *
 * PR4 added:
 * - "Mark as complete" button on lesson viewer
 * - Course progress indicator in the header
 * - Optimistic UI update on lesson completion
 */

import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Loader2,
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  FileText,
  Trophy,
} from "lucide-react";
import { MarkdownRenderer } from "../components/markdown/MarkdownRenderer.js";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createLearningApi } from "../lib/api/learning.js";
import type { CourseLearnResponse } from "@avana/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CourseData = CourseLearnResponse["course"];
type ModuleData = CourseLearnResponse["modules"][number];
type LessonData = ModuleData["lessons"][number];

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

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LearningPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const { data, isLoading, isError, error } = useCourseLearning(courseId);
  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const learningApi = createLearningApi(apiClient);

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
      queryClient.invalidateQueries({
        queryKey: ["course-learning", courseId],
      });
    },
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // Error state
  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Failed to load course content
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {(error as Error)?.message ?? "An error occurred"}
        </p>
        <Link
          to="/courses"
          className="mt-4 px-4 py-2 bg-[var(--color-text)] text-[var(--color-background)] rounded-xl text-sm font-medium"
        >
          Back to courses
        </Link>
      </div>
    );
  }

  const { course, modules, progress } = data;

  // Find the selected lesson data
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

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to="/courses"
        className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to courses
      </Link>

      {/* Course header with progress bar */}
      <CourseHeader course={course} progress={progress} />

      {/* Two-column layout: sidebar + content */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar: Module accordion + lesson navigation */}
        <aside className="w-full lg:w-80 xl:w-96 flex-shrink-0">
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden sticky top-24">
            <div className="p-4 border-b border-[var(--color-border)]">
              <h2 className="font-semibold text-sm text-[var(--color-text)]">
                Course Content
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                {modules.reduce(
                  (sum: number, m: ModuleData) => sum + m.lessons.length,
                  0,
                )}{" "}
                lessons
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
                <div className="p-4 text-center text-sm text-[var(--color-text-muted)]">
                  No modules yet.
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
            />
          ) : (
            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-12 text-center">
              <BookOpen className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-[var(--color-text)]">
                Select a lesson
              </h2>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                Choose a lesson from the sidebar to start learning.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Course header with progress bar
// ---------------------------------------------------------------------------

function CourseHeader({
  course,
  progress,
}: {
  course: CourseData;
  progress: CourseLearnResponse["progress"];
}) {
  const examDate = course.exam_at
    ? new Date(course.exam_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <BookOpen className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-[var(--color-text)] truncate">
            {course.title}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {course.subject ?? "No subject"}
          </p>
        </div>
        {examDate && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-[var(--color-text-muted)] flex-shrink-0">
            <FileText className="w-4 h-4" />
            <span>Exam: {examDate}</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {progress.total_lessons > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>
                {progress.completed_lessons} of {progress.total_lessons} lessons
                completed
              </span>
            </div>
            <span className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">
              {progress.progress_percent}%
            </span>
          </div>
          <div
            className="w-full h-2 bg-[var(--color-background)] rounded-full overflow-hidden"
            role="progressbar"
            aria-label="Course progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress.progress_percent}
          >
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-500"
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
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-3 py-2.5 text-left rounded-xl transition-colors ${
          isExpanded
            ? "bg-indigo-50 dark:bg-indigo-950/30"
            : "hover:bg-[var(--color-border)]"
        }`}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-[var(--color-text)] block truncate">
            {module.title}
          </span>
          {module.description && (
            <span className="text-xs text-[var(--color-text-muted)] block truncate">
              {module.description}
            </span>
          )}
        </div>
        {completedCount > 0 && (
          <span className="text-xs text-indigo-600 dark:text-indigo-400 flex-shrink-0">
            {completedCount}/{module.lessons.length}
          </span>
        )}
      </button>

      {/* Lesson list (visible when expanded) */}
      {isExpanded && (
        <div className="ml-2 mt-1 space-y-0.5 pb-1">
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
      onClick={onSelect}
      className={`w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg text-sm transition-colors ${
        isSelected
          ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium"
          : "text-[var(--color-text)] hover:bg-[var(--color-border)]"
      }`}
    >
      {lesson.completed ? (
        <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)] flex-shrink-0 ml-1.5 mr-0.5" />
      )}
      <span className="truncate flex-1">{lesson.title}</span>
      {lesson.estimated_minutes && (
        <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {lesson.estimated_minutes}m
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
}: {
  lesson: LessonData;
  moduleTitle: string;
  onComplete: () => void;
  isCompleting: boolean;
}) {
  return (
    <article className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
      {/* Lesson header */}
      <div className="p-6 pb-4 border-b border-[var(--color-border)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
              {moduleTitle}
            </p>
            <h2 className="text-xl font-bold text-[var(--color-text)] mt-1">
              {lesson.title}
            </h2>
          </div>
          {lesson.estimated_minutes && (
            <div className="flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] flex-shrink-0">
              <Clock className="w-4 h-4" />
              <span>{lesson.estimated_minutes} min</span>
            </div>
          )}
        </div>
      </div>

      {/* Lesson content rendered as markdown */}
      <div className="p-6 prose prose-sm sm:prose-base max-w-none">
        <MarkdownRenderer content={lesson.content_markdown} />
      </div>

      {/* Completion button */}
      <div className="px-6 pb-6 pt-2">
        {lesson.completed ? (
          <div className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 text-green-700 dark:text-green-400 text-sm font-medium">
            <CheckCircle2 className="w-5 h-5" />
            Completed
          </div>
        ) : (
          <button
            onClick={onComplete}
            disabled={isCompleting}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-all flex items-center justify-center gap-2"
          >
            {isCompleting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Mark as complete
              </>
            )}
          </button>
        )}
      </div>
    </article>
  );
}
