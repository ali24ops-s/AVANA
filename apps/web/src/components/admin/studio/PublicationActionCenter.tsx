import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  Send,
  Loader2,
  Archive,
  DollarSign,
  Sparkles,
  GitCommit,
  Eye,
  RotateCcw,
  History,
  X,
  Layers,
} from "lucide-react";
import {
  api,
  type OfficialCourse,
  type OfficialReviewWorkspace,
  type ConsistencyValidationReport,
  type CourseRelease,
} from "../../../lib/api/admin.js";
import { toPersianDigits, calculateCoursePricingBreakdown } from "@avana/domain";

export interface PublicationActionCenterProps {
  course: OfficialCourse;
  onSuccess?: () => void;
}

export function PublicationActionCenter({
  course,
  onSuccess,
}: PublicationActionCenterProps) {
  const queryClient = useQueryClient();

  const [priceInput, setPriceInput] = useState<number>(
    course.product?.price || 499000,
  );

  useEffect(() => {
    setPriceInput(course.product?.price || 499000);
  }, [course.id, course.product?.price]);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftSuccessMsg, setDraftSuccessMsg] = useState<string | null>(null);
  const [approveSuccessMsg, setApproveSuccessMsg] = useState<string | null>(
    null,
  );
  const [publishSuccessMsg, setPublishSuccessMsg] = useState<string | null>(
    null,
  );
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewHierarchy, setPreviewHierarchy] = useState<any | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Review workspace query to check approval invariants
  const reviewQuery = useQuery({
    queryKey: ["official-review-workspace", course.id],
    queryFn: async () => {
      return api.get<OfficialReviewWorkspace>(
        `/admin/content-studio/courses/${course.id}/review`,
      );
    },
  });

  // Consistency validation report
  const consistencyQuery = useQuery({
    queryKey: ["official-consistency", course.id],
    queryFn: async () => {
      return api.get<ConsistencyValidationReport>(
        `/admin/content-studio/courses/${course.id}/validate`,
      );
    },
  });

  const workspace = reviewQuery.data;
  const consistencyReport = consistencyQuery.data;
  const unresolvedCount = workspace?.unresolvedLessonMappings ?? 0;
  const isReadyForApproval =
    Boolean(workspace?.readyForApproval) && unresolvedCount === 0;

  const hasReviewSummary = Boolean(
    workspace?.draftContents?.some(
      (d) =>
        d.contentType === "review_summary" &&
        d.status !== "rejected",
    ),
  );

  const pricingMetrics = useMemo(() => {
    return {
      lessonCount: consistencyReport?.lessonCount ?? course.lessonCount ?? 1,
      flashcardCount: consistencyReport?.flashcardCount ?? course.flashcardCount ?? 0,
      questionCount: consistencyReport?.quizQuestionCount ?? course.quizQuestionCount ?? 0,
      hasReviewSummary,
    };
  }, [
    consistencyReport?.lessonCount,
    consistencyReport?.flashcardCount,
    consistencyReport?.quizQuestionCount,
    course.lessonCount,
    course.flashcardCount,
    course.quizQuestionCount,
    hasReviewSummary,
  ]);

  const pricingBreakdown = useMemo(() => {
    return calculateCoursePricingBreakdown(pricingMetrics);
  }, [pricingMetrics]);

  // 1. Approve Course Mutation
  const approveMutation = useMutation({
    mutationFn: async () => {
      setApproveError(null);
      setApproveSuccessMsg(null);
      const res = await fetch(
        `/v1/admin/content-studio/courses/${course.id}/approve`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "خطا در تایید رسمی دوره");
      }
      return res.json();
    },
    onSuccess: (data) => {
      setApproveSuccessMsg(
        `دوره با موفقیت تایید شد! (${toPersianDigits(data.materialized?.modules ?? 0)} فصل، ${toPersianDigits(data.materialized?.lessons ?? 0)} درس، ${toPersianDigits(data.materialized?.flashcards ?? 0)} فلش‌کارت، ${toPersianDigits(data.materialized?.questions ?? 0)} سؤال تستی)`,
      );
      void queryClient.invalidateQueries({ queryKey: ["official-courses"] });
      void queryClient.invalidateQueries({
        queryKey: ["official-review-workspace", course.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-hierarchy", course.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["official-consistency", course.id],
      });
      if (onSuccess) onSuccess();
    },
    onError: (err: Error) => {
      setApproveError(err.message || "خطا در تایید رسمی دوره");
    },
  });

  // 2. Set Price Mutation
  const pricingMutation = useMutation({
    mutationFn: async () => {
      setPricingError(null);
      const res = await fetch(
        `/v1/admin/content-studio/courses/${course.id}/pricing`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ price: priceInput }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "خطا در ثبت قیمت محصول");
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["official-courses"] });
      void queryClient.invalidateQueries({
        queryKey: ["official-consistency", course.id],
      });
      if (onSuccess) onSuccess();
    },
    onError: (err: Error) => {
      setPricingError(err.message || "خطا در ثبت قیمت");
    },
  });

  // 3. Publish Course Mutation
  const publishMutation = useMutation({
    mutationFn: async () => {
      setPublishError(null);
      setPublishSuccessMsg(null);
      const res = await fetch(
        `/v1/admin/content-studio/courses/${course.id}/publish`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "خطا در انتشار عمومی دوره");
      }
      return res.json();
    },
    onSuccess: () => {
      setPublishSuccessMsg(
        "دوره رسمی با موفقیت منتشر شد و محصول تجاری در وضعیت فعال قرار گرفت.",
      );
      void queryClient.invalidateQueries({ queryKey: ["official-courses"] });
      void queryClient.invalidateQueries({
        queryKey: ["official-consistency", course.id],
      });
      if (onSuccess) onSuccess();
    },
    onError: (err: Error) => {
      setPublishError(err.message || "خطا در انتشار عمومی دوره");
    },
  });

  // 4. Archive Course Mutation
  const archiveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/v1/admin/content-studio/courses/${course.id}/archive`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "خطا در بایگانی دوره");
      }
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["official-courses"] });
      if (onSuccess) onSuccess();
    },
  });

  // 5. Drafts & Releases Queries
  const draftsQuery = useQuery({
    queryKey: ["course-drafts", course.id],
    queryFn: async () => {
      return api.get<{ session: any; changes: any[] }>(
        `/admin/content-studio/courses/${course.id}/drafts`,
      );
    },
  });

  const releasesQuery = useQuery({
    queryKey: ["course-releases", course.id],
    queryFn: async () => {
      return api.get<{ releases: CourseRelease[] }>(
        `/admin/content-studio/courses/${course.id}/releases`,
      );
    },
  });

  const activeDraftSession = draftsQuery.data?.session;
  const draftChanges = draftsQuery.data?.changes ?? [];
  const releases = releasesQuery.data?.releases ?? [];

  // 6. Publish Draft Mutation (Atomic Update)
  const publishDraftMutation = useMutation({
    mutationFn: async () => {
      setDraftError(null);
      setDraftSuccessMsg(null);
      return api.post<{ release: CourseRelease; course: OfficialCourse }>(
        `/admin/content-studio/courses/${course.id}/publish-draft`,
      );
    },
    onSuccess: (data) => {
      setDraftSuccessMsg(
        `تغییرات با موفقیت و به صورت اتمیک منتشر شد و نسخه جدید v${toPersianDigits(data.release.versionNumber)} ایجاد گردید.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["official-courses"] });
      void queryClient.invalidateQueries({ queryKey: ["course-drafts", course.id] });
      void queryClient.invalidateQueries({ queryKey: ["course-releases", course.id] });
      void queryClient.invalidateQueries({ queryKey: ["course-hierarchy", course.id] });
      if (onSuccess) onSuccess();
    },
    onError: (err: Error) => {
      setDraftError(err.message || "خطا در انتشار پیش‌نویس دوره");
    },
  });

  // 7. Discard Draft Mutation
  const discardDraftMutation = useMutation({
    mutationFn: async () => {
      setDraftError(null);
      setDraftSuccessMsg(null);
      return api.post<{ success: boolean; sessionId: string }>(
        `/admin/content-studio/courses/${course.id}/drafts/discard`,
      );
    },
    onSuccess: () => {
      setDraftSuccessMsg("پیش‌نویس تغییرات با موفقیت لغو شد.");
      void queryClient.invalidateQueries({ queryKey: ["course-drafts", course.id] });
      void queryClient.invalidateQueries({ queryKey: ["course-hierarchy", course.id] });
      if (onSuccess) onSuccess();
    },
    onError: (err: Error) => {
      setDraftError(err.message || "خطا در لغو پیش‌نویس دوره");
    },
  });

  // 8. Rollback Release Mutation
  const rollbackMutation = useMutation({
    mutationFn: async (targetVersion: number) => {
      setDraftError(null);
      setDraftSuccessMsg(null);
      return api.post<{ release: CourseRelease; course: OfficialCourse }>(
        `/admin/content-studio/courses/${course.id}/rollback`,
        { targetVersion },
      );
    },
    onSuccess: (data) => {
      setDraftSuccessMsg(
        `دوره با موفقیت به نسخه هدف بازگردانی شد و نسخه جدید v${toPersianDigits(data.release.versionNumber)} ثبت گردید.`,
      );
      void queryClient.invalidateQueries({ queryKey: ["official-courses"] });
      void queryClient.invalidateQueries({ queryKey: ["course-releases", course.id] });
      void queryClient.invalidateQueries({ queryKey: ["course-hierarchy", course.id] });
      if (onSuccess) onSuccess();
    },
    onError: (err: Error) => {
      setDraftError(err.message || "خطا در بازگردانی نسخه دوره");
    },
  });

  // 9. Preview Handler
  const handleOpenPreview = async () => {
    setPreviewLoading(true);
    setDraftError(null);
    try {
      const data = await api.get<any>(
        `/admin/content-studio/courses/${course.id}/preview`,
      );
      setPreviewHierarchy(data);
      setIsPreviewOpen(true);
    } catch (err: any) {
      setDraftError(err.message || "خطا در دریافت پیش‌نمایش دوره");
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Course Version & Release Header */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-default)]/10 border border-[var(--color-primary-default)]/20 flex items-center justify-center shrink-0">
            <GitCommit className="w-5 h-5 text-[var(--color-primary-default)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-[var(--color-text)]">
                {course.name}
              </h3>
              <span className="px-2.5 py-0.5 rounded-full bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] text-xs font-black">
                نسخه v{toPersianDigits(course.version ?? 1)}
              </span>
              {course.status === "published" && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-bold">
                  منتشر شده (Live)
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              شناسه دوره: <span className="font-mono text-[10px]">{course.id}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleOpenPreview}
            disabled={previewLoading}
            className="px-3.5 py-2 rounded-xl bg-[var(--color-surface-warm)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
          >
            {previewLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Eye className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
            )}
            <span>پیش‌نمایش ساختار آموزشی (Preview)</span>
          </button>
        </div>
      </div>

      {draftError && (
        <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
          <span>{draftError}</span>
        </div>
      )}

      {draftSuccessMsg && (
        <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{draftSuccessMsg}</span>
        </div>
      )}

      {/* Draft Changes & Atomic Publish Management */}
      {course.status === "published" && (
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                <Layers className="w-5 h-5 text-[var(--color-primary-default)]" />
                <span>مدیریت پیش‌نویس و انتشار تغییرات دوره (Draft & Atomic Publish)</span>
              </h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                تغییرات جدید در دوره بدون ایجاد اختلال در دسترسی یا پیشرفت دانشجویان، ابتدا در پیش‌نویس ذخیره می‌شوند و با انتشار اتمیک اعمال می‌گردند.
              </p>
            </div>

            <div className="shrink-0">
              {draftChanges.length > 0 ? (
                <span className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-bold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <span>{toPersianDigits(draftChanges.length)} تغییر در انتظار انتشار</span>
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>کاملاً همگام با نسخه زنده</span>
                </span>
              )}
            </div>
          </div>

          {draftChanges.length > 0 ? (
            <div className="space-y-3 pt-2">
              <div className="p-4 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-2">
                <h4 className="text-xs font-bold text-[var(--color-text)]">
                  لیست تغییرات ثبت‌شده در پیش‌نویس:
                </h4>
                <div className="max-h-48 overflow-y-auto space-y-1.5 pe-1">
                  {draftChanges.map((change: any) => (
                    <div
                      key={change.id}
                      className="p-2.5 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)] flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          change.action === "create"
                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                            : change.action === "delete"
                            ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                            : "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                        }`}>
                          {change.action === "create" ? "ایجاد" : change.action === "delete" ? "حذف" : change.action === "reorder" ? "تغییر ترتیب" : "ویرایش"}
                        </span>
                        <span className="font-semibold text-[var(--color-text)]">
                          {change.entityType === "module" ? "سرفصل" : change.entityType === "lesson" ? "درسنامه" : change.entityType === "flashcard" ? "فلش‌کارت" : change.entityType === "quiz" ? "آزمون" : "سؤال"}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--color-text-muted)] truncate max-w-[120px]">
                          {change.entityId}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => discardDraftMutation.mutate()}
                  disabled={discardDraftMutation.isPending}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-rose-600 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all flex items-center gap-1.5"
                >
                  {discardDraftMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                  <span>صرف‌نظر از پیش‌نویس (Discard)</span>
                </button>

                <button
                  type="button"
                  onClick={() => publishDraftMutation.mutate()}
                  disabled={publishDraftMutation.isPending}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all"
                >
                  {publishDraftMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>در حال انتشار اتمیک...</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      <span>انتشار تغییرات و ایجاد نسخه v{toPersianDigits((course.version ?? 1) + 1)}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>
                دوره در حال حاضر در نسخه پایدار v{toPersianDigits(course.version ?? 1)} در حال ارائه به دانشجویان است و تغییر معلقی وجود ندارد.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Release History & Rollback Card */}
      {releases.length > 0 && (
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
                <History className="w-5 h-5 text-[var(--color-primary-default)]" />
                <span>تاریخچه نسخه‌های منتشر شده (Release History)</span>
              </h3>
              <p className="text-xs text-[var(--color-text-muted)]">
                تمام تغییرات گذشته با حفظ پیوستگی Progress کاربران ذخیره شده‌اند و در صورت نیاز امکان Rollback امن وجود دارد.
              </p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            {releases.map((rel: CourseRelease) => {
              const isCurrent = rel.versionNumber === (course.version ?? 1);
              return (
                <div
                  key={rel.id}
                  className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
                    isCurrent
                      ? "bg-emerald-500/5 border-emerald-500/30"
                      : "bg-[var(--color-surface-warm)] border-[var(--color-border)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-black ${
                      isCurrent
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                        : "bg-[var(--color-surface)] text-[var(--color-text-muted)]"
                    }`}>
                      v{toPersianDigits(rel.versionNumber)}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 font-bold text-[var(--color-text)]">
                        <span>انتشار نسخه {toPersianDigits(rel.versionNumber)}</span>
                        {isCurrent && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-bold">
                            نسخه فعال فعلی
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                        {new Date(rel.publishedAt).toLocaleDateString("fa-IR")} — {toPersianDigits(rel.manifest?.length ?? 0)} عملیات تغییر
                      </p>
                    </div>
                  </div>

                  {!isCurrent && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            `آیا مطمئن هستید که می‌خواهید دوره را به نسخه v${rel.versionNumber} بازگردانی (Rollback) کنید؟ این کار محتوا را بازمی‌گرداند و یک نسخه جدید ثبت می‌کند بدون آنکه پیشرفت دانشجویان مخدوش شود.`,
                          )
                        ) {
                          rollbackMutation.mutate(rel.versionNumber);
                        }
                      }}
                      disabled={rollbackMutation.isPending}
                      className="px-3 py-1.5 rounded-xl bg-[var(--color-surface)] hover:bg-amber-500/10 border border-[var(--color-border)] hover:border-amber-500/30 text-[var(--color-text)] hover:text-amber-700 dark:hover:text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-colors self-start sm:self-auto"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                      <span>بازگردانی به این نسخه (Rollback)</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* 1. Official Course Approval Section */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[var(--color-primary-default)]" />
              <span>مرحله ۱: تایید رسمی و ثبت ساختار دوره (Official Approval)</span>
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              تایید محتوای تولیدشده باعث ایجاد ماژول‌ها، درس‌ها، فلش‌کارت‌ها و آزمون‌ها در پایگاه‌داده و تغییر وضعیت دوره به «تایید شده» می‌شود.
            </p>
          </div>

          <div className="shrink-0">
            {course.status === "approved" || course.status === "published" ? (
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>تایید شده است</span>
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text-muted)] text-xs font-semibold">
                در انتظار تایید
              </span>
            )}
          </div>
        </div>

        {/* Approval Alerts */}
        {approveError && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{approveError}</span>
          </div>
        )}

        {approveSuccessMsg && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{approveSuccessMsg}</span>
          </div>
        )}

        {unresolvedCount > 0 && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>
              {toPersianDigits(unresolvedCount)} مورد خطای نگاشت درسنامه وجود دارد. تایید رسمی تا رفع خطاهای نگاشت مسدود است.
            </span>
          </div>
        )}

        {course.status !== "approved" && course.status !== "published" && (
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending || !isReadyForApproval}
              className="px-5 py-2.5 rounded-xl bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-hover)] active:bg-[var(--color-primary-active)] disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2 shadow-sm transition-all whitespace-nowrap shrink-0"
            >
              {approveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>در حال اعتبارسنجی و ثبت ساختار دوره...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تایید رسمی دوره و استقرار ساختار آموزشی</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* 2. Product Pricing Section */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-[var(--color-primary-default)]" />
            <span>مرحله ۲: قیمت‌گذاری محصول تجاری (Product Pricing)</span>
          </h3>
          <p className="text-xs text-[var(--color-text-muted)]">
            قیمت دسترسی مادام‌العمر به دوره را تعیین نمایید. این قیمت در کاتالوگ فروش و فرآیند خرید اعمال می‌شود.
          </p>
        </div>

        {pricingError && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{pricingError}</span>
          </div>
        )}

        {/* Suggested Course Price Recommendation Box */}
        <div
          data-testid="suggested-course-price-card"
          className="p-4 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--color-text)]">
              <Sparkles className="w-4 h-4 text-[var(--color-primary-default)]" />
              <span>قیمت پیشنهادی آوانا</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span
                data-testid="suggested-price-value"
                className="text-base font-extrabold text-[var(--color-primary-default)]"
              >
                {toPersianDigits(pricingBreakdown.suggestedCoursePrice.toLocaleString("fa-IR"))}
              </span>
              <span className="text-[11px] text-[var(--color-text-muted)]">تومان</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--color-border)]/60 text-[11px] text-[var(--color-text-muted)]">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                قیمت پایه محاسباتی:{" "}
                <strong
                  data-testid="base-price-value"
                  className="text-[var(--color-text)] font-semibold"
                >
                  {toPersianDigits(pricingBreakdown.basePrice.toLocaleString("fa-IR"))} تومان
                </strong>
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold text-[10px] whitespace-nowrap">
                ۱۵٪ کمتر از قیمت محاسبه‌شده
              </span>
            </div>

            <button
              type="button"
              data-testid="apply-suggested-price-btn"
              onClick={() => setPriceInput(pricingBreakdown.suggestedCoursePrice)}
              className="text-[11px] font-bold text-[var(--color-primary-default)] hover:underline flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
            >
              استفاده از قیمت پیشنهادی
            </button>
          </div>
        </div>

        {/* Pricing Form */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 pt-2">
          <div className="flex-1 space-y-1.5">
            <label
              htmlFor="course-price-input"
              className="text-xs font-bold text-[var(--color-text-muted)]"
            >
              قیمت فروش دوره (تومان) *
            </label>
            <input
              id="course-price-input"
              type="number"
              min={1000}
              step={1000}
              value={priceInput}
              onChange={(e) =>
                setPriceInput(parseInt(e.target.value, 10) || 0)
              }
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-default)] focus:border-transparent transition-all"
            />
          </div>

          <div className="sm:self-end">
            <button
              type="button"
              onClick={() => pricingMutation.mutate()}
              disabled={pricingMutation.isPending}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] border border-[var(--color-border)] text-[var(--color-text)] text-xs font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
            >
              {pricingMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ShoppingBag className="w-4 h-4 text-[var(--color-primary-default)]" />
              )}
              <span>ثبت قیمت تجاری</span>
            </button>
          </div>
        </div>
      </div>

      {/* 3. Consistency Validation & Publishing Section */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-5 sm:p-6 shadow-sm space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-bold text-[var(--color-text)] flex items-center gap-2">
            <Send className="w-5 h-5 text-[var(--color-primary-default)]" />
            <span>مرحله ۳: اعتبارسنجی الزامات و انتشار عمومی (Publish & Activate)</span>
          </h3>
          <p className="text-xs text-[var(--color-text-muted)]">
            بررسی نهایی الزامات پایگاه‌داده و فعال‌سازی فروش دوره برای دانشجویان در بستر سراسری آوانا.
          </p>
        </div>

        {/* Consistency Validation Checklist */}
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-[var(--color-text-muted)]">
            چک‌لیست اعتبارسنجی پیش از انتشار (Consistency Pre-flight):
          </h4>

          {consistencyQuery.isLoading ? (
            <div className="p-4 text-center text-xs text-[var(--color-text-muted)] flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary-default)]" />
              <span>در حال اعتبارسنجی الزامات دوره...</span>
            </div>
          ) : consistencyReport ? (
            <div
              className={`p-4 rounded-xl border text-xs space-y-2 ${
                consistencyReport.valid
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-800 dark:text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/20 text-rose-800 dark:text-rose-300"
              }`}
            >
              <div className="font-bold flex items-center gap-2">
                {consistencyReport.valid ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                )}
                <span>
                  {consistencyReport.valid
                    ? "تمامی الزامات انتشار با موفقیت تایید شد."
                    : "برخی الزامات انتشار تأمین نشده است:"}
                </span>
              </div>

              {!consistencyReport.valid && (
                <ul className="list-disc list-inside space-y-1 text-[11px] opacity-90 ps-2">
                  {consistencyReport.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
        </div>

        {publishError && (
          <div className="p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
            <span>{publishError}</span>
          </div>
        )}

        {publishSuccessMsg && (
          <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{publishSuccessMsg}</span>
          </div>
        )}

        {/* Final Publish Button */}
        <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 border-t border-[var(--color-border)]">
          <div>
            {course.status !== "archived" && (
              <button
                type="button"
                onClick={() => {
                  if (
                    confirm(
                      "آیا از بایگانی کردن این دوره رسمی و توقف فروش آن اطمینان دارید؟",
                    )
                  ) {
                    archiveMutation.mutate();
                  }
                }}
                disabled={archiveMutation.isPending}
                className="px-4 py-2 text-[var(--color-text-muted)] hover:text-rose-600 hover:bg-rose-500/10 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Archive className="w-3.5 h-3.5" />
                <span>بایگانی دوره</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => publishMutation.mutate()}
            disabled={
              publishMutation.isPending ||
              !consistencyReport?.valid ||
              course.status === "published"
            }
            className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all whitespace-nowrap shrink-0 ${
              course.status === "published"
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 cursor-default"
                : "bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white"
            }`}
          >
            {publishMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>در حال انتشار و فعال‌سازی فروش...</span>
              </>
            ) : course.status === "published" ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>دوره منتشر شده و در حال فروش است</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>انتشار عمومی دوره و فعال‌سازی فروش</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Preview Hierarchy Modal */}
      {isPreviewOpen && previewHierarchy && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] shadow-2xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-[var(--color-border)] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-[var(--color-primary-default)]" />
                <h3 className="text-base font-bold text-[var(--color-text)]">
                  پیش‌نمایش ساختار آموزشی دوره
                </h3>
                {previewHierarchy.isDraftPreview && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs font-bold">
                    پیش‌نویس فعال
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-warm)] transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] pb-2 border-b border-[var(--color-border)]">
                <span>نام دوره: <strong className="text-[var(--color-text)]">{previewHierarchy.name}</strong></span>
                <span>نسخه: <strong className="text-[var(--color-text)]">v{toPersianDigits(previewHierarchy.version ?? 1)}</strong></span>
              </div>

              <div className="space-y-3">
                {previewHierarchy.modules?.map((m: any) => (
                  <div key={m.id} className="p-3.5 rounded-xl bg-[var(--color-surface-warm)] border border-[var(--color-border)] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-[var(--color-text)]">
                        فصل: {m.title}
                      </span>
                      {m.draftAction && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.draftAction === "create" ? "bg-emerald-500/10 text-emerald-700" : m.draftAction === "delete" ? "bg-rose-500/10 text-rose-700" : "bg-blue-500/10 text-blue-700"
                        }`}>
                          {m.draftAction === "create" ? "جدید" : m.draftAction === "delete" ? "حذف شده" : "ویرایش شده"}
                        </span>
                      )}
                    </div>

                    <div className="ps-3 space-y-1">
                      {m.lessons?.map((l: any) => (
                        <div key={l.id} className="flex items-center justify-between text-xs text-[var(--color-text-muted)] py-1 border-t border-[var(--color-border)]/50">
                          <span>• {l.title}</span>
                          {l.draftAction && (
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                              l.draftAction === "create" ? "bg-emerald-500/10 text-emerald-700" : l.draftAction === "delete" ? "bg-rose-500/10 text-rose-700" : "bg-blue-500/10 text-blue-700"
                            }`}>
                              {l.draftAction === "create" ? "درس جدید" : l.draftAction === "delete" ? "حذف" : "ویرایش"}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-[var(--color-border)] flex justify-end">
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-2 rounded-xl bg-[var(--color-surface-warm)] text-[var(--color-text)] text-xs font-bold hover:bg-[var(--color-border)] transition-colors"
              >
                بستن
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
