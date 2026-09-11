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
  Clock,
  Zap,
  Bookmark,
  Scale,
  BrainCircuit,
  GraduationCap,
  Hash,
} from "lucide-react";
import {
  type ReviewSummaryPayload,
  flattenReviewSummarySections,
  toPersianDigits,
} from "@avana/domain";
import { createApiClient, getApiBaseUrl } from "../../lib/api/client.js";
import { createReviewApi } from "../../lib/api/review.js";
import { MarkdownRenderer, RichContent } from "../markdown/MarkdownRenderer.js";
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
        queryKey: ["flashcards", organizationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["flashcards-queue", organizationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["flashcard-summary", organizationId],
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
      void queryClient.invalidateQueries({
        queryKey: ["official-review-workspace", courseId],
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
      void queryClient.invalidateQueries({
        queryKey: ["official-review-workspace", courseId],
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
        <Loader2 className="w-8 h-8 animate-spin text-[var(--color-primary-default)]" />
      </div>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-12 text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <h3 className="text-base font-bold text-[var(--color-text)]">
          خطا در بارگذاری محتوای بازبینی
        </h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          {detailQuery.error?.message || "مورد موردنظر یافت نشد."}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2 bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-contrast)] rounded-xl text-xs font-bold transition-colors"
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
            className="px-3.5 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] rounded-xl text-xs font-bold border border-[var(--color-border)] shadow-xs flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            <Pencil className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
            <span>ویرایش پیش‌نویس</span>
          </button>

          <button
            type="button"
            onClick={() => regenerateMutation.mutate()}
            disabled={anyMutationPending}
            className="px-3.5 py-2 bg-[var(--color-surface)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] rounded-xl text-xs font-bold border border-[var(--color-border)] shadow-xs flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            {regenerateMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RotateCcw className="w-3.5 h-3.5 text-[var(--color-primary-default)]" />
            )}
            <span>{regenerateMutation.isPending ? "در حال بازتولید..." : "تولید مجدد"}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRejectDialogOpen(true)}
            disabled={anyMutationPending}
            className="px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-400 rounded-xl text-xs font-bold border border-rose-500/20 shadow-xs flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none transition-colors"
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
            className="px-4 py-2 bg-[var(--color-primary-default)] hover:bg-[var(--color-primary-hover)] text-[var(--color-primary-contrast)] rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md disabled:opacity-50 transition-colors"
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
        <div className="flex items-center gap-2 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-700 dark:text-rose-400 text-xs font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{acceptError}</span>
        </div>
      )}
      {regenerateError && (
        <div className="flex items-center gap-2 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-700 dark:text-rose-400 text-xs font-medium">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{regenerateError}</span>
        </div>
      )}

      {/* Metadata Overview Card */}
      <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)] flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-md bg-[var(--color-primary-default)]/10 text-[var(--color-primary-default)]">
                {content.type === "lesson"
                  ? "درس"
                  : content.type === "flashcard"
                  ? "فلش‌کارت"
                  : content.type === "quiz"
                  ? "آزمون"
                  : content.type === "review_summary"
                  ? "خلاصه مروری"
                  : "محتوای آموزشی"}
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
        <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-6 space-y-4 shadow-sm w-full">
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
                      <span className="text-[11px] font-bold text-[var(--color-primary-default)] block">
                        فهرست سرفصل‌ها و جلسات استخراج‌شده از جزوه:
                      </span>
                      <ul className="space-y-1.5 text-xs text-[var(--color-text)] ps-3 list-disc">
                        {payload.outline.map((item: { title?: string; description?: string }, idx: number) => (
                          <li key={idx} className="leading-relaxed">
                            <strong>{item.title || `جلسه ${toPersianDigits(idx + 1)}`}</strong>
                            {item.description ? (
                              <span className="text-[var(--color-text-muted)] text-[11px] me-1.5">
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

              {/* Sessions Tabs if Multiple */}
              {Array.isArray(payload.sessions) && payload.sessions.length > 1 && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-[var(--color-text-muted)] block">
                    جلسات درسنامه ({toPersianDigits(payload.sessions.length)} جلسه):
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedSessionIndex("all")}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                        selectedSessionIndex === "all"
                          ? "bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] shadow-sm"
                          : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]"
                      }`}
                    >
                      کل درسنامه
                    </button>
                    {payload.sessions.map((sess: { title?: string }, idx: number) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedSessionIndex(idx)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                          selectedSessionIndex === idx
                            ? "bg-[var(--color-primary-default)] text-[var(--color-primary-contrast)] shadow-sm"
                            : "bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] border border-[var(--color-border)]"
                        }`}
                      >
                        {sess.title || `جلسه ${toPersianDigits(idx + 1)}`}
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
                  enableLessonCallouts
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
                    <span>تعداد فلش‌کارت‌های استخراج‌شده: {toPersianDigits(payload.cards.length)} کارت</span>
                    <span className="text-[var(--color-primary-default)] font-bold">مرور فاصله‌دار اتمیک</span>
                  </div>
                  {payload.cards.map((c: { question?: string; answer?: string; explanation?: string; cardType?: string; difficulty?: string }, idx: number) => (
                    <div
                      key={idx}
                      className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-[var(--color-primary-default)]">
                          کارت {toPersianDigits(idx + 1)} {c.cardType ? `• نوع: ${c.cardType}` : ""}
                        </span>
                        {c.difficulty && (
                          <span className="text-[10px] font-semibold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded">
                            {c.difficulty}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-[10px] text-[var(--color-text-muted)] block">پرسش:</span>
                        <div className="text-xs font-bold text-[var(--color-text)]">
                          <RichContent content={c.question} inline />
                        </div>
                      </div>
                      <div className="pt-2 border-t border-[var(--color-border)]">
                        <span className="text-[10px] text-green-700 dark:text-green-400 block">پاسخ:</span>
                        <div className="text-xs text-[var(--color-text)] font-medium">
                          <RichContent content={c.answer} inline />
                        </div>
                      </div>
                      {Boolean(c.explanation) && (
                        <div className="text-[11px] text-[var(--color-text-muted)] bg-[var(--color-surface)] p-2 rounded-xl border border-[var(--color-border)]">
                          <strong>نکته تکمیلی:</strong> <RichContent content={c.explanation} inline />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-2">
                    <span className="text-[10px] font-bold text-[var(--color-primary-default)]">
                      روی کارت / سوال:
                    </span>
                    <div className="text-sm font-bold text-[var(--color-text)]">
                      <RichContent content={payload.question as string} />
                    </div>
                  </div>

                  <div className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-2">
                    <span className="text-[10px] font-bold text-green-700 dark:text-green-400">
                      پشت کارت / پاسخ:
                    </span>
                    <div className="text-sm font-bold text-[var(--color-text)]">
                      <RichContent content={payload.answer as string} />
                    </div>
                    {Boolean(payload.explanation) && (
                      <div className="text-xs text-[var(--color-text-muted)] pt-2 border-t border-[var(--color-border)]">
                        <RichContent content={payload.explanation as string} />
                      </div>
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
                      {toPersianDigits(payload.questions.length)} سوال تستی
                    </span>
                  </div>
                  {payload.questions.map((q: { question?: string; choices?: unknown[]; correctAnswer?: unknown; explanation?: string }, qIdx: number) => (
                    <div
                      key={qIdx}
                      className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[var(--color-primary-default)]">
                          سوال {toPersianDigits(qIdx + 1)}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-[var(--color-text)] leading-relaxed">
                        <RichContent content={q.question} />
                      </div>
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
                                  <strong>{idx + 1}.</strong> <RichContent content={String(opt)} inline />
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
                        <div className="text-xs text-[var(--color-text-muted)] pt-2 border-t border-[var(--color-border)]">
                          <strong>توضیح پاسخ:</strong> <RichContent content={q.explanation} inline />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-3">
                  <div className="text-sm font-bold text-[var(--color-text)]">
                    <RichContent content={payload.question as string} />
                  </div>
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
                              <strong>{idx + 1}.</strong> <RichContent content={String(opt)} inline />
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

          {/* Review Summary preview */}
          {content.type === "review_summary" && (() => {
            const summaryPayload = payload as unknown as Partial<ReviewSummaryPayload>;
            const sections = Array.isArray(summaryPayload.sections) ? summaryPayload.sections : [];
            const finalTakeaways = Array.isArray(summaryPayload.finalTakeaways) ? summaryPayload.finalTakeaways : [];
            const categories = flattenReviewSummarySections(sections);

            const hasKeyPoints = categories.keyPoints.length > 0;
            const hasMechanisms = categories.mechanisms.length > 0;
            const hasClassifications = categories.classifications.length > 0;
            const hasComparisons = categories.comparisons.length > 0;
            const hasMemorization = categories.memorizationPoints.length > 0;
            const hasExamPoints = categories.examPoints.length > 0;

            return (
              <div className="space-y-5">
                {/* Header info */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)]">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-[var(--color-primary-default)]" />
                    <h4 className="text-xs font-bold text-[var(--color-text)]">
                      {summaryPayload.title || "خلاصه مروری مبحث"}
                    </h4>
                  </div>
                  {typeof summaryPayload.estimatedReadingMinutes === "number" && (
                    <div className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] font-medium">
                      <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>
                        زمان تخمینی مطالعه: {summaryPayload.estimatedReadingMinutes} دقیقه
                      </span>
                    </div>
                  )}
                </div>

                {/* Overview */}
                {Boolean(summaryPayload.overview) && (
                  <div className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-2">
                    <div className="flex items-center gap-2 text-[var(--color-primary-default)]">
                      <Sparkles className="w-4 h-4" />
                      <h4 className="text-xs font-bold">چکیده یک‌دقیقه‌ای</h4>
                    </div>
                    <p className="text-xs text-[var(--color-text)] leading-relaxed">
                      {summaryPayload.overview}
                    </p>
                  </div>
                )}

                {/* Category-First Review Sheet Boxes */}
                {/* 1. Key Points */}
                {hasKeyPoints && (
                  <div className="p-5 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                      <div className="flex items-center gap-2 text-[var(--color-primary-default)]">
                        <CheckCircle2 className="w-4 h-4" />
                        <h4 className="text-xs font-bold">نکات کلیدی و مفاهیم اصلی</h4>
                      </div>
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        {categories.keyPoints.length} نکته
                      </span>
                    </div>
                    <ul className="space-y-1.5 text-xs text-[var(--color-text)] ps-3 list-disc">
                      {categories.keyPoints.map((point, pIdx) => (
                        <li key={pIdx} className="leading-relaxed">
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* 2 & 3. Mechanisms & Classifications */}
                {(hasMechanisms || hasClassifications) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {hasMechanisms && (
                      <div className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-2.5">
                        <div className="flex items-center justify-between pb-1.5 border-b border-[var(--color-border)]">
                          <div className="flex items-center gap-1.5 text-cyan-700 dark:text-cyan-400">
                            <BrainCircuit className="w-3.5 h-3.5" />
                            <h4 className="text-xs font-bold">مکانیسم‌های سلولی / مولکولی</h4>
                          </div>
                          <span className="text-[10px] text-[var(--color-text-muted)]">
                            {categories.mechanisms.length} مورد
                          </span>
                        </div>
                        <ul className="space-y-1 text-xs text-[var(--color-text)] ps-3 list-disc">
                          {categories.mechanisms.map((m, mIdx) => (
                            <li key={mIdx} className="leading-relaxed">
                              {m}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {hasClassifications && (
                      <div className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-2.5">
                        <div className="flex items-center justify-between pb-1.5 border-b border-[var(--color-border)]">
                          <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
                            <Hash className="w-3.5 h-3.5" />
                            <h4 className="text-xs font-bold">دسته‌بندی و طبقه‌بندی ساختاری</h4>
                          </div>
                          <span className="text-[10px] text-[var(--color-text-muted)]">
                            {categories.classifications.length} دسته
                          </span>
                        </div>
                        <ul className="space-y-1 text-xs text-[var(--color-text)] ps-3 list-disc">
                          {categories.classifications.map((c, cIdx) => (
                            <li key={cIdx} className="leading-relaxed">
                              {c}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Comparisons (Key Distinctions) - Single Unified Box */}
                {hasComparisons && (
                  <div className="p-5 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-3">
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--color-border)]">
                      <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                        <Scale className="w-4 h-4" />
                        <h4 className="text-xs font-bold">مقایسه‌ها و تفاوت‌های کلیدی (Key Distinctions)</h4>
                      </div>
                      <span className="text-[11px] text-[var(--color-text-muted)]">
                        {categories.comparisons.length} مقایسه
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {categories.comparisons.map((comp, compIdx) => {
                        if (typeof comp === "string") {
                          return (
                            <p key={compIdx} className="text-xs text-[var(--color-text)] leading-relaxed p-2.5 bg-[var(--color-surface)] rounded-xl border border-[var(--color-border)]">
                              • {comp}
                            </p>
                          );
                        }
                        return (
                          <div
                            key={compIdx}
                            className="p-3 bg-[var(--color-surface)] rounded-xl text-xs space-y-1.5 border border-[var(--color-border)]"
                          >
                            <div className="flex items-center gap-2 font-bold text-[var(--color-text)]">
                              <span>{comp.conceptA}</span>
                              <span className="text-purple-600 dark:text-purple-400 font-normal text-[11px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/50">
                                در مقایسه با
                              </span>
                              <span>{comp.conceptB}</span>
                            </div>
                            {comp.keyDifferences && (
                              <p className="text-[var(--color-text-muted)] text-[11px] leading-relaxed">
                                <strong className="text-[var(--color-text)]">وجه تمایز: </strong>
                                {comp.keyDifferences}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 5 & 6. Memorization & Exam Points */}
                {(hasMemorization || hasExamPoints) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {hasMemorization && (
                      <div className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-2.5">
                        <div className="flex items-center justify-between pb-1.5 border-b border-[var(--color-border)]">
                          <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                            <Zap className="w-3.5 h-3.5" />
                            <h4 className="text-xs font-bold">نکات حفظی و اعداد مهم</h4>
                          </div>
                          <span className="text-[10px] text-[var(--color-text-muted)]">
                            {categories.memorizationPoints.length} نکته
                          </span>
                        </div>
                        <ul className="space-y-1 text-xs text-[var(--color-text)] ps-3 list-disc">
                          {categories.memorizationPoints.map((item, idx) => (
                            <li key={idx} className="leading-relaxed">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {hasExamPoints && (
                      <div className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-2.5">
                        <div className="flex items-center justify-between pb-1.5 border-b border-[var(--color-border)]">
                          <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400">
                            <GraduationCap className="w-3.5 h-3.5" />
                            <h4 className="text-xs font-bold">نکات مهم و پرتکرار آزمونی</h4>
                          </div>
                          <span className="text-[10px] text-[var(--color-text-muted)]">
                            {categories.examPoints.length} نکته
                          </span>
                        </div>
                        <ul className="space-y-1 text-xs text-[var(--color-text)] ps-3 list-disc">
                          {categories.examPoints.map((item, idx) => (
                            <li key={idx} className="leading-relaxed">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Final Takeaways */}
                {finalTakeaways.length > 0 && (
                  <div className="p-4 bg-[var(--color-surface-warm)] rounded-2xl border border-[var(--color-border)] space-y-2">
                    <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                      <Bookmark className="w-4 h-4" />
                      <h4 className="text-xs font-bold">جمع‌بندی نهایی</h4>
                    </div>
                    <ul className="space-y-1.5 text-xs text-[var(--color-text)] ps-3 list-disc">
                      {finalTakeaways.map((takeaway, tIdx) => (
                        <li key={tIdx} className="leading-relaxed">
                          {takeaway}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })()}
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
