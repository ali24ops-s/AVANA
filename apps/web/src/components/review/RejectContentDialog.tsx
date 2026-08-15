import { useState } from "react";
import { X, AlertCircle, Loader2, Ban } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createReviewApi } from "../../lib/api/review.js";

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
      <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
          <h3 id="reject-dialog-title" className="font-bold text-base text-[var(--color-text)] flex items-center gap-2">
            <Ban className="w-5 h-5 text-red-500" />
            <span>رد کردن پیش‌نویس محتوا</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنجره"
            className="p-1 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            لطفاً دلیل عدم تایید این پیش‌نویس را یادداشت کنید تا در فرآیند بازتولید یا اصلاح محتوا مورد استفاده قرار گیرد.
          </p>

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-400 text-xs">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--color-text)]">
              دلیل عدم تایید *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثال: ناقص بودن عوارض دارویی یا عدم دقت در مکانیسم اثر..."
              rows={4}
              className="w-full px-3.5 py-2.5 bg-[var(--color-surface-warm)] rounded-xl border border-[var(--color-border)] text-xs text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
            />
          </div>
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
            className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm"
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
