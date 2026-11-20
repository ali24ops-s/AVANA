import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Plus,
  Eye,
  Save,
  Check,
  Trash2,
  Edit3,
  ArrowUp,
  ArrowDown,
  Globe,
  Settings,
  HelpCircle,
  Copy,
  ExternalLink,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider.js";
import {
  usePollDetails,
  useUpdatePollMutation,
  usePublishPollMutation,
  useClosePollMutation,
  useCreateQuestionMutation,
  useUpdateQuestionMutation,
  useDeleteQuestionMutation,
  useReorderQuestionsMutation,
} from "../../hooks/useStudioPolls.js";
import type {
  Poll,
  PollQuestion,
  CreatePollQuestionInput,
  UpdatePollQuestionInput,
} from "../../lib/api/polls-api.js";
import {
  Button,
  Input,
  LoadingState,
  Alert,
  Dialog,
} from "../../components/ui/index.js";
import { PollPreviewModal } from "../../components/studio/polls/PollPreviewModal.js";
import {
  toLocalDatetimeInputValue,
  toUtcIsoString,
} from "../../lib/date-utils.js";

export { toLocalDatetimeInputValue, toUtcIsoString };
import { PollQuestionEditor } from "../../components/studio/polls/PollQuestionEditor.js";
import { toPersianDigits } from "@avana/domain";

