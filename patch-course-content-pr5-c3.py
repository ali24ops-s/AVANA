"""Idempotent patch for CourseContentPage.tsx — PR5-C3 lesson creation (corrected)."""

path = "apps/web/src/pages/CourseContentPage.tsx"

with open(path, "r") as f:
    content = f.read()

applied = []
skipped = []

# ---------------------------------------------------------------------------
# 1. Imports
# ---------------------------------------------------------------------------
old_imports = """import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Loader2,
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
} from "lucide-react";"""
new_imports = """import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";"""
if old_imports in content:
    content = content.replace(old_imports, new_imports)
    applied.append("imports (useMutation, useQueryClient, Plus)")
else:
    skipped.append("imports")

old_lesson_editor_import = """import { LessonEditor } from "../components/content/LessonEditor.js";
import type {
  ContentModuleResource,
  ContentLessonResource,
} from "@avana/contracts";"""
new_lesson_editor_import = """import { LessonEditor } from "../components/content/LessonEditor.js";
import { NewLessonDialog } from "../components/content/NewLessonDialog.js";
import type {
  ContentModuleResource,
  ContentLessonResource,
} from "@avana/contracts";"""
if old_lesson_editor_import in content:
    content = content.replace(old_lesson_editor_import, new_lesson_editor_import)
    applied.append("imports (NewLessonDialog)")
else:
    skipped.append("imports NewLessonDialog")

# ---------------------------------------------------------------------------
# 2. State + mutation inside CourseContentPage
# ---------------------------------------------------------------------------
old_state = """  // Track the currently selected lesson
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);"""
new_state = """  // Track the currently selected lesson
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  // Track which module a new lesson is being created for
  const [newLessonModuleId, setNewLessonModuleId] = useState<string | null>(
    null,
  );
  const [createLessonError, setCreateLessonError] = useState<string | null>(
    null,
  );"""
if old_state in content:
    content = content.replace(old_state, new_state)
    applied.append("state (newLessonModuleId, createLessonError)")
else:
    skipped.append("state newLessonModuleId/createLessonError")

old_hooks = """  const orgQuery = useOrganization();
  const organization = orgQuery.data?.items?.[0];
  const contentQuery = useCourseContent(organization?.id, courseId);"""
new_hooks = """  const orgQuery = useOrganization();
  const organization = orgQuery.data?.items?.[0];
  const contentQuery = useCourseContent(organization?.id, courseId);
  const queryClient = useQueryClient();

  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const contentApi = createContentApi(apiClient);

  // Create lesson mutation
  const createLessonMutation = useMutation({
    mutationFn: (data: {
      moduleId: string;
      title: string;
      contentMarkdown: string;
      estimatedMinutes: string;
    }) => {
      const { moduleId, title, contentMarkdown, estimatedMinutes } = data;
      const parsedMin =
        estimatedMinutes.trim() === ""
          ? null
          : parseInt(estimatedMinutes, 10);
      return contentApi.createLesson(organization!.id, courseId!, moduleId, {
        title: title.trim(),
        content_markdown: contentMarkdown,
        estimated_minutes: Number.isNaN(parsedMin) ? null : parsedMin,
      });
    },
    onSuccess: (response) => {
      const newLesson = response.lesson;
      // Refresh course content so new lesson appears in the sidebar
      queryClient.invalidateQueries({
        queryKey: ["course-content", organization?.id, courseId],
      });
      // Select the new lesson and expand its module
      setSelectedLessonId(newLesson.id);
      setExpandedModules((prev) => {
        const next = new Set(prev);
        if (newLessonModuleId) next.add(newLessonModuleId);
        return next;
      });
      // Close dialog
      setNewLessonModuleId(null);
      setCreateLessonError(null);
    },
    onError: (error: Error) => {
      setCreateLessonError(error.message);
    },
  });"""
if old_hooks in content:
    content = content.replace(old_hooks, new_hooks)
    applied.append("createLessonMutation")
else:
    skipped.append("createLessonMutation")

# ---------------------------------------------------------------------------
# 3. Add onCreateLesson prop to ModuleSection usage
# ---------------------------------------------------------------------------
old_usage = """                    onSelectLesson={(lessonId: string) => {
                      setSelectedLessonId(lessonId);
                      if (!expandedModules.has(mod.id)) {
                        setExpandedModules((prev) => {
                          const next = new Set(prev);
                          next.add(mod.id);
                          return next;
                        });
                      }
                    }}
                  />"""
new_usage = """                    onSelectLesson={(lessonId: string) => {
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
                  />"""
if old_usage in content:
    content = content.replace(old_usage, new_usage)
    applied.append("onCreateLesson prop on ModuleSection usage")
else:
    skipped.append("onCreateLesson prop on ModuleSection usage")

# ---------------------------------------------------------------------------
# 4. Update ModuleSection component signature
# ---------------------------------------------------------------------------
old_sig = """function ModuleSection({
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
}) {"""
new_sig = """function ModuleSection({
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
}) {"""
if old_sig in content:
    content = content.replace(old_sig, new_sig)
    applied.append("ModuleSection signature")
else:
    skipped.append("ModuleSection signature")

# ---------------------------------------------------------------------------
# 5. Add "New Lesson" button in the lesson list
# ---------------------------------------------------------------------------
old_btn = """      {/* Lesson list (visible when expanded) */}
      {isExpanded && (
        <div className="ml-2 mt-1 space-y-0.5 pb-1">
          {module.lessons.map((lesson) => (
            <LessonNavItem"""
new_btn = """      {/* Lesson list (visible when expanded) */}
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
            <LessonNavItem"""
if old_btn in content:
    content = content.replace(old_btn, new_btn)
    applied.append("New Lesson button in lesson list")
else:
    skipped.append("New Lesson button in lesson list")

# ---------------------------------------------------------------------------
# 6. Add NewLessonDialog render at the end
# ---------------------------------------------------------------------------
old_end = """        </main>
      </div>
    </div>
  );
}"""
new_end = """        </main>
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
}"""
if old_end in content:
    content = content.replace(old_end, new_end)
    applied.append("NewLessonDialog render")
else:
    skipped.append("NewLessonDialog render")

# ---------------------------------------------------------------------------
# Write result
# ---------------------------------------------------------------------------
if applied:
    with open(path, "w") as f:
        f.write(content)
    print(f"APPLIED {len(applied)} changes:")
    for a in applied:
        print(f"  + {a}")
    if skipped:
        print(f"\nSKIPPED (already present): {len(skipped)}")
        for s in skipped:
            print(f"  = {s}")
else:
    print("No changes applied. Existing state:")
    for s in skipped:
        print(f"  = {s}")
    print("\nAll markers already in place — file is fully patched.")

