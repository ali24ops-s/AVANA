import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Loader2,
  FileText,
  ChevronLeft,
} from "lucide-react";
import {
  api,
  type OfficialReviewWorkspace,
} from "../../../lib/api/admin.js";
import { ReviewQueueList } from "../../review/ReviewQueueList.js";

export interface DraftReviewPanelProps {
  courseId: string;
  organizationId?: string;
  onNavigateToApproval?: () => void;
}

export function DraftReviewPanel({
  courseId,
  organizationId = "b4a0b464-16db-4087-92b7-163a1e6f6776",
  onNavigateToApproval,
}: DraftReviewPanelProps) {
  // Official course invariant audit query
  const reviewQuery = useQuery({
    queryKey: ["official-review-workspace", courseId],
    queryFn: async () => {
      return api.get<OfficialReviewWorkspace>(
        `/admin/content-studio/courses/${courseId}/review`,
      );
    },
    refetchInterval: 5000,
  });

  const workspace = reviewQuery.data;
  const drafts = workspace?.draftContents ?? [];
  const unresolvedCount = workspace?.unresolvedLessonMappings ?? 0;

  return (
    <div className="space-y-6">
      {/* Studio Review Header Info */}
      <div className="bg-slate-900/60 rounded-3xl border border-slate-800 p-5 sm:p-6 shadow-xl space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-teal-400" />
              <span>محیط بازبینی پیش‌نویس‌های هوش مصنوعی (Review Workspace)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              پیش‌نویس‌های تولیدشده را در همان تجربه غنی کاربر بررسی، ویرایش، رد یا تایید نمایید.
            </p>
          </div>

          {onNavigateToApproval && (
            <button
              type="button"
              onClick={onNavigateToApproval}
              className="px-4 py-2.5 rounded-xl bg-teal-600/90 hover:bg-teal-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shadow-teal-950/40 w-fit shrink-0"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>انتقال به بخش تایید و انتشار</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Loading state for Invariant Check */}
      {reviewQuery.isLoading && (
        <div className="py-6 flex flex-col items-center justify-center gap-2 text-slate-400 bg-slate-900/40 rounded-2xl border border-slate-800">
          <Loader2 className="w-5 h-5 animate-spin text-teal-400" />
          <p className="text-xs">در حال بارگذاری وضعیت نگاشت درسنامه...</p>
        </div>
      )}

      {/* Error state for Invariant Check */}
      {reviewQuery.isError && (
        <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
          <span>{reviewQuery.error?.message || "خطا در دریافت وضعیت نگاشت دوره"}</span>
        </div>
      )}

      {!reviewQuery.isLoading && (
        /* Lesson Mapping Invariant Check Card */
        <div
          className={`p-4 sm:p-5 rounded-2xl border ${
            unresolvedCount === 0 && drafts.length > 0
              ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-300"
              : unresolvedCount > 0
              ? "bg-rose-950/30 border-rose-500/30 text-rose-300"
              : "bg-slate-900/40 border-slate-800 text-slate-400"
          } flex items-start gap-3.5 shadow-md`}
        >
          {unresolvedCount === 0 && drafts.length > 0 ? (
            <ShieldCheck className="w-6 h-6 shrink-0 mt-0.5 text-emerald-400" />
          ) : unresolvedCount > 0 ? (
            <AlertCircle className="w-6 h-6 shrink-0 mt-0.5 text-rose-400" />
          ) : (
            <FileText className="w-6 h-6 shrink-0 mt-0.5 text-slate-500" />
          )}
          <div className="text-xs space-y-1">
            <div className="font-bold text-sm">
              {drafts.length === 0
                ? "هنوز محتوایی برای بررسی تولید نشده است"
                : unresolvedCount === 0
                ? "نگاشت قطعی درسنامه تایید شد (unresolvedLessonMappings = 0)"
                : `خطای نگاشت درسنامه: ${unresolvedCount} مورد کارت یا سؤال فاقد نگاشت به درس هستند.`}
            </div>
            <p className="opacity-80">
              {unresolvedCount > 0
                ? "طبق ضوابط استودیو رسمی آوانا، تایید نهایی دوره تا زمان رفع کامل خطاهای نگاشت مسدود است."
                : drafts.length > 0
                ? "تمام کارت‌ها و سؤالات با دقت ۱۰۰٪ به درسنامه‌های مربوطه متصل شده‌اند و آماده تایید نهایی هستند."
                : "برای شروع، از برگه «تولید و منابع» یک سند را پردازش و فرآیند هوش مصنوعی را اجرا کنید."}
            </p>
          </div>
        </div>
      )}

      {/* 
        The Shared, Canonical Review Experience
        Exact same component, state management, API routes, and mutations as User Review
      */}
      <div className="pt-2">
        <ReviewQueueList
          organizationId={organizationId}
          courseId={courseId}
        />
      </div>
    </div>
  );
}
