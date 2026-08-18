import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  XCircle,
  Pencil,
  RotateCcw,
  Sparkles,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createReviewApi } from "../../lib/api/review.js";
import { MarkdownRenderer } from "../markdown/MarkdownRenderer.js";
import { EditContentDialog } from "./EditContentDialog.js";
import { RejectContentDialog } from "./RejectContentDialog.js";
import { EvidenceSummary } from "./EvidenceSummary.js";

export interface ContentReviewDetailProps {
  organizationId: string;
  courseId: string;
  contentId: string;
  onBack: () => void;
}

export function ContentReviewDetail({
  organizationId,
  courseId,
  contentId,
  onBack,
}: ContentReviewDetailProps) {
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false);
  const [selectedSessionIndex, setSelectedSessionIndex] = useState<number | "all">("all");
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [regenerateError, setRegenerateError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const apiClient = createApiClient({ baseUrl: getApiBaseUrl() });
  const reviewApi = createReviewApi(apiClient);

  // Fetch content review detail (content + source chunks + generation metadata)
  const detailQuery = useQuery({
    queryKey: ["review-detail", organizationId, courseId, contentId],
    queryFn: () => reviewApi.getContentForReview(organizationId, courseId, contentId),
  });

  // Accept mutation
  const acceptMutation = useMutation({
    mutationFn: () => reviewApi.acceptContent(organizationId, courseId, contentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["review-queue", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["review-detail", organizationId, courseId, contentId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-content", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["course-learning", courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["flashcards", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["flashcards-queue", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["quizzes", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["study-analytics", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["study-recommendations", organizationId, courseId],
      });
      onBack();
    },
    onError: (err: Error) => {
      setAcceptError(err.message || "خطا در تایید و انتشار محتوا.");
    },
  });

  // Regenerate mutation
  const regenerateMutation = useMutation({
    mutationFn: () =>
      reviewApi.regenerateContent(organizationId, courseId, contentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["review-queue", organizationId, courseId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["review-detail", organizationId, courseId, contentId],
      });
      onBack();
    },
    onError: (err: Error) => {
      setRegenerateError(err.message || "خطا در درخواست تولید مجدد.");
    },
  });

  const anyMutationPending = acceptMutation.isPending || regenerateMutation.isPending;

  if (detailQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#008080]" />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-12 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-red-500 mx-auto" />
        <h3 className="text-base font-bold text-[var(--color-text)]">
          خطا در بارگذاری محتوای بازبینی
        </h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          {detailQuery.error?.message || "مورد موردنظر یافت نشد."}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 bg-[#008080] text-white rounded-xl text-xs font-bold"
        >
          بازگشت به صف بازبینی
        </button>
      </div>
    );
  }

  const { content, source_chunks: sourceChunks, generation } = detailQuery.data;
  const payload = content.payload as Record<string, unknown>;

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors w-fit"
        >
          <ArrowRight className="w-4 h-4" />
          <span>بازگشت به صف بازبینی</span>
        </button>

        {/* Action bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setIsEditDialogOpen(true)}
            disabled={anyMutationPending}
            className="px-3.5 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] rounded-xl text-xs font-bold border-2 border-[var(--color-border)] shadow-xs flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
          >
            <Pencil className="w-3.5 h-3.5 text-[#007a7a]" />
            <span>ویرایش پیش‌نویس</span>
          </button>

          <button
            type="button"
            onClick={() => regenerateMutation.mutate()}
            disabled={anyMutationPending}
            className="px-3.5 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] rounded-xl text-xs font-bold border-2 border-[var(--color-border)] shadow-xs flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
          >
            {regenerateMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5 text-[#007a7a]" />
            )}
            <span>{regenerateMutation.isPending ? "در حال بازتولید..." : "تولید مجدد"}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRejectDialogOpen(true)}
            disabled={anyMutationPending}
            className="px-3.5 py-2 bg-red-100 hover:bg-red-200 text-red-900 dark:bg-red-950/80 dark:hover:bg-red-900 dark:text-red-100 rounded-xl text-xs font-bold border-2 border-red-300 dark:border-red-700 shadow-xs flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
          >
            <XCircle className="w-3.5 h-3.5" />
            <span>رد کردن</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setAcceptError(null);
              acceptMutation.mutate();
            }}
            disabled={anyMutationPending}
            className="px-4 py-2 bg-[#007a7a] hover:bg-[#005a5a] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md disabled:opacity-50"
          >
            {acceptMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            <span>{acceptMutation.isPending ? "در حال انتشار..." : "تایید و انتشار"}</span>
          </button>
        </div>
      </div>

      {/* Mutation error banners */}
      {acceptError && (
        <div className="flex items-center gap-2 p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl text-red-700 dark:text-red-400 text-xs font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{acceptError}</span>
        </div>
      )}
      {regenerateError && (
        <div className="flex items-center gap-2 p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-2xl text-red-700 dark:text-red-400 text-xs font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{regenerateError}</span>
        </div>
      )}

      {/* Metadata Overview Card */}
      <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl bg-[#a7d0e6]/30 text-[#008080] flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-md bg-[#008080]/10 text-[#008080]">
                {content.type === "lesson" ? "درس" : content.type === "flashcard" ? "فلش‌کارت" : "آزمون"}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                وضعیت: <strong className="text-[var(--color-text)]">در انتظار بازبینی</strong>
              </span>
            </div>
            <h2 className="text-base font-bold text-[var(--color-text)] mt-1 truncate">
              {String(payload.title || payload.question || "پیش‌نویس تولیدشده")}
            </h2>
            {generation?.prompt_version && (
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono" dir="ltr">
                Prompt: {generation.prompt_version}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Full Width Stacked Layout: Evidence Summary on Top, Generated Content Preview Below */}
      <div className="space-y-6">
        {/* Top: Full Width Evidence Summary */}
        <EvidenceSummary sourceChunks={sourceChunks} payload={payload} />

        {/* Bottom: Full Width Generated Content Preview */}
        <div className="bg-[var(--color-surface)] rounded-3xl border border-[var(--color-border)] p-6 space-y-4 shadow-sm w-full">
          <h3 className="text-sm font-bold text-[var(--color-text)] pb-3 border-b border-[var(--color-border)]">
            پیش‌نمایش محتوای تولیدشده
          </h3>

          {/* Lesson preview */}
          {content.type === "lesson" && (
            <div className="space-y-5">
              {/* Module & Outline Summary Banner */}
              {Boolean(payload.moduleTitle || payload.outline) && (
                <div className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-3">
                  {Boolean(payload.moduleTitle) && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                        سرفصل (Module)
                      </span>
                      <h4 className="text-xs font-bold text-[var(--color-text)]">
                        {String(payload.moduleTitle)}
                      </h4>
                    </div>
                  )}

                  {Array.isArray(payload.outline) && payload.outline.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
                      <span className="text-[11px] font-bold text-[#007a7a] block">
                        فهرست سرفصل‌ها و جلسات استخراج‌شده از جزوه:
                      </span>
                      <ul className="space-y-1.5 text-xs text-[var(--color-text)] pr-3 list-disc">
                        {payload.outline.map((item: { title?: string; description?: string }, idx: number) => (
                          <li key={idx} className="leading-relaxed">
                            <strong>{item.title || `جلسه ${idx + 1}`}</strong>
                            {item.description ? (
                              <span className="text-[var(--color-text-muted)] text-[11px] mr-1.5">
                                — {item.description}
                              </span>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Session Selector Chips (if sessions array is present) */}
              {Array.isArray(payload.sessions) && payload.sessions.length > 1 && (
                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-[var(--color-text-muted)] block">
                    مشاهده جلسه:
                  </span>
                  <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    <button
                      type="button"
                      onClick={() => setSelectedSessionIndex("all")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                        selectedSessionIndex === "all"
                          ? "bg-[#007a7a] text-white shadow-sm"
                          : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]"
                      }`}
                    >
                      همه جلسات (متن کامل)
                    </button>
                    {payload.sessions.map((sess: { title?: string }, idx: number) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedSessionIndex(idx)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors whitespace-nowrap ${
                          selectedSessionIndex === idx
                            ? "bg-[#007a7a] text-white shadow-sm"
                            : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]"
                        }`}
                      >
                        {sess.title || `جلسه ${idx + 1}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Render Selected Session or Full Markdown */}
              <div className="prose prose-sm max-w-none p-4 bg-[var(--color-surface-warm)]/40 rounded-2xl border border-[var(--color-border)]">
                <MarkdownRenderer
                  content={
                    selectedSessionIndex === "all" || !Array.isArray(payload.sessions)
                      ? (payload.contentMarkdown as string) ||
                        (payload.content_markdown as string) ||
                        (payload.markdown as string) ||
                        ""
                      : (payload.sessions[selectedSessionIndex]?.contentMarkdown as string) || ""
                  }
                />
              </div>
            </div>
          )}

          {/* Flashcard preview */}
          {content.type === "flashcard" && (
            <div className="space-y-4">
              {Array.isArray(payload.cards) && payload.cards.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] font-semibold">
                    <span>تعداد فلش‌کارت‌های استخراج‌شده: {payload.cards.length} کارت</span>
                    <span className="text-[#007a7a] font-bold">مرور فاصله‌دار اتمیک</span>
                  </div>
                  {payload.cards.map((c: { question?: string; answer?: string; explanation?: string; cardType?: string; difficulty?: string }, idx: number) => (
                    <div
                      key={idx}
                      className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-[#007a7a]">
                          کارت {idx + 1} {c.cardType ? `• نوع: ${c.cardType}` : ""}
                        </span>
                        {c.difficulty && (
                          <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                            {c.difficulty}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] text-[var(--color-text-muted)] block">پرسش:</span>
                        <p className="text-xs font-bold text-[var(--color-text)]">
                          {String(c.question || "")}
                        </p>
                      </div>
                      <div className="pt-2 border-t border-[var(--color-border)]">
                        <span className="text-[10px] text-green-700 dark:text-green-400 block">پاسخ:</span>
                        <p className="text-xs text-[var(--color-text)] font-medium">
                          {String(c.answer || "")}
                        </p>
                      </div>
                      {Boolean(c.explanation) && (
                        <p className="text-[11px] text-[var(--color-text-muted)] bg-[var(--color-surface)] p-2 rounded-xl border border-[var(--color-border)]">
                          <strong>نکته تکمیلی:</strong> {String(c.explanation)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-2">
                    <span className="text-[10px] font-bold text-[#007a7a]">
                      روی کارت / سوال:
                    </span>
                    <p className="text-sm font-bold text-[var(--color-text)]">
                      {String(payload.question || "")}
                    </p>
                  </div>

                  <div className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-2">
                    <span className="text-[10px] font-bold text-green-700 dark:text-green-400">
                      پشت کارت / پاسخ:
                    </span>
                    <p className="text-sm font-bold text-[var(--color-text)]">
                      {String(payload.answer || "")}
                    </p>
                    {Boolean(payload.explanation) && (
                      <p className="text-xs text-[var(--color-text-muted)] pt-2 border-t border-[var(--color-border)]">
                        {String(payload.explanation)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Quiz preview */}
          {content.type === "quiz" && (
            <div className="space-y-4">
              {Array.isArray(payload.questions) && payload.questions.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] font-semibold">
                    <span>عنوان آزمون: {String(payload.title || "آزمون ارزیابی")}</span>
                    <span className="text-purple-600 font-bold">
                      {payload.questions.length} سوال تستی
                    </span>
                  </div>
                  {payload.questions.map((q: { question?: string; choices?: unknown[]; correctAnswer?: unknown; explanation?: string }, qIdx: number) => (
                    <div
                      key={qIdx}
                      className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#007a7a]">
                          سوال {qIdx + 1}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-[var(--color-text)] leading-relaxed">
                        {String(q.question || "")}
                      </p>
                      {Array.isArray(q.choices) && (
                        <div className="space-y-2 pt-1">
                          {q.choices.map((opt: unknown, idx: number) => {
                            const isCorrect = q.correctAnswer === opt;
                            return (
                              <div
                                key={idx}
                                className={`p-3 rounded-xl text-xs border flex items-center justify-between ${
                                  isCorrect
                                    ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800 text-green-800 dark:text-green-300 font-bold"
                                    : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]"
                                }`}
                              >
                                <span>
                                  <strong>{idx + 1}.</strong> {String(opt)}
                                </span>
                                {isCorrect && (
                                  <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-md">
                                    پاسخ صحیح
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {Boolean(q.explanation) && (
                        <p className="text-xs text-[var(--color-text-muted)] pt-2 border-t border-[var(--color-border)]">
                          <strong>توضیح پاسخ:</strong> {String(q.explanation)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-3">
                  <p className="text-sm font-bold text-[var(--color-text)]">
                    {String(payload.question || "")}
                  </p>
                  {Array.isArray(payload.options) && (
                    <div className="space-y-2 pt-1">
                      {payload.options.map((opt: unknown, idx: number) => {
                        const isCorrect =
                          payload.correct_answer === opt ||
                          payload.correct_index === idx;
                        return (
                          <div
                            key={idx}
                            className={`p-3 rounded-xl text-xs border flex items-center justify-between ${
                              isCorrect
                                ? "bg-green-50 dark:bg-green-950/30 border-green-300 dark:border-green-800 text-green-800 dark:text-green-300 font-bold"
                                : "bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text)]"
                            }`}
                          >
                            <span>
                              <strong>{idx + 1}.</strong> {String(opt)}
                            </span>
                            {isCorrect && (
                              <span className="text-[10px] font-bold text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-2 py-0.5 rounded-md">
                                پاسخ صحیح
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {Boolean(payload.explanation) && (
                    <p className="text-xs text-[var(--color-text-muted)] pt-2 border-t border-[var(--color-border)]">
                      <strong>توضیح:</strong> {String(payload.explanation)}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit Dialog */}
      <EditContentDialog
        content={content}
        organizationId={organizationId}
        courseId={courseId}
        isOpen={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onSaved={() => {
          void detailQuery.refetch();
        }}
      />

      {/* Reject Dialog */}
      <RejectContentDialog
        contentId={contentId}
        organizationId={organizationId}
        courseId={courseId}
        isOpen={isRejectDialogOpen}
        onClose={() => setIsRejectDialogOpen(false)}
        onRejected={onBack}
      />
    </div>
  );
}
