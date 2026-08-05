/**
 * Course content management page (read-only with editing).
 *
 * Displays the complete course content tree for editors:
 * - Course header with title and subject
 * - Module accordion with lessons
 * - Draft / Published badges per lesson
 * - Selected lesson editor with save/publish actions
 * - New lesson creation dialog
 *
 * PR5-C1 — Read-only content tree
 * PR5-C2 — Lesson editing workflow
 * PR5-C3 — Create lesson
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
  Clock,
  Eye,
  Plus,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createContentApi } from "../lib/api/content.js";
import { LessonEditor } from "../components/content/LessonEditor.js";
import { NewLessonDialog } from "../components/content/NewLessonDialog.js";
import type {
  ContentModuleResource,
  ContentLessonResource,
} from "@avana/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ModuleData = ContentModuleResource;
type LessonData = ContentLessonResource;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseEstimatedMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return NaN;
  return num;
}

// ---------------------------------------------------------------------------
// Hook: fetch organization
// ---------------------------------------------------------------------------

function useOrganization() {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const orgApi = createOrganizationApi(apiClient);

  return useQuery({
    queryKey: ["organizations"],
    queryFn: () => orgApi.listOrganizations(),
  });
}

// ---------------------------------------------------------------------------
// Hook: fetch course content
// ---------------------------------------------------------------------------

function useCourseContent(
  organizationId: string | undefined,
  courseId: string | undefined,
) {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const contentApi = createContentApi(apiClient);

  return useQuery({
    queryKey: ["course-content", organizationId, courseId],
    queryFn: () => contentApi.getCourseContent(organizationId!, courseId!),
    enabled: !!organizationId && !!courseId,
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function CourseContentPage() {
  const { courseId } = useParams<{ courseId: string }>();

  const orgQuery = useOrganization();
  const organization = orgQuery.data?.items?.[0];
  const contentQuery = useCourseContent(organization?.id, courseId);
  const queryClient = useQueryClient();

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const contentApi = createContentApi(apiClient);

  // Track which modules are expanded in the sidebar
  const [expandedModules, setExpandedModules] = useState<Set<string>>(
    new Set(),
  );
  // Track the currently selected lesson
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  // Track which module we're creating a new lesson in (null = dialog closed)
  const [newLessonModuleId, setNewLessonModuleId] = useState<string | null>(
    null,
  );
  // Server error message for the new lesson dialog
  const [createLessonError, setCreateLessonError] = useState<string | null>(
    null,
  );

  // Create lesson mutation
  const createLessonMutation = useMutation({
    mutationFn: ({
      moduleId,
      title,
      contentMarkdown,
      estimatedMinutes,
    }: {
      moduleId: string;
      title: string;
      contentMarkdown: string;
      estimatedMinutes: string;
    }) => {
      const parsed = parseEstimatedMinutes(estimatedMinutes);
      return contentApi.createLesson(organization!.id, courseId!, moduleId, {
        title: title.trim(),
        content_markdown: contentMarkdown,
        estimated_minutes: Number.isNaN(parsed) ? null : parsed,
      });
    },
    onSuccess: (response) => {
      // Refresh course content so the new lesson appears in the sidebar
      queryClient.invalidateQueries({
        queryKey: ["course-content", organization?.id, courseId],
      });
      // Auto-select the new lesson
      setSelectedLessonId(response.lesson.id);
      // Ensure the parent module is expanded
      if (newLessonModuleId) {
        setExpandedModules((prev) => {
          const next = new Set(prev);
          next.add(newLessonModuleId);
          return next;
        });
      }
      // Close the dialog and clear any error
      setNewLessonModuleId(null);
      setCreateLessonError(null);
    },
    onError: (error: Error) => {
      setCreateLessonError(error.message ?? "Failed to create lesson");
    },
  });

  // Auto-select the first lesson when content loads
  useEffect(() => {
    const data = contentQuery.data;
    if (!data) return;
    const firstModule = data.modules.find(
      (module) => module.lessons.length > 0,
    );
    const selectionExists = data.modules.some((module) =>
      module.lessons.some((lesson) => lesson.id === selectedLessonId),
    );
    if (!selectionExists && firstModule) {
      setSelectedLessonId(firstModule.lessons[0].id);
      setExpandedModules(new Set([firstModule.id]));
    }
  }, [contentQuery.data, selectedLessonId]);

  // --- Loading state (org or content) ---
  if (orgQuery.isLoading || contentQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // --- Error loading organization ---
  if (orgQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Failed to load organization
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {orgQuery.error?.message ?? "An error occurred"}
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

  // --- No organization found ---
  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-12 h-12 text-[var(--color-text-muted)] mb-4" />
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          No organization found
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          You don't belong to any organization yet.
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

  // --- Error loading content ---
  if (contentQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Failed to load course content
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {contentQuery.error?.message ?? "An error occurred"}
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

  const data = contentQuery.data;

  // --- Not-found state ---
  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <BookOpen className="w-12 h-12 text-[var(--color-text-muted)] mb-4" />
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Course not found
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          This course could not be found or you don't have access to it.
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

  const { course, modules } = data;

  // Find the selected lesson data
  let selectedLesson: LessonData | null = null;
  let selectedModuleId = "";
  let selectedModuleTitle = "";
  for (const mod of modules) {
    for (const lesson of mod.lessons) {
      if (lesson.id === selectedLessonId) {
        selectedLesson = lesson;
        selectedModuleId = mod.id;
        selectedModuleTitle = mod.title;
        break;
      }
    }
    if (selectedLesson) break;
  }

  const totalLessons = modules.reduce(
    (sum: number, m: ModuleData) => sum + m.lessons.length,
    0,
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to={`/courses/${courseId}`}
        className="inline-flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to course
      </Link>

      {/* Course header */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
            <Eye className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-[var(--color-text)] truncate">
                {course.title}
              </h1>
              <span className="text-xs px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 flex-shrink-0">
                Content Management
              </span>
            </div>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              {course.subject ?? "No subject"}
            </p>
          </div>
        </div>
      </div>

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
                {totalLessons} lesson{totalLessons !== 1 ? "s" : ""} across{" "}
                {modules.length} module{modules.length !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Empty state */}
            {modules.length === 0 && (
              <div className="p-6 text-center">
                <BookOpen className="w-8 h-8 text-[var(--color-text-muted)] mx-auto mb-2" />
                <p className="text-sm text-[var(--color-text-muted)]">
                  No modules yet.
                </p>
              </div>
            )}

            {/* Module accordion */}
            {modules.length > 0 && (
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
                    onCreateLesson={() => {
                      setCreateLessonError(null);
                      setNewLessonModuleId(mod.id);
                    }}
                  />
                ))}
              </nav>
            )}
          </div>
        </aside>

        {/* Main content: Lesson editor */}
        <main className="flex-1 min-w-0">
          {selectedLesson && organization ? (
            <LessonEditor
              lesson={selectedLesson}
              organizationId={organization.id}
              courseId={courseId!}
              moduleId={selectedModuleId}
              moduleTitle={selectedModuleTitle}
            />
          ) : modules.length > 0 ? (
            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-12 text-center">
              <Eye className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-[var(--color-text)]">
                Select a lesson
              </h2>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                Choose a lesson from the sidebar to edit its content.
              </p>
            </div>
          ) : (
            <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-12 text-center">
              <BookOpen className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-[var(--color-text)]">
                No content yet
              </h2>
              <p className="text-sm text-[var(--color-text-muted)] mt-1">
                This course has no modules or lessons yet.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* New Lesson dialog */}
      {newLessonModuleId && organization && (
        <NewLessonDialog
          open
          moduleTitle={
            modules.find((mod) => mod.id === newLessonModuleId)?.title ?? ""
          }
          isPending={createLessonMutation.isPending}
          serverError={createLessonError}
          onSubmit={(data) => {
            createLessonMutation.mutate({
              moduleId: newLessonModuleId,
              title: data.title,
              contentMarkdown: data.contentMarkdown,
              estimatedMinutes: data.estimatedMinutes,
            });
          }}
          onClose={() => {
            if (!createLessonMutation.isPending) {
              setNewLessonModuleId(null);
              setCreateLessonError(null);
            }
          }}
        />
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
  onCreateLesson,
}: {
  module: ModuleData;
  isExpanded: boolean;
  selectedLessonId: string | null;
  onToggle: () => void;
  onSelectLesson: (lessonId: string) => void;
  onCreateLesson: () => void;
}) {
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
        <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0">
          {module.lessons.length} lesson
          {module.lessons.length !== 1 ? "s" : ""}
        </span>
      </button>

      {/* Lesson list (visible when expanded) */}
      {isExpanded && (
        <div className="ml-2 mt-1 space-y-0.5 pb-1">
          {/* New Lesson action */}
          <button
            type="button"
            onClick={onCreateLesson}
            className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-lg text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Lesson
          </button>
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
      <span className="truncate flex-1">{lesson.title}</span>
      <PublicationBadge status={lesson.publication_status} />
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
// Publication badge
// ---------------------------------------------------------------------------

function PublicationBadge({ status }: { status: "draft" | "published" }) {
  if (status === "published") {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 flex-shrink-0">
        Published
      </span>
    );
  }

  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 flex-shrink-0">
      Draft
    </span>
  );
}
