import { useState } from "react";
import { X, AlertCircle, Loader2, Ban } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createReviewApi } from "../../lib/api/review.js";
import { Textarea } from "@avana/ui";

export interface RejectContentDialogProps {
  contentId: string;
  organizationId: string;
  courseId: string;
  isOpen: boolean;
  onClose: () => void;
  onRejected?: () => void;
}

export function RejectContentDialog({
  contentId,
  organizationId,
  courseId,
  isOpen,
  onClose,
  onRejected,
}: RejectContentDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const reviewApi = createReviewApi(apiClient);

  const rejectMutation = useMutation({
    mutationFn: () => {
      if (!reason.trim()) {
        throw new Error("ذکر دلیل رد پیش‌نویس الزامی است.");
      }
      return reviewApi.rejectContent(organizationId, courseId, contentId, {
        reason: reason.trim(),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["review-queue", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["review-detail", organizationId, courseId, contentId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["official-review-workspace", courseId],
      });
      onRejected?.();
      onClose();
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "خطا در رد پیش‌نویس");
    },
  });

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 font-sans"
      dir="rtl"
    >
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
          <h3 id="reject-dialog-title" className="font-bold text-base text-[var(--color-text)] flex items-center gap-2">
            <Ban className="w-5 h-5 text-rose-500" />
            <span>رد کردن پیش‌نویس محتوا</span>
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

        <div className="p-6 space-y-4">
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            لطفاً دلیل عدم تایید این پیش‌نویس را یادداشت کنید تا در فرآیند بازتولید یا اصلاح محتوا مورد استفاده قرار گیرد.
          </p>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-700 dark:text-rose-400 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Textarea
            id="reject-reason-textarea"
            label="دلیل عدم تایید *"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: ناقص بودن عوارض دارویی یا عدم دقت در مکانیسم اثر..."
            rows={4}
            className="resize-none"
          />
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-[var(--color-border)] bg-[var(--color-surface-warm)]">
          <button
            type="button"
            onClick={onClose}
            disabled={rejectMutation.isPending}
            className="px-4 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={() => rejectMutation.mutate()}
            disabled={rejectMutation.isPending || !reason.trim()}
            className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors"
          >
            {rejectMutation.isPending ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>در حال ثبت...</span>
              </>
            ) : (
              <>
                <Ban className="w-3.5 h-3.5" />
                <span>تایید رد پیش‌نویس</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
