/**
 * LessonEditor — Editable lesson form with inline validation, dirty tracking,
 * split-pane markdown editing, and save/publish actions.
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
  Trash2,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createContentApi, type ContentApi } from "../../lib/api/content.js";
import { MarkdownRenderer } from "../markdown/MarkdownRenderer.js";
import type { ContentLessonResource } from "@avana/contracts";

type LessonData = ContentLessonResource;

interface LessonEditorProps {
  lesson: LessonData;
  organizationId: string;
  courseId: string;
  moduleId: string;
  moduleTitle: string;
  onDelete?: () => void;
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
    contentMarkdown: lesson.content_markdown ?? "",
    estimatedMinutes:
      lesson.estimated_minutes !== null ? String(lesson.estimated_minutes) : "",
  };
}

function isDirty(form: FormState, lesson: LessonData): boolean {
  if (form.title !== lesson.title) return true;
  if (form.contentMarkdown !== (lesson.content_markdown ?? "")) return true;
  const formMinutes = parseEstimatedMinutes(form.estimatedMinutes);
  if (Number.isNaN(formMinutes)) return true;
  if (formMinutes !== lesson.estimated_minutes) return true;
  return false;
}

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (form.title.trim().length === 0) {
    errors.title = "عنوان درس الزامی است.";
  } else if (form.title.trim().length > 255) {
    errors.title = "عنوان درس نباید بیشتر از ۲۵۵ کاراکتر باشد.";
  }
  if (form.estimatedMinutes.trim() !== "") {
    const parsed = parseEstimatedMinutes(form.estimatedMinutes);
    if (Number.isNaN(parsed)) {
      errors.estimatedMinutes = "مدت زمان باید یک عدد صحیح مثبت باشد.";
    }
  }
  return errors;
}

export function LessonEditor({
  lesson,
  organizationId,
  courseId,
  moduleId,
  moduleTitle,
  onDelete,
}: LessonEditorProps) {
  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const contentApi: ContentApi = createContentApi(apiClient);

  const [savedSnapshot, setSavedSnapshot] = useState<LessonData>(lesson);
  const [form, setForm] = useState<FormState>(() =>
    getInitialFormState(lesson),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [showPreview, setShowPreview] = useState(true);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset form when a different lesson is selected
  useEffect(() => {
    setForm(getInitialFormState(lesson));
    setSavedSnapshot(lesson);
    setErrors({});
    setConfirmingDelete(false);
  }, [
    lesson.id,
    lesson.title,
    lesson.content_markdown,
    lesson.estimated_minutes,
  ]);

  const dirty = isDirty(form, savedSnapshot);
  const validationErrors = validate(form);

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: () =>
      contentApi.deleteLesson(organizationId, courseId, moduleId, lesson.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["course-content", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-learning", courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["document-content-status"],
      });
      setConfirmingDelete(false);
      if (onDelete) {
        onDelete();
      }
    },
  });

  // Save mutation
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
      setSavedSnapshot(response.lesson);
      setForm({
        title: response.lesson.title,
        contentMarkdown: response.lesson.content_markdown,
        estimatedMinutes:
          response.lesson.estimated_minutes !== null
            ? String(response.lesson.estimated_minutes)
            : "",
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-content", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-learning", courseId],
      });
    },
  });

  // Publish mutation
  const publishMutation = useMutation({
    mutationFn: () =>
      contentApi.publishLesson(organizationId, courseId, moduleId, lesson.id),
    onSuccess: (response) => {
      setSavedSnapshot(response.lesson);
      void queryClient.invalidateQueries({
        queryKey: ["course-content", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-learning", courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["study-analytics", organizationId, courseId],
      });
    },
  });

  const isPending =
    saveMutation.isPending || publishMutation.isPending || deleteMutation.isPending;

  const handleFieldChange = useCallback(
    (field: keyof FormState, value: string) => {
      setForm((prev) => ({ ...prev, [field]: value }));
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
    const v = validate(form);
    if (v.title || v.estimatedMinutes) {
      setErrors(v);
      return;
    }
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

  return (
    <article className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] overflow-hidden shadow-sm">
      {/* Lesson header */}
      <div className="p-6 pb-4 border-b border-[var(--color-border)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-[#008080]">
              فصل: {moduleTitle}
            </p>
            {/* Title input */}
            <div className="mt-1">
              <input
                type="text"
                value={form.title}
                onChange={(e) => handleFieldChange("title", e.target.value)}
                placeholder="عنوان درس"
                disabled={isPending}
                className={`w-full text-lg font-bold text-[var(--color-text)] bg-transparent border-b-2 focus:outline-none pb-1 transition-colors disabled:opacity-60 ${
                  errors.title
                    ? "border-red-400 focus:border-red-500"
                    : "border-transparent focus:border-[#008080] hover:border-[var(--color-border)]"
                }`}
              />
              {errors.title && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>{errors.title}</span>
                </p>
              )}
            </div>
          </div>

          {/* Estimated minutes input */}
          <div className="flex-shrink-0">
            <div className="flex items-center gap-1.5 text-xs font-bold text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-3 py-1.5 rounded-xl border border-[var(--color-border)]">
              <Clock className="w-3.5 h-3.5 text-[#008080]" />
              <input
                type="text"
                inputMode="numeric"
                value={form.estimatedMinutes}
                onChange={(e) =>
                  handleFieldChange("estimatedMinutes", e.target.value)
                }
                placeholder="۱۵"
                disabled={isPending}
                className={`w-10 text-xs text-[var(--color-text)] bg-transparent border-b text-center focus:outline-none disabled:opacity-60 ${
                  errors.estimatedMinutes
                    ? "border-red-400 focus:border-red-500"
                    : "border-transparent focus:border-[#008080]"
                }`}
              />
              <span>دقیقه</span>
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
      <div className="px-6 py-3 border-b border-[var(--color-border)] flex items-center justify-between gap-2 flex-wrap bg-[var(--color-surface-warm)]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-colors ${
              showPreview
                ? "bg-[#008080]/10 text-[#008080]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface)]"
            }`}
          >
            {showPreview ? (
              <>
                <Edit3 className="w-3.5 h-3.5" />
                <span>حالت ویرایش</span>
              </>
            ) : (
              <>
                <Eye className="w-3.5 h-3.5" />
                <span>پیش‌نمایش زنده</span>
              </>
            )}
          </button>
          {dirty && (
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span>تغییرات ذخیره‌نشده</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Error banner */}
          {(saveMutation.isError || publishMutation.isError || deleteMutation.isError) && (
            <span className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" />
              <span>
                {saveMutation.error?.message ??
                  publishMutation.error?.message ??
                  deleteMutation.error?.message ??
                  "خطایی رخ داد"}
              </span>
            </span>
          )}

          {/* Delete lesson button / confirmation */}
          {confirmingDelete ? (
            <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-950/50 p-1 rounded-xl border border-red-200 dark:border-red-800">
              <span className="text-xs font-bold text-red-900 dark:text-red-200 px-1">
                حذف درس؟
              </span>
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold"
              >
                {deleteMutation.isPending ? "در حال حذف..." : "تایید حذف"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                disabled={deleteMutation.isPending}
                className="px-2.5 py-1 bg-white dark:bg-zinc-800 hover:bg-zinc-100 text-zinc-800 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-700 rounded-lg text-xs font-bold"
              >
                انصراف
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={isPending}
              title="حذف این درس"
              className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>حذف درس</span>
            </button>
          )}

          {/* Save button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={
              !dirty || isPending || Object.keys(validationErrors).length > 0
            }
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-xl bg-[#008080] hover:bg-[#006666] disabled:opacity-50 text-white transition-colors disabled:cursor-not-allowed shadow-sm"
          >
            {saveMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>در حال ذخیره...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>ذخیره (Ctrl+S)</span>
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
                ? "ابتدا تغییرات را ذخیره نمایید"
                : lesson.publication_status === "published"
                  ? "منتشر شده"
                  : "انتشار برای دانشجویان"
            }
            className="inline-flex items-center gap-1.5 text-xs font-bold px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white transition-colors disabled:cursor-not-allowed shadow-sm"
          >
            {publishMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>در حال انتشار...</span>
              </>
            ) : lesson.publication_status === "published" ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>منتشر شده</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>انتشار درس</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Body: split-pane editor + preview */}
      <div className="flex flex-col lg:flex-row">
        {/* Markdown editor textarea */}
        <div className="flex-1 min-w-0 border-b lg:border-b-0 lg:border-l border-[var(--color-border)]">
          <textarea
            ref={textareaRef}
            value={form.contentMarkdown}
            onChange={(e) =>
              handleFieldChange("contentMarkdown", e.target.value)
            }
            placeholder="محتوای درس را به فرمت Markdown وارد کنید..."
            disabled={isPending}
            dir="auto"
            className="w-full min-h-[400px] p-6 bg-transparent text-sm text-[var(--color-text)] font-mono leading-relaxed resize-y focus:outline-none disabled:opacity-60"
          />
        </div>

        {/* Live preview */}
        {showPreview && (
          <div className="flex-1 min-w-0 bg-[var(--color-surface)]">
            <div className="p-6 prose prose-sm max-w-none">
              {form.contentMarkdown.trim() ? (
                <MarkdownRenderer content={form.contentMarkdown} />
              ) : (
                <p className="text-[var(--color-text-muted)] italic text-xs">
                  پیش‌نمایش محتوا هنگام تایپ در اینجا نمایش داده خواهد شد...
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