export function StudioPollEditorPage() {
  const { pollId } = useParams<{ pollId: string }>();
  const navigate = useNavigate();
  const { user, memberships } = useAuth();

  // RBAC checks
  const isPlatformAdmin = user?.role === "platform_admin";
  const isOrgAdmin =
    user?.role === "organization_admin" ||
    memberships?.some((m) => m.role === "organization_admin");
  const isContentWorker =
    user?.role === "content_worker" ||
    (!isPlatformAdmin && !isOrgAdmin && memberships?.some((m) => m.role === "content_worker"));

  const canPublishAndClose = isPlatformAdmin || isOrgAdmin;

  // Data query
  const { data: poll, isLoading, isError, error, refetch } = usePollDetails(pollId);

  // Mutations
  const updatePollMutation = useUpdatePollMutation(pollId);
  const publishMutation = usePublishPollMutation();
  const closeMutation = useClosePollMutation();
  const createQuestionMutation = useCreateQuestionMutation(pollId || "");
  const updateQuestionMutation = useUpdateQuestionMutation(pollId || "");
  const deleteQuestionMutation = useDeleteQuestionMutation(pollId || "");
  const reorderQuestionsMutation = useReorderQuestionsMutation(pollId || "");

  // Active Tab: "questions" | "settings"
  const [activeTab, setActiveTab] = useState<"questions" | "settings">("questions");

  // Metadata form state
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [coverImageUrl, setCoverImageUrl] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [allowAnonymous, setAllowAnonymous] = useState(true);
  const [showResultsAfterVote, setShowResultsAfterVote] = useState(false);
  const [requireAllQuestions, setRequireAllQuestions] = useState(false);
  const [ctaTitle, setCtaTitle] = useState("");
  const [ctaUrl, setCtaUrl] = useState("");
  const [ctaButtonText, setCtaButtonText] = useState("");

  const [copiedLink, setCopiedLink] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  // Question Editor state
  const [isQuestionEditorOpen, setIsQuestionEditorOpen] = useState(false);
  const [questionToEdit, setQuestionToEdit] = useState<PollQuestion | null>(null);

  // Question Delete state
  const [questionToDelete, setQuestionToDelete] = useState<PollQuestion | null>(null);

  // Preview Modal state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Sync initial server data into form state
  useEffect(() => {
    if (poll) {
      setTitle(poll.title || "");
      setSlug(poll.slug || "");
      setDescription(poll.description || "");
      setCoverImageUrl(poll.coverImageUrl || "");
      setStartsAt(toLocalDatetimeInputValue(poll.startsAt));
      setEndsAt(toLocalDatetimeInputValue(poll.endsAt));
      setAllowAnonymous(poll.settings?.allowAnonymous ?? true);
      setShowResultsAfterVote(poll.settings?.showResultsAfterVote ?? false);
      setRequireAllQuestions(poll.settings?.requireAllQuestions ?? false);
      setCtaTitle(poll.settings?.ctaTitle || "");
      setCtaUrl(poll.settings?.ctaUrl || "");
      setCtaButtonText(poll.settings?.ctaButtonText || "");
    }
  }, [poll]);

  // Dirty state detection
  const isDirty = useMemo(() => {
    if (!poll) return false;
    const initialStartsAt = toLocalDatetimeInputValue(poll.startsAt);
    const initialEndsAt = toLocalDatetimeInputValue(poll.endsAt);

    return (
      title !== (poll.title || "") ||
      slug !== (poll.slug || "") ||
      description !== (poll.description || "") ||
      coverImageUrl !== (poll.coverImageUrl || "") ||
      startsAt !== initialStartsAt ||
      endsAt !== initialEndsAt ||
      allowAnonymous !== (poll.settings?.allowAnonymous ?? true) ||
      showResultsAfterVote !== (poll.settings?.showResultsAfterVote ?? false) ||
      requireAllQuestions !== (poll.settings?.requireAllQuestions ?? false) ||
      ctaTitle !== (poll.settings?.ctaTitle || "") ||
      ctaUrl !== (poll.settings?.ctaUrl || "") ||
      ctaButtonText !== (poll.settings?.ctaButtonText || "")
    );
  }, [
    poll,
    title,
    slug,
    description,
    coverImageUrl,
    startsAt,
    endsAt,
    allowAnonymous,
    showResultsAfterVote,
    requireAllQuestions,
    ctaTitle,
    ctaUrl,
    ctaButtonText,
  ]);

  // Unsaved changes protection
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Questions sorted by sortOrder
  const sortedQuestions = useMemo(() => {
    const list = [...(poll?.questions || [])];
    return list.sort((a, b) => a.sortOrder - b.sortOrder);
  }, [poll?.questions]);

  // Check if content worker is restricted on published poll
  const isContentWorkerBlocked = isContentWorker && poll?.status === "published";

  // Actions
  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!pollId) return;

    if (!title.trim()) {
      setPageError("عنوان نظرسنجی نمی‌تواند خالی باشد.");
      return;
    }

    try {
      setPageError(null);
      await updatePollMutation.mutateAsync({
        id: pollId,
        data: {
          title: title.trim(),
          slug: slug.trim() || undefined,
          description: description.trim() || null,
          coverImageUrl: coverImageUrl.trim() || null,
          startsAt: toUtcIsoString(startsAt),
          endsAt: toUtcIsoString(endsAt),
          settings: {
            allowAnonymous,
            showResultsAfterVote,
            requireAllQuestions,
            ctaTitle: ctaTitle.trim() || undefined,
            ctaUrl: ctaUrl.trim() || undefined,
            ctaButtonText: ctaButtonText.trim() || undefined,
          },
        },
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : "خطا در ذخیره مشخصات");
    }
  };

  const handleCopyLink = () => {
    if (!poll?.slug) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/polls/${poll.slug}`;
    void navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handlePublish = async () => {
    if (!pollId) return;
    try {
      setPageError(null);
      await publishMutation.mutateAsync(pollId);
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : "خطا در انتشار نظرسنجی");
    }
  };

  const handleClose = async () => {
    if (!pollId) return;
    try {
      setPageError(null);
      await closeMutation.mutateAsync(pollId);
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : "خطا در بستن نظرسنجی");
    }
  };

  // Question handlers
  const handleOpenAddQuestion = () => {
    if (isContentWorkerBlocked) return;
    setQuestionToEdit(null);
    setIsQuestionEditorOpen(true);
  };

  const handleOpenEditQuestion = (q: PollQuestion) => {
    if (isContentWorkerBlocked) return;
    setQuestionToEdit(q);
    setIsQuestionEditorOpen(true);
  };

  const handleSaveQuestion = async (data: CreatePollQuestionInput | UpdatePollQuestionInput) => {
    try {
      setPageError(null);
      if (questionToEdit) {
        await updateQuestionMutation.mutateAsync({
          questionId: questionToEdit.id,
          data,
        });
      } else {
        await createQuestionMutation.mutateAsync(data as CreatePollQuestionInput);
      }
      setIsQuestionEditorOpen(false);
      setQuestionToEdit(null);
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : "خطا در ذخیره سؤال");
    }
  };

  const handleDeleteQuestionConfirm = async () => {
    if (!questionToDelete) return;
    try {
      setPageError(null);
      await deleteQuestionMutation.mutateAsync(questionToDelete.id);
      setQuestionToDelete(null);
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : "خطا در حذف سؤال");
    }
  };

  const handleMoveQuestion = async (index: number, direction: "up" | "down") => {
    if (isContentWorkerBlocked) return;
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sortedQuestions.length) return;

    const reordered = [...sortedQuestions];
    const temp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = temp;

    try {
      setPageError(null);
      await reorderQuestionsMutation.mutateAsync(reordered.map((q) => q.id));
    } catch (err: unknown) {
      setPageError(err instanceof Error ? err.message : "خطا در جابجایی ترتیب سؤالات");
    }
  };

  if (isLoading) {
    return (
      <div className="py-20" dir="rtl">
        <LoadingState message="در حال بارگذاری ویرایشگر نظرسنجی..." />
      </div>
    );
  }

  if (isError || !poll) {
    return (
      <div className="space-y-4 py-8" dir="rtl">
        <Alert variant="error" title="خطا در باز کردن نظرسنجی">
          {error instanceof Error ? error.message : "نظرسنجی مورد نظر یافت نشد."}
        </Alert>
        <Link to="/studio/polls">
          <Button variant="outline" size="sm">
            بازگشت به فهرست نظرسنجی‌ها
          </Button>
        </Link>
      </div>
    );
  }

  const isPublished = poll.status === "published";
  const isDraft = poll.status === "draft";
  const isClosed = poll.status === "closed";

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Bar Navigation & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <Link
            to="/studio/polls"
            className="p-2 rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors border border-[var(--color-border)]"
            title="بازگشت به فهرست"
          >
            <ArrowRight className="w-4 h-4" />
          </Link>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-bold text-[var(--color-text)] line-clamp-1">
                {poll.title}
              </h1>

              {isPublished && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#e4f4ec] text-[#2a624b] border border-[#9ed4bb]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#3d8f6e]" />
                  منتشر شده
                </span>
              )}
              {isDraft && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#fdf2e4] text-[#8f5e27] border border-[#e8c18a]">
                  پیش‌نویس
                </span>
              )}
              {isClosed && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300">
                  بسته شده
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)] mt-1 font-mono" dir="ltr">
              <span>/polls/{poll.slug}</span>
              {isDirty && (
                <span className="text-amber-600 dark:text-amber-400 font-sans font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  تغییرات ذخیره‌نشده
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsPreviewOpen(true)}
            leftIcon={<Eye className="w-4 h-4" />}
            className="cursor-pointer"
          >
            پیش‌نمایش
          </Button>

          <button
            type="button"
            onClick={handleCopyLink}
            className="flex items-center gap-1.5 py-2 px-3 rounded-xl text-xs font-medium bg-[var(--color-surface)] border border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] text-[var(--color-text)] transition-colors cursor-pointer"
            title="کپی لینک عمومی"
          >
            {copiedLink ? <Check className="w-3.5 h-3.5 text-[#3d8f6e]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copiedLink ? "کپی شد" : "کپی لینک"}</span>
          </button>

          {canPublishAndClose && (
            <>
              {isDraft && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handlePublish}
                  disabled={publishMutation.isPending}
                  className="bg-[#008080] hover:bg-[#006666] text-white cursor-pointer"
                >
                  {publishMutation.isPending ? "در حال انتشار..." : "انتشار نظرسنجی"}
                </Button>
              )}
              {isPublished && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleClose}
                  disabled={closeMutation.isPending}
                  className="text-amber-700 border-amber-300 hover:bg-amber-50 cursor-pointer"
                >
                  {closeMutation.isPending ? "در حال بستن..." : "بستن نظرسنجی"}
                </Button>
              )}
              {isClosed && (
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handlePublish}
                  disabled={publishMutation.isPending}
                  className="bg-[#008080] hover:bg-[#006666] text-white cursor-pointer"
                >
                  {publishMutation.isPending ? "در حال انتشار..." : "انتشار مجدد"}
                </Button>
              )}
            </>
          )}

          {isPublished && (
            <a
              href={`/polls/${poll.slug}`}
              target="_blank"
              rel="noreferrer"
              className="p-2 rounded-xl text-[var(--color-primary-default)] hover:bg-[var(--color-primary-light)]/20 transition-colors"
              title="مشاهده صفحه عمومی"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>

      {pageError && (
        <Alert variant="error" onClose={() => setPageError(null)}>
          {pageError}
        </Alert>
      )}

      {saveSuccess && (
        <Alert variant="success" onClose={() => setSaveSuccess(false)}>
          تغییرات مشخصات نظرسنجی با موفقیت ذخیره شد.
        </Alert>
      )}

      {/* RBAC Warning for Content Worker on Published Poll */}
      {isContentWorkerBlocked && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-3 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>
            این نظرسنجی در وضعیت <strong>منتشر شده</strong> قرار دارد. طبق مجوزهای امنیتی سیستم، تغییر سؤالات نظرسنجی منتشرشده تنها توسط مدیر سازمان یا مدیر کل امکان‌پذیر است.
          </span>
        </div>
      )}

      {/* Section Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--color-border)]">
        <button
          type="button"
          onClick={() => setActiveTab("questions")}
          className={`flex items-center gap-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === "questions"
              ? "border-[#008080] text-[#008080]"
              : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          <HelpCircle className="w-4 h-4" />
          <span>سؤالات و گزینه‌ها</span>
          <span className="px-1.5 py-0.2 rounded-md text-[10px] bg-[var(--color-surface-warm)] text-[var(--color-text-secondary)]">
            {toPersianDigits(sortedQuestions.length)}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 py-2.5 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === "settings"
              ? "border-[#008080] text-[#008080]"
              : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>مشخصات و تنظیمات</span>
          {isDirty && <span className="w-2 h-2 rounded-full bg-amber-500" />}
        </button>
      </div>

      {/* Tab 1: Questions Builder */}
      {activeTab === "questions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[var(--color-text)]">
                فهرست سؤالات نظرسنجی
              </h2>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                سؤالات، گزینه‌ها و ترتیب نمایش آن‌ها را برای شرکت‌کنندگان تنظیم کنید.
              </p>
            </div>

            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleOpenAddQuestion}
              disabled={isContentWorkerBlocked}
              leftIcon={<Plus className="w-4 h-4" />}
              className="cursor-pointer"
            >
              افزودن سؤال جدید
            </Button>
          </div>

          {sortedQuestions.length === 0 ? (
            <div className="p-12 rounded-2xl bg-[var(--color-surface)] border border-dashed border-[var(--color-border)] text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface-warm)] text-[var(--color-text-muted)] flex items-center justify-center mx-auto">
                <HelpCircle className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-[var(--color-text)]">
                هنوز سؤالی به این نظرسنجی اضافه نشده است
              </h3>
              <p className="text-xs text-[var(--color-text-muted)] max-w-sm mx-auto">
                برای شروع طراحی فرم، روی دکمه افزودن سؤال کلیک کنید تا انواع سؤالات تک‌گزینه‌ای، چندگزینه‌ای یا متنی را بسازید.
              </p>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleOpenAddQuestion}
                disabled={isContentWorkerBlocked}
                leftIcon={<Plus className="w-4 h-4" />}
              >
                افزودن اولین سؤال
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedQuestions.map((question, idx) => {
                const isSingle = question.questionType === "single_choice";
                const isMultiple = question.questionType === "multiple_choice";
                const isShortText = question.questionType === "short_text";

                return (
                  <div
                    key={question.id}
                    className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-2xs hover:shadow-xs transition-shadow flex flex-col sm:flex-row sm:items-start justify-between gap-4"
                  >
                    {/* Question Content */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {/* Sort Badge & Reorder */}
                      <div className="flex flex-col items-center gap-1 shrink-0 pt-0.5">
                        <span className="w-6 h-6 rounded-lg bg-[var(--color-primary-light)] text-[var(--color-primary-dark)] text-xs font-bold flex items-center justify-center">
                          {toPersianDigits(idx + 1)}
                        </span>
                        {!isContentWorkerBlocked && (
                          <div className="flex flex-col gap-0.5">
                            <button
                              type="button"
                              disabled={idx === 0 || reorderQuestionsMutation.isPending}
                              onClick={() => handleMoveQuestion(idx, "up")}
                              className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-20 cursor-pointer"
                              title="جابجایی به بالا"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={idx === sortedQuestions.length - 1 || reorderQuestionsMutation.isPending}
                              onClick={() => handleMoveQuestion(idx, "down")}
                              className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] disabled:opacity-20 cursor-pointer"
                              title="جابجایی به پایین"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-bold text-[var(--color-text)]">
                            {question.questionText}
                          </h4>
                          {question.isRequired && (
                            <span className="text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-950/40 px-2 py-0.2 rounded-md border border-red-200">
                              اجباری
                            </span>
                          )}
                          <span className="text-[10px] font-medium text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-2 py-0.2 rounded-md border border-[var(--color-border)]">
                            {isSingle ? "تک‌گزینه‌ای" : isMultiple ? "چندگزینه‌ای" : "متن کوتاه"}
                          </span>
                        </div>

                        {question.description && (
                          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                            {question.description}
                          </p>
                        )}

                        {/* Options preview */}
                        {!isShortText && question.options && question.options.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1">
                            {question.options.map((opt, oIdx) => (
                              <span
                                key={opt.id || oIdx}
                                className="text-[11px] px-2.5 py-1 rounded-lg bg-[var(--color-background)] border border-[var(--color-border)] text-[var(--color-text-secondary)]"
                              >
                                {opt.optionText}
                              </span>
                            ))}
                          </div>
                        )}

                        {isMultiple && (question.minChoices || question.maxChoices) && (
                          <div className="text-[11px] text-[var(--color-text-muted)]">
                            {question.minChoices && <span>حداقل انتخاب: {toPersianDigits(question.minChoices)} </span>}
                            {question.maxChoices && <span>(حداکثر انتخاب: {toPersianDigits(question.maxChoices)})</span>}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Question Actions */}
                    {!isContentWorkerBlocked && (
                      <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start pt-2 sm:pt-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditQuestion(question)}
                          className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-warm)] transition-colors cursor-pointer"
                          title="ویرایش سؤال"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuestionToDelete(question)}
                          className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                          title="حذف سؤال"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Settings & Metadata */}
      {activeTab === "settings" && (
        <form onSubmit={handleSaveSettings} className="space-y-6">
          <div className="bg-[var(--color-surface)] p-5 sm:p-6 rounded-2xl border border-[var(--color-border)] space-y-4 shadow-xs">
            <h3 className="text-sm font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-3">
              مشخصات عمومی نظرسنجی
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                  عنوان نظرسنجی <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="عنوان نظرسنجی"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                  اسلاگ یکتا (Slug)
                </label>
                <Input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="poll-slug"
                  dir="ltr"
                  className="font-mono text-left"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                توضیحات و راهنمای شرکت‌کنندگان
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="توضیحات هدف نظرسنجی..."
                className="w-full p-3 text-xs rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[#008080] leading-relaxed"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                آدرس تصویر کاور (اختیاری)
              </label>
              <Input
                type="url"
                value={coverImageUrl}
                onChange={(e) => setCoverImageUrl(e.target.value)}
                placeholder="https://example.com/cover.jpg"
                dir="ltr"
                className="font-mono text-left"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                  تاریخ و ساعت شروع (اختیاری)
                </label>
                <Input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  dir="ltr"
                  className="text-left font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                  تاریخ و ساعت پایان (اختیاری)
                </label>
                <Input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                  dir="ltr"
                  className="text-left font-mono"
                />
              </div>
            </div>
          </div>

          {/* Behavior Settings */}
          <div className="bg-[var(--color-surface)] p-5 sm:p-6 rounded-2xl border border-[var(--color-border)] space-y-4 shadow-xs">
            <h3 className="text-sm font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-3">
              تنظیمات پاسخگویی و نتایج
            </h3>

            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={allowAnonymous}
                  onChange={(e) => setAllowAnonymous(e.target.checked)}
                  className="rounded accent-[#008080] w-4 h-4"
                />
                <div>
                  <span className="block text-xs font-bold text-[var(--color-text)]">
                    ثبت رأی ناشناس و عمومی (Anonymous Participant)
                  </span>
                  <span className="text-[11px] text-[var(--color-text-muted)]">
                    به هر کاربر یک کوکی ایمن و ناشناس تخصیص می‌یابد تا بدون ثبت‌نام رأی خود را ثبت کند.
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={showResultsAfterVote}
                  onChange={(e) => setShowResultsAfterVote(e.target.checked)}
                  className="rounded accent-[#008080] w-4 h-4"
                />
                <div>
                  <span className="block text-xs font-bold text-[var(--color-text)]">
                    نمایش زنده درصد نتایج پس از ثبت رأی به کاربر
                  </span>
                  <span className="text-[11px] text-[var(--color-text-muted)]">
                    کاربر پس از ثبت پاسخ، می‌تواند توزیع درصدی آرای سایر شرکت‌کنندگان را مشاهده کند.
                  </span>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-surface-warm)] cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={requireAllQuestions}
                  onChange={(e) => setRequireAllQuestions(e.target.checked)}
                  className="rounded accent-[#008080] w-4 h-4"
                />
                <div>
                  <span className="block text-xs font-bold text-[var(--color-text)]">
                    الزام پاسخ به تمام سؤالات به‌صورت پیش‌فرض
                  </span>
                  <span className="text-[11px] text-[var(--color-text-muted)]">
                    کاربر تا زمانی که به همه پرسش‌ها پاسخ ندهد، نمی‌تواند فرم را نهایی کند.
                  </span>
                </div>
              </label>
            </div>
          </div>

          {/* CTA Banner Settings */}
          <div className="bg-[var(--color-surface)] p-5 sm:p-6 rounded-2xl border border-[var(--color-border)] space-y-4 shadow-xs">
            <h3 className="text-sm font-bold text-[var(--color-text)] border-b border-[var(--color-border)] pb-3">
              بنر اقدام پایانی (CTA Banner)
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              پس از تکمیل نظرسنجی، می‌توانید شرکت‌کنندگان را به کانال تلگرام، دوره آموزشی یا صفحه اختصاصی دیگری هدایت کنید.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                  عنوان بنر پیام (اختیاری)
                </label>
                <Input
                  type="text"
                  value={ctaTitle}
                  onChange={(e) => setCtaTitle(e.target.value)}
                  placeholder="مثال: برای مشاهده دوره‌های بیشتر به آوانا بپیوندید"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                  متن دکمه اقدام
                </label>
                <Input
                  type="text"
                  value={ctaButtonText}
                  onChange={(e) => setCtaButtonText(e.target.value)}
                  placeholder="مثال: مشاهده دوره‌ها"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
                  آدرس اینترنتی دکمه (URL)
                </label>
                <Input
                  type="url"
                  value={ctaUrl}
                  onChange={(e) => setCtaUrl(e.target.value)}
                  placeholder="https://t.me/avana_ir یا /courses"
                  dir="ltr"
                  className="font-mono text-left"
                />
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={updatePollMutation.isPending || !isDirty}
              leftIcon={<Save className="w-4 h-4" />}
              className="cursor-pointer"
            >
              {updatePollMutation.isPending ? "در حال ذخیره‌سازی..." : "ذخیره تغییرات مشخصات"}
            </Button>
          </div>
        </form>
      )}

      {/* Question Editor Modal */}
      <PollQuestionEditor
        isOpen={isQuestionEditorOpen}
        onClose={() => {
          setIsQuestionEditorOpen(false);
          setQuestionToEdit(null);
        }}
        questionToEdit={questionToEdit}
        onSave={handleSaveQuestion}
        isSubmitting={createQuestionMutation.isPending || updateQuestionMutation.isPending}
      />

      {/* Question Delete Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(questionToDelete)}
        onClose={() => setQuestionToDelete(null)}
        title="حذف سؤال"
        maxWidth="md"
      >
        <div className="space-y-4" dir="rtl">
          <p className="text-xs text-[var(--color-text)] leading-relaxed">
            آیا از حذف سؤال <strong>«{questionToDelete?.questionText}»</strong> و گزینه‌های آن مطمئن هستید؟
          </p>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setQuestionToDelete(null)}
            >
              انصراف
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleDeleteQuestionConfirm}
              disabled={deleteQuestionMutation.isPending}
            >
              {deleteQuestionMutation.isPending ? "در حال حذف..." : "حذف سؤال"}
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Live Preview Modal */}
      <PollPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        poll={{
          title,
          description,
          coverImageUrl,
          questions: sortedQuestions,
          settings: {
            allowAnonymous,
            showResultsAfterVote,
            requireAllQuestions,
            ctaTitle,
            ctaUrl,
            ctaButtonText,
          },
        }}
      />
    </div>
  );
}
