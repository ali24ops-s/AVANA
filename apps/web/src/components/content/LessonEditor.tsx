/**
 * LessonEditor — Editable lesson form with inline validation, dirty tracking,
 * split-pane markdown editing, and save/publish actions.
 *
 * PR5-C2: Lesson editing workflow.
 * - Edits title, markdown content, and estimated minutes
 * - Inline validation with error messages
 * - Dirty state detection (disables save when clean)
 * - Save and Publish buttons with loading states
 * - No optimistic updates for text editing
 * - Disables actions while requests are pending
 * - Live preview using shared MarkdownRenderer
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  Edit3,
  Save,
  Send,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createContentApi, type ContentApi } from "../../lib/api/content.js";
import { MarkdownRenderer } from "../markdown/MarkdownRenderer.js";
import type { ContentLessonResource } from "@avana/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LessonData = ContentLessonResource;

interface LessonEditorProps {
  lesson: LessonData;
  organizationId: string;
  courseId: string;
  moduleId: string;
  moduleTitle: string;
}

interface FormState {
  title: string;
  contentMarkdown: string;
  estimatedMinutes: string;
}

interface FormErrors {
  title?: string;
  estimatedMinutes?: string;
}

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

function getInitialFormState(lesson: LessonData): FormState {
  return {
    title: lesson.title,
    contentMarkdown: lesson.content_markdown,
    estimatedMinutes:
      lesson.estimated_minutes !== null ? String(lesson.estimated_minutes) : "",
  };
}

function isDirty(form: FormState, lesson: LessonData): boolean {
  if (form.title !== lesson.title) return true;
  if (form.contentMarkdown !== lesson.content_markdown) return true;
  const formMinutes = parseEstimatedMinutes(form.estimatedMinutes);
  if (Number.isNaN(formMinutes)) return true;
  if (formMinutes !== lesson.estimated_minutes) return true;
  return false;
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (form.title.trim().length === 0) {
    errors.title = "Lesson title is required";
  } else if (form.title.trim().length > 255) {
    errors.title = "Title must not exceed 255 characters";
  }
  if (form.estimatedMinutes.trim() !== "") {
    const parsed = parseEstimatedMinutes(form.estimatedMinutes);
    if (Number.isNaN(parsed)) {
      errors.estimatedMinutes = "Must be a positive whole number or empty";
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LessonEditor({
  lesson,
  organizationId,
  courseId,
  moduleId,
  moduleTitle,
}: LessonEditorProps) {
  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const contentApi: ContentApi = createContentApi(apiClient);

  // Track the initial lesson snapshot for dirty detection after save resets
  const [savedSnapshot, setSavedSnapshot] = useState<LessonData>(lesson);
  const [form, setForm] = useState<FormState>(() =>
    getInitialFormState(lesson),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPreview, setShowPreview] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset form when a different lesson is selected
  useEffect(() => {
    setForm(getInitialFormState(lesson));
    setSavedSnapshot(lesson);
    setErrors({});
  }, [
    lesson.id,
    lesson.title,
    lesson.content_markdown,
    lesson.estimated_minutes,
  ]);

  const dirty = isDirty(form, savedSnapshot);
  const validationErrors = validate(form);

  // -------------------------------------------------------------------------
  // Save mutation
  // -------------------------------------------------------------------------
  const saveMutation = useMutation({
    mutationFn: () => {
      const parsed = parseEstimatedMinutes(form.estimatedMinutes);
      return contentApi.updateLesson(
        organizationId,
        courseId,
        moduleId,
        lesson.id,
        {
          title: form.title.trim(),
          content_markdown: form.contentMarkdown,
          estimated_minutes: Number.isNaN(parsed) ? null : parsed,
        },
      );
    },
    onSuccess: (response) => {
      // Update the saved snapshot to the response so dirty state resets
      setSavedSnapshot(response.lesson);
      setForm({
        title: response.lesson.title,
        contentMarkdown: response.lesson.content_markdown,
        estimatedMinutes:
          response.lesson.estimated_minutes !== null
            ? String(response.lesson.estimated_minutes)
            : "",
      });
      // Invalidate the content query to reflect changes in sidebar etc.
      queryClient.invalidateQueries({
        queryKey: ["course-content", organizationId, courseId],
      });
    },
  });

  // -------------------------------------------------------------------------
  // Publish mutation
  // -------------------------------------------------------------------------
  const publishMutation = useMutation({
    mutationFn: () =>
      contentApi.publishLesson(organizationId, courseId, moduleId, lesson.id),
    onSuccess: (response) => {
      setSavedSnapshot(response.lesson);
      // Invalidate both content and learner queries
      queryClient.invalidateQueries({
        queryKey: ["course-content", organizationId, courseId],
      });
      queryClient.invalidateQueries({
        queryKey: ["course-learning", courseId],
      });
    },
  });

  const isPending = saveMutation.isPending || publishMutation.isPending;

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleFieldChange = useCallback(
    (field: keyof FormState, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      // Clear field-level error on change
      if (field === "title" && errors.title) {
        setErrors((prev) => ({ ...prev, title: undefined }));
      }
      if (field === "estimatedMinutes" && errors.estimatedMinutes) {
        setErrors((prev) => ({ ...prev, estimatedMinutes: undefined }));
      }
    },
    [errors],
  );

  const handleSave = useCallback(() => {
    const v = validate(form);
    if (v.title || v.estimatedMinutes) {
      setErrors(v);
      return;
    }
    setErrors({});
    saveMutation.mutate();
  }, [form, saveMutation]);

  const handlePublish = useCallback(() => {
    // Publish should also validate before sending
    const v = validate(form);
    if (v.title || v.estimatedMinutes) {
      setErrors(v);
      return;
    }
    // If dirty, save first then publish? Per PR5 spec: disable publish when dirty.
    // So we just publish directly (dirty check prevents this button being active when dirty).
    publishMutation.mutate();
  }, [form, publishMutation]);

  // Detect Cmd+S / Ctrl+S
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (dirty && !isPending) handleSave();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dirty, isPending, handleSave]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <article className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] overflow-hidden">
      {/* Lesson header */}
      <div className="p-6 pb-4 border-b border-[var(--color-border)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
              {moduleTitle}
            </p>
            {/* Title input */}
            <div className="mt-1">
              <input
                type="text"
                value={form.title}
                onChange={(e) => handleFieldChange("title", e.target.value)}
                placeholder="Lesson title"
                disabled={isPending}
                className={`w-full text-xl font-bold text-[var(--color-text)] bg-transparent border-b-2 focus:outline-none pb-1 transition-colors disabled:opacity-60 ${
                  errors.title
                    ? "border-red-400 focus:border-red-500"
                    : "border-transparent focus:border-indigo-400 hover:border-[var(--color-border)]"
                }`}
              />
              {errors.title && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.title}
                </p>
              )}
            </div>
          </div>

          {/* Estimated minutes input */}
          <div className="flex-shrink-0">
            <div className="flex items-center gap-1.5 text-sm">
              <Clock className="w-4 h-4 text-[var(--color-text-muted)]" />
              <input
                type="text"
                inputMode="numeric"
                value={form.estimatedMinutes}
                onChange={(e) =>
                  handleFieldChange("estimatedMinutes", e.target.value)
                }
                placeholder="min"
                disabled={isPending}
                className={`w-16 text-sm text-[var(--color-text)] bg-transparent border-b-2 focus:outline-none text-right disabled:opacity-60 ${
                  errors.estimatedMinutes
                    ? "border-red-400 focus:border-red-500"
                    : "border-transparent focus:border-indigo-400 hover:border-[var(--color-border)]"
                }`}
              />
              <span className="text-[var(--color-text-muted)]">min</span>
            </div>
            {errors.estimatedMinutes && (
              <p className="text-xs text-red-500 mt-1 text-right">
                {errors.estimatedMinutes}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Toolbar: toggle preview + action buttons */}
      <div className="px-6 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors ${
              showPreview
                ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-border)]"
            }`}
          >
            {showPreview ? (
              <>
                <Edit3 className="w-3.5 h-3.5" />
                Edit
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                Preview
              </>
            )}
          </button>
          {dirty && (
            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Unsaved changes
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Error banner for save/publish failures */}
          {(saveMutation.isError || publishMutation.isError) && (
            <span className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              {saveMutation.error?.message ??
                publishMutation.error?.message ??
                "An error occurred"}
            </span>
          )}

          {/* Save button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={
              !dirty || isPending || Object.keys(validationErrors).length > 0
            }
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:bg-[var(--color-border)] text-white disabled:text-[var(--color-text-muted)] transition-colors disabled:cursor-not-allowed"
          >
            {saveMutation.isPending ? (
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

          {/* Publish button */}
          <button
            type="button"
            onClick={handlePublish}
            disabled={
              dirty || isPending || lesson.publication_status === "published"
            }
            title={
              dirty
                ? "Save changes before publishing"
                : lesson.publication_status === "published"
                  ? "Already published"
                  : "Publish lesson"
            }
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:bg-[var(--color-border)] text-white disabled:text-[var(--color-text-muted)] transition-colors disabled:cursor-not-allowed"
          >
            {publishMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Publishing...
              </>
            ) : lesson.publication_status === "published" ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Published
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                Publish
              </>
            )}
          </button>
        </div>
      </div>

      {/* Body: split-pane editor + preview */}
      <div className="flex flex-col lg:flex-row">
        {/* Markdown editor textarea */}
        <div className="flex-1 min-w-0 border-b lg:border-b-0 lg:border-r border-[var(--color-border)]">
          <textarea
            ref={textareaRef}
            value={form.contentMarkdown}
            onChange={(e) =>
              handleFieldChange("contentMarkdown", e.target.value)
            }
            placeholder="Write your lesson content in markdown..."
            disabled={isPending}
            className="w-full min-h-[400px] p-6 bg-transparent text-sm text-[var(--color-text)] font-mono leading-relaxed resize-y focus:outline-none disabled:opacity-60"
            spellCheck
          />
        </div>

        {/* Live preview */}
        {showPreview && (
          <div className="flex-1 min-w-0">
            <div className="p-6 prose prose-sm sm:prose-base max-w-none">
              {form.contentMarkdown.trim() ? (
                <MarkdownRenderer content={form.contentMarkdown} />
              ) : (
                <p className="text-[var(--color-text-muted)] italic">
                  Preview will appear here as you write...
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
