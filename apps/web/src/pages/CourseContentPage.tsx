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
  FolderPlus,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createContentApi } from "../lib/api/content.js";
import { LessonEditor } from "../components/content/LessonEditor.js";
import { NewLessonDialog } from "../components/content/NewLessonDialog.js";
import { NewModuleDialog } from "../components/content/NewModuleDialog.js";
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

  // Whether the "New Module" dialog is open
  const [newModuleOpen, setNewModuleOpen] = useState(false);
  // Server error message for the new module dialog
  const [createModuleError, setCreateModuleError] = useState<string | null>(
    null,
  );
  // The id of the module currently being edited inline (null = not editing)
  const [editingModuleId, setEditingModuleId] = useState<string | null>(null);
  // The id of the module pending deletion confirmation (null = none)
  const [deletingModuleId, setDeletingModuleId] = useState<string | null>(null);

  // Create module mutation
  const createModuleMutation = useMutation({
    mutationFn: ({
      title,
      description,
    }: {
      title: string;
      description: string;
    }) =>
      contentApi.createModule(organization!.id, courseId!, {
        title: title.trim(),
        description: description.trim() === "" ? null : description.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["course-content", organization?.id, courseId],
      });
      setNewModuleOpen(false);
      setCreateModuleError(null);
    },
    onError: (error: Error) => {
      setCreateModuleError(error.message ?? "Failed to create module");
    },
  });

  // Update module mutation (inline edit)
  const updateModuleMutation = useMutation({
    mutationFn: ({
      moduleId,
      title,
      description,
    }: {
      moduleId: string;
      title: string;
      description: string;
    }) =>
      contentApi.updateModule(organization!.id, courseId!, moduleId, {
        title: title.trim(),
        description: description.trim() === "" ? null : description.trim(),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["course-content", organization?.id, courseId],
      });
      setEditingModuleId(null);
    },
    onError: (error: Error) => {
      // Surface the error to the inline editor via the module state
      setModuleEditError(error.message ?? "Failed to update module");
    },
  });

  // Delete module mutation (soft-delete)
  const deleteModuleMutation = useMutation({
    mutationFn: (moduleId: string) =>
      contentApi.deleteModule(organization!.id, courseId!, moduleId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["course-content", organization?.id, courseId],
      });
      setDeletingModuleId(null);
    },
    onError: (error: Error) => {
      setCreateModuleError(error.message ?? "Failed to delete module");
      setDeletingModuleId(null);
    },
  });

  // Local error to show inline in the module editor
  const [moduleEditError, setModuleEditError] = useState<string | null>(null);

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
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold text-sm text-[var(--color-text)]">
                  Course Content
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setCreateModuleError(null);
                    setNewModuleOpen(true);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors flex-shrink-0"
                >
                  <FolderPlus className="w-3.5 h-3.5" />
                  New Module
                </button>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">
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
                    isEditing={editingModuleId === mod.id}
                    editError={moduleEditError}
                    isUpdating={updateModuleMutation.isPending}
                    isDeleting={deletingModuleId === mod.id}
                    isDeletePending={deleteModuleMutation.isPending}
                    onStartEdit={() => {
                      setModuleEditError(null);
                      setEditingModuleId(mod.id);
                    }}
                    onCancelEdit={() => {
                      setModuleEditError(null);
                      setEditingModuleId(null);
                    }}
                    onSaveEdit={(moduleTitle, moduleDescription) =>
                      updateModuleMutation.mutate({
                        moduleId: mod.id,
                        title: moduleTitle,
                        description: moduleDescription,
                      })
                    }
                    onDeleteModule={() => setDeletingModuleId(mod.id)}
                    onCancelDelete={() => setDeletingModuleId(null)}
                    onConfirmDelete={() =>
                      deleteModuleMutation.mutate(deletingModuleId!)
                    }
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

      {/* New Module dialog */}
      {organization && (
        <NewModuleDialog
          open={newModuleOpen}
          courseTitle={course.title}
          isPending={createModuleMutation.isPending}
          serverError={createModuleError}
          onSubmit={(data) => {
            createModuleMutation.mutate({
              title: data.title,
              description: data.description,
            });
          }}
          onClose={() => {
            if (!createModuleMutation.isPending) {
              setNewModuleOpen(false);
              setCreateModuleError(null);
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
  isEditing,
  editError,
  isUpdating,
  isDeleting,
  isDeletePending,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDeleteModule,
  onCancelDelete,
  onConfirmDelete,
}: {
  module: ModuleData;
  isExpanded: boolean;
  selectedLessonId: string | null;
  onToggle: () => void;
  onSelectLesson: (lessonId: string) => void;
  onCreateLesson: () => void;
  isEditing: boolean;
  editError: string | null;
  isUpdating: boolean;
  isDeleting: boolean;
  isDeletePending: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (title: string, description: string) => void;
  onDeleteModule: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
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

      {/* Module action buttons (edit / delete) */}
      <div className="flex items-center gap-1 px-3 pb-1">
        <button
          type="button"
          onClick={onStartEdit}
          aria-label={`Edit module ${module.title}`}
          className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onDeleteModule}
          aria-label={`Delete module ${module.title}`}
          className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Inline edit form */}
      {isEditing && (
        <ModuleEditForm
          module={module}
          isUpdating={isUpdating}
          serverError={editError}
          onCancel={onCancelEdit}
          onSave={onSaveEdit}
        />
      )}

      {/* Delete confirmation */}
      {isDeleting && (
        <div className="mx-3 mb-2 p-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20">
          <p className="text-sm text-red-700 dark:text-red-400 mb-2">
            Delete module "{module.title}"? This is permanent.
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancelDelete}
              disabled={isDeletePending}
              className="px-3 py-1.5 rounded-lg text-xs text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={isDeletePending}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
            >
              {isDeletePending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </>
              )}
            </button>
          </div>
        </div>
      )}

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
// Module inline edit form
// ---------------------------------------------------------------------------

function ModuleEditForm({
  module,
  isUpdating,
  serverError,
  onCancel,
  onSave,
}: {
  module: ModuleData;
  isUpdating: boolean;
  serverError: string | null;
  onCancel: () => void;
  onSave: (title: string, description: string) => void;
}) {
  const [title, setTitle] = useState(module.title);
  const [description, setDescription] = useState(module.description ?? "");
  const [errors, setErrors] = useState<{ title?: string }>({});

  const handleSave = () => {
    if (title.trim().length === 0) {
      setErrors({ title: "Module title is required" });
      return;
    }
    setErrors({});
    onSave(title, description);
  };

  return (
    <div className="mx-3 mb-2 p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] space-y-2">
      {serverError && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-xs">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{serverError}</span>
        </div>
      )}
      <div>
        <label
          htmlFor={`module-title-${module.id}`}
          className="block text-xs font-medium text-[var(--color-text)] mb-1"
        >
          Title
        </label>
        <input
          id={`module-title-${module.id}`}
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (errors.title)
              setErrors((prev) => ({ ...prev, title: undefined }));
          }}
          disabled={isUpdating}
          autoFocus
          className={`w-full px-2.5 py-1.5 rounded-lg bg-[var(--color-surface)] border text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60 ${
            errors.title ? "border-red-400" : "border-[var(--color-border)]"
          }`}
        />
        {errors.title && (
          <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {errors.title}
          </p>
        )}
      </div>
      <div>
        <label
          htmlFor={`module-description-${module.id}`}
          className="block text-xs font-medium text-[var(--color-text)] mb-1"
        >
          Description
        </label>
        <textarea
          id={`module-description-${module.id}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isUpdating}
          rows={2}
          className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] text-sm text-[var(--color-text)] leading-relaxed resize-y focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
        />
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          disabled={isUpdating}
          className="px-3 py-1.5 rounded-lg text-xs text-[var(--color-text)] hover:bg-[var(--color-border)] transition-colors disabled:opacity-50"
        >
          <X className="w-3.5 h-3.5 inline mr-1" />
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isUpdating}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors"
        >
          {isUpdating ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              Save
            </>
          )}
        </button>
      </div>
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
