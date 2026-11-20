import React, { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Edit3,
  BarChart2,
  Globe,
  Lock,
  Calendar,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { useAuth } from "../../providers/AuthProvider.js";
import {
  useStudioPolls,
  useCreatePollMutation,
  useDeletePollMutation,
  usePublishPollMutation,
  useClosePollMutation,
} from "../../hooks/useStudioPolls.js";
import type { Poll, PollStatus } from "../../lib/api/polls-api.js";
import {
  Button,
  Dialog,
  DialogHeader,
  DialogContent,
  DialogFooter,
  Badge,
  Input,
  LoadingState,
  EmptyState,
  Alert,
} from "../../components/ui/index.js";
import { toPersianDigits } from "@avana/domain";

export function StudioPollsPage() {
  const { user, memberships } = useAuth();
  const navigate = useNavigate();

  // RBAC resolution matching backend rules
  const isPlatformAdmin = user?.role === "platform_admin";
  const isOrgAdmin =
    user?.role === "organization_admin" ||
    memberships?.some((m) => m.role === "organization_admin");
  const isContentWorker =
    user?.role === "content_worker" ||
    (!isPlatformAdmin && !isOrgAdmin && memberships?.some((m) => m.role === "content_worker"));

  const canPublishAndClose = isPlatformAdmin || isOrgAdmin;
  const canDelete = isPlatformAdmin || isOrgAdmin;

  // Filter & Search states
  const [activeTab, setActiveTab] = useState<"all" | PollStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Create Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newCoverUrl, setNewCoverUrl] = useState("");
  const [allowAnonymous, setAllowAnonymous] = useState(true);
  const [showResultsAfterVote, setShowResultsAfterVote] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Delete Modal state
  const [pollToDelete, setPollToDelete] = useState<Poll | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Action error state
  const [actionError, setActionError] = useState<string | null>(null);

  // Fetch polls
  const { data: polls = [], isLoading, isError, error, refetch } = useStudioPolls();

  // Mutations
  const createMutation = useCreatePollMutation();
  const deleteMutation = useDeletePollMutation();
  const publishMutation = usePublishPollMutation();
  const closeMutation = useClosePollMutation();

  // Tab counts
  const tabCounts = useMemo(() => {
    return {
      all: polls.length,
      published: polls.filter((p) => p.status === "published").length,
      draft: polls.filter((p) => p.status === "draft").length,
      closed: polls.filter((p) => p.status === "closed").length,
    };
  }, [polls]);

  // Filtered Polls
  const filteredPolls = useMemo(() => {
    return polls.filter((poll) => {
      const matchStatus = activeTab === "all" || poll.status === activeTab;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        q === "" ||
        poll.title.toLowerCase().includes(q) ||
        (poll.slug && poll.slug.toLowerCase().includes(q)) ||
        (poll.description && poll.description.toLowerCase().includes(q));
      return matchStatus && matchSearch;
    });
  }, [polls, activeTab, searchQuery]);

  // Handlers
  const handleCopyLink = (slug: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/polls/${slug}`;
    void navigator.clipboard.writeText(url);
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 2500);
  };

  const handleOpenCreateModal = () => {
    setNewTitle("");
    setNewSlug("");
    setNewDescription("");
    setNewCoverUrl("");
    setAllowAnonymous(true);
    setShowResultsAfterVote(false);
    setCreateError(null);
    setIsCreateModalOpen(true);
  };

  const handleTitleChange = (val: string) => {
    setNewTitle(val);
    if (!newSlug || newSlug === generateSlugFromTitle(newTitle)) {
      setNewSlug(generateSlugFromTitle(val));
    }
  };

  const generateSlugFromTitle = (text: string) => {
    return text
      .trim()
      .toLowerCase()
      .replace(/[\s\-_]+/g, "-")
      .replace(/[^\u0600-\u06FFa-z0-9\-]/g, "")
      .slice(0, 50);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      setCreateError("عنوان نظرسنجی الزامی است.");
      return;
    }

    try {
      setCreateError(null);
      const res = await createMutation.mutateAsync({
        title: newTitle.trim(),
        slug: newSlug.trim() || undefined,
        description: newDescription.trim() || undefined,
        coverImageUrl: newCoverUrl.trim() || undefined,
        settings: {
          allowAnonymous,
          showResultsAfterVote,
          requireAllQuestions: false,
        },
      });

      setIsCreateModalOpen(false);
      if (res.poll?.id) {
        navigate(`/studio/polls/${res.poll.id}/edit`);
      }
    } catch (err: unknown) {
      setCreateError(err instanceof Error ? err.message : "خطا در ایجاد نظرسنجی");
    }
  };

  const handlePublish = async (poll: Poll) => {
    try {
      setActionError(null);
      await publishMutation.mutateAsync(poll.id);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "خطا در انتشار نظرسنجی");
    }
  };

  const handleClose = async (poll: Poll) => {
    try {
      setActionError(null);
      await closeMutation.mutateAsync(poll.id);
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "خطا در بستن نظرسنجی");
    }
  };

  const handleDeleteConfirm = async () => {
    if (!pollToDelete) return;
    try {
      setDeleteError(null);
      await deleteMutation.mutateAsync(pollToDelete.id);
      setPollToDelete(null);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "خطا در حذف نظرسنجی");
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-[var(--color-text)]">
              نظرسنجی‌ها و فرم‌ها
            </h1>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary-dark)] border border-[#b3d9d9]">
              Polls & Surveys
            </span>
          </div>
          <p className="text-xs sm:text-sm text-[var(--color-text-muted)] mt-1">
            طراحی، انتشار، اشتراک‌گذاری و تحلیل نتایج نظرسنجی‌ها و پرسشنامه‌های بازاریابی و آموزشی آوانا
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={handleOpenCreateModal}
          leftIcon={<Plus className="w-4 h-4" />}
          className="self-start sm:self-auto cursor-pointer"
        >
          نظرسنجی جدید
        </Button>
      </div>

      {actionError && (
        <Alert variant="error" onClose={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {/* Role Alert for Content Worker */}
      {isContentWorker && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center gap-3 text-xs text-amber-900 dark:text-amber-200">
          <HelpCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>
            نقش شما <strong>تولید محتوا (Content Worker)</strong> است. شما می‌توانید نظرسنجی جدید ایجاد کرده و پیش‌نویس‌ها را ویرایش کنید. انتشار و بستن نهایی نظرسنجی بر عهده مدیر سازمان یا مدیر کل است.
          </span>
        </div>
      )}

      {/* Filter Tabs and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-[var(--color-surface)] p-3 rounded-2xl border border-[var(--color-border)] shadow-xs">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === "all"
                ? "bg-[var(--color-primary-default)] text-white shadow-xs font-bold"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-text)]"
            }`}
          >
            <span>همه</span>
            <span
              className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                activeTab === "all" ? "bg-white/20 text-white" : "bg-[var(--color-surface-warm)] text-[var(--color-text-secondary)]"
              }`}
            >
              {toPersianDigits(tabCounts.all)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("published")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === "published"
                ? "bg-[#3d8f6e] text-white shadow-xs font-bold"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-text)]"
            }`}
          >
            <span>منتشر شده</span>
            <span
              className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                activeTab === "published" ? "bg-white/20 text-white" : "bg-[var(--color-surface-warm)] text-[var(--color-text-secondary)]"
              }`}
            >
              {toPersianDigits(tabCounts.published)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("draft")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === "draft"
                ? "bg-[#c2853f] text-white shadow-xs font-bold"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-text)]"
            }`}
          >
            <span>پیش‌نویس</span>
            <span
              className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                activeTab === "draft" ? "bg-white/20 text-white" : "bg-[var(--color-surface-warm)] text-[var(--color-text-secondary)]"
              }`}
            >
              {toPersianDigits(tabCounts.draft)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("closed")}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 ${
              activeTab === "closed"
                ? "bg-slate-700 text-white shadow-xs font-bold"
                : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-warm)] hover:text-[var(--color-text)]"
            }`}
          >
            <span>بسته شده</span>
            <span
              className={`px-1.5 py-0.2 rounded-md text-[10px] ${
                activeTab === "closed" ? "bg-white/20 text-white" : "bg-[var(--color-surface-warm)] text-[var(--color-text-secondary)]"
              }`}
            >
              {toPersianDigits(tabCounts.closed)}
            </span>
          </button>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجو در نظرسنجی‌ها..."
            className="w-full pl-3 pr-9 py-1.5 text-xs rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)] transition-colors"
          />
        </div>
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div className="py-16">
          <LoadingState message="در حال دریافت فهرست نظرسنجی‌ها..." />
        </div>
      ) : isError ? (
        <Alert
          variant="error"
          title="خطا در دریافت نظرسنجی‌ها"
          onClose={() => void refetch()}
        >
          {error instanceof Error ? error.message : "امکان واکشی اطلاعات وجود ندارد."}
        </Alert>
      ) : filteredPolls.length === 0 ? (
        <EmptyState
          title={searchQuery ? "موردی با این عبارت یافت نشد" : "هیچ نظرسنجی‌ای یافت نشد"}
          description={
            searchQuery
              ? "عبارت دیگری را جستجو کنید یا فیلتر وضعیت را تغییر دهید."
              : "با کلیک روی دکمه زیر می‌توانید اولین نظرسنجی خود را تعریف و منتشر کنید."
          }
          action={
            !searchQuery ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenCreateModal}
                leftIcon={<Plus className="w-4 h-4" />}
                className="cursor-pointer"
              >
                ایجاد اولین نظرسنجی
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPolls.map((poll) => {
            const isPublished = poll.status === "published";
            const isDraft = poll.status === "draft";
            const isClosed = poll.status === "closed";

            return (
              <div
                key={poll.id}
                className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl p-5 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between group"
              >
                <div>
                  {/* Status & Slug Row */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className="text-[11px] font-mono text-[var(--color-text-muted)] bg-[var(--color-surface-warm)] px-2 py-0.5 rounded-md border border-[var(--color-border)] truncate max-w-[150px]">
                      /{poll.slug}
                    </span>

                    {isPublished && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#e4f4ec] text-[#2a624b] border border-[#9ed4bb]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#3d8f6e] animate-pulse" />
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

                  {/* Title & Description */}
                  <h3 className="font-bold text-base text-[var(--color-text)] mb-1.5 line-clamp-1 group-hover:text-[var(--color-primary-default)] transition-colors">
                    {poll.title}
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 leading-relaxed min-h-[36px] mb-4">
                    {poll.description || "بدون توضیحات اولیه"}
                  </p>

                  {/* Metrics Badge Row */}
                  <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-[var(--color-background)] border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] mb-4">
                    <div className="flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                      <span>{toPersianDigits(poll.questionsCount ?? poll.questions?.length ?? 0)} سؤال</span>
                    </div>
                    <div className="w-px h-3 bg-[var(--color-border)]" />
                    <div className="flex items-center gap-1.5">
                      <BarChart2 className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
                      <span>{toPersianDigits(poll.responsesCount ?? 0)} پاسخ</span>
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-3 border-t border-[var(--color-border)] flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Link
                      to={`/studio/polls/${poll.id}/edit`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl text-xs font-bold bg-[var(--color-primary-default)] text-white hover:bg-[var(--color-primary-dark)] transition-colors shadow-xs"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>ویرایش و سؤالات</span>
                    </Link>

                    <Link
                      to={`/studio/polls/${poll.id}/results`}
                      className="flex items-center justify-center p-2 rounded-xl text-xs font-medium bg-[var(--color-surface-warm)] text-[var(--color-text)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] transition-colors"
                      title="مشاهده نتایج و آمار"
                    >
                      <BarChart2 className="w-4 h-4 text-[var(--color-primary-default)]" />
                    </Link>

                    <button
                      type="button"
                      onClick={() => handleCopyLink(poll.slug)}
                      className="flex items-center justify-center p-2 rounded-xl text-xs font-medium bg-[var(--color-surface-warm)] text-[var(--color-text)] hover:bg-[var(--color-surface)] border border-[var(--color-border)] transition-colors cursor-pointer"
                      title="کپی لینک عمومی"
                    >
                      {copiedSlug === poll.slug ? (
                        <Check className="w-4 h-4 text-[#3d8f6e]" />
                      ) : (
                        <Copy className="w-4 h-4 text-[var(--color-text-muted)]" />
                      )}
                    </button>

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setPollToDelete(poll)}
                        className="flex items-center justify-center p-2 rounded-xl text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 border border-transparent hover:border-red-200 transition-colors cursor-pointer"
                        title="حذف نظرسنجی"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Publish / Close Controls */}
                  {canPublishAndClose && (
                    <div className="flex items-center justify-between text-[11px] pt-1">
                      {isDraft && (
                        <button
                          type="button"
                          onClick={() => handlePublish(poll)}
                          disabled={publishMutation.isPending}
                          className="text-[#2a624b] hover:text-[#1e4435] font-bold hover:underline cursor-pointer disabled:opacity-50"
                        >
                          {publishMutation.isPending ? "در حال انتشار..." : "انتشار نظرسنجی"}
                        </button>
                      )}
                      {isPublished && (
                        <button
                          type="button"
                          onClick={() => handleClose(poll)}
                          disabled={closeMutation.isPending}
                          className="text-amber-800 dark:text-amber-300 hover:underline font-semibold cursor-pointer disabled:opacity-50"
                        >
                          {closeMutation.isPending ? "در حال بستن..." : "بستن نظرسنجی"}
                        </button>
                      )}
                      {isClosed && (
                        <button
                          type="button"
                          onClick={() => handlePublish(poll)}
                          disabled={publishMutation.isPending}
                          className="text-[var(--color-primary-default)] hover:underline font-semibold cursor-pointer disabled:opacity-50"
                        >
                          {publishMutation.isPending ? "در حال انتشار..." : "انتشار مجدد"}
                        </button>
                      )}

                      <a
                        href={`/polls/${poll.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] flex items-center gap-1 font-medium"
                      >
                        <span>مشاهده عمومی</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Poll Dialog */}
      <Dialog
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="ایجاد نظرسنجی جدید"
        description="مشخصات اولیه نظرسنجی را وارد کنید. پس از ایجاد، می‌توانید سؤالات و گزینه‌ها را طراحی نمایید."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {createError && (
            <Alert variant="error" onClose={() => setCreateError(null)}>
              {createError}
            </Alert>
          )}

          <div>
            <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
              عنوان نظرسنجی <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              value={newTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="مثال: نظرسنجی کیفیت دوره‌های آموزشی فارماکولوژی"
              required
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
              اسلاگ آدرس (Slug)
            </label>
            <div className="relative">
              <Input
                type="text"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="pharmacology-course-survey"
                dir="ltr"
                className="text-left font-mono"
              />
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
              آدرس دسترسی عمومی: <span className="font-mono" dir="ltr">/polls/{newSlug || "your-slug"}</span>
            </p>
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
              توضیحات و راهنمای شرکت‌کنندگان
            </label>
            <textarea
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="توضیح کوتاه درباره هدف نظرسنجی..."
              rows={3}
              className="w-full p-3 text-xs rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-primary-default)] transition-colors leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[var(--color-text)] mb-1.5">
              آدرس تصویر کاور (اختیاری)
            </label>
            <Input
              type="url"
              value={newCoverUrl}
              onChange={(e) => setNewCoverUrl(e.target.value)}
              placeholder="https://example.com/cover.jpg"
              dir="ltr"
              className="text-left font-mono"
            />
          </div>

          <div className="pt-2 border-t border-[var(--color-border)] space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowAnonymous}
                onChange={(e) => setAllowAnonymous(e.target.checked)}
                className="rounded accent-[#008080]"
              />
              <span className="text-xs text-[var(--color-text)] font-medium">
                امکان شرکت بدون ثبت‌نام (ناشناس با کوکی امن)
              </span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showResultsAfterVote}
                onChange={(e) => setShowResultsAfterVote(e.target.checked)}
                className="rounded accent-[#008080]"
              />
              <span className="text-xs text-[var(--color-text)] font-medium">
                نمایش نتایج و درصد پاسخ‌ها به کاربر پس از ارسال رأی
              </span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-[var(--color-border)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsCreateModalOpen(false)}
            >
              انصراف
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "در حال ایجاد..." : "ایجاد و ورود به ویرایشگر"}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        isOpen={Boolean(pollToDelete)}
        onClose={() => setPollToDelete(null)}
        title="حذف نظرسنجی"
        maxWidth="md"
      >
        <div className="space-y-4">
          {deleteError && (
            <Alert variant="error" onClose={() => setDeleteError(null)}>
              {deleteError}
            </Alert>
          )}

          <p className="text-xs text-[var(--color-text)] leading-relaxed">
            آیا از حذف نظرسنجی <strong>«{pollToDelete?.title}»</strong> اطمینان دارید؟
            این عملیات سؤالات و پاسخ‌های این نظرسنجی را از دسترس خارج می‌کند.
          </p>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--color-border)]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPollToDelete(null)}
            >
              انصراف
            </Button>
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "در حال حذف..." : "حذف نظرسنجی"}
            </Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
