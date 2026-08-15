import { useState } from "react";
import { X, Save, Loader2, AlertCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createReviewApi } from "../../lib/api/review.js";
import type { GeneratedContentResource } from "@avana/contracts";

export interface EditContentDialogProps {
  content: GeneratedContentResource;
  organizationId: string;
  courseId: string;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export function EditContentDialog({
  content,
  organizationId,
  courseId,
  isOpen,
  onClose,
  onSaved,
}: EditContentDialogProps) {
  const payload = content.payload as Record<string, unknown>;
  const [title, setTitle] = useState<string>(
    typeof payload.title === "string" ? payload.title : "",
  );
  const [markdown, setMarkdown] = useState<string>(
    typeof payload.content_markdown === "string"
      ? payload.content_markdown
      : JSON.stringify(payload, null, 2),
  );
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const reviewApi = createReviewApi(apiClient);

  const editMutation = useMutation({
    mutationFn: async () => {
      let updatedPayload: Record<string, unknown>;
      if (typeof payload.content_markdown === "string") {
        updatedPayload = {
          ...payload,
          title: title.trim(),
          content_markdown: markdown,
        };
      } else {
        try {
          updatedPayload = JSON.parse(markdown);
        } catch {
          throw new Error("ساختار JSON واردشده معتبر نیست.");
        }
      }

      return reviewApi.editContent(organizationId, courseId, content.id, {
        payload: updatedPayload,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["review-detail", organizationId, courseId, content.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["review-queue", organizationId, courseId],
      });
      onSaved?.();
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "خطا در به‌روزرسانی محتوا");
    },
  });

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-draft-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sans"
      dir="rtl"
    >
      <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
          <h3 id="edit-draft-dialog-title" className="font-bold text-base text-[var(--color-text)]">
            ویرایش پیش‌نویس محتوا
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنجره"
            className="p-1 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {typeof payload.title === "string" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--color-text)]">
                عنوان
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[var(--color-surface-warm)] rounded-xl border border-[var(--color-border)] text-sm text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#008080]"
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="edit-content-body"
              className="text-xs font-semibold text-[var(--color-text)]"
            >
              {typeof payload.content_markdown === "string"
                ? "متن Markdown درس"
                : "داده‌های JSON محتوا"}
            </label>
            <textarea
              id="edit-content-body"
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              rows={12}
              dir="auto"
              className="w-full px-3.5 py-2.5 bg-[var(--color-surface-warm)] rounded-xl border border-[var(--color-border)] text-xs font-mono text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[#008080] resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]">
          <button
            type="button"
            onClick={onClose}
            disabled={editMutation.isPending}
            className="px-4 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={() => editMutation.mutate()}
            disabled={editMutation.isPending}
            className="px-5 py-2.5 bg-[#008080] hover:bg-[#006666] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
          >
            {editMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>در حال ذخیره...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>ذخیره تغییرات</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
