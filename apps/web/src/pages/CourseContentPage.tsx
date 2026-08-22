/**
 * Course Content Management Page.
 *
 * Route: `/courses/:courseId/manage`
 *
 * Dedicated instructor/admin view for managing course content:
 * - Module CRUD (create, inline rename/edit, delete with cascade confirmation)
 * - Lesson CRUD (create via modal, edit via split-pane editor, publish)
 * - Real-time preview with MarkdownRenderer
 * - Clean/dirty state tracking and Cmd+S keyboard shortcut
 * - Documents & Ingestion Tab
 * - AI Content Review Queue Tab
 */

import { useState, useEffect } from "react";
import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  Eye,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  Save,
  Trash2,
  AlertCircle,
  FileText,
  Sparkles,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../lib/api/client.js";
import { createOrganizationApi } from "../lib/api/organizations.js";
import { createContentApi } from "../lib/api/content.js";
import { createReviewApi } from "../lib/api/review.js";
import { LessonEditor } from "../components/content/LessonEditor.js";
import { NewLessonDialog } from "../components/content/NewLessonDialog.js";
import { NewModuleDialog } from "../components/content/NewModuleDialog.js";
import { CourseDocumentsView } from "../components/documents/CourseDocumentsView.js";
import { ReviewQueueList } from "../components/review/ReviewQueueList.js";
import type {
  ContentLessonResource,
  ContentModuleResource,
} from "@avana/contracts";

type ModuleData = ContentModuleResource & {
  lessons: ContentLessonResource[];
};

type LessonData = ContentLessonResource;

type ManagerTab = "curriculum" | "documents" | "review";

function useOrganization() {
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const orgApi = createOrganizationApi(apiClient);

  return useQuery({
    queryKey: ["organizations"],
    queryFn: () => orgApi.listOrganizations(),
  });
}

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

function parseEstimatedMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const num = Number(trimmed);
  if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) return NaN;
  return num;
}

export function CourseContentPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get("tab") as ManagerTab) || "curriculum";

  const orgQuery = useOrganization();
  const organization = orgQuery.data?.items?.[0];
  const contentQuery = useCourseContent(organization?.id, courseId);
  const queryClient = useQueryClient();

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const contentApi = createContentApi(apiClient);
  const reviewApi = createReviewApi(apiClient);

  // Review queue query for badge counter
  const reviewQueueQuery = useQuery({
    queryKey: ["review-queue", organization?.id, courseId],
    queryFn: () => reviewApi.getReviewQueue(organization!.id, courseId!),
    enabled: !!organization?.id && !!courseId,
  });

  const pendingReviewCount = reviewQueueQuery.data?.pending?.length ?? 0;

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
  // The id of the lesson pending deletion confirmation (null = none)
  const [deletingLessonId, setDeletingLessonId] = useState<string | null>(null);
  const [moduleEditError, setModuleEditError] = useState<string | null>(null);

  // Delete lesson mutation
  const deleteLessonMutation = useMutation({
    mutationFn: ({
      moduleId,
      lessonId,
    }: {
      moduleId: string;
      lessonId: string;
    }) =>
      contentApi.deleteLesson(organization!.id, courseId!, moduleId, lessonId),
    onSuccess: (_, { lessonId }) => {
      void queryClient.invalidateQueries({
        queryKey: ["course-content", organization?.id, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-learning", courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["document-content-status"],
      });
      setDeletingLessonId(null);
      if (selectedLessonId === lessonId) {
        setSelectedLessonId(null);
      }
    },
  });

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
    onSuccess: (response) => {
      void queryClient.invalidateQueries({
        queryKey: ["course-content", organization?.id, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-learning", courseId],
      });
      setExpandedModules((prev) => {
        const next = new Set(prev);
        next.add(response.module.id);
        return next;
      });
      setNewModuleOpen(false);
      setCreateModuleError(null);
    },
    onError: (error: Error) => {
      setCreateModuleError(error.message ?? "خطا در ایجاد فصل");
    },
  });

  // Update module mutation
  const updateModuleMutation = useMutation({
    mutationFn: ({
      moduleId,
      title,
      description,
    }: {
      moduleId: string;
      title: string;
      description: string | null;
    }) =>
      contentApi.updateModule(organization!.id, courseId!, moduleId, {
        title: title.trim(),
        description:
          description && description.trim() !== "" ? description.trim() : null,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["course-content", organization?.id, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-learning", courseId],
      });
      setEditingModuleId(null);
      setModuleEditError(null);
    },
    onError: (error: Error) => {
      setModuleEditError(error.message ?? "خطا در ویرایش فصل");
    },
  });

  // Delete module mutation
  const deleteModuleMutation = useMutation({
    mutationFn: (moduleId: string) =>
      contentApi.deleteModule(organization!.id, courseId!, moduleId),
    onSuccess: (_, deletedModuleId) => {
      void queryClient.invalidateQueries({
        queryKey: ["course-content", organization?.id, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-learning", courseId],
      });
      setDeletingModuleId(null);
      setExpandedModules((prev) => {
        const next = new Set(prev);
        next.delete(deletedModuleId);
        return next;
      });
      const data = contentQuery.data;
      if (data) {
        const deletedModule = data.modules.find(
          (m: ModuleData) => m.id === deletedModuleId,
        );
        const deletedLessonIds = new Set(
          deletedModule?.lessons.map((l: LessonData) => l.id) ?? [],
        );
        if (selectedLessonId && deletedLessonIds.has(selectedLessonId)) {
          setSelectedLessonId(null);
        }
      }
    },
  });

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
      void queryClient.invalidateQueries({
        queryKey: ["course-content", organization?.id, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-learning", courseId],
      });
      setSelectedLessonId(response.lesson.id);
      if (newLessonModuleId) {
        setExpandedModules((prev) => {
          const next = new Set(prev);
          next.add(newLessonModuleId);
          return next;
        });
      }
      setNewLessonModuleId(null);
      setCreateLessonError(null);
    },
    onError: (error: Error) => {
      setCreateLessonError(error.message ?? "خطا در ایجاد درس");
    },
  });

  // Auto-select the first lesson when content loads
  useEffect(() => {
    const data = contentQuery.data;
    if (!data) return;
    const firstModule = data.modules.find(
      (module: ModuleData) => module.lessons.length > 0,
    );
    const selectionExists = data.modules.some((module: ModuleData) =>
      module.lessons.some((lesson: LessonData) => lesson.id === selectedLessonId),
    );
    if (!selectionExists && firstModule) {
      setSelectedLessonId(firstModule.lessons[0].id);
      setExpandedModules(new Set([firstModule.id]));
    }
  }, [contentQuery.data, selectedLessonId]);

  const setTab = (tab: ManagerTab) => {
    setSearchParams(tab === "curriculum" ? {} : { tab });
  };

  // --- Loading state ---
  if (orgQuery.isLoading || contentQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#008080]" />
      </div>
    );
  }

  // --- Error loading organization ---
  if (orgQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-lg font-bold text-[var(--color-text)]">
          خطا در دریافت اطلاعات سازمان
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {orgQuery.error?.message ?? "خطایی در برقراری ارتباط رخ داد."}
        </p>
        <Link
          to="/courses"
          className="mt-4 px-4 py-2 bg-[#008080] text-white rounded-xl text-xs font-bold"
        >
          بازگشت به دوره‌ها
        </Link>
      </div>
    );
  }

  // --- No organization found ---
  if (!organization) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-12 h-12 text-[var(--color-text-muted)] mb-4" />
        <h2 className="text-lg font-bold text-[var(--color-text)]">
          سازمانی یافت نشد
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          شما در حال حاضر عضو هیچ سازمانی نیستید.
        </p>
        <Link
          to="/courses"
          className="mt-4 px-4 py-2 bg-[#008080] text-white rounded-xl text-xs font-bold"
        >
          بازگشت به دوره‌ها
        </Link>
      </div>
    );
  }

  // --- Error loading content ---
  if (contentQuery.isError) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-lg font-bold text-[var(--color-text)]">
          خطا در بارگذاری محتوای دوره
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          {contentQuery.error?.message ?? "خطایی رخ داد."}
        </p>
        <Link
          to="/courses"
          className="mt-4 px-4 py-2 bg-[#008080] text-white rounded-xl text-xs font-bold"
        >
          بازگشت به دوره‌ها
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
        <h2 className="text-lg font-bold text-[var(--color-text)]">
          دوره یافت نشد
        </h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          دوره موردنظر یافت نشد یا شما به آن دسترسی ندارید.
        </p>
        <Link
          to="/courses"
          className="mt-4 px-4 py-2 bg-[#008080] text-white rounded-xl text-xs font-bold"
        >
          بازگشت به دوره‌ها
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

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        to={`/courses/${courseId}`}
        className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
      >
        <ArrowRight className="w-4 h-4" />
        <span>بازگشت به دوره</span>
      </Link>

      {/* Course header */}
      <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#a7d0e6]/40 text-[#008080] flex items-center justify-center flex-shrink-0">
            <Eye className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)] truncate">
                {course.title}
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#008080]/10 text-[#008080] font-bold flex-shrink-0">
                مدیریت محتوا
              </span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {course.subject ?? "بدون رشته مشخص"}
            </p>
          </div>
        </div>
      </div>

      {/* Management Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] pb-2 overflow-x-auto">
        <button
          onClick={() => setTab("curriculum")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === "curriculum"
              ? "bg-[#008080] text-white shadow-sm"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>سرفصل‌ها و دروس</span>
        </button>

        <button
          onClick={() => setTab("documents")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === "documents"
              ? "bg-[#008080] text-white shadow-sm"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>اسناد و منابع بارگذاری‌شده</span>
        </button>

        <button
          onClick={() => setTab("review")}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === "review"
              ? "bg-[#008080] text-white shadow-sm"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>صف بازبینی پیش‌نویس‌ها</span>
          {pendingReviewCount > 0 && (
            <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500 text-white rounded-full mr-1">
              {pendingReviewCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab 2: Documents */}
      {activeTab === "documents" && (
        <CourseDocumentsView
          organizationId={organization.id}
          courseId={courseId!}
          onNavigateToReview={() => setTab("review")}
        />
      )}

      {/* Tab 3: Review Queue */}
      {activeTab === "review" && (
        <ReviewQueueList
          organizationId={organization.id}
          courseId={courseId!}
        />
      )}

      {/* Tab 1: Curriculum Management */}
      {activeTab === "curriculum" && (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar: Module accordion + lesson navigation */}
          <aside className="w-full lg:w-80 xl:w-96 flex-shrink-0">
            <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] overflow-hidden sticky top-24 shadow-sm">
              <div className="p-4 border-b border-[var(--color-border)]">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-bold text-sm text-[var(--color-text)]">
                    ساختار آموزشی دوره
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateModuleError(null);
                      setNewModuleOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-bold text-[#008080] border border-[#008080]/30 hover:bg-[#008080]/10 transition-colors flex-shrink-0"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>فصل جدید</span>
                  </button>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {totalLessons} درس در {modules.length} فصل
                </p>
              </div>

              <nav className="p-2 space-y-1 max-h-[calc(100vh-16rem)] overflow-y-auto">
                {modules.map((mod: ModuleData) => (
                  <ModuleSection
                    key={mod.id}
                    module={mod}
                    isExpanded={expandedModules.has(mod.id)}
                    selectedLessonId={selectedLessonId}
                    isEditing={editingModuleId === mod.id}
                    isDeleting={deletingModuleId === mod.id}
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
                    onOpenNewLesson={() => {
                      setCreateLessonError(null);
                      setNewLessonModuleId(mod.id);
                    }}
                    onStartEdit={() => {
                      setModuleEditError(null);
                      setEditingModuleId(mod.id);
                    }}
                    onCancelEdit={() => {
                      setEditingModuleId(null);
                      setModuleEditError(null);
                    }}
                    onSaveEdit={(title: string, description: string | null) => {
                      updateModuleMutation.mutate({
                        moduleId: mod.id,
                        title,
                        description,
                      });
                    }}
                    isUpdating={updateModuleMutation.isPending}
                    onStartDelete={() => setDeletingModuleId(mod.id)}
                    onCancelDelete={() => setDeletingModuleId(null)}
                    onConfirmDelete={() => deleteModuleMutation.mutate(mod.id)}
                    isDeletingModule={deleteModuleMutation.isPending}
                    moduleEditError={
                      editingModuleId === mod.id ? moduleEditError : null
                    }
                    deletingLessonId={deletingLessonId}
                    onStartDeleteLesson={(lessonId: string) => setDeletingLessonId(lessonId)}
                    onCancelDeleteLesson={() => setDeletingLessonId(null)}
                    onConfirmDeleteLesson={(moduleId: string, lessonId: string) =>
                      deleteLessonMutation.mutate({ moduleId, lessonId })
                    }
                    isDeletingLesson={deleteLessonMutation.isPending}
                  />
                ))}
                {modules.length === 0 && (
                  <div className="p-6 text-center text-xs text-[var(--color-text-muted)]">
                    هنوز فصلی برای این دوره ایجاد نشده است.
                  </div>
                )}
              </nav>
            </div>
          </aside>

          {/* Main content: Lesson editor or placeholder */}
          <main className="flex-1 min-w-0">
            {selectedLesson ? (
              <LessonEditor
                key={selectedLesson.id}
                organizationId={organization.id}
                courseId={courseId!}
                moduleId={selectedModuleId}
                moduleTitle={selectedModuleTitle}
                lesson={selectedLesson}
                onDelete={() => setSelectedLessonId(null)}
              />
            ) : modules.length === 0 ? (
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
                <div className="pt-2 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setTab("documents")}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#008080] hover:bg-[#006666] text-white rounded-2xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>افزودن فایل PDF</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center shadow-sm">
                <Eye className="w-12 h-12 text-[var(--color-text-muted)] mx-auto mb-4" />
                <h2 className="text-base font-bold text-[var(--color-text)]">
                  یک درس را برای ویرایش انتخاب کنید
                </h2>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  از منوی کناری درسی را انتخاب نمایید یا یک درس جدید ایجاد کنید.
                </p>
              </div>
            )}
          </main>
        </div>
      )}

      {/* New Module Dialog */}
      <NewModuleDialog
        open={newModuleOpen}
        courseTitle={course.title}
        isPending={createModuleMutation.isPending}
        serverError={createModuleError}
        onClose={() => {
          setNewModuleOpen(false);
          setCreateModuleError(null);
        }}
        onSubmit={({ title, description }) => {
          createModuleMutation.mutate({ title, description });
        }}
      />

      {/* New Lesson Dialog */}
      {newLessonModuleId && (
        <NewLessonDialog
          open={true}
          moduleTitle={
            modules.find((m: ModuleData) => m.id === newLessonModuleId)
              ?.title ?? ""
          }
          isPending={createLessonMutation.isPending}
          serverError={createLessonError}
          onClose={() => {
            setNewLessonModuleId(null);
            setCreateLessonError(null);
          }}
          onSubmit={({ title, contentMarkdown, estimatedMinutes }) => {
            createLessonMutation.mutate({
              moduleId: newLessonModuleId,
              title,
              contentMarkdown,
              estimatedMinutes,
            });
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module Section Subcomponents
// ---------------------------------------------------------------------------

function ModuleSection({
  module,
  isExpanded,
  selectedLessonId,
  isEditing,
  isDeleting,
  onToggle,
  onSelectLesson,
  onOpenNewLesson,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  isUpdating,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
  isDeletingModule,
  moduleEditError,
  deletingLessonId,
  onStartDeleteLesson,
  onCancelDeleteLesson,
  onConfirmDeleteLesson,
  isDeletingLesson,
}: {
  module: ModuleData;
  isExpanded: boolean;
  selectedLessonId: string | null;
  isEditing: boolean;
  isDeleting: boolean;
  onToggle: () => void;
  onSelectLesson: (lessonId: string) => void;
  onOpenNewLesson: () => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: (title: string, description: string | null) => void;
  isUpdating: boolean;
  onStartDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  isDeletingModule: boolean;
  moduleEditError: string | null;
  deletingLessonId: string | null;
  onStartDeleteLesson: (lessonId: string) => void;
  onCancelDeleteLesson: () => void;
  onConfirmDeleteLesson: (moduleId: string, lessonId: string) => void;
  isDeletingLesson: boolean;
}) {
  const [editTitle, setEditTitle] = useState(module.title);
  const [editDescription, setEditDescription] = useState(
    module.description ?? "",
  );

  useEffect(() => {
    setEditTitle(module.title);
    setEditDescription(module.description ?? "");
  }, [module.title, module.description, isEditing]);

  const publishedCount = module.lessons.filter(
    (l: LessonData) => l.publication_status === "published",
  ).length;

  return (
    <div className="rounded-2xl overflow-hidden">
      {/* Delete confirmation banner */}
      {isDeleting ? (
        <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-2xl space-y-2">
          <p className="text-xs font-bold text-red-900 dark:text-red-200">
            آیا از حذف فصل «{module.title}» اطمینان دارید؟
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={isDeletingModule}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold"
            >
              {isDeletingModule ? "در حال حذف..." : "تایید حذف"}
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              disabled={isDeletingModule}
              className="px-3 py-1 bg-white dark:bg-zinc-800 hover:bg-zinc-100 border border-zinc-200 rounded-xl text-xs font-bold"
            >
              انصراف
            </button>
          </div>
        </div>
      ) : isEditing ? (
        /* Inline edit form */
        <div className="p-3 bg-[#008080]/10 border border-[#008080]/30 rounded-2xl space-y-2">
          {moduleEditError && (
            <div className="p-2 rounded-xl bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 text-xs font-medium">
              {moduleEditError}
            </div>
          )}
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="عنوان فصل"
            aria-label="عنوان فصل"
            className="w-full px-3 py-1.5 text-xs bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[#008080]"
          />
          <input
            type="text"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="توضیحات (اختیاری)"
            aria-label="توضیحات فصل"
            className="w-full px-3 py-1.5 text-xs bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[#008080]"
          />
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={isUpdating}
              className="px-2.5 py-1 rounded-xl text-xs font-bold text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
            >
              انصراف
            </button>
            <button
              type="button"
              onClick={() => onSaveEdit(editTitle, editDescription)}
              disabled={isUpdating || !editTitle.trim()}
              className="px-3 py-1 bg-[#008080] hover:bg-[#006666] disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1"
            >
              <Save className="w-3 h-3" />
              <span>ذخیره</span>
            </button>
          </div>
        </div>
      ) : (
        /* Normal module header row */
        <div
          className={`w-full flex items-center gap-1.5 px-3 py-2 text-right rounded-2xl transition-colors ${
            isExpanded
              ? "bg-[#008080]/10"
              : "hover:bg-[var(--color-surface-warm)]"
          }`}
        >
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? "بستن" : "باز کردن"} فصل ${module.title}`}
            className="flex items-center gap-2 flex-1 min-w-0 text-right"
          >
            {isExpanded ? (
              <ChevronDown className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-[var(--color-text-muted)] flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <span className="text-xs sm:text-sm font-bold text-[var(--color-text)] block truncate">
                {module.title}
              </span>
              {module.description && (
                <span className="text-[11px] text-[var(--color-text-muted)] block truncate">
                  {module.description}
                </span>
              )}
            </div>
            <span className="text-xs text-[var(--color-text-muted)] flex-shrink-0 font-mono" dir="ltr">
              {publishedCount}/{module.lessons.length}
            </span>
          </button>

          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartEdit();
              }}
              title="ویرایش فصل"
              aria-label={`ویرایش فصل ${module.title}`}
              className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-[#008080] hover:bg-[#008080]/10"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onStartDelete();
              }}
              title="حذف فصل"
              aria-label={`حذف فصل ${module.title}`}
              className="p-1 rounded-lg text-[var(--color-text-muted)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Lesson list & Add lesson button */}
      {isExpanded && !isEditing && !isDeleting && (
        <div className="mr-2 mt-1 space-y-0.5 pb-1">
          {module.lessons.map((lesson: LessonData) => (
            <LessonNavItem
              key={lesson.id}
              lesson={lesson}
              isSelected={lesson.id === selectedLessonId}
              isDeleting={deletingLessonId === lesson.id}
              onSelect={() => onSelectLesson(lesson.id)}
              onStartDelete={() => onStartDeleteLesson(lesson.id)}
              onCancelDelete={onCancelDeleteLesson}
              onConfirmDelete={() => onConfirmDeleteLesson(module.id, lesson.id)}
              isDeletingLesson={isDeletingLesson}
            />
          ))}

          <button
            type="button"
            onClick={onOpenNewLesson}
            className="w-full flex items-center gap-1.5 px-3 py-1.5 text-right rounded-xl text-xs font-bold text-[#008080] hover:bg-[#008080]/10 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>افزودن درس</span>
          </button>
        </div>
      )}
    </div>
  );
}

function LessonNavItem({
  lesson,
  isSelected,
  isDeleting,
  onSelect,
  onStartDelete,
  onCancelDelete,
  onConfirmDelete,
  isDeletingLesson,
}: {
  lesson: LessonData;
  isSelected: boolean;
  isDeleting: boolean;
  onSelect: () => void;
  onStartDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
  isDeletingLesson: boolean;
}) {
  const isDraft = lesson.publication_status === "draft";

  if (isDeleting) {
    return (
      <div className="p-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl flex items-center justify-between gap-1 text-right">
        <span className="text-[11px] font-bold text-red-900 dark:text-red-200 truncate flex-1">
          حذف «{lesson.title}»؟
        </span>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={isDeletingLesson}
            className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[10px] font-bold disabled:opacity-50"
          >
            {isDeletingLesson ? "حذف..." : "حذف"}
          </button>
          <button
            type="button"
            onClick={onCancelDelete}
            disabled={isDeletingLesson}
            className="px-2 py-0.5 bg-white dark:bg-zinc-800 border border-zinc-200 text-zinc-700 dark:text-zinc-300 rounded-lg text-[10px] font-bold"
          >
            انصراف
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group w-full flex items-center justify-between gap-1.5 px-3 py-1 text-right rounded-xl text-xs transition-colors ${
        isSelected
          ? "bg-[#008080]/15 text-[#008080] font-bold"
          : "text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex items-center gap-2 flex-1 min-w-0 text-right py-1"
      >
        <span
          className={`w-2 h-2 rounded-full flex-shrink-0 ${
            isDraft ? "bg-amber-500" : "bg-green-500"
          }`}
          title={isDraft ? "پیش‌نویس" : "منتشر شده"}
        />
        <span className="truncate flex-1">{lesson.title}</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold flex-shrink-0 ${
            isDraft
              ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
              : "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
          }`}
        >
          {isDraft ? "پیش‌نویس" : "منتشر شده"}
        </span>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onStartDelete();
        }}
        title="حذف درس"
        aria-label={`حذف درس ${lesson.title}`}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded-lg text-[var(--color-text-muted)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-opacity flex-shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
